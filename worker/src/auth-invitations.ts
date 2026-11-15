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

  // D1 batch is transactional. The conditional update provides single-use
  // consumption even when two requests race; the membership binding is not
  // activated until the Better Auth user/password operation has completed.
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE auth_invitation_tokens
       SET consumed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND consumed_at IS NULL AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP`
    ).bind(invitation.id),
    env.DB.prepare(
      `UPDATE memberships
       SET auth_subject = 'pending-auth:' || id
       WHERE id = ? AND restaurant_id = ? AND status = 'invited'`
    ).bind(invitation.membership_id, invitation.restaurant_id),
  ]);

  const consumed = Number((result[0] as D1Result).meta?.changes ?? 0);
  const membershipTouched = Number((result[1] as D1Result).meta?.changes ?? 0);
  if (consumed !== 1 || membershipTouched !== 1) return null;
  return invitation;
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
       AND auth_subject = 'pending-auth:' || id`
  ).bind(authUserId, invitation.membership_id, invitation.restaurant_id).run();
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
