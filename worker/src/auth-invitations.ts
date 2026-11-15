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
  const expiresAt = new Date(Date.now() + (input.expiresInHours ?? 48) * 60 * 60 * 1000).toISOString();

  await env.DB.prepare(
    `INSERT INTO auth_invitation_tokens
      (id, restaurant_id, membership_id, token_hash, expires_at, created_by_membership_id)
     SELECT ?, ?, m.id, ?, ?, ?
     FROM memberships m
     WHERE m.id = ? AND m.restaurant_id = ? AND m.status = 'invited'`
  ).bind(
    invitationId,
    input.restaurantId,
    tokenHash,
    expiresAt,
    input.createdByMembershipId,
    input.membershipId,
    input.restaurantId
  ).run();

  const row = await env.DB.prepare(
    'SELECT id FROM auth_invitation_tokens WHERE id = ?'
  ).bind(invitationId).first();
  if (!row) throw new Error('Invitation is not eligible or could not be issued.');
  return { token, invitationId, expiresAt };
}

export async function consumeInvitation(
  env: InvitationEnv,
  token: string
): Promise<InvitationRecord | null> {
  if (token.length < 40 || token.length > 128) return null;
  const tokenHash = await sha256(token);
  const invitation = await env.DB.prepare(
    `SELECT * FROM auth_invitation_tokens
     WHERE token_hash = ? AND consumed_at IS NULL AND revoked_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
     LIMIT 1`
  ).bind(tokenHash).first<InvitationRecord>();
  if (!invitation) return null;

  // Reserve the membership first only while the invitation is still valid.
  // The second statement consumes the token only if that reservation is present.
  // Both operations are one D1 batch; retries can complete a reserved-but-not-
  // consumed invitation without activating the membership.
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE memberships
       SET auth_subject = 'pending-auth:' || id
       WHERE id = ? AND restaurant_id = ? AND status = 'invited'
         AND (auth_subject IS NULL OR auth_subject = '' OR auth_subject = 'pending-auth:' || id)
         AND EXISTS (
           SELECT 1 FROM auth_invitation_tokens t
           WHERE t.id = ? AND t.membership_id = memberships.id
             AND t.token_hash = ? AND t.consumed_at IS NULL
             AND t.revoked_at IS NULL AND t.expires_at > CURRENT_TIMESTAMP
         )`
    ).bind(invitation.membership_id, invitation.restaurant_id, invitation.id, tokenHash),
    env.DB.prepare(
      `UPDATE auth_invitation_tokens
       SET consumed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND membership_id = ? AND token_hash = ?
         AND consumed_at IS NULL AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
         AND EXISTS (
           SELECT 1 FROM memberships m
           WHERE m.id = ? AND m.restaurant_id = ?
             AND m.status = 'invited'
             AND m.auth_subject = 'pending-auth:' || m.id
         )`
    ).bind(
      invitation.id,
      invitation.membership_id,
      tokenHash,
      invitation.membership_id,
      invitation.restaurant_id
    ),
  ]);

  if (Number(result[1].meta?.changes ?? 0) !== 1) return null;
  const consumed = await env.DB.prepare(
    `SELECT * FROM auth_invitation_tokens
     WHERE id = ? AND consumed_at IS NOT NULL AND revoked_at IS NULL LIMIT 1`
  ).bind(invitation.id).first<InvitationRecord>();
  return consumed || null;
}

export async function attachAuthUserToInvitation(
  env: InvitationEnv,
  invitation: InvitationRecord,
  authUserId: string
): Promise<boolean> {
  if (!authUserId) return false;
  const result = await env.DB.prepare(
    `UPDATE memberships
     SET auth_subject = ?
     WHERE id = ? AND restaurant_id = ? AND status = 'invited'
       AND auth_subject = 'pending-auth:' || id
       AND EXISTS (
         SELECT 1 FROM auth_invitation_tokens t
         WHERE t.id = ? AND t.membership_id = memberships.id
           AND t.consumed_at IS NOT NULL AND t.revoked_at IS NULL
       )`
  ).bind(
    authUserId,
    invitation.membership_id,
    invitation.restaurant_id,
    invitation.id
  ).run();
  return Number(result.meta?.changes ?? 0) === 1;
}

export async function activateInvitationMembership(
  env: InvitationEnv,
  invitation: InvitationRecord,
  authUserId: string
): Promise<boolean> {
  if (!authUserId || !invitation.id) return false;
  const result = await env.DB.prepare(
    `UPDATE memberships
     SET status = 'active'
     WHERE id = ? AND restaurant_id = ? AND status = 'invited'
       AND auth_subject = ?
       AND EXISTS (
         SELECT 1 FROM auth_invitation_tokens t
         WHERE t.id = ? AND t.membership_id = memberships.id
           AND t.consumed_at IS NOT NULL AND t.revoked_at IS NULL
       )`
  ).bind(
    invitation.membership_id,
    invitation.restaurant_id,
    authUserId,
    invitation.id
  ).run();
  return Number(result.meta?.changes ?? 0) === 1;
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
