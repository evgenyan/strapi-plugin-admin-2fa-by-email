export default {
  type: 'admin',
  routes: [
    {
      method: 'POST',
      path: '/auth/request-code',
      handler: 'auth.requestCode',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/auth/verify-code',
      handler: 'auth.verifyCode',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'POST',
      path: '/auth/resend-code',
      handler: 'auth.resendCode',
      config: {
        auth: false,
        policies: [],
      },
    },
    {
      method: 'GET',
      path: '/auth/status',
      handler: 'auth.getStatus',
      config: {
        auth: false,
        policies: [],
      },
    },
  ],
};
