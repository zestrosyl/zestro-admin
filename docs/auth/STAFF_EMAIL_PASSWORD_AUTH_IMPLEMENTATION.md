# ZESTRO Staff Email + Password Authentication — Implementation Worklog

**Status:** Incomplete isolated implementation draft. Not deployable.

## Repositories and branch
- Repository: zestrosyl/zestro-admin
- Base: live-backend/nov-14-2026
- Branch: feat/staff-email-password-auth-implementation
- Draft PR: https://github.com/zestrosyl/zestro-admin/pull/9

## Verified platform boundary
- Cloudflare Pages production project uses live-backend/nov-14-2026.
- Current production D1 binding is zestro-saas-db.
- Current Admin Worker is zestro-admin-api.
- This branch is excluded from automatic Pages preview builds.
- No production DB rows were read or changed in this implementation follow-up.
- No D1 migration was applied, no secrets created, no Access policy changed, and no Worker deployed.

## Architecture target
1. Public Pages login/reset routes.
2. Better Auth session cookie scoped to the Admin hostname.
3. Pages API proxy forwards only required Better Auth cookie(s) to the Worker and strips legacy Access cookies.
4. Worker independently authenticates every business API request using Better Auth session lookup.
5. Worker resolves the immutable Better Auth user ID to an active membership for a restaurant and checks active restaurant state.
6. Existing route-level server-side role checks remain authoritative.
7. No email-equality owner auto-linking; owner identity migration requires a separately authenticated operator proof.

## Current code in this draft
- Basic sign-in, request-reset, and reset-password screens.
- Public proxy allowlist for five Better Auth paths.
- Worker session authentication and explicit membership lookup.
- Invitation token hashing/reservation/activation primitives (not connected to HTTP routes/UI).
- Owner-link proof consumption helper (proof creation and independent verification flow not implemented).
- Existing CRUD/RBAC tests adapted with test-only identity injection.

## Hard blockers — do not merge or deploy
1. Better Auth package is declared in worker/package.json, but not present in worker/package-lock.json. The lockfile must be regenerated in a normal Node/npm environment; it cannot safely be fabricated using repository content editing.
2. Better Auth schema must be generated/verified for the exact resolved version. The current SQL is illustrative and not apply-ready.
3. Auth invitation acceptance API and UI do not exist; invited staff cannot yet set a first password.
4. Owner bootstrap proof creation, identity verification, and audit workflow do not exist.
5. Password reset session revocation is a separate D1 write after password update. It has a partial-failure window and needs an independently tested recoverable/fail-closed design.
6. Better Auth cookie names and cross-origin cookie behavior must be validated against the selected version. Browser cookie semantics for the app host and API Worker hostname must be tested end to end.
7. Cloudflare Pages Access policy must be staged to permit only the login app while protecting unrelated apps. API Worker hostname must be reachable to the Pages proxy; Worker auth remains mandatory.
8. No npm ci, UI build, Worker typecheck, integration suite, local D1 migration test, or actual Better Auth sign-in test has been run. Connector access provides repository/API actions but no local shell/runtime in this task.
9. Resend is not configured; use a fake transport for tests before provisioning a real sender secret.
10. Existing UI error flow needs review for session-valid but unlinked users and for sign-out/retry behavior.

## D1 transaction/failure handling
Cloudflare D1 does not provide interactive multi-statement transactions in the ordinary sense. Use D1Database.batch() for DB-only atomic state transitions. For flows involving Better Auth internal operations plus external email delivery, use an explicit pending/outbox state machine and fault-injection tests at every durable boundary. Do not assume a callback compensates a previous operation.

## Safe development target
- Use a dedicated staging Worker name and dedicated staging D1 database.
- The branch's worker/wrangler.toml intentionally contains no D1 or R2 production bindings.
- Do not use production database identifiers, Access changes, or production secrets.
- Only add a staging database binding after provisioning an isolated database and explicitly verifying its identifier.
- Do not use Pages preview deployments for this branch; preview auto-deploy is excluded in the Cloudflare Pages project.

## Acceptance tests required before promotion
- No-session request rejected by direct Worker API and via Pages proxy.
- Valid session without membership rejected.
- Tenant A cannot query or mutate Tenant B with any forged tenant header or query param.
- Disabled membership and suspended restaurant rejected.
- Role tests for viewer/staff/manager/admin/owner on real business routes.
- Auth sign-in works from public login page with cookie retained correctly.
- Invalid/expired/reused/wrong-email/wrong-tenant invitation tokens fail closed.
- Email failure leaves invitation non-active and retryable.
- Auth user creation failure leaves member pending and can resume safely.
- Owner linking requires verified proof and cannot be triggered through public APIs.
- Password reset invalid/reused token fails.
- Successful reset revokes all old sessions, including under simulated D1 cleanup failure.
- D1 schema migration applies cleanly to fresh isolated D1 and preserves preseeded fixture data.
- All existing CRUD, menu, orders, waiter calls, reporting, and tenant-isolation tests pass.

## Last reviewed
2026-11-15. PR #9 remains draft, not merged. Do not promote until all blockers are closed and the PR has real CI evidence.
