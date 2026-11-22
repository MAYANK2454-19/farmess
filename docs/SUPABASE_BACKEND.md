# FARMESS Supabase backend

This document records the live database contract for the dedicated FARMESS Supabase project. It is not a claim that the Next.js UI is already authenticated or fully connected to persistence.

## Project

- Project reference: `jsfpajiurzabdqbxvype`
- Region: `ap-northeast-1`
- PostgreSQL: `17.12`
- Vercel project: `farmess`
- Vercel configuration: `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are configured for Development, Preview and Production.

Never commit a publishable value as a substitute for database security. The publishable key is safe to use in a browser only because grants and RLS restrict every accessible object. Never expose a Supabase secret/service-role key in `NEXT_PUBLIC_*` variables.

## Live schema

The current database has 11 public tables, each with a distinct access boundary:

- **`profiles`:** Account details, role and privacy preferences. Users can read and update their own allowed profile fields; role is not user-writable.
- **`profile_consent_events`:** Consent grant/revoke audit history. Own events are read-only; a database trigger writes the rows.
- **`market_observations`:** Source-attributed market data in INR paise per quintal. Public read-only; ingestion is a trusted server task.
- **`produce_lots`:** Farmer-owned produce lots. Owner-only; matching summaries are intentionally not exposed yet.
- **`buyer_requirements`:** Buyer requirements for crop, quantity and market area. Buyer-owner-only.
- **`offers`:** Buyer quotes against a farmer lot. Visible only to buyer and farmer participants.
- **`service_listings`:** Operator transport/storage listings. Active listings expose only an allowlisted set of non-contact fields.
- **`service_requests`:** Requests for provider services. Requester/provider participants only.
- **`notifications`:** In-app event inbox. Recipient-only; created by database event triggers.
- **`sales`:** Agreed sale terms and status. Buyer/farmer participants only.
- **`sale_activity`:** Sale event timeline. Explicit participants only.

All 11 tables have Row Level Security enabled. The public Data API has explicit least-privilege grants; public clients cannot write market observations, consent history, notifications, sales, or sale activity.

### Trusted roles

The allowed roles are `farmer`, `buyer`, `operator` and `admin`. New accounts default to `farmer`. Only trusted `raw_app_meta_data` is used when a non-default role is provisioned; never use `raw_user_meta_data`, signup form fields, URL parameters or browser state to authorize a role. The profile role column is not granted to authenticated users for updates.

Admin is not a blanket RLS bypass. Any future support access needs a separate, scoped and audited server workflow.

### Database-enforced workflows

- Profile updates that change a privacy preference generate consent audit events with field, actor and timestamp.
- Buyer offers are checked against the authenticated buyer, a published lot, future validity and lot quantity. Offer terms are immutable after creation; expired offers cannot be accepted.
- Offer acceptance records a sale and an activity item and creates a notification for the buyer. New, declined and withdrawn offers create recipient-scoped notifications.
- Service requests must target an active listing owned by an operator. Provider/requester status changes create notifications.
- Notifications are recipient-scoped; the client can only update the read timestamp.

No payment is processed by this schema. An accepted offer records agreed terms; it does not claim that dispatch, delivery or payment has happened.

## Migration ledger

The live Supabase migration ledger currently records:

- `20261122160345_farmess_core_backend`
- `20261122160439_farmess_core_backend_performance`

The second migration adds foreign-key indexes, combines overlapping update/select policies and uses scalar-subquery wrappers for JWT policy expressions.

The exact SQL statement arrays were recovered from the live `supabase_migrations.schema_migrations` ledger and checked into this repository under the matching versioned filenames in `supabase/migrations/`. The filenames match the two versions above. No migration was re-applied while recovering the source.

For a new local checkout, initialise/link the Supabase CLI once, then verify local and remote history before changing schema:

```bash
npx supabase init
npx supabase link --project-ref jsfpajiurzabdqbxvype
npx supabase migration list
npx supabase db diff --linked
```

Review any diff before pushing. Do not reset the live project or edit its schema outside a reviewed migration.

## Local environment

Copy `.env.example` to `.env.local` and set the two public Supabase values from the project's Connect dialog or the authorized Vercel project settings.

The intended Next.js integration uses the official cookie-aware packages:

- `@supabase/supabase-js`
- `@supabase/ssr`

Use the server-side cookie client and verify the current user with `getClaims()` (or another documented verified-user method), rather than trusting browser session state. Keep the browser client publishable-key-only. Do not add a secret/service-role key unless a specific server task truly requires bypassing RLS.

Official guides:

- [Next.js server-side auth client](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [Secure Data and RLS](https://supabase.com/docs/guides/database/secure-data)
- [Securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Custom claims and RBAC](https://supabase.com/docs/guides/api/custom-claims-and-role-based-access-control-rbac)

## Verification already performed

- The live database reports 11 public tables and RLS enabled on all 11.
- The Supabase security advisor reported no findings.
- The performance advisor no longer reports RLS init-plan warnings, missing foreign-key indexes or overlapping permissive policies. It reports unused-index informational entries because the new tables have not been populated or queried by real users yet.
- A rollback-only integration transaction checked profile creation/default role assignment, role immutability, own-profile/own-lot visibility, buyer isolation from private lots, consent audit logging, offer creation/acceptance, sale/activity creation, and service-request notifications. Test fixtures were rolled back; no test users or business rows were retained.

## Not yet connected in the application

The current pages still include preview-only messaging. This database foundation does not yet mean that users can sign up, sign in, reset passwords, save lots, create buyer requirements, submit offers, manage services or see persistent notifications through the website. Those require the Next.js Supabase SSR client, auth routes/callbacks, server-side authorization, API/data actions and UI integration, followed by CI and a verified Vercel deployment.
