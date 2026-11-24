# Admin market-data coverage and freshness monitor

The read-only data-health page is available at `/admin/market-health` to authenticated users whose trusted Supabase app metadata role is `admin` and whose profile role matches.

## What it reports

- Exact total count of stored market observations.
- Crop, market and crop/variety/geography series coverage from the most recent 5,000 observations.
- Record-level freshness counts using the existing 48-hour observation-date policy.
- Markets whose newest stored observation is stale, future-dated or invalid.
- Source-level observation counts and newest observation date.
- Missing modal-price count in the inspected sample.

## Data and safety boundaries

- Uses the signed-in server-side Supabase client and existing admin route guard / RLS policies.
- Does not use a service-role key, change source records, import data, or modify forecast approvals.
- Does not expose farmer, buyer or operator personal data.
- The 5,000-row query is intentionally bounded. When the exact database count is larger, every breakdown is labelled as a latest-record sample, not a full-database aggregate.
- A historical row becoming stale is expected. The market review list uses the newest observation per market rather than flagging a market merely because it has old history.
- Freshness is not proof of correctness, completeness, representative coverage or forecast suitability. Forecast eligibility still follows the offline training and human-review rules.

## Verification

```sh
node --experimental-strip-types --test src/features/admin/market-health.test.ts
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
