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

    python train.py --input market_observations.csv --output-dir ./artifacts --horizon-days 7 --as-of 2026-11-24

`--as-of` defaults to today (UTC). Published forecast points always start the day after it.

Each series needs at least 120 unique dated observations and keeps at least 90 for training. The final chronological ~20% is a walk-forward holdout: from every holdout origin the fixed model forecasts recursively for each horizon step, using only observations before that origin — exactly how the published forecast is produced. Features are lag, rolling and seasonal values plus the calendar gap since the previous report, because mandis do not report every day.

A series becomes a `candidate` only when it beats last-observation persistence on **both MAE and sMAPE at every horizon step**. Otherwise it is rejected. A series whose latest observation is more than 7 days before `--as-of` is marked `stale_data` and receives no forecast. The output directory receives model artifacts, manifests (with a per-horizon evaluation table), forecast points and a summary.

## Controls

- Models are trained per crop/market series; unrelated mandi prices are not pooled.
- Random train/test splitting is not used.
- Each forecast day has its own empirical band: the 90th percentile of absolute walk-forward residuals at that horizon step, so uncertainty widens as the horizon grows. It is an estimate, not a guarantee.
- A candidate is never automatically approved or published. A human data steward must review the series identity, provenance, history, gaps and metrics before a run is inserted into the approved forecast tables.
- The database enforces a minimum approved training-observation count and requires model MAE to beat the baseline MAE.
- Do not train on demo data, duplicate observations, future-dated rows or prices without source/date provenance.
- No trained model artifact is included because the live market-observation table currently has no rows.
