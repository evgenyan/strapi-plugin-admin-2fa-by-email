import type { Core } from '@strapi/strapi';

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  const cleanupInterval: number =
    strapi.plugin('admin-2fa-by-email').config('cleanupInterval') || 5;
  const intervalMs = cleanupInterval * 60 * 1000;

  const intervalId = setInterval(async () => {
    try {
      const twofa = strapi.plugin('admin-2fa-by-email').service('twofa');
      await twofa.cleanupExpiredCodes();
    } catch (error) {
      strapi.log.error('[admin-2fa-by-email] Cleanup error:', error);
    }
  }, intervalMs);

  (strapi.plugin('admin-2fa-by-email') as any).cleanup = () =>
    clearInterval(intervalId);

  strapi.log.info(
    `[admin-2fa-by-email] Bootstrap complete. Cleanup interval: ${cleanupInterval}min`
  );
};

export default bootstrap;
