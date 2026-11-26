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

## Past prices and price trends

On `/admin/market-data`, use **Import past prices** to bring in the government AGMARKNET archive for a crop, state and (ideally) district over the last 30 days to 12 months. **Import 5 common vegetables** runs tomato, onion, potato, green chilli and cauliflower one after another. If data.gov.in stops an import early, press the button again: it continues further back from where it stopped, and days already saved are not duplicated.

Farmers then see the price trend and, when it passes a back-test against "today's price stays the same", a short forecast on the Market prices page. There is no forecast-approval step: the rule is automatic and the panel explains it.

The public data.gov.in sample key returns only 10 rows per request and is rate-limited; use your personal key from data.gov.in → My Account.

## Provider keys

- `DATA_GOV_IN_API_KEY`: required for OGD market imports.
- `HEIGIT_API_KEY`: optional; enables road-distance and travel-time enrichment. Straight-line ranking remains available when the key or route response is missing.
- `OPEN_METEO_CUSTOMER_API_KEY` (paid) or `OPEN_METEO_NON_COMMERCIAL_USE=true` (owner declaration that the deployment is non-commercial): one is required for weather on Vercel production. Without either, production returns 503.

Add credentials through Vercel Environment Variables or the approved local secret helper. Never paste a key into this console, issue tracker or a browser form.

## Provider verification

Use `/admin/providers` to review operator transport and storage listings. Each state change is handled by an admin-only database RPC, validates the trusted Auth role and matching profile role, and writes an append-only audit event in the same transaction. See [ADMIN_PROVIDER_VERIFICATION.md](./ADMIN_PROVIDER_VERIFICATION.md) for the review boundary and evidence standard.

## Not included

The console now includes a provider-listing verification queue at `/admin/providers`. Admins can record contact/document/platform verification or suspension with a required audit note. Account provisioning, SMTP management and automatic model training remain outside this console. Supabase Auth SMTP is configured separately in the Supabase dashboard.
