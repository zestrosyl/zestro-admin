import { betterAuth } from 'better-auth';

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  ADMIN_APP_URL: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

const AUTH_PATHS = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-out',
  '/api/auth/get-session',
  '/api/auth/request-password-reset',
  '/api/auth/reset-password',
]);

export function createAuth(env: AuthEnv, ctx?: ExecutionContext) {
  const baseURL = new URL(env.BETTER_AUTH_URL);
  const adminURL = new URL(env.ADMIN_APP_URL);
  const adminOrigin = adminURL.origin;
  if (baseURL.protocol !== 'https:' ||
      adminURL.protocol !== 'https:' ||
      !env.BETTER_AUTH_SECRET ||
      env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('Better Auth requires a matching HTTPS app/API URL and a strong secret.');
  }

  return betterAuth({
    appName: 'ZESTRO Admin',
    baseURL: baseURL.toString().replace(/\\/$/, ''),
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      async onPasswordReset({ user: authUser }) {
        // D1 has no interactive transaction support for Better Auth's combined
        // reset + revoke flow. This idempotent one-statement cleanup is a
        // separate post-reset step; failures are surfaced and require recovery.
        await env.DB.prepare('DELETE FROM session WHERE userId = ?').bind(authUser.id).run();
      },
      requireEmailVerification: false,
      async sendResetPassword({ user: authUser, url }) {
        if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
          throw new Error('Password reset email transport is not configured.');
        }
        const resetUrl = new URL(url);
        if (resetUrl.origin !== adminOrigin || resetUrl.protocol !== 'https:') {
          throw new Error('Refusing to send a password reset URL for an untrusted origin.');
        }
        const send = fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${env.RESEND_API_KEY}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: env.RESEND_FROM_EMAIL,
            to: [authUser.email],
            subject: 'Reset your ZESTRO Admin password',
            text: `A password reset was requested for your ZESTRO Admin account. Complete it here: ${resetUrl.toString()}\\n\\nIf you did not request this, ignore this email.`,
          }),
        }).then((response) => {
          if (!response.ok) {
            throw new Error(`Password reset email delivery failed with status ${response.status}.`);
          }
        });
        if (ctx) {
          ctx.waitUntil(send);
          return;
        }
        await send;
      },

