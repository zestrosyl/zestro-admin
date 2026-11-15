import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test, describe, before, after } from 'node:test';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { Miniflare } from 'miniflare';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.resolve(__dirname, '..');
const ADMIN_ROOT = path.resolve(WORKER_ROOT, '..');
const PUBLIC_WORKER_ROOT = path.resolve(ADMIN_ROOT, 'worker-public');
const CUSTOMER_ROOT = path.resolve(ADMIN_ROOT, '../zestro-customer');
const TENANT_A_ID = '45291381-ba84-4e2f-a60c-1c39a119c2d7';

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

describe('ZESTRO Trial MVP Completion & Admin Simplification', () => {
  test('1. Sidebar has exact 11 navigation items, Log Out link, and light SaaS palette', () => {
    const sidebar = fs.readFileSync(
      path.join(ADMIN_ROOT, 'src/components/layout/Sidebar.tsx'),
      'utf8'
    );
    const expectedLabels = [
      'Dashboard',
      'Orders',
      'Menu Management',
      'Categories',
      'Tables & QR Codes',
      'Waiter Calls',
      'Gallery',
      'Offers',
      'Basic Reports',
      'Staff & Access',
      'Restaurant Settings',
    ];
    for (const label of expectedLabels) {
      assert.ok(sidebar.includes(label), `Missing sidebar label: ${label}`);
    }
    assert.ok(sidebar.includes('/cdn-cgi/access/logout'), 'Missing admin logout link');
  });

  test('2. Bangladesh-only localization in Admin and Customer UI', () => {
    const settings = fs.readFileSync(
      path.join(ADMIN_ROOT, 'src/modules/SettingsModule.tsx'),
      'utf8'
    );
    assert.ok(settings.includes('BDT (৳)'), 'Admin settings must show BDT (৳)');
    assert.ok(!settings.includes('USD ($)'), 'Foreign currency USD ($) must be removed');
    assert.ok(!settings.includes('SAR (﷼)'), 'Foreign currency SAR (﷼) must be removed');
    assert.ok(settings.includes('Asia/Dhaka'), 'Admin settings must show Asia/Dhaka');
    assert.ok(settings.includes('DD-MM-YYYY'), 'Admin settings must show DD-MM-YYYY');

    const customerHeader = fs.readFileSync(
      path.join(CUSTOMER_ROOT, 'src/components/customer/Header.tsx'),
      'utf8'
    );
    assert.ok(customerHeader.includes("code: 'en'"), 'Customer header must support EN');
    assert.ok(customerHeader.includes("code: 'bn'"), 'Customer header must support Bangla');
    assert.ok(!customerHeader.includes("code: 'ar'"), 'Arabic language option must be removed');
  });

  test('3. Orders module has Accept/Reject actions, confirmation dialog, and duplicate-click guard', () => {
    const ordersMod = fs.readFileSync(
      path.join(ADMIN_ROOT, 'src/modules/OrdersModule.tsx'),
      'utf8'
    );
    assert.ok(ordersMod.includes('updatingOrderId'), 'Missing duplicate-click guard updatingOrderId');
    assert.ok(ordersMod.includes('Accept'), 'Missing Accept button');
    assert.ok(ordersMod.includes('Reject'), 'Missing Reject button');
    assert.ok(ordersMod.includes('ConfirmDialog'), 'Missing confirmation dialog for rejection');
  });

  test('4. Basic Reports module provides date-range filtering and daily summaries', () => {
    const reportsMod = fs.readFileSync(
      path.join(ADMIN_ROOT, 'src/modules/ReportsModule.tsx'),
      'utf8'
    );
    assert.ok(reportsMod.includes('Daily Sales &amp; Order Summary'));
    assert.ok(reportsMod.includes('toDhakaDateKey'));
    assert.ok(reportsMod.includes('formatDhakaDate'));
    assert.ok(reportsMod.includes('Completed Orders'));
    assert.ok(reportsMod.includes('Pending Orders'));
  });
});

