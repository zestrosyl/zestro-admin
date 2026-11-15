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
