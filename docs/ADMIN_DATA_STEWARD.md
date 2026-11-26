# Farmess data-steward console

The data-steward console is served under `/admin`. It is a separate route tree from the farmer, buyer and operator workspace.

## Access control

- The server layout verifies the signed-in user through `getFarmessSession()`.
- Only the trusted `admin` role in Supabase `app_metadata.farmess_role`, matching the protected `profiles.role`, can open the console.
- New public signups are farmer accounts only. Buyer, operator and admin roles must be provisioned by a trusted project administrator; users cannot choose a role in signup form fields or user metadata.
- The market-data refresh and forecast staging/review endpoints repeat the admin role check. Row-level security on ingestion history and forecast candidate tables provides another access boundary.
- Do not expose a Supabase secret/service-role key to the browser. The console uses the signed-in SSR session and the existing RLS policies.

## Market-data imports

Open `/admin/market-data` to import source records from OGD / AGMARKNET. Use a page size from 1 to 500 and a source offset from 0 to 100000. Keep filters narrow for source quality checks; increment the offset for later historical pages.

The endpoint validates source rows, keeps observation dates and provenance, deduplicates natural keys and withholds conflicting duplicates. Each attempt is recorded in `market_data_ingestion_runs`, including filters, received/saved row counts and any error message.

The provider key is the server-only `DATA_GOV_IN_API_KEY`. The UI shows only whether the key is configured; it never reads or displays the value.

## Price trends

Farmers see price history and a simple trend for each crop and market from saved mandi prices. There is no separate admin forecast-approval page: the more real prices you import, the better the trend.

## Provider keys

- `DATA_GOV_IN_API_KEY`: required for OGD market imports.
- `HEIGIT_API_KEY`: optional; enables road-distance and travel-time enrichment. Straight-line ranking remains available when the key or route response is missing.
- `OPEN_METEO_CUSTOMER_API_KEY` (paid) or `OPEN_METEO_NON_COMMERCIAL_USE=true` (owner declaration that the deployment is non-commercial): one is required for weather on Vercel production. Without either, production returns 503.

Add credentials through Vercel Environment Variables or the approved local secret helper. Never paste a key into this console, issue tracker or a browser form.

## Provider verification

Use `/admin/providers` to review operator transport and storage listings. Each state change is handled by an admin-only database RPC, validates the trusted Auth role and matching profile role, and writes an append-only audit event in the same transaction. See [ADMIN_PROVIDER_VERIFICATION.md](./ADMIN_PROVIDER_VERIFICATION.md) for the review boundary and evidence standard.

## Not included

The console now includes a provider-listing verification queue at `/admin/providers`. Admins can record contact/document/platform verification or suspension with a required audit note. Account provisioning, SMTP management and automatic model training remain outside this console. Supabase Auth SMTP is configured separately in the Supabase dashboard.
