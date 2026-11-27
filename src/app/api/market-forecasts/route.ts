import { withApiLogging } from "@/lib/observability/logger";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canonicalState, ogdStateName, sourceDistrictNames } from "@/lib/location/india";
import { canonicalCommodity } from "@/lib/market-data/commodities";
import { mandiKey } from "@/lib/market-data/mandi-key";
import { dailySeries, forecastPrices, MINIMUM_REPORTS } from "@/lib/market-data/price-forecast";
import { mlForecast, type MlForecastResult, type MlSeries } from "@/lib/market-data/ml-forecast";
import {
  weatherForecast,
  type WeatherForecastResult,
  type WeatherSeries,
} from "@/lib/market-data/weather-forecast";
import { indexWeather, weatherDayNumber, type WeatherIndex } from "@/lib/weather/daily";
import {
  loadSavedWeather,
  loadWeatherOutlook,
  todayInIndia,
  weatherIsEnabled,
  weatherKey,
} from "@/lib/weather/district-weather";

export const dynamic = "force-dynamic";

const LOOKBACK_DAYS = 400;
const WEATHER_LOOKBACK_DAYS = 440;
const POOL_PAGE = 1000;
const POOL_MAX_PAGES = 20;
const ML_CACHE_TTL_MS = 15 * 60 * 1000;
const mlCache = new Map<string, { expires: number; value: MlForecastResult }>();
const weatherCache = new Map<string, { expires: number; value: WeatherForecastResult }>();

type Row = {
  crop: string;
  market_name: string;
  district: string;
  state: string;
  observation_date: string;
  modal_price_paise_per_quintal: number | null;
};

type Supabase = Awaited<ReturnType<typeof createClient>>;

type WeatherAnswer = WeatherForecastResult | { status: "unavailable"; reason: string };

type WeatherOutlook = {
  district: string;
  source: "Open-Meteo";
  days: { date: string; rainMm: number | null; tmaxC: number | null; tminC: number | null }[];
  rainNext7Mm: number | null;
};

function limitedText(params: URLSearchParams, key: string, max: number) {
  const value = params.get(key)?.trim() || null;
  return value && value.length > max
    ? { error: `${key} must be ${max} characters or fewer.` }
    : { value };
}

/** All saved rows for a state in the lookback window (paged past the 1000-row API limit). */
async function loadStateRows(supabase: Supabase, state: string, since: string) {
  const rows: Row[] = [];
  for (let page = 0; page < POOL_MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from("market_observations")
      .select("crop,market_name,district,state,observation_date,modal_price_paise_per_quintal")
      .ilike("state", state)
      .gte("observation_date", since)
      .not("modal_price_paise_per_quintal", "is", null)
      .order("id", { ascending: true })
      .range(page * POOL_PAGE, page * POOL_PAGE + POOL_PAGE - 1);
    if (error) return null;
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < POOL_PAGE) break;
  }
  return rows;
}

const seriesKey = (row: Pick<Row, "crop" | "market_name" | "district">) =>
  `${row.crop.toLowerCase()}|${mandiKey(row.market_name, row.district)}`;

function toSeries(key: string, points: { date: string; price: number }[]): MlSeries {
  const daily = dailySeries(points);
  return { key, dates: daily.map((p) => p.date), prices: daily.map((p) => p.price) };
}

/**
 * Price trend and short-term forecasts for one crop at one mandi, from saved
 * AGMARKNET reports. A mandi's renamed listings are joined (see mandi-key.ts).
 * Three forecasts are evaluated against the "price stays the same" baseline:
 * a statistical model on this mandi alone (price-forecast.ts), a
 * gradient-boosted ML model pooled across every crop and mandi in the state
 * (ml-forecast.ts), and the same kind of model with the weather of each
 * mandi's district added (weather-forecast.ts). Each is shown only if it
 * beats the baseline.
 */
