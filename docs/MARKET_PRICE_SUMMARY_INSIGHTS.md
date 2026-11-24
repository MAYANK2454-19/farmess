# Market price summary insights

The farmer market explorer shows a compact snapshot for the currently visible record set. Server-side search and local advanced filters therefore update the summary together.

The snapshot includes:

- **Observations shown:** all records in the visible filtered result set.
- **Reported modal prices:** count of records with a finite, non-negative modal price and `valueType: "reported"`.
- **Markets represented:** distinct market/district/state combinations among reported records, normalized for casing and surrounding/repeated whitespace.
- **Average, lowest and highest modal price:** calculated only from valid reported modal prices, in INR per quintal.

Demo records, missing prices, non-numeric prices and negative prices do not contribute to reported price metrics. If no valid reported modal prices exist, price metrics display an em dash and the panel explains why.

These are descriptive summaries of source observations, not live quotes, forecasts or guaranteed selling prices.
