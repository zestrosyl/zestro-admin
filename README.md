# ZESTRO ADMIN

A refined, responsive restaurant operations dashboard built with React, TypeScript, Vite and Tailwind CSS. The project combines Gemini's modular dashboard foundation with the persistence, UX and operational improvements added in this merge.

## Features

- **Operations:** overview dashboard, orders, table management, waiter calls.
- **Menu & media:** menu CRUD, categories, image library, homepage editor, gallery.
- **Growth & team:** promotions, staff directory and restaurant settings.
- **Workflow UX:** browser-persisted demo changes, toasts, keyboard-dismissible modals, real QR code generation, QR SVG export and 80 mm order receipt printing.
- **Responsive UI:** desktop sidebar, mobile navigation, accessible focus states and reduced-motion support.

## Tech stack

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Lucide React icons
- `qrcode.react` for standards-compliant QR codes

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. To create a production build:

```bash
npm run build
npm run preview
```

## Deploy the frontend to Cloudflare Pages

Connect this project repository in Cloudflare Pages and use:

- Framework preset: Vite
- Build command: `npm run build`
- Build output directory: `dist`

The frontend can be versioned and deployed through GitHub. The Worker API, D1 database and R2 storage should be deployed separately and connected only after their server-side authentication and authorization rules are ready.

## Important: demo mode vs production

This delivery is a **functional frontend prototype**. CRUD changes persist in browser `localStorage`, so the same browser profile retains edits after refresh. It does not yet provide a real multi-user backend, admin authentication, live order synchronization, payment processing, durable R2 uploads, or staff account invitations. A Worker URL saved in Settings is configuration only; it is not a verified connection.

See [`docs/PRODUCTION_READINESS.md`](docs/PRODUCTION_READINESS.md) for the production checklist and [`cloudflare/schema.sql`](cloudflare/schema.sql) for a multi-tenant D1 schema starting point.

## Customer website safety

This project is a separate admin application. It does not replace, modify, or redeploy the existing ZESTRO customer-facing website. Homepage changes in this prototype remain local until a real publishing API is built.

## Cloudflare API backend (first implementation slice)

A separate Worker API lives in `worker/` with D1 migrations and R2 binding configuration. Read `worker/README.md` before provisioning resources. It currently implements Access-authenticated tenant resolution, menu CRUD and R2 image uploads. The existing dashboard remains in local demo mode until each module is explicitly migrated to the API; do not treat the demo as live restaurant data.

Root helper commands: `npm run dev:api`, `npm run deploy:api`, `npm run typecheck:api`.
