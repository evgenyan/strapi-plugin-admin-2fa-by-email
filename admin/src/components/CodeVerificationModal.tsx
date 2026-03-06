import React, { useState, useRef, useEffect, useCallback } from 'react';

import en from '../translations/en.json';
import ru from '../translations/ru.json';

export type VerificationModalProps = {
  tempToken: string;
  email: string;
  onSuccess: (response: Response) => void;
  onCancel: () => void;
  onResendCode: () => Promise<void>;
};

const CODE_LENGTH = 6;
const CODE_TTL_SECONDS = 5 * 60; // 5 minutes

const translations: Record<string, Record<string, string>> = { en, ru };

/**
 * Detects current locale from Strapi admin (localStorage or html lang).
 */
function detectLocale(): string {
  try {
    const stored = localStorage.getItem('strapi-admin-language');
    if (stored && translations[stored]) return stored;
  } catch {}
  const htmlLang = document.documentElement.lang?.slice(0, 2);
  if (htmlLang && translations[htmlLang]) return htmlLang;
  return 'en';
}

/**
 * Simple i18n: returns translated string with optional interpolation.
 */
function t(
  key: string,
  locale: string,
  params?: Record<string, string | number>
): string {
  const str =
    translations[locale]?.[key] ?? translations['en']?.[key] ?? key;
  if (!params) return str;
  return Object.entries(params).reduce(
    (acc, [k, v]) => acc.replace(`{${k}}`, String(v)),
    str
  );
}

/**
 * Detects if Strapi admin is using dark theme.
 */
function isDarkTheme(): boolean {
  try {
    const theme = localStorage.getItem('STRAPI_THEME');
    if (theme === 'dark') return true;
    if (theme === 'light') return false;
  } catch {}
  return document.documentElement.getAttribute('data-theme') === 'dark' ||
    document.body.classList.contains('dark') ||
    window.matchMedia?.('(prefers-color-scheme: dark)').matches ||
    false;
}

/**
 * Formats seconds into mm:ss string.
 */
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const lightTheme = {
  modalBg: '#fff',
  titleColor: '#32324d',
  subtitleColor: '#666687',
  timerColor: '#666687',
  inputBorder: '#dcdce4',
  inputColor: '#32324d',
  inputBg: '#fff',
  cancelColor: '#666687',
  cancelBorder: '#dcdce4',
  cancelBg: 'transparent',
};

const darkTheme = {
  modalBg: '#212134',
  titleColor: '#f6f6f9',
  subtitleColor: '#a5a5ba',
  timerColor: '#a5a5ba',
  inputBorder: '#4a4a6a',
  inputColor: '#f6f6f9',
  inputBg: '#181826',
  cancelColor: '#a5a5ba',
  cancelBorder: '#4a4a6a',
  cancelBg: 'transparent',
};

const injectedStyles = `
@keyframes admin2fa-spin {
  to { transform: rotate(360deg); }
}
@keyframes admin2fa-fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes admin2fa-scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
`;

