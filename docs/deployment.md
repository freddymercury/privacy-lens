# PrivacyLens Deployment Guide

Last updated: 2026-08-08 (post-rebuild on new Supabase project `saqsurqlvotejcjeiook`)

## What needs deploying

| Component | Where | Required? |
|---|---|---|
| `client-api` (port 3001) | Railway (or similar Node host) | Yes — the Chrome extension talks to this |
| `backend` (port 3000) | Railway | Yes — admin dashboard; also serves archive API |
| Archiver | GitHub Actions (`.github/workflows/archiver-job.yml`) | Already works — no server needed |
| Database + storage | Supabase | Already provisioned |
| Chrome extension | Chrome Web Store / unpacked | Yes |

## 0. Prerequisites

- OpenAI account with credits (https://platform.openai.com/settings/organization/billing/) — a few dollars covers hundreds of assessments at `gpt-4o-mini` pricing
- A domain you control (for the API and the extension's `host_permissions`)
- Stripe account in live mode (only if subscriptions ship)

## 1. Supabase

Already provisioned: 14 tables, private storage bucket `privacylens-archive`, 166 recovered assessments.

**Before launch:** apply RLS policies (see `docs/enable_rls.md`). Everything currently depends on the service-role key staying server-side.

## 2. Deploy the services (Railway)

Create two services from the GitHub repo (`freddymercury/privacy-lens`), each auto-deploying on push to `main`.

### client-api

- Root directory: `client-api`, start command `npm start`, healthcheck `/health`
- Environment:
  - `NODE_ENV=production`
  - `CLIENT_API_PORT=3001`
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY`
  - `JWT_SECRET` — **must match backend's** (tokens are verified across both)
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - `CHROME_PLUGIN_ORIGIN=chrome-extension://<extension-id>`

### backend

- Root directory: `backend`, start command `npm start`, healthcheck `/api/health`
- `NODE_OPTIONS=--max-old-space-size=3072` (diff processing needs memory)
- Environment:
  - `NODE_ENV=production`, `PORT=3000`
  - `SUPABASE_URL`, `SUPABASE_KEY`, `SUPABASE_SERVICE_KEY`
  - `JWT_SECRET` (same as client-api), `SESSION_SECRET`
  - `OPENAI_API_KEY`, `LLM_MODEL=gpt-4o-mini`, `SERPAPI_API_KEY`
  - `S3_BUCKET=privacylens-archive` (Supabase Storage bucket name; see issue #32 for the R2 migration)

Both services **fail fast at boot if a required secret is missing** — a boot failure means an unset env var, not a code bug.

## 3. DNS + plugin config

- Point `api.<yourdomain>` at client-api and `admin.<yourdomain>` at backend (CNAME to the Railway-provided domains)
- In `chrome-plugin/config.js`, set `PROD_API_BASE_URL = 'https://api.<yourdomain>/api'`
- In `chrome-plugin/manifest.json`, set `host_permissions` to `https://api.<yourdomain>/*`
- Commit both — the extension reads config at build/load time

## 4. Stripe webhook

1. Stripe dashboard → Developers → Webhooks → Add endpoint: `https://api.<yourdomain>/api/subscription/webhook`
2. Subscribe to `customer.subscription.*` events
3. Copy the signing secret into client-api's `STRIPE_WEBHOOK_SECRET`
4. Test: `stripe trigger customer.subscription.updated` (signature verification is enforced in production)

## 5. Chrome extension

1. **Rebuild the prepackaged DB** — the committed `chrome-plugin/assessments.json` currently contains 10 *fake sample* entries (the build script's fallback when the API is unreachable). Do not ship it. With the local backend running against the real DB:
   ```sh
   cd chrome-plugin
   PRIVACY_LENS_DEV=1 npm run build
   ```
   Or rebuild against prod once deployed.
2. Test: `chrome://extensions` → Load unpacked → verify assessments render from the prod API
3. Distribute: zip the directory and submit to the Chrome Web Store. MV3 review takes days; the `<all_urls>` content script will need a privacy justification in the listing.

## 6. Verify end-to-end

```sh
curl https://api.<yourdomain>/health
curl "https://api.<yourdomain>/api/assessment?url=stripe.com"   # fresh v2-rubric assessment
curl https://admin.<yourdomain>/api/health
```

Then trigger the GitHub Actions archiver workflow manually and confirm it goes green (its secrets already point at the current Supabase project).

## Post-launch hardening

- R2 migration for archive blobs when storage outgrows the Supabase free tier (issue #32)
- Locale-stability fix before scaling crawls (issue #31) — churned versions waste storage and LLM budget
- `SLACK_WEBHOOK_URL` GitHub secret for CI failure alerts
- Uptime monitor on `/health` endpoints

## Rollback

Services are stateless; all state is in Supabase. Roll back by redeploying a previous git ref in Railway. Database schema changes so far are additive (new columns/tables only), so old code runs against the new schema.
