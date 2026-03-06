import type { Core } from '@strapi/strapi';

const register = ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.log.info('[admin-2fa-by-email] Plugin registered');
};

export default register;
