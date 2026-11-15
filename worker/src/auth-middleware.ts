import { getAuthSession, type AuthEnv } from './auth-schema';

type DbRole = 'owner' | 'admin' | 'manager' | 'staff' | 'viewer';

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

export type SessionAuthOutcome =
  | { kind: 'ok'; member: Member }
  | { kind: 'unauthenticated'; message: string }
  | { kind: 'forbidden'; message: string };

export interface SessionAuthEnv extends AuthEnv {
  DB: D1Database;
}

export async function authenticateSession(
  req: Request,
  env: SessionAuthEnv
): Promise<SessionAuthOutcome> {
  let session: Awaited<ReturnType<typeof getAuthSession>>;
  try {
    session = await getAuthSession(req, env);
  } catch {
    return { kind: 'unauthenticated', message: 'Authentication required' };
  }

  const user = session?.user;
  if (!user?.id || !user.email) {
    return { kind: 'unauthenticated', message: 'Authentication required' };
  }

  const requestedRestaurantId = (
    req.headers.get('X-Restaurant-Id') ||
    new URL(req.url).searchParams.get('restaurantId') ||
    ''
  ).trim();

  const selectMember = `
    SELECT
      m.id,
      m.restaurant_id,
      m.auth_subject,
      m.email,
      m.display_name,
      m.role,
      COALESCE(m.job_title, '') AS job_title,
      r.name AS restaurant_name,
      r.slug AS restaurant_slug,
      r.currency AS restaurant_currency,
      r.timezone AS restaurant_timezone,
      r.status AS restaurant_status
    FROM memberships m
    JOIN restaurants r ON r.id = m.restaurant_id
    WHERE m.auth_subject = ?
      AND m.status = 'active'
      AND r.status = 'active'
  `;

  const member = requestedRestaurantId
    ? await env.DB.prepare(
        `${selectMember} AND m.restaurant_id = ? LIMIT 1`
      ).bind(user.id, requestedRestaurantId).first<Member>()
    : await env.DB.prepare(
        `${selectMember}
         ORDER BY CASE m.role
           WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'manager' THEN 3
           WHEN 'staff' THEN 4 ELSE 5 END, m.created_at ASC
         LIMIT 1`
      ).bind(user.id).first<Member>();

  if (!member) {
    const anyMembership = await env.DB.prepare(
      `SELECT m.id FROM memberships m
       JOIN restaurants r ON r.id = m.restaurant_id
       WHERE m.auth_subject = ? AND m.status = 'active' AND r.status = 'active'
       LIMIT 1`
    ).bind(user.id).first();
    return anyMembership
      ? { kind: 'forbidden', message: 'Access denied for the requested restaurant tenant' }
      : { kind: 'forbidden', message: 'Your account is not registered as an active staff member.' };
  }

  // Email is deliberately not used for identity linking. auth_subject must be
  // explicitly set to Better Auth's immutable user.id through a verified
  // invitation or owner bootstrap flow.
  return { kind: 'ok', member };
}
