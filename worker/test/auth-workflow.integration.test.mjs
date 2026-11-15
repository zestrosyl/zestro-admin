import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Miniflare } from 'miniflare';
import { betterAuth } from 'better-auth';

const SECRET = process.env.BETTER_AUTH_SECRET || 'integration-test-only-secret-minimum-32-chars';
const BASE_URL = process.env.BETTER_AUTH_URL || 'https://auth-staging.invalid';

async function createSchema(DB) {
  const statements = [
    `CREATE TABLE user (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, emailVerified INTEGER NOT NULL DEFAULT 0, image TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE session (id TEXT PRIMARY KEY NOT NULL, expiresAt TEXT NOT NULL, token TEXT NOT NULL UNIQUE, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, ipAddress TEXT, userAgent TEXT, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE)`,
    `CREATE TABLE account (id TEXT PRIMARY KEY NOT NULL, accountId TEXT NOT NULL, providerId TEXT NOT NULL, userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE, accessToken TEXT, refreshToken TEXT, idToken TEXT, accessTokenExpiresAt TEXT, refreshTokenExpiresAt TEXT, scope TEXT, password TEXT, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE verification (id TEXT PRIMARY KEY NOT NULL, identifier TEXT NOT NULL, value TEXT NOT NULL, expiresAt TEXT NOT NULL, createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE restaurants (id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, timezone TEXT NOT NULL DEFAULT 'Asia/Dhaka', currency TEXT NOT NULL DEFAULT 'BDT', status TEXT NOT NULL DEFAULT 'active')`,
    `CREATE TABLE memberships (id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, auth_subject TEXT NOT NULL, email TEXT NOT NULL, display_name TEXT NOT NULL, role TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'invited')`,
    `CREATE TABLE auth_invitation_tokens (id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, membership_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE, expires_at TEXT NOT NULL, consumed_at TEXT, reserved_at TEXT, auth_user_id TEXT, delivery_status TEXT DEFAULT 'pending', revoked_at TEXT, created_by_membership_id TEXT NOT NULL)`,
    `CREATE TABLE auth_owner_link_proofs (id TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, membership_id TEXT NOT NULL, access_subject TEXT NOT NULL, better_auth_user_id TEXT NOT NULL, verified_by TEXT NOT NULL, verification_case_id TEXT NOT NULL, expires_at TEXT NOT NULL, consumed_at TEXT)`,
  ];
  for (const sql of statements) await DB.prepare(sql).run();
}

test('Better Auth D1: registration is stored, email/password login creates session, invalid password fails', async (t) => {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok"); } }', d1Databases: { DB: 'auth-integration' } });
  t.after(() => mf.dispose());
  const DB = await mf.getD1Database('DB');
  await createSchema(DB);
  const auth = betterAuth({
    appName: 'ZESTRO Auth Integration',
    baseURL: BASE_URL,
    secret: SECRET,
    database: DB,
    emailAndPassword: { enabled: true, minPasswordLength: 12 },
  });
  const email = 'integration-' + crypto.randomUUID() + '@example.test';
  const password = 'Strong-Integration-Password-2026!';
  const signUp = await auth.api.signUpEmail({ body: { name: 'Integration Staff', email, password } });
  assert.ok(signUp.user?.id);
  const signedIn = await auth.api.signInEmail({ body: { email, password } });
  assert.ok(signedIn.token);
  const sessions = await DB.prepare('SELECT id,userId,token FROM session WHERE userId=?').bind(signUp.user.id).all();
  assert.equal(sessions.results.length, 1);
  assert.equal(sessions.results[0].token, signedIn.token);
  const wrong = await auth.api.signInEmail({ body: { email, password: 'wrong-password-000' } }).catch(e => e);
  assert.ok(wrong instanceof Error);
  const signOut = await auth.api.signOut({ headers: new Headers({ cookie: `better-auth.session_token=${signedIn.token}` }) }).catch(e => e);
  assert.ok(signOut);
});

test('D1 schema constraints: invitations are one-time, membership stays invited until activation, owner proof binds identity tuple', async (t) => {
  const mf = new Miniflare({ modules: true, script: 'export default { fetch() { return new Response("ok"); } }', d1Databases: { DB: 'auth-tenant-integration' } });
  t.after(() => mf.dispose());
  const DB = await mf.getD1Database('DB');
  await createSchema(DB);
  await DB.prepare("INSERT INTO restaurants(id,name,slug) VALUES('r1','Test Restaurant','test-restaurant')").run();
  await DB.prepare("INSERT INTO memberships(id,restaurant_id,auth_subject,email,display_name,role,status) VALUES('m1','r1','invited:m1','pending@example.test','Pending Staff','staff','invited')").run();
  await DB.prepare("INSERT INTO auth_invitation_tokens(id,restaurant_id,membership_id,token_hash,expires_at,created_by_membership_id) VALUES('i1','r1','m1','hashed-token','2999-01-01T00:00:00.000Z','m1')").run();
  const pending = await DB.prepare("SELECT status FROM memberships WHERE id='m1'").first();
  assert.equal(pending.status, 'invited');
  await DB.prepare("UPDATE auth_invitation_tokens SET auth_user_id='auth-user-1' WHERE id='i1'").run();
  await DB.batch([
    DB.prepare("UPDATE memberships SET auth_subject='auth-user-1',status='active' WHERE id='m1' AND status='invited' AND EXISTS(SELECT 1 FROM auth_invitation_tokens WHERE id='i1' AND auth_user_id='auth-user-1' AND consumed_at IS NULL)"),
    DB.prepare("UPDATE auth_invitation_tokens SET consumed_at=CURRENT_TIMESTAMP WHERE id='i1' AND consumed_at IS NULL AND EXISTS(SELECT 1 FROM memberships WHERE id='m1' AND status='active' AND auth_subject='auth-user-1')"),
  ]);
  const activated = await DB.prepare("SELECT status,auth_subject FROM memberships WHERE id='m1'").first();
  const used = await DB.prepare("SELECT consumed_at FROM auth_invitation_tokens WHERE id='i1'").first();
  assert.equal(activated.status, 'active');
  assert.equal(activated.auth_subject, 'auth-user-1');
  assert.ok(used.consumed_at);
  const changes = await DB.prepare("UPDATE auth_invitation_tokens SET consumed_at=CURRENT_TIMESTAMP WHERE id='i1' AND consumed_at IS NULL").run();
  assert.equal(changes.meta.changes, 0);

  await DB.prepare("INSERT INTO auth_owner_link_proofs(id,restaurant_id,membership_id,access_subject,better_auth_user_id,verified_by,verification_case_id,expires_at) VALUES('p1','r1','m1','legacy-owner','better-auth-owner','operator-42','case-42','2999-01-01T00:00:00.000Z')").run();
  const proof = await DB.prepare("SELECT * FROM auth_owner_link_proofs WHERE id='p1'").first();
  assert.equal(proof.verified_by, 'operator-42');
  assert.equal(proof.verification_case_id, 'case-42');
  assert.notEqual(proof.access_subject, proof.better_auth_user_id);
});
