# Market observation advanced filters

The farmer market explorer supports optional local filters over the observations already returned by the selected source:

- **Observation date:** inclusive start and end dates.
- **Modal price:** inclusive minimum and maximum values in INR per quintal.
- Date and price bounds can be combined. Invalid or missing observation dates are excluded only when a date bound is active; missing or invalid modal prices are excluded only when a price bound is active.
- Reversed ranges and invalid bounds are rejected with a clear validation message.
- Filtering is presentation-only: it does not change API requests, source records, or stored values.
- The history chart, visible record list, sort order, result count and CSV export all use the same filtered set.
- Clearing the advanced filters restores all records returned by the current server-side search.


Automated coverage verifies inclusive date and price boundaries, combined filters, empty-filter behavior, missing values, malformed dates, negative prices and reversed ranges.
