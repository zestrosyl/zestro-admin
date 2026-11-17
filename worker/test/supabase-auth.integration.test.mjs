import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, it } from 'node:test';
import esbuild from 'esbuild';
import { Miniflare } from 'miniflare';
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
} from 'jose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.resolve(__dirname, '..');
const SUPABASE_URL = 'https://nwpwatonkvwrcjkfmtsm.supabase.co';
const SUPABASE_ISSUER = SUPABASE_URL + '/auth/v1';
const ACCESS_ISSUER = 'https://icy-wave-d29d.cloudflareaccess.com';
const ACCESS_AUD = '46d30912b2ddf47b1b05c8929045e3b5f54f03dfe1ea677cd7be243ebed7c902';
const TENANT_A_ID = '45291381-ba84-4e2f-a60c-1c39a119c2d7';
const TENANT_B_ID = '99999999-ba84-4e2f-a60c-1c39a119c2d7';
const PUBLISHABLE_KEY = 'sb_publishable_test_only';

function splitSqlStatements(sql) {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0 && !/^PRAGMA\b/i.test(statement));
}

async function execSqlScript(db, sqlText) {
  for (const statement of splitSqlStatements(sqlText)) {
    await db.prepare(statement).run();
  }
}

describe('ZESTRO Supabase staff authentication — isolated D1 integration', () => {
  let miniflare;
  let db;
  let media;
  let handler;
  let env;
  let accessPrivateKey;
  let accessJwks;
  let supabasePrivateKey;
  let supabaseJwk;
  let originalFetch;
  const confirmedUsers = new Map();

  async function signAccessJwt({ email, sub, aud = ACCESS_AUD }) {
    return new SignJWT({ email })
      .setProtectedHeader({ alg: 'RS256', kid: 'zestro-access-test' })
      .setSubject(sub)
      .setIssuer(ACCESS_ISSUER)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(accessPrivateKey);
  }

  async function signSupabaseJwt({ email, sub, aud = 'authenticated' }) {
    const token = await new SignJWT({ email })
      .setProtectedHeader({ alg: 'RS256', kid: 'zestro-supabase-test' })
      .setSubject(sub)
      .setIssuer(SUPABASE_ISSUER)
      .setAudience(aud)
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(supabasePrivateKey);

    confirmedUsers.set(token, {
      id: sub,
      email,
      email_confirmed_at: new Date().toISOString(),
      confirmed_at: new Date().toISOString(),
    });
    return token;
  }

  async function request(pathname, { method = 'GET', token, accessToken, headers = {}, json } = {}) {
    const requestHeaders = new Headers(headers);
    if (token) requestHeaders.set('Authorization', 'Bearer ' + token);
    if (accessToken) requestHeaders.set('Cf-Access-Jwt-Assertion', accessToken);
    if (json !== undefined) requestHeaders.set('Content-Type', 'application/json');

    return handler.fetch(
      new Request('https://zestro-admin.pages.dev' + pathname, {
        method,
        headers: requestHeaders,
        body: json === undefined ? undefined : JSON.stringify(json),
      }),
      env
    );
  }

  before(async () => {
    const accessKeys = await generateKeyPair('RS256');
    accessPrivateKey = accessKeys.privateKey;
    const accessPublicJwk = await exportJWK(accessKeys.publicKey);
    Object.assign(accessPublicJwk, {
      kid: 'zestro-access-test',
      alg: 'RS256',
      use: 'sig',
    });
    accessJwks = createLocalJWKSet({ keys: [accessPublicJwk] });

    const supabaseKeys = await generateKeyPair('RS256');
    supabasePrivateKey = supabaseKeys.privateKey;
    supabaseJwk = await exportJWK(supabaseKeys.publicKey);
    Object.assign(supabaseJwk, {
      kid: 'zestro-supabase-test',
      alg: 'RS256',
      use: 'sig',
    });

    // Stub only the Supabase JWKS and /user endpoints. All other fetches retain
    // the original implementation so unexpected network dependencies fail normally.
    originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = input instanceof Request
        ? input.url
        : input instanceof URL
          ? input.toString()
          : String(input);

      if (url === SUPABASE_ISSUER + '/.well-known/jwks.json') {
        return new Response(JSON.stringify({ keys: [supabaseJwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }

      if (url === SUPABASE_ISSUER + '/user') {
        const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
        const bearer = (headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
        const user = confirmedUsers.get(bearer);
        return user
          ? new Response(JSON.stringify(user), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          : new Response(JSON.stringify({ message: 'Invalid token' }), { status: 401 });
      }

      return originalFetch(input, init);
    };

    const bundlePath = path.join('/tmp', 'zestro-admin-supabase-auth-test.mjs');
    await esbuild.build({
      entryPoints: [path.join(WORKER_ROOT, 'src/index.ts')],
      bundle: true,
      format: 'esm',
      platform: 'neutral',
      mainFields: ['module', 'main'],
      conditions: ['worker', 'browser', 'import'],
      target: 'es2022',
      outfile: bundlePath,
    });
    const workerModule = await import(bundlePath);

    miniflare = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } };',
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
    });
    db = await miniflare.getD1Database('DB');
    media = await miniflare.getR2Bucket('MEDIA');

    for (const migration of [
      '0001_initial.sql',
      '0002_production_functionality_repair.sql',
      '0003_supabase_user_link.sql',
    ]) {
      await execSqlScript(
        db,
        fs.readFileSync(path.join(WORKER_ROOT, 'migrations', migration), 'utf8')
      );
    }

    await db.prepare(
      `INSERT INTO restaurants (id, slug, name, currency, timezone, status)
       VALUES (?, 'zestro', 'ZESTRO', 'BDT', 'Asia/Dhaka', 'active')`
    ).bind(TENANT_A_ID).run();

    await db.prepare(
      `INSERT INTO restaurants (id, slug, name, currency, timezone, status)
       VALUES (?, 'other-bistro', 'Other Bistro', 'BDT', 'Asia/Dhaka', 'active')`
    ).bind(TENANT_B_ID).run();

    await db.prepare(
      `INSERT INTO memberships
        (id, restaurant_id, auth_subject, email, display_name, role, status, job_title)
       VALUES ('owner-a', ?, 'access-owner-a', 'owner@zestro.test', 'ZESTRO Owner', 'owner', 'active', 'Owner')`
    ).bind(TENANT_A_ID).run();

    env = {
      DB: db,
      MEDIA: media,
      ACCESS_TEAM_DOMAIN: 'icy-wave-d29d.cloudflareaccess.com',
      ACCESS_AUD,
      ALLOWED_ORIGINS: 'https://zestro-admin.pages.dev',
      SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: PUBLISHABLE_KEY,
      REQUIRE_SUPABASE_AUTH: 'true',
    };

    handler = workerModule.createAdminHandler({ keySetOverride: accessJwks });
  });

  after(async () => {
    globalThis.fetch = originalFetch;
    if (miniflare) await miniflare.dispose();
  });

  it('links an existing active owner only when the Supabase email is confirmed and matches the Access identity', async () => {
    const supabaseToken = await signSupabaseJwt({
      email: 'owner@zestro.test',
      sub: 'supabase-owner-a',
    });
    const accessToken = await signAccessJwt({
      email: 'owner@zestro.test',
      sub: 'access-owner-a',
    });

    const linked = await request('/api/auth/link-supabase', {
      method: 'POST',
      token: supabaseToken,
      accessToken,
    });
    assert.equal(linked.status, 200);
    assert.deepEqual(await linked.json(), { ok: true, linked: true });

    const me = await request('/api/me', { token: supabaseToken });
    assert.equal(me.status, 200);
    const body = await me.json();
    assert.equal(body.user.role, 'owner');
    assert.equal(body.restaurant.id, TENANT_A_ID);

    const row = await db.prepare(
      'SELECT auth_subject, supabase_user_id, status FROM memberships WHERE id = ?'
    ).bind('owner-a').first();
    assert.equal(row.auth_subject, 'access-owner-a');
    assert.equal(row.supabase_user_id, 'supabase-owner-a');
    assert.equal(row.status, 'active');
  });

  it('activates only an owner-created invited membership after Supabase email confirmation', async () => {
    const ownerToken = await signSupabaseJwt({
      email: 'owner@zestro.test',
      sub: 'supabase-owner-a',
    });

    const invited = await request('/api/staff', {
      method: 'POST',
      token: ownerToken,
      json: {
        name: 'Cashier One',
        email: 'cashier@zestro.test',
        role: 'Server',
      },
    });
    assert.equal(invited.status, 201);
    const invitedRow = await invited.json();

    const cashierToken = await signSupabaseJwt({
      email: 'cashier@zestro.test',
      sub: 'supabase-cashier-one',
    });
    const cashierMe = await request('/api/me', { token: cashierToken });
    assert.equal(cashierMe.status, 200);
    const cashierBody = await cashierMe.json();
    assert.equal(cashierBody.user.role, 'staff');
    assert.equal(cashierBody.restaurant.id, TENANT_A_ID);

    const stored = await db.prepare(
      'SELECT auth_subject, supabase_user_id, status FROM memberships WHERE id = ?'
    ).bind(invitedRow.id).first();
    assert.match(stored.auth_subject, /^invited:/);
    assert.equal(stored.supabase_user_id, 'supabase-cashier-one');
    assert.equal(stored.status, 'active');
  });

  it('rejects uninvited users, unconfirmed invitees, and cross-tenant selection', async () => {
    const strangerToken = await signSupabaseJwt({
      email: 'stranger@zestro.test',
      sub: 'supabase-stranger',
    });
    const stranger = await request('/api/me', { token: strangerToken });
    assert.equal(stranger.status, 403);

    await db.prepare(
      `INSERT INTO memberships
        (id, restaurant_id, auth_subject, email, display_name, role, status, job_title)
       VALUES ('invite-unconfirmed', ?, 'invited:test-unconfirmed', 'unconfirmed@zestro.test',
               'Unconfirmed Invitee', 'staff', 'invited', 'Server')`
    ).bind(TENANT_A_ID).run();

    const unconfirmedToken = await signSupabaseJwt({
      email: 'unconfirmed@zestro.test',
      sub: 'supabase-unconfirmed',
    });
    confirmedUsers.set(unconfirmedToken, {
      id: 'supabase-unconfirmed',
      email: 'unconfirmed@zestro.test',
      email_confirmed_at: null,
      confirmed_at: null,
    });
    const unconfirmed = await request('/api/me', { token: unconfirmedToken });
    assert.equal(unconfirmed.status, 403);

    const ownerToken = await signSupabaseJwt({
      email: 'owner@zestro.test',
      sub: 'supabase-owner-a',
    });
    const crossTenant = await request('/api/me', {
      token: ownerToken,
      headers: { 'X-Restaurant-Id': TENANT_B_ID },
    });
    assert.equal(crossTenant.status, 403);

    const unconfirmedRow = await db.prepare(
      'SELECT status, supabase_user_id FROM memberships WHERE id = ?'
    ).bind('invite-unconfirmed').first();
    assert.equal(unconfirmedRow.status, 'invited');
    assert.equal(unconfirmedRow.supabase_user_id, null);
  });

  it('rejects invalid Supabase tokens and does not bypass D1 role checks', async () => {
    const invalidAudienceToken = await signSupabaseJwt({
      email: 'owner@zestro.test',
      sub: 'supabase-owner-a',
      aud: 'wrong-audience',
    });
    const invalid = await request('/api/me', { token: invalidAudienceToken });
    assert.equal(invalid.status, 401);

    const ownerToken = await signSupabaseJwt({
      email: 'owner@zestro.test',
      sub: 'supabase-owner-a',
    });
    const invite = await request('/api/staff', {
      method: 'POST',
      token: ownerToken,
      json: {
        name: 'Viewer One',
        email: 'viewer@zestro.test',
        role: 'Server',
      },
    });
    assert.equal(invite.status, 201);
    const invitedRow = await invite.json();

    const staffToken = await signSupabaseJwt({
      email: 'viewer@zestro.test',
      sub: 'supabase-viewer',
    });
    const staffMe = await request('/api/me', { token: staffToken });
    assert.equal(staffMe.status, 200);

    const staffInviteAttempt = await request('/api/staff', {
      method: 'POST',
      token: staffToken,
      json: {
        name: 'Not Allowed',
        email: 'not-allowed@zestro.test',
        role: 'Owner',
      },
    });
    assert.equal(staffInviteAttempt.status, 403);

    const memberRow = await db.prepare(
      'SELECT supabase_user_id, status FROM memberships WHERE id = ?'
    ).bind(invitedRow.id).first();
    assert.equal(memberRow.supabase_user_id, 'supabase-viewer');
    assert.equal(memberRow.status, 'active');
  });
});
