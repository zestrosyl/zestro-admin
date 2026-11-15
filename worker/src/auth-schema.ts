import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/d1';
import {
  integer,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

const now = () => new Date();

export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: text('createdAt').notNull().$defaultFn(() => now().toISOString()),
  updatedAt: text('updatedAt').notNull().$defaultFn(() => now().toISOString()),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: text('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: text('createdAt').notNull().$defaultFn(() => now().toISOString()),
  updatedAt: text('updatedAt').notNull().$defaultFn(() => now().toISOString()),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: text('accessTokenExpiresAt'),
  refreshTokenExpiresAt: text('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: text('createdAt').notNull().$defaultFn(() => now().toISOString()),
  updatedAt: text('updatedAt').notNull().$defaultFn(() => now().toISOString()),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: text('expiresAt').notNull(),
  createdAt: text('createdAt').notNull().$defaultFn(() => now().toISOString()),
  updatedAt: text('updatedAt').notNull().$defaultFn(() => now().toISOString()),
});

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

  if (baseURL.protocol !== 'https:' || !env.BETTER_AUTH_SECRET || env.BETTER_AUTH_SECRET.length < 32) {
    throw new Error('Better Auth requires an HTTPS canonical URL and a strong server secret.');
  }

  return betterAuth({
    appName: 'ZESTRO Admin',
    baseURL: baseURL.toString().replace(/\/$/, ''),
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(drizzle(env.DB), {
      provider: 'sqlite',
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: false,
      async sendResetPassword({ user: authUser, url }) {
        if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
          throw new Error('Password reset email transport is not configured.');
        }
        const resetUrl = new URL(url);
        if (resetUrl.origin !== adminOrigin) {
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
            text: `A password reset was requested for your ZESTRO Admin account. Complete it here: ${resetUrl.toString()}\n\nIf you did not request this, ignore this email.`,
          }),
        });
        if (!response.ok) {
          throw new Error(`Password reset email delivery failed with status ${response.status}.`);
        }
      },
    },
    user: {
      additionalFields: {},
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
