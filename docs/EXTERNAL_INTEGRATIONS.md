# Farmess external integrations

This document separates credentials the application currently consumes from services that require account setup or commercial approval.

## Credentials consumed by application code

| Provider                     | Environment variable        | Purpose                                 | Required for                                 |
| ---------------------------- | --------------------------- | --------------------------------------- | -------------------------------------------- |
| OGD India / AGMARKNET        | DATA_GOV_IN_API_KEY         | Source-attributed mandi observations    | Market price retrieval and admin ingestion   |
| HeiGIT openrouteservice      | HEIGIT_API_KEY              | Road distance and driving-time matrix   | Road-route enrichment in logistics discovery |
| Open-Meteo paid customer API | OPEN_METEO_CUSTOMER_API_KEY | Commercial/high-volume weather requests | Optional; omit for non-commercial evaluation |

All three variables are server-side. Do not prefix them with NEXT_PUBLIC_.

## 1. OGD India / AGMARKNET

Resource: https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi

1. Create or sign in to a registered account at https://data.gov.in/.
2. Open the mandi resource above and its API details.
3. Generate an API key from the registered user's dashboard.
4. Keep the key private and configure DATA_GOV_IN_API_KEY.

The API adapter uses the resource ID already recorded in src/lib/market-data/normalize.ts. It requests one bounded page of up to 500 records. The admin import endpoint accepts an offset so an authorised data steward can import subsequent pages without a large, long-running request. Each page is validated and audited before/after the database upsert.

The resource is daily mandi reporting, not a live quote. Farmess preserves source date, retrieval time, price unit and source URL. Confirm the resource's current licence, field schema and rate limits against an authenticated response before production use.

The import route is POST /api/market-data/refresh and requires a trusted Farmess admin account. Public sign-up creates farmer accounts only; do not promote a user's role through browser-controlled metadata.

## 2. HeiGIT openrouteservice

Account: https://account.heigit.org/

1. Create a HeiGIT account.
2. Generate the free Standard API key in the account dashboard.
3. Configure HEIGIT_API_KEY.

Farmess uses the current matrix endpoint:
https://api.heigit.org/openrouteservice/v2/matrix/driving-car

The logistics discovery API sends one origin and up to 15 provider destinations in one request. Road distance and estimated driving duration are displayed separately from the existing PostGIS straight-line distance. Routing failure or a missing key never blocks provider discovery; straight-line distance remains the fallback.

The older api.openrouteservice.org hostname was retired in November 2026. Do not configure the old endpoint.

## 3. Open-Meteo

The no-key endpoint is available for non-commercial evaluation and prototyping, subject to the provider's fair-use limits and attribution requirements. Farmess requests a small weather snapshot only after the farmer searches with a location they selected.

The forecast panel is contextual information only. It is not a crop disease diagnosis, storage safety assessment, or guarantee of local conditions.

For commercial use or higher-volume usage, obtain a subscription from https://open-meteo.com/en/pricing and configure OPEN_METEO_CUSTOMER_API_KEY. When the key is present, Farmess uses customer-api.open-meteo.com; otherwise it uses the public non-commercial endpoint.

Attribution is shown in the Farmess weather panel.

## 4. Resend for Supabase Auth email

Resend is configured as Supabase Auth's SMTP provider, not as an ordinary Next.js API dependency.

1. Create a Resend account at https://resend.com/.
2. Add and verify a sending domain and configure its required DNS records.
3. Create a Resend API key.
4. In the Supabase dashboard, open Authentication settings and configure Custom SMTP, or use Supabase's Resend partner integration.
5. Set SMTP host smtp.resend.com, port 465, username resend, and the Resend API key as the SMTP password. Use a From address on the verified sending domain.

The Resend API key belongs in Supabase's SMTP configuration. Do not duplicate it in .env.local or Vercel unless a separately implemented server-side Resend API workflow needs it. Keep authentication mail separate from marketing mail.

## 5. Local and Vercel credential sync

The helper scripts/sync-provider-secrets.ps1 prompts for each provider key using hidden input, writes it to the Git-ignored .env.local file, and pipes it to the Vercel CLI as a Secret variable. The value is not passed as a command-line argument.

Prerequisites:

1. From the Farmess repository, run npx.cmd --yes vercel@latest login.
2. Run npx.cmd --yes vercel@latest link and select the existing Farmess team/project.
3. If needed, first pull the existing Development variables with npx.cmd --yes vercel@latest env pull .env.local --environment=development.
4. Run .\scripts\sync-provider-secrets.ps1.

By default the script updates Vercel Development and Preview only. After testing the integrations in a preview deployment, use .\scripts\sync-provider-secrets.ps1 -IncludeProduction to also configure Production. Vercel environment-variable changes apply to new deployments, not deployments that already exist.

The script skips a provider when Enter is pressed at its prompt. It does not ask for Supabase secret keys, the ML pseudonymisation salt, or Resend SMTP credentials.

## 6. Secrets deliberately not synchronised

- NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are already configured in the Vercel project and are browser-safe.
- SUPABASE_SECRET_KEY is used only for the one-off local ML data exporter. Never add it to Vercel application environments or a NEXT_PUBLIC_ variable.
- FARMESS_ML_EXPORT_SALT is generated locally for an individual ML export and is not a provider API key.
- Resend's SMTP password is stored in Supabase Auth configuration, not Vercel.
- OpenStreetMap's standard tile URL does not require an API key. Respect its attribution, caching and fair-use policy.

## Verification checklist

After configuring credentials, deploy a fresh Preview build and verify:

- Market price retrieval reports a genuine OGD source status; the admin import audits each page and stores only validated records.
- Logistics discovery still works without HEIGIT_API_KEY; with a valid key, route distances and durations appear for reachable provider listings.
- Weather context appears after a farmer chooses a location; the source link and limitations remain visible.
- No API key appears in browser bundles, public responses, logs, Git commits, or screenshots.
