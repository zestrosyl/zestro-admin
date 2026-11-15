import type { AuthEnv } from './auth-schema';

interface OwnerBootstrapEnv extends AuthEnv {
  DB: D1Database;
}

/**
 * Requires a separately created single-use proof after an operator independently
 * verifies control of the current Access identity and the new Better Auth
 * identity. Linking is never based on matching email addresses.
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

  const results = await env.DB.batch([
    env.DB.prepare(
      `UPDATE auth_owner_link_proofs SET consumed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND restaurant_id = ? AND membership_id = ?
         AND access_subject = ? AND better_auth_user_id = ?
         AND verified_by = ? AND consumed_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP`
    ).bind(
      input.proofId, input.restaurantId, input.membershipId,
      input.expectedAccessSubject, input.betterAuthUserId, input.verifiedBy
    ),
    env.DB.prepare(
      `UPDATE memberships SET auth_subject = ?
       WHERE id = ? AND restaurant_id = ? AND role = 'owner'
         AND status = 'active' AND auth_subject = ?`
    ).bind(
      input.betterAuthUserId, input.membershipId,
      input.restaurantId, input.expectedAccessSubject
    ),
  ]);

  return Number(results[0].meta?.changes ?? 0) === 1 &&
    Number(results[1].meta?.changes ?? 0) === 1;
}
