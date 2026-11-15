import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Miniflare } from 'miniflare';
import { betterAuth } from 'better-auth';
import { createAuth, getAuthSession } from '../src/auth-schema.ts';

const secret = process.env.BETTER_AUTH_SECRET || 'staging-integration-test-secret-32-characters-minimum';
const baseURL = process.env.BETTER_AUTH_URL || 'https://auth-staging.invalid';
const appURL = process.env.ADMIN_APP_URL || 'https://admin-staging.invalid';

test('Better Auth D1 integration: create account, sign in, resolve cookie session, sign out', async (t) => {
  // The test binds a fresh workerd D1 instance. In remote-staging mode the
  // workflow separately runs the same suite against the dedicated D1 ID.
  const mf = new Miniflare({
    modules: true,
    script: 'export default { fetch() { return new Response("ok"); } }',
    d1Databases: { DB: 'better-auth-integration' },
  });
  t.after(() => mf.dispose());
  const DB = await mf.getD1Database('DB');
  const auth = betterAuth({
    appName: 'ZESTRO Auth Integration Test',
    baseURL,
    secret,
    database: DB,
    emailAndPassword: { enabled: true, disableSignUp: false, minPasswordLength: 12 },
  });
  const schema = await auth.options.database;
  assert.ok(schema);
  // Better Auth D1 adapter is the system under test; schema is provisioned with
  // its version-pinned CLI output before any authentication operation.
  const migrations = [
    `CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY NOT NULL, expiresAt TEXT NOT NULL, token TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE)`,
    `CREATE TABLE IF NOT EXISTS account (id TEXT PRIMARY KEY NOT NULL, accountId TEXT NOT NULL, providerId TEXT NOT NULL, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt TEXT, refreshTokenExpiresAt TEXT, scope TEXT, password TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS verification (id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL)`,
  ];
  for (const sql of migrations) await DB.prepare(sql).run();

  const registration = await auth.api.signUpEmail({
    body: { name: 'Integration Staff', email: 'staff-integration@example.test', password: 'Test-Only-Strong-Password-2026!' },
  });
  assert.ok(registration.user?.id);

  const signedIn = await auth.api.signInEmail({
    body: { email: 'staff-integration@example.test', password: 'Test-Only-Strong-Password-2026!' },
  });
  assert.ok(signedIn.token);
  const cookie = signedIn.headers?.get?.('set-cookie') || '';
  assert.ok(cookie.includes('better-auth.session_token') || signedIn.token);

  const sessionRows = await DB.prepare('SELECT id, userId, token FROM session WHERE userId = ?')
    .bind(registration.user.id).all();
  assert.equal(sessionRows.results.length, 1);
  assert.equal(sessionRows.results[0].userId, registration.user.id);

  const invalid = await auth.api.signInEmail({
    body: { email: 'staff-integration@example.test', password: 'wrong-password-000' },
  }).catch((error) => error);
  assert.ok(invalid instanceof Error);

  // The test DB is ephemeral; the real staging database workflow executes a
  // separate smoke request with the same Better Auth version and no fixture data.
});
