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
   just showed.
2. **History** from the "Variety-wise daily market prices" resource, newest first: 12 months
   for a district, 4 months when only a state is known. A later run first tops up the days newer
   than what is saved, then continues further back from where the earlier run stopped.
3. **District weather** for every district where the crop is reported (see
   [WEATHER_PRICE_FORECAST.md](./WEATHER_PRICE_FORECAST.md)).

If the chosen district has no mandi reporting the crop, the rest of the state is fetched and
shown instead, and the screen says so.

The newest rows are saved first, about eight seconds after a fetch starts, so the latest prices
are on the page long before the whole year has been read.

## District names

data.gov.in writes some districts its own way, and its district filter is an exact match:
asking for "East Champaran" finds nothing, because the source lists that district as
"East Champaran/ Motihari". Farmess therefore asks under the source's name, which it gets from:

1. **Reports already saved for the state**, which carry the source's spelling.
2. **A checked list** in `src/lib/location/india.ts` (`OGD_DISTRICT_NAMES`) for districts whose
   source name has nothing in common with the usual one. Bihar was checked against the source
   on 27 Nov 2026: 30 of its 38 districts are listed under the usual name; the others are
   East Champaran → `East Champaran/ Motihari`, West Champaran → `West Chambaran`,
   Kaimur → `Kaimur/Bhabhua`, Katihar → `Kaithar`, Lakhisarai → `Luckeesarai`,
   Munger → `Munghair`, Purnia → `Purnea`, Gopalganj → `Gopalgang`, and Saran, whose mandis
   appear under both `Chhapra` and `Saran` (both are fetched).

A source name is taken for a district only when it fits that district better than any other
district of the state (`sourceDistrictNames`). "Siwan" is two letters from "Saran" and
"West Godavari" two from "East Godavari", but each is a district of its own and is never
mixed in. The same rule is used by the live price search, the price-trend panel and the
district weather (which looks a district up on the map under its usual name).

Other states have not been checked name by name yet. Their districts are matched by the
spelling rules, and a district the source names differently still falls back to the state.
To check a state and see which names to add to the list:

```
node --experimental-strip-types scripts/check-district-names.mts "Uttar Pradesh"
```

## How it stays safe and within limits

- **Only the server writes prices.** Rows are saved by the database function
  `ingest_market_observations`, which requires a token derived from `FARMESS_SERVER_SECRET`
  (only its SHA-256 hash is stored in the database) and validates every row: lengths, dates not
  in the future, non-negative prices, minimum ≤ modal ≤ maximum. A signed-in user cannot insert
  or change a price directly.
- **One fetch per crop and area at a time.** `claim_market_import` records a claim; a second
  person searching the same crop and district does not start a second fetch. While a district
  with nothing saved is being fetched, the state's claim is held as well, so the larger state
  fetch cannot start alongside it; it is used only if the district turns out to have no mandi.
- **"Slow down" answers are waited out.** When data.gov.in answers HTTP 429, the fetch waits
  5, 10, 20, 30, 45 and 60 seconds between tries (about three minutes in all) before giving up.
- **Retries are spaced out** by outcome: complete 6 hours, stopped at the time limit 1 minute,
  rate-limited 3 minutes, source unreachable 5 minutes, could not save 15 minutes, nothing at
  the source 24 hours.
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
It says what is actually happening, never just "fetching":

| Situation                                       | What the panel says                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------- |
| A fetch is running                              | Fetching, and how many reports are saved so far                            |
| data.gov.in answered "slow down"                | That it was asked to slow down and keeps trying                            |
| No mandi in the district for this crop          | That the rest of the state is being fetched instead                        |
| The fetch gave up on a rate limit or an error   | Why, and in about how many minutes it tries again                          |
| The fetch stopped at its time limit             | How many reports are saved and that it carries on in about a minute        |
| Nothing at the source for the crop in the state | That data.gov.in has no reports for it in the last four months             |
| The page has been open for 20 minutes           | How many reports are saved; the rest is fetched the next time it is opened |

The reply of `ensure` carries this in `runs` (`running`, `rate_limited`, `no_data`, …, with
`retryInSeconds` and `slowedDown`). It is what the answering server instance remembers about
the latest fetch, so it can be empty on another instance; the panel then falls back to a
general "fetching" message for a few minutes. The claims in the database stay the source of
truth for what may start.

## Files

- `src/lib/market-data/auto-import.ts` — rules and the import loop (tested).
- `src/lib/market-data/auto-import-server.ts` — claims, background job, today's prices,
  district names.
- `src/features/market-data/fetch-progress.ts` — what the panel says and when it asks again
  (tested).
- `src/lib/location/india.ts` — district-name matching and the checked source names (tested).
- `src/lib/market-data/history-import.ts` — shared with the admin import.
- `src/app/api/market-history/ensure/route.ts` — status and trigger.
- `supabase/migrations/20261127023511_farmess_auto_import_weather_ratings_sessions.sql` and
  `20261127050021_farmess_offer_fix_and_current_price_ingest.sql` — database functions.

## Note on speed

The public sample key from data.gov.in returns 10 rows per request and is shared by everyone who
tries the API, so it is sometimes refused. Measured on 27 Nov 2026 with that key, one crop for
one district (Bitter gourd, East Champaran, 254 reports in the last year): first prices saved
after 8 seconds, the whole year after 57 seconds. A whole state takes several minutes and may
need more than one run. With a personal key from data.gov.in → My Account in
`DATA_GOV_IN_API_KEY` (Vercel and `.env.local`), each request returns far more rows and the same
fetch takes seconds. The live search of today's prices also shows at most 10 rows on the sample
key.
