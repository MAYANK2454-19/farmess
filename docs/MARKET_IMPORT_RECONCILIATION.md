# Market import duplicate reconciliation

OGD daily market feeds can repeat the same natural observation within one response. The import path reconciles a batch before the Supabase upsert.

## Natural key

The key matches the database uniqueness constraint:

- crop
- variety (including null)
- state
- district
- market name
- observation date
- source name

## Reconciliation rules

- Exact repeated observations collapse to the first row. Retrieval timestamps are batch metadata and do not make otherwise identical source observations different.
- Repeated natural keys with different min, max or modal prices are conflicts.
- Repeated natural keys with different source URLs are conflicts.
- If any conflict exists, the entire batch is withheld. The import route writes a failed/partial audit outcome and does not upsert a subset.
- Different observation dates or source names remain separate observations.

This avoids relying on row order or database upsert behaviour to decide which conflicting source value wins. It does not merge different sources, infer missing prices, or alter existing stored observations.
