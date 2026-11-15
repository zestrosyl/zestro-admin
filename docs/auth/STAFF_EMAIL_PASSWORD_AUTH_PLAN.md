# ZESTRO Staff Email + Password Authentication — Implementation Plan

**Status:** Planning proposal only. This branch does not change runtime authentication, application behavior, Worker configuration, secrets, or production data.

## Goal

Allow each restaurant owner, manager, and staff member to sign in to the ZESTRO Admin dashboard with an individual email address and password. Owners/admins invite team members from **Staff & Access**. The invited person receives a time-limited email link, sets their own password, and can then sign in. Password reset is delivered by Resend.

## Repository findings (live-backend/nov-14-2026)

- The admin frontend is a React + TypeScript + Vite app; API requests use `src/services/liveApi.ts`.
- The admin API is a Cloudflare Worker at `worker/src/index.ts`, backed by D1 and R2.
- Existing authentication is Cloudflare Access JWT authentication. The Worker currently requires Access credentials before routing protected `/api/*` requests.
- Tenant membership and roles already live in the `memberships` table. Membership status includes `invited`, `active`, and `disabled`.
- `POST /api/staff` currently creates an invited membership, but does not send an email or provision a password credential.
- `GET /api/staff` lists tenant members. The existing staff form says the invitee must use Cloudflare Access.
- The Worker resolves tenant membership from the authenticated identity and enforces owner/admin checks for staff management.

## Recommended architecture

Use **Better Auth** with its native Cloudflare D1 support for credential accounts and sessions, and **Resend** as the transactional email transport. Keep the existing `memberships` table as the source of truth for restaurant tenancy, staff status, and ZESTRO role permissions.

Better Auth owns authentication identity, password hashing, verification/reset tokens, and sessions. ZESTRO membership remains the authorization boundary. A valid Better Auth session alone must never grant access to a restaurant: every protected business API request must resolve an active membership for the requested tenant and enforce the existing role rules.

Official implementation references:
- Better Auth email/password: https://better-auth.com/docs/authentication/email-password
- Better Auth native D1 support: https://better-auth.com/blog/1-5
- Better Auth email sending concepts: https://better-auth.com/docs/concepts/email
- Resend API documentation: https://resend.com/docs/api-reference/emails/send-email

## Proposed user experience

1. Owner/admin opens **Staff & Access** and adds a person's name, email, role, phone, and shift.
2. Worker creates or reactivates the tenant membership in `invited` state and issues a cryptographically random, single-use, expiring invitation token.
3. Worker sends a ZESTRO-branded invitation email through Resend. The email contains a HTTPS link to the Admin app's password-setup page. It must never contain a password.
4. Invitee opens the link, chooses a password, and completes account activation. The token is consumed once, and the membership becomes active only after the credential is successfully established and the invitation is valid.
5. Staff signs in at the public Admin login page using email/password. A secure, HttpOnly, Secure, SameSite cookie carries the session.
6. Forgot-password sends a generic confirmation response to prevent account enumeration. Resend delivers a single-use, expiring reset link. Successful reset revokes existing sessions.
7. Owner/admin can disable a member or change their role. Disabled membership blocks access immediately, even if the user's Better Auth session has not expired.

## Implementation slices

### 1. Authentication foundation
- Add Better Auth dependencies and a request-scoped auth factory using the Worker D1 binding.
- Add Better Auth schema tables through a new additive D1 migration. Do not rename, drop, or repurpose existing tables.
- Configure a strong `BETTER_AUTH_SECRET`, canonical auth base URL, trusted origins, secure cookie settings, and production-only HTTPS.
- Enable email/password sign-in, disable public self-registration, and require invitation-based provisioning.
- Configure password policy (minimum 12 characters; maximum supported by the library), generic authentication errors, and session expiry/rotation.
- Use Better Auth's D1-compatible behavior deliberately: D1 does not provide interactive transactions. Invitation acceptance and password reset must be designed and tested for partial-failure recovery.

### 2. Resend email delivery
- Add a Worker-only `RESEND_API_KEY` secret and a verified sender address/domain as deployment prerequisites; never commit either value.
- Add `RESEND_FROM_EMAIL` and `ADMIN_APP_URL` as non-secret environment configuration.
- Send invitation and password-reset messages from the Worker via Resend's HTTPS API.
- Use plain-text and accessible HTML templates, ZESTRO branding, clear expiry guidance, and links restricted to the configured Admin origin.
- Do not log passwords, raw tokens, full reset URLs, or Resend credentials.
- Handle delivery failures safely: retain an invited membership without granting access; allow an authorized owner/admin to resend an invitation.

