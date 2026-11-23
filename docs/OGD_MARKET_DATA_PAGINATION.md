# OGD market-data pagination

The server-side OGD India / AGMARKNET adapter now reads a bounded result set across sequential API pages instead of requesting only the first page.

## Request behaviour

- The public market-data filter limit remains bounded to 1–500 records.
- Each upstream page requests at most 100 records.
- The adapter increments the OGD `offset` by the number of records already collected.
- Existing commodity, state, district and market filters are carried unchanged to every page.
- A short page or empty page ends pagination early.
- The normalized `MarketPriceRecord` contract, source attribution, observation dates and retrieval timestamp are unchanged.

## Failure behaviour

A failed HTTP response, malformed page payload or request timeout makes the complete source lookup unavailable. Records fetched from earlier pages are discarded; the API never labels a partial result as a complete market result. No fallback or synthetic records are created.

The upper bound prevents unbounded upstream requests. The API's existing stale/no-data/unavailable states continue to apply to the combined normalized result set.

## Verification

Run:

```sh
node --experimental-strip-types --test src/lib/market-data/ogd-pagination.test.ts
npm run lint
npm run typecheck
npm test
npm run build
```

The dedicated GitHub Actions workflow also checks Prettier and runs the full repository quality pipeline on pushes to this feature branch.
