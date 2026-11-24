# Per-record market freshness labels

Each market observation card displays a freshness label calculated from its own observation date, rather than relying only on the overall result status.

- **Within 48 hours:** the observation date is inside the configured freshness window.
- **Older than 48 hours:** the observation is retained for historical context but is visibly identified as stale.
- **Future-dated:** the date is not treated as current market data.
- **Date unavailable:** the date could not be validated.

The labels use the same 48-hour rule as the market-data freshness domain helper. They do not change, delete, or rewrite source observations and do not imply a live quote or guaranteed selling price. The overall source response may still be stale even when its newest record is within the window.
