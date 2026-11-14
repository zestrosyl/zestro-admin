# ZESTRO Admin — production readiness

## What is implemented in this delivery

- Modular React + TypeScript admin application.
- Overview, orders, tables, waiter calls, menu, categories, media library, homepage editor, gallery, promotions, staff and settings modules.
- Browser-local persistence for demo records (`localStorage`).
- Real standards-compliant QR rendering using `qrcode.react`; table QR links are generated only after a customer website URL is configured.
- Printable 80 mm order receipt layout.
- Client-side image resize/compression before demo storage.
- Currency formatting is driven by restaurant settings.
- Responsive navigation, modal keyboard dismissal, focus-visible styling and reduced-motion support.

## What is not production-connected yet

- Admin login, session management, password reset and MFA.
- Server-side authorization and tenant isolation.
- Cloudflare Worker API endpoints and health checks.
- D1 migrations, production data seeding and backup/restore.
- R2 signed upload/download endpoints and durable object URLs.
- Live order events / WebSocket or Durable Object updates.
- Payment gateway integration, webhook verification and reconciliation.
- Actual invitation emails and staff account provisioning.
- Publishing homepage changes to the separate customer-facing website.

The dashboard is a functional frontend prototype, not an operational SaaS backend. The interface must not be exposed as a live admin portal until authentication and API authorization have been implemented.

## Recommended Cloudflare deployment shape

1. Deploy the admin frontend from GitHub to Cloudflare Pages (or Workers Static Assets).
2. Deploy a separate Cloudflare Worker as the only trusted API boundary.
3. Bind one D1 database for application records and one R2 bucket for restaurant media.
4. Authenticate users on the server and resolve an active restaurant membership for every request.
5. Derive `restaurant_id` from the authenticated membership. Never accept tenant scope from an untrusted client request without authorization checks.
6. Store provider secrets, signing keys and service credentials only as Worker secrets.
7. Use signed, short-lived R2 upload URLs or a Worker-mediated upload endpoint; never expose R2 secret credentials in the browser.
8. Add audit events for sensitive actions such as staff access, promotion changes, refunds and settings changes.

`cloudflare/schema.sql` is a starting D1 schema, not a deployed database. Review the business rules and run it against a development database before production.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

Cloudflare Pages build settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: the project root

## Data behavior in demo mode

- CRUD changes are retained in the current browser profile.
- Clearing browser site data removes local demo records.
- Data is not synchronized between devices or admin users.
- Uploaded demo images are resized and stored in browser storage. They are not uploaded to R2.
- Sample restaurant analytics and orders are demonstration data, not real sales figures.
