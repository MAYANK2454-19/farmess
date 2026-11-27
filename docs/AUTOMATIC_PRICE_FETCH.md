# Automatic mandi price fetch

Nobody imports prices by hand any more. When a farmer or buyer looks up a crop for their area,
Farmess fetches that crop's reported mandi prices from data.gov.in itself: today's reports and
up to a year of history. The admin's import screen still exists, but only for loading a whole
state in advance.

## What triggers a fetch

| Action                                         | Area used                                    |
| ---------------------------------------------- | -------------------------------------------- |
| Searching on **Market Prices** (farmer, buyer) | The state and district chosen in the filters |
| Saving a produce lot                           | The farmer's profile state and district      |
| Posting a buyer requirement                    | The buyer's profile state and district       |

Opening Market Prices without filters starts from the area saved in the profile, so the person
only types the crop. What they type is matched to the source's spelling first
(`src/lib/market-data/commodities.ts`): data.gov.in matches names exactly and is case-sensitive,
so "tomatoes", "bhindi" or "PADDY" become `Tomato`, `Bhindi(Ladies Finger)` and
`Paddy(Dhan)(Common)`. The 155 names in that file were each checked against the source.

## What is fetched

1. **Today's reports** from the current-day resource ("Current daily price of various
   commodities"), saved under that resource's link. The live search also keeps the reports it
   just showed. _Pending:_ saving these needs a small database update (the save function must
   accept which resource a row came from). Until it is applied, today's reports are shown in
   the search results as before but are not stored; they reach the trend a day later through
   the history resource.
2. **History** from the "Variety-wise daily market prices" resource, newest first: 12 months
   for a district, 4 months when only a state is known. A later run first tops up the days newer
   than what is saved, then continues further back from where the earlier run stopped.
3. **District weather** for every district where the crop is reported (see
   [WEATHER_PRICE_FORECAST.md](./WEATHER_PRICE_FORECAST.md)).

If the chosen district has no mandi reporting the crop, the rest of the state is fetched and
shown instead, and the screen says so.

## How it stays safe and within limits

- **Only the server writes prices.** Rows are saved by the database function
  `ingest_market_observations`, which requires a token derived from `FARMESS_SERVER_SECRET`
  (only its SHA-256 hash is stored in the database) and validates every row: lengths, dates not
  in the future, non-negative prices, minimum ≤ modal ≤ maximum. A signed-in user cannot insert
  or change a price directly.
- **One fetch per crop and area at a time.** `claim_market_import` records a claim; a second
  person searching the same crop and district does not start a second fetch.
- **Retries are spaced out** by outcome: complete 6 hours, partial 2 minutes, rate-limited
  10 minutes, error 15 minutes, nothing at the source 24 hours.
- **Progress is saved as it arrives**, so a rate limit or the 300-second function limit never
  loses what was already fetched. Rows of the oldest date in a batch are held back until the
  next page, so conflicting duplicate prices for one mandi, variety and day are still withheld.
- Every save writes an audit row to `market_data_ingestion_runs`
  (source "OGD India / AGMARKNET (automatic)"), visible to admins.

The fetch runs after the response has been sent (`after()` in the route handler), using the
person's own sign-in token; row-level security applies as for any of their requests.

## What the person sees

The price-trend panel calls `POST /api/market-history/ensure`, shows
"Fetching Tomato prices for Jammu from data.gov.in…", and refreshes itself as rows arrive.
If data.gov.in limits how much can be fetched, it says how many reports are saved and that the
rest is fetched automatically next time.

## Files

- `src/lib/market-data/auto-import.ts` — rules and the import loop (tested).
- `src/lib/market-data/auto-import-server.ts` — claims, background job, today's prices.
- `src/lib/market-data/history-import.ts` — shared with the admin import.
- `src/app/api/market-history/ensure/route.ts` — status and trigger.
- `supabase/migrations/20261127023511_farmess_auto_import_weather_ratings_sessions.sql` — database
  functions.

## Note on speed

The public sample key from data.gov.in returns 10 rows per request and is rate-limited hard, so
a first fetch can take a few minutes and may need more than one run. With a personal key from
data.gov.in → My Account in `DATA_GOV_IN_API_KEY`, the same fetch takes seconds.
