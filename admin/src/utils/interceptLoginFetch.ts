import React from 'react';
import { createRoot } from 'react-dom/client';
import { CodeVerificationModal } from '../components/CodeVerificationModal';

// Extend window to store original fetch
declare global {
  interface Window {
    __originalFetch: typeof fetch;
  }
}

interface ShowModalOptions {
  tempToken: string;
  email: string;
  onResendCode: () => Promise<void>;
}

/**
 * Shows the 2FA verification modal and returns the final login response.
 */
function showVerificationModal({
  tempToken,
  email,
  onResendCode,
}: ShowModalOptions): Promise<Response> {
  return new Promise((resolve) => {
    const container = document.createElement('div');
    container.id = 'admin-2fa-modal';
    document.body.appendChild(container);

    const root = createRoot(container);

    const cleanup = () => {
      root.unmount();
      container.remove();
    };

    const handleSuccess = (response: Response) => {
      cleanup();
      resolve(response);
    };

    const handleCancel = () => {
      cleanup();
      // Return a fake "unauthorized" response so Strapi shows login error
      const body = JSON.stringify({
        data: null,
        error: {
          status: 401,
          name: 'UnauthorizedError',
          message: 'Verification cancelled',
        },
      });
      resolve(
        new Response(body, {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    };

    root.render(
      React.createElement(CodeVerificationModal, {
        tempToken,
        email,
        onSuccess: handleSuccess,
        onCancel: handleCancel,
        onResendCode,
      })
    );
  });
}

/**
 * Checks if 2FA is enabled via the status endpoint.
 */
async function is2faEnabled(): Promise<boolean> {
  try {
    const res = await window.__originalFetch(
      '/admin-2fa/auth/status'
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data.enabled === true;
  } catch {
    return false;
  }
}

/**
 * Intercepts the standard Strapi admin login fetch call.
 *
 * When the user clicks "Login", Strapi's admin sends POST /admin/login.
 * This interceptor:
 * 1. Detects calls to /admin/login (POST)
 * 2. If 2FA is enabled, sends credentials to /admin-2fa/auth/request-code instead
 * 3. If the response requires verification, shows the code modal
 * 4. Returns the final token response as if it came from the original /admin/login
 */
export function interceptLoginFetch(): void {
  const originalFetch = window.fetch.bind(window);
  window.__originalFetch = originalFetch;

  window.fetch = async function interceptedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    // Determine the URL
    const url =
      input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.href
          : String(input);

    const isLoginRequest =
      url.includes('/admin/login') &&
      !url.includes('/admin/login-info') &&
      !url.includes('/admin-2fa/') &&
      init?.method?.toUpperCase() === 'POST';

    if (!isLoginRequest) {
      return originalFetch(input, init);
    }

    // Check if 2FA is enabled
    const enabled = await is2faEnabled();
    if (!enabled) {
      return originalFetch(input, init);
    }

    // Extract credentials from the original request body
    let body: { email?: string; password?: string } = {};
    try {
      if (init?.body) {
        body = JSON.parse(
          typeof init.body === 'string'
            ? init.body
            : new TextDecoder().decode(init.body as ArrayBuffer)
        );
      }
    } catch {
      // If we can't parse the body, fall through to original fetch
      return originalFetch(input, init);
    }

    // Request 2FA code
    const codeRes = await originalFetch(
      '/admin-2fa/auth/request-code',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: body.email,
          password: body.password,
        }),
      }
    );

    if (!codeRes.ok) {
      // Credentials invalid — return the error as if from /admin/login
      const errBody = await codeRes.text();
      return new Response(errBody, {
        status: codeRes.status,
        statusText: codeRes.statusText,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const codeData = await codeRes.json();

    if (!codeData.requiresVerification) {
      // 2FA not required for this user — pass through to original login
      return originalFetch(input, init);
    }

    // Build resend callback using the stored credentials
    const onResendCode = async () => {
      const res = await originalFetch(
        '/admin-2fa/auth/resend-code',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tempToken: codeData.tempToken }),
        }
      );

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to resend code');
      }
    };

    // Show the verification modal and wait for result
    return showVerificationModal({
      tempToken: codeData.tempToken,
      email: body.email || '',
      onResendCode,
    });
  };
}
