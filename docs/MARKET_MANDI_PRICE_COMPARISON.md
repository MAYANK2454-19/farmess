# Same-day mandi price comparison

The farmer Market Prices explorer compares reported modal prices across mandis only when the records match on:

- Commodity
- Variety (including an explicitly unspecified variety)
- Observation date

Within each matching mandi/location, repeated records are averaged and counted as one market row. The table sorts those mandi averages from lowest to highest and reports the difference between the highest and lowest averages. The percentage spread is omitted when the lowest average is zero.

Demo values, missing/blank prices, non-numeric prices, negative prices and invalid observation dates are excluded. Comparisons require at least two distinct mandi/location identities. Existing date and modal-price filters apply before comparison.

This is a descriptive comparison of source-reported modal prices in INR per quintal. It is not adjusted for transport, fees, quality, quantity or negotiation; it is not a live quote or a guarantee of a farmer's realized price.
