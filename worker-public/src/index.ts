export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  RESTAURANT_ID: string;
  ALLOWED_ORIGINS: string;
  WHATSAPP_NUMBER: string;
}

interface CustomerRow { id:string; restaurant_id:string; email:string; name:string; phone:string|null; default_address:string|null; password_hash:string; password_salt:string; }
const CUSTOMER_COOKIE='zestro_customer_session';
const PASSWORD_ITERATIONS=210000; const SESSION_DAYS=30; const encCustomer=new TextEncoder();
function toB64Url(bytes:Uint8Array):string{return btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');}
function fromB64Url(raw:string):Uint8Array{return Uint8Array.from(atob(raw.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-raw.length%4)%4)),c=>c.charCodeAt(0));}
async function sha256Customer(value:string):Promise<string>{const out=new Uint8Array(await crypto.subtle.digest('SHA-256',encCustomer.encode(value)));return [...out].map(v=>v.toString(16).padStart(2,'0')).join('');}
async function deriveCustomerPassword(password:string,salt:Uint8Array):Promise<string>{const key=await crypto.subtle.importKey('raw',encCustomer.encode(password),'PBKDF2',false,['deriveBits']);const saltBuffer=new Uint8Array(salt).buffer;const raw=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:saltBuffer,iterations:PASSWORD_ITERATIONS},key,256);return toB64Url(new Uint8Array(raw));}
function customerTokenFromCookie(req:Request):string|null{for(const part of (req.headers.get('Cookie')||'').split(';')){const [key,...value]=part.trim().split('=');if(key===CUSTOMER_COOKIE)return value.join('=')||null;}return null;}
function customerSessionCookie(token:string,expires:Date):string{return CUSTOMER_COOKIE+'='+token+'; Path=/; HttpOnly; Secure; SameSite=None; Expires='+expires.toUTCString();}
function customerPublic(row:CustomerRow){return {uid:row.id,email:row.email,displayName:row.name,phone:row.phone||'',defaultAddress:row.default_address||''};}
function customerEmail(raw:string):string|null{const email=raw.trim().toLowerCase();return email.length<=200&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:null;}
async function getCustomerFromSession(req:Request,db:D1Database,restaurantId:string):Promise<CustomerRow|null>{const token=customerTokenFromCookie(req);if(!token||token.length>128)return null;return db.prepare('SELECT c.id,c.restaurant_id,c.email,c.name,c.phone,c.default_address,c.password_hash,c.password_salt FROM customer_sessions s JOIN customers c ON c.id=s.customer_id AND c.restaurant_id=s.restaurant_id WHERE s.token_hash=? AND s.restaurant_id=? AND s.expires_at>CURRENT_TIMESTAMP LIMIT 1').bind(await sha256Customer(token),restaurantId).first<CustomerRow>();}
async function createCustomerSession(db:D1Database,restaurantId:string,customerId:string):Promise<{token:string;expires:Date}>{const token=toB64Url(crypto.getRandomValues(new Uint8Array(32)));const expires=new Date(Date.now()+SESSION_DAYS*86400000);await db.prepare('INSERT INTO customer_sessions(id,restaurant_id,customer_id,token_hash,expires_at) VALUES(?,?,?,?,?)').bind(uid(),restaurantId,customerId,await sha256Customer(token),expires.toISOString()).run();return {token,expires};}
interface RestaurantRow {
  id: string;
  name: string;
  slug: string;
  currency: string;
  timezone: string;
  status: string;
}

const uid = () => crypto.randomUUID();

