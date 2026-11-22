# Market data freshness policy

Farmess should never imply that a daily market observation is a real-time quote.

The reusable assessMarketDataFreshness helper classifies a normalized observation date as:

- fresh — within the configured freshness window (48 hours by default)
- stale — older than that window
- future — dated after the evaluation time and therefore unsafe to present as current
- invalid — not a valid ISO calendar date

The helper is intentionally pure and does not fetch data, choose a market price, or persist anything. A provider adapter can use it when deciding whether to return an available, stale, or unavailable state.

## Integration boundary

This slice does not change the existing OGD provider or UI. That keeps the policy independently testable and avoids coupling a source-specific freshness rule to presentation code.

When integrated, the caller should preserve the observation date and clearly label stale data rather than silently substituting a newer or invented value.
