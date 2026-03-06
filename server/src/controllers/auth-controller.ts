import type { Core } from '@strapi/strapi';
import jwt from 'jsonwebtoken';

const getAdminService = (strapi: Core.Strapi, name: string) =>
  strapi.service(`admin::${name}` as any);

const getJwtSecret = (strapi: Core.Strapi): string => {
  const secret = strapi.config.get('admin.auth.secret') as string;
  if (!secret) {
    throw new Error('[admin-2fa] ADMIN_JWT_SECRET is not defined');
  }
  return secret;
};

const authController = ({ strapi }: { strapi: Core.Strapi }) => ({
  /**
   * POST /admin/admin-2fa/auth/request-code
   * Проверяет credentials и отправляет 2FA код на email
   */
  async requestCode(ctx: any) {
    const { email, password } = ctx.request.body ?? {};

    // Валидация входных данных
    if (!email || typeof email !== 'string') {
      return ctx.badRequest('Email is required');
    }
    if (!password || typeof password !== 'string') {
      return ctx.badRequest('Password is required');
    }

    // Проверка учётных данных через Strapi admin auth
    const authService = getAdminService(strapi, 'auth');
    const [error, user, info] = await authService.checkCredentials({
      email: email.toLowerCase(),
      password,
    });

    if (error || !user) {
      return ctx.unauthorized('Invalid credentials');
    }

    // Получаем сервис 2FA
    const twofa = strapi
      .plugin('admin-2fa')
      .service('twofa');

    // Генерация и отправка кода
    const code = await twofa.createCode(user.id, user.email);
    await twofa.sendCode(user.email, code);

    // Генерация временного JWT токена
    const codeExpiration: number =
      strapi.plugin('admin-2fa').config('codeExpiration') ?? 5;
    const secret = getJwtSecret(strapi);

    const tempToken = jwt.sign(
      {
        id: user.id,
        email: user.email,
        stage: '2fa-pending',
      },
      secret,
      {
        algorithm: 'HS256',
        expiresIn: `${codeExpiration}m`,
      }
    );

    ctx.body = {
      message: 'Verification code sent',
      tempToken,
      requiresVerification: true,
    };
  },

  /**
   * POST /admin/admin-2fa/auth/verify-code
   * Верифицирует 2FA код и выдаёт финальный токен сессии
   */
  async verifyCode(ctx: any) {
    const { code, tempToken } = ctx.request.body ?? {};

    if (!code || typeof code !== 'string') {
      return ctx.badRequest('Code is required');
    }
    if (!tempToken || typeof tempToken !== 'string') {
      return ctx.badRequest('Token is required');
    }

    // Декодирование и проверка tempToken
    const secret = getJwtSecret(strapi);
    let payload: { id: number; email: string; stage: string };

    try {
      payload = jwt.verify(tempToken, secret, {
        algorithms: ['HS256'],
      }) as typeof payload;
    } catch {
      return ctx.unauthorized('Invalid or expired token');
    }

    if (payload.stage !== '2fa-pending') {
      return ctx.unauthorized('Invalid or expired token');
    }

    // Верификация кода
    const twofa = strapi
      .plugin('admin-2fa')
      .service('twofa');

    const result = await twofa.verifyCode(payload.id, code);

    if (!result.valid) {
      const errorMap: Record<string, { status: number; message: string }> =
        {
          no_code: { status: 400, message: 'No verification code found' },
          expired: { status: 400, message: 'Code expired' },
          too_many_attempts: {
            status: 429,
            message: 'Too many attempts',
          },
          invalid_code: { status: 400, message: 'Invalid code' },
        };

      const err = errorMap[result.error!] ?? {
        status: 400,
        message: 'Verification failed',
      };

      ctx.status = err.status;
      ctx.body = { error: err.message };
      return;
    }

    // Загрузка пользователя из БД
    const user = await strapi.db
      .query('admin::user')
      .findOne({
        where: { id: payload.id },
        populate: ['roles'],
      });

    if (!user) {
      return ctx.notFound('User not found');
    }

    // Создание сессии через Session Manager (Strapi 5)
    // sessionManager добавляется динамически и не типизирован в Core.Strapi
    const sessionManager = (strapi as any).sessionManager;

    if (!sessionManager) {
      return ctx.internalServerError(
        'Session manager is not available'
      );
    }

    const crypto = await import('crypto');
    const deviceId = crypto.randomUUID();
    const userId = String(user.id);

    const { token: refreshToken, absoluteExpiresAt } =
      await sessionManager('admin').generateRefreshToken(
        userId,
        deviceId,
        { type: 'session' }
      );

    // Устанавливаем refresh cookie
    const isProduction = process.env.NODE_ENV === 'production';
    const cookieDomain =
      strapi.config.get('admin.auth.cookie.domain') ||
      strapi.config.get('admin.auth.domain');
    const cookiePath = strapi.config.get(
      'admin.auth.cookie.path',
      '/admin'
    );

    ctx.cookies.set('strapi_admin_refresh', refreshToken, {
      httpOnly: true,
      secure: isProduction,
      overwrite: true,
      domain: cookieDomain,
      path: cookiePath,
      sameSite: 'lax',
    });

    // Генерация access token
    const accessResult =
      await sessionManager('admin').generateAccessToken(refreshToken);

    // Обновление lastLoginAt
    await strapi.db.query('admin::user').update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() } as any,
    });

    // Санитизация пользователя
    const userService = getAdminService(strapi, 'user');
    const sanitizedUser = userService.sanitizeUser(user);

    ctx.body = {
      data: {
        token: accessResult.token,
        accessToken: accessResult.token,
        user: sanitizedUser,
      },
    };
  },

  /**
   * POST /admin/admin-2fa/auth/resend-code
   * Повторно отправляет 2FA код, используя tempToken для идентификации пользователя
   */
  async resendCode(ctx: any) {
    const { tempToken } = ctx.request.body ?? {};

    if (!tempToken || typeof tempToken !== 'string') {
      return ctx.badRequest('Token is required');
    }

    const secret = getJwtSecret(strapi);
    let payload: { id: number; email: string; stage: string };

    try {
      payload = jwt.verify(tempToken, secret, {
        algorithms: ['HS256'],
      }) as typeof payload;
    } catch {
      return ctx.unauthorized('Invalid or expired token');
    }

    if (payload.stage !== '2fa-pending') {
      return ctx.unauthorized('Invalid or expired token');
    }

    const twofa = strapi
      .plugin('admin-2fa')
      .service('twofa');

    const code = await twofa.createCode(payload.id, payload.email);
    await twofa.sendCode(payload.email, code);

    ctx.body = {
      message: 'Verification code resent',
    };
  },

  /**
   * GET /admin/admin-2fa/auth/status
   * Проверяет включена ли 2FA
   */
  async getStatus(ctx: any) {
    const enabled: boolean =
      strapi.plugin('admin-2fa').config('enabled') ?? true;

    ctx.body = {
      enabled,
      message: enabled ? '2FA is enabled' : '2FA is disabled',
    };
  },
});

export default authController;
