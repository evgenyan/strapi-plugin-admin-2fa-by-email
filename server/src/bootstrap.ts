import type { Core } from '@strapi/strapi';

const bootstrap = async ({ strapi }: { strapi: Core.Strapi }) => {
  const cleanupInterval: number =
    strapi.plugin('admin-2fa').config('cleanupInterval') || 5;
  const intervalMs = cleanupInterval * 60 * 1000;

  const intervalId = setInterval(async () => {
    try {
      const twofa = strapi.plugin('admin-2fa').service('twofa');
      await twofa.cleanupExpiredCodes();
    } catch (error) {
      strapi.log.error('[admin-2fa] Cleanup error:', error);
    }
  }, intervalMs);

  (strapi.plugin('admin-2fa') as any).cleanup = () =>
    clearInterval(intervalId);

  strapi.log.info(
    `[admin-2fa] Bootstrap complete. Cleanup interval: ${cleanupInterval}min`
  );
};

export default bootstrap;
