import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalState, districtForSourceName } from "@/lib/location/india";
import { lookupDistrictCentre } from "@/lib/location/lookup";
import { TtlCache } from "@/lib/market-data/ogd-cache";
import { logEvent } from "@/lib/observability/logger";
import type { Database } from "@/lib/supabase/database.types";
import { parseOpenMeteoDaily, type DailyWeather } from "./daily";
import { resolveOpenMeteoArchiveEndpoint, resolveOpenMeteoEndpoint } from "./forecast";

/*
 * District weather for the price forecast, from Open-Meteo (CC BY 4.0).
 *
 * Past days come from the Open-Meteo archive and are saved in weather_daily,
 * one row per district and day, through a database function that only this
 * server can call. The coming 16 days are read from the forecast API when a
 * forecast is requested and are never saved as if they had happened.
 */

type Db = SupabaseClient<Database>;

/** Days of saved weather the forecast model looks back over (price history plus a month). */
export const WEATHER_HISTORY_DAYS = 440;
const DAILY_FIELDS = "precipitation_sum,temperature_2m_max,temperature_2m_min";
const TIMEZONE = "Asia/Kolkata";
const TIMEOUT_MS = 20_000;
const GEOCODE_PAUSE_MS = 1_100;
const OUTLOOK_TTL_MS = 3 * 60 * 60 * 1000;
const MAX_DISTRICTS_PER_RUN = 30;
const MS_PER_DAY = 86_400_000;

export type DistrictRef = { state: string; district: string };
export type Centre = { latitude: number; longitude: number };

export const weatherKey = (district: string) => district.trim().toLowerCase();

/** Today's date in India, where the mandi reports and the daily weather are dated. */
export function todayInIndia(now = Date.now()): string {
  return new Date(now + 5.5 * 3600_000).toISOString().slice(0, 10);
}

const isoDaysBefore = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00.000Z`) - days * MS_PER_DAY).toISOString().slice(0, 10);

function endpoints(): { forecast: string; archive: string; key: string | undefined } | null {
  const customerKey = process.env.OPEN_METEO_CUSTOMER_API_KEY?.trim() || undefined;
  const options = {
    customerKey,
    isVercelProduction: process.env.VERCEL_ENV === "production",
    nonCommercialUseDeclared: process.env.OPEN_METEO_NON_COMMERCIAL_USE?.trim() === "true",
  };
  const forecast = resolveOpenMeteoEndpoint(options);
  const archive = resolveOpenMeteoArchiveEndpoint(options);
  return forecast && archive ? { forecast, archive, key: customerKey } : null;
}

export function weatherIsEnabled(): boolean {
  return endpoints() !== null;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Run a network call again after a short wait if it fails (dropped connection, busy provider). */
async function withRetries<T>(
  call: () => Promise<T>,
  waitsMs: number[] = [2_000, 6_000],
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      const wait = waitsMs[attempt];
      if (wait === undefined) throw error;
      await sleep(wait);
    }
  }
}

async function getDaily(url: URL): Promise<DailyWeather[]> {
  return withRetries(async () => {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Open-Meteo returned HTTP ${response.status}.`);
    return parseOpenMeteoDaily(await response.json());
  });
}

function baseUrl(endpoint: string, centre: Centre, key: string | undefined): URL {
  const url = new URL(endpoint);
  url.searchParams.set("latitude", String(centre.latitude));
  url.searchParams.set("longitude", String(centre.longitude));
  url.searchParams.set("daily", DAILY_FIELDS);
  url.searchParams.set("timezone", TIMEZONE);
  if (key) url.searchParams.set("apikey", key);
  return url;
}

/** Weather that already happened, for whole days from `from` to `to` (YYYY-MM-DD). */
async function fetchPastWeather(centre: Centre, from: string, to: string): Promise<DailyWeather[]> {
  const config = endpoints();
  if (!config) return [];
  const url = baseUrl(config.archive, centre, config.key);
  url.searchParams.set("start_date", from);
  url.searchParams.set("end_date", to);
  return getDaily(url);
}

const outlookCache = new TtlCache<DailyWeather[]>(300);

/**
 * The last two weeks and the coming 16 days for a district centre. Cached for
 * a few hours: forecasts are refreshed only a few times a day at the source.
 */