export function CodeVerificationModal({
  tempToken,
  email,
  onSuccess,
  onCancel,
  onResendCode,
}: VerificationModalProps) {
  const [digits, setDigits] = useState<string[]>(
    Array(CODE_LENGTH).fill('')
  );
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [ttl, setTtl] = useState(CODE_TTL_SECONDS);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const locale = detectLocale();
  const dark = isDarkTheme();
  const theme = dark ? darkTheme : lightTheme;

  // Inject keyframes
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = injectedStyles;
    document.head.appendChild(styleEl);
    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  // Focus first input on mount
  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  // Code expiration timer
  useEffect(() => {
    if (ttl <= 0) return;
    const timer = setTimeout(() => setTtl((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [ttl]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(
      () => setResendCooldown((prev) => prev - 1),
      1000
    );
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const code = digits.join('');
  const isComplete = code.length === CODE_LENGTH;
  const isExpired = ttl <= 0;

  const handleVerify = useCallback(async () => {
    if (!isComplete || loading) return;

    if (isExpired) {
      setError(t('auth.codeExpired', locale));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await window.__originalFetch(
        '/admin-2fa-by-email/auth/verify-code',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, tempToken }),
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));

        if (res.status === 429) {
          setError(t('auth.tooManyAttempts', locale));
        } else if (
          body.error?.toLowerCase().includes('expired') ||
          body.code === 'expired'
        ) {
          setError(t('auth.codeExpired', locale));
          setTtl(0);
        } else {
          setError(t('auth.invalidCode', locale));
        }

        setDigits(Array(CODE_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
        setLoading(false);
        return;
      }

      onSuccess(res);
    } catch {
      setError(t('auth.networkError', locale));
      setLoading(false);
    }
  }, [code, isComplete, isExpired, loading, tempToken, onSuccess, locale]);

  const handleResend = useCallback(async () => {
    if (resendCooldown > 0) return;

    setError('');
    setDigits(Array(CODE_LENGTH).fill(''));
    inputRefs.current[0]?.focus();

    try {
      await onResendCode();
      setResendCooldown(60);
      setTtl(CODE_TTL_SECONDS);
    } catch {
      setError(t('auth.networkError', locale));
    }
  }, [resendCooldown, onResendCode, locale]);

  const handleDigitChange = useCallback(
    (index: number, value: string) => {
      const digit = value.replace(/\D/g, '').slice(-1);

      setDigits((prev) => {
        const next = [...prev];
        next[index] = digit;
        return next;
      });

      setError('');

      if (digit && index < CODE_LENGTH - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    []
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Backspace' && !digits[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
        setDigits((prev) => {
          const next = [...prev];
          next[index - 1] = '';
          return next;
        });
        e.preventDefault();
      } else if (e.key === 'Enter') {
        handleVerify();
      } else if (e.key === 'Escape') {
        onCancel();
      }
    },
    [digits, handleVerify, onCancel]
  );

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, CODE_LENGTH);

    if (!pasted) return;

    const newDigits = Array(CODE_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i++) {
      newDigits[i] = pasted[i];
    }
    setDigits(newDigits);
    setError('');

    const focusIndex = Math.min(pasted.length, CODE_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100000,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        animation: 'admin2fa-fadeIn 0.2s ease-out',
      }}
      onClick={onCancel}
    >
      <div
        style={{
          backgroundColor: theme.modalBg,
          borderRadius: '8px',
          padding: '32px',
          width: '400px',
          maxWidth: '90vw',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          animation: 'admin2fa-scaleIn 0.2s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: theme.titleColor,
            margin: '0 0 8px 0',
            textAlign: 'center',
          }}
        >
          {t('auth.enterCode', locale)}
        </h2>
        <p
          style={{
            fontSize: '14px',
            color: theme.subtitleColor,
            margin: '0 0 24px 0',
            textAlign: 'center',
          }}
        >
          {t('auth.codeSentTo', locale, { email })}
        </p>

        <div
          style={{
            fontSize: '13px',
            color: isExpired ? '#ee5e52' : theme.timerColor,
            textAlign: 'center',
            marginBottom: '16px',
          }}
        >
          {isExpired
            ? t('auth.codeExpired', locale)
            : `${locale === 'ru' ? 'Код истекает через' : 'Code expires in'} ${formatTime(ttl)}`}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '8px',
            justifyContent: 'center',
            marginBottom: '16px',
          }}
          onPaste={handlePaste}
        >
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="[0-9]"
              maxLength={1}
              value={digit}
              onChange={(e) => handleDigitChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onFocus={(e) => e.target.select()}
              style={{
                width: '44px',
                height: '52px',
                textAlign: 'center',
                fontSize: '24px',
                fontWeight: 600,
                border: `2px solid ${
                  document.activeElement === inputRefs.current[i]
                    ? '#4945ff'
                    : theme.inputBorder
                }`,
                borderRadius: '6px',
                outline: 'none',
                transition: 'border-color 0.2s',
                color: theme.inputColor,
                backgroundColor: theme.inputBg,
              }}
              disabled={loading}
              autoComplete="one-time-code"
            />
          ))}
        </div>

        <div
          style={{
            color: '#ee5e52',
            fontSize: '13px',
            textAlign: 'center',
            marginBottom: '16px',
            minHeight: '20px',
          }}
        >
          {error}
        </div>

        <div
          style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            marginTop: '8px',
          }}
        >
          <button
            type="button"
            style={{
              padding: '10px 24px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
              backgroundColor: theme.cancelBg,
              color: theme.cancelColor,
              border: `1px solid ${theme.cancelBorder}`,
              transition: 'background-color 0.2s',
            }}
            onClick={onCancel}
            disabled={loading}
          >
            {t('auth.cancel', locale)}
          </button>
          <button
            type="button"
            style={{
              padding: '10px 24px',
              borderRadius: '6px',
              fontSize: '14px',
              fontWeight: 600,
              cursor:
                !isComplete || loading || isExpired
                  ? 'not-allowed'
                  : 'pointer',
              backgroundColor:
                !isComplete || loading || isExpired
                  ? '#a5a3ff'
                  : '#4945ff',
              color: '#fff',
              border: 'none',
              transition: 'background-color 0.2s',
            }}
            onClick={handleVerify}
            disabled={!isComplete || loading || isExpired}
          >
            {loading ? (
              <span
                style={{
                  display: 'inline-block',
                  width: '16px',
                  height: '16px',
                  border: '2px solid #fff',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'admin2fa-spin 0.6s linear infinite',
                }}
              />
            ) : (
              t('auth.verifyCode', locale)
            )}
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <button
            type="button"
            style={{
              background: 'none',
              border: 'none',
              color: resendCooldown > 0 ? '#a5a3ff' : '#4945ff',
              fontSize: '13px',
              cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer',
              textDecoration: resendCooldown > 0 ? 'none' : 'underline',
              padding: 0,
            }}
            onClick={handleResend}
            disabled={resendCooldown > 0}
          >
            {resendCooldown > 0
              ? t('auth.resendIn', locale, {
                  seconds: resendCooldown,
                })
              : t('auth.requestNewCode', locale)}
          </button>
        </div>
      </div>
    </div>
  );
}
