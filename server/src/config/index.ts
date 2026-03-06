export default {
  default: {
    codeLength: 6,
    codeExpiration: 5,
    maxAttempts: 3,
    cleanupInterval: 5,
    emailSubject: 'Your verification code',
    enabled: true,
  },
  validator(config: Record<string, unknown>) {
    if (
      config.codeLength !== undefined &&
      (typeof config.codeLength !== 'number' ||
        config.codeLength < 4 ||
        config.codeLength > 8)
    ) {
      throw new Error(
        'admin-2fa-by-email: codeLength must be a number between 4 and 8'
      );
    }

    if (
      config.codeExpiration !== undefined &&
      (typeof config.codeExpiration !== 'number' ||
        config.codeExpiration < 1 ||
        config.codeExpiration > 30)
    ) {
      throw new Error(
        'admin-2fa-by-email: codeExpiration must be a number between 1 and 30 (minutes)'
      );
    }

    if (
      config.maxAttempts !== undefined &&
      (typeof config.maxAttempts !== 'number' ||
        config.maxAttempts < 1 ||
        config.maxAttempts > 10)
    ) {
      throw new Error(
        'admin-2fa-by-email: maxAttempts must be a number between 1 and 10'
      );
    }

    if (
      config.cleanupInterval !== undefined &&
      (typeof config.cleanupInterval !== 'number' ||
        config.cleanupInterval < 1)
    ) {
      throw new Error(
        'admin-2fa-by-email: cleanupInterval must be a positive number (minutes)'
      );
    }

    if (
      config.emailSubject !== undefined &&
      typeof config.emailSubject !== 'string'
    ) {
      throw new Error('admin-2fa-by-email: emailSubject must be a string');
    }

    if (
      config.enabled !== undefined &&
      typeof config.enabled !== 'boolean'
    ) {
      throw new Error('admin-2fa-by-email: enabled must be a boolean');
    }
  },
};
