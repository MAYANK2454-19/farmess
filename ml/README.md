# Farmess ML workflows

Farmess keeps predictive models separate from ordinary application logic. A prediction is not exposed to farmers unless the data has provenance, the model passes a time-ordered evaluation, and the required human review is complete.

## Current components

| Component | Current implementation | What users see |
| --- | --- | --- |
| Mandi price forecasting | Offline HistGradientBoosting regressor, trained separately for each crop/market series | Only approved forecast runs are visible. Without an approved run, the API returns an explicit insufficient-data response. |
| Local logistics discovery | PostGIS radius search plus an explainable rules-based ranking | Nearby active provider listings and match explanations. This is not currently an ML prediction. |
| Logistics preference ranker | Offline HistGradientBoosting classifier trained from explicit 1–2 / 4–5 recommendation feedback | Candidate model only; never claims that a provider will accept or complete a request. |

No synthetic rows are inserted into the production database to make these components appear active.

## 1. Export real training data

The exporter reads only allow-listed columns from:

- public.market_observations
- public.logistics_recommendation_feedback

It writes two local CSV files and a manifest that reports row counts, diversity, and whether the documented training minimums are met. The manifest is a readiness check, not a model evaluation.

The exporter uses Python's standard library. It requires a Supabase project URL, a server-side secret key, and a private pseudonymisation salt. Set these in the current terminal session only; never add them to source control, a browser bundle, or any NEXT_PUBLIC_ variable.

PowerShell example:

    $env:SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
    $env:SUPABASE_SECRET_KEY = "YOUR_SERVER_SIDE_SUPABASE_SECRET_KEY"
    $env:FARMESS_ML_EXPORT_SALT = "YOUR_PRIVATE_RANDOM_VALUE_AT_LEAST_32_CHARACTERS"
    python .\ml\export_training_data.py --output-dir .\ml\exports
    Remove-Item Env:SUPABASE_SECRET_KEY, Env:FARMESS_ML_EXPORT_SALT

The exporter also accepts the legacy SUPABASE_SERVICE_ROLE_KEY variable for compatibility. Prefer SUPABASE_SECRET_KEY. The key is sent only in the API-key request header and is never written to output files.

Privacy controls:

- Raw user IDs and provider-listing IDs are replaced with salted HMAC-SHA256 values. The salt is not included in the export.
- IDs remain stable across exports only when the same private salt is reused; this permits diversity checks without exporting raw identifiers.
- Free-text feedback notes are not selected or exported.
- Only selected training columns are queried; no profile, phone, email, exact coordinates, or private farmer-lot records are exported.
- CSVs and manifests are written locally. This script performs no database writes.
- The output folder is ignored by Git. Delete local exports when they are no longer needed.

## 2. Check readiness before training

Open ml/exports/manifest.json. Each dataset has a ready-to-train flag and the relevant counts. A false flag means do not proceed by relaxing thresholds or fabricating rows.

Market forecast training requires at least 120 unique dated observations for an individual crop/market series. Its script uses the final chronological portion as a holdout and must beat a last-observation persistence baseline on both MAE and sMAPE.

Logistics preference training requires at least 300 clear non-neutral ratings, 30 distinct users, 20 distinct listings, adequate chronological train/evaluation rows, and both classes in each split. Ratings 3 are excluded. This target measures whether a recommendation was rated useful; it does not measure provider fulfilment or safety.

## 3. Train local candidates

Run these only when the matching dataset is ready:

    python .\ml\market_forecast\train.py --input .\ml\exports\market_observations.csv --output-dir .\ml\artifacts\market --horizon-days 7
    python .\ml\logistics_ranker\train.py --input .\ml\exports\logistics_recommendation_feedback.csv --output-dir .\ml\artifacts\logistics

Candidate model artifacts remain local under ml/artifacts/ and are ignored by Git. Do not commit exported data or model binaries.

## 4. Approval and serving boundaries

Market forecasting already has a private candidate-staging endpoint, a separate admin review action, and a public read path restricted to approved runs. The offline manifest and forecast points must be reviewed against their source series, date coverage, residuals, and baseline metrics before staging.

The logistics preference ranker is not yet connected to live inference. The current nearby-provider ordering remains an explainable heuristic. Do not load a locally trained candidate into the production API until a separate model registry, artifact integrity checks, rollback path, latency/fallback behavior, and explicit approval workflow have been implemented and reviewed.

Future models such as fulfilment reliability, buyer-lot matching, demand forecasting, and storage/spoilage risk need their own point-in-time features and verified outcome labels. They must not reuse recommendation ratings as a substitute for actual service or sale outcomes.

## 5. Tests

The exporter tests use Python's standard library and do not connect to Supabase:

    python -m unittest discover -s ml/tests -v
    python -m compileall -q ml

The live Supabase row counts observed on 23 November 2026 were zero for market_observations, service_listings, logistics_recommendation_feedback, market_forecast_runs, and market_forecast_points. Re-run the exporter to obtain current counts before making any modelling decision.
