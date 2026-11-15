import type { AuthEnv } from './auth-schema';

interface OwnerBootstrapEnv extends AuthEnv {
  DB: D1Database;
}

/**
 * Links the existing owner membership only after an operator has independently
 * verified ownership of the current Access identity and the new Better Auth
 * identity. This function deliberately does not compare email addresses.
 *
 * The operator-supplied proof record must be created through a separately
 * authenticated maintenance workflow and must be single-use and short-lived.
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
  if (
    !input.expectedAccessSubject ||
    !input.betterAuthUserId ||
    !input.proofId ||
    !input.verifiedBy ||
    input.expectedAccessSubject === input.betterAuthUserId
  ) return false;

  // Proof table is intentionally not auto-populated by this code. A human
  // operator must create a one-time verification record after confirming
  // control of both identities through independent channels.
  const proof = await env.DB.prepare(
    `SELECT id FROM auth_owner_link_proofs
     WHERE id = ? AND restaurant_id = ? AND membership_id = ?
       AND access_subject = ? AND better_auth_user_id = ?
       AND verified_by = ? AND consumed_at IS NULL
       AND expires_at > CURRENT_TIMESTAMP
     LIMIT 1`
  ).bind(
    input.proofId,
    input.restaurantId,
    input.membershipId,
    input.expectedAccessSubject,
    input.betterAuthUserId,
    input.verifiedBy
  ).first();

  if (!proof) return false;

  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE memberships
       SET auth_subject = ?
       WHERE id = ? AND restaurant_id = ? AND role = 'owner'
         AND status = 'active' AND auth_subject = ?`
    ).bind(
      input.betterAuthUserId,
      input.membershipId,
      input.restaurantId,
      input.expectedAccessSubject
    ),
    env.DB.prepare(
      `UPDATE auth_owner_link_proofs SET consumed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP`
    ).bind(input.proofId),
  ]);

  return Number(result[0].meta?.changes ?? 0) === 1 &&
    Number(result[1].meta?.changes ?? 0) === 1;
}
