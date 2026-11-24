# Market observation sorting

The farmer market explorer supports four client-side sort orders:

- **Newest observation:** latest observation date first (default).
- **Oldest observation:** earliest observation date first.
- **Highest modal price:** numeric modal price, descending.
- **Lowest modal price:** numeric modal price, ascending.

Records without a valid modal price remain at the bottom for both price sort orders. Equal sort values retain their original source order. Sorting is presentation-only: it does not change source records, freshness labels, API requests, or price values. CSV export follows the currently selected visible sort order.
