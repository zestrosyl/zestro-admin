import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, before, after } from 'node:test';
import esbuild from 'esbuild';
import { Miniflare } from 'miniflare';
import { createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, SignJWT } from 'jose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WORKER_ROOT, '..');
const PUBLIC_WORKER_ROOT = path.resolve(REPO_ROOT, 'worker-public');

const ACCESS_AUD = '46d30912b2ddf47b1b05c8929045e3b5f54f03dfe1ea677cd7be243ebed7c902';
const TEAM_DOMAIN = 'https://icy-wave-d29d.cloudflareaccess.com';
const TENANT_A_ID = '45291381-ba84-4e2f-a60c-1c39a119c2d7';
const TENANT_B_ID = '99999999-ba84-4e2f-a60c-1c39a119c2d7';

function splitSqlStatements(sql) {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^PRAGMA\b/i.test(s));
}

async function execSqlScript(db, sqlText) {
  for (const stmt of splitSqlStatements(sqlText)) {
    await db.prepare(stmt).run();
  }
}

describe('ZESTRO Production Functionality Repair — Full End-to-End Suite', () => {
  let mf;
  let d1;
  let r2;
  let adminMod;
  let publicWorker;
  let pagesProxyOnRequest;
  let privateKey;
  let localJwks;
  let adminHandler;
  let baseEnv;

  async function signAccessJwt({ email, sub, aud = ACCESS_AUD, expiresIn = '1h' }) {
    return new SignJWT({ email })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setSubject(sub)
      .setIssuer(TEAM_DOMAIN)
      .setAudience([aud])
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(privateKey);
  }

  async function adminFetch(urlPath, options = {}) {
    const url = urlPath.startsWith('http') ? urlPath : `https://zestro-admin.pages.dev${urlPath}`;
    const headers = new Headers(options.headers || {});
    if (options.jwt) {
      headers.set('Cf-Access-Jwt-Assertion', options.jwt);
    }
    if (options.json !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    const req = new Request(url, {
      method: options.method || 'GET',
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    });
    return adminHandler.fetch(req, baseEnv);
  }

  async function publicFetch(urlPath, options = {}) {
    const url = urlPath.startsWith('http')
      ? urlPath
      : `https://zestro-customer-api.zestro-syl.workers.dev${urlPath}`;
    const headers = new Headers(options.headers || {});
    if (options.json !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    const req = new Request(url, {
      method: options.method || 'GET',
      headers,
      body: options.json !== undefined ? JSON.stringify(options.json) : options.body,
    });
    return publicWorker.fetch(req, {
      DB: d1,
      MEDIA: r2,
      RESTAURANT_ID: TENANT_A_ID,
      ALLOWED_ORIGINS: 'https://zestro-customer-website.pages.dev',
      WHATSAPP_NUMBER: '+8801601987672',
    });
  }

  before(async () => {
    // 1. Generate RS256 JWKS keypair for Cloudflare Access verification
    const kp = await generateKeyPair('RS256');
    privateKey = kp.privateKey;
    const pubJwk = await exportJWK(kp.publicKey);
    pubJwk.kid = 'test-key-1';
    pubJwk.alg = 'RS256';
    pubJwk.use = 'sig';
    localJwks = createLocalJWKSet({ keys: [pubJwk] });

    // 2. Bundle worker/src/index.ts, worker-public/src/index.ts, and functions/api/[[path]].ts
    const tmpDir = fs.mkdtempSync(path.join(WORKER_ROOT, '.tmp-test-bundle-'));
    try {
      const adminOut = path.join(tmpDir, 'admin-worker.mjs');
      const publicOut = path.join(tmpDir, 'public-worker.mjs');
      const proxyOut = path.join(tmpDir, 'pages-proxy.mjs');

      await esbuild.build({
        entryPoints: [path.join(WORKER_ROOT, 'src/index.ts')],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        mainFields: ['module', 'main'],
        conditions: ['worker', 'browser', 'import'],
        outfile: adminOut,
      });

      await esbuild.build({
        entryPoints: [path.join(PUBLIC_WORKER_ROOT, 'src/index.ts')],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        mainFields: ['module', 'main'],
        conditions: ['worker', 'browser', 'import'],
        outfile: publicOut,
      });

      await esbuild.build({
        entryPoints: [path.join(REPO_ROOT, 'functions/api/[[path]].ts')],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        outfile: proxyOut,
      });

      adminMod = await import(`file://${adminOut}`);
      publicWorker = (await import(`file://${publicOut}`)).default;
      pagesProxyOnRequest = (await import(`file://${proxyOut}`)).onRequest;
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // 3. Spin up real Cloudflare workerd D1 + R2 via Miniflare
    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      d1Databases: { DB: 'test-zestro-d1', DB_PROD_CLONE: 'test-prod-clone-d1' },
      r2Buckets: ['MEDIA'],
    });

    d1 = await mf.getD1Database('DB');
    r2 = await mf.getR2Bucket('MEDIA');

    baseEnv = {
      DB: d1,
      MEDIA: r2,
      ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
      ACCESS_AUD,
      ALLOWED_ORIGINS: 'https://zestro-admin.pages.dev,https://zestro-customer-website.pages.dev',
      BETTER_AUTH_SECRET: 'integration-test-secret-minimum-32-characters-long',
      BETTER_AUTH_URL: 'https://auth-test.zestro.invalid',
      ADMIN_APP_URL: 'https://zestro-admin.pages.dev',
      RESEND_API_KEY: 'test-resend-key',
      RESEND_FROM_EMAIL: 'no-reply@zestro.test',
    };

    // The production Worker authenticates Better Auth sessions. This suite
    // injects a test-only resolver so the existing CRUD/RBAC regression cases
    // can keep exercising tenant logic without relying on production secrets.
    adminHandler = adminMod.createAdminHandler({
      sessionResolver: async (req, env) => {
        let subject = '';
        const cookie = req.headers.get('cookie') || '';
        const sessionCookie = cookie.split(';').map((part) => part.trim())
          .find((part) => /^(?:__Secure-|__Host-)?better-auth\.session_token=/i.test(part));
        if (sessionCookie) {
          subject = sessionCookie.slice(sessionCookie.indexOf('=') + 1);
        } else {
          const token = req.headers.get('Cf-Access-Jwt-Assertion');
          if (!token) return { kind: 'unauthenticated', message: 'Authentication required' };
          try {
            const { payload } = await jwtVerify(token, localJwks, {
              issuer: TEAM_DOMAIN,
              audience: ACCESS_AUD,
            });
            subject = String(payload.sub || '');
          } catch {
            return { kind: 'unauthenticated', message: 'Authentication required' };
          }
        }
        if (!subject) return { kind: 'unauthenticated', message: 'Authentication required' };

        const requestedRestaurantId =
          req.headers.get('X-Restaurant-Id') || new URL(req.url).searchParams.get('restaurantId') || '';
        const memberSql = `
          SELECT m.id, m.restaurant_id, m.auth_subject, m.email, m.display_name, m.role,
            COALESCE(m.job_title, '') AS job_title, r.name AS restaurant_name,
            r.slug AS restaurant_slug, r.currency AS restaurant_currency,
            r.timezone AS restaurant_timezone, r.status AS restaurant_status
          FROM memberships m JOIN restaurants r ON r.id = m.restaurant_id
          WHERE m.auth_subject = ? AND m.status = 'active' AND r.status = 'active'
        `;
        const member = requestedRestaurantId
          ? await env.DB.prepare(memberSql + ' AND m.restaurant_id = ? LIMIT 1')
              .bind(subject, requestedRestaurantId).first()
          : await env.DB.prepare(memberSql + ' ORDER BY m.created_at ASC LIMIT 1')
              .bind(subject).first();
        if (member) return { kind: 'ok', member };
        const otherTenant = await env.DB.prepare(
          `SELECT m.id FROM memberships m JOIN restaurants r ON r.id = m.restaurant_id
           WHERE m.auth_subject = ? AND m.status = 'active' AND r.status = 'active' LIMIT 1`
        ).bind(subject).first();
        return otherTenant
          ? { kind: 'forbidden', message: 'Access denied for requested tenant' }
          : { kind: 'forbidden', message: 'No active membership is linked to this account' };
      },
    });
  });

  after(async () => {
    if (mf) await mf.dispose();
  });

  it('1. Database Migrations: applies 0001 + 0002 on fresh D1 and 0002 on live-production-clone D1 with zero data loss', async () => {
    const mig1 = fs.readFileSync(path.join(WORKER_ROOT, 'migrations/0001_initial.sql'), 'utf8');
    const mig2 = fs.readFileSync(
      path.join(WORKER_ROOT, 'migrations/0002_production_functionality_repair.sql'),
      'utf8'
    );
    const mig3 = fs.readFileSync(
      path.join(WORKER_ROOT, 'migrations/0003_better_auth.sql'),
      'utf8'
    );

    // Fresh D1 migration test
    await execSqlScript(d1, mig1);
    await execSqlScript(d1, mig2);
    await execSqlScript(d1, mig3);

    const tablesRes = await d1
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name"
      )
      .all();
    const tableNames = tablesRes.results.map((r) => r.name);
    for (const expected of [
      'audit_logs',
      'gallery_photos',
      'media_assets',
      'memberships',
      'menu_categories',
      'menu_items',
      'order_items',
      'orders',
      'promotions',
      'restaurant_settings',
      'restaurant_tables',
      'restaurants',
      'waiter_calls',
    ]) {
      assert.ok(tableNames.includes(expected), `Expected table ${expected} to exist`);
    }

    // Production clone migration test: exact 12 tables from live production + existing rows -> apply 0002
    const prodCloneDb = await mf.getD1Database('DB_PROD_CLONE');
    await execSqlScript(prodCloneDb, mig1);
    await prodCloneDb
      .prepare(
        `INSERT INTO restaurants (id, slug, name, currency, timezone, status)
         VALUES (?, 'zestro', 'ZESTRO', 'BDT', 'Asia/Dhaka', 'active')`
      )
      .bind(TENANT_A_ID)
      .run();
    await prodCloneDb
      .prepare(
        `INSERT INTO memberships (id, restaurant_id, auth_subject, email, display_name, role, status)
         VALUES ('owner-prod-1', ?, 'sub-zestro-owner', 'zestro.syl@gmail.com', 'Zestro Owner', 'owner', 'active')`
      )
      .bind(TENANT_A_ID)
      .run();

    await execSqlScript(prodCloneDb, mig2);

    const preservedOwner = await prodCloneDb
      .prepare('SELECT email, role, status, duty_status FROM memberships WHERE restaurant_id = ?')
      .bind(TENANT_A_ID)
      .first();
    assert.equal(preservedOwner.email, 'zestro.syl@gmail.com');
    assert.equal(preservedOwner.role, 'owner');
    assert.equal(preservedOwner.status, 'active');
    assert.equal(preservedOwner.duty_status, 'Active');

    // Seed Tenant A and Tenant B in primary test D1
    await d1
      .prepare(
        `INSERT INTO restaurants (id, slug, name, currency, timezone, status)
         VALUES (?, 'zestro', 'ZESTRO', 'BDT', 'Asia/Dhaka', 'active')`
      )
      .bind(TENANT_A_ID)
      .run();
    await d1
      .prepare(
        `INSERT INTO restaurant_settings (restaurant_id, settings_json)
         VALUES (?, ?)`
      )
      .bind(
        TENANT_A_ID,
        JSON.stringify({
          restaurantName: 'ZESTRO',
          currency: 'BDT (৳)',
          whatsappNumber: '+8801601987672',
          phone: '+8801601987672',
          taxRatePercent: 5,
          serviceChargePercent: 10,
          deliveryFee: 60,
          minOrderAmount: 300,
          onlineOrderingEnabled: true,
          acceptingOrders: true,
          qrTableOrderingEnabled: true,
        })
      )
      .run();
    await d1
      .prepare(
        `INSERT INTO memberships (id, restaurant_id, auth_subject, email, display_name, role, status, job_title)
         VALUES ('mem-owner-a', ?, 'sub-owner-a', 'owner-a@zestro.test', 'Owner A', 'owner', 'active', 'Owner')`
      )
      .bind(TENANT_A_ID)
      .run();

    // Seed Tenant B
    await d1
      .prepare(
        `INSERT INTO restaurants (id, slug, name, currency, timezone, status)
         VALUES (?, 'other-bistro', 'Other Bistro', 'USD', 'UTC', 'active')`
      )
      .bind(TENANT_B_ID)
      .run();
    await d1
      .prepare(
        `INSERT INTO memberships (id, restaurant_id, auth_subject, email, display_name, role, status, job_title)
         VALUES ('mem-owner-b', ?, 'sub-owner-b', 'owner-b@bistro.test', 'Owner B', 'owner', 'active', 'Owner')`
      )
      .bind(TENANT_B_ID)
      .run();
  });

  it('2. Authentication & RBAC: blocks unauthenticated/forged tokens, auto-binds invited staff, and enforces role permissions', async () => {
    // Missing JWT -> 401
    const noAuthRes = await adminFetch('/api/me');
    assert.equal(noAuthRes.status, 401);

    // Wrong audience JWT -> 401
    const wrongAudJwt = await signAccessJwt({
      email: 'owner-a@zestro.test',
      sub: 'sub-owner-a',
      aud: 'wrong-audience-id',
    });
    const wrongAudRes = await adminFetch('/api/me', { jwt: wrongAudJwt });
    assert.equal(wrongAudRes.status, 401);

    // Valid JWT for non-member -> 403
    const strangerJwt = await signAccessJwt({ email: 'stranger@example.com', sub: 'sub-stranger' });
    const strangerRes = await adminFetch('/api/me', { jwt: strangerJwt });
    assert.equal(strangerRes.status, 403);

    // Owner A invites a Server ('staff' role) and a Manager ('manager' role)
    const ownerAJwt = await signAccessJwt({ email: 'owner-a@zestro.test', sub: 'sub-owner-a' });
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const target = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (target === 'https://api.resend.com/emails') {
        return new Response(JSON.stringify({ id: 'test-email-id' }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return realFetch(input, init);
    };
    const inviteStaffRes = await adminFetch('/api/staff', {
      method: 'POST',
      jwt: ownerAJwt,
      json: { name: 'Cashier One', email: 'cashier@zestro.test', role: 'Server', phone: '01700000001' },
    });
    globalThis.fetch = realFetch;
    assert.equal(inviteStaffRes.status, 201, await inviteStaffRes.clone().text());
    const invitedStaff = await inviteStaffRes.json();

    const inviteManagerRes = await adminFetch('/api/staff', {
      method: 'POST',
      jwt: ownerAJwt,
      json: { name: 'Floor Manager', email: 'manager@zestro.test', role: 'Manager' },
    });
    assert.equal(inviteManagerRes.status, 201, await inviteManagerRes.clone().text());

    // Seed a read-only viewer in D1 to verify viewer RBAC too
    await d1
      .prepare(
        `INSERT INTO memberships (id, restaurant_id, auth_subject, email, display_name, role, status, job_title)
         VALUES ('mem-viewer-a', ?, 'sub-viewer-a', 'viewer@zestro.test', 'Auditor', 'viewer', 'active', 'Auditor')`
      )
      .bind(TENANT_A_ID)
      .run();

    // Email equality alone must never activate an invitation. The new identity
    // is denied until a separately verified invitation-acceptance step writes
    // its Better Auth user ID to auth_subject and activates the membership.
    const cashierJwt = await signAccessJwt({ email: 'cashier@zestro.test', sub: 'sub-cashier-1' });
    const cashierBeforeAcceptance = await adminFetch('/api/me', { jwt: cashierJwt });
    assert.equal(cashierBeforeAcceptance.status, 403);

    await d1.prepare(
      `UPDATE memberships SET auth_subject = ?, status = 'active' WHERE id = ? AND status = 'invited'`
    ).bind('sub-cashier-1', invitedStaff.id).run();

    const cashierMeRes = await adminFetch('/api/me', { jwt: cashierJwt });
    assert.equal(cashierMeRes.status, 200);
    const cashierMe = await cashierMeRes.json();
    assert.equal(cashierMe.user.role, 'staff');

    const dbCashier = await d1
      .prepare('SELECT status, auth_subject FROM memberships WHERE id = ?')
      .bind(invitedStaff.id)
      .first();
    assert.equal(dbCashier.status, 'active');
    assert.equal(dbCashier.auth_subject, 'sub-cashier-1');

    // RBAC checks:
    // Cashier ('staff') CANNOT create categories or manage staff
    const cashierCreateCat = await adminFetch('/api/categories', {
      method: 'POST',
      jwt: cashierJwt,
      json: { name: 'Forbidden Category', categoryType: 'food' },
    });
    assert.equal(cashierCreateCat.status, 403);

    // Viewer CANNOT mutate settings or orders
    const viewerJwt = await signAccessJwt({ email: 'viewer@zestro.test', sub: 'sub-viewer-a' });
    const viewerMe = await adminFetch('/api/me', { jwt: viewerJwt });
    assert.equal(viewerMe.status, 200);
    const viewerMutateSettings = await adminFetch('/api/settings', {
      method: 'PUT',
      jwt: viewerJwt,
      json: { restaurantName: 'Hacked Name' },
    });
    assert.equal(viewerMutateSettings.status, 403);

    // Manager CANNOT invite/manage staff
    await d1.prepare(
      `UPDATE memberships SET auth_subject = ?, status = 'active' WHERE email = ? AND restaurant_id = ? AND status = 'invited'`
    ).bind('sub-manager-1', 'manager@zestro.test', TENANT_A_ID).run();
    const managerJwt = await signAccessJwt({ email: 'manager@zestro.test', sub: 'sub-manager-1' });
    const managerStaffAttempt = await adminFetch('/api/staff', {
      method: 'POST',
      jwt: managerJwt,
      json: { name: 'Escalation', email: 'hacker@zestro.test', role: 'Owner' },
    });
    assert.equal(managerStaffAttempt.status, 403);

    // Owner CANNOT delete the last active owner
    const deleteLastOwner = await adminFetch('/api/staff/mem-owner-a', {
      method: 'DELETE',
      jwt: ownerAJwt,
    });
    assert.equal(deleteLastOwner.status, 400);
  });

  it('3. Pages /api/* Proxy & Origin Security: forwards Better Auth session cookie and blocks untrusted Origin CSRF', async () => {
    const ownerAJwt = await signAccessJwt({ email: 'owner-a@zestro.test', sub: 'sub-owner-a' });
    const origFetch = globalThis.fetch;
    globalThis.fetch = async (urlOrReq, init) => {
      const upstreamReq = new Request(urlOrReq, init);
      return adminHandler.fetch(upstreamReq, baseEnv);
    };

    try {
      // Untrusted Origin on mutating request -> 403 blocked at Pages proxy edge!
      const evilReq = new Request('https://zestro-admin.pages.dev/api/categories', {
        method: 'POST',
        headers: {
          Origin: 'https://evil-attacker.example',
          Cookie: `better-auth.session_token=sub-owner-a`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'CSRF Category' }),
      });
      const evilRes = await pagesProxyOnRequest({
        request: evilReq,
        env: { ADMIN_API_ORIGIN: 'https://zestro-admin-api.zestro-syl.workers.dev' },
      });
      assert.equal(evilRes.status, 403);

      // Unauthenticated browser request -> 401
      const noCookieReq = new Request('https://zestro-admin.pages.dev/api/me', {
        method: 'GET',
      });
      const noCookieRes = await pagesProxyOnRequest({
        request: noCookieReq,
        env: { ADMIN_API_ORIGIN: 'https://zestro-admin-api.zestro-syl.workers.dev' },
      });
      assert.equal(noCookieRes.status, 401);

      // Legitimate same-origin browser request with Better Auth session cookie -> 200
      const legitReq = new Request('https://zestro-admin.pages.dev/api/me', {
        method: 'GET',
        headers: {
          Origin: 'https://zestro-admin.pages.dev',
          Cookie: `better-auth.session_token=sub-owner-a`,
        },
      });
      const legitRes = await pagesProxyOnRequest({
        request: legitReq,
        env: { ADMIN_API_ORIGIN: 'https://zestro-admin-api.zestro-syl.workers.dev' },
      });
      assert.equal(legitRes.status, 200);
      const meBody = await legitRes.json();
      assert.equal(meBody.restaurant.id, TENANT_A_ID);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('4. Admin CRUD across all modules, R2 Binary Media Upload/Serve, & Multi-Tenant Isolation', async () => {
    const ownerAJwt = await signAccessJwt({ email: 'owner-a@zestro.test', sub: 'sub-owner-a' });
    const ownerBJwt = await signAccessJwt({ email: 'owner-b@bistro.test', sub: 'sub-owner-b' });

    // 4a. Upload binary PNG to R2 via POST /api/media
    const pngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const uploadRes = await adminFetch('/api/media', {
      method: 'POST',
      jwt: ownerAJwt,
      headers: {
        'Content-Type': 'image/png',
        'x-folder': 'dishes',
        'x-title': 'Zestro Signature Burger',
        'x-dimensions': '1200x900',
      },
      body: pngBytes,
    });
    assert.equal(uploadRes.status, 201);
    const uploadedMedia = await uploadRes.json();
    assert.ok(uploadedMedia.id);
    assert.ok(uploadedMedia.key.startsWith(`restaurants/${TENANT_A_ID}/dishes/`));

    // Serve uploaded R2 object via BOTH Admin Worker and Public Customer Worker
    const mediaPath = `/api/media?key=${encodeURIComponent(uploadedMedia.key)}`;
    const adminMediaGet = await adminFetch(mediaPath, { jwt: ownerAJwt });
    assert.equal(adminMediaGet.status, 200);
    assert.equal(adminMediaGet.headers.get('Content-Type'), 'image/png');
    assert.deepEqual(new Uint8Array(await adminMediaGet.arrayBuffer()), pngBytes);

    const publicMediaGet = await publicFetch(mediaPath);
    assert.equal(publicMediaGet.status, 200);
    assert.equal(publicMediaGet.headers.get('Content-Type'), 'image/png');

    // Cross-tenant / foreign key media request -> 404
    const foreignMediaGet = await publicFetch(
      `/api/media?key=${encodeURIComponent(`restaurants/${TENANT_B_ID}/dishes/secret.png`)}`
    );
    assert.equal(foreignMediaGet.status, 404);

    // 4b. Categories CRUD
    const catFoodRes = await adminFetch('/api/categories', {
      method: 'POST',
      jwt: ownerAJwt,
      json: {
        name: 'Signature Burgers',
        description: 'Chargrilled smash & gourmet burgers',
        categoryType: 'food',
        sortOrder: 1,
        active: true,
      },
    });
    assert.equal(catFoodRes.status, 201);
    const catFood = await catFoodRes.json();

    const catBevRes = await adminFetch('/api/categories', {
      method: 'POST',
      jwt: ownerAJwt,
      json: {
        name: 'Specialty Coffee',
        categoryType: 'beverage',
        sortOrder: 2,
        active: true,
      },
    });
    assert.equal(catBevRes.status, 201);
    const catBev = await catBevRes.json();

    // 4c. Menu Items CRUD (with variants, customisationGroups, and R2 image key)
    const customGroup = {
      id: 'grp-toppings',
      name: { en: 'Extra Toppings', bn: 'এক্সট্রা টপিংস', ar: 'إضافات' },
      required: false,
      selectionType: 'multiple',
      maxSelect: 3,
      options: [
        { id: 'opt-cheddar', name: { en: 'Aged Cheddar', bn: 'চেডার', ar: 'شيدر' }, price: 60 },
        { id: 'opt-bacon', name: { en: 'Beef Bacon', bn: 'বিফ বেকন', ar: 'بيكون' }, price: 110 },
      ],
    };

    const burgerRes = await adminFetch('/api/menu', {
      method: 'POST',
      jwt: ownerAJwt,
      json: {
        categoryId: catFood.id,
        name: 'Zestro Truffle Smash Burger',
        description: 'Double smashed beef patty, black truffle aioli, aged cheddar',
        price: 450,
        imageKey: uploadedMedia.key,
        available: true,
        featured: true,
        options: {
          variants: [
            { id: 'var-single', label: 'Single Patty', price: 450 },
            { id: 'var-double', label: 'Double Patty', price: 590 },
          ],
          customisationGroups: [customGroup],
          customisationGroupIds: ['grp-toppings'],
        },
      },
    });
    assert.equal(burgerRes.status, 201);
    const burger = await burgerRes.json();

    const coffeeRes = await adminFetch('/api/menu', {
      method: 'POST',
      jwt: ownerAJwt,
      json: {
        categoryId: catBev.id,
        name: 'Iced Spanish Latte',
        description: 'Double espresso over sweetened condensed milk',
        price: 260,
        imageKey: uploadedMedia.key,
        available: true,
        featured: true,
      },
    });
    assert.equal(coffeeRes.status, 201);
    const coffee = await coffeeRes.json();

    // Update coffee price via PATCH /api/menu/:id -> 280 BDT
    const updateCoffee = await adminFetch(`/api/menu/${coffee.id}`, {
      method: 'PATCH',
      jwt: ownerAJwt,
      json: { price: 280 },
    });
    assert.equal(updateCoffee.status, 200);

    // 4d. Dining Table creation (T-01)
    const tblRes = await adminFetch('/api/tables', {
      method: 'POST',
      jwt: ownerAJwt,
      json: {
        number: 'T-01',
        zone: 'Window Lounge',
        capacity: 4,
        status: 'Available',
      },
    });
    assert.equal(tblRes.status, 201);

    // 4e. Promotion creation
    const promoRes = await adminFetch('/api/promotions', {
      method: 'POST',
      jwt: ownerAJwt,
      json: {
        title: '10% Launch Offer',
        description: 'Save 10% on orders over 500 BDT',
        code: 'ZESTRO10',
        discountType: 'Percentage',
        discountValue: 10,
        minOrder: 500,
        validFrom: '2025-01-01',
        validUntil: '2028-12-31',
        active: true,
      },
    });
    assert.equal(promoRes.status, 201);

    // 4f. Homepage & Gallery persistence
    const hpRes = await adminFetch('/api/homepage', {
      method: 'PUT',
      jwt: ownerAJwt,
      json: {
        heroImageKey: uploadedMedia.key,
        heroHeadline: 'Crafted Burgers. Specialty Espresso.',
        heroSubheadline: 'Freshly prepared in Sylhet.',
        heroCtaText: 'Explore Live Menu',
        promoBannerEnabled: true,
        promoBannerText: 'Use ZESTRO10 for 10% off!',
        promoBannerCode: 'ZESTRO10',
      },
    });
    assert.equal(hpRes.status, 200);

    const galRes = await adminFetch('/api/gallery', {
      method: 'POST',
      jwt: ownerAJwt,
      json: {
        title: 'Main Dining Room',
        caption: 'Warm brass lighting',
        category: 'Dining Room',
        imageKey: uploadedMedia.key,
        featured: true,
      },
    });
    assert.equal(galRes.status, 201);

    // 4g. Tenant Isolation verification: Owner B cannot access or mutate Tenant A resources
    // Spoofed X-Restaurant-Id header without membership on Tenant A -> 403 Forbidden!
    const spoofTenantRes = await adminFetch('/api/categories', {
      jwt: ownerBJwt,
      headers: { 'X-Restaurant-Id': TENANT_A_ID },
    });
    assert.equal(spoofTenantRes.status, 403);

    // Owner B's own tenant sees 0 categories, 0 menu items, 0 media
    const catsB = await (await adminFetch('/api/categories', { jwt: ownerBJwt })).json();
    const menuB = await (await adminFetch('/api/menu', { jwt: ownerBJwt })).json();
    const mediaB = await (await adminFetch('/api/media', { jwt: ownerBJwt })).json();
    assert.equal(catsB.length, 0);
    assert.equal(menuB.length, 0);
    assert.equal(mediaB.length, 0);

    // Owner B attempting to delete Tenant A's burger or media -> 404
    const crossDelBurger = await adminFetch(`/api/menu/${burger.id}`, {
      method: 'DELETE',
      jwt: ownerBJwt,
    });
    assert.equal(crossDelBurger.status, 404);

    const crossDelMedia = await adminFetch(`/api/media/${uploadedMedia.id}`, {
      method: 'DELETE',
      jwt: ownerBJwt,
    });
    assert.equal(crossDelMedia.status, 404);
  });

  it('5. Customer Catalog, Table QR Verify, Waiter Call, Price Validation, Idempotency & Live Order Sync', async () => {
    const ownerAJwt = await signAccessJwt({ email: 'owner-a@zestro.test', sub: 'sub-owner-a' });
    const cashierJwt = await signAccessJwt({ email: 'cashier@zestro.test', sub: 'sub-cashier-1' });

    // 5a. Customer GET /api/catalog returns live Admin data (updated coffee price 280, homepage, gallery, R2 URLs)
    const catRes = await publicFetch('/api/catalog');
    assert.equal(catRes.status, 200);
    const catalog = await catRes.json();
    assert.equal(catalog.categories.length, 2);
    assert.equal(catalog.products.length, 2);
    assert.equal(catalog.promotions.length, 1);
    assert.equal(catalog.gallery.length, 1);
    assert.equal(catalog.homepage.promoBannerCode, 'ZESTRO10');

    const burger = catalog.products.find((p) => p.name.en === 'Zestro Truffle Smash Burger');
    const coffee = catalog.products.find((p) => p.name.en === 'Iced Spanish Latte');
    assert.ok(burger);
    assert.equal(coffee.price, 280);
    assert.ok(burger.image.startsWith('https://zestro-customer-api.zestro-syl.workers.dev/api/media?key='));

    // 5b. Table QR Verification works with "01", "T-01", and rejects unknown table "T-99"
    const verifyRes = await publicFetch('/api/tables/verify', {
      method: 'POST',
      json: { tableNumber: 'T-01' },
    });
    assert.equal(verifyRes.status, 200);
    const verifiedTable = await verifyRes.json();
    assert.equal(verifiedTable.tableCode, 'T-01');
    assert.ok(verifiedTable.tableId);

    const invalidTableRes = await publicFetch('/api/tables/verify', {
      method: 'POST',
      json: { tableNumber: 'T-99' },
    });
    assert.equal(invalidTableRes.status, 404);

    // 5c. Waiter Call submission + 45s cooldown + Admin acknowledge & resolve
    const waiterRes1 = await publicFetch('/api/waiter-calls', {
      method: 'POST',
      json: { tableId: verifiedTable.tableId, requestType: 'Bill Request' },
    });
    assert.equal(waiterRes1.status, 201);
    const waiterData1 = await waiterRes1.json();
    assert.equal(waiterData1.ok, true);

    // Immediate duplicate waiter call within cooldown -> 429
    const waiterResCooldown = await publicFetch('/api/waiter-calls', {
      method: 'POST',
      json: { tableNumber: 'T-01', requestType: 'Need Napkins' },
    });
    assert.equal(waiterResCooldown.status, 429);

    // Staff acknowledges then resolves waiter call in Admin
    const ackRes = await adminFetch(`/api/waiter-calls/${waiterData1.id}`, {
      method: 'PATCH',
      jwt: cashierJwt,
      json: { status: 'acknowledged' },
    });
    assert.equal(ackRes.status, 200, await ackRes.clone().text());

    const resolveRes = await adminFetch(`/api/waiter-calls/${waiterData1.id}`, {
      method: 'PATCH',
      jwt: cashierJwt,
      json: { status: 'resolved' },
    });
    assert.equal(resolveRes.status, 200);

    // 5d. Server-Side Price Validation & Tampering Defense + Promo + Tax + Service Charge + Idempotency
    // Client attempts to tamper unitPrice: 1 — server MUST ignore client price and charge:
    // 1x Double Patty Burger (590) + Aged Cheddar (60) = 650
    // 1x Iced Spanish Latte (280) = 280
    // Subtotal = 930 BDT
    // Promo ZESTRO10 (10%) = 93 BDT
    // Discounted Subtotal = 837 BDT
    // Tax (5% of 837) = 41.85 BDT
    // Dine-In Service Charge (10% of 837) = 83.70 BDT
    // Exact Server Total = 837 + 41.85 + 83.70 = 962.55 BDT
    const idempKey = 'test-idemp-order-001';
    const orderPayload = {
      orderType: 'dine_in',
      customerName: 'Rahim Ahmed',
      customerPhone: '+8801712345678',
      tableId: verifiedTable.tableId,
      tableNumber: verifiedTable.tableNumber,
      promoCode: 'ZESTRO10',
      notes: 'Medium well please',
      items: [
        {
          productId: burger.id,
          variantId: 'var-double',
          unitPrice: 1, // TAMPERED CLIENT PRICE — must be ignored!
          quantity: 1,
          customisations: [
            {
              groupId: 'grp-toppings',
              optionId: 'opt-cheddar',
              price: 0, // TAMPERED ADD-ON PRICE — must be ignored!
            },
          ],
        },
        {
          productId: coffee.id,
          unitPrice: 1, // TAMPERED CLIENT PRICE — must be ignored!
          quantity: 1,
          customisations: [],
        },
      ],
    };

    const orderRes1 = await publicFetch('/api/orders/prepare', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempKey },
      json: orderPayload,
    });
    assert.equal(orderRes1.status, 201);
    const order1 = await orderRes1.json();
    assert.equal(order1.subtotal, 930);
    assert.equal(order1.discountAmount, 93);
    assert.equal(order1.taxAmount, 41.85);
    assert.equal(order1.serviceCharge, 83.7);
    assert.equal(order1.total, 962.55);
    assert.ok(order1.orderRef.startsWith('ZST-'));

    // Duplicate submission with same Idempotency-Key returns same order without double-inserting!
    const orderRes2 = await publicFetch('/api/orders/prepare', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempKey },
      json: orderPayload,
    });
    assert.equal(orderRes2.status, 200);
    const order2 = await orderRes2.json();
    assert.equal(order2.orderId, order1.orderId);
    assert.equal(order2.orderRef, order1.orderRef);

    // 5e. Order appears in Admin & status syncs back to Customer /api/orders/status!
    const adminOrdersRes = await adminFetch('/api/orders', { jwt: ownerAJwt });
    assert.equal(adminOrdersRes.status, 200);
    const adminOrders = await adminOrdersRes.json();
    assert.equal(adminOrders.length, 1);
    assert.equal(adminOrders[0].orderNumber, order1.orderRef);
    assert.equal(adminOrders[0].total, 962.55);
    assert.equal(adminOrders[0].status, 'Pending');

    // Cashier updates order status -> 'Preparing' -> 'Served'
    const prepPatch = await adminFetch(`/api/orders/${order1.orderId}`, {
      method: 'PATCH',
      jwt: cashierJwt,
      json: { status: 'Preparing' },
    });
    assert.equal(prepPatch.status, 200);

    const custStatus1 = await publicFetch('/api/orders/status', {
      method: 'POST',
      json: { orderRefs: [order1.orderRef] },
    });
    assert.equal(custStatus1.status, 200);
    assert.equal((await custStatus1.json()).orders[0].status, 'preparing');

    const servedPatch = await adminFetch(`/api/orders/${order1.orderId}`, {
      method: 'PATCH',
      jwt: cashierJwt,
      json: { status: 'Served' },
    });
    assert.equal(servedPatch.status, 200);

    const custStatus2 = await publicFetch('/api/orders/status', {
      method: 'POST',
      json: { orderIds: [order1.orderId] },
    });
    assert.equal((await custStatus2.json()).orders[0].status, 'completed');

    // 5f. Sold-out item enforcement: Admin marks coffee unavailable -> Customer checkout rejects (409)
    const soldOutPatch = await adminFetch(`/api/menu/${coffee.id}`, {
      method: 'PATCH',
      jwt: ownerAJwt,
      json: { available: false },
    });
    assert.equal(soldOutPatch.status, 200);

    const rejectedSoldOutOrder = await publicFetch('/api/orders/prepare', {
      method: 'POST',
      json: {
        orderType: 'takeaway',
        customerName: 'Test Guest',
        customerPhone: '01712345678',
        items: [{ productId: coffee.id, quantity: 1 }],
      },
    });
    assert.equal(rejectedSoldOutOrder.status, 409);
    const rejectedBody = await rejectedSoldOutOrder.json();
    assert.match(rejectedBody.error, /sold out/i);

    // 5g. R2 Media deletion removes both D1 row and R2 binary object
    const mediaList = await (await adminFetch('/api/media', { jwt: ownerAJwt })).json();
    assert.equal(mediaList.length, 1);
    const mediaId = mediaList[0].id;
    const mediaKey = mediaList[0].key;

    const delMediaRes = await adminFetch(`/api/media/${mediaId}`, {
      method: 'DELETE',
      jwt: ownerAJwt,
    });
    assert.equal(delMediaRes.status, 200);

    const getDeletedMedia = await publicFetch(`/api/media?key=${encodeURIComponent(mediaKey)}`);
    assert.equal(getDeletedMedia.status, 404);
  });
});
