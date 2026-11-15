import { authenticateSession, type SessionAuthEnv, type SessionAuthOutcome } from './auth-middleware';
import { handleAuthRequest, createInvitationAuthUser } from './auth-schema';
import { issueInvitation, getInvitation, reserveInvitation, attachAuthUserToInvitation, activateInvitationMembership, revokeInvitation } from './auth-invitations';
import { sendInvitationEmail } from './auth-email';

export interface Env extends SessionAuthEnv {
  DB: D1Database;
  MEDIA: R2Bucket;
  ALLOWED_ORIGINS: string;
}

type DbRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';
type UiStaffRole = 'Owner' | 'Manager' | 'Head Chef' | 'Server' | 'Host';

interface Member {
  id: string;
  restaurant_id: string;
  auth_subject: string;
  email: string;
  display_name: string;
  role: DbRole;
  job_title: string;
  restaurant_name: string;
  restaurant_slug: string;
  restaurant_currency: string;
  restaurant_timezone: string;
  restaurant_status: string;
}

// Dependency injection is available only to unit tests. The exported Worker
// uses authenticateSession by default for every business API route.
export interface AdminWorkerOptions {
  sessionResolver?: (req: Request, env: Env) => Promise<SessionAuthOutcome>;
}

const uid = () => crypto.randomUUID();

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const fail = (message: string, status = 400) => json({ error: message }, status);

const parseAllowedOrigins = (env: Env): string[] =>
  (env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);

function withCors(response: Response, origin: string | null, env: Env): Response {
  const headers = new Headers(response.headers);
  if (origin && parseAllowedOrigins(env).includes(origin)) {
    headers.set('access-control-allow-origin', origin);
    headers.set('vary', 'Origin');
    headers.set('access-control-allow-credentials', 'true');
  }
  headers.set('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  headers.set(
    'access-control-allow-headers',
    'Content-Type,X-Restaurant-Id,x-file-name,x-title,x-folder,x-dimensions'
  );
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  return new Response(response.body, { status: response.status, headers });
}

function safeJsonParse<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function formatCurrencyLabel(codeOrLabel: string | null | undefined): string {
  const v = String(codeOrLabel || 'BDT').trim();
  if (v.includes('(')) return v;
  const upper = v.toUpperCase();
  const map: Record<string, string> = {
    BDT: 'BDT (৳)',
    '৳': 'BDT (৳)',
    USD: 'USD ($)',
    $: 'USD ($)',
    EUR: 'EUR (€)',
    '€': 'EUR (€)',
    GBP: 'GBP (£)',
    '£': 'GBP (£)',
    SAR: 'SAR (﷼)',
    INR: 'INR (₹)',
  };
  return map[upper] || 'BDT (৳)';
}

function extractCurrencyCode(labelOrCode: string | null | undefined): string {
  const v = String(labelOrCode || 'BDT').trim();
  const match = v.toUpperCase().match(/\b(BDT|USD|EUR|GBP|SAR|INR)\b/);
  return match ? match[1] : 'BDT';
}

function mapDbRoleToUi(role: DbRole, jobTitle?: string | null): UiStaffRole {
  const jt = String(jobTitle || '').trim();
  if (jt === 'Owner' || jt === 'Manager' || jt === 'Head Chef' || jt === 'Server' || jt === 'Host') {
    return jt;
  }
  if (role === 'owner') return 'Owner';
  if (role === 'admin' || role === 'manager') return 'Manager';
  return 'Server';
}

function mapUiRoleToDb(uiRole: string): { role: DbRole; jobTitle: UiStaffRole } {
  switch (uiRole) {
    case 'Owner':
    case 'owner':
      return { role: 'owner', jobTitle: 'Owner' };
    case 'Manager':
    case 'admin':
    case 'manager':
      return { role: 'manager', jobTitle: 'Manager' };
    case 'Head Chef':
      return { role: 'staff', jobTitle: 'Head Chef' };
    case 'Host':
      return { role: 'staff', jobTitle: 'Host' };
    case 'Server':
    case 'staff':
    default:
      return { role: 'staff', jobTitle: 'Server' };
  }
}

const canOperate = (m: Member): boolean =>
  ['owner', 'admin', 'manager', 'staff'].includes(m.role);

const canManage = (m: Member): boolean =>
  ['owner', 'admin', 'manager'].includes(m.role);

const canManageStaff = (m: Member): boolean =>
  ['owner', 'admin'].includes(m.role);

