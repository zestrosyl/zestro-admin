import type { AuthEnv } from './auth-schema';

interface OwnerBootstrapEnv extends AuthEnv { DB: D1Database; }

/**
 * Consume a short-lived proof created by an independently authenticated
 * operator only after verifying the existing Access owner and new Better Auth
 * identity through separate channels. Email equality is never used as proof.
 */
export async function linkExistingOwnerAccount(
  env: OwnerBootstrapEnv,
  input: {
    restaurantId: string;
    membershipId: string;
    expectedAccessSubject: string;
    betterAuthUserId: string;
    proofId: string;
    verifiedBy: string;
  }
): Promise<boolean> {
  if (!input.expectedAccessSubject || !input.betterAuthUserId ||
      !input.proofId || !input.verifiedBy ||
      input.expectedAccessSubject === input.betterAuthUserId) return false;

  // This is deliberately a two-step, idempotent D1 batch. The first statement
  // only links when the proof is valid. The second only consumes that proof
  // after the membership is demonstrably linked to the target auth user.
  // A row-count mismatch leaves the proof unconsumed so an operator can retry.
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE memberships SET auth_subject = ?
       WHERE id = ? AND restaurant_id = ? AND role = 'owner'
         AND status = 'active' AND auth_subject = ?
         AND EXISTS (
           SELECT 1 FROM auth_owner_link_proofs p
           WHERE p.id = ? AND p.restaurant_id = ? AND p.membership_id = ?
             AND p.access_subject = ? AND p.better_auth_user_id = ?
             AND p.verified_by = ? AND p.consumed_at IS NULL
             AND p.expires_at > CURRENT_TIMESTAMP
         )`
    ).bind(
      input.betterAuthUserId,
      input.membershipId,
      input.restaurantId,
      input.expectedAccessSubject,
      input.proofId,
      input.restaurantId,
      input.membershipId,
      input.expectedAccessSubject,
      input.betterAuthUserId,
      input.verifiedBy
    ),
    env.DB.prepare(
      `UPDATE auth_owner_link_proofs SET consumed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND restaurant_id = ? AND membership_id = ?
         AND access_subject = ? AND better_auth_user_id = ?
         AND verified_by = ? AND consumed_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP
         AND EXISTS (
           SELECT 1 FROM memberships m
           WHERE m.id = ? AND m.restaurant_id = ?
             AND m.role = 'owner' AND m.status = 'active'
             AND m.auth_subject = ?
         )`
    ).bind(
      input.proofId,
      input.restaurantId,
      input.membershipId,
      input.expectedAccessSubject,
      input.betterAuthUserId,
      input.verifiedBy,
      input.membershipId,
      input.restaurantId,
      input.betterAuthUserId
    ),
  ]);

  if (Number(result[1].meta?.changes ?? 0) !== 1) return false;
  const linked = await env.DB.prepare(
    `SELECT id FROM memberships
     WHERE id = ? AND restaurant_id = ? AND role = 'owner'
       AND status = 'active' AND auth_subject = ? LIMIT 1`
  ).bind(input.membershipId, input.restaurantId, input.betterAuthUserId).first();
  return Boolean(linked);
}
