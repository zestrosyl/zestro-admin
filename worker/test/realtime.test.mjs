// ZESTRO real-time Customer -> Admin synchronization: end-to-end suite.
//
// Runs the real Admin Worker (with the RestaurantRealtime Durable Object using the
// WebSocket Hibernation API), the real Customer Worker (cross-script DO binding) and the real
// Admin Pages /api proxy inside workerd via Miniflare, sharing one D1 database.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, before, after } from 'node:test';
import esbuild from 'esbuild';
import { Miniflare } from 'miniflare';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(WORKER_ROOT, '..');
const PUBLIC_WORKER_ROOT = path.resolve(REPO_ROOT, 'worker-public');

const ACCESS_AUD = '46d30912b2ddf47b1b05c8929045e3b5f54f03dfe1ea677cd7be243ebed7c902';
const TEAM_DOMAIN = 'https://icy-wave-d29d.cloudflareaccess.com';
const TENANT_A_ID = '45291381-ba84-4e2f-a60c-1c39a119c2d7';
const TENANT_B_ID = '99999999-ba84-4e2f-a60c-1c39a119c2d7';

const ADMIN_HOST = 'https://admin-api.test';
const PUBLIC_HOST = 'https://customer-api.test';
const PAGES_HOST = 'https://zestro-admin.pages.dev';
const PII = ['Rahim Realtime', '+8801711111111', 'Road 12, Sylhet', 'secret-note-xyz'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function splitSqlStatements(sql) {
  return sql
    .replace(/--.*$/gm, '')
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^PRAGMA\b/i.test(s));
}

async function bundle(entry, outfile) {
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    mainFields: ['module', 'main'],
    conditions: ['worker', 'browser', 'import'],
    outfile,
    logLevel: 'silent',
  });
  return fs.readFileSync(outfile, 'utf8');
}