export async function loadWeatherOutlook(centre: Centre): Promise<DailyWeather[] | null> {
  const config = endpoints();
  if (!config) return null;
  const key = `${centre.latitude.toFixed(2)},${centre.longitude.toFixed(2)}`;
  const cached = outlookCache.get(key);
  if (cached) return cached;
  try {
    const url = baseUrl(config.forecast, centre, config.key);
    url.searchParams.set("past_days", "14");
    url.searchParams.set("forecast_days", "16");
    const rows = await getDaily(url);
    if (rows.length > 0) outlookCache.set(key, rows, OUTLOOK_TTL_MS);
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

export type SavedWeather = {
  rows: Map<string, DailyWeather[]>;
  centres: Map<string, Centre>;
};

const savedCache = new TtlCache<SavedWeather>(40);

/** Saved daily weather for some districts of a state since `since`, by district key. */
export async function loadSavedWeather(
  db: Db,
  state: string,
  districts: string[],
  since: string,
): Promise<SavedWeather> {
  const wanted = [...new Set(districts.map((name) => name.trim()).filter(Boolean))].sort();
  const empty: SavedWeather = { rows: new Map(), centres: new Map() };
  if (wanted.length === 0) return empty;
  const cacheKey = `${state}|${since}|${wanted.join(",")}`;
  const cached = savedCache.get(cacheKey);
  if (cached) return cached;

  const result: SavedWeather = { rows: new Map(), centres: new Map() };
  const PAGE = 1000;
  for (let page = 0; page < 40; page += 1) {
    const { data, error } = await db
      .from("weather_daily")
      .select("district,observation_date,rain_mm,tmax_c,tmin_c,latitude,longitude")
      .eq("state", state)
      .in("district", wanted)
      .gte("observation_date", since)
      .order("district", { ascending: true })
      .order("observation_date", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return empty;
    for (const row of data ?? []) {
      const key = weatherKey(row.district);
      const list = result.rows.get(key) ?? [];
      list.push({
        date: row.observation_date,
        rainMm: row.rain_mm,
        tmaxC: row.tmax_c,
        tminC: row.tmin_c,
      });
      result.rows.set(key, list);
      if (!result.centres.has(key)) {
        result.centres.set(key, { latitude: row.latitude, longitude: row.longitude });
      }
    }
    if (!data || data.length < PAGE) break;
  }
  // Only cache complete answers; missing districts are being fetched and will appear soon.
  if (wanted.every((name) => result.rows.has(weatherKey(name)))) {
    savedCache.set(cacheKey, result, 10 * 60_000);
  }
  return result;
}

/** Districts where a crop is being reported in a state, the preferred one first. */
export async function districtsReporting(
  db: Db,
  crop: string,
  state: string,
  preferred: string | null,
  today: string,
): Promise<string[]> {
  const clean = (value: string) => value.replace(/[%_*\\]/g, " ").trim();
  const { data } = await db
    .from("market_observations")
    .select("district")
    .ilike("crop", clean(crop))
    .ilike("state", clean(state))
    .gte("observation_date", isoDaysBefore(today, 90))
    .order("observation_date", { ascending: false })
    .limit(1000);
  const counts = new Map<string, { name: string; count: number }>();
  for (const row of data ?? []) {
    if (!row.district) continue;
    const key = weatherKey(row.district);
    const entry = counts.get(key) ?? { name: row.district, count: 0 };
    entry.count += 1;
    counts.set(key, entry);
  }
  const preferredKey = preferred ? weatherKey(preferred) : null;
  return [...counts.entries()]
    .sort(
      ([a, x], [b, y]) =>
        Number(b === preferredKey) - Number(a === preferredKey) || y.count - x.count,
    )
    .map(([, entry]) => entry.name)
    .slice(0, MAX_DISTRICTS_PER_RUN);
}

type Need = { district: string; from: string; centre: Centre | null };

/** Which of these districts are missing recent days or the older part of the history. */
async function weatherNeeds(
  db: Db,
  state: string,
  districts: string[],
  today: string,
): Promise<Need[]> {
  if (districts.length === 0) return [];
  const oldest = isoDaysBefore(today, WEATHER_HISTORY_DAYS);
  const [recent, old] = await Promise.all([
    db
      .from("weather_daily")
      .select("district,observation_date,latitude,longitude")
      .eq("state", state)
      .in("district", districts)
      .gte("observation_date", isoDaysBefore(today, 4))
      .limit(1000),
    db
      .from("weather_daily")
      .select("district")
      .eq("state", state)
      .in("district", districts)
      .gte("observation_date", oldest)
      .lte("observation_date", isoDaysBefore(today, WEATHER_HISTORY_DAYS - 6))
      .limit(1000),
  ]);
  if (recent.error || old.error) return [];
  const newestBy = new Map<string, { date: string; centre: Centre }>();
  for (const row of recent.data ?? []) {
    const key = weatherKey(row.district);
    const seen = newestBy.get(key);
    if (!seen || row.observation_date > seen.date) {
      newestBy.set(key, {
        date: row.observation_date,
        centre: { latitude: row.latitude, longitude: row.longitude },
      });
    }
  }
  const hasOld = new Set((old.data ?? []).map((row) => weatherKey(row.district)));
  const needs: Need[] = [];
  for (const district of districts) {
    const key = weatherKey(district);
    const newest = newestBy.get(key);
    if (!hasOld.has(key)) {
      needs.push({ district, from: oldest, centre: newest?.centre ?? null });
    } else if (!newest || newest.date < isoDaysBefore(today, 2)) {
      // Re-read the last days too: the archive revises its most recent values.
      needs.push({ district, from: isoDaysBefore(today, 10), centre: newest?.centre ?? null });
    }
  }
  return needs;
}

/**
 * Fetch and save missing weather for the districts where a crop is reported.
 * One district is fetched by one job at a time (a claim in the database), and
 * a failed district is retried later. Returns the number of districts updated.
 */
export async function ensureDistrictWeather(
  db: Db,
  token: string,
  input: { crop: string; state: string; preferredDistrict: string | null },
  deadline: number,
): Promise<number> {
  if (!weatherIsEnabled()) return 0;
  const today = todayInIndia();
  const yesterday = isoDaysBefore(today, 1);
  const districts = await districtsReporting(
    db,
    input.crop,
    input.state,
    input.preferredDistrict,
    today,
  );
  const needs = await weatherNeeds(db, input.state, districts, today);
  const stateForGeocoding = canonicalState(input.state) ?? input.state;

  let updated = 0;
  let geocoded = false;
  for (const need of needs) {
    if (Date.now() > deadline) break;
    const claimKey =
      `weather|${input.state.trim().toLowerCase()}|${weatherKey(need.district)}`.slice(0, 300);
    const { data: claimed } = await db.rpc("claim_market_import", {
      p_token: token,
      p_series_key: claimKey,
    });
    if (claimed !== true) continue;

    let ok = false;
    try {
      let centre = need.centre;
      if (!centre) {
        if (geocoded) await sleep(GEOCODE_PAUSE_MS); // OpenStreetMap asks for at most one request a second
        geocoded = true;
        // Mandi reports name some districts their own way ("Munghair" for
        // Munger); the map knows the district by its usual name.
        const mapName = districtForSourceName(stateForGeocoding, need.district) ?? need.district;
        centre = await withRetries(() => lookupDistrictCentre(stateForGeocoding, mapName));
      }
      if (centre) {
        const rows = (await fetchPastWeather(centre, need.from, yesterday)).filter(
          (row) => row.date <= yesterday,
        );
        for (let i = 0; i < rows.length; i += 700) {
          const { error } = await db.rpc("ingest_weather_daily", {
            p_token: token,
            p_state: input.state,
            p_district: need.district,
            p_latitude: centre.latitude,
            p_longitude: centre.longitude,
            p_rows: rows.slice(i, i + 700).map((row) => ({
              date: row.date,
              rain_mm: row.rainMm,
              tmax_c: row.tmaxC,
              tmin_c: row.tminC,
            })),
          });
          if (error) throw new Error(error.message);
        }
        ok = rows.length > 0;
        if (ok) updated += 1;
      }
    } catch (error) {
      logEvent("warn", "district_weather_failed", {
        district: need.district,
        message: error instanceof Error ? error.message : "unknown error",
      });
    } finally {
      await db.rpc("finish_market_import", {
        p_token: token,
        p_series_key: claimKey,
        p_outcome: ok ? "complete" : "error",
        p_retry_seconds: ok ? 6 * 3600 : 300,
      });
    }
  }
  if (updated > 0) {
    logEvent("info", "district_weather_saved", { state: input.state, districts: updated });
  }
  return updated;
}
