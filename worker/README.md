# ZESTRO Admin API — Cloudflare Worker

This is the first server-side API slice. It is deliberately separate from the React dashboard and does not imply that Cloudflare resources have been created or deployed.

## Included
- Cloudflare Access JWT verification (issuer + audience + signature via JWKS).
- D1 membership lookup on every protected request; tenant ID is derived from the authenticated membership, never from request JSON.
- Role gate for writes (`owner`, `admin`, `manager`).
- Menu item list/create/update/delete endpoints.
- R2 image upload endpoint (JPEG/PNG/WebP/AVIF, max 5 MB).
- Audit logging for menu and media changes.
- Exact-origin CORS allowlist and basic security headers.

## Required Cloudflare setup
1. Create a Cloudflare Access application protecting the admin API hostname. Configure the Worker `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` values.
2. Create D1 database `zestro-production` and R2 bucket `zestro-media`.
3. Replace `database_id` in `wrangler.toml` with the real D1 database ID.
4. Set `ALLOWED_ORIGINS` to the exact deployed admin origin (comma-separated only if multiple origins are intentionally trusted).
5. Apply migrations: `npx wrangler d1 migrations apply zestro-production --remote`.
6. Deploy: `npx wrangler deploy`.
7. Provision the first restaurant and membership through a reviewed, authenticated operator workflow. Do not expose a public tenant-bootstrap endpoint.

## Local development
Use a local `.dev.vars` file only for local values; never commit it. Run `npm install`, then `npx wrangler dev` from this directory.

## Endpoints
- `GET /health` — public liveness check.
- `GET /api/me` — authenticated identity and active restaurant.
- `GET /api/menu` — current tenant's menu.
- `POST /api/menu` — create menu item (owner/admin/manager).
- `PATCH /api/menu/:id` — update menu item (owner/admin/manager).
- `DELETE /api/menu/:id` — delete menu item (owner/admin/manager).
- `POST /api/media` — upload image bytes; content type header must be image/jpeg, image/png, image/webp or image/avif; optional `X-File-Name` header.

The dashboard's existing demo-mode modules are not automatically switched to this API. Wire each module to the API in a deliberate migration, then remove local mock persistence. Orders, payments, waiter-call realtime, staff invitations and homepage publishing are not implemented in this API slice yet.
