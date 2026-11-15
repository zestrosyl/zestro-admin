import type { AuthEnv } from './auth-schema';
interface OwnerBootstrapEnv extends AuthEnv { DB: D1Database; }

/**
 * Privileged operator-only workflow. Proofs are created only after the current
 * owner has passed an independent identity check and the new Better Auth
 * account has passed a separate possession challenge. Never expose this to
 * normal restaurant sessions and never infer identity from equal email.
 */
export async function createOwnerLinkProof(
  env: OwnerBootstrapEnv,
  input: { restaurantId: string; membershipId: string; expectedAccessSubject: string;
    betterAuthUserId: string; verifiedBy: string; verificationCaseId: string;
    expiresInMinutes?: number }
): Promise<{ proofId: string; expiresAt: string }> {
  if (!input.expectedAccessSubject || !input.betterAuthUserId || !input.verifiedBy ||
      !input.verificationCaseId || input.expectedAccessSubject === input.betterAuthUserId ||
      input.verifiedBy === input.betterAuthUserId) throw new Error('Independent verification context is required.');
  const minutes = Math.min(30, Math.max(5, Number(input.expiresInMinutes ?? 15)));
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const proofId = crypto.randomUUID();
  const result = await env.DB.prepare(
    `INSERT INTO auth_owner_link_proofs
      (id, restaurant_id, membership_id, access_subject, better_auth_user_id,
       verified_by, verification_case_id, expires_at)
     SELECT ?, ?, m.id, ?, ?, ?, ?, ? FROM memberships m
     WHERE m.id = ? AND m.restaurant_id = ? AND m.role = 'owner'
       AND m.status = 'active' AND m.auth_subject = ?
       AND NOT EXISTS (SELECT 1 FROM auth_owner_link_proofs p
        WHERE p.membership_id = m.id AND p.consumed_at IS NULL AND p.expires_at > CURRENT_TIMESTAMP)`
  ).bind(proofId,input.restaurantId,input.expectedAccessSubject,input.betterAuthUserId,
    input.verifiedBy,input.verificationCaseId,expiresAt,input.membershipId,
    input.restaurantId,input.expectedAccessSubject).run();
  if (Number(result.meta?.changes ?? 0) !== 1) throw new Error('Owner proof could not be issued.');
  return { proofId, expiresAt };
}

export async function linkExistingOwnerAccount(
  env: OwnerBootstrapEnv,
  input: { restaurantId:string; membershipId:string; expectedAccessSubject:string;
    betterAuthUserId:string; proofId:string; verifiedBy:string; verificationCaseId:string }
): Promise<boolean> {
  if (!input.expectedAccessSubject || !input.betterAuthUserId || !input.proofId ||
      !input.verifiedBy || !input.verificationCaseId ||
      input.expectedAccessSubject === input.betterAuthUserId) return false;
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE memberships SET auth_subject = ?
       WHERE id = ? AND restaurant_id = ? AND role = 'owner' AND status = 'active'
         AND auth_subject = ? AND EXISTS (
           SELECT 1 FROM auth_owner_link_proofs p WHERE p.id = ?
             AND p.restaurant_id = ? AND p.membership_id = ?
             AND p.access_subject = ? AND p.better_auth_user_id = ?
             AND p.verified_by = ? AND p.verification_case_id = ?
             AND p.consumed_at IS NULL AND p.expires_at > CURRENT_TIMESTAMP)`
    ).bind(input.betterAuthUserId,input.membershipId,input.restaurantId,input.expectedAccessSubject,
      input.proofId,input.restaurantId,input.membershipId,input.expectedAccessSubject,
      input.betterAuthUserId,input.verifiedBy,input.verificationCaseId),
    env.DB.prepare(
      `UPDATE auth_owner_link_proofs SET consumed_at = CURRENT_TIMESTAMP
       WHERE id = ? AND restaurant_id = ? AND membership_id = ? AND access_subject = ?
         AND better_auth_user_id = ? AND verified_by = ? AND verification_case_id = ?
         AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
         AND EXISTS (SELECT 1 FROM memberships m WHERE m.id = ? AND m.restaurant_id = ?
           AND m.role = 'owner' AND m.status = 'active' AND m.auth_subject = ?)`
    ).bind(input.proofId,input.restaurantId,input.membershipId,input.expectedAccessSubject,
      input.betterAuthUserId,input.verifiedBy,input.verificationCaseId,input.membershipId,
      input.restaurantId,input.betterAuthUserId)
  ]);
  return Number(result[0].meta?.changes ?? 0) === 1 &&
    Number(result[1].meta?.changes ?? 0) === 1;
}