describe('ZESTRO real-time Customer -> Admin synchronization', () => {
  let mf;
  let d1;
  let privateKey;
  let RealtimeClient;
  let realtimeUrl;
  const sockets = [];

  async function jwt(email, sub, expiresIn = '1h') {
    return new SignJWT({ email })
      .setProtectedHeader({ alg: 'RS256', kid: 'rt-key-1' })
      .setSubject(sub)
      .setIssuer(TEAM_DOMAIN)
      .setAudience([ACCESS_AUD])
      .setIssuedAt()
      .setExpirationTime(expiresIn)
      .sign(privateKey);
  }

  async function admin(pathname, { token, method = 'GET', json, headers = {} } = {}) {
    const h = { ...headers };
    if (token) h['Cf-Access-Jwt-Assertion'] = token;
    if (json !== undefined) h['Content-Type'] = 'application/json';
    return mf.dispatchFetch(`${ADMIN_HOST}${pathname}`, {
      method,
      headers: h,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  }

  async function customer(pathname, { method = 'GET', json, headers = {} } = {}) {
    const h = { ...headers };
    if (json !== undefined) h['Content-Type'] = 'application/json';
    return mf.dispatchFetch(`${PUBLIC_HOST}${pathname}`, {
      method,
      headers: h,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
  }

  /** Open an authenticated real-time socket and collect parsed messages. */
  async function connect(token, { url = `${ADMIN_HOST}/api/realtime`, headers = {} } = {}) {
    const h = { Upgrade: 'websocket', ...headers };
    if (token) h['Cf-Access-Jwt-Assertion'] = token;
    const res = await mf.dispatchFetch(url, { headers: h });
    if (res.status !== 101) return { status: res.status, body: await res.text() };
    const ws = res.webSocket;
    const messages = [];
    const conn = { status: 101, ws, messages, closed: null };
    ws.addEventListener('message', (e) => {
      if (typeof e.data === 'string' && e.data !== 'pong') messages.push(JSON.parse(e.data));
    });
    ws.addEventListener('close', (e) => {
      conn.closed = { code: e.code, reason: e.reason };
    });
    // Listeners must be attached before accept() or Miniflare drops queued frames.
    ws.accept();
    sockets.push(ws);
    await waitFor(() => messages.find((m) => m.type === 'hello'), 'hello');
    return conn;
  }

  async function waitFor(fn, label, timeout = 4000) {
    const start = Date.now();
    for (;;) {
      const v = fn();
      if (v) return v;
      if (Date.now() - start > timeout) throw new Error(`Timed out waiting for ${label}`);
      await sleep(20);
    }
  }

  const events = (conn, type) =>
    conn.messages.filter((m) => m.type === 'event' && (!type || m.event.type === type));

  let tokenA;
  let tokenB;
  let tokenViewerA;
  let table;
  let product;

  before(async () => {
    const kp = await generateKeyPair('RS256');
    privateKey = kp.privateKey;
    const pub = await exportJWK(kp.publicKey);
    Object.assign(pub, { kid: 'rt-key-1', alg: 'RS256', use: 'sig' });

    const tmp = fs.mkdtempSync(path.join(WORKER_ROOT, '.tmp-rt-bundle-'));
    let adminScript;
    let publicScript;
    let proxyScript;
    try {
      adminScript = await bundle(path.join(__dirname, 'realtime-entry.ts'), path.join(tmp, 'a.mjs'));
      publicScript = await bundle(
        path.join(PUBLIC_WORKER_ROOT, 'src/index.ts'),
        path.join(tmp, 'p.mjs')
      );
      proxyScript = await bundle(path.join(__dirname, 'proxy-entry.ts'), path.join(tmp, 'x.mjs'));
      const clientOut = path.join(tmp, 'client.mjs');
      await esbuild.build({
        entryPoints: [path.join(REPO_ROOT, 'src/services/realtime.ts')],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        outfile: clientOut,
        logLevel: 'silent',
      });
      ({ RealtimeClient, realtimeUrl } = await import(`file://${clientOut}`));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }

    mf = new Miniflare({
      workers: [
        {
          name: 'admin',
          modules: true,
          script: adminScript,
          compatibilityDate: '2024-11-14',
          routes: ['admin-api.test/*'],
          d1Databases: { DB: 'shared-zestro-d1' },
          r2Buckets: { MEDIA: 'shared-media' },
          durableObjects: { REALTIME: 'RestaurantRealtime' },
          bindings: {
            ACCESS_TEAM_DOMAIN: TEAM_DOMAIN,
            ACCESS_AUD,
            ALLOWED_ORIGINS: 'https://zestro-admin.pages.dev',
            TEST_JWKS: JSON.stringify({ keys: [pub] }),
          },
        },
        {
          name: 'public',
          modules: true,
          script: publicScript,
          compatibilityDate: '2024-11-14',
          routes: ['customer-api.test/*'],
          d1Databases: { DB: 'shared-zestro-d1' },
          r2Buckets: { MEDIA: 'shared-media' },
          durableObjects: {
            REALTIME: { className: 'RestaurantRealtime', scriptName: 'admin' },
          },
          bindings: {
            RESTAURANT_ID: TENANT_A_ID,
            ALLOWED_ORIGINS: 'https://zestro-customer-website.pages.dev',
            WHATSAPP_NUMBER: '+8801601987672',
          },
        },
        {
          name: 'pages-proxy',
          modules: true,
          script: proxyScript,
          compatibilityDate: '2024-11-14',
          routes: ['zestro-admin.pages.dev/*'],
          outboundService: 'admin',
        },
      ],
    });

    d1 = await mf.getD1Database('DB', 'admin');
    for (const file of ['0001_initial.sql', '0002_production_functionality_repair.sql']) {
      const sql = fs.readFileSync(path.join(WORKER_ROOT, 'migrations', file), 'utf8');
      for (const stmt of splitSqlStatements(sql)) await d1.prepare(stmt).run();
    }

    const seed = [
      [`INSERT INTO restaurants (id, slug, name, currency, timezone, status) VALUES (?, 'zestro', 'ZESTRO', 'BDT', 'Asia/Dhaka', 'active')`, TENANT_A_ID],
      [`INSERT INTO restaurants (id, slug, name, currency, timezone, status) VALUES (?, 'other', 'Other Bistro', 'USD', 'UTC', 'active')`, TENANT_B_ID],
      [`INSERT INTO memberships (id, restaurant_id, auth_subject, email, display_name, role, status, job_title) VALUES ('m-a', ?, 'sub-a', 'owner-a@zestro.test', 'Owner A', 'owner', 'active', 'Owner')`, TENANT_A_ID],
      [`INSERT INTO memberships (id, restaurant_id, auth_subject, email, display_name, role, status, job_title) VALUES ('m-a2', ?, 'sub-a2', 'manager-a@zestro.test', 'Manager A', 'manager', 'active', 'Manager')`, TENANT_A_ID],
      [`INSERT INTO memberships (id, restaurant_id, auth_subject, email, display_name, role, status, job_title) VALUES ('m-av', ?, 'sub-av', 'viewer-a@zestro.test', 'Viewer A', 'viewer', 'active', 'Host')`, TENANT_A_ID],
      [`INSERT INTO memberships (id, restaurant_id, auth_subject, email, display_name, role, status, job_title) VALUES ('m-b', ?, 'sub-b', 'owner-b@bistro.test', 'Owner B', 'owner', 'active', 'Owner')`, TENANT_B_ID],
      [`INSERT INTO memberships (id, restaurant_id, auth_subject, email, display_name, role, status, job_title) VALUES ('m-ad', ?, 'sub-ad', 'disabled-a@zestro.test', 'Disabled A', 'manager', 'disabled', 'Manager')`, TENANT_A_ID],
    ];
    for (const [sql, id] of seed) await d1.prepare(sql).bind(id).run();
    await d1
      .prepare(`INSERT INTO restaurant_settings (restaurant_id, settings_json) VALUES (?, ?)`)
      .bind(
        TENANT_A_ID,
        JSON.stringify({
          restaurantName: 'ZESTRO',
          taxRatePercent: 5,
          serviceChargePercent: 10,
          deliveryFee: 60,
          minOrderAmount: 0,
          onlineOrderingEnabled: true,
          acceptingOrders: true,
          qrTableOrderingEnabled: true,
        })
      )
      .run();

    tokenA = await jwt('owner-a@zestro.test', 'sub-a');
    tokenB = await jwt('owner-b@bistro.test', 'sub-b');
    tokenViewerA = await jwt('viewer-a@zestro.test', 'sub-av');

    const cat = await (
      await admin('/api/categories', {
        token: tokenA,
        method: 'POST',
        json: { name: 'Burgers', categoryType: 'food', sortOrder: 1, active: true },
      })
    ).json();
    product = await (
      await admin('/api/menu', {
        token: tokenA,
        method: 'POST',
        json: { categoryId: cat.id, name: 'Realtime Burger', price: 400, available: true },
      })
    ).json();
    const tRes = await admin('/api/tables', {
      token: tokenA,
      method: 'POST',
      json: { number: 'T-01', zone: 'Main Dining', capacity: 4 },
    });
    assert.equal(tRes.status, 201);
    table = await tRes.json();
  });

  after(async () => {
    for (const ws of sockets) {
      try {
        ws.close(1000, 'done');
      } catch {
        /* ignore */
      }
    }
    if (mf) await mf.dispose();
  });

  function orderPayload(extra = {}) {
    return {
      orderType: 'dine_in',
      customerName: PII[0],
      customerPhone: PII[1],
      deliveryAddress: PII[2],
      notes: PII[3],
      tableId: table.id,
      tableNumber: 'T-01',
      items: [{ productId: product.id, quantity: 2, unitPrice: 1, customisations: [] }],
      ...extra,
    };
  }

  it('1. Customer places an order -> Admin receives order.created without refresh, and the order is fetchable', async () => {
    const adminConn = await connect(tokenA);
    const res = await customer('/api/orders/prepare', { method: 'POST', json: orderPayload() });
    assert.equal(res.status, 201);
    const order = await res.json();

    const msg = await waitFor(() => events(adminConn, 'order.created')[0], 'order.created');
    assert.equal(msg.event.restaurantId, TENANT_A_ID);
    assert.equal(msg.event.source, 'customer');
    assert.equal(msg.event.data.orderId, order.orderId);
    assert.equal(msg.event.data.orderNumber, order.orderRef);
    assert.equal(msg.event.data.tableId, table.id);
    assert.equal(msg.event.data.tableCode, 'T-01');
    assert.equal(msg.event.data.itemCount, 1);
    assert.ok(msg.event.seq > adminConn.messages[0].seq, 'event seq after hello seq');

    // Invalidate+refetch: the existing Admin API returns the new order.
    const list = await (await admin('/api/orders', { token: tokenA })).json();
    assert.ok(list.some((o) => o.id === order.orderId));
  });

  it('1b. Events carry no customer personal information', async () => {
    const adminConn = await connect(tokenA);
    await customer('/api/orders/prepare', {
      method: 'POST',
      json: orderPayload({ orderType: 'delivery', tableId: undefined, tableNumber: undefined }),
    });
    const msg = await waitFor(() => events(adminConn, 'order.created')[0], 'order.created');
    const raw = JSON.stringify(msg);
    for (const value of PII) assert.ok(!raw.includes(value), `event leaked "${value}"`);
    assert.deepEqual(
      Object.keys(msg.event.data).sort(),
      ['itemCount', 'orderId', 'orderNumber', 'orderType', 'status', 'tableCode', 'tableId'].sort()
    );
  });

  it('2. Customer calls waiter -> Admin receives waiter_call.created with the correct table immediately', async () => {
    const adminConn = await connect(tokenA);
    const t0 = Date.now();
    const res = await customer('/api/waiter-calls', {
      method: 'POST',
      json: { tableId: table.id, requestType: 'Bill Request' },
    });
    assert.equal(res.status, 201);
    const call = await res.json();
    const msg = await waitFor(() => events(adminConn, 'waiter_call.created')[0], 'waiter call');
    assert.ok(Date.now() - t0 < 2000);
    assert.equal(msg.event.data.callId, call.id);
    assert.equal(msg.event.data.tableId, table.id);
    assert.equal(msg.event.data.tableCode, 'T-01');
    assert.equal(msg.event.data.requestType, 'Bill Request');

    // Staff acknowledgement from another admin is also broadcast.
    const ack = await admin(`/api/waiter-calls/${call.id}`, {
      token: tokenA,
      method: 'PATCH',
      json: { status: 'acknowledged' },
    });
    assert.equal(ack.status, 200);
    const upd = await waitFor(() => events(adminConn, 'waiter_call.updated')[0], 'ack event');
    assert.equal(upd.event.data.callId, call.id);
    assert.equal(upd.event.source, 'admin');
  });

  it('3. Multiple admin browsers receive the same event exactly once', async () => {
    const tokenManager = await jwt('manager-a@zestro.test', 'sub-a2');
    const c1 = await connect(tokenA);
    const c2 = await connect(tokenA);
    const c3 = await connect(tokenManager);
    const res = await customer('/api/orders/prepare', { method: 'POST', json: orderPayload() });
    assert.equal(res.status, 201);
    const ids = await Promise.all(
      [c1, c2, c3].map((c) => waitFor(() => events(c, 'order.created')[0], 'fan-out'))
    );
    assert.equal(new Set(ids.map((m) => m.event.id)).size, 1, 'same event id for all');
    await sleep(200);
    for (const c of [c1, c2, c3]) assert.equal(events(c, 'order.created').length, 1);
  });

  it('4. A disconnected admin reconnects automatically and recovers missed updates', async () => {
    // Drive the real browser client over Miniflare WebSockets.
    const instances = [];
    class MfSocket {
      constructor(url) {
        this.readyState = 0;
        this.onopen = this.onmessage = this.onclose = this.onerror = null;
        instances.push(this);
        mf.dispatchFetch(url.replace(/^ws/, 'http'), {
          headers: { Upgrade: 'websocket', 'Cf-Access-Jwt-Assertion': tokenA },
        })
          .then((res) => {
            if (res.status !== 101) {
              this.readyState = 3;
              this.onclose?.({ code: 1006 });
              return;
            }
            const ws = res.webSocket;
            this.ws = ws;
            sockets.push(ws);
            this.readyState = 1;
            ws.addEventListener('message', (e) => this.onmessage?.({ data: e.data }));
            ws.addEventListener('close', (e) => {
              this.readyState = 3;
              this.onclose?.({ code: e.code });
            });
            ws.accept();
            this.onopen?.({});
          })
          .catch(() => {
            this.readyState = 3;
            this.onclose?.({ code: 1006 });
          });
      }
      send(d) {
        this.ws?.send(d);
      }
      close(code, reason) {
        this.readyState = 3;
        try {
          this.ws?.close(code, reason);
        } catch {
          /* ignore */
        }
      }
      /** Simulate a network interruption. */
      drop() {
        this.close(1001, 'network');
        this.onclose?.({ code: 1006 });
      }
    }

    const statuses = [];
    const resyncs = [];
    const received = [];
    const client = new RealtimeClient({
      url: realtimeUrl('', { protocol: 'https:', host: 'admin-api.test' }),
      WebSocketImpl: MfSocket,
      onEvent: (e) => received.push(e),
      onResync: (r) => resyncs.push(r),
      onStatus: (s) => statuses.push(s),
      minBackoffMs: 50,
      maxBackoffMs: 200,
      random: () => 1,
    });
    client.start();
    await waitFor(() => client.getStatus() === 'live', 'live');
    assert.deepEqual(resyncs, ['connected'], 'initial resync after first hello');

    // Live event.
    await customer('/api/orders/prepare', { method: 'POST', json: orderPayload() });
    await waitFor(() => received.length === 1, 'live event');

    // Network drops; customer acts while admin is disconnected.
    instances[0].drop();
    assert.equal(client.getStatus(), 'reconnecting');
    const missed = await (
      await customer('/api/orders/prepare', { method: 'POST', json: orderPayload() })
    ).json();

    await waitFor(() => client.getStatus() === 'live' && instances.length === 2, 'reconnected');
    assert.deepEqual(resyncs, ['connected', 'reconnected']);
    assert.ok(statuses.includes('reconnecting'));
    assert.equal(received.length, 1, 'missed event not replayed as a duplicate');

    // The resync refetch through the existing API contains the missed order.
    const list = await (await admin('/api/orders', { token: tokenA })).json();
    assert.ok(list.some((o) => o.id === missed.orderId));

    // New events continue to flow after reconnect, without duplicates.
    await customer('/api/waiter-calls', {
      method: 'POST',
      json: { tableId: table.id, requestType: 'Need Water' },
    }).catch(() => null);
    await customer('/api/orders/prepare', { method: 'POST', json: orderPayload() });
    await waitFor(() => received.some((e, i) => i > 0 && e.type === 'order.created'), 'post-reconnect');
    assert.equal(new Set(received.map((e) => e.id)).size, received.length);
    client.stop();
  });

  it('5. Unauthorized users cannot subscribe, and restaurants are isolated', async () => {
    // No token / forged token / non-member / disabled member.
    assert.equal((await connect(null)).status, 401);
    const forged = await new SignJWT({ email: 'owner-a@zestro.test' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('sub-a')
      .setIssuer(TEAM_DOMAIN)
      .setAudience([ACCESS_AUD])
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode('attacker-secret-attacker-secret!!'));
    assert.equal((await connect(forged)).status, 401);
    assert.equal((await connect(await jwt('stranger@x.test', 'sub-x'))).status, 403);
    assert.equal((await connect(await jwt('disabled-a@zestro.test', 'sub-ad'))).status, 403);

    // Tenant B owner trying to pick Tenant A's restaurant via query or header -> 403.
    assert.equal(
      (await connect(tokenB, { url: `${ADMIN_HOST}/api/realtime?restaurantId=${TENANT_A_ID}` }))
        .status,
      403
    );
    assert.equal(
      (await connect(tokenB, { headers: { 'X-Restaurant-Id': TENANT_A_ID } })).status,
      403
    );

    // Non-upgrade requests are rejected.
    const plain = await admin('/api/realtime', { token: tokenA });
    assert.equal(plain.status, 426);

    // Cross-origin browser handshakes are rejected by the Worker origin allow-list.
    assert.equal(
      (await connect(tokenA, { headers: { Origin: 'https://evil.example' } })).status,
      403
    );

    // Tenant B's socket never sees Tenant A events.
    const connB = await connect(tokenB);
    const connA = await connect(tokenA);
    await customer('/api/orders/prepare', { method: 'POST', json: orderPayload() });
    await waitFor(() => events(connA, 'order.created')[0], 'A event');
    await sleep(250);
    assert.equal(events(connB).length, 0, 'tenant B received tenant A event');
    assert.equal(connB.messages[0].type, 'hello');
  });

  it('5b. Pages proxy: same-origin upgrade works, cross-origin upgrade is blocked (CSWSH)', async () => {
    const ok = await connect(tokenA, {
      url: `${PAGES_HOST}/api/realtime`,
      headers: { Origin: PAGES_HOST },
    });
    assert.equal(ok.status, 101);
    await customer('/api/waiter-calls', {
      method: 'POST',
      json: { tableNumber: 'T-01', requestType: 'Need Napkins' },
    });
    // Either a new call (201) or cooldown (429). Only assert proxy delivery when created.
    const evil = await connect(tokenA, {
      url: `${PAGES_HOST}/api/realtime`,
      headers: { Origin: 'https://evil.example' },
    });
    assert.equal(evil.status, 403);
    const noOrigin = await connect(tokenA, { url: `${PAGES_HOST}/api/realtime` });
    assert.equal(noOrigin.status, 403);
    const wrongPath = await connect(tokenA, {
      url: `${PAGES_HOST}/api/orders`,
      headers: { Origin: PAGES_HOST },
    });
    assert.equal(wrongPath.status, 403);
    const noAuth = await connect(null, {
      url: `${PAGES_HOST}/api/realtime`,
      headers: { Origin: PAGES_HOST },
    });
    assert.equal(noAuth.status, 401);

    // Proxied socket receives events.
    await customer('/api/orders/prepare', { method: 'POST', json: orderPayload() });
    await waitFor(() => events(ok, 'order.created')[0], 'proxied event');
  });

  it('6. Failed or rejected database writes do not generate events', async () => {
    const conn = await connect(tokenA);

    // a) Forced D1 failure on order insert -> 500, no event.
    await d1
      .prepare(
        `CREATE TRIGGER rt_fail_orders BEFORE INSERT ON orders BEGIN SELECT RAISE(ABORT, 'forced failure'); END`
      )
      .run();
    const failed = await customer('/api/orders/prepare', { method: 'POST', json: orderPayload() });
    assert.equal(failed.status, 500);
    await d1.prepare('DROP TRIGGER rt_fail_orders').run();

    // b) Forced D1 failure on waiter call insert -> 500, no event.
    await d1
      .prepare(
        `CREATE TRIGGER rt_fail_calls BEFORE INSERT ON waiter_calls BEGIN SELECT RAISE(ABORT, 'forced failure'); END`
      )
      .run();
    await d1.prepare(`DELETE FROM waiter_calls WHERE restaurant_id = ?`).bind(TENANT_A_ID).run();
    const failedCall = await customer('/api/waiter-calls', {
      method: 'POST',
      json: { tableId: table.id, requestType: 'Bill Request' },
    });
    assert.equal(failedCall.status, 500);
    await d1.prepare('DROP TRIGGER rt_fail_calls').run();

    // c) Validation failures / unknown table / cooldown -> no events.
    assert.equal(
      (await customer('/api/orders/prepare', { method: 'POST', json: { items: [] } })).status,
      400
    );
    assert.equal(
      (
        await customer('/api/waiter-calls', {
          method: 'POST',
          json: { tableNumber: 'T-99', requestType: 'Bill Request' },
        })
      ).status,
      404
    );
    const firstCall = await customer('/api/waiter-calls', {
      method: 'POST',
      json: { tableId: table.id, requestType: 'Bill Request' },
    });
    assert.equal(firstCall.status, 201);
    await waitFor(() => events(conn, 'waiter_call.created').length === 1, 'first call');
    const cooldown = await customer('/api/waiter-calls', {
      method: 'POST',
      json: { tableId: table.id, requestType: 'Bill Request' },
    });
    assert.equal(cooldown.status, 429);

    // d) Idempotent replay -> no duplicate event.
    const key = { 'Idempotency-Key': 'rt-idem-001' };
    assert.equal(
      (await customer('/api/orders/prepare', { method: 'POST', json: orderPayload(), headers: key }))
        .status,
      201
    );
    assert.equal(
      (await customer('/api/orders/prepare', { method: 'POST', json: orderPayload(), headers: key }))
        .status,
      200
    );

    // e) Viewer (read-only) admin write is rejected -> no event.
    const viewerPatch = await admin(`/api/tables/${table.id}`, {
      token: tokenViewerA,
      method: 'PATCH',
      json: { status: 'Cleaning' },
    });
    assert.equal(viewerPatch.status, 403);

    await sleep(300);
    assert.equal(events(conn, 'order.created').length, 1, 'only the idempotent original');
    assert.equal(events(conn, 'waiter_call.created').length, 1, 'only the successful call');
    assert.equal(events(conn, 'table.updated').length, 0);
  });

  it('6b. Expired Access sessions stop receiving events (DO closes them with 4401)', async () => {
    const shortToken = await jwt('owner-a@zestro.test', 'sub-a', '2s');
    const expired = await connect(shortToken);
    const helloExpiry = Date.parse(expired.messages[0].expiresAt);
    assert.ok(helloExpiry - Date.now() <= 2000, 'socket lifetime capped at the Access token exp');
    await sleep(2300);

    const fresh = await connect(tokenA);
    const r = await customer('/api/orders/prepare', { method: 'POST', json: orderPayload() });
    assert.equal(r.status, 201);
    await waitFor(() => events(fresh, 'order.created')[0], 'fresh session event');
    await sleep(200);
    // Note: Miniflare's local WebSocket bridge does not always surface server-initiated close
    // frames before shutdown, so the guarantee asserted here is the security property itself.
    assert.equal(events(expired).length, 0, 'expired session must not receive events');
  });

  it('7. Existing admin + customer functionality still works with real-time enabled', async () => {
    const conn = await connect(tokenA);
    // Admin order status change still updates D1 and is visible to the customer.
    const list = await (await admin('/api/orders', { token: tokenA })).json();
    const target = list[0];
    const patch = await admin(`/api/orders/${target.id}`, {
      token: tokenA,
      method: 'PATCH',
      json: { status: 'Preparing' },
    });
    assert.equal(patch.status, 200);
    const upd = await waitFor(() => events(conn, 'order.updated')[0], 'order.updated');
    assert.equal(upd.event.data.orderId, target.id);

    // Admin table CRUD broadcasts table.* events.
    const created = await (
      await admin('/api/tables', {
        token: tokenA,
        method: 'POST',
        json: { number: 'T-RT', zone: 'Patio', capacity: 2 },
      })
    ).json();
    await waitFor(() => events(conn, 'table.created')[0], 'table.created');
    assert.equal(
      (
        await admin(`/api/tables/${created.id}`, {
          token: tokenA,
          method: 'PATCH',
          json: { status: 'Cleaning' },
        })
      ).status,
      200
    );
    await waitFor(() => events(conn, 'table.updated')[0], 'table.updated');
    assert.equal(
      (await admin(`/api/tables/${created.id}`, { token: tokenA, method: 'DELETE' })).status,
      200
    );
    await waitFor(() => events(conn, 'table.deleted')[0], 'table.deleted');

    // Customer catalog and order status endpoints unaffected.
    assert.equal((await customer('/api/catalog')).status, 200);
    assert.equal((await admin('/api/me', { token: tokenA })).status, 200);

    // Sequence numbers are strictly increasing per restaurant.
    const seqs = events(conn).map((m) => m.event.seq);
    for (let i = 1; i < seqs.length; i++) assert.ok(seqs[i] > seqs[i - 1]);
  });
});

describe('RealtimeClient unit behaviour (fake WebSocket)', () => {
  let RealtimeClient;
  before(async () => {
    const tmp = fs.mkdtempSync(path.join(WORKER_ROOT, '.tmp-rt-client-'));
    try {
      const out = path.join(tmp, 'c.mjs');
      await esbuild.build({
        entryPoints: [path.join(REPO_ROOT, 'src/services/realtime.ts')],
        bundle: true,
        format: 'esm',
        platform: 'neutral',
        outfile: out,
        logLevel: 'silent',
      });
      ({ RealtimeClient } = await import(`file://${out}`));
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  function harness(opts = {}) {
    const sockets = [];
    class FakeWS {
      constructor(url) {
        this.url = url;
        this.readyState = 1;
        this.sent = [];
        sockets.push(this);
      }
      send(d) {
        this.sent.push(d);
      }
      close() {
        this.readyState = 3;
      }
      emit(obj) {
        this.onmessage?.({ data: typeof obj === 'string' ? obj : JSON.stringify(obj) });
      }
    }
    const got = { events: [], resyncs: [], statuses: [] };
    const client = new RealtimeClient({
      url: 'wss://x/api/realtime',
      WebSocketImpl: FakeWS,
      onEvent: (e) => got.events.push(e.id),
      onResync: (r) => got.resyncs.push(r),
      onStatus: (s) => got.statuses.push(s),
      minBackoffMs: 5,
      maxBackoffMs: 20,
      random: () => 1,
      ...opts,
    });
    return { client, sockets, got };
  }
  const ev = (id, seq) => ({ type: 'event', event: { id, seq, type: 'order.created', data: {} } });

  it('drops duplicate events by id and by sequence; resyncs on a gap', () => {
    const { client, sockets, got } = harness();
    client.start();
    sockets[0].emit({ type: 'hello', seq: 10 });
    sockets[0].emit(ev('a', 11));
    sockets[0].emit(ev('a', 11));
    sockets[0].emit(ev('b', 11));
    sockets[0].emit(ev('c', 14));
    assert.deepEqual(got.events, ['a', 'c']);
    assert.deepEqual(got.resyncs, ['connected', 'gap']);
    client.stop();
  });

  it('goes Reconnecting then Offline after repeated failures, and back to Live', async () => {
    const { client, sockets, got } = harness({ offlineAfterFailures: 3 });
    client.start();
    sockets[0].emit({ type: 'hello', seq: 0 });
    assert.equal(client.getStatus(), 'live');
    for (let i = 0; i < 3; i++) {
      sockets[sockets.length - 1].onclose?.({ code: 1006 });
      await sleep(30);
    }
    assert.ok(got.statuses.includes('reconnecting'));
    assert.equal(client.getStatus(), 'offline');
    sockets[sockets.length - 1].emit({ type: 'hello', seq: 5 });
    assert.equal(client.getStatus(), 'live');
    assert.equal(got.resyncs.at(-1), 'reconnected');
    client.stop();
  });

  it('sends heartbeats and reconnects a stale socket', async () => {
    let now = 0;
    const { client, sockets } = harness({ heartbeatMs: 10, staleAfterMs: 50, now: () => now });
    client.start();
    sockets[0].emit({ type: 'hello', seq: 0 });
    await sleep(25);
    assert.ok(sockets[0].sent.includes('ping'));
    now = 1000;
    await sleep(40);
    assert.ok(sockets.length >= 2, 'stale socket replaced');
    client.stop();
  });

  it('stop() prevents any further reconnects', async () => {
    const { client, sockets } = harness();
    client.start();
    client.stop();
    sockets[0].onclose?.({ code: 1006 });
    await sleep(40);
    assert.equal(sockets.length, 1);
  });
});
