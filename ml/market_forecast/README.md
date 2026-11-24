# Farmess mandi-price forecast training

This offline tool trains and evaluates one candidate model per crop/market time series. It does not approve models and never writes directly to Supabase.

## Input CSV

Export `public.market_observations` to CSV. Required columns:

- `crop`
- `variety`
- `state`
- `district`
- `market_name`
- `observation_date` in `YYYY-MM-DD` format
- `modal_price_paise_per_quintal`

Rows with invalid dates, missing series identifiers, or missing/non-positive modal prices are skipped. Duplicate rows on the same series/date are combined using the median. Missing dates are not interpolated.

## Run

Use Python 3.12. Create a virtual environment, install `requirements.txt`, then run:

    python train.py --input market_observations.csv --output-dir ./artifacts --horizon-days 7

Each series needs at least 120 unique dated observations. The script reserves the final chronological 20% for a walk-forward holdout, builds lag/rolling/date features only from earlier observations, trains a `HistGradientBoostingRegressor`, and compares it with a last-observation persistence baseline using MAE and sMAPE.

A series becomes a `candidate` only when it beats the persistence baseline on both metrics. Otherwise it is rejected. The output directory receives model artifacts, manifests, seven-day recursive forecast points and a summary.

## Controls

- Models are trained per crop/market series; unrelated mandi prices are not pooled.
- Random train/test splitting is not used.
- The empirical lower/upper band uses the 90th percentile of absolute holdout residuals. It is an estimate, not a guarantee.
- A candidate is never automatically approved or published. A human data steward must review the series identity, provenance, history, gaps and metrics before a run is inserted into the approved forecast tables.
- The database enforces a minimum approved training-observation count and requires model MAE to beat the baseline MAE.
- Do not train on demo data, duplicate observations, future-dated rows or prices without source/date provenance.
- No trained model artifact is included because the live market-observation table currently has no rows.
