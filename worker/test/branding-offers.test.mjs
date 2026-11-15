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

describe('ZESTRO Admin Cleanup, Restaurant Branding & Homepage Offers', () => {
  let mf;
  let d1;
  let r2;
  let adminMod;
  let adminHandler;
  let publicWorker;
  let privateKey;
  let baseEnv;

  async function signAccessJwt({ email, sub, aud = ACCESS_AUD }) {
    return new SignJWT({ email })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key-1' })
      .setSubject(sub)
      .setIssuer(TEAM_DOMAIN)
      .setAudience([aud])
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
  }

  before(async () => {
    const outAdmin = path.join('/tmp', 'zestro-admin-branding-test.mjs');
    const outPublic = path.join('/tmp', 'zestro-public-branding-test.mjs');

    await esbuild.build({
      entryPoints: [path.join(WORKER_ROOT, 'src/index.ts')],
      bundle: true,
      format: 'esm',
      outfile: outAdmin,
      platform: 'neutral',
      mainFields: ['module', 'main'],
      conditions: ['worker', 'browser', 'import'],
      target: 'es2022',
    });

    await esbuild.build({
      entryPoints: [path.join(PUBLIC_WORKER_ROOT, 'src/index.ts')],
      bundle: true,
      format: 'esm',
      outfile: outPublic,
      platform: 'neutral',
      mainFields: ['module', 'main'],
      conditions: ['worker', 'browser', 'import'],
      target: 'es2022',
    });

    adminMod = await import(outAdmin);
    publicWorker = (await import(outPublic)).default;

    const kp = await generateKeyPair('RS256');
    privateKey = kp.privateKey;
    const jwk = await exportJWK(kp.publicKey);
    jwk.kid = 'test-key-1';
    jwk.alg = 'RS256';
    jwk.use = 'sig';

    mf = new Miniflare({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } };',
      d1Databases: ['DB'],
      r2Buckets: ['MEDIA'],
    });
    d1 = await mf.getD1Database('DB');
    r2 = await mf.getR2Bucket('MEDIA');

    await execSqlScript(
      d1,
      fs.readFileSync(path.join(WORKER_ROOT, 'migrations/0001_initial.sql'), 'utf8')
    );
    await execSqlScript(
      d1,
      fs.readFileSync(path.join(WORKER_ROOT, 'migrations/0002_production_functionality_repair.sql'), 'utf8')
    );

    // Seed tenant A owner + tenant B
    await d1
      .prepare(`INSERT INTO restaurants (id, slug, name, currency, timezone, status) VALUES (?, 'zestro', 'Zestro', 'BDT', 'Asia/Dhaka', 'active')`)
      .bind(TENANT_A_ID)
      .run();
    await d1
      .prepare(`INSERT INTO restaurants (id, slug, name, currency, timezone, status) VALUES (?, 'other', 'Other', 'BDT', 'Asia/Dhaka', 'active')`)
      .bind(TENANT_B_ID)
      .run();
    await d1
      .prepare(
        `INSERT OR IGNORE INTO memberships (id, restaurant_id, auth_subject, email, display_name, role, status)
         VALUES ('mem-owner', ?, 'sub-owner', 'owner@zestro.test', 'Owner', 'owner', 'active')`
      )
      .bind(TENANT_A_ID)
      .run();


    baseEnv = {
      DB: d1,
      MEDIA: r2,
      RESTAURANT_ID: TENANT_A_ID,
      ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
      ACCESS_AUD,
      ALLOWED_ORIGINS: 'https://zestro-admin.pages.dev,https://zestro-customer-website.pages.dev',
    };
    const localJwks = createLocalJWKSet({ keys: [jwk] });
    adminHandler = adminMod.createAdminHandler({
      sessionResolver: async (req, env) => {
        let subject = '';
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
        const member = await env.DB.prepare(
          `SELECT m.id, m.restaurant_id, m.auth_subject, m.email, m.display_name, m.role,
             COALESCE(m.job_title, '') AS job_title, r.name AS restaurant_name,
             r.slug AS restaurant_slug, r.currency AS restaurant_currency,
             r.timezone AS restaurant_timezone, r.status AS restaurant_status
           FROM memberships m JOIN restaurants r ON r.id = m.restaurant_id
           WHERE m.auth_subject = ? AND m.status = 'active' AND r.status = 'active'
           LIMIT 1`
        ).bind(subject).first();
        return member
          ? { kind: 'ok', member }
          : { kind: 'forbidden', message: 'No active restaurant membership is linked to this user' };
      },
    });
  });

  after(async () => {
    if (mf) await mf.dispose();
  });

  it('1. Technical UI strings and infrastructure fields are removed from Admin source', () => {
    const overview = fs.readFileSync(path.join(REPO_ROOT, 'src/modules/OverviewModule.tsx'), 'utf8');
    const sidebar = fs.readFileSync(path.join(REPO_ROOT, 'src/components/layout/Sidebar.tsx'), 'utf8');
    const settings = fs.readFileSync(path.join(REPO_ROOT, 'src/modules/SettingsModule.tsx'), 'utf8');

    assert.equal(overview.includes('Live database'), false);
    assert.equal(overview.includes('Cloudflare D1'), false);

    assert.equal(sidebar.includes('LIVE CLOUD'), false);
    assert.equal(sidebar.includes('Verifying Cloudflare Access'), false);

    assert.equal(settings.includes('Cloudflare Backend Status'), false);
    assert.equal(settings.includes('Connected · D1 + R2'), false);
    assert.equal(settings.includes('workerApiBaseUrl'), false);
    assert.equal(settings.includes('r2PublicBucketUrl'), false);
  });

  it('2. Logo upload validates file types/SVG safety, persists in R2+D1, and serves via public catalog', async () => {
    const ownerJwt = await signAccessJwt({ email: 'owner@zestro.test', sub: 'sub-owner' });
    const adminFetch = (pathUrl, init = {}) =>
      adminHandler.fetch(
        new Request(`https://zestro-admin-api.zestro-syl.workers.dev${pathUrl}`, {
          ...init,
          headers: {
            'Cf-Access-Jwt-Assertion': ownerJwt,
            ...(init.headers || {}),
          },
        }),
        baseEnv
      );

    // Unauthenticated blocked
    const unauth = await adminHandler.fetch(
      new Request('https://zestro-admin-api.zestro-syl.workers.dev/api/media', {
        method: 'POST',
        headers: { 'Content-Type': 'image/png' },
        body: new Uint8Array([1, 2, 3]),
      }),
      baseEnv
    );
    assert.equal(unauth.status, 401);

    // Unsupported MIME rejected
    const badMime = await adminFetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/pdf', 'x-folder': 'branding' },
      body: new Uint8Array([1, 2, 3]),
    });
    assert.equal(badMime.status, 400);

    // Malicious SVG rejected
    const badSvg = await adminFetch('/api/media', {
      method: 'POST',
      headers: { 'Content-Type': 'image/svg+xml', 'x-folder': 'branding' },
      body: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    });
    assert.equal(badSvg.status, 400);

    // Valid SVG accepted
    const goodSvgRes = await adminFetch('/api/media', {
      method: 'POST',
      headers: {
        'Content-Type': 'image/svg+xml',
        'x-folder': 'branding',
        'x-file-name': 'zestro-logo.svg',
      },
      body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#D7A65A"/></svg>',
    });
    assert.equal(goodSvgRes.status, 201);
    const asset = await goodSvgRes.json();
    assert.ok(asset.r2Key.startsWith(`restaurants/${TENANT_A_ID}/branding/`));

    // Save logo in settings (also check cross-tenant key injection is ignored)
    const badSettings = await adminFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantName: 'Zestro',
        logoKey: `restaurants/${TENANT_B_ID}/branding/evil.png`,
        logoUrl: `/api/media?key=restaurants/${TENANT_B_ID}/branding/evil.png`,
      }),
    });
    assert.equal(badSettings.status, 200);
    const badSettingsData = await badSettings.json();
    assert.equal(badSettingsData.logoKey, '');

    const saveSettings = await adminFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        restaurantName: 'Zestro',
        logoKey: asset.r2Key,
        logoUrl: asset.url,
      }),
    });
    assert.equal(saveSettings.status, 200);
    const savedSettings = await saveSettings.json();
    assert.equal(savedSettings.logoKey, asset.r2Key);

    // Public catalog includes logoUrl and public media serves SVG with sandbox CSP
    const catRes = await publicWorker.fetch(
      new Request('https://zestro-customer-api.zestro-syl.workers.dev/api/catalog'),
      baseEnv
    );
    assert.equal(catRes.status, 200);
    const catalog = await catRes.json();
    assert.ok(catalog.settings.logoUrl.includes(encodeURIComponent(asset.r2Key)));

    const mediaRes = await publicWorker.fetch(new Request(catalog.settings.logoUrl), baseEnv);
    assert.equal(mediaRes.status, 200);
    assert.equal(mediaRes.headers.get('content-type'), 'image/svg+xml');
    assert.ok(mediaRes.headers.get('content-security-policy')?.includes('sandbox'));

    // Remove logo
    await adminFetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantName: 'Zestro', logoKey: '', logoUrl: '' }),
    });
    const catAfterRemove = await (
      await publicWorker.fetch(
        new Request('https://zestro-customer-api.zestro-syl.workers.dev/api/catalog'),
        baseEnv
      )
    ).json();
    assert.equal(catAfterRemove.settings.logoUrl, undefined);
  });

  it('3. Homepage Offers CRUD, date filtering, and checkout discount isolation', async () => {
    const ownerJwt = await signAccessJwt({ email: 'owner@zestro.test', sub: 'sub-owner' });
    const adminFetch = (pathUrl, init = {}) =>
      adminHandler.fetch(
        new Request(`https://zestro-admin-api.zestro-syl.workers.dev${pathUrl}`, {
          ...init,
          headers: {
            'Cf-Access-Jwt-Assertion': ownerJwt,
            ...(init.headers || {}),
          },
        }),
        baseEnv
      );

    // Invalid date range rejected
    const badDates = await adminFetch('/api/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Bad Range',
        validFrom: '2026-12-10',
        validUntil: '2026-12-01',
      }),
    });
    assert.equal(badDates.status, 400);

    const today = new Date().toISOString().slice(0, 10);

    // 1) Display-only homepage offer (no promo code)
    const offer1Res = await adminFetch('/api/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Chef Tasting Weekend',
        description: 'Complimentary dessert with every sharing platter',
        discountText: 'FREE DESSERT',
        code: '',
        validFrom: today,
        validUntil: '2027-12-31',
        active: true,
      }),
    });
    assert.equal(offer1Res.status, 201);
    const offer1 = await offer1Res.json();
    assert.equal(offer1.code, '');
    assert.equal(offer1.hasPromoCode, false);
    assert.equal(offer1.discountText, 'FREE DESSERT');

    // 2) Active offer WITH checkout promo code
    const offer2Res = await adminFetch('/api/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Winter Feast',
        description: 'Save 20% on online orders',
        discountText: '20% OFF',
        code: 'WINTER20',
        discountType: 'Percentage',
        discountValue: 20,
        validFrom: today,
        validUntil: '2027-12-31',
        active: true,
      }),
    });
    assert.equal(offer2Res.status, 201);

    // 3) Expired offer (must NOT appear on customer website)
    await adminFetch('/api/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Expired Offer',
        discountText: '50% OFF',
        validFrom: '2020-01-01',
        validUntil: '2020-01-10',
        active: true,
      }),
    });

    // 4) Paused offer (must NOT appear on customer website)
    await adminFetch('/api/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Paused Offer',
        discountText: '10% OFF',
        validFrom: today,
        validUntil: '2027-12-31',
        active: false,
      }),
    });

    // Public catalog returns only 2 active valid offers, and only 1 checkout promo code
    const catalog = await (
      await publicWorker.fetch(
        new Request('https://zestro-customer-api.zestro-syl.workers.dev/api/catalog'),
        baseEnv
      )
    ).json();

    assert.equal(catalog.offers.length, 2);
    assert.equal(
      catalog.offers.some((o) => o.title === 'Expired Offer' || o.title === 'Paused Offer'),
      false
    );
    const displayOffer = catalog.offers.find((o) => o.title === 'Chef Tasting Weekend');
    assert.equal(displayOffer.code, '');
    assert.equal(displayOffer.discountText, 'FREE DESSERT');

    assert.equal(catalog.promotions.length, 1);
    assert.equal(catalog.promotions[0].code, 'WINTER20');

    // Checkout rejects internal __OFFER_ sentinel codes
    const badOrder = await publicWorker.fetch(
      new Request('https://zestro-customer-api.zestro-syl.workers.dev/api/orders/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderType: 'delivery',
          customerName: 'Guest',
          customerPhone: '01700000000',
          promoCode: '__OFFER_1234',
          items: [{ productId: 'nonexistent-item', quantity: 1 }],
        }),
      }),
      baseEnv
    );
    assert.equal(badOrder.status, 400);

    // Edit & Delete offer reflect immediately
    await adminFetch(`/api/promotions/${offer1.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: false }),
    });
    const catalogAfterPause = await (
      await publicWorker.fetch(
        new Request('https://zestro-customer-api.zestro-syl.workers.dev/api/catalog'),
        baseEnv
      )
    ).json();
    assert.equal(catalogAfterPause.offers.length, 1);

    await adminFetch(`/api/promotions/${offer1.id}`, { method: 'DELETE' });
  });
});
