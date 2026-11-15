import type { AuthEnv } from './auth-schema';

interface InvitationEnv extends AuthEnv {
  DB: D1Database;
}

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return base64Url(new Uint8Array(digest));
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

export interface InvitationRecord {
  id: string;
  restaurant_id: string;
  membership_id: string;
  token_hash: string;
  reserved_at?: string | null;
  auth_user_id?: string | null;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
  created_by_membership_id: string;
}

export async function issueInvitation(
  env: InvitationEnv,
  input: {
    restaurantId: string;
    membershipId: string;
    createdByMembershipId: string;
    expiresInHours?: number;
  }
): Promise<{ token: string; invitationId: string; expiresAt: string }> {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = base64Url(bytes);
  const tokenHash = await sha256(token);
  const invitationId = crypto.randomUUID();
  const expiryHours = Math.min(168, Math.max(1, Number(input.expiresInHours ?? 48)));
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE auth_invitation_tokens SET revoked_at = CURRENT_TIMESTAMP
       WHERE membership_id = ? AND restaurant_id = ? AND consumed_at IS NULL AND revoked_at IS NULL`
    ).bind(input.membershipId, input.restaurantId),
    env.DB.prepare(
      `INSERT INTO auth_invitation_tokens
        (id, restaurant_id, membership_id, token_hash, expires_at, created_by_membership_id)
       SELECT ?, ?, m.id, ?, ?, ?
       FROM memberships m
       WHERE m.id = ? AND m.restaurant_id = ? AND m.status = 'invited'`
    ).bind(invitationId, input.restaurantId, tokenHash, expiresAt, input.createdByMembershipId, input.membershipId, input.restaurantId),
  ]);

  const row = await env.DB.prepare(
    'SELECT id FROM auth_invitation_tokens WHERE id = ?'
  ).bind(invitationId).first();
  if (!row) throw new Error('Invitation is not eligible or could not be issued.');
  return { token, invitationId, expiresAt };
}

export async function getInvitation(env: InvitationEnv, token: string) {
  if (token.length < 40 || token.length > 128) return null;
  const tokenHash = await sha256(token);
  return env.DB.prepare(
    `SELECT t.*, m.email, m.display_name
     FROM auth_invitation_tokens t JOIN memberships m ON m.id = t.membership_id
     WHERE t.token_hash = ? AND t.consumed_at IS NULL AND t.revoked_at IS NULL
       AND t.expires_at > CURRENT_TIMESTAMP AND m.status = 'invited' LIMIT 1`
  ).bind(tokenHash).first<InvitationRecord & { email: string; display_name: string }>();
}

export async function reserveInvitation(env: InvitationEnv, invitation: InvitationRecord): Promise<boolean> {
  const result = await env.DB.prepare(
    `UPDATE auth_invitation_tokens SET reserved_at = CURRENT_TIMESTAMP
     WHERE id = ? AND membership_id = ? AND consumed_at IS NULL AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
       AND (reserved_at IS NULL OR reserved_at < datetime('now', '-10 minutes') OR auth_user_id IS NOT NULL)`
  ).bind(invitation.id, invitation.membership_id).run();
  return Number(result.meta?.changes ?? 0) === 1;
}

export async function attachAuthUserToInvitation(
  env: InvitationEnv, invitation: InvitationRecord, authUserId: string
): Promise<boolean> {
  if (!authUserId) return false;
  const result = await env.DB.prepare(
    `UPDATE auth_invitation_tokens SET auth_user_id = ?
     WHERE id = ? AND membership_id = ? AND consumed_at IS NULL AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP AND (auth_user_id IS NULL OR auth_user_id = ?)`
  ).bind(authUserId, invitation.id, invitation.membership_id, authUserId).run();
  return Number(result.meta?.changes ?? 0) === 1;
}

export async function activateInvitationMembership(
  env: InvitationEnv, invitation: InvitationRecord, authUserId: string
): Promise<boolean> {
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE memberships SET auth_subject = ?, status = 'active'
       WHERE id = ? AND restaurant_id = ? AND status = 'invited'
         AND EXISTS (SELECT 1 FROM auth_invitation_tokens t WHERE t.id = ?
           AND t.auth_user_id = ? AND t.consumed_at IS NULL AND t.revoked_at IS NULL
           AND t.expires_at > CURRENT_TIMESTAMP)`
    ).bind(authUserId, invitation.membership_id, invitation.restaurant_id, invitation.id, authUserId),
    env.DB.prepare(
      `UPDATE auth_invitation_tokens SET consumed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND membership_id = ? AND auth_user_id = ? AND consumed_at IS NULL
         AND revoked_at IS NULL AND expires_at > CURRENT_TIMESTAMP
         AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = ? AND m.restaurant_id = ?
           AND m.auth_subject = ? AND m.status = 'active')`
    ).bind(invitation.id, invitation.membership_id, authUserId,
      invitation.membership_id, invitation.restaurant_id, authUserId),
  ]);
  return Number(result[0].meta?.changes ?? 0) === 1 && Number(result[1].meta?.changes ?? 0) === 1;
}

export async function revokeInvitation(
  env: InvitationEnv,
  invitationId: string,
  restaurantId: string
): Promise<void> {
  await env.DB.prepare(
    `UPDATE auth_invitation_tokens SET revoked_at = CURRENT_TIMESTAMP
     WHERE id = ? AND restaurant_id = ? AND consumed_at IS NULL AND revoked_at IS NULL`
  ).bind(invitationId, restaurantId).run();
}

export async function verifyInvitationToken(
  env: InvitationEnv,
  token: string,
  expectedHash: string
): Promise<boolean> {
  const actualHash = await sha256(token);
  return constantTimeEqual(actualHash, expectedHash);
}
