# Supabase Auth — Admin staging deployment

## Scope

This workflow deploys only the `staging` Wrangler environment. It updates the pre-existing non-production Worker `zestro-admin-api-auth-staging` and binds it to:

- D1: `zestro-admin-supabase-staging-20261117`
- R2: `zestro-media-staging-20261117`
- Supabase project: `zestro-auth`

It does not deploy the production Worker, run production migrations, or change the production D1/R2 bindings.

## One-time GitHub setup

1. In Cloudflare, create an account-owned API token for the Zestro account.
2. Grant the token the **Workers Editor** role scoped to the existing Worker `zestro-admin-api-auth-staging`.
3. Add that token in the `zestrosyl/zestro-admin` GitHub repository under **Settings → Secrets and variables → Actions → New repository secret**.
4. Name the secret `CLOUDFLARE_API_TOKEN`. Do not commit or paste the token into source code.

Cloudflare documents using account-owned API tokens with Wrangler and scoping the Workers Editor role to an individual Worker: https://developers.cloudflare.com/workers/authorization/

## Deploy

1. Open the repository's **Actions** tab.
2. Select **Deploy ZESTRO Admin Auth Staging**.
3. Select branch `feat/supabase-auth-integration-2026-11-17` and click **Run workflow**.
4. Confirm the workflow succeeds before testing the Admin Pages preview.

The workflow passes `worker/` typecheck, then runs `npx wrangler deploy --env staging`.

Expected Worker URL:

`https://zestro-admin-api-auth-staging.zestro-syl.workers.dev`

## Supabase redirect allowlist

Add both current Pages branch aliases to Supabase → Authentication → URL Configuration:

- `https://feat-supabase-auth-integrati.zestro-admin.pages.dev/**`
- `https://feat-supabase-auth-integrati.zestro-customer-website.pages.dev/**`

Keep the canonical Pages domains and localhost entries already configured.

## Staff account linking

Staff access is not granted by Supabase registration alone. The first link requires a confirmed Supabase email that matches an existing D1 staff membership and a valid Cloudflare Access identity. After linking, normal API calls use the Supabase bearer session and D1 membership/role checks.

Create or invite a staging membership before performing the end-to-end staff login test. Never seed or mutate production membership data for this test.

## Customer account scope

Customer email signup/sign-in, session restore, profile metadata and password recovery are connected to Supabase Auth. Guest ordering remains unchanged. Customer-linked order history/profile APIs in the separate deployed `zestro-customer-api` Worker are a later integration phase; this PR does not deploy or modify that Worker.