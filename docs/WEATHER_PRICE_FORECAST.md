# Weather-aware price forecast

The price-trend panel now evaluates three forecasts against the "price stays the same"
baseline and shows each one only if it beats that baseline on recent reports it never saw:

1. a statistical model on the chosen mandi alone (`price-forecast.ts`);
2. gradient-boosted trees pooled across every crop and mandi in the state (`ml-forecast.ts`);
3. **gradient-boosted trees with district weather** (`weather-forecast.ts`), described here.

## Inputs

Trained on every mandi of the same crop in the state, each with the weather of its own district:

| Group                    | Inputs                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Price (same as model 2)  | Recent changes over 1–10 reports, distance from the 10-report average, volatility, season, reporting gap                       |
| Weather already seen     | Rain over the last 3, 7 and 30 days; mean maximum and minimum temperature over 7 days; how warm the week was against the month |
| Weather on forecast days | Total rain, the wettest day and the mean maximum temperature between the latest report and the forecast date                   |

Weather comes from Open-Meteo for the district centre (found with OpenStreetMap): past days from
the archive API, saved in `weather_daily`; the coming 16 days from the forecast API, read when a
forecast is requested and never saved as if they had happened. Past values are weather-model
analysis, not weather-station readings.

## Honest testing

Training uses the weather that actually happened on the forecast days, so the model can learn
what rain does to a crop's price. Testing is stricter. On the mandi's latest reports, which the
model never saw, it is given **only weather known on the day of the forecast** (the previous
days stand in for the coming ones), and it must beat the baseline under that handicap to be
shown. The error it would have had with the real weather of those days is reported next to it
as the best case. A real forecast, with Open-Meteo's forecast for the coming days, should fall
between the two.

The panel also reports what share of the model's learning came from weather inputs, so a model
that passes on price patterns alone is not presented as a weather effect.

## Weather possibilities

When the weather model is shown, the same forecast is repeated for three cases at the last
forecast date:

- **If it stays dry** — no rain on the forecast days;
- **With the forecast rain** — what Open-Meteo expects;
- **With heavy rain** — as wet as the wettest tenth of past periods of the same length.

These are what-if estimates learned from past weeks with similar weather, not a weather
forecast and not a guarantee. If past periods never reached 10 mm of rain, or the model found no
rain effect, the panel says so instead of showing numbers.

## Checked on real data (27 Nov 2026, Jammu and Kashmir)

| Mandi and crop         | Baseline error | Weather model (known-only) | Shown? |
| ---------------------- | -------------- | -------------------------- | ------ |
| Tomato, Narwal Jammu   | ₹322           | ₹281                       | Yes    |
| Onion, Kathua          | ₹398           | ₹385                       | Yes    |
| Potato, Narwal Jammu   | ₹28            | ₹39                        | No     |
| Cauliflower, Parimpore | ₹345           | ₹359                       | No     |

Errors are the average absolute error per quintal over the next 7 reports. Where the model does
not beat the baseline, no weather forecast is shown.

## Limits

- A weather forecast needs weather saved for the mandi's district; it is fetched in the
  background the first time a crop is looked up there, and the panel says so meanwhile.
- At least 300 training examples and 40 report days for the mandi are required.
- Open-Meteo's free API is for non-commercial use (`OPEN_METEO_NON_COMMERCIAL_USE=true`); a
  paid key (`OPEN_METEO_CUSTOMER_API_KEY`) switches both endpoints to the customer API.
