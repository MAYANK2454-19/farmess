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

## Forecast staging and review

Open `/admin/forecasts` after running the offline trainer in `ml/market_forecast`.

For each crop/market series, paste the contents of its `manifest.json` and `forecast_points.json` output files. The client conversion checks that the manifest is a Farmess INR-paise-per-quintal candidate, was not automatically approved, has at least 120 unique validated dated observations (the held-out evaluation rows stay outside the stored training count), beats the persistence baseline on both MAE and sMAPE, and contains a complete sequential forecast horizon. The server repeats the policy checks and persists the run as `candidate`.

A data steward must inspect the series identity, source history, training dates, baseline comparison, point dates and intervals. Record a review note of at least 20 characters before approving or rejecting. Approved forecasts are read-only to end users. Staging alone never publishes a forecast.

The console does not train models in Vercel. Run training offline with Python 3.12 and the dependencies in `ml/market_forecast/requirements.txt`. No synthetic market observations should be generated to satisfy the training threshold.

## Provider keys

- `DATA_GOV_IN_API_KEY`: required for OGD market imports.
- `HEIGIT_API_KEY`: optional; enables road-distance and travel-time enrichment. Straight-line ranking remains available when the key or route response is missing.
- `OPEN_METEO_CUSTOMER_API_KEY` (paid) or `OPEN_METEO_NON_COMMERCIAL_USE=true` (owner declaration that the deployment is non-commercial): one is required for weather on Vercel production. Without either, production returns 503.

Add credentials through Vercel Environment Variables or the approved local secret helper. Never paste a key into this console, issue tracker or a browser form.

## Provider verification

Use `/admin/providers` to review operator transport and storage listings. Each state change is handled by an admin-only database RPC, validates the trusted Auth role and matching profile role, and writes an append-only audit event in the same transaction. See [ADMIN_PROVIDER_VERIFICATION.md](./ADMIN_PROVIDER_VERIFICATION.md) for the review boundary and evidence standard.

## Not included

The console now includes a provider-listing verification queue at `/admin/providers`. Admins can record contact/document/platform verification or suspension with a required audit note. Account provisioning, SMTP management and automatic model training remain outside this console. Supabase Auth SMTP is configured separately in the Supabase dashboard.