async function audit(
  env: Env,
  m: Member,
  action: string,
  resourceType: string,
  resourceId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_logs (id, restaurant_id, membership_id, action, resource_type, resource_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(uid(), m.restaurant_id, m.id, action, resourceType, resourceId, JSON.stringify(metadata))
    .run();
}

const DEFAULT_HOMEPAGE_SECTIONS = [
  {
    id: 'sec-hero',
    label: 'Hero Banner & Ordering CTA',
    description: 'Full-height showcase with signature photography and quick menu actions.',
    visible: true,
    order: 1,
  },
  {
    id: 'sec-featured',
    label: 'Signature Dishes Carousel',
    description: 'Highlights items marked as Featured in Menu Management.',
    visible: true,
    order: 2,
  },
  {
    id: 'sec-story',
    label: 'Culinary Philosophy & Heritage',
    description: 'Editorial block introducing the kitchen team and seasonal sourcing.',
    visible: true,
    order: 3,
  },
  {
    id: 'sec-promos',
    label: 'Seasonal Experiences & Offers',
    description: 'Displays active promotional campaigns from the Promotions module.',
    visible: true,
    order: 4,
  },
  {
    id: 'sec-gallery',
    label: 'Atmosphere & Dining Room Gallery',
    description: 'Curated photo grid managed from the Gallery module.',
    visible: true,
    order: 5,
  },
];

function buildSettingsPayload(member: Member, rawSettings: Record<string, unknown>) {
  return {
    restaurantName: String(rawSettings.restaurantName || member.restaurant_name || 'ZESTRO'),
    tagline: String(
      rawSettings.tagline || 'Modern Café & Restaurant · Crafted Flavours, Warm Hospitality'
    ),
    cuisineType: String(rawSettings.cuisineType || 'Modern Café & Multi-Cuisine'),
    currency: formatCurrencyLabel(String(rawSettings.currency || member.restaurant_currency || 'BDT')),
    taxRatePercent: Number(rawSettings.taxRatePercent ?? rawSettings.taxPercent ?? 0) || 0,
    serviceChargePercent: Number(rawSettings.serviceChargePercent ?? 0) || 0,
    deliveryFee: Number(rawSettings.deliveryFee ?? 0) || 0,
    minOrderAmount: Number(rawSettings.minOrderAmount ?? 0) || 0,
    phone: String(rawSettings.phone || rawSettings.contactPhone || '+8801601987672'),
    whatsappNumber: String(rawSettings.whatsappNumber || rawSettings.phone || '+8801601987672'),
    email: String(rawSettings.email || member.email || 'zestro.syl@gmail.com'),
    address:
      typeof rawSettings.address === 'string'
        ? rawSettings.address
        : typeof (rawSettings.address as { en?: string } | undefined)?.en === 'string'
        ? String((rawSettings.address as { en: string }).en)
        : '',
    openingHours:
      typeof rawSettings.openingHours === 'string'
        ? rawSettings.openingHours
        : typeof (rawSettings.openingHours as { en?: string } | undefined)?.en === 'string'
        ? String((rawSettings.openingHours as { en: string }).en)
        : 'Daily: 12:00 PM – 11:00 PM',
    websiteUrl: String(rawSettings.websiteUrl || 'https://zestro-customer-website.pages.dev'),
    onlineOrderingEnabled: rawSettings.onlineOrderingEnabled !== false && rawSettings.acceptingOrders !== false,
    qrTableOrderingEnabled: rawSettings.qrTableOrderingEnabled !== false,
    autoAcceptOrders: Boolean(rawSettings.autoAcceptOrders),
    waiterCallSoundEnabled: rawSettings.waiterCallSoundEnabled !== false,
    logoKey: String(rawSettings.logoKey || ''),
    logoUrl: rawSettings.logoKey
      ? `/api/media?key=${encodeURIComponent(String(rawSettings.logoKey))}`
      : String(rawSettings.logoUrl || ''),
  };
}

function buildHomepagePayload(rawSettings: Record<string, unknown>) {
  const hp = (rawSettings.homepageConfig as Record<string, unknown> | undefined) || {};
  const heroImageKey = String(hp.heroImageKey || '');
  const rawHeroUrl = String(hp.heroImageUrl || '');
  const heroImageUrl = heroImageKey
    ? `/api/media?key=${encodeURIComponent(heroImageKey)}`
    : rawHeroUrl || '/images/hero-interior.jpg';

  return {
    heroImageKey,
    heroImageUrl,
    heroHeadline: String(hp.heroHeadline || 'Crafted Flavours, Served Fresh at Zestro'),
    heroSubheadline: String(
      hp.heroSubheadline ||
        'Artisan burgers, signature platters, specialty coffee, and warm dining hospitality.'
    ),
    heroCtaText: String(hp.heroCtaText || 'Explore Digital Menu'),
    promoBannerEnabled: Boolean(hp.promoBannerEnabled),
    promoBannerText: String(hp.promoBannerText || ''),
    promoBannerCode: String(hp.promoBannerCode || ''),
    sections: Array.isArray(hp.sections) && hp.sections.length > 0 ? hp.sections : DEFAULT_HOMEPAGE_SECTIONS,
  };
}

function formatAuditEvent(row: {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata_json: string;
  created_at: string;
  actor_name: string | null;
}) {
  const meta = safeJsonParse<Record<string, unknown>>(row.metadata_json, {});
  const actor = row.actor_name || 'Staff';
  let type: 'order' | 'waiter' | 'menu' | 'staff' = 'menu';
  let title = row.action;
  let detail = `Updated by ${actor}`;

  if (row.action.startsWith('order.')) {
    type = 'order';
    const orderNum = String(meta.orderNumber || row.resource_id || '');
    if (row.action === 'order.created') {
      title = `Order ${orderNum} created`;
      detail = `${meta.orderType || 'Order'} · logged by ${actor}`;
    } else {
      title = `Order ${orderNum ? `${orderNum} ` : ''}marked ${meta.status || 'updated'}`;
      detail = `Updated by ${actor}`;
    }
  } else if (row.action.startsWith('waiter_call.')) {
    type = 'waiter';
    title =
      row.action === 'waiter_call.created'
        ? `Waiter call logged (${meta.tableNumber ? `Table ${meta.tableNumber}` : 'Floor'})`
        : `Waiter call ${meta.status || 'updated'}`;
    detail = `Handled by ${actor}`;
  } else if (row.action.startsWith('staff.')) {
    type = 'staff';
    title =
      row.action === 'staff.created'
        ? `Team member ${meta.name || ''} invited`.trim()
        : row.action === 'staff.deleted'
        ? `Team member removed`
        : `Team member ${meta.name || ''} updated`.trim();
    detail = `By ${actor}`;
  } else if (row.action.startsWith('menu.')) {
    type = 'menu';
    title =
      row.action === 'menu.item.created'
        ? `Dish "${meta.name || 'New dish'}" added`
        : row.action === 'menu.item.deleted'
        ? `Dish removed from catalog`
        : row.action === 'menu.category.created'
        ? `Category "${meta.name || 'New category'}" created`
        : row.action === 'menu.category.deleted'
        ? `Category removed`
        : `Menu catalog updated`;
    detail = `By ${actor}`;
  } else {
    type = 'menu';
    title = row.action.replace(/\./g, ' · ');
    detail = `By ${actor}`;
  }

  return {
    id: row.id,
    title,
    detail,
    time: row.created_at,
    createdAt: row.created_at,
    type,
  };
}

function normalizeTableCodeLookup(raw: string): string {
  const cleaned = raw.trim().replace(/^table[-_\s]*/i, '').replace(/^T[-_\s]*/i, '');
  return /^\d+$/.test(cleaned) ? cleaned.padStart(2, '0') : cleaned;
}

function mapMenuRow(row: Record<string, unknown>) {
  const imageKey = row.image_key ? String(row.image_key) : '';
  const rawImageUrl = row.image_url ? String(row.image_url) : '';
  const imageUrl = imageKey
    ? `/api/media?key=${encodeURIComponent(imageKey)}`
    : rawImageUrl;

  return {
    id: String(row.id),
    categoryId: row.category_id ? String(row.category_id) : '',
    name: String(row.name || ''),
    description: String(row.description || ''),
    priceMinor: Number(row.price_minor || 0),
    price: Number(row.price_minor || 0) / 100,
    imageKey: imageKey || null,
    imageUrl,
    available: Boolean(row.available),
    featured: Boolean(row.featured),
    prepMinutes: Number(row.prep_minutes ?? 15),
    dietaryTags: safeJsonParse<string[]>(String(row.dietary_tags_json || '[]'), []),
    options: safeJsonParse<Record<string, unknown>>(String(row.options_json || '{}'), {}),
    sortOrder: Number(row.sort_order ?? 0),
    ordersCount: Number(row.orders_count ?? 0),
  };
}

function mapMediaRow(row: Record<string, unknown>) {
  const objectKey = String(row.object_key || '');
  const sizeBytes = Number(row.size_bytes || 0);
  return {
    id: String(row.id),
    title: String(row.title || 'Uploaded Image'),
    url: `/api/media?key=${encodeURIComponent(objectKey)}`,
    r2Key: objectKey,
    folder: (['dishes', 'ambiance', 'banners', 'gallery'].includes(String(row.folder))
      ? String(row.folder)
      : 'dishes') as 'dishes' | 'ambiance' | 'banners' | 'gallery',
    mimeType: String(row.mime_type || 'image/jpeg'),
    dimensions: String(row.dimensions || 'Auto'),
    sizeBytes,
    sizeKb: Math.max(1, Math.round(sizeBytes / 1024)),
    uploadedAt: String(row.created_at || '').slice(0, 10) || new Date().toISOString().slice(0, 10),
  };
}

interface OfferMetaEntry {
  discountText?: string;
  hasPromoCode?: boolean;
}

async function loadOfferMeta(
  db: D1Database,
  rid: string
): Promise<Record<string, OfferMetaEntry>> {
  const row = await db
    .prepare(`SELECT settings_json FROM restaurant_settings WHERE restaurant_id = ?`)
    .bind(rid)
    .first<{ settings_json: string }>();
  const raw = safeJsonParse<Record<string, unknown>>(row?.settings_json, {});
  const meta = raw.offerMeta;
  return meta && typeof meta === 'object' ? (meta as Record<string, OfferMetaEntry>) : {};
}

async function saveOfferMeta(
  db: D1Database,
  rid: string,
  offerMeta: Record<string, OfferMetaEntry>
): Promise<void> {
  const row = await db
    .prepare(`SELECT settings_json FROM restaurant_settings WHERE restaurant_id = ?`)
    .bind(rid)
    .first<{ settings_json: string }>();
  const existing = safeJsonParse<Record<string, unknown>>(row?.settings_json, {});
  const next = { ...existing, offerMeta };
  await db
    .prepare(
      `INSERT INTO restaurant_settings (restaurant_id, settings_json, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (restaurant_id) DO UPDATE SET
         settings_json = excluded.settings_json,
         updated_at = CURRENT_TIMESTAMP`
    )
    .bind(rid, JSON.stringify(next))
    .run();
}

function isValidIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function mapPromotionRow(
  row: Record<string, unknown>,
  offerMeta: Record<string, OfferMetaEntry> = {}
) {
  const id = String(row.id);
  const rawCode = String(row.code || '');
  const meta = offerMeta[id];
  const hasPromoCode = !rawCode.startsWith('__OFFER_') && meta?.hasPromoCode !== false;
  const dt = String(row.discount_type || 'percentage');
  const discountType =
    dt === 'fixed_amount'
      ? 'Fixed Amount'
      : dt === 'complimentary_item'
      ? 'Complimentary Item'
      : 'Percentage';
  return {
    id,
    title: String(row.title || ''),
    description: String(row.description || ''),
    code: hasPromoCode ? rawCode : '',
    hasPromoCode,
    discountText: typeof meta?.discountText === 'string' ? meta.discountText : '',
    discountType,
    discountValue: Number(row.discount_value_minor || 0) / 100,
    minOrder: Number(row.min_order_minor || 0) / 100,
    validFrom: String(row.valid_from || ''),
    validUntil: String(row.valid_until || ''),
    active: Boolean(row.active),
    usageCount: Number(row.usage_count || 0),
  };
}

function mapStaffRow(row: Record<string, unknown>) {
  const dbRole = String(row.role || 'staff') as DbRole;
  const duty = String(row.duty_status || 'Active');
  const status: 'On Shift' | 'Active' | 'Off Duty' =
    duty === 'On Shift' || duty === 'Off Duty' ? duty : 'Active';
  return {
    id: String(row.id),
    name: String(row.display_name || ''),
    email: String(row.email || ''),
    phone: String(row.phone || ''),
    role: mapDbRoleToUi(dbRole, String(row.job_title || '')),
    dbRole,
    status,
    membershipStatus: String(row.status || 'active'),
    shift: String(row.shift || 'Flexible Shift'),
    joinedAt: String(row.created_at || '').slice(0, 10),
  };
}

function mapGalleryRow(row: Record<string, unknown>) {
  const imageKey = row.image_key ? String(row.image_key) : '';
  const rawUrl = row.image_url ? String(row.image_url) : '';
  return {
    id: String(row.id),
    title: String(row.title || ''),
    caption: String(row.caption || ''),
    category: (['Dining Room', 'Culinary', 'Private Events', 'Bar & Lounge'].includes(
      String(row.category)
    )
      ? String(row.category)
      : 'Dining Room') as 'Dining Room' | 'Culinary' | 'Private Events' | 'Bar & Lounge',
    imageKey: imageKey || null,
    imageUrl: imageKey ? `/api/media?key=${encodeURIComponent(imageKey)}` : rawUrl,
    sortOrder: Number(row.sort_order ?? 0),
    featured: Boolean(row.featured),
  };
}

async function route(
  req: Request,
  env: Env,
  ctx?: ExecutionContext,
  sessionResolver?: (req: Request, env: Env) => Promise<SessionAuthOutcome>
): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  if ((path === '/health' || path === '/api/health') && req.method === 'GET') {
    return json({ ok: true, service: 'zestro-admin-api', time: new Date().toISOString() });
  }

  // Public invitation acceptance is a narrow exception to the session boundary.
  if (path === '/api/auth/invitation-preview' && req.method === 'GET') {
    const token = url.searchParams.get('token') || '';
    const invitation = await getInvitation(env, token);
    if (!invitation) return fail('Invitation is invalid, expired, revoked, or already used.', 400);
    return json({ email: invitation.email, name: invitation.display_name, expiresAt: invitation.expires_at });
  }

  if (path === '/api/auth/accept-invitation' && req.method === 'POST') {
    const body = await req.json<Record<string, unknown>>();
    const token = String(body.token || '');
    const password = String(body.password || '');
    if (password.length < 12 || password.length > 128) return fail('Password must be between 12 and 128 characters.', 400);
    const invitation = await getInvitation(env, token);
    if (!invitation) return fail('Invitation is invalid, expired, revoked, or already used.', 400);
    const existingUser = await env.DB.prepare('SELECT id FROM user WHERE lower(email) = lower(?) LIMIT 1')
      .bind(invitation.email).first<{id:string}>();
    if (existingUser) return fail('An account already exists for this email. Contact the restaurant owner to reissue the invitation.', 409);
    if (!await reserveInvitation(env, invitation)) return fail('This invitation is already being accepted. Please retry shortly.', 409);
    let authUserId = String(invitation.auth_user_id || '');
    if (!authUserId) {
      try {
        const created = await createInvitationAuthUser(env, { email: invitation.email, name: invitation.display_name, password });
        authUserId = String((created as any)?.user?.id || (created as any)?.id || '');
        if (!authUserId) throw new Error('Better Auth did not return a user identity.');
      } catch (error) {
        console.error('Invitation account creation failed:', error);
        return fail('Unable to create the account. The invitation remains retryable; please try again.', 503);
      }
      if (!await attachAuthUserToInvitation(env, invitation, authUserId)) {
        return fail('Account was created but the invitation could not be linked. Contact support before retrying.', 503);
      }
    }
    const latestInvitation = await getInvitation(env, token);
    if (!latestInvitation || !await activateInvitationMembership(env, latestInvitation, authUserId)) {
      return fail('Account created but membership activation is pending support recovery. No access has been granted.', 503);
    }
    return json({ ok: true, email: invitation.email });
  }

  if (path.startsWith('/api/auth/')) {
    return handleAuthRequest(req, env, ctx);
  }

  if (!path.startsWith('/api/')) return fail('Not found', 404);

  const auth = await (sessionResolver || authenticateSession)(req, env);
  if (auth.kind === 'unauthenticated') return fail(auth.message, 401);
  if (auth.kind === 'forbidden') return fail(auth.message, 403);
  const member = auth.member;
  const rid = member.restaurant_id;

  // ── Identity & Session ──────────────────────────────────────────────────
  if (path === '/api/me' && req.method === 'GET') {
    return json({
      user: {
        id: member.id,
        email: member.email,
        name: member.display_name,
        role: member.role,
        uiRole: mapDbRoleToUi(member.role, member.job_title),
      },
      restaurant: {
        id: rid,
        name: member.restaurant_name,
        slug: member.restaurant_slug,
        currency: formatCurrencyLabel(member.restaurant_currency),
        timezone: member.restaurant_timezone,
      },
    });
  }

  // ── Activity Log ────────────────────────────────────────────────────────
  if (path === '/api/activities' && req.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT a.id, a.action, a.resource_type, a.resource_id, a.metadata_json, a.created_at,
              m.display_name AS actor_name
       FROM audit_logs a
       LEFT JOIN memberships m ON m.id = a.membership_id
       WHERE a.restaurant_id = ?
       ORDER BY a.created_at DESC
       LIMIT 35`
    )
      .bind(rid)
      .all<{
        id: string;
        action: string;
        resource_type: string;
        resource_id: string | null;
        metadata_json: string;
        created_at: string;
        actor_name: string | null;
      }>();
    return json((rows.results || []).map(formatAuditEvent));
  }

  // ── Categories ──────────────────────────────────────────────────────────
  if (path === '/api/categories' && req.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT id, name, slug, description, COALESCE(category_type, 'food') AS categoryType, sort_order AS sortOrder, active
       FROM menu_categories
       WHERE restaurant_id = ?
       ORDER BY sort_order ASC, name ASC`
    )
      .bind(rid)
      .all<Record<string, unknown>>();
    return json(
      (rows.results || []).map((x) => ({
        id: String(x.id),
        name: String(x.name || ''),
        slug: String(x.slug || ''),
        description: String(x.description || ''),
        categoryType: x.categoryType === 'beverage' ? 'beverage' : 'food',
        sortOrder: Number(x.sortOrder ?? 0),
        active: Boolean(x.active),
      }))
    );
  }

  if (path === '/api/categories' && req.method === 'POST') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const b = await req.json<Record<string, unknown>>();
    const name = String(b.name || '').trim();
    if (!name) return fail('Category name is required');
    const categoryId = uid();
    const slug = String(
      b.slug ||
        name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') ||
        categoryId
    )
      .trim()
      .slice(0, 80);

    const existingSlug = await env.DB.prepare(
      `SELECT id FROM menu_categories WHERE restaurant_id = ? AND lower(slug) = lower(?) LIMIT 1`
    )
      .bind(rid, slug)
      .first();
    if (existingSlug) {
      return fail(`A category with slug "${slug}" already exists.`, 409);
    }

    const categoryType = b.categoryType === 'beverage' ? 'beverage' : 'food';
    const sortOrder = Math.max(0, Number(b.sortOrder) || 0);
    const active = b.active === false ? 0 : 1;

    await env.DB.prepare(
      `INSERT INTO menu_categories (id, restaurant_id, name, slug, description, category_type, sort_order, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(categoryId, rid, name, slug, String(b.description || '').trim(), categoryType, sortOrder, active)
      .run();

    await audit(env, member, 'menu.category.created', 'menu_category', categoryId, { name });
    return json(
      {
        id: categoryId,
        name,
        slug,
        description: String(b.description || '').trim(),
        categoryType,
        sortOrder,
        active: Boolean(active),
      },
      201
    );
  }

  if (path === '/api/categories/reorder' && req.method === 'POST') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const b = await req.json<{ orderedIds?: unknown }>();
    const orderedIds = Array.isArray(b.orderedIds)
      ? b.orderedIds.map((x) => String(x)).filter(Boolean)
      : [];
    if (orderedIds.length === 0) return fail('orderedIds array is required');

    const statements = orderedIds.map((catId, index) =>
      env.DB.prepare(
        `UPDATE menu_categories SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND restaurant_id = ?`
      ).bind(index + 1, catId, rid)
    );
    await env.DB.batch(statements);
    await audit(env, member, 'menu.category.reordered', 'menu_category', null);
    return json({ ok: true });
  }

  const categoryMatch = path.match(/^\/api\/categories\/([^/]+)$/);
  if (categoryMatch && req.method === 'PATCH') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const categoryId = decodeURIComponent(categoryMatch[1]);
    if (categoryId === 'reorder') return fail('Method not allowed', 405);

    const existing = await env.DB.prepare(
      `SELECT id FROM menu_categories WHERE id = ? AND restaurant_id = ?`
    )
      .bind(categoryId, rid)
      .first();
    if (!existing) return fail('Category not found', 404);

    const b = await req.json<Record<string, unknown>>();
    const name = b.name === undefined ? null : String(b.name).trim();
    if (name !== null && !name) return fail('Category name cannot be empty');

    const slug =
      b.slug === undefined
        ? null
        : String(b.slug)
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9-]+/g, '-')
            .replace(/^-|-$/g, '');

    if (slug) {
      const conflict = await env.DB.prepare(
        `SELECT id FROM menu_categories WHERE restaurant_id = ? AND lower(slug) = lower(?) AND id != ? LIMIT 1`
      )
        .bind(rid, slug, categoryId)
        .first();
      if (conflict) return fail(`Slug "${slug}" is already used by another category.`, 409);
    }

    const desc = b.description === undefined ? null : String(b.description).trim();
    const categoryType =
      b.categoryType === undefined ? null : b.categoryType === 'beverage' ? 'beverage' : 'food';
    const sortOrder = b.sortOrder === undefined ? null : Math.max(0, Number(b.sortOrder) || 0);
    const active = b.active === undefined ? null : b.active ? 1 : 0;

    await env.DB.prepare(
      `UPDATE menu_categories
       SET name = COALESCE(?, name),
           slug = COALESCE(?, slug),
           description = COALESCE(?, description),
           category_type = COALESCE(?, category_type),
           sort_order = COALESCE(?, sort_order),
           active = COALESCE(?, active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND restaurant_id = ?`
    )
      .bind(name, slug, desc, categoryType, sortOrder, active, categoryId, rid)
      .run();

    await audit(env, member, 'menu.category.updated', 'menu_category', categoryId, {
      name: name ?? undefined,
    });
    return json({ ok: true });
  }

  if (categoryMatch && req.method === 'DELETE') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const categoryId = decodeURIComponent(categoryMatch[1]);
    const result = await env.DB.prepare(
      `DELETE FROM menu_categories WHERE id = ? AND restaurant_id = ?`
    )
      .bind(categoryId, rid)
      .run();
    if (!result.meta.changes) return fail('Category not found', 404);
    await audit(env, member, 'menu.category.deleted', 'menu_category', categoryId);
    return json({ ok: true });
  }

  // ── Menu Items ──────────────────────────────────────────────────────────
  if (path === '/api/menu' && req.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT
         m.id,
         m.category_id,
         m.name,
         m.description,
         m.price_minor,
         m.image_key,
         COALESCE(m.image_url, '') AS image_url,
         m.available,
         m.featured,
         m.prep_minutes,
         m.dietary_tags_json,
         COALESCE(m.options_json, '{}') AS options_json,
         COALESCE(m.sort_order, 0) AS sort_order,
         COALESCE(stats.orders_count, 0) AS orders_count
       FROM menu_items m
       LEFT JOIN (
         SELECT menu_item_id, SUM(quantity) AS orders_count
         FROM order_items
         WHERE restaurant_id = ? AND menu_item_id IS NOT NULL
         GROUP BY menu_item_id
       ) stats ON stats.menu_item_id = m.id
       WHERE m.restaurant_id = ?
       ORDER BY m.sort_order ASC, m.created_at DESC`
    )
      .bind(rid, rid)
      .all<Record<string, unknown>>();
    return json((rows.results || []).map(mapMenuRow));
  }

  if (path === '/api/menu' && req.method === 'POST') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const b = await req.json<Record<string, unknown>>();
    const name = String(b.name || '').trim();
    const priceMinor =
      b.priceMinor !== undefined
        ? Math.round(Number(b.priceMinor))
        : Math.round(Number(b.price) * 100);
    if (!name || !Number.isFinite(priceMinor) || priceMinor < 0) {
      return fail('Valid dish name and non-negative price are required');
    }

    let categoryId: string | null = b.categoryId ? String(b.categoryId).trim() : null;
    if (categoryId) {
      const validCat = await env.DB.prepare(
        `SELECT id FROM menu_categories WHERE id = ? AND restaurant_id = ?`
      )
        .bind(categoryId, rid)
        .first();
      if (!validCat) return fail('Selected category does not exist for this restaurant', 400);
    }

    let imageKey = b.imageKey ? String(b.imageKey).trim() : '';
    let imageUrl = b.imageUrl ? String(b.imageUrl).trim() : '';
    if (!imageKey && imageUrl.startsWith('/api/media?key=')) {
      const parsedKey = new URL(imageUrl, 'https://zestro.local').searchParams.get('key') || '';
      if (parsedKey) imageKey = parsedKey;
    }
    if (imageKey && !imageKey.startsWith(`restaurants/${rid}/`)) {
      return fail('Invalid media key for this restaurant', 403);
    }
    if (imageUrl.startsWith('data:')) {
      return fail('Inline base64 images are not allowed; upload image via /api/media first.', 400);
    }

    const dietaryTags = Array.isArray(b.dietaryTags)
      ? b.dietaryTags.map((t) => String(t).trim()).filter(Boolean)
      : [];
    const optionsObj =
      b.options && typeof b.options === 'object' && !Array.isArray(b.options) ? b.options : {};

    const itemId = uid();
    const available = b.available === false ? 0 : 1;
    const featured = b.featured ? 1 : 0;
    const prepMinutes = Math.max(0, Math.round(Number(b.prepMinutes) || 15));
    const sortOrder = Math.max(0, Math.round(Number(b.sortOrder) || 0));

    await env.DB.prepare(
      `INSERT INTO menu_items (
         id, restaurant_id, category_id, name, description, price_minor,
         image_key, image_url, available, featured, prep_minutes,
         dietary_tags_json, options_json, sort_order
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        itemId,
        rid,
        categoryId,
        name,
        String(b.description || '').trim(),
        priceMinor,
        imageKey || null,
        imageKey ? '' : imageUrl,
        available,
        featured,
        prepMinutes,
        JSON.stringify(dietaryTags),
        JSON.stringify(optionsObj),
        sortOrder
      )
      .run();

    await audit(env, member, 'menu.item.created', 'menu_item', itemId, { name });
    const created = await env.DB.prepare(
      `SELECT id, category_id, name, description, price_minor, image_key, image_url, available, featured, prep_minutes, dietary_tags_json, options_json, sort_order, 0 AS orders_count
       FROM menu_items WHERE id = ? AND restaurant_id = ?`
    )
      .bind(itemId, rid)
      .first<Record<string, unknown>>();
    return json(created ? mapMenuRow(created) : { id: itemId }, 201);
  }

  const itemMatch = path.match(/^\/api\/menu\/([^/]+)$/);
  if (itemMatch && req.method === 'PATCH') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const itemId = decodeURIComponent(itemMatch[1]);
    const existing = await env.DB.prepare(
      `SELECT * FROM menu_items WHERE id = ? AND restaurant_id = ?`
    )
      .bind(itemId, rid)
      .first<Record<string, unknown>>();
    if (!existing) return fail('Menu item not found', 404);

    const b = await req.json<Record<string, unknown>>();
    const name = b.name !== undefined ? String(b.name).trim() : String(existing.name);
    if (!name) return fail('Dish name cannot be empty');

    const description =
      b.description !== undefined ? String(b.description).trim() : String(existing.description || '');
    const priceMinor =
      b.priceMinor !== undefined
        ? Math.round(Number(b.priceMinor))
        : b.price !== undefined
        ? Math.round(Number(b.price) * 100)
        : Number(existing.price_minor);
    if (!Number.isFinite(priceMinor) || priceMinor < 0) return fail('Invalid price');

    let categoryId: string | null =
      b.categoryId !== undefined
        ? b.categoryId
          ? String(b.categoryId).trim()
          : null
        : existing.category_id
        ? String(existing.category_id)
        : null;

    if (categoryId) {
      const validCat = await env.DB.prepare(
        `SELECT id FROM menu_categories WHERE id = ? AND restaurant_id = ?`
      )
        .bind(categoryId, rid)
        .first();
      if (!validCat) return fail('Selected category does not exist for this restaurant', 400);
    }

    let imageKey =
      b.imageKey !== undefined
        ? b.imageKey
          ? String(b.imageKey).trim()
          : ''
        : existing.image_key
        ? String(existing.image_key)
        : '';
    let imageUrl =
      b.imageUrl !== undefined ? String(b.imageUrl || '').trim() : String(existing.image_url || '');

    if (b.imageUrl !== undefined) {
      if (imageUrl.startsWith('/api/media?key=')) {
        const parsedKey = new URL(imageUrl, 'https://zestro.local').searchParams.get('key') || '';
        imageKey = parsedKey;
        imageUrl = '';
      } else if (imageUrl && b.imageKey === undefined) {
        // Switched from R2 image to explicit URL
        imageKey = '';
      } else if (!imageUrl && b.imageKey === undefined) {
        imageKey = '';
      }
    }
    if (imageKey && !imageKey.startsWith(`restaurants/${rid}/`)) {
      return fail('Invalid media key for this restaurant', 403);
    }
    if (imageUrl.startsWith('data:')) {
      return fail('Inline base64 images are not allowed; upload image via /api/media first.', 400);
    }

    const available =
      b.available !== undefined ? (b.available ? 1 : 0) : Number(existing.available ? 1 : 0);
    const featured =
      b.featured !== undefined ? (b.featured ? 1 : 0) : Number(existing.featured ? 1 : 0);
    const prepMinutes =
      b.prepMinutes !== undefined
        ? Math.max(0, Math.round(Number(b.prepMinutes) || 0))
        : Number(existing.prep_minutes ?? 15);
    const dietaryTagsJson =
      b.dietaryTags !== undefined && Array.isArray(b.dietaryTags)
        ? JSON.stringify(b.dietaryTags.map((t) => String(t).trim()).filter(Boolean))
        : String(existing.dietary_tags_json || '[]');
    const optionsJson =
      b.options !== undefined && b.options && typeof b.options === 'object'
        ? JSON.stringify(b.options)
        : String(existing.options_json || '{}');
    const sortOrder =
      b.sortOrder !== undefined
        ? Math.max(0, Math.round(Number(b.sortOrder) || 0))
        : Number(existing.sort_order ?? 0);

    await env.DB.prepare(
      `UPDATE menu_items
       SET name = ?,
           description = ?,
           price_minor = ?,
           category_id = ?,
           image_key = ?,
           image_url = ?,
           available = ?,
           featured = ?,
           prep_minutes = ?,
           dietary_tags_json = ?,
           options_json = ?,
           sort_order = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND restaurant_id = ?`
    )
      .bind(
        name,
        description,
        priceMinor,
        categoryId,
        imageKey || null,
        imageKey ? '' : imageUrl,
        available,
        featured,
        prepMinutes,
        dietaryTagsJson,
        optionsJson,
        sortOrder,
        itemId,
        rid
      )
      .run();

    await audit(env, member, 'menu.item.updated', 'menu_item', itemId, { name });
    const updated = await env.DB.prepare(
      `SELECT m.*, COALESCE(s.orders_count, 0) AS orders_count
       FROM menu_items m
       LEFT JOIN (
         SELECT menu_item_id, SUM(quantity) AS orders_count
         FROM order_items WHERE restaurant_id = ? AND menu_item_id = ?
         GROUP BY menu_item_id
       ) s ON s.menu_item_id = m.id
       WHERE m.id = ? AND m.restaurant_id = ?`
    )
      .bind(rid, itemId, itemId, rid)
      .first<Record<string, unknown>>();
    return json(updated ? mapMenuRow(updated) : { ok: true });
  }

  if (itemMatch && req.method === 'DELETE') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const itemId = decodeURIComponent(itemMatch[1]);
    const result = await env.DB.prepare(
      `DELETE FROM menu_items WHERE id = ? AND restaurant_id = ?`
    )
      .bind(itemId, rid)
      .run();
    if (!result.meta.changes) return fail('Menu item not found', 404);
    await audit(env, member, 'menu.item.deleted', 'menu_item', itemId);
    return json({ ok: true });
  }

  // ── Orders ──────────────────────────────────────────────────────────────
  if (path === '/api/orders' && req.method === 'GET') {
    const [orderRows, itemRows] = await Promise.all([
      env.DB.prepare(
        `SELECT o.*, t.table_code
         FROM orders o
         LEFT JOIN restaurant_tables t ON t.id = o.table_id
         WHERE o.restaurant_id = ?
         ORDER BY o.created_at DESC
         LIMIT 200`
      )
        .bind(rid)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT oi.order_id, oi.menu_item_id, oi.item_name_snapshot, oi.quantity,
                oi.unit_price_minor, oi.line_total_minor, COALESCE(oi.options_snapshot_json, '{}') AS options_snapshot_json
         FROM order_items oi
         JOIN (
           SELECT id FROM orders WHERE restaurant_id = ? ORDER BY created_at DESC LIMIT 200
         ) recent ON recent.id = oi.order_id
         WHERE oi.restaurant_id = ?`
      )
        .bind(rid, rid)
        .all<Record<string, unknown>>(),
    ]);

    const itemsByOrder = new Map<string, Record<string, unknown>[]>();
    for (const line of itemRows.results || []) {
      const oid = String(line.order_id);
      const arr = itemsByOrder.get(oid) || [];
      arr.push(line);
      itemsByOrder.set(oid, arr);
    }

    const statusMap: Record<string, string> = {
      pending: 'Pending',
      accepted: 'Preparing',
      preparing: 'Preparing',
      ready: 'Ready',
      served: 'Served',
      cancelled: 'Cancelled',
    };

    const result = (orderRows.results || []).map((o) => {
      const rawNote = String(o.customer_note || '');
      let legacyJson: Record<string, unknown> | null = null;
      if (rawNote.trim().startsWith('{')) {
        legacyJson = safeJsonParse<Record<string, unknown> | null>(rawNote, null);
      }
      const legacyCartItems = Array.isArray(legacyJson?.cartItems)
        ? (legacyJson?.cartItems as Record<string, unknown>[])
        : Array.isArray(legacyJson?.items)
        ? (legacyJson?.items as Record<string, unknown>[])
        : [];

      const lines = (itemsByOrder.get(String(o.id)) || []).map((line, idx) => {
        const opts = safeJsonParse<Record<string, unknown>>(
          String(line.options_snapshot_json || '{}'),
          {}
        );
        const legacyMatch =
          legacyCartItems[idx] ||
          legacyCartItems.find((c) => String(c.productId) === String(line.menu_item_id));
        return {
          menuItemId: String(line.menu_item_id || ''),
          name: String(line.item_name_snapshot || ''),
          quantity: Number(line.quantity || 1),
          unitPrice: Number(line.unit_price_minor || 0) / 100,
          variantLabel: opts.variantLabel ? String(opts.variantLabel) : undefined,
          customisations: Array.isArray(opts.customisations) ? opts.customisations : [],
          selectedSides: Array.isArray(opts.selectedSides)
            ? opts.selectedSides
            : Array.isArray(legacyMatch?.selectedSides)
            ? legacyMatch.selectedSides
            : [],
          specialInstructions: String(
            opts.specialInstructions || legacyMatch?.specialInstructions || ''
          ),
        };
      });

      const orderType =
        o.order_type === 'dine_in'
          ? 'Dine-In'
          : o.order_type === 'delivery'
          ? 'Delivery'
          : 'Takeaway';

      const tableNumber = o.table_code
        ? String(o.table_code)
        : orderType === 'Delivery'
        ? 'Delivery'
        : orderType === 'Takeaway'
        ? 'Pickup'
        : 'Walk-in';

      const customerPhone = String(
        o.customer_phone || legacyJson?.customerPhone || legacyJson?.phone || ''
      );
      const deliveryAddress = String(
        o.delivery_address || legacyJson?.deliveryAddress || legacyJson?.address || ''
      );
      const notes = legacyJson
        ? String(legacyJson.customerNote ?? legacyJson.notes ?? '')
        : rawNote;
      const deliveryFee =
        Number(o.delivery_fee_minor || 0) > 0
          ? Number(o.delivery_fee_minor) / 100
          : Number(legacyJson?.deliveryFee || 0);
      const discount = Number(o.discount_minor || 0) / 100;
      const promoCode = String(o.promo_code || legacyJson?.promoCode || '');

      return {
        id: String(o.id),
        orderNumber: String(o.order_number),
        tableId: o.table_id ? String(o.table_id) : undefined,
        tableNumber,
        customerName: String(o.customer_name || 'Guest'),
        customerPhone,
        deliveryAddress,
        orderType,
        items: lines,
        subtotal: Number(o.subtotal_minor || 0) / 100,
        discount,
        tax: Number(o.tax_minor || 0) / 100,
        serviceCharge: Number(o.service_charge_minor || 0) / 100,
        deliveryFee,
        promoCode: promoCode || undefined,
        total: Number(o.total_minor || 0) / 100,
        status: statusMap[String(o.status)] || 'Pending',
        notes,
        staffNote: String(o.staff_note || ''),
        createdAt: String(o.created_at),
      };
    });

    return json(result);
  }

  if (path === '/api/orders' && req.method === 'POST') {
    if (!canOperate(member)) return fail('Insufficient permissions', 403);
    const b = await req.json<Record<string, unknown>>();
    const rawOrderType = String(b.orderType || 'Dine-In');
    const orderType: 'dine_in' | 'takeaway' | 'delivery' =
      rawOrderType === 'Delivery' || rawOrderType === 'delivery'
        ? 'delivery'
        : rawOrderType === 'Takeaway' || rawOrderType === 'takeaway'
        ? 'takeaway'
        : 'dine_in';

    const customerName = String(b.customerName || 'Walk-in Guest').trim() || 'Walk-in Guest';
    const customerPhone = String(b.customerPhone || '').trim();
    const deliveryAddress = String(b.deliveryAddress || '').trim();
    const notes = String(b.notes || '').trim().slice(0, 1000);

    const rawItems = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : [];
    if (rawItems.length === 0 || rawItems.length > 50) {
      return fail('Order must contain at least 1 item');
    }

    // Resolve table for dine-in if provided
    let matchedTable: { id: string; table_code: string } | null = null;
    const rawTable = String(b.tableId || b.tableNumber || '').trim();
    if (orderType === 'dine_in' && rawTable && rawTable !== 'Walk-in' && rawTable !== 'Pickup') {
      const code = normalizeTableCodeLookup(rawTable);
      matchedTable = await env.DB.prepare(
        `SELECT id, table_code FROM restaurant_tables
         WHERE restaurant_id = ? AND (id = ? OR lower(table_code) = lower(?) OR lower(table_code) = lower(?) OR lower(table_code) = lower(?))
         LIMIT 1`
      )
        .bind(rid, rawTable, rawTable, code, `T-${code}`)
        .first<{ id: string; table_code: string }>();
    }

    // Verify all menu items against live tenant catalog
    let subtotalMinor = 0;
    const verifiedLines: Array<{
      menuItemId: string;
      name: string;
      quantity: number;
      unitPriceMinor: number;
      lineTotalMinor: number;
      optionsSnapshotJson: string;
    }> = [];

    for (const entry of rawItems) {
      const menuItemId = String(entry.menuItemId || entry.productId || '').trim();
      const quantity = Math.round(Number(entry.quantity));
      if (!menuItemId || !Number.isInteger(quantity) || quantity < 1 || quantity > 50) {
        return fail('Each order item must specify a valid menu item and quantity (1–50).');
      }
      const dbItem = await env.DB.prepare(
        `SELECT id, name, price_minor, available FROM menu_items WHERE id = ? AND restaurant_id = ?`
      )
        .bind(menuItemId, rid)
        .first<{ id: string; name: string; price_minor: number; available: number }>();
      if (!dbItem) {
        return fail('One or more selected dishes do not exist in this restaurant catalog.', 400);
      }
      if (!dbItem.available) {
        return fail(`"${dbItem.name}" is currently marked sold out.`, 409);
      }
      const unitPriceMinor = Number(dbItem.price_minor);
      const lineTotalMinor = unitPriceMinor * quantity;
      subtotalMinor += lineTotalMinor;
      verifiedLines.push({
        menuItemId: dbItem.id,
        name: dbItem.name,
        quantity,
        unitPriceMinor,
        lineTotalMinor,
        optionsSnapshotJson: JSON.stringify({
          specialInstructions: String(entry.specialInstructions || ''),
        }),
      });
    }

    const settingsRow = await env.DB.prepare(
      `SELECT settings_json FROM restaurant_settings WHERE restaurant_id = ?`
    )
      .bind(rid)
      .first<{ settings_json: string }>();
    const st = safeJsonParse<Record<string, unknown>>(settingsRow?.settings_json, {});
    const taxRate = Number(st.taxRatePercent ?? st.taxPercent ?? 0) || 0;
    const serviceRate = Number(st.serviceChargePercent ?? 0) || 0;
    const deliveryFeeMinor =
      orderType === 'delivery' ? Math.round((Number(st.deliveryFee) || 0) * 100) : 0;

    const taxMinor = Math.round((subtotalMinor * taxRate) / 100);
    const serviceChargeMinor =
      orderType === 'dine_in' ? Math.round((subtotalMinor * serviceRate) / 100) : 0;
    const totalMinor = subtotalMinor + taxMinor + serviceChargeMinor + deliveryFeeMinor;

    const orderId = uid();
    const datePart = new Date().toISOString().replace(/\D/g, '').slice(0, 8);
    const orderNumber = `ZST-${datePart}-${uid().slice(0, 5).toUpperCase()}`;

    const statements: D1PreparedStatement[] = [
      env.DB.prepare(
        `INSERT INTO orders (
           id, restaurant_id, order_number, table_id, customer_name, customer_phone,
           delivery_address, order_type, status, subtotal_minor, discount_minor,
           tax_minor, service_charge_minor, delivery_fee_minor, total_minor,
           customer_note, idempotency_key
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, 0, ?, ?, ?, ?, ?, ?)`
      ).bind(
        orderId,
        rid,
        orderNumber,
        matchedTable?.id ?? null,
        customerName,
        customerPhone,
        deliveryAddress,
        orderType,
        subtotalMinor,
        taxMinor,
        serviceChargeMinor,
        deliveryFeeMinor,
        totalMinor,
        notes,
        req.headers.get('Idempotency-Key') || orderId
      ),
      ...verifiedLines.map((line) =>
        env.DB.prepare(
          `INSERT INTO order_items (
             id, restaurant_id, order_id, menu_item_id, item_name_snapshot,
             quantity, unit_price_minor, line_total_minor, options_snapshot_json
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          uid(),
          rid,
          orderId,
          line.menuItemId,
          line.name,
          line.quantity,
          line.unitPriceMinor,
          line.lineTotalMinor,
          line.optionsSnapshotJson
        )
      ),
    ];

    if (matchedTable) {
      statements.push(
        env.DB.prepare(
          `UPDATE restaurant_tables SET status = 'occupied', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND restaurant_id = ?`
        ).bind(matchedTable.id, rid)
      );
    }

    await env.DB.batch(statements);
    await audit(env, member, 'order.created', 'order', orderId, {
      orderNumber,
      orderType: rawOrderType,
    });

    return json(
      {
        id: orderId,
        orderNumber,
        tableId: matchedTable?.id,
        tableNumber: matchedTable
          ? matchedTable.table_code
          : orderType === 'delivery'
          ? 'Delivery'
          : orderType === 'takeaway'
          ? 'Pickup'
          : 'Walk-in',
        customerName,
        customerPhone,
        deliveryAddress,
        orderType:
          orderType === 'dine_in' ? 'Dine-In' : orderType === 'delivery' ? 'Delivery' : 'Takeaway',
        items: verifiedLines.map((l) => ({
          menuItemId: l.menuItemId,
          name: l.name,
          quantity: l.quantity,
          unitPrice: l.unitPriceMinor / 100,
        })),
        subtotal: subtotalMinor / 100,
        discount: 0,
        tax: taxMinor / 100,
        serviceCharge: serviceChargeMinor / 100,
        deliveryFee: deliveryFeeMinor / 100,
        total: totalMinor / 100,
        status: 'Pending',
        notes,
        createdAt: new Date().toISOString(),
      },
      201
    );
  }

  const orderMatch = path.match(/^\/api\/orders\/([^/]+)$/);
  if (orderMatch && req.method === 'PATCH') {
    if (!canOperate(member)) return fail('Insufficient permissions', 403);
    const orderId = decodeURIComponent(orderMatch[1]);
    const existing = await env.DB.prepare(
      `SELECT id, order_number, table_id FROM orders WHERE id = ? AND restaurant_id = ?`
    )
      .bind(orderId, rid)
      .first<{ id: string; order_number: string; table_id: string | null }>();
    if (!existing) return fail('Order not found', 404);

    const b = await req.json<Record<string, unknown>>();
    const statusLookup: Record<string, string> = {
      Pending: 'pending',
      Accepted: 'accepted',
      Preparing: 'preparing',
      Ready: 'ready',
      Served: 'served',
      Cancelled: 'cancelled',
      pending: 'pending',
      accepted: 'accepted',
      preparing: 'preparing',
      ready: 'ready',
      served: 'served',
      cancelled: 'cancelled',
    };
    const dbStatus = b.status !== undefined ? statusLookup[String(b.status)] : null;
    if (b.status !== undefined && !dbStatus) return fail('Invalid order status');
    const staffNote = b.staffNote !== undefined ? String(b.staffNote).slice(0, 500) : null;

    await env.DB.prepare(
      `UPDATE orders
       SET status = COALESCE(?, status),
           staff_note = COALESCE(?, staff_note),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND restaurant_id = ?`
    )
      .bind(dbStatus, staffNote, orderId, rid)
      .run();

    // Keep table occupancy synchronized when last active order finishes
    if (existing.table_id && (dbStatus === 'served' || dbStatus === 'cancelled')) {
      const remainingActive = await env.DB.prepare(
        `SELECT id FROM orders
         WHERE restaurant_id = ? AND table_id = ? AND status IN ('pending', 'accepted', 'preparing', 'ready')
         LIMIT 1`
      )
        .bind(rid, existing.table_id)
        .first();
      if (!remainingActive) {
        const nextTableStatus = dbStatus === 'served' ? 'cleaning' : 'available';
        await env.DB.prepare(
          `UPDATE restaurant_tables SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND restaurant_id = ? AND status = 'occupied'`
        )
          .bind(nextTableStatus, existing.table_id, rid)
          .run();
      }
    }

    await audit(env, member, 'order.status.updated', 'order', orderId, {
      orderNumber: existing.order_number,
      status: String(b.status || dbStatus || ''),
    });
    return json({ ok: true });
  }

  // ── Tables ──────────────────────────────────────────────────────────────
  if (path === '/api/tables' && req.method === 'GET') {
    const [tableRows, activeOrders, settingsRow] = await Promise.all([
      env.DB.prepare(
        `SELECT id, table_code AS number, zone, capacity, status
         FROM restaurant_tables
         WHERE restaurant_id = ?
         ORDER BY table_code ASC`
      )
        .bind(rid)
        .all<Record<string, unknown>>(),
      env.DB.prepare(
        `SELECT table_id, order_number
         FROM orders
         WHERE restaurant_id = ? AND table_id IS NOT NULL AND status IN ('pending', 'accepted', 'preparing', 'ready')
         ORDER BY created_at DESC`
      )
        .bind(rid)
        .all<{ table_id: string; order_number: string }>(),
      env.DB.prepare(`SELECT settings_json FROM restaurant_settings WHERE restaurant_id = ?`)
        .bind(rid)
        .first<{ settings_json: string }>(),
    ]);

    const activeByTable = new Map<string, string>();
    for (const o of activeOrders.results || []) {
      if (o.table_id && !activeByTable.has(o.table_id)) {
        activeByTable.set(o.table_id, o.order_number);
      }
    }

    const st = safeJsonParse<Record<string, unknown>>(settingsRow?.settings_json, {});
    const baseWebsite = String(
      st.websiteUrl || 'https://zestro-customer-website.pages.dev'
    ).replace(/\/+$/, '');

    return json(
      (tableRows.results || []).map((x) => {
        const tableNumber = String(x.number || '');
        const qrPath = `/menu?table=${encodeURIComponent(tableNumber)}`;
        const statusStr = String(x.status || 'available');
        const uiStatus =
          statusStr === 'occupied'
            ? 'Occupied'
            : statusStr === 'reserved'
            ? 'Reserved'
            : statusStr === 'cleaning'
            ? 'Cleaning'
            : 'Available';
        return {
          id: String(x.id),
          number: tableNumber,
          zone: String(x.zone || 'Main Dining'),
          capacity: Number(x.capacity || 2),
          status: uiStatus,
          qrPath,
          qrUrl: `${baseWebsite}${qrPath}`,
          activeOrderNumber: activeByTable.get(String(x.id)),
        };
      })
    );
  }

  if (path === '/api/tables' && req.method === 'POST') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const b = await req.json<Record<string, unknown>>();
    const number = String(b.number || '').trim();
    if (!number) return fail('Table number is required');

    const duplicate = await env.DB.prepare(
      `SELECT id FROM restaurant_tables WHERE restaurant_id = ? AND lower(table_code) = lower(?) LIMIT 1`
    )
      .bind(rid, number)
      .first();
    if (duplicate) return fail(`Table "${number}" already exists.`, 409);

    const tableId = uid();
    const rawStatus = String(b.status || 'Available').toLowerCase();
    const allowedStatus: Record<string, string> = {
      available: 'available',
      occupied: 'occupied',
      reserved: 'reserved',
      cleaning: 'cleaning',
    };
    const dbStatus = allowedStatus[rawStatus] || 'available';
    const zone = String(b.zone || 'Main Dining').trim() || 'Main Dining';
    const capacity = Math.max(1, Math.min(40, Math.round(Number(b.capacity) || 2)));

    await env.DB.prepare(
      `INSERT INTO restaurant_tables (id, restaurant_id, table_code, zone, capacity, status)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
      .bind(tableId, rid, number, zone, capacity, dbStatus)
      .run();

    await audit(env, member, 'table.created', 'restaurant_table', tableId, { number });
    return json(
      {
        id: tableId,
        number,
        zone,
        capacity,
        status:
          dbStatus === 'occupied'
            ? 'Occupied'
            : dbStatus === 'reserved'
            ? 'Reserved'
            : dbStatus === 'cleaning'
            ? 'Cleaning'
            : 'Available',
        qrPath: `/menu?table=${encodeURIComponent(number)}`,
      },
      201
    );
  }

  const tableMatch = path.match(/^\/api\/tables\/([^/]+)$/);
  if (tableMatch && req.method === 'PATCH') {
    const tableId = decodeURIComponent(tableMatch[1]);
    const b = await req.json<Record<string, unknown>>();
    const isStatusOnly =
      b.status !== undefined &&
      b.number === undefined &&
      b.zone === undefined &&
      b.capacity === undefined;

    if (isStatusOnly ? !canOperate(member) : !canManage(member)) {
      return fail('Insufficient permissions', 403);
    }

    const existing = await env.DB.prepare(
      `SELECT id FROM restaurant_tables WHERE id = ? AND restaurant_id = ?`
    )
      .bind(tableId, rid)
      .first();
    if (!existing) return fail('Table not found', 404);

    const newNumber = b.number === undefined ? null : String(b.number).trim();
    if (newNumber !== null && !newNumber) return fail('Table number cannot be empty');
    if (newNumber) {
      const dup = await env.DB.prepare(
        `SELECT id FROM restaurant_tables WHERE restaurant_id = ? AND lower(table_code) = lower(?) AND id != ? LIMIT 1`
      )
        .bind(rid, newNumber, tableId)
        .first();
      if (dup) return fail(`Table "${newNumber}" already exists.`, 409);
    }

    const allowedStatus: Record<string, string> = {
      available: 'available',
      occupied: 'occupied',
      reserved: 'reserved',
      cleaning: 'cleaning',
    };
    const nextStatus =
      b.status === undefined
        ? null
        : allowedStatus[String(b.status).toLowerCase()] || 'available';

    await env.DB.prepare(
      `UPDATE restaurant_tables
       SET table_code = COALESCE(?, table_code),
           zone = COALESCE(?, zone),
           capacity = COALESCE(?, capacity),
           status = COALESCE(?, status),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND restaurant_id = ?`
    )
      .bind(
        newNumber,
        b.zone === undefined ? null : String(b.zone).trim(),
        b.capacity === undefined ? null : Math.max(1, Math.min(40, Math.round(Number(b.capacity) || 2))),
        nextStatus,
        tableId,
        rid
      )
      .run();

    await audit(env, member, 'table.updated', 'restaurant_table', tableId);
    return json({ ok: true });
  }

  if (tableMatch && req.method === 'DELETE') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const tableId = decodeURIComponent(tableMatch[1]);
    const result = await env.DB.prepare(
      `DELETE FROM restaurant_tables WHERE id = ? AND restaurant_id = ?`
    )
      .bind(tableId, rid)
      .run();
    if (!result.meta.changes) return fail('Table not found', 404);
    await audit(env, member, 'table.deleted', 'restaurant_table', tableId);
    return json({ ok: true });
  }

  // ── Waiter Calls ────────────────────────────────────────────────────────
  if (path === '/api/waiter-calls' && req.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT w.id, w.table_id, w.request_type, w.note, w.status, w.created_at, w.resolved_at,
              t.table_code, t.zone, m.display_name AS assigned_to
       FROM waiter_calls w
       LEFT JOIN restaurant_tables t ON t.id = w.table_id
       LEFT JOIN memberships m ON m.id = w.assigned_membership_id
       WHERE w.restaurant_id = ?
       ORDER BY w.created_at DESC
       LIMIT 200`
    )
      .bind(rid)
      .all<Record<string, unknown>>();

    return json(
      (rows.results || []).map((x) => ({
        id: String(x.id),
        tableId: x.table_id ? String(x.table_id) : undefined,
        tableNumber: x.table_code ? String(x.table_code) : 'Unassigned',
        zone: x.zone ? String(x.zone) : undefined,
        requestType: String(x.request_type || 'Table Assistance'),
        note: String(x.note || ''),
        status:
          x.status === 'acknowledged'
            ? 'Acknowledged'
            : x.status === 'resolved'
            ? 'Resolved'
            : 'Incoming',
        createdAt: String(x.created_at),
        resolvedAt: x.resolved_at ? String(x.resolved_at) : undefined,
        assignedTo: x.assigned_to ? String(x.assigned_to) : undefined,
      }))
    );
  }

  if (path === '/api/waiter-calls' && req.method === 'POST') {
    if (!canOperate(member)) return fail('Insufficient permissions', 403);
    const b = await req.json<Record<string, unknown>>();
    const rawTable = String(b.tableId || b.tableNumber || '').trim();
    const requestType = String(b.requestType || 'Table Assistance').trim().slice(0, 80);
    const note = String(b.note || '').trim().slice(0, 300);

    let table: { id: string; table_code: string } | null = null;
    if (rawTable) {
      const code = normalizeTableCodeLookup(rawTable);
      table = await env.DB.prepare(
        `SELECT id, table_code FROM restaurant_tables
         WHERE restaurant_id = ? AND (id = ? OR lower(table_code) = lower(?) OR lower(table_code) = lower(?) OR lower(table_code) = lower(?))
         LIMIT 1`
      )
        .bind(rid, rawTable, rawTable, code, `T-${code}`)
        .first<{ id: string; table_code: string }>();
    } else {
      table = await env.DB.prepare(
        `SELECT id, table_code FROM restaurant_tables WHERE restaurant_id = ? ORDER BY table_code ASC LIMIT 1`
      )
        .bind(rid)
        .first<{ id: string; table_code: string }>();
    }

    if (!table) {
      return fail('Create at least one table in Table Management before logging a waiter call.', 400);
    }

    const callId = uid();
    await env.DB.prepare(
      `INSERT INTO waiter_calls (id, restaurant_id, table_id, request_type, note, status)
       VALUES (?, ?, ?, ?, ?, 'incoming')`
    )
      .bind(callId, rid, table.id, requestType, note)
      .run();

    await audit(env, member, 'waiter_call.created', 'waiter_call', callId, {
      tableNumber: table.table_code,
    });
    return json(
      {
        id: callId,
        tableId: table.id,
        tableNumber: table.table_code,
        requestType,
        note,
        status: 'Incoming',
        createdAt: new Date().toISOString(),
      },
      201
    );
  }

  const waiterMatch = path.match(/^\/api\/waiter-calls\/([^/]+)$/);
  if (waiterMatch && req.method === 'PATCH') {
    if (!canOperate(member)) return fail('Insufficient permissions', 403);
    const callId = decodeURIComponent(waiterMatch[1]);
    const b = await req.json<Record<string, unknown>>();
    const raw = String(b.status || '').toLowerCase();
    const map: Record<string, string> = {
      incoming: 'incoming',
      pending: 'incoming',
      acknowledged: 'acknowledged',
      resolved: 'resolved',
    };
    const dbStatus = map[raw];
    if (!dbStatus) return fail('Invalid waiter-call status');

    const result = await env.DB.prepare(
      `UPDATE waiter_calls
       SET status = ?,
           assigned_membership_id = CASE WHEN ? IN ('acknowledged', 'resolved') THEN ? ELSE assigned_membership_id END,
           resolved_at = CASE WHEN ? = 'resolved' THEN CURRENT_TIMESTAMP ELSE resolved_at END
       WHERE id = ? AND restaurant_id = ?`
    )
      .bind(dbStatus, dbStatus, member.id, dbStatus, callId, rid)
      .run();
    if (!result.meta.changes) return fail('Waiter call not found', 404);

    await audit(env, member, 'waiter_call.status.updated', 'waiter_call', callId, {
      status: dbStatus,
    });
    return json({ ok: true, assignedTo: member.display_name });
  }

  // ── Promotions & Homepage Offers ────────────────────────────────────────
  if (path === '/api/promotions' && req.method === 'GET') {
    const [rows, offerMeta] = await Promise.all([
      env.DB.prepare(
        `SELECT id, title, COALESCE(description, '') AS description, code, discount_type,
                discount_value_minor, min_order_minor, valid_from, valid_until, active,
                COALESCE(usage_count, 0) AS usage_count
         FROM promotions
         WHERE restaurant_id = ?
         ORDER BY created_at DESC`
      )
        .bind(rid)
        .all<Record<string, unknown>>(),
      loadOfferMeta(env.DB, rid),
    ]);
    return json((rows.results || []).map((r) => mapPromotionRow(r, offerMeta)));
  }

  if (path === '/api/promotions' && req.method === 'POST') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const b = await req.json<Record<string, unknown>>();
    const title = String(b.title || '').trim().slice(0, 120);
    if (!title) return fail('Offer title is required');

    const promoId = uid();
    const rawCode = String(b.code || '').trim().toUpperCase();
    const hasPromoCode = rawCode.length > 0;
    if (hasPromoCode && !/^[A-Z0-9_-]{2,32}$/.test(rawCode)) {
      return fail('Promo code must be 2–32 characters (letters, numbers, - or _).');
    }
    const dbCode = hasPromoCode
      ? rawCode
      : `__OFFER_${promoId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase()}`;

    if (hasPromoCode) {
      const dup = await env.DB.prepare(
        `SELECT id FROM promotions WHERE restaurant_id = ? AND upper(code) = ? LIMIT 1`
      )
        .bind(rid, dbCode)
        .first();
      if (dup) return fail(`Promotion code "${dbCode}" already exists.`, 409);
    }

    const rawType = String(b.discountType || 'Percentage');
    const dbType = !hasPromoCode
      ? 'complimentary_item'
      : rawType === 'Fixed Amount' || rawType === 'fixed_amount' || rawType === 'fixed'
      ? 'fixed_amount'
      : rawType === 'Complimentary Item' || rawType === 'complimentary_item'
      ? 'complimentary_item'
      : 'percentage';

    const discountValueMinor = hasPromoCode
      ? Math.max(0, Math.round((Number(b.discountValue) || 0) * 100))
      : 0;
    if (dbType === 'percentage' && discountValueMinor > 10000) {
      return fail('Percentage discount cannot exceed 100%');
    }
    const minOrderMinor = hasPromoCode
      ? Math.max(0, Math.round((Number(b.minOrder) || 0) * 100))
      : 0;
    const today = new Date().toISOString().slice(0, 10);
    const validFrom = String(b.validFrom !== undefined ? b.validFrom : today).trim();
    const validUntil = String(b.validUntil || '').trim();
    if (validFrom && !isValidIsoDate(validFrom)) return fail('Invalid start date (use YYYY-MM-DD)');
    if (validUntil && !isValidIsoDate(validUntil)) return fail('Invalid end date (use YYYY-MM-DD)');
    if (validFrom && validUntil && validFrom > validUntil) {
      return fail('Start date cannot be after end date');
    }

    const description = String(b.description || '').trim().slice(0, 240);
    const discountText = String(b.discountText || '').trim().slice(0, 40);
    const active = b.active === false ? 0 : 1;

    await env.DB.prepare(
      `INSERT INTO promotions (
         id, restaurant_id, title, description, code, discount_type,
         discount_value_minor, min_order_minor, valid_from, valid_until, active, usage_count
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
      .bind(
        promoId,
        rid,
        title,
        description,
        dbCode,
        dbType,
        discountValueMinor,
        minOrderMinor,
        validFrom,
        validUntil,
        active
      )
      .run();

    const offerMeta = await loadOfferMeta(env.DB, rid);
    offerMeta[promoId] = { discountText, hasPromoCode };
    await saveOfferMeta(env.DB, rid, offerMeta);

    await audit(env, member, 'promotion.created', 'promotion', promoId, { code: dbCode });
    const row = await env.DB.prepare(
      `SELECT * FROM promotions WHERE id = ? AND restaurant_id = ?`
    )
      .bind(promoId, rid)
      .first<Record<string, unknown>>();
    return json(row ? mapPromotionRow(row, offerMeta) : { id: promoId }, 201);
  }

  const promoMatch = path.match(/^\/api\/promotions\/([^/]+)$/);
  if (promoMatch && req.method === 'PATCH') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const promoId = decodeURIComponent(promoMatch[1]);
    const existing = await env.DB.prepare(
      `SELECT * FROM promotions WHERE id = ? AND restaurant_id = ?`
    )
      .bind(promoId, rid)
      .first<Record<string, unknown>>();
    if (!existing) return fail('Promotion not found', 404);

    const b = await req.json<Record<string, unknown>>();
    const title = b.title !== undefined ? String(b.title).trim().slice(0, 120) : String(existing.title);
    if (!title) return fail('Offer title cannot be empty');

    const existingCode = String(existing.code || '');
    const offerMeta = await loadOfferMeta(env.DB, rid);
    const existingMeta = offerMeta[promoId] || {};

    let hasPromoCode = !existingCode.startsWith('__OFFER_') && existingMeta.hasPromoCode !== false;
    let dbCode = existingCode;
    if (b.code !== undefined) {
      const rawCode = String(b.code || '').trim().toUpperCase();
      if (rawCode.length > 0) {
        if (!/^[A-Z0-9_-]{2,32}$/.test(rawCode)) {
          return fail('Promo code must be 2–32 characters (letters, numbers, - or _).');
        }
        hasPromoCode = true;
        dbCode = rawCode;
        const dup = await env.DB.prepare(
          `SELECT id FROM promotions WHERE restaurant_id = ? AND upper(code) = ? AND id != ? LIMIT 1`
        )
          .bind(rid, dbCode, promoId)
          .first();
        if (dup) return fail(`Promotion code "${dbCode}" is already used by another promotion.`, 409);
      } else {
        hasPromoCode = false;
        dbCode = existingCode.startsWith('__OFFER_')
          ? existingCode
          : `__OFFER_${promoId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase()}`;
      }
    }

    const dbType = !hasPromoCode
      ? 'complimentary_item'
      : b.discountType !== undefined
      ? b.discountType === 'Fixed Amount' || b.discountType === 'fixed_amount' || b.discountType === 'fixed'
        ? 'fixed_amount'
        : b.discountType === 'Complimentary Item' || b.discountType === 'complimentary_item'
        ? 'complimentary_item'
        : 'percentage'
      : String(existing.discount_type);

    const discountValueMinor = !hasPromoCode
      ? 0
      : b.discountValue !== undefined
      ? Math.max(0, Math.round((Number(b.discountValue) || 0) * 100))
      : Number(existing.discount_value_minor || 0);
    if (dbType === 'percentage' && discountValueMinor > 10000) {
      return fail('Percentage discount cannot exceed 100%');
    }

    const minOrderMinor = !hasPromoCode
      ? 0
      : b.minOrder !== undefined
      ? Math.max(0, Math.round((Number(b.minOrder) || 0) * 100))
      : Number(existing.min_order_minor || 0);
    const description =
      b.description !== undefined
        ? String(b.description).trim().slice(0, 240)
        : String(existing.description || '');
    const validFrom =
      b.validFrom !== undefined ? String(b.validFrom).trim() : String(existing.valid_from || '');
    const validUntil =
      b.validUntil !== undefined ? String(b.validUntil).trim() : String(existing.valid_until || '');
    if (validFrom && !isValidIsoDate(validFrom)) return fail('Invalid start date (use YYYY-MM-DD)');
    if (validUntil && !isValidIsoDate(validUntil)) return fail('Invalid end date (use YYYY-MM-DD)');
    if (validFrom && validUntil && validFrom > validUntil) {
      return fail('Start date cannot be after end date');
    }

    const active =
      b.active !== undefined ? (b.active ? 1 : 0) : Number(existing.active ? 1 : 0);

    await env.DB.prepare(
      `UPDATE promotions
       SET title = ?, description = ?, code = ?, discount_type = ?,
           discount_value_minor = ?, min_order_minor = ?, valid_from = ?, valid_until = ?, active = ?
       WHERE id = ? AND restaurant_id = ?`
    )
      .bind(
        title,
        description,
        dbCode,
        dbType,
        discountValueMinor,
        minOrderMinor,
        validFrom,
        validUntil,
        active,
        promoId,
        rid
      )
      .run();

    const discountText =
      b.discountText !== undefined
        ? String(b.discountText || '').trim().slice(0, 40)
        : String(existingMeta.discountText || '');
    offerMeta[promoId] = { discountText, hasPromoCode };
    await saveOfferMeta(env.DB, rid, offerMeta);

    await audit(env, member, 'promotion.updated', 'promotion', promoId, { code: dbCode });
    const updated = await env.DB.prepare(
      `SELECT * FROM promotions WHERE id = ? AND restaurant_id = ?`
    )
      .bind(promoId, rid)
      .first<Record<string, unknown>>();
    return json(updated ? mapPromotionRow(updated, offerMeta) : { ok: true });
  }

  if (promoMatch && req.method === 'DELETE') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const promoId = decodeURIComponent(promoMatch[1]);
    const result = await env.DB.prepare(
      `DELETE FROM promotions WHERE id = ? AND restaurant_id = ?`
    )
      .bind(promoId, rid)
      .run();
    if (!result.meta.changes) return fail('Promotion not found', 404);
    const offerMeta = await loadOfferMeta(env.DB, rid);
    if (offerMeta[promoId]) {
      delete offerMeta[promoId];
      await saveOfferMeta(env.DB, rid, offerMeta);
    }
    await audit(env, member, 'promotion.deleted', 'promotion', promoId);
    return json({ ok: true });
  }

  // ── Staff Management (`memberships`) ────────────────────────────────────
  if (path === '/api/staff' && req.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT id, display_name, email, role, status,
              COALESCE(phone, '') AS phone,
              COALESCE(shift, '') AS shift,
              COALESCE(job_title, '') AS job_title,
              COALESCE(duty_status, 'Active') AS duty_status,
              created_at
       FROM memberships
       WHERE restaurant_id = ? AND status != 'disabled'
       ORDER BY created_at ASC`
    )
      .bind(rid)
      .all<Record<string, unknown>>();
    return json((rows.results || []).map(mapStaffRow));
  }

  if (path === '/api/staff' && req.method === 'POST') {
    if (!canManageStaff(member)) return fail('Only owners and admins can invite or manage staff.', 403);
    const b = await req.json<Record<string, unknown>>();
    const name = String(b.name || '').trim();
    const email = String(b.email || '').trim().toLowerCase();
    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Valid staff full name and email are required.');
    const { role: dbRole, jobTitle } = mapUiRoleToDb(String(b.role || 'Server'));
    if (dbRole === 'owner' && member.role !== 'owner') return fail('Only the restaurant owner can grant Owner role.',403);
    const phone=String(b.phone||'').trim(), shift=String(b.shift||'Flexible Shift').trim();
    const duty=String(b.status||'Active');
    const dutyStatus=duty==='On Shift'||duty==='Off Duty'?duty:'Active';
    const existing=await env.DB.prepare(
      `SELECT id,status FROM memberships WHERE restaurant_id=? AND lower(email)=? LIMIT 1`
    ).bind(rid,email).first<{id:string;status:string}>();
    if(existing && existing.status!=='disabled') return fail('A team member with this email already exists.',409);
    const staffId=existing?.id||uid();
    if(existing) {
      await env.DB.prepare(
        `UPDATE memberships SET display_name=?,role=?,job_title=?,phone=?,shift=?,duty_status=?,
          status='invited',auth_subject='invited:'||id WHERE id=? AND restaurant_id=?`
      ).bind(name,dbRole,jobTitle,phone,shift,dutyStatus,staffId,rid).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO memberships(id,restaurant_id,auth_subject,email,display_name,role,status,phone,shift,job_title,duty_status)
         VALUES(?,?, 'invited:'||?, ?, ?, ?, 'invited', ?, ?, ?, ?)`
      ).bind(staffId,rid,staffId,email,name,dbRole,phone,shift,jobTitle,dutyStatus).run();
    }
    const invite=await issueInvitation(env,{restaurantId:rid,membershipId:staffId,createdByMembershipId:member.id,expiresInHours:48});
    try {
      await sendInvitationEmail(env,{to:email,name,token:invite.token,expiresAt:invite.expiresAt});
      await env.DB.prepare(`UPDATE auth_invitation_tokens SET delivery_status='sent' WHERE id=?`).bind(invite.invitationId).run();
    } catch(error) {
      await env.DB.prepare(`UPDATE auth_invitation_tokens SET delivery_status='failed' WHERE id=?`).bind(invite.invitationId).run();
      console.error('Invitation email send failed:',error);
      await audit(env,member,'staff.invitation_delivery_failed','membership',staffId,{role:jobTitle});
      return fail('Staff member was saved as invited, but the invitation email could not be sent. Retry the invitation after email delivery is configured.',503);
    }
    await audit(env,member,'staff.invited','membership',staffId,{name,email,role:jobTitle});
    const row=await env.DB.prepare(`SELECT * FROM memberships WHERE id=? AND restaurant_id=?`).bind(staffId,rid).first<Record<string,unknown>>();
    return json(row?mapStaffRow(row):{id:staffId},201);
  }

  if (path === '/api/staff/reinvite' && req.method === 'POST') {
    if (!canManageStaff(member)) return fail('Only owners and admins can invite staff.',403);
    const b=await req.json<{membershipId?:string}>(), membershipId=String(b.membershipId||'');
    const target=await env.DB.prepare(
      `SELECT id,email,display_name FROM memberships WHERE id=? AND restaurant_id=? AND status='invited' LIMIT 1`
    ).bind(membershipId,rid).first<{id:string;email:string;display_name:string}>();
    if(!target)return fail('Pending invitation not found.',404);
    const invite=await issueInvitation(env,{restaurantId:rid,membershipId,createdByMembershipId:member.id,expiresInHours:48});
    try {
      await sendInvitationEmail(env,{to:target.email,name:target.display_name,token:invite.token,expiresAt:invite.expiresAt});
      await env.DB.prepare(`UPDATE auth_invitation_tokens SET delivery_status='sent' WHERE id=?`).bind(invite.invitationId).run();
    } catch(error) {
      await env.DB.prepare(`UPDATE auth_invitation_tokens SET delivery_status='failed' WHERE id=?`).bind(invite.invitationId).run();
      console.error('Invitation retry failed:',error);
      return fail('Invitation email delivery failed; retry remains available.',503);
    }
    await audit(env,member,'staff.invitation_resent','membership',membershipId);
    return json({ok:true});
  }

  const staffMatch = path.match(/^\/api\/staff\/([^/]+)$/);
  if (staffMatch && req.method === 'PATCH') {
    if (!canManageStaff(member)) return fail('Only owners and admins can manage staff.', 403);
    const staffId = decodeURIComponent(staffMatch[1]);
    const target = await env.DB.prepare(
      `SELECT * FROM memberships WHERE id = ? AND restaurant_id = ?`
    )
      .bind(staffId, rid)
      .first<Record<string, unknown>>();
    if (!target) return fail('Team member not found', 404);

    if (target.role === 'owner' && member.role !== 'owner') {
      return fail('Only an owner can modify another owner account.', 403);
    }

    const b = await req.json<Record<string, unknown>>();
    const mapped = b.role !== undefined ? mapUiRoleToDb(String(b.role)) : null;
    if (mapped?.role === 'owner' && member.role !== 'owner') {
      return fail('Only an owner can assign Owner role.', 403);
    }

    // Prevent demoting the last active owner
    if (target.role === 'owner' && mapped && mapped.role !== 'owner') {
      const otherOwner = await env.DB.prepare(
        `SELECT id FROM memberships WHERE restaurant_id = ? AND role = 'owner' AND status != 'disabled' AND id != ? LIMIT 1`
      )
        .bind(rid, staffId)
        .first();
      if (!otherOwner) {
        return fail('Cannot demote the last active owner of this restaurant.', 400);
      }
    }

    const name = b.name !== undefined ? String(b.name).trim() : String(target.display_name);
    const email =
      b.email !== undefined ? String(b.email).trim().toLowerCase() : String(target.email);
    if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return fail('Valid name and email are required');
    }

    if (email !== String(target.email).toLowerCase()) {
      const dup = await env.DB.prepare(
        `SELECT id FROM memberships WHERE restaurant_id = ? AND lower(email) = ? AND id != ? LIMIT 1`
      )
        .bind(rid, email, staffId)
        .first();
      if (dup) return fail(`Email "${email}" is already used by another team member.`, 409);
    }

    const phone = b.phone !== undefined ? String(b.phone).trim() : String(target.phone || '');
    const shift = b.shift !== undefined ? String(b.shift).trim() : String(target.shift || '');
    const rawDuty = b.status !== undefined ? String(b.status) : String(target.duty_status || 'Active');
    const dutyStatus =
      rawDuty === 'On Shift' || rawDuty === 'Off Duty' ? rawDuty : 'Active';

    await env.DB.prepare(
      `UPDATE memberships
       SET display_name = ?,
           email = ?,
           phone = ?,
           shift = ?,
           role = ?,
           job_title = ?,
           duty_status = ?
       WHERE id = ? AND restaurant_id = ?`
    )
      .bind(
        name,
        email,
        phone,
        shift,
        mapped ? mapped.role : String(target.role),
        mapped ? mapped.jobTitle : String(target.job_title || ''),
        dutyStatus,
        staffId,
        rid
      )
      .run();

    await audit(env, member, 'staff.updated', 'membership', staffId, { name });
    const updated = await env.DB.prepare(
      `SELECT * FROM memberships WHERE id = ? AND restaurant_id = ?`
    )
      .bind(staffId, rid)
      .first<Record<string, unknown>>();
    return json(updated ? mapStaffRow(updated) : { ok: true });
  }

  if (staffMatch && req.method === 'DELETE') {
    if (!canManageStaff(member)) return fail('Only owners and admins can remove staff.', 403);
    const staffId = decodeURIComponent(staffMatch[1]);
    if (staffId === member.id) {
      return fail('You cannot remove your own currently signed-in account.', 400);
    }
    const target = await env.DB.prepare(
      `SELECT id, role, display_name FROM memberships WHERE id = ? AND restaurant_id = ?`
    )
      .bind(staffId, rid)
      .first<{ id: string; role: string; display_name: string }>();
    if (!target) return fail('Team member not found', 404);
    if (target.role === 'owner' && member.role !== 'owner') {
      return fail('Only an owner can remove another owner.', 403);
    }
    if (target.role === 'owner') {
      const otherOwner = await env.DB.prepare(
        `SELECT id FROM memberships WHERE restaurant_id = ? AND role = 'owner' AND status != 'disabled' AND id != ? LIMIT 1`
      )
        .bind(rid, staffId)
        .first();
      if (!otherOwner) return fail('Cannot remove the last restaurant owner.', 400);
    }

    await env.DB.prepare(`DELETE FROM memberships WHERE id = ? AND restaurant_id = ?`)
      .bind(staffId, rid)
      .run();
    await audit(env, member, 'staff.deleted', 'membership', staffId, {
      name: target.display_name,
    });
    return json({ ok: true });
  }

  // ── Media Library & R2 (`/api/media`) ───────────────────────────────────
  if (path === '/api/media' && req.method === 'GET') {
    const objectKey = url.searchParams.get('key');
    if (objectKey !== null) {
      if (!objectKey.startsWith(`restaurants/${rid}/`)) {
        return fail('Media object not found', 404);
      }
      const obj = await env.MEDIA.get(objectKey);
      if (!obj) return fail('Media object not found', 404);
      const headers = new Headers();
      const rawMime = String(obj.httpMetadata?.contentType || '').toLowerCase();
      const safeMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/svg+xml'].includes(rawMime)
        ? rawMime
        : 'image/jpeg';
      headers.set('content-type', safeMime);
      if (safeMime === 'image/svg+xml') {
        headers.set('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
      }
      if (obj.httpEtag) headers.set('etag', obj.httpEtag);
      headers.set('cache-control', 'private, max-age=300');
      headers.set('x-content-type-options', 'nosniff');
      return new Response(obj.body, { status: 200, headers });
    }

    const rows = await env.DB.prepare(
      `SELECT id, object_key, title, folder, mime_type, COALESCE(dimensions, '') AS dimensions, size_bytes, created_at
       FROM media_assets
       WHERE restaurant_id = ?
       ORDER BY created_at DESC
       LIMIT 300`
    )
      .bind(rid)
      .all<Record<string, unknown>>();
    return json((rows.results || []).map(mapMediaRow));
  }

  if (path === '/api/media' && req.method === 'POST') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const contentType = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const allowedTypes: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/avif': 'avif',
      'image/svg+xml': 'svg',
    };
    const ext = allowedTypes[contentType];
    if (!ext) {
      return fail('Unsupported image format. Upload PNG, JPG, JPEG, WebP, AVIF, or SVG.', 400);
    }

    const body = await req.arrayBuffer();
    const maxBytes = contentType === 'image/svg+xml' ? 512 * 1024 : 5 * 1024 * 1024;
    if (body.byteLength < 1 || body.byteLength > maxBytes) {
      return fail(
        contentType === 'image/svg+xml'
          ? 'SVG logo size must be between 1 byte and 512 KB.'
          : 'Image size must be between 1 byte and 5 MB.',
        400
      );
    }

    if (contentType === 'image/svg+xml') {
      const svgText = new TextDecoder().decode(body);
      if (!/<svg[\s>]/i.test(svgText)) {
        return fail('Invalid SVG file.', 400);
      }
      if (/<script|on\w+\s*=|javascript:|<foreignObject|<iframe|<object|<embed/i.test(svgText)) {
        return fail('SVG contains disallowed active content.', 400);
      }
    }

    const rawFolder = (req.headers.get('x-folder') || 'dishes').trim().toLowerCase();
    const folder = ['dishes', 'ambiance', 'banners', 'gallery', 'branding'].includes(rawFolder)
      ? rawFolder
      : 'dishes';
    const rawTitle = decodeURIComponent(
      req.headers.get('x-title') || req.headers.get('x-file-name') || 'Uploaded Image'
    )
      .replace(/\.[a-z0-9]+$/i, '')
      .trim()
      .slice(0, 120);
    const dimensions = (req.headers.get('x-dimensions') || '').trim().slice(0, 40);

    const assetId = uid();
    const objectKey = `restaurants/${rid}/${folder}/${assetId}.${ext}`;
    await env.MEDIA.put(objectKey, body, { httpMetadata: { contentType } });

    await env.DB.prepare(
      `INSERT INTO media_assets (id, restaurant_id, object_key, title, folder, mime_type, dimensions, size_bytes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(assetId, rid, objectKey, rawTitle || 'Uploaded Image', folder, contentType, dimensions, body.byteLength)
      .run();

    await audit(env, member, 'media.uploaded', 'media_asset', assetId, { key: objectKey });
    const created = await env.DB.prepare(
      `SELECT * FROM media_assets WHERE id = ? AND restaurant_id = ?`
    )
      .bind(assetId, rid)
      .first<Record<string, unknown>>();
    return json(
      created
        ? { ...mapMediaRow(created), key: objectKey, size: body.byteLength }
        : { id: assetId, key: objectKey, size: body.byteLength },
      201
    );
  }

  const mediaMatch = path.match(/^\/api\/media\/([^/]+)$/);
  if (mediaMatch && (req.method === 'PUT' || req.method === 'PATCH')) {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const assetId = decodeURIComponent(mediaMatch[1]);
    const existing = await env.DB.prepare(
      `SELECT * FROM media_assets WHERE id = ? AND restaurant_id = ?`
    )
      .bind(assetId, rid)
      .first<Record<string, unknown>>();
    if (!existing) return fail('Media asset not found', 404);

    const contentType = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (contentType.startsWith('image/')) {
      const allowedTypes: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/avif': 'avif',
      };
      const ext = allowedTypes[contentType];
      if (!ext) return fail('Unsupported image format', 400);

      const body = await req.arrayBuffer();
      if (body.byteLength < 1 || body.byteLength > 5 * 1024 * 1024) {
        return fail('Image size must be between 1 byte and 5 MB', 400);
      }

      const oldKey = String(existing.object_key);
      const folder = String(existing.folder || 'dishes');
      const newKey = `restaurants/${rid}/${folder}/${uid()}.${ext}`;
      const dimensions = (
        req.headers.get('x-dimensions') || String(existing.dimensions || '')
      ).slice(0, 40);

      await env.MEDIA.put(newKey, body, { httpMetadata: { contentType } });
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE media_assets
           SET object_key = ?, mime_type = ?, dimensions = ?, size_bytes = ?, updated_at = CURRENT_TIMESTAMP
           WHERE id = ? AND restaurant_id = ?`
        ).bind(newKey, contentType, dimensions, body.byteLength, assetId, rid),
        env.DB.prepare(
          `UPDATE menu_items SET image_key = ?, updated_at = CURRENT_TIMESTAMP WHERE restaurant_id = ? AND image_key = ?`
        ).bind(newKey, rid, oldKey),
        env.DB.prepare(
          `UPDATE gallery_photos SET image_key = ?, updated_at = CURRENT_TIMESTAMP WHERE restaurant_id = ? AND image_key = ?`
        ).bind(newKey, rid, oldKey),
      ]);
      if (oldKey !== newKey && oldKey.startsWith(`restaurants/${rid}/`)) {
        await env.MEDIA.delete(oldKey);
      }
      await audit(env, member, 'media.replaced', 'media_asset', assetId);
    } else {
      const b = await req.json<Record<string, unknown>>();
      const title = b.title !== undefined ? String(b.title).trim() : String(existing.title);
      const rawFolder = b.folder !== undefined ? String(b.folder) : String(existing.folder);
      const folder = ['dishes', 'ambiance', 'banners', 'gallery'].includes(rawFolder)
        ? rawFolder
        : 'dishes';
      await env.DB.prepare(
        `UPDATE media_assets SET title = ?, folder = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND restaurant_id = ?`
      )
        .bind(title || 'Uploaded Image', folder, assetId, rid)
        .run();
      await audit(env, member, 'media.updated', 'media_asset', assetId);
    }

    const updated = await env.DB.prepare(
      `SELECT * FROM media_assets WHERE id = ? AND restaurant_id = ?`
    )
      .bind(assetId, rid)
      .first<Record<string, unknown>>();
    return json(updated ? mapMediaRow(updated) : { ok: true });
  }

  if (mediaMatch && req.method === 'DELETE') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const assetId = decodeURIComponent(mediaMatch[1]);
    const existing = await env.DB.prepare(
      `SELECT id, object_key FROM media_assets WHERE id = ? AND restaurant_id = ?`
    )
      .bind(assetId, rid)
      .first<{ id: string; object_key: string }>();
    if (!existing) return fail('Media asset not found', 404);

    await env.DB.batch([
      env.DB.prepare(`DELETE FROM media_assets WHERE id = ? AND restaurant_id = ?`).bind(
        assetId,
        rid
      ),
      env.DB.prepare(
        `UPDATE menu_items SET image_key = NULL WHERE restaurant_id = ? AND image_key = ?`
      ).bind(rid, existing.object_key),
      env.DB.prepare(
        `UPDATE gallery_photos SET image_key = NULL WHERE restaurant_id = ? AND image_key = ?`
      ).bind(rid, existing.object_key),
    ]);

    if (existing.object_key.startsWith(`restaurants/${rid}/`)) {
      await env.MEDIA.delete(existing.object_key);
    }
    await audit(env, member, 'media.deleted', 'media_asset', assetId);
    return json({ ok: true });
  }

  // ── Gallery (`/api/gallery`) ────────────────────────────────────────────
  if (path === '/api/gallery' && req.method === 'GET') {
    const rows = await env.DB.prepare(
      `SELECT id, title, caption, category, image_key, image_url, sort_order, featured
       FROM gallery_photos
       WHERE restaurant_id = ?
       ORDER BY sort_order ASC, created_at ASC`
    )
      .bind(rid)
      .all<Record<string, unknown>>();
    return json((rows.results || []).map(mapGalleryRow));
  }

  if (path === '/api/gallery' && req.method === 'POST') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const b = await req.json<Record<string, unknown>>();
    const title = String(b.title || '').trim();
    if (!title) return fail('Photo title is required');

    const caption = String(b.caption || '').trim();
    const rawCat = String(b.category || 'Dining Room');
    const category = ['Dining Room', 'Culinary', 'Private Events', 'Bar & Lounge'].includes(rawCat)
      ? rawCat
      : 'Dining Room';

    let imageKey = b.imageKey ? String(b.imageKey).trim() : '';
    let imageUrl = b.imageUrl ? String(b.imageUrl).trim() : '';
    if (!imageKey && imageUrl.startsWith('/api/media?key=')) {
      imageKey = new URL(imageUrl, 'https://zestro.local').searchParams.get('key') || '';
      imageUrl = '';
    }
    if (imageKey && !imageKey.startsWith(`restaurants/${rid}/`)) {
      return fail('Invalid media key for this restaurant', 403);
    }
    if (imageUrl.startsWith('data:')) {
      return fail('Upload gallery photos via /api/media first instead of inline base64.', 400);
    }

    const photoId = uid();
    const sortOrder = Math.max(0, Math.round(Number(b.sortOrder) || 0));
    const featured = b.featured ? 1 : 0;

    await env.DB.prepare(
      `INSERT INTO gallery_photos (id, restaurant_id, title, caption, category, image_key, image_url, sort_order, featured)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(photoId, rid, title, caption, category, imageKey || null, imageKey ? '' : imageUrl, sortOrder, featured)
      .run();

    await audit(env, member, 'gallery.photo.created', 'gallery_photo', photoId, { title });
    const row = await env.DB.prepare(
      `SELECT * FROM gallery_photos WHERE id = ? AND restaurant_id = ?`
    )
      .bind(photoId, rid)
      .first<Record<string, unknown>>();
    return json(row ? mapGalleryRow(row) : { id: photoId }, 201);
  }

  if (path === '/api/gallery/reorder' && req.method === 'POST') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const b = await req.json<{ orderedIds?: unknown }>();
    const orderedIds = Array.isArray(b.orderedIds)
      ? b.orderedIds.map((x) => String(x)).filter(Boolean)
      : [];
    if (orderedIds.length === 0) return fail('orderedIds array is required');

    await env.DB.batch(
      orderedIds.map((photoId, idx) =>
        env.DB.prepare(
          `UPDATE gallery_photos SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND restaurant_id = ?`
        ).bind(idx + 1, photoId, rid)
      )
    );
    await audit(env, member, 'gallery.reordered', 'gallery_photo', null);
    return json({ ok: true });
  }

  const galleryMatch = path.match(/^\/api\/gallery\/([^/]+)$/);
  if (galleryMatch && req.method === 'PATCH') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const photoId = decodeURIComponent(galleryMatch[1]);
    if (photoId === 'reorder') return fail('Method not allowed', 405);

    const existing = await env.DB.prepare(
      `SELECT * FROM gallery_photos WHERE id = ? AND restaurant_id = ?`
    )
      .bind(photoId, rid)
      .first<Record<string, unknown>>();
    if (!existing) return fail('Gallery photo not found', 404);

    const b = await req.json<Record<string, unknown>>();
    const title = b.title !== undefined ? String(b.title).trim() : String(existing.title);
    if (!title) return fail('Photo title cannot be empty');
    const caption =
      b.caption !== undefined ? String(b.caption).trim() : String(existing.caption || '');
    const rawCat = b.category !== undefined ? String(b.category) : String(existing.category);
    const category = ['Dining Room', 'Culinary', 'Private Events', 'Bar & Lounge'].includes(rawCat)
      ? rawCat
      : 'Dining Room';
    const featured =
      b.featured !== undefined ? (b.featured ? 1 : 0) : Number(existing.featured ? 1 : 0);
    const sortOrder =
      b.sortOrder !== undefined
        ? Math.max(0, Math.round(Number(b.sortOrder) || 0))
        : Number(existing.sort_order ?? 0);

    await env.DB.prepare(
      `UPDATE gallery_photos
       SET title = ?, caption = ?, category = ?, featured = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND restaurant_id = ?`
    )
      .bind(title, caption, category, featured, sortOrder, photoId, rid)
      .run();

    await audit(env, member, 'gallery.photo.updated', 'gallery_photo', photoId);
    const updated = await env.DB.prepare(
      `SELECT * FROM gallery_photos WHERE id = ? AND restaurant_id = ?`
    )
      .bind(photoId, rid)
      .first<Record<string, unknown>>();
    return json(updated ? mapGalleryRow(updated) : { ok: true });
  }

  if (galleryMatch && req.method === 'DELETE') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const photoId = decodeURIComponent(galleryMatch[1]);
    const result = await env.DB.prepare(
      `DELETE FROM gallery_photos WHERE id = ? AND restaurant_id = ?`
    )
      .bind(photoId, rid)
      .run();
    if (!result.meta.changes) return fail('Gallery photo not found', 404);
    await audit(env, member, 'gallery.photo.deleted', 'gallery_photo', photoId);
    return json({ ok: true });
  }

  // ── Homepage Configuration (`/api/homepage`) ────────────────────────────
  if (path === '/api/homepage' && req.method === 'GET') {
    const row = await env.DB.prepare(
      `SELECT settings_json FROM restaurant_settings WHERE restaurant_id = ?`
    )
      .bind(rid)
      .first<{ settings_json: string }>();
    const raw = safeJsonParse<Record<string, unknown>>(row?.settings_json, {});
    return json(buildHomepagePayload(raw));
  }

  if (path === '/api/homepage' && req.method === 'PUT') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const b = await req.json<Record<string, unknown>>();
    const row = await env.DB.prepare(
      `SELECT settings_json FROM restaurant_settings WHERE restaurant_id = ?`
    )
      .bind(rid)
      .first<{ settings_json: string }>();
    const current = safeJsonParse<Record<string, unknown>>(row?.settings_json, {});

    let heroImageKey = String(b.heroImageKey || '');
    let heroImageUrl = String(b.heroImageUrl || '');
    if (!heroImageKey && heroImageUrl.startsWith('/api/media?key=')) {
      heroImageKey = new URL(heroImageUrl, 'https://zestro.local').searchParams.get('key') || '';
    }
    if (heroImageKey && !heroImageKey.startsWith(`restaurants/${rid}/`)) {
      return fail('Invalid hero image key for this restaurant', 403);
    }
    if (heroImageUrl.startsWith('data:')) {
      return fail('Upload hero banner via /api/media first instead of inline base64.', 400);
    }

    const homepageConfig = {
      heroImageKey,
      heroImageUrl: heroImageKey ? '' : heroImageUrl,
      heroHeadline: String(b.heroHeadline || '').trim(),
      heroSubheadline: String(b.heroSubheadline || '').trim(),
      heroCtaText: String(b.heroCtaText || 'Explore Digital Menu').trim(),
      promoBannerEnabled: Boolean(b.promoBannerEnabled),
      promoBannerText: String(b.promoBannerText || '').trim(),
      promoBannerCode: String(b.promoBannerCode || '').trim().toUpperCase(),
      sections: Array.isArray(b.sections) ? b.sections : DEFAULT_HOMEPAGE_SECTIONS,
    };

    const merged = { ...current, homepageConfig };
    await env.DB.prepare(
      `INSERT INTO restaurant_settings (restaurant_id, settings_json, updated_at)
       VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT (restaurant_id) DO UPDATE SET
         settings_json = excluded.settings_json,
         updated_at = CURRENT_TIMESTAMP`
    )
      .bind(rid, JSON.stringify(merged))
      .run();

    await audit(env, member, 'homepage.updated', 'restaurant_settings', rid);
    return json(buildHomepagePayload(merged));
  }

  // ── Restaurant Settings (`/api/settings`) ───────────────────────────────
  if (path === '/api/settings' && req.method === 'GET') {
    const row = await env.DB.prepare(
      `SELECT settings_json FROM restaurant_settings WHERE restaurant_id = ?`
    )
      .bind(rid)
      .first<{ settings_json: string }>();
    const raw = safeJsonParse<Record<string, unknown>>(row?.settings_json, {});
    return json(buildSettingsPayload(member, raw));
  }

  if (path === '/api/settings' && req.method === 'PUT') {
    if (!canManage(member)) return fail('Insufficient permissions', 403);
    const b = await req.json<Record<string, unknown>>();
    const restaurantName = String(b.restaurantName || member.restaurant_name || 'ZESTRO').trim();
    if (!restaurantName) return fail('Restaurant name is required');

    const currencyLabel = formatCurrencyLabel(String(b.currency || member.restaurant_currency));
    const currencyCode = extractCurrencyCode(currencyLabel);

    const row = await env.DB.prepare(
      `SELECT settings_json FROM restaurant_settings WHERE restaurant_id = ?`
    )
      .bind(rid)
      .first<{ settings_json: string }>();
    const existing = safeJsonParse<Record<string, unknown>>(row?.settings_json, {});

    const taxRatePercent = Math.max(0, Math.min(50, Number(b.taxRatePercent ?? 0) || 0));
    const serviceChargePercent = Math.max(0, Math.min(50, Number(b.serviceChargePercent ?? 0) || 0));
    const deliveryFee = Math.max(0, Number(b.deliveryFee ?? existing.deliveryFee ?? 0) || 0);
    const minOrderAmount = Math.max(0, Number(b.minOrderAmount ?? existing.minOrderAmount ?? 0) || 0);
    const phone = String(b.phone || '').trim();
    const whatsappNumber = String(b.whatsappNumber || phone || existing.whatsappNumber || '').trim();
    const onlineOrderingEnabled = b.onlineOrderingEnabled !== false;
    const qrTableOrderingEnabled = b.qrTableOrderingEnabled !== false;

    const merged: Record<string, unknown> = {
      ...existing,
      restaurantName,
      tagline: String(b.tagline || '').trim(),
      cuisineType: String(b.cuisineType || '').trim(),
      currency: currencyLabel,
      taxRatePercent,
      taxPercent: taxRatePercent,
      serviceChargePercent,
      deliveryFee,
      minOrderAmount,
      phone,
      contactPhone: phone,
      whatsappNumber,
      email: String(b.email || '').trim(),
      address: String(b.address || '').trim(),
      openingHours: String(b.openingHours || '').trim(),
      websiteUrl: String(b.websiteUrl || 'https://zestro-customer-website.pages.dev').trim(),
      onlineOrderingEnabled,
      acceptingOrders: onlineOrderingEnabled,
      qrTableOrderingEnabled,
      autoAcceptOrders: Boolean(b.autoAcceptOrders),
      waiterCallSoundEnabled: b.waiterCallSoundEnabled !== false,
      logoKey: (() => {
        if (b.logoKey === undefined) return String(existing.logoKey || '');
        const k = String(b.logoKey || '').trim();
        if (!k) return '';
        return k.startsWith(`restaurants/${rid}/`) ? k : String(existing.logoKey || '');
      })(),
      logoUrl: (() => {
        if (b.logoKey !== undefined && !String(b.logoKey || '').trim() && b.logoUrl === undefined) {
          return '';
        }
        if (b.logoUrl === undefined) return String(existing.logoUrl || '');
        const u = String(b.logoUrl || '').trim();
        if (!u) return '';
        if (u.startsWith(`/api/media?key=${encodeURIComponent(`restaurants/${rid}/`)}`) || u.startsWith(`/api/media?key=restaurants/${rid}/`) || u.startsWith('https://')) {
          return u;
        }
        return String(existing.logoUrl || '');
      })(),
    };

    await env.DB.batch([
      env.DB.prepare(
        `UPDATE restaurants SET name = ?, currency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(restaurantName, currencyCode, rid),
      env.DB.prepare(
        `INSERT INTO restaurant_settings (restaurant_id, settings_json, updated_at)
         VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT (restaurant_id) DO UPDATE SET
           settings_json = excluded.settings_json,
           updated_at = CURRENT_TIMESTAMP`
      ).bind(rid, JSON.stringify(merged)),
    ]);

    await audit(env, member, 'settings.updated', 'restaurant_settings', rid);
    return json(
      buildSettingsPayload(
        { ...member, restaurant_name: restaurantName, restaurant_currency: currencyCode },
        merged
      )
    );
  }

  return fail('Route not found', 404);
}

export function createAdminHandler(options?: AdminWorkerOptions) {
  return {
    async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const origin = req.headers.get('Origin');
      if (origin && !parseAllowedOrigins(env).includes(origin)) {
        return withCors(fail('Origin not allowed', 403), null, env);
      }
      try {
        const res = await route(req, env, ctx, options?.sessionResolver);
        return withCors(res, origin, env);
      } catch (error) {
        console.error('ZESTRO Admin API unhandled error:', error);
        return withCors(fail('Internal server error', 500), origin, env);
      }
    },
  };
}

export default createAdminHandler();
