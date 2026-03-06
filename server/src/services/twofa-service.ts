import type { Core } from '@strapi/strapi';
import crypto from 'crypto';
import {
  generateEmailHtml,
  maskEmail,
} from '../utils/email-template';

const CONTENT_TYPE =
  'plugin::admin-2fa.auth-code' as const;

type AuthCodeData = {
  userId?: number;
  email?: string;
  code?: string;
  expiresAt?: string;
  isUsed?: boolean;
  attempts?: number;
};

type AuthCodeRecord = AuthCodeData & {
  documentId: string;
  createdAt: string;
};

const documents = (strapi: Core.Strapi) =>
  strapi.documents(CONTENT_TYPE as any);

const twofaService = ({ strapi }: { strapi: Core.Strapi }) => ({
  generateCode(): string {
    const codeLength: number =
      strapi.plugin('admin-2fa').config('codeLength') ?? 6;
    const max = Math.pow(10, codeLength);
    const code = crypto.randomInt(0, max);
    return String(code).padStart(codeLength, '0');
  },

  async createCode(
    userId: number,
    email: string
  ): Promise<string> {
    // Инвалидируем все предыдущие неиспользованные коды пользователя
    const previousCodes = await documents(strapi).findMany({
      filters: { userId, isUsed: false },
    });

    for (const prev of previousCodes) {
      await documents(strapi).update({
        documentId: prev.documentId,
        data: { isUsed: true } as any,
      });
    }

    // Генерируем новый код
    const code = this.generateCode();
    const codeExpiration: number =
      strapi.plugin('admin-2fa').config('codeExpiration') ?? 5;
    const expiresAt = new Date(
      Date.now() + codeExpiration * 60 * 1000
    ).toISOString();

    await documents(strapi).create({
      data: {
        userId,
        email,
        code,
        expiresAt,
        isUsed: false,
        attempts: 0,
      } as any,
    });

    return code;
  },

  async verifyCode(
    userId: number,
    inputCode: string
  ): Promise<{ valid: boolean; error?: string }> {
    const maxAttempts: number =
      strapi.plugin('admin-2fa').config('maxAttempts') ?? 3;

    // Ищем последний неиспользованный код для userId
    const codes = await documents(strapi).findMany({
      filters: { userId, isUsed: false },
      sort: 'createdAt:desc',
      limit: 1,
    });

    const record = codes[0];

    if (!record) {
      return { valid: false, error: 'no_code' };
    }

    // Проверка срока действия
    if (new Date(record.expiresAt) <= new Date()) {
      await documents(strapi).update({
        documentId: record.documentId,
        data: { isUsed: true } as any,
      });
      return { valid: false, error: 'expired' };
    }

    // Проверка количества попыток
    if (record.attempts >= maxAttempts) {
      await documents(strapi).update({
        documentId: record.documentId,
        data: { isUsed: true } as any,
      });
      return { valid: false, error: 'too_many_attempts' };
    }

    // Проверка кода
    if (record.code !== inputCode) {
      await documents(strapi).update({
        documentId: record.documentId,
        data: { attempts: (record.attempts ?? 0) + 1 } as any,
      });
      return { valid: false, error: 'invalid_code' };
    }

    // Успех — помечаем код как использованный
    await documents(strapi).update({
      documentId: record.documentId,
      data: { isUsed: true } as any,
    });

    return { valid: true };
  },

  async cleanupExpiredCodes(): Promise<number> {
    const now = new Date().toISOString();

    const expiredCodes = await documents(strapi).findMany({
      filters: {
        $or: [{ expiresAt: { $lt: now } }, { isUsed: true }],
      },
    });

    for (const record of expiredCodes) {
      await documents(strapi).delete({
        documentId: record.documentId,
      });
    }

    const count = expiredCodes.length;

    if (count > 0) {
      strapi.log.debug(
        `[admin-2fa] Cleaned up ${count} expired/used auth codes`
      );
    }

    return count;
  },

  async sendCode(email: string, code: string): Promise<void> {
    const codeExpiration: number =
      strapi.plugin('admin-2fa').config('codeExpiration') ?? 5;
    const emailSubject: string =
      strapi.plugin('admin-2fa').config('emailSubject') ??
      'Your verification code';

    try {
      await strapi
        .plugin('email')
        .service('email')
        .send({
          to: email,
          subject: emailSubject,
          html: generateEmailHtml(code, codeExpiration),
          text: `Your verification code is: ${code}. It expires in ${codeExpiration} minutes.`,
        });

      strapi.log.info(
        `[admin-2fa] Verification code sent to ${maskEmail(email)}`
      );
    } catch (error) {
      strapi.log.error(
        '[admin-2fa] Failed to send email:',
        error
      );

      // В dev-режиме логируем код в консоль как fallback
      if (strapi.config.get('environment') === 'development') {
        strapi.log.warn(
          `[admin-2fa] DEV MODE - Verification code for ${email}: ${code}`
        );
        return; // В dev-режиме продолжаем без email
      }

      throw new Error('Failed to send verification email');
    }
  },
});

export default twofaService;
