# Market source date integrity

The OGD India adapter must not label future-dated source observations as current market information.

## Contract

Before returning normalized records, the provider checks all observation dates against the server-generated retrieval timestamp:

- Valid dates on or before the retrieval date are accepted.
- A future observation date causes the entire provider response to be withheld as unavailable. The adapter does not silently drop suspicious rows and present a partial result.
- Invalid observation dates or retrieval timestamps fail closed.
- Calendar dates are round-tripped through UTC so impossible dates such as `2026-02-30` are rejected.
- Repeated future dates are reported once in sorted order.

The check compares calendar dates because the source is a daily dataset and does not provide a time of day for each observation. An observation on the same calendar date as retrieval is allowed.

## Scope and limits

This guard checks date integrity only. It does not verify the source's authenticity, freshness, licence, completeness or price accuracy. Existing normalization continues to validate required identity fields, price values, price-range consistency and provenance. Existing freshness handling remains separate.

No database migration, UI change, source credential or new external request is introduced.
