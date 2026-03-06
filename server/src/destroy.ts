import type { Core } from '@strapi/strapi';

const destroy = async ({ strapi }: { strapi: Core.Strapi }) => {
  const cleanup = (strapi.plugin('admin-2fa') as any).cleanup;
  if (typeof cleanup === 'function') {
    cleanup();
  }
  strapi.log.info('[admin-2fa] Plugin destroyed');
};

export default destroy;
