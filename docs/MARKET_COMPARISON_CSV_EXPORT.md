# Same-day mandi comparison CSV export

The comparison panel exports the same filtered, comparable rows shown on screen. Each row includes crop identity, observation date, mandi and location, average reported modal price, number of observations averaged, observed low/high modal values, same-day spread, optional percentage spread and INR/quintal unit.

The file is UTF-8 with a byte-order mark for spreadsheet compatibility. Text values are quoted and escaped, and formula-leading text is prefixed to reduce spreadsheet formula-injection risk. Empty comparison data produces a header-only file; the UI hides the export action when there are no comparisons.

The export is descriptive source-reported data, not a live quote or transport-adjusted net return.