async function handleGET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const crop = limitedText(params, "crop", 120);
  const market = limitedText(params, "market", 160);
  const state = limitedText(params, "state", 120);
  const district = limitedText(params, "district", 120);
  for (const field of [crop, market, state, district]) {
    if ("error" in field) return NextResponse.json({ error: field.error }, { status: 400 });
  }
  if (!crop.value) {
    return NextResponse.json(
      {
        status: "choose_crop",
        message: "Choose a crop to see its price trend.",
        minimumReports: MINIMUM_REPORTS,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // Saved rows carry the source's spelling ("Tomato"), whatever was typed ("tomatoes").
  const cropName = canonicalCommodity(crop.value).name;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  const supabase = await createClient();

  // Which state? The filter if given, otherwise the state with the latest reports for this crop.
  let stateName = state.value ? ogdStateName(canonicalState(state.value) ?? state.value) : null;
  if (!stateName) {
    let probe = supabase
      .from("market_observations")
      .select("state")
      .ilike("crop", cropName.replace(/[%_*\\]/g, " "))
      .gte("observation_date", since)
      .order("observation_date", { ascending: false })
      .limit(1);
    if (district.value) probe = probe.ilike("district", district.value);
    const { data, error } = await probe;
    if (error) {
      return NextResponse.json({ error: "Saved prices could not be loaded." }, { status: 503 });
    }
    stateName = (data?.[0] as { state?: string } | undefined)?.state ?? null;
  }

  const stateRows = stateName ? await loadStateRows(supabase, stateName, since) : [];
  if (stateRows === null) {
    return NextResponse.json({ error: "Saved prices could not be loaded." }, { status: 503 });
  }

  // Mandis for this crop (and district filter), grouped across renamed listings.
  const cropLower = cropName.toLowerCase();
  const stateCropRows = stateRows.filter((row) => row.crop.toLowerCase() === cropLower);
  // Saved rows carry the source's district names ("East Champaran/ Motihari"
  // for East Champaran), so the chosen district is matched to those first.
  const sourceNames =
    district.value && stateName
      ? sourceDistrictNames(stateName, district.value, [
          ...new Set(stateRows.map((row) => row.district)),
        ])
      : [];
  const districtKeys = district.value
    ? new Set([district.value, ...sourceNames].map((name) => name.toLowerCase()))
    : null;
  const districtCropRows = districtKeys
    ? stateCropRows.filter((row) => districtKeys.has(row.district.toLowerCase()))
    : stateCropRows;
  // No mandi in the chosen district reports this crop: show the rest of the state instead.
  const widened =
    Boolean(districtKeys) && districtCropRows.length === 0 && stateCropRows.length > 0;
  const cropRows = widened ? stateCropRows : districtCropRows;
  const area = {
    state: stateName,
    district: district.value ?? null,
    widened,
    /** The district as data.gov.in writes it, when that differs from the chosen name. */
    sourceDistrict:
      sourceNames.find((name) => name.toLowerCase() !== district.value?.toLowerCase()) ?? null,
  };

  const groups = new Map<
    string,
    { key: string; name: string; latest: string; dates: Set<string>; rows: Row[] }
  >();
  for (const row of cropRows) {
    const key = seriesKey(row);
    const group = groups.get(key) ?? {
      key,
      name: row.market_name,
      latest: "",
      dates: new Set<string>(),
      rows: [],
    };
    group.rows.push(row);
    group.dates.add(row.observation_date);
    if (row.observation_date > group.latest) {
      group.latest = row.observation_date;
      group.name = row.market_name; // show the mandi's current name
    }
    groups.set(key, group);
  }
  // Mandis still reporting (within 14 days) come first, then by number of report days.
  const freshCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const ranked = [...groups.values()].sort(
    (a, b) =>
      Number(b.latest >= freshCutoff) - Number(a.latest >= freshCutoff) ||
      b.dates.size - a.dates.size,
  );
  const markets = ranked.slice(0, 12).map((g) => ({
    name: g.name,
    reports: g.dates.size,
    district: g.rows[0]?.district ?? null,
  }));

  const wanted = market.value?.toLowerCase();
  const chosen =
    (wanted &&
      ranked.find(
        (g) =>
          g.name.toLowerCase() === wanted ||
          g.rows.some((row) => row.market_name.toLowerCase() === wanted) ||
          g.key.endsWith(`|${mandiKey(market.value!, g.rows[0]?.district)}`),
      )) ||
    ranked[0];

  if (!chosen) {
    return NextResponse.json(
      {
        status: "no_saved_prices",
        crop: cropName,
        area,
        markets,
        minimumReports: MINIMUM_REPORTS,
        message:
          "No saved mandi prices for this crop and area yet. Farmess fetches them from data.gov.in automatically once a state or district is chosen.",
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const result = forecastPrices(
    chosen.rows.map((row) => ({
      date: row.observation_date,
      price: (row.modal_price_paise_per_quintal ?? 0) / 100,
    })),
  );

  // Pooled machine-learning forecast (cached; retrained when new prices arrive).
  let ml: MlForecastResult | { status: "unavailable" } = { status: "unavailable" };
  let weather: WeatherAnswer = { status: "unavailable", reason: "not_evaluated" };
  let weatherOutlook: WeatherOutlook | null = null;
  // Same rule as the statistical model: never forecast from out-of-date prices.
  const stale = result.status === "trend_only" && result.reason === "stale";
  if (result.status !== "insufficient_history" && !stale) {
    const grouped = new Map<
      string,
      { district: string; points: { date: string; price: number }[] }
    >();
    for (const row of stateRows) {
      const key = seriesKey(row);
      const entry = grouped.get(key) ?? { district: row.district, points: [] };
      entry.points.push({
        date: row.observation_date,
        price: (row.modal_price_paise_per_quintal ?? 0) / 100,
      });
      grouped.set(key, entry);
    }
    const pool: MlSeries[] = [...grouped.entries()].map(([key, entry]) =>
      toSeries(key, entry.points),
    );
    const target = pool.find((series) => series.key === chosen.key);
    if (target) {
      const version = `${pool.length}:${stateRows.length}:${target.dates[target.dates.length - 1]}`;
      const cacheKey = `${stateName}|${chosen.key}|${version}`;
      const cached = mlCache.get(cacheKey);
      if (cached && cached.expires > Date.now()) {
        ml = cached.value;
      } else {
        ml = mlForecast(target, pool);
        if (mlCache.size > 200) mlCache.clear();
        mlCache.set(cacheKey, { expires: Date.now() + ML_CACHE_TTL_MS, value: ml });
      }

      // Weather-aware forecast: every mandi of this crop in the state, each with
      // the weather of its own district.
      const targetDistrict = chosen.rows[0]?.district ?? "";
      if (!weatherIsEnabled()) {
        weather = { status: "unavailable", reason: "weather_disabled" };
      } else if (stateName && targetDistrict) {
        const cropPool: WeatherSeries[] = [...grouped.entries()]
          .filter(([key]) => key.startsWith(`${cropLower}|`))
          .map(([key, entry]) => ({
            ...toSeries(key, entry.points),
            weatherKey: weatherKey(entry.district),
          }));
        const districts = [
          ...new Set(
            [...grouped.entries()]
              .filter(([key]) => key.startsWith(`${cropLower}|`))
              .map(([, entry]) => entry.district),
          ),
        ];
        const weatherSince = new Date(Date.now() - WEATHER_LOOKBACK_DAYS * 86_400_000)
          .toISOString()
          .slice(0, 10);
        const saved = await loadSavedWeather(supabase, stateName, districts, weatherSince);
        const indexes = new Map<string, WeatherIndex>(
          [...saved.rows.entries()].map(([key, rows]) => [key, indexWeather(rows)]),
        );
        const targetKey = weatherKey(targetDistrict);
        const centre = saved.centres.get(targetKey);
        const outlookRows = centre ? await loadWeatherOutlook(centre) : null;
        const savedTarget = saved.rows.get(targetKey) ?? [];
        const outlook = outlookRows ? indexWeather(savedTarget, outlookRows) : null;

        const weatherTarget = cropPool.find((series) => series.key === chosen.key);
        if (weatherTarget) {
          const weatherRows = [...saved.rows.values()].reduce((sum, rows) => sum + rows.length, 0);
          const weatherVersion = `${version}:${weatherRows}:${outlookRows?.[outlookRows.length - 1]?.date ?? "-"}`;
          const weatherCacheKey = `${stateName}|${chosen.key}|${weatherVersion}`;
          const cachedWeather = weatherCache.get(weatherCacheKey);
          if (cachedWeather && cachedWeather.expires > Date.now()) {
            weather = cachedWeather.value;
          } else {
            const computed = weatherForecast({
              target: weatherTarget,
              pool: cropPool,
              weather: indexes,
              outlook,
            });
            weather = computed;
            if (weatherCache.size > 200) weatherCache.clear();
            weatherCache.set(weatherCacheKey, {
              expires: Date.now() + ML_CACHE_TTL_MS,
              value: computed,
            });
          }
        }

        if (outlookRows) {
          const todayDay = weatherDayNumber(todayInIndia());
          const days = outlookRows
            .filter((row) => {
              const day = weatherDayNumber(row.date);
              return day >= todayDay && day < todayDay + 7;
            })
            .map((row) => ({
              date: row.date,
              rainMm: row.rainMm,
              tmaxC: row.tmaxC,
              tminC: row.tminC,
            }));
          const rain = days
            .map((day) => day.rainMm)
            .filter((value): value is number => value !== null);
          weatherOutlook = {
            district: targetDistrict,
            source: "Open-Meteo",
            days,
            rainNext7Mm: rain.length
              ? Math.round(rain.reduce((sum, value) => sum + value, 0) * 10) / 10
              : null,
          };
        }
      }
    }
  }

  return NextResponse.json(
    {
      status: result.status,
      crop: cropName,
      area,
      market: chosen.name,
      marketAliases: [...new Set(chosen.rows.map((row) => row.market_name))],
      district: chosen.rows[0]?.district ?? null,
      state: chosen.rows[0]?.state ?? null,
      markets,
      priceUnit: "INR/quintal (modal price)",
      minimumReports: MINIMUM_REPORTS,
      result,
      ml,
      weather,
      weatherOutlook,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("/api/market-forecasts", "GET", handleGET);
