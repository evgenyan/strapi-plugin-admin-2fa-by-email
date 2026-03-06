export function generateEmailHtml(
  code: string,
  expirationMinutes: number
): string {
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #333; margin-bottom: 16px;">Код подтверждения</h2>
      <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; margin: 24px 0; color: #333; background: #f5f5f5; padding: 16px; border-radius: 8px;">
        ${code}
      </p>
      <p style="color: #555; font-size: 14px;">Код действителен в течение ${expirationMinutes} минут.</p>
      <p style="color: #888; font-size: 12px;">Если вы не запрашивали этот код, проигнорируйте это письмо.</p>
    </div>
  `;
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  const masked =
    local.length > 1
      ? local[0] + '***' + local[local.length - 1]
      : local[0] + '***';
  return `${masked}@${domain}`;
}