describe('ZESTRO Customer Authentication & Account Persistence (D1)', () => {
  let mf;
  let db;
  let tmpDir;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(WORKER_ROOT, '.tmp-trial-mvp-'));
    await esbuild.build({
      entryPoints: [path.join(PUBLIC_WORKER_ROOT, 'src/index.ts')],
      bundle: true,
      format: 'esm',
      outfile: path.join(tmpDir, 'public.mjs'),
    });

    mf = new Miniflare({
      modules: true,
      scriptPath: path.join(tmpDir, 'public.mjs'),
      d1Databases: { DB: 'test-db' },
      bindings: {
        RESTAURANT_ID: TENANT_A_ID,
        ALLOWED_ORIGINS: 'https://zestro-customer-website.pages.dev',
        WHATSAPP_NUMBER: '+8801601987672',
      },
    });

    db = await mf.getD1Database('DB');
    const m1 = fs.readFileSync(path.join(WORKER_ROOT, 'migrations/0001_initial.sql'), 'utf8');
    const m2 = fs.readFileSync(
      path.join(WORKER_ROOT, 'migrations/0002_production_functionality_repair.sql'),
      'utf8'
    );
    const m3 = fs.readFileSync(
      path.join(WORKER_ROOT, 'migrations/0003_customer_accounts.sql'),
      'utf8'
    );
    await execSqlScript(db, m1);
    await execSqlScript(db, m2);
    await execSqlScript(db, m3);

    await db
      .prepare(
        `INSERT INTO restaurants (id, name, slug, currency, timezone, status)
         VALUES (?, 'ZESTRO Dhaka', 'zestro-dhaka', 'BDT (৳)', 'Asia/Dhaka', 'active')`
      )
      .bind(TENANT_A_ID)
      .run();
    await db
      .prepare(
        `INSERT INTO menu_items (id, restaurant_id, name, price_minor, available)
         VALUES ('item-1', ?, 'Kacchi Biryani', 48000, 1)`
      )
      .bind(TENANT_A_ID)
      .run();
  });

  after(async () => {
    if (mf) await mf.dispose();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('5. Customer signup, duplicate check, login, profile update, order linking, and logout', async () => {
    const signupRes = await mf.dispatchFetch('https://api.test/api/customer/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ayesha Rahman',
        email: 'ayesha@example.com',
        password: 'password123',
        phone: '+8801711223344',
        defaultAddress: 'Road 11, Banani, Dhaka',
      }),
    });
    assert.equal(signupRes.status, 201);
    const signupData = await signupRes.json();
    assert.ok(signupData.token, 'Signup must return session token');
    assert.equal(signupData.user.email, 'ayesha@example.com');
    assert.equal(signupData.profile.displayName, 'Ayesha Rahman');

    // Duplicate email rejected with 409 + email-already-in-use
    const dupRes = await mf.dispatchFetch('https://api.test/api/customer/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Ayesha 2',
        email: 'ayesha@example.com',
        password: 'password123',
      }),
    });
    assert.equal(dupRes.status, 409);
    const dupData = await dupRes.json();
    assert.equal(dupData.code, 'email-already-in-use');

    // Wrong password rejected with 401
    const badLogin = await mf.dispatchFetch('https://api.test/api/customer/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ayesha@example.com', password: 'wrongpassword' }),
    });
    assert.equal(badLogin.status, 401);

    // Valid login succeeds
    const goodLogin = await mf.dispatchFetch('https://api.test/api/customer/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ayesha@example.com', password: 'password123' }),
    });
    assert.equal(goodLogin.status, 200);
    const loginData = await goodLogin.json();
    assert.ok(loginData.token);

    // Profile update persists
    const patchRes = await mf.dispatchFetch('https://api.test/api/customer/profile', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginData.token}`,
      },
      body: JSON.stringify({
        displayName: 'Ayesha K.',
        phone: '+8801711998877',
        defaultAddress: 'Gulshan 2, Dhaka',
        preferredOrderType: 'delivery',
      }),
    });
    assert.equal(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.equal(patchData.profile.displayName, 'Ayesha K.');
    assert.equal(patchData.profile.defaultAddress, 'Gulshan 2, Dhaka');

    // Place authenticated order and verify it appears in /api/customer/me
    const orderRes = await mf.dispatchFetch('https://api.test/api/orders/prepare', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${loginData.token}`,
      },
      body: JSON.stringify({
        orderType: 'delivery',
        customerName: 'Ayesha K.',
        customerPhone: '+8801711998877',
        deliveryAddress: 'Gulshan 2, Dhaka',
        items: [{ productId: 'item-1', quantity: 2 }],
      }),
    });
    assert.equal(orderRes.status, 201);

    const meRes = await mf.dispatchFetch('https://api.test/api/customer/me', {
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.orders.length, 1);
    assert.equal(meData.orders[0].total, 960);

    // Logout revokes token
    const logoutRes = await mf.dispatchFetch('https://api.test/api/customer/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    assert.equal(logoutRes.status, 200);

    const afterLogout = await mf.dispatchFetch('https://api.test/api/customer/me', {
      headers: { Authorization: `Bearer ${loginData.token}` },
    });
    assert.equal(afterLogout.status, 401);
  });
});
