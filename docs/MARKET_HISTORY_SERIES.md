# Market history series contract

This module builds source-preserving historical series from normalized `MarketPriceRecord` values. It supports the P0 market trend/history screen without inventing observations or a predicted trend.

## Behaviour

- Group records by commodity, variety, state, district, market, source, source URL, currency, unit and value type.
- Keep reported observations separate from demo data.
- Preserve source name, source URL, source price unit, retrieval timestamp and observation date on every point.
- Sort observations chronologically.
- Preserve reported min/max/modal values. A missing modal value stays `null`; it is not calculated from the range.
- Reject invalid dates, timestamps, units, provenance and inconsistent price ranges with a record-level reason.
- Deduplicate repeated record IDs within a series by keeping the version with the latest retrieval timestamp.
- Describe missing calendar dates as gap intervals. Do not interpolate, backfill or create placeholder points.

## Result states

- `available`: at least one series has observations on two or more distinct dates.
- `insufficient_history`: valid records exist, but every series has only one distinct observation date.
- `no_data`: there are no valid records to display.

A series with only one distinct observation is marked `single_observation`. It should not be rendered as a trend line.

## Units and provenance

Only normalized INR/quintal observations are accepted. The module does not convert arbitrary source units, infer missing values or merge series from different sources or value types.

The normalized market record must preserve:
- Commodity, variety, state, district and market.
- Minimum, maximum and modal prices where reported.
- Currency and normalized price unit.
- Original source price unit.
- Observation date and retrieval timestamp.
- Source name, source URL and reported/demo value type.

## Integration guidance

The market explorer should:
1. Select one or more exact series using commodity/variety/market filters.
2. Display the observation date and source context with every point.
3. Render gaps explicitly and retain the original number of observations.
4. Show `insufficient_history` and `no_data` states honestly.
5. Never add a forecast/prediction line based only on these historical observations.

This is a pure data transformation. It does not fetch market data, cache a provider response, or claim that an observation is live.
