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
  '/api/auth/forget-password',
  '/api/auth/reset-password',
]);

export function createAuth(env: AuthEnv) {
  const baseURL = new URL(env.BETTER_AUTH_URL);
  const adminOrigin = new URL(env.ADMIN_APP_URL).origin;
  if (baseURL.protocol !== 'https:' ||
      adminOrigin !== baseURL.origin ||
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
      revokeSessionsOnPasswordReset: true,
      requireEmailVerification: false,
      async sendResetPassword({ user: authUser, url }) {
        if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
          throw new Error('Password reset email transport is not configured.');
        }
        const resetUrl = new URL(url);
        if (resetUrl.origin !== adminOrigin || resetUrl.protocol !== 'https:') {
          throw new Error('Refusing to send a password reset URL for an untrusted origin.');
        }
        const response = await fetch('https://api.resend.com/emails', {
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
        });
        if (!response.ok) {
          throw new Error(`Password reset email delivery failed with status ${response.status}.`);
        }
      },
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
      cookieCache: { enabled: false },
    },
    trustedOrigins: [adminOrigin],
    advanced: {
      useSecureCookies: true,
      defaultCookieAttributes: {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
      },
    },
  });
}
export async function handleAuthRequest(request: Request, env: AuthEnv): Promise<Response> {
  const url = new URL(request.url);
  if (!AUTH_PATHS.has(url.pathname)) {
    return new Response('Not found', { status: 404 });
  }
  if (request.method !== 'GET' && request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  return createAuth(env).handler(request);
}

export async function getAuthSession(request: Request, env: AuthEnv) {
  return createAuth(env).api.getSession({ headers: request.headers });
}
