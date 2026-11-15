import { betterAuth } from 'better-auth';

export interface AuthEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
  ADMIN_APP_URL: string;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

export function createAuth(env: AuthEnv, ctx?: ExecutionContext) {
  const baseURL = new URL(env.BETTER_AUTH_URL);
  const adminURL = new URL(env.ADMIN_APP_URL);
  if (baseURL.protocol !== 'https:' || adminURL.protocol !== 'https:' ||
      !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('Better Auth requires HTTPS URLs and a strong secret.');
  }
  return betterAuth({
    appName: 'ZESTRO Admin',
    baseURL: baseURL.toString().replace(/\/$/, ''),
    secret: env.BETTER_AUTH_SECRET,
    database: env.DB,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      async sendResetPassword({ user, url }) {
        if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
          throw new Error('Password reset email transport is not configured.');
        }
        const resetURL = new URL(url);
        if (resetURL.origin !== adminURL.origin || resetURL.protocol !== 'https:') {
          throw new Error('Untrusted password reset URL.');
        }
        const send = fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
          body: JSON.stringify({
            from: env.RESEND_FROM_EMAIL,
            to: [user.email],
            subject: 'Reset your ZESTRO Admin password',
            text: `Reset your password using this one-time link: ${resetURL.toString()}\n\nIgnore if you did not request it.`,
          }),
        }).then((response) => {
          if (!response.ok) throw new Error(`Password reset delivery failed with status ${response.status}.`);
        });
        if (ctx) { ctx.waitUntil(send); return; }
        await send;
      },
    },
  });
}

export async function handleAuthRequest(request: Request, env: AuthEnv, ctx?: ExecutionContext) {
  return createAuth(env, ctx).handler(request);
}

export async function createInvitationAuthUser(
  env: AuthEnv,
  input: { email: string; name: string; password: string }
) {
  const auth = createAuth(env);
  return auth.api.signUpEmail({ body: input });
}

export async function getAuthSession(request: Request, env: AuthEnv) {
  return createAuth(env).api.getSession({ headers: request.headers });
}