### 3. Invitation and membership lifecycle
- Add a dedicated invitation-token table with token hash (never raw token), tenant/member IDs, expiry, used/revoked timestamps, and created-by membership.
- Generate high-entropy tokens with Web Crypto; store only a cryptographic hash.
- Enforce owner/admin authorization, tenant-scoped duplicate checks, role-grant restrictions, and disabled-member reactivation rules.
- Make invite acceptance single-use and idempotent where possible.
- Never allow public sign-up to create a tenant, membership, owner, or elevated role.
- Preserve existing owner membership and provide a controlled owner-account linking/bootstrap path before removing Cloudflare Access dependency.

### 4. Public login and protected API
- Add public frontend routes for login, accept-invitation/set-password, forgot-password, and reset-password.
- Add a small auth client/service with credentialed requests and session refresh handling.
- Remove Cloudflare Access as a mandatory front-door for the staff login page and staff API path; the login page must load for invited staff who are not in the Access allowlist.
- Replace Access-only Worker authorization with Better Auth session validation followed by the existing D1 membership lookup and tenant/role checks.
- Keep `/health` public. Keep auth endpoints public only where the Better Auth flow requires it; all business routes stay authenticated.
- Use exact-origin CORS with credentials, origin/CSRF checks on state-changing requests, no wildcard origins, and no permissive redirects.
- Preserve owner/admin/manager/staff/viewer permission semantics and the current restaurant ID isolation. Never trust a tenant ID or role supplied only by the browser.

### 5. Staff module and session controls
- Change the staff modal copy from “Cloudflare Access login” to “Invitation email will be sent”.
- Show invitation status (Invited / Active / Disabled), invitation sent time, and a safe resend action.
- Add deactivate/reactivate and role-change actions with server-side checks and audit events.
- Add logout and “log out all sessions” capability for account security.
- Keep phone, shift, duty status, and current role mapping intact.

## Security requirements

- Passwords are hashed by Better Auth's supported password hashing implementation; never store or log plaintext passwords.
- Invitation/reset tokens are random, hashed at rest, single-use, short-lived, and bound to the intended account.
- Public endpoints use rate limits and generic responses to reduce brute force and email enumeration.
- Cookies are HttpOnly, Secure in production, SameSite=Lax (or stricter if compatible), scoped narrowly, and never exposed to JavaScript.
- Enforce CSRF/origin checks on cookie-authenticated mutations.
- Tenant and role authorization is repeated server-side for every business API request.
- Disabled/suspended memberships and restaurants are rejected on every request.
- Audit invitation creation/resend/acceptance, login security events where appropriate, password reset, role change, and deactivation without recording secrets.
- No cross-tenant email collision assumptions: the same person may belong to multiple restaurants; session resolution must explicitly select/resolve the correct membership without leaking tenant data.
- Do not leave a production Access-only gate in front of the login UI; plan a controlled migration/fallback for the existing owner so the owner cannot be locked out.

## Migration and rollout strategy

1. Build and test in a separate development environment/D1 database first.
2. Add schema using a new additive migration; inspect generated SQL and test it against a disposable D1 database.
3. Bootstrap/link the existing owner account using a verified owner email and a one-time setup process. Do not auto-link accounts solely because an unverified email string matches.
4. Test staff invitation, acceptance, sign-in, sign-out, password reset, session revocation, disabled membership, role changes, and cross-tenant isolation.
5. Deploy Worker and Pages to a preview environment, verify the full flow using non-production Resend sender/domain and test accounts.
6. Only after explicit approval: configure production Resend sender/domain and secrets, apply the additive production D1 migration, deploy Worker, then deploy Pages. Keep an owner recovery path available until production login is confirmed.
7. Remove or disable the old Access requirement only after end-to-end production verification and explicit approval. Do not remove existing Access configuration as part of the code-only PR.

## Acceptance criteria

- Invited staff can reach the login page without being on the Cloudflare Access allowlist.
- Public sign-up cannot create an account or membership.
- Owner/admin can invite staff; unauthorized roles cannot invite or grant owner/admin privileges.
- Invite email arrives through Resend, link expires, and link cannot be reused.
- Staff can set their own password and sign in; credentials are individual and never shared.
- Password reset email arrives, invalid/expired/reused tokens fail safely, and reset revokes sessions.
- Disabled staff lose API access immediately.
- Existing owner can sign in and retain access; there is a documented recovery route.
- All existing business APIs preserve tenant isolation and role checks.
- Login, invitation, reset, and dashboard flows pass automated tests and preview smoke tests.
- Existing restaurant data and current D1 membership records remain intact.

## Scope exclusions

No customer-facing website login, customer accounts, social login, MFA, SSO, billing, subscription changes, new CRM, or unrelated dashboard redesign in this slice.

## Deployment boundary

This plan PR is documentation only. It does not include runtime code, secrets, Cloudflare configuration changes, D1 migrations, merges, or deployments. Any implementation PR must target the same feature branch strategy and remain unmerged until reviewed. Production deployment requires separate explicit approval.
