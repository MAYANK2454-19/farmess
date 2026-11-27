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

## How data.gov.in matches names

The two datasets behave differently, and neither forgives a spelling.

| Dataset                                            | A filter matches                   | What Farmess does                                               |
| -------------------------------------------------- | ---------------------------------- | --------------------------------------------------------------- |
| Price history ("Variety-wise daily market prices") | the exact value, capitals included | asks with the source's own spelling of state, district and crop |
| Today's reports ("Current daily price")            | single words, best matches first   | uses the exact `.keyword` form of a field for names it knows    |

"Single words" means that in today's reports `filters[state]=Uttar Pradesh` also returns
Madhya Pradesh and Andhra Pradesh, and `filters[commodity]=Bitter gourd` every other gourd.
Measured on 27 Nov 2026: 2,269 rows against 330 with `filters[state.keyword]`, and 712 against
320 with `filters[commodity.keyword]`. The live search therefore asks in the exact form for a
state of the list, a listed crop and a district's name at the source; free text (an unlisted
crop, part of a mandi's name) keeps the word match (`src/lib/market-data/ogd-query.ts`).

## State names

Five states are written differently at the source, in both datasets. Asked for under the usual
name they returned nothing at all, so no price could be shown or fetched for them:

| State                       | Name at data.gov.in   |
| --------------------------- | --------------------- |
| Andaman and Nicobar Islands | `Andaman and Nicobar` |
| Chhattisgarh                | `Chattisgarh`         |
| Delhi                       | `NCT of Delhi`        |
| Kerala                      | `Keralam`             |
| Puducherry                  | `Pondicherry`         |

All 36 states and union territories were checked on 27 Nov 2026 (`OGD_STATE_NAMES` in
`src/lib/location/india.ts`). The other 28 with data use the usual name. No rows were found
under any name for Ladakh, Lakshadweep, or Dadra and Nagar Haveli and Daman and Diu.

The history keeps older spellings for older rows. Kerala's reports before April 2026 are under
`Kerala` and are not read, so a fetch for Kerala reaches back to April 2026 rather than a full
year until then. Uttarakhand's reports before November 2025 are under `Uttrakhand`, which is
already past the year Farmess reads.

## District names

data.gov.in writes many districts its own way, and it matches the district exactly, down to a
trailing space. Asking for "East Champaran" finds nothing, because the source lists that
district as "East Champaran/ Motihari"; "North and Middle Andaman" finds nothing without the
space the source keeps after it. These kinds of difference turned up:

| Kind                       | Example at the source                                             |
| -------------------------- | ----------------------------------------------------------------- |
| Another spelling           | `Gopalgang` for Gopalganj, `Chittor` for Chittoor                 |
| Another name altogether    | `Chhapra` for Saran, `Munghair` for Munger, `Cuddapah` for Kadapa |
| Renamed during the year    | Anantapur is `Anantapur` until May 2026 and `Ananthapuramu` after |
| Two names at the same time | Saran's mandis are under both `Chhapra` and `Saran`               |

So Farmess asks under the source's names, all of them when a district has more than one:

1. **The list in `src/lib/location/ogd-district-names.ts`.** It is built from a scan of every
   district name in the source's price history, state by state, keeping the names with a report
   in the last 400 days. It is generated, not written by hand:

   ```
   node --experimental-strip-types scripts/check-district-names.mts "Uttar Pradesh"
   node --experimental-strip-types scripts/build-district-names.mts
   ```

   The scan reads the history sorted by district, one row at a time: the first row names a
   district, a second request counts that district's rows and gives its newest report, and the
   next read starts that many rows further on. That is two small requests per name, and the
   counts must add up to the state's total (Goa: 95,611 + 53,174 = 148,785). Results are kept in
   `scripts/data/ogd-districts/`; a scan that is cut short carries on from where it stopped.

   The builder gives each source name to the district it fits best by spelling, and prints
   every match that is not the same name so a wrong one is noticed. Names no spelling rule can
   connect ("Chhapra" is Saran) are mapped by hand in `scripts/data/ogd-district-manual.json`,
   using the mandi named in the scan as evidence.

2. **Reports already saved for the state**, for a state that has not been scanned yet: they
   carry the source's spelling.

A source name is taken for a district only when it fits that district better than any other
district of the state (`sourceDistrictNames`). "Siwan" is two letters from "Saran" and
"West Godavari" two from "East Godavari", but each is a district of its own and is never
mixed in. The same rule is used by the live price search, the price-trend panel and the
district weather (which looks a district up on the map under its usual name).

The states scanned so far are listed in `OGD_DISTRICT_NAMES_CHECKED` in the generated file. For
the others, the live search looks for the district under another spelling among today's reports
("Farukhabad" for Farrukhabad), and the automatic fetch falls back to the state.

Two things the scans showed that the list cannot repair:

- **Districts split from an older one** carry their own name only since the source adopted it.
  Sri Sathya Sai (Andhra Pradesh) has reports under its own name from May 2026; before that its
  mandis were reported under the undivided `Anantapur`.
- **Districts the source lists and Farmess did not have** are added to the district list when
  the source's mandis place them clearly (Markapuram and Polavaram in Andhra Pradesh).

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
