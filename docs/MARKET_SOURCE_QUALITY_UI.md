# Market source quality panel

The farmer Market Prices screen displays the aggregate quality diagnostics returned by the OGD adapter.

## What farmers see

- Records checked: raw rows received from the completed source lookup.
- Usable records: rows that passed identity, observation-date and price validation.
- Excluded records: rows withheld from displayed prices.
- A disclosure list of non-zero rejection categories, translated into plain language.

The panel is rendered only when the source reports at least one received row. An unconfigured or unavailable source with no returned rows does not show misleading zero-count quality statistics.

## Trust and safety boundaries

- The UI displays aggregate counts only. It never renders raw rejected source payloads or API credentials.
- Excluded records do not enter the visible price list or history chart.
- A clean quality report is not a guarantee of freshness, accuracy at the point of sale, or a buyer's willingness to pay.
- Freshness and source provenance remain separately displayed.
- The panel is responsive and uses a native disclosure element so the rejection breakdown is keyboard accessible.

## Verification

```sh
node --experimental-strip-types --test src/lib/market-data/source-quality.test.ts
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
```
