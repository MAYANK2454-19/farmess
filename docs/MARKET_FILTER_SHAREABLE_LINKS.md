# Shareable market filters

The farmer market-observations page can encode its applied commodity, location, date, modal-price and sort settings in the URL. Copying or bookmarking that URL restores the same search state on another visit, and browser Back/Forward restores prior applied states.

Only submitted/applied values are shared; unfinished form drafts are not. Invalid date or price bounds are ignored as a group, unsupported sort values fall back to newest, and free-text values are trimmed and capped at 100 characters.

The URL contains filter criteria, not market records, account data or private produce-lot information. Results still come from the configured market-data source and may change as that source is refreshed. A shared URL is not a frozen report or a guarantee that another visitor has access to the same source records.