const parseAllowedOrigins = (env: Env): string[] =>
  (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function json(data: unknown, status = 200, origin: string | null = null, env?: Env): Response {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  if (env && origin && parseAllowedOrigins(env).includes(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
    headers.set('access-control-allow-credentials', 'true');
  }
  headers.set('access-control-allow-methods', 'GET,POST,PATCH,OPTIONS');
  headers.set('access-control-allow-headers', 'Content-Type,Idempotency-Key,X-Restaurant-Slug');
  return new Response(JSON.stringify(data), { status, headers });
}

const err = (message: string) => ({ error: message });

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function localized(val: unknown): { en: string; bn: string; ar: string } {
  if (val && typeof val === 'object' && 'en' in (val as Record<string, unknown>)) {
    const obj = val as Record<string, unknown>;
    const en = String(obj.en || '');
    return {
      en,
      bn: String(obj.bn || en),
      ar: String(obj.ar || en),
    };
  }
  const s = String(val ?? '');
  return { en: s, bn: s, ar: s };
}

function toCurrencySymbol(raw: string | null | undefined): string {
  const v = String(raw || 'BDT').trim();
  const upper = v.toUpperCase();
  if (upper.includes('BDT') || v === '৳') return '৳';
  if (upper.includes('USD') || v === '$') return '$';
  if (upper.includes('EUR') || v === '€') return '€';
  if (upper.includes('GBP') || v === '£') return '£';
  if (upper.includes('SAR') || v === '﷼') return '﷼';
  if (upper.includes('INR') || v === '₹') return '₹';
  return v || '৳';
}

function normalizeCode(v: string): string {
  const cleaned = v.trim().replace(/^table[-_\s]*/i, '').replace(/^T[-_\s]*/i, '');
  return /^\d+$/.test(cleaned) ? cleaned.padStart(2, '0') : cleaned;
}

function inferCategoryType(explicitType: string | null | undefined, slug: string, name: string): 'food' | 'beverage' {
  if (explicitType === 'beverage') return 'beverage';
  const hay = `${slug} ${name}`.toLowerCase();
  if (/(coffee|tea|drink|beverage|frappe|mojito|mocktail|shake|smoothie|juice|bubble|boba|latte|espresso|water|soda)/.test(hay)) {
    return 'beverage';
  }
  return 'food';
}

function resolvePublicMediaUrl(
  workerOrigin: string,
  imageKey: string | null | undefined,
  imageUrl?: string | null
): string | undefined {
  if (imageKey && String(imageKey).trim()) {
    return `${workerOrigin}/api/media?key=${encodeURIComponent(String(imageKey).trim())}`;
  }
  const raw = String(imageUrl || '').trim();
  if (!raw) return undefined;
  if (raw.startsWith('/api/media?key=')) {
    return `${workerOrigin}${raw}`;
  }
  return raw;
}

async function resolveRestaurant(req: Request, url: URL, env: Env): Promise<RestaurantRow | null> {
  const slugParam = (
    url.searchParams.get('restaurant') ||
    req.headers.get('X-Restaurant-Slug') ||
    ''
  ).trim();

  if (slugParam) {
    const bySlug = await env.DB.prepare(
      `SELECT id, name, slug, currency, timezone, status FROM restaurants WHERE lower(slug) = lower(?) AND status = 'active' LIMIT 1`
    )
      .bind(slugParam)
      .first<RestaurantRow>();
    return bySlug || null;
  }

  const rid = (env.RESTAURANT_ID || '').trim();
  if (!rid) return null;
  return await env.DB.prepare(
    `SELECT id, name, slug, currency, timezone, status FROM restaurants WHERE id = ? AND status = 'active' LIMIT 1`
  )
    .bind(rid)
    .first<RestaurantRow>();
}

async function resolveVerifiedTable(
  db: D1Database,
  rid: string,
  tableIdRaw: string,
  tableNumberRaw: string
): Promise<{ id: string; table_code: string; zone: string; capacity: number } | null> {
  const token = (tableNumberRaw || tableIdRaw).trim();
  if (!token && !tableIdRaw.trim()) return null;
  const code = normalizeCode(token || tableIdRaw);
  return await db
    .prepare(
      `SELECT id, table_code, zone, capacity
       FROM restaurant_tables
       WHERE restaurant_id = ?
         AND (
           id = ?
           OR lower(table_code) = lower(?)
           OR lower(table_code) = lower(?)
           OR lower(table_code) = lower(?)
         )
       LIMIT 1`
    )
    .bind(rid, tableIdRaw.trim(), token, code, `T-${code}`)
    .first<{ id: string; table_code: string; zone: string; capacity: number }>();
}

function mapDbOrderStatusToCustomer(status: string): string {
  switch (status) {
    case 'accepted':
      return 'confirmed';
    case 'preparing':
      return 'preparing';
    case 'ready':
      return 'ready';
    case 'served':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    case 'pending':
    default:
      return 'awaiting_whatsapp_confirmation';
  }
}

async function handle(req: Request, env: Env): Promise<Response> {
  const origin = req.headers.get('Origin');
  if (req.method === 'OPTIONS') {
    const h = new Headers({
      'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
      'access-control-allow-headers': 'Content-Type,Idempotency-Key,X-Restaurant-Slug',
    });
    if (origin && parseAllowedOrigins(env).includes(origin)) {
      h.set('access-control-allow-origin', origin);
      h.set('vary', 'Origin');
      h.set('access-control-allow-credentials', 'true');
    }
    return new Response(null, { status: 204, headers: h });
  }

  const url = new URL(req.url);
  const p = url.pathname;
  const workerOrigin = url.origin;

  if ((p === '/health' || p === '/api/health') && req.method === 'GET') {
    return json({ ok: true, service: 'zestro-customer-api', time: new Date().toISOString() }, 200, origin, env);
  }

  const restaurant = await resolveRestaurant(req, url, env);
  if (!restaurant) {
    return json(err('Restaurant is currently unavailable.'), 404, origin, env);
  }
  const rid = restaurant.id;

  // Customer account endpoints are scoped to the restaurant resolved above.
  if (p === '/api/customer/auth/signup' && req.method === 'POST') {
    const body=await req.json<Record<string,unknown>>();
    const name=String(body.name||'').trim().slice(0,120), email=customerEmail(String(body.email||'')), password=String(body.password||'');
    const phone=String(body.phone||'').trim().slice(0,24), address=String(body.defaultAddress||'').trim().slice(0,400);
    if(!name||!email||password.length<12||password.length>128)return json(err('Enter your name, a valid email, and a password of 12–128 characters.'),400,origin,env);
    const salt=crypto.getRandomValues(new Uint8Array(16)), passwordHash=await deriveCustomerPassword(password,salt), customerId=uid();
    const token=toB64Url(crypto.getRandomValues(new Uint8Array(32))), expires=new Date(Date.now()+SESSION_DAYS*86400000), tokenHash=await sha256Customer(token);
    try {
      await env.DB.batch([
        env.DB.prepare('INSERT INTO customers(id,restaurant_id,email,name,phone,default_address,password_hash,password_salt) VALUES(?,?,?,?,?,?,?,?)').bind(customerId,rid,email,name,phone||null,address||null,passwordHash,toB64Url(salt)),
        env.DB.prepare('INSERT INTO customer_sessions(id,restaurant_id,customer_id,token_hash,expires_at) VALUES(?,?,?,?,?)').bind(uid(),rid,customerId,tokenHash,expires.toISOString())
      ]);
    } catch { return json(err('Unable to create account. This email may already be registered.'),409,origin,env); }
    const response=json({customer:{uid:customerId,email,displayName:name,phone,defaultAddress:address}},201,origin,env);
    const headers=new Headers(response.headers);headers.set('set-cookie',customerSessionCookie(token,expires));headers.set('access-control-allow-credentials','true');
    return new Response(response.body,{status:201,headers});
  }
  if (p === '/api/customer/auth/login' && req.method === 'POST') {
    const body=await req.json<Record<string,unknown>>(), email=customerEmail(String(body.email||'')), password=String(body.password||'');
    if(!email||!password||password.length>128)return json(err('Invalid email or password.'),400,origin,env);
    const customer=await env.DB.prepare('SELECT id,restaurant_id,email,name,phone,default_address,password_hash,password_salt FROM customers WHERE restaurant_id=? AND email=? LIMIT 1').bind(rid,email).first<CustomerRow>();
    if(!customer)return json(err('Invalid email or password.'),401,origin,env);
    const actual=new TextEncoder().encode(await deriveCustomerPassword(password,fromB64Url(customer.password_salt))), expected=new TextEncoder().encode(customer.password_hash);
    let diff=actual.length^expected.length;for(let i=0;i<Math.min(actual.length,expected.length);i++)diff|=actual[i]^expected[i];
    if(diff!==0)return json(err('Invalid email or password.'),401,origin,env);
    const session=await createCustomerSession(env.DB,rid,customer.id), response=json({customer:customerPublic(customer)},200,origin,env), headers=new Headers(response.headers);
    headers.set('set-cookie',customerSessionCookie(session.token,session.expires));headers.set('access-control-allow-credentials','true');return new Response(response.body,{status:200,headers});
  }
  if (p === '/api/customer/auth/logout' && req.method === 'POST') {
    const token=customerTokenFromCookie(req);if(token)await env.DB.prepare('DELETE FROM customer_sessions WHERE restaurant_id=? AND token_hash=?').bind(rid,await sha256Customer(token)).run();
    const response=json({ok:true},200,origin,env), headers=new Headers(response.headers);
    headers.set('set-cookie',CUSTOMER_COOKIE+'=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0');headers.set('access-control-allow-credentials','true');return new Response(response.body,{status:200,headers});
  }
  if (p === '/api/customer/me' && req.method === 'GET') {
    const customer=await getCustomerFromSession(req,env.DB,rid);if(!customer)return json(err('Not signed in.'),401,origin,env);
    const orders=await env.DB.prepare('SELECT id,order_number,order_type,status,total_minor,created_at FROM orders WHERE restaurant_id=? AND customer_id=? ORDER BY created_at DESC LIMIT 50').bind(rid,customer.id).all<Record<string,unknown>>();
    return json({customer:customerPublic(customer),orders:orders.results||[]},200,origin,env);
  }
  if (p === '/api/customer/profile' && req.method === 'PATCH') {
    const customer=await getCustomerFromSession(req,env.DB,rid);if(!customer)return json(err('Not signed in.'),401,origin,env);
    const body=await req.json<Record<string,unknown>>(), name=String(body.displayName||'').trim().slice(0,120), phone=String(body.phone||'').trim().slice(0,24), address=String(body.defaultAddress||'').trim().slice(0,400);
    if(!name)return json(err('Name is required.'),400,origin,env);
    await env.DB.prepare('UPDATE customers SET name=?,phone=?,default_address=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=?').bind(name,phone||null,address||null,customer.id,rid).run();
    const updated=await env.DB.prepare('SELECT id,restaurant_id,email,name,phone,default_address,password_hash,password_salt FROM customers WHERE id=? AND restaurant_id=?').bind(customer.id,rid).first<CustomerRow>();
    return json({customer:updated?customerPublic(updated):customerPublic(customer)},200,origin,env);
  }
  // ── Public R2 Media Stream (`GET /api/media?key=...`) ───────────────────
  if (p === '/api/media' && req.method === 'GET') {
    const key = url.searchParams.get('key') || '';
    if (!key.startsWith(`restaurants/${rid}/`)) {
      return json(err('Not found'), 404, origin, env);
    }
    const object = await env.MEDIA.get(key);
    if (!object) {
      return json(err('Not found'), 404, origin, env);
    }
    const h = new Headers();
    const rawMime = String(object.httpMetadata?.contentType || '').toLowerCase();
    const safeMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml'].includes(rawMime)
      ? rawMime
      : 'image/jpeg';
    h.set('content-type', safeMime);
    if (safeMime === 'image/svg+xml') {
      h.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    }
    if (object.httpEtag) h.set('etag', object.httpEtag);
    h.set('cache-control', 'public, max-age=3600');
    h.set('access-control-allow-origin', origin && parseAllowedOrigins(env).includes(origin) ? origin : '*');
    h.set('cross-origin-resource-policy', 'cross-origin');
    h.set('x-content-type-options', 'nosniff');
    return new Response(object.body, { status: 200, headers: h });
  }

  // ── Live Public Catalog (`GET /api/catalog`) ────────────────────────────
  if (p === '/api/catalog' && req.method === 'GET') {
    const [cats, items, settingsRow, promos, galleryRows] = await Promise.all([
      env.DB.prepare(
        `SELECT id, name, slug, description, COALESCE(category_type, 'food') AS category_type, sort_order, active
         FROM menu_categories
         WHERE restaurant_id = ? AND active = 1
         ORDER BY sort_order ASC, name ASC`
      )
        .bind(rid)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT id, category_id, name, description, price_minor, image_key,
                COALESCE(image_url, '') AS image_url, available, featured, prep_minutes,
                dietary_tags_json, COALESCE(options_json, '{}') AS options_json,
                COALESCE(sort_order, 0) AS sort_order
         FROM menu_items
         WHERE restaurant_id = ?
         ORDER BY sort_order ASC, featured DESC, name ASC`
      )
        .bind(rid)
        .all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT settings_json FROM restaurant_settings WHERE restaurant_id = ?`)
        .bind(rid)
        .first<{ settings_json: string }>(),
      env.DB.prepare(
        `SELECT id, title, COALESCE(description, '') AS description, code, discount_type,
                discount_value_minor, min_order_minor, valid_from, valid_until, active
         FROM promotions
         WHERE restaurant_id = ? AND active = 1
         ORDER BY created_at DESC`
      )
        .bind(rid)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT id, title, caption, category, image_key, image_url, sort_order, featured
         FROM gallery_photos
         WHERE restaurant_id = ?
         ORDER BY sort_order ASC, created_at ASC`
      )
        .bind(rid)
        .all<Record<string, unknown>>(),
    ]);

    const rawSettings = safeJsonParse<Record<string, unknown>>(settingsRow?.settings_json, {});
    const activeCatIds = new Set((cats.results || []).map((c) => String(c.id)));

    const categories = (cats.results || []).map((c, i) => ({
      id: String(c.id),
      slug: String(c.slug || ''),
      name: localized(c.name),
      description: localized(c.description || ''),
      type: inferCategoryType(
        String(c.category_type || 'food'),
        String(c.slug || ''),
        String(c.name || '')
      ),
      displayOrder: Number(c.sort_order ?? i + 1),
      active: Boolean(c.active),
    }));

    const groupMap = new Map<string, Record<string, unknown>>();
    if (Array.isArray(rawSettings.customisationGroups)) {
      for (const g of rawSettings.customisationGroups as Record<string, unknown>[]) {
        if (g && g.id) groupMap.set(String(g.id), g);
      }
    }

    const products = (items.results || [])
      .filter((x) => !x.category_id || activeCatIds.has(String(x.category_id)))
      .map((x, i) => {
        const opts = safeJsonParse<Record<string, unknown>>(String(x.options_json || '{}'), {});
        const variants = Array.isArray(opts.variants)
          ? (opts.variants as Record<string, unknown>[]).map((v) => ({
              id: String(v.id || ''),
              label: localized(v.label || v.name || ''),
              price: Number(v.price || 0),
            }))
          : [];

        if (Array.isArray(opts.customisationGroups)) {
          for (const g of opts.customisationGroups as Record<string, unknown>[]) {
            if (g && g.id) groupMap.set(String(g.id), g);
          }
        }

        const customisationGroupIds = Array.isArray(opts.customisationGroupIds)
          ? (opts.customisationGroupIds as unknown[]).map((id) => String(id)).filter(Boolean)
          : Array.isArray(opts.customisationGroups)
          ? (opts.customisationGroups as Record<string, unknown>[])
              .map((g) => String(g.id || ''))
              .filter(Boolean)
          : [];

        const isAvailable = Boolean(x.available);
        return {
          id: String(x.id),
          categoryId: String(x.category_id || ''),
          name: localized(x.name),
          description: localized(x.description || ''),
          price: Number(x.price_minor || 0) / 100,
          image: resolvePublicMediaUrl(
            workerOrigin,
            x.image_key ? String(x.image_key) : null,
            x.image_url ? String(x.image_url) : null
          ),
          available: isAvailable,
          soldOut: !isAvailable,
          featured: Boolean(x.featured),
          popular: Boolean(x.featured),
          displayOrder: Number(x.sort_order || i + 1),
          variants,
          customisationGroupIds,
          mealSideRule: Boolean(opts.mealSideRule),
          dietaryTags: safeJsonParse<string[]>(String(x.dietary_tags_json || '[]'), []),
        };
      });

    const today = new Date().toISOString().slice(0, 10);
    const rawOfferMeta =
      rawSettings.offerMeta && typeof rawSettings.offerMeta === 'object'
        ? (rawSettings.offerMeta as Record<string, { discountText?: string; hasPromoCode?: boolean }>)
        : {};

    const validPromoRows = (promos.results || []).filter((p) => {
      const from = String(p.valid_from || '').slice(0, 10);
      const until = String(p.valid_until || '').slice(0, 10);
      if (from && from > today) return false;
      if (until && until < today) return false;
      return true;
    });

    const promotions = validPromoRows
      .filter((p) => {
        const code = String(p.code || '');
        const meta = rawOfferMeta[String(p.id)];
        const hasPromoCode = !code.startsWith('__OFFER_') && meta?.hasPromoCode !== false;
        return (
          hasPromoCode &&
          (p.discount_type === 'percentage' || p.discount_type === 'fixed_amount')
        );
      })
      .map((p) => ({
        id: String(p.id),
        title: localized(p.title),
        description: localized(p.description || p.title),
        code: String(p.code || '').toUpperCase(),
        active: Boolean(p.active),
        discountType: (p.discount_type === 'percentage' ? 'percent' : 'fixed') as 'percent' | 'fixed',
        discountValue: Number(p.discount_value_minor || 0) / 100,
        minOrderAmount: Number(p.min_order_minor || 0) / 100,
        validUntil: String(p.valid_until || ''),
      }));

    const offers = validPromoRows.map((p) => {
      const id = String(p.id);
      const rawCode = String(p.code || '').toUpperCase();
      const meta = rawOfferMeta[id];
      const hasPromoCode = !rawCode.startsWith('__OFFER_') && meta?.hasPromoCode !== false;
      const derivedDiscountText =
        p.discount_type === 'percentage' && Number(p.discount_value_minor || 0) > 0
          ? `${Number(p.discount_value_minor) / 100}% OFF`
          : '';
      return {
        id,
        title: String(p.title || ''),
        description: String(p.description || ''),
        discountText: String(meta?.discountText || derivedDiscountText || ''),
        code: hasPromoCode ? rawCode : '',
        validFrom: String(p.valid_from || ''),
        validUntil: String(p.valid_until || ''),
      };
    });

    const gallery = (galleryRows.results || []).map((g, idx) => ({
      id: String(g.id),
      title: String(g.title || ''),
      caption: String(g.caption || ''),
      category: String(g.category || 'Dining Room'),
      imageUrl:
        resolvePublicMediaUrl(
          workerOrigin,
          g.image_key ? String(g.image_key) : null,
          g.image_url ? String(g.image_url) : null
        ) || '',
      sortOrder: Number(g.sort_order ?? idx + 1),
      featured: Boolean(g.featured),
    }));

    const rawHomepage =
      (rawSettings.homepageConfig as Record<string, unknown> | undefined) || null;
    const homepage = rawHomepage
      ? {
          heroHeadline: String(rawHomepage.heroHeadline || ''),
          heroSubheadline: String(rawHomepage.heroSubheadline || ''),
          heroCtaText: String(rawHomepage.heroCtaText || ''),
          heroImageUrl: resolvePublicMediaUrl(
            workerOrigin,
            rawHomepage.heroImageKey ? String(rawHomepage.heroImageKey) : null,
            rawHomepage.heroImageUrl ? String(rawHomepage.heroImageUrl) : null
          ),
          promoBannerEnabled: Boolean(rawHomepage.promoBannerEnabled),
          promoBannerText: String(rawHomepage.promoBannerText || ''),
          promoBannerCode: String(rawHomepage.promoBannerCode || ''),
          sections: Array.isArray(rawHomepage.sections) ? rawHomepage.sections : [],
        }
      : null;

    const onlineOrderingEnabled =
      rawSettings.onlineOrderingEnabled !== false && rawSettings.acceptingOrders !== false;
    const qrTableOrderingEnabled = rawSettings.qrTableOrderingEnabled !== false;

    return json(
      {
        categories,
        products,
        customisationGroups: Array.from(groupMap.values()),
        promotions,
        offers,
        gallery,
        homepage,
        settings: {
          restaurantName: String(rawSettings.restaurantName || restaurant.name || 'Zestro'),
          logoUrl: resolvePublicMediaUrl(
            workerOrigin,
            rawSettings.logoKey ? String(rawSettings.logoKey) : null,
            rawSettings.logoUrl ? String(rawSettings.logoUrl) : null
          ),
          whatsappNumber: String(
            rawSettings.whatsappNumber || rawSettings.phone || env.WHATSAPP_NUMBER || ''
          ),
          contactPhone: String(
            rawSettings.contactPhone || rawSettings.phone || env.WHATSAPP_NUMBER || ''
          ),
          address: localized(rawSettings.address || ''),
          openingHours: localized(rawSettings.openingHours || ''),
          socialLinks:
            rawSettings.socialLinks && typeof rawSettings.socialLinks === 'object'
              ? rawSettings.socialLinks
              : {},
          deliveryFee: Number(rawSettings.deliveryFee) || 0,
          minOrderAmount: Number(rawSettings.minOrderAmount) || 0,
          taxPercent: Number(rawSettings.taxRatePercent ?? rawSettings.taxPercent) || 0,
          serviceChargePercent: Number(rawSettings.serviceChargePercent) || 0,
          currency: '৳',
          defaultLanguage: (['en', 'bn'].includes(String(rawSettings.defaultLanguage))
            ? rawSettings.defaultLanguage
            : 'en') as 'en' | 'bn',
          acceptingOrders: onlineOrderingEnabled,
          qrTableOrderingEnabled,
          reviews: Array.isArray(rawSettings.reviews) ? rawSettings.reviews : [],
        },
      },
      200,
      origin,
      env
    );
  }

  // ── Table QR Verification (`POST /api/tables/verify`) ───────────────────
  if (p === '/api/tables/verify' && req.method === 'POST') {
    const b = await req.json<Record<string, unknown>>();
    const tableId = String(b.tableId || '').trim();
    const tableNumber = String(b.tableNumber || b.table || b.number || '').trim();
    if (!tableId && !tableNumber) {
      return json(err('Table identifier is required'), 400, origin, env);
    }

    const matched = await resolveVerifiedTable(env.DB, rid, tableId, tableNumber);
    if (!matched) {
      return json(err('Table not found. Please scan a valid table QR code or ask staff.'), 404, origin, env);
    }

    const displayNumber = matched.table_code.replace(/^T[-_]?/i, '') || matched.table_code;
    return json(
      {
        ok: true,
        tableId: matched.id,
        tableCode: matched.table_code,
        tableNumber: displayNumber,
        tableName: matched.zone
          ? `Table ${matched.table_code} · ${matched.zone}`
          : `Table ${matched.table_code}`,
      },
      200,
      origin,
      env
    );
  }

  // ── Waiter Call Submission (`POST /api/waiter-calls`) ───────────────────
  if (p === '/api/waiter-calls' && req.method === 'POST') {
    const b = await req.json<Record<string, unknown>>();
    const rawTableId = String(b.tableId || '').trim();
    const rawTableNumber = String(b.tableNumber || '').trim();
    const requestType = String(b.requestType || 'Table Assistance').trim().slice(0, 80) || 'Table Assistance';
    const note = String(b.note || '').trim().slice(0, 300);

    const table = await resolveVerifiedTable(env.DB, rid, rawTableId, rawTableNumber);
    if (!table) {
      return json(
        err('Verified table is required. Please scan the QR code on your table first.'),
        404,
        origin,
        env
      );
    }

    const recent = await env.DB.prepare(
      `SELECT id FROM waiter_calls
       WHERE table_id = ? AND restaurant_id = ?
         AND status IN ('incoming', 'acknowledged')
         AND created_at >= datetime('now', '-45 seconds')
       ORDER BY created_at DESC
       LIMIT 1`
    )
      .bind(table.id, rid)
      .first();

    if (recent) {
      return json(
        {
          ok: false,
          error: 'Please wait a moment before sending another waiter request.',
          remainingSeconds: 45,
        },
        429,
        origin,
        env
      );
    }

    const callId = uid();
    await env.DB.prepare(
      `INSERT INTO waiter_calls (id, restaurant_id, table_id, request_type, note, status)
       VALUES (?, ?, ?, ?, ?, 'incoming')`
    )
      .bind(callId, rid, table.id, requestType, note)
      .run();

    return json(
      {
        ok: true,
        id: callId,
        tableId: table.id,
        tableNumber: table.table_code.replace(/^T[-_]?/i, '') || table.table_code,
      },
      201,
      origin,
      env
    );
  }

  // ── Live Order Status Lookup (`POST /api/orders/status`) ────────────────
  if (p === '/api/orders/status' && req.method === 'POST') {
    const b = await req.json<{ orderIds?: unknown; orderRefs?: unknown }>();
    const orderIds = Array.isArray(b.orderIds)
      ? b.orderIds
          .map((x) => String(x || '').trim())
          .filter((x) => x.length > 0)
          .slice(0, 25)
      : [];
    const orderRefs = Array.isArray(b.orderRefs)
      ? b.orderRefs
          .map((x) => String(x || '').trim().toUpperCase())
          .filter((x) => x.length > 0)
          .slice(0, 25)
      : [];
    if (orderIds.length === 0 && orderRefs.length === 0) {
      return json({ orders: [] }, 200, origin, env);
    }

    const clauses: string[] = [];
    const params: string[] = [rid];
    if (orderIds.length > 0) {
      clauses.push(`id IN (${orderIds.map(() => '?').join(',')})`);
      params.push(...orderIds);
    }
    if (orderRefs.length > 0) {
      clauses.push(`upper(order_number) IN (${orderRefs.map(() => '?').join(',')})`);
      params.push(...orderRefs);
    }

    const rows = await env.DB.prepare(
      `SELECT id, order_number, status, COALESCE(staff_note, '') AS staff_note, updated_at
       FROM orders
       WHERE restaurant_id = ? AND (${clauses.join(' OR ')})`
    )
      .bind(...params)
      .all<{
        id: string;
        order_number: string;
        status: string;
        staff_note: string;
        updated_at: string;
      }>();

    return json(
      {
        orders: (rows.results || []).map((r) => ({
          orderId: r.id,
          orderRef: r.order_number,
          status: mapDbOrderStatusToCustomer(r.status),
          staffNote: r.staff_note || undefined,
          updatedAt: r.updated_at,
        })),
      },
      200,
      origin,
      env
    );
  }

  // ── Checkout & Server-Validated Order Creation (`POST /api/orders/prepare`)
  if (p === '/api/orders/prepare' && req.method === 'POST') {
    const b = await req.json<Record<string, unknown>>();
    const type = String(b.orderType || 'takeaway');
    if (!['dine_in', 'takeaway', 'delivery'].includes(type)) {
      return json(err('Invalid order type'), 400, origin, env);
    }

    const settingsRow = await env.DB.prepare(
      `SELECT settings_json FROM restaurant_settings WHERE restaurant_id = ?`
    )
      .bind(rid)
      .first<{ settings_json: string }>();
    const st = safeJsonParse<Record<string, unknown>>(settingsRow?.settings_json, {});

    const onlineOrderingEnabled =
      st.onlineOrderingEnabled !== false && st.acceptingOrders !== false;
    const qrTableOrderingEnabled = st.qrTableOrderingEnabled !== false;

    if (type === 'dine_in' && !qrTableOrderingEnabled) {
      return json(err('QR table ordering is currently paused. Please order with your server.'), 403, origin, env);
    }
    if ((type === 'takeaway' || type === 'delivery') && !onlineOrderingEnabled) {
      return json(err('Online ordering is currently closed.'), 403, origin, env);
    }

    // Check Idempotency-Key first so retries never fail or duplicate orders
    const idempotencyKey = (
      req.headers.get('Idempotency-Key') ||
      String(b.idempotencyKey || '')
    ).trim();
    if (idempotencyKey) {
      const existingOrder = await env.DB.prepare(
        `SELECT o.*, t.table_code
         FROM orders o
         LEFT JOIN restaurant_tables t ON t.id = o.table_id
         WHERE o.restaurant_id = ? AND o.idempotency_key = ?
         LIMIT 1`
      )
        .bind(rid, idempotencyKey)
        .first<Record<string, unknown>>();

      if (existingOrder) {
        const existingLines = await env.DB.prepare(
          `SELECT menu_item_id, item_name_snapshot, quantity, unit_price_minor, line_total_minor, COALESCE(options_snapshot_json, '{}') AS options_snapshot_json
           FROM order_items WHERE order_id = ? AND restaurant_id = ?`
        )
          .bind(String(existingOrder.id), rid)
          .all<Record<string, unknown>>();

        return json(
          {
            orderId: String(existingOrder.id),
            orderRef: String(existingOrder.order_number),
            orderType: String(existingOrder.order_type),
            customerName: String(existingOrder.customer_name),
            customerPhone: String(existingOrder.customer_phone || ''),
            deliveryAddress: String(existingOrder.delivery_address || ''),
            tableNumber: existingOrder.table_code
              ? String(existingOrder.table_code).replace(/^T[-_]?/i, '') ||
                String(existingOrder.table_code)
              : '',
            items: (existingLines.results || []).map((l) => {
              const snap = safeJsonParse<Record<string, unknown>>(
                String(l.options_snapshot_json || '{}'),
                {}
              );
              return {
                productId: String(l.menu_item_id || ''),
                name: String(l.item_name_snapshot),
                quantity: Number(l.quantity),
                unitPrice: Number(l.unit_price_minor) / 100,
                lineTotal: Number(l.line_total_minor) / 100,
                variantLabel: snap.variantLabel ? String(snap.variantLabel) : undefined,
                customisations: Array.isArray(snap.customisations) ? snap.customisations : [],
                selectedSides: Array.isArray(snap.selectedSides) ? snap.selectedSides : [],
                specialInstructions: snap.specialInstructions
                  ? String(snap.specialInstructions)
                  : undefined,
              };
            }),
            subtotal: Number(existingOrder.subtotal_minor || 0) / 100,
            deliveryFee: Number(existingOrder.delivery_fee_minor || 0) / 100,
            serviceCharge: Number(existingOrder.service_charge_minor || 0) / 100,
            taxAmount: Number(existingOrder.tax_minor || 0) / 100,
            discountAmount: Number(existingOrder.discount_minor || 0) / 100,
            promoCode: existingOrder.promo_code ? String(existingOrder.promo_code) : undefined,
            redeemedPoints: 0,
            loyaltyDiscountAmount: 0,
            total: Number(existingOrder.total_minor || 0) / 100,
            whatsappNumber: String(st.whatsappNumber || st.phone || env.WHATSAPP_NUMBER || ''),
          },
          200,
          origin,
          env
        );
      }
    }

    const signedInCustomer = await getCustomerFromSession(req, env.DB, rid);
    const name = String(b.customerName || signedInCustomer?.name || '').trim();
    const phone = String(b.customerPhone || signedInCustomer?.phone || '').trim();
    const deliveryAddress = String(b.deliveryAddress || '').trim();
    if (!name || !phone) {
      return json(err('Customer name and phone number are required'), 400, origin, env);
    }
    if (type === 'delivery' && !deliveryAddress) {
      return json(err('Delivery address is required for delivery orders'), 400, origin, env);
    }

    let verifiedTable: { id: string; table_code: string } | null = null;
    if (type === 'dine_in') {
      const rawTableId = String(b.tableId || '').trim();
      const rawTableNumber = String(b.tableNumber || '').trim();
      if (!rawTableId && !rawTableNumber) {
        return json(err('Please scan or enter a valid table number for dine-in orders.'), 400, origin, env);
      }
      verifiedTable = await resolveVerifiedTable(env.DB, rid, rawTableId, rawTableNumber);
      if (!verifiedTable) {
        return json(err('Table could not be verified. Please scan your table QR code again.'), 400, origin, env);
      }
    }

    const rawItems = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : [];
    if (rawItems.length === 0 || rawItems.length > 40) {
      return json(err('Your cart is empty or exceeds the maximum item limit.'), 400, origin, env);
    }

    const globalGroups = Array.isArray(st.customisationGroups)
      ? (st.customisationGroups as Record<string, unknown>[])
      : [];

    const verifiedItems: Array<{
      productId: string;
      name: string;
      quantity: number;
      unitPrice: number;
      lineTotal: number;
      unitPriceMinor: number;
      lineTotalMinor: number;
      variantLabel?: string;
      customisations: Array<{ groupName: string; optionName: string; price: number }>;
      selectedSides: string[];
      specialInstructions?: string;
      optionsSnapshotJson: string;
    }> = [];

    let subtotalMinor = 0;

    for (const entry of rawItems) {
      const productId = String(entry.productId || '').trim();
      const qty = Number(entry.quantity);
      if (!productId || !Number.isInteger(qty) || qty < 1 || qty > 50) {
        return json(err('Invalid item quantity in cart'), 400, origin, env);
      }

      const product = await env.DB.prepare(
        `SELECT id, category_id, name, price_minor, available, COALESCE(options_json, '{}') AS options_json
         FROM menu_items
         WHERE id = ? AND restaurant_id = ?`
      )
        .bind(productId, rid)
        .first<{
          id: string;
          category_id: string | null;
          name: string;
          price_minor: number;
          available: number;
          options_json: string;
        }>();

      if (!product || !product.available) {
        return json(
          err(
            product
              ? `"${product.name}" is currently sold out. Please remove it from your cart.`
              : 'One or more items in your cart are no longer on the live menu. Please refresh the menu.'
          ),
          409,
          origin,
          env
        );
      }

      const opts = safeJsonParse<Record<string, unknown>>(product.options_json, {});
      let basePriceMinor = Number(product.price_minor || 0);
      let resolvedVariantLabel: string | undefined;

      // Server-side variant validation & price lookup
      if (entry.variantId) {
        const variants = Array.isArray(opts.variants)
          ? (opts.variants as Record<string, unknown>[])
          : [];
        const matchedVariant = variants.find((v) => String(v.id) === String(entry.variantId));
        if (!matchedVariant) {
          return json(
            err(`Selected size/variant for "${product.name}" is no longer available. Please refresh your menu.`),
            422,
            origin,
            env
          );
        }
        basePriceMinor = Math.round(Number(matchedVariant.price || 0) * 100);
        const lbl = localized(matchedVariant.label || matchedVariant.name || '');
        resolvedVariantLabel = lbl.en;
      }

      // Server-side customisations validation & price calculation
      let addonsMinor = 0;
      const resolvedCustomisations: Array<{
        groupName: string;
        optionName: string;
        price: number;
      }> = [];

      if (Array.isArray(entry.customisations) && entry.customisations.length > 0) {
        const itemGroups = Array.isArray(opts.customisationGroups)
          ? (opts.customisationGroups as Record<string, unknown>[])
          : [];
        const allGroups = [...globalGroups, ...itemGroups];

        for (const rawCust of entry.customisations as Record<string, unknown>[]) {
          const groupId = String(rawCust.groupId || '');
          const optionId = String(rawCust.optionId || '');
          const matchedGroup = allGroups.find((g) => String(g.id) === groupId);
          const groupOptions = Array.isArray(matchedGroup?.options)
            ? (matchedGroup!.options as Record<string, unknown>[])
            : [];
          const matchedOption = groupOptions.find((o) => String(o.id) === optionId);
          if (!matchedGroup || !matchedOption) {
            return json(
              err(`Selected add-on for "${product.name}" is not configured on the live menu. Please refresh.`),
              422,
              origin,
              env
            );
          }
          const optPriceMinor = Math.round(Number(matchedOption.price || 0) * 100);
          addonsMinor += optPriceMinor;
          resolvedCustomisations.push({
            groupName: localized(matchedGroup.name).en,
            optionName: localized(matchedOption.name).en,
            price: optPriceMinor / 100,
          });
        }
      }

      const selectedSides = Array.isArray(entry.selectedSides)
        ? (entry.selectedSides as unknown[])
            .map((s) => String(s || '').trim())
            .filter(Boolean)
            .slice(0, 6)
        : [];
      const specialInstructions = String(entry.specialInstructions || '').trim().slice(0, 300);

      const unitPriceMinor = basePriceMinor + addonsMinor;
      const lineTotalMinor = unitPriceMinor * qty;
      subtotalMinor += lineTotalMinor;

      const snapshotName = resolvedVariantLabel
        ? `${product.name} (${resolvedVariantLabel})`
        : product.name;

      verifiedItems.push({
        productId: product.id,
        name: snapshotName,
        quantity: qty,
        unitPrice: unitPriceMinor / 100,
        lineTotal: lineTotalMinor / 100,
        unitPriceMinor,
        lineTotalMinor,
        variantLabel: resolvedVariantLabel,
        customisations: resolvedCustomisations,
        selectedSides,
        specialInstructions: specialInstructions || undefined,
        optionsSnapshotJson: JSON.stringify({
          variantLabel: resolvedVariantLabel,
          customisations: resolvedCustomisations,
          selectedSides,
          specialInstructions,
        }),
      });
    }

    const minOrderMinor = Math.round((Number(st.minOrderAmount) || 0) * 100);
    if (minOrderMinor > 0 && subtotalMinor < minOrderMinor) {
      return json(
        err(`Minimum order subtotal is ${toCurrencySymbol(String(st.currency || restaurant.currency))}${minOrderMinor / 100}.`),
        400,
        origin,
        env
      );
    }

    // Server-side promo code validation & discount calculation
    let discountMinor = 0;
    let appliedPromoId: string | null = null;
    let appliedPromoCode: string | null = null;
    const rawPromoCode = String(b.promoCode || '').trim().toUpperCase();

    if (rawPromoCode.startsWith('__OFFER_')) {
      return json(err('Invalid promo code.'), 400, origin, env);
    }

    if (rawPromoCode) {
      const promo = await env.DB.prepare(
        `SELECT id, code, discount_type, discount_value_minor, min_order_minor, valid_from, valid_until, active
         FROM promotions
         WHERE restaurant_id = ? AND upper(code) = ? AND active = 1
         LIMIT 1`
      )
        .bind(rid, rawPromoCode)
        .first<{
          id: string;
          code: string;
          discount_type: string;
          discount_value_minor: number;
          min_order_minor: number;
          valid_from: string;
          valid_until: string;
          active: number;
        }>();

      const today = new Date().toISOString().slice(0, 10);
      const validFrom = String(promo?.valid_from || '').slice(0, 10);
      const validUntil = String(promo?.valid_until || '').slice(0, 10);

      if (
        !promo ||
        (validFrom && validFrom > today) ||
        (validUntil && validUntil < today)
      ) {
        return json(err(`Promo code "${rawPromoCode}" is invalid or expired.`), 400, origin, env);
      }

      if (Number(promo.min_order_minor || 0) > subtotalMinor) {
        return json(
          err(
            `Promo code "${rawPromoCode}" requires a minimum subtotal of ${toCurrencySymbol(
              String(st.currency || restaurant.currency)
            )}${Number(promo.min_order_minor) / 100}.`
          ),
          400,
          origin,
          env
        );
      }

      if (promo.discount_type === 'percentage') {
        const pct = Number(promo.discount_value_minor || 0) / 100;
        discountMinor = Math.min(subtotalMinor, Math.round((subtotalMinor * pct) / 100));
      } else if (promo.discount_type === 'fixed_amount') {
        discountMinor = Math.min(subtotalMinor, Number(promo.discount_value_minor || 0));
      }
      appliedPromoId = promo.id;
      appliedPromoCode = promo.code.toUpperCase();
    }

    const discountedSubtotalMinor = Math.max(0, subtotalMinor - discountMinor);
    const deliveryFeeMinor =
      type === 'delivery' ? Math.round((Number(st.deliveryFee) || 0) * 100) : 0;
    const taxRate = Number(st.taxRatePercent ?? st.taxPercent ?? 0) || 0;
    const serviceRate = Number(st.serviceChargePercent ?? 0) || 0;
    const taxMinor = Math.round((discountedSubtotalMinor * taxRate) / 100);
    const serviceMinor =
      type === 'dine_in' ? Math.round((discountedSubtotalMinor * serviceRate) / 100) : 0;
    const totalMinor = discountedSubtotalMinor + deliveryFeeMinor + taxMinor + serviceMinor;

    const orderId = uid();
    const datePart = new Date().toISOString().replace(/\D/g, '').slice(0, 8);
    const orderRef = `ZST-${datePart}-${uid().slice(0, 5).toUpperCase()}`;
    const customerNote = String(b.notes || '').trim().slice(0, 1000);
    const finalIdempotencyKey = idempotencyKey || orderId;

    const batchStatements: D1PreparedStatement[] = [
      env.DB.prepare(
        `INSERT INTO orders (
           id, restaurant_id, order_number, table_id, customer_name, customer_phone,
           delivery_address, order_type, status, subtotal_minor, discount_minor,
           tax_minor, service_charge_minor, delivery_fee_minor, total_minor,
           promo_code, customer_note, idempotency_key, customer_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        orderId,
        rid,
        orderRef,
        verifiedTable?.id ?? null,
        name,
        phone,
        deliveryAddress,
        type,
        subtotalMinor,
        discountMinor,
        taxMinor,
        serviceMinor,
        deliveryFeeMinor,
        totalMinor,
        appliedPromoCode,
        customerNote,
        finalIdempotencyKey,
        signedInCustomer?.id || null
      ),
      ...verifiedItems.map((item) =>
        env.DB.prepare(
          `INSERT INTO order_items (
             id, restaurant_id, order_id, menu_item_id, item_name_snapshot,
             quantity, unit_price_minor, line_total_minor, options_snapshot_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          uid(),
          rid,
          orderId,
          item.productId,
          item.name,
          item.quantity,
          item.unitPriceMinor,
          item.lineTotalMinor,
          item.optionsSnapshotJson
        )
      ),
    ];

    if (appliedPromoId) {
      batchStatements.push(
        env.DB.prepare(
          `UPDATE promotions SET usage_count = COALESCE(usage_count, 0) + 1 WHERE id = ? AND restaurant_id = ?`
        ).bind(appliedPromoId, rid)
      );
    }

    if (verifiedTable) {
      batchStatements.push(
        env.DB.prepare(
          `UPDATE restaurant_tables SET status = 'occupied', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND restaurant_id = ?`
        ).bind(verifiedTable.id, rid)
      );
    }

    await env.DB.batch(batchStatements);

    return json(
      {
        orderId,
        orderRef,
        orderType: type,
        customerName: name,
        customerPhone: phone,
        deliveryAddress,
        tableNumber: verifiedTable
          ? verifiedTable.table_code.replace(/^T[-_]?/i, '') || verifiedTable.table_code
          : '',
        items: verifiedItems.map(
          ({ unitPriceMinor, lineTotalMinor, optionsSnapshotJson, ...restItem }) => restItem
        ),
        subtotal: subtotalMinor / 100,
        deliveryFee: deliveryFeeMinor / 100,
        serviceCharge: serviceMinor / 100,
        taxAmount: taxMinor / 100,
        discountAmount: discountMinor / 100,
        promoCode: appliedPromoCode || undefined,
        redeemedPoints: 0,
        loyaltyDiscountAmount: 0,
        total: totalMinor / 100,
        whatsappNumber: String(st.whatsappNumber || st.phone || env.WHATSAPP_NUMBER || ''),
      },
      201,
      origin,
      env
    );
  }

  return json(err('Not found'), 404, origin, env);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const origin = req.headers.get('Origin');
    const allowed = parseAllowedOrigins(env);
    if (origin && !allowed.includes(origin)) {
      return json({ error: 'Origin not allowed' }, 403, origin, env);
    }
    try {
      return await handle(req, env);
    } catch (e) {
      console.error('ZESTRO public API error:', e);
      return json({ error: 'Internal server error' }, 500, origin, env);
    }
  },
};
