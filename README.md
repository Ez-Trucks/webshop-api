# EZ-Trucks API

NestJS 11, PostgreSQL and Prisma 7. The API supports the public vehicle stock, admin vehicle management, depannage enquiries and private advertisement drafts. The AI assistant uses the server-side OpenAI Responses API; without an AI key, manual drafting and standard descriptions remain available.

## Local development

Use Node.js 22. Copy `.env.example` to `.env` and provide your own local database and admin configuration. Never commit `.env`, real passwords, tokens or uploaded source documents.

```bash
npm ci
npx prisma generate
npm run db:deploy
npm run start:dev
```

## Release checks

```bash
npx prisma validate
npm run test:release
npm run build
```

GitHub Actions also creates a disposable PostgreSQL 16 database, applies the full migration history and runs `npm run test:database`. That test uses actual HTTP routes and database storage for login, revisions, JSONB roundtrips and one-time publication. It refuses to run without `NODE_ENV=test`, `RELEASE_TEST_DATABASE=1` and a localhost database URL. It never connects to the production database or makes real AI/mail/payment requests.

## Deploy to the existing Render service

Deploy the API before the matching website version. The repository's `render.yaml` specifies:

- Build: `npm ci && npx prisma generate && npm run build`
- Start: `npm run start:deploy`
- Health check: `/health`

`start:deploy` applies pending migrations before accepting requests. This works without a paid pre-deploy step. For an existing Render service, check the actual dashboard settings: changing YAML updates the service automatically only when it is managed by that Blueprint.

Required service settings: `NODE_ENV=production`, `DATABASE_URL`, `FRONTEND_URL`, `CORS_ORIGINS`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, `ADMIN_AUTH_SECRET`. Generate a unique random `ADMIN_AUTH_SECRET` of at least 32 bytes in the hosting environment. The previously shared example value was shorter and is now rejected; replace it before launch if it was copied into the service settings. Real values have been removed from the example configuration. Use `npm run admin:hash` to create a password hash through the existing script. `CORS_ORIGINS` is a comma-separated list of exact website origins, for example `https://ez-trucks.com,https://www.ez-trucks.com,https://webshop-blue-beta.vercel.app`. An unrelated Vercel deployment is not automatically trusted.

For email notifications configure `POSTMARK_SERVER_TOKEN`, a verified `MAIL_FROM`, and `ADMIN_ORDER_EMAIL`. Missing mail configuration is visible in the admin status page; enquiries are stored even when their notification cannot be sent. The mail service can start without mail configuration, but the status page considers email setup a requirement for launch. Payment configuration is optional while checkout remains disabled; payment endpoints return a service-unavailable error without a Mollie key.

For AI configure `OPENAI_API_KEY` and optionally `OPENAI_AD_MODEL` (default `gpt-4.1-mini`). AI account access, quota and output quality must be checked with an authorised test after configuration. Keys stay on Render, never in frontend configuration or GitHub.

## Existing production database

The new inventory/detail migrations add columns with `IF NOT EXISTS`; they do not remove stock or order data. The new `VehicleAdDraft` table contains private sources and drafts. Retain all previously applied migration files and their checksums.

Before the first release, inspect `npx prisma migrate status` in the production environment and retain a restorable database backup using the database provider's normal tooling. If an existing database has no Prisma migration history and Prisma reports P3005, stop and reconcile/baseline only the migrations whose effects have been verified in that database. Do not use `migrate reset`, delete tables, or blindly mark all migrations as applied. This repository does not automatically baseline an unknown production database.

After deployment, `/health` checks database connectivity. The authenticated `/admin/readiness` endpoint also checks the vehicle columns and draft table, and reports configuration-presence checks without exposing secrets. Mail delivery and AI availability are not proven merely by a present key.

## Advertisement workflow

The matching website exposes `/admin/ad-assistant`. The workflow saves a private draft, analyses supplied sources, requires manual field confirmation, creates editable NL/EN/FR/DE descriptions, and creates a public `Part` only after explicit approval. Source/fact changes invalidate generated text. Repeated publication reuses the existing vehicle; revision conflicts prevent overwriting another session's changes. The public website uses the Dutch description, consistent with the existing stock model.

Only the administrator can access draft routes, source documents and readiness checks. Uploaded documents are sent to OpenAI only when the administrator requests analysis; requests use `store: false`. Document/photograph inference is not a manufacturer VIN lookup. Autoline currently uses a per-language text export, not direct marketplace publication.

## Release order

1. API checks and isolated database test pass.
2. Confirm production settings and existing migration history; deploy the API.
3. Check `/health`, admin login and `/admin/readiness`.
4. Deploy the matching `Ez-Trucks/webshop` frontend with the correct `EZ_TRUCKS_API_URL`.
5. Verify business contact details, submit one authorised real enquiry, and create/review a test advertisement before general use.

The private ChatGPT preview has its own browser-local demo adapter. That adapter and its automatic demo session are not part of this repository or the production build.
