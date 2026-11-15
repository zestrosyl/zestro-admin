# ZESTRO Staff Email + Password Authentication — Implementation Worklog

**Status:** Isolated implementation work; not approved for production use.

## Baseline and scope
- Parent plan: PR #8, based on `live-backend/nov-14-2026`.
- Implementation branch: `feat/staff-email-password-auth-implementation`.
- Preserve the current production branch, Worker bindings, D1 data, Cloudflare Access configuration, and deployment setup.
- No production migration, secret creation, Access policy changes, or deployment is part of this branch.

## Repository baseline findings
- Admin UI: React + TypeScript + Vite.
- API proxy: Pages Function at `functions/api/[[path]].ts`.
- API: Cloudflare Worker at `worker/src/index.ts`.
- D1 membership model: `memberships` with tenant-scoped `restaurant_id`, `auth_subject`, role, and invited/active/disabled status.
- Current front-door: Pages proxy rejects requests without a Cloudflare Access JWT before forwarding to the Worker.
- Current Worker: all `/api/*` routes pass through Access-JWT verification and active membership resolution.
- Current owner identity is tied to the Access subject. A matching email is not proof that a Better Auth identity belongs to the existing owner.
- Existing staff UI and staff invite endpoint are Access-oriented; invites do not yet provision a password credential or send an invitation email.

## Authentication architecture requirements
1. Keep the admin application/login route reachable without Cloudflare Access.
2. Publicly reachable authentication endpoints must be narrowly allowlisted (sign-in, invitation acceptance, forgot/reset password, session discovery as required, and health). Do not make business API routes public.
3. Every business API request must validate the Better Auth session, resolve an active membership for the requested tenant, require an active restaurant, and apply the existing server-side role permissions.
4. Never accept a role or tenant identifier as authorization evidence from the browser.
5. Do not auto-link an existing membership to a new auth identity based only on equal email strings.
6. Owner linking needs a one-time, independently verified bootstrap controlled by an operator with access to the currently trusted owner account. Record the resulting mapping and audit event. Do not disable the current owner auth path until this has been verified.
7. Staff invitations are tenant-scoped, single-use, high-entropy, expiring, stored hashed at rest, and may only grant roles the inviter is allowed to grant.
8. Email delivery failure must leave the member non-active and support safe resend.
9. Password reset must not disclose account existence and must revoke existing sessions after successful reset.
10. Session revocation and invitation activation need explicit idempotent/recovery behavior for partial failures.

## D1 correctness note
Do not assume a D1 interactive transaction API. Current Cloudflare D1 documentation states that `D1Database.batch()` executes its prepared statements sequentially as a transactional batch and rolls back the whole batch if one statement fails. Use that capability when the complete state transition fits in a batch. For flows involving Better Auth internals or an external email side effect, design explicit state machines/outbox-style recovery and test failures between each durable step. Do not send email inside an assumed database transaction.

Reference: https://developers.cloudflare.com/d1/worker-api/d1-database/

## Implementation acceptance gates
- Unauthenticated visitor can load the login page and auth routes without being in the Access allowlist.
- Unauthenticated visitor receives 401/403 from every business API endpoint, including direct Worker URL access.
- Authenticated user without membership receives 403.
- Tenant A cannot read or mutate Tenant B even with forged request headers/query parameters.
- Disabled membership or suspended restaurant is rejected immediately.
- Viewer/staff/manager/admin/owner permission boundaries are tested on actual business endpoints.
- Invitation token: invalid, expired, used, revoked, wrong-tenant, and wrong-email cases fail closed.
- Email-send failure leaves a recoverable pending invitation and grants no membership access.
- Better Auth account creation or password-setting failure leaves membership pending; retry is safe.
- Password reset invalid/expired/reused token fails; successful reset revokes prior sessions.
- Existing owner migration is tested without Access removal; deliberate rollback/recovery remains possible.
- Existing non-auth worker tests remain green.

## Development and production boundary
Development tests must use an isolated local D1 database / Miniflare state and fake email transport. Do not connect test code to the production D1 binding or send messages through production Resend.

This document records design constraints only; it does not authorize or perform any production resource changes.

## Current branch status (2026-11-15)

### Implemented in this draft
- Added Better Auth session and email/password configuration using the native D1 adapter.
- Added a public, exact-path auth proxy allowlist and changed the Worker business API boundary to resolve Better Auth sessions to active tenant memberships on each request.
- Added sign-in, request-password-reset, and reset-password UI.
- Added invitation token hashing/reservation/activation primitives and an owner-link proof primitive. The helpers are not yet exposed as production HTTP workflows.
- Removed the former production Access-JWT verification path from the Worker. The existing Access variables in Wrangler are now unused; edge Access policies have not been changed.
- Preserved tenant and role checks in business route handlers; regression tests were adapted to accept an injected test-only identity resolver.

### Explicitly incomplete — do not deploy or apply migration
1. **Staff invitation acceptance is not wired.** There is no public accept-invitation endpoint, Better Auth credential creation flow, or invitation acceptance page. The standalone helpers are not sufficient to onboard staff.
2. **Owner bootstrap is not operational.** A helper requires an independently verified one-time proof, but no secure operator proof-creation workflow exists. The old owner cannot be assumed linked by email equality.
3. **D1 schema is not generated/validated against the pinned Better Auth version.** Compare with Better Auth's schema generator and run on isolated D1 only before merging.
4. **Password-reset session cleanup has a partial-failure gap.** Password reset callback deletes session rows in a subsequent D1 statement. If that statement fails after the credential update, old sessions may remain. Build and test a recoverable cleanup/outbox path or an equivalent fail-closed recovery before production.
5. **The test suite has not been run.** The revised test-only resolver preserves existing CRUD/RBAC coverage structure but is not a real Better Auth password/session end-to-end test.
6. **Edge access policy remains unmodified.** The Admin Pages host must permit the login page without Cloudflare Access, and the Worker API hostname must be reachable so the Worker can enforce Better Auth. Verify this with dedicated staging hosts/policies before any production cutover.
7. **Resend is not configured.** No Resend secrets were created. Invitation email helper and reset-email callback need an isolated fake transport test.

### Production isolation actions
- No D1 migration was applied, locally or remotely through this branch.
- No Better Auth secret or Resend secret was added to Cloudflare.
- No Worker deployment was requested.
- No PR was merged.
- The Pages project was found to auto-preview every branch. The branch was excluded from preview deployment triggers; previews that had already completed for earlier commits on this branch were deleted. The production branch and canonical production deployment were unchanged.

**Review status:** draft implementation only. Do not promote or deploy until the incomplete items above are closed and reviewed.
