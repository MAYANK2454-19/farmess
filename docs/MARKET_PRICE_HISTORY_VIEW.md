# Market price history view

The Market Prices screen builds history from the normalized records returned by the selected market-data source.

## Display rules

- Only `reported` observations appear in the reported history selector.
- Each series is isolated by commodity, variety, location, market, source, unit and value type.
- The chart plots reported modal prices only. Missing modal prices break the line; the chart never connects across an unavailable value.
- A series needs at least two distinct observation dates and two reported modal prices before a trend line is shown.
- A single observation is shown as a data point in the observation table, not described as a trend.
- Missing calendar dates are listed as gaps and are never interpolated or backfilled.
- The table retains the original observation date, min/modal/max values and source link.

## Interpretation

The chart is a view of historical source observations. It is not a live quote, guaranteed selling price, forecast or recommendation. The displayed record set is limited to the current market-price API response and active filters; it is not an exhaustive historical archive.

## Integration

`MarketHistoryChart` is mounted above the market observation cards when records are returned. It consumes the shared `buildMarketHistorySeries` contract and does not make a separate provider request.
