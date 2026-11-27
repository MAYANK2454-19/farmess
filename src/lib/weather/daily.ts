/**
 * Daily weather for a district centre (rain, maximum and minimum temperature),
 * and the weather inputs of the price forecast. Source: Open-Meteo. Past days
 * are weather-model analysis (not a weather station); future days are the
 * Open-Meteo forecast.
 */

export type DailyWeather = {
  /** YYYY-MM-DD, India time. */
  date: string;
  rainMm: number | null;
  tmaxC: number | null;
  tminC: number | null;
};

const MS_PER_DAY = 86_400_000;
/** A window needs at least this share of its days to be usable. */
const MINIMUM_COVERAGE = 0.7;
/** Forecast windows longer than this are cut off (a mandi that stopped reporting for weeks). */
export const MAX_WINDOW_DAYS = 21;

export function weatherDayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00.000Z`) / MS_PER_DAY);
}

export function isoFromWeatherDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Open-Meteo returns `daily` as parallel arrays; turn them into validated rows. */
export function parseOpenMeteoDaily(payload: unknown): DailyWeather[] {
  const daily =
    payload && typeof payload === "object" ? (payload as { daily?: unknown }).daily : null;
  if (!daily || typeof daily !== "object") return [];
  const block = daily as Record<string, unknown>;
  const times = Array.isArray(block.time) ? block.time : [];
  const column = (name: string) => (Array.isArray(block[name]) ? (block[name] as unknown[]) : []);
  const rain = column("precipitation_sum");
  const tmax = column("temperature_2m_max");
  const tmin = column("temperature_2m_min");
  const rows: DailyWeather[] = [];
  times.forEach((time, i) => {
    if (typeof time !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(time)) return;
    const rainMm = finite(rain[i]);
    const tmaxC = finite(tmax[i]);
    const tminC = finite(tmin[i]);
    if (rainMm === null && tmaxC === null && tminC === null) return;
    rows.push({
      date: time,
      rainMm: rainMm !== null && rainMm >= 0 && rainMm <= 2000 ? rainMm : null,
      tmaxC: tmaxC !== null && tmaxC >= -60 && tmaxC <= 65 ? tmaxC : null,
      tminC: tminC !== null && tminC >= -70 && tminC <= 60 ? tminC : null,
    });
  });
  return rows;
}

export type WeatherIndex = {
  get: (day: number) => DailyWeather | undefined;
  firstDay: number | null;
  lastDay: number | null;
  size: number;
};

/** Look-up by day. Later lists override earlier ones (forecast over saved history). */
export function indexWeather(...lists: (readonly DailyWeather[])[]): WeatherIndex {
  const byDay = new Map<number, DailyWeather>();
  let firstDay: number | null = null;
  let lastDay: number | null = null;
  for (const rows of lists) {
    for (const row of rows) {
      const day = weatherDayNumber(row.date);
      if (!Number.isFinite(day)) continue;
      byDay.set(day, row);
      if (firstDay === null || day < firstDay) firstDay = day;
      if (lastDay === null || day > lastDay) lastDay = day;
    }
  }
  return { get: (day) => byDay.get(day), firstDay, lastDay, size: byDay.size };
}

export type WindowStats = {
  /** Total rain over the window, mm. */
  rain: number;
  /** Wettest single day, mm. */
  rainMax: number;
  /** Mean daily maximum temperature, °C. */
  tmax: number;
  /** Mean daily minimum temperature, °C. */
  tmin: number;
  days: number;
};

/** Weather over days startDay..endDay inclusive, or null when too many days are missing. */
export function windowStats(
  index: WeatherIndex,
  startDay: number,
  endDay: number,
): WindowStats | null {
  const days = endDay - startDay + 1;
  if (days <= 0) return null;
  let rain = 0;
  let rainMax = 0;
  let rainDays = 0;
  let tmaxSum = 0;
  let tmaxDays = 0;
  let tminSum = 0;
  let tminDays = 0;
  for (let day = startDay; day <= endDay; day += 1) {
    const row = index.get(day);
    if (!row) continue;
    if (row.rainMm !== null) {
      rain += row.rainMm;
      rainMax = Math.max(rainMax, row.rainMm);
      rainDays += 1;
    }
    if (row.tmaxC !== null) {
      tmaxSum += row.tmaxC;
      tmaxDays += 1;
    }
    if (row.tminC !== null) {
      tminSum += row.tminC;
      tminDays += 1;
    }
  }
  const enough = (count: number) => count >= Math.max(1, Math.ceil(days * MINIMUM_COVERAGE));
  if (!enough(rainDays) || !enough(tmaxDays) || !enough(tminDays)) return null;
  return { rain, rainMax, tmax: tmaxSum / tmaxDays, tmin: tminSum / tminDays, days };
}

export const PAST_WEATHER_FEATURES = [
  "rain, last 3 days",
  "rain, last 7 days",
  "rain, last 30 days",
  "mean maximum temperature, last 7 days",
  "mean minimum temperature, last 7 days",
  "maximum temperature vs the last 30 days",
] as const;

export const WINDOW_WEATHER_FEATURES = [
  "rain during the forecast days",
  "wettest forecast day",
  "mean maximum temperature during the forecast days",
] as const;

/** Weather already known on `originDay` (uses that day and earlier only). */
export function pastWeatherFeatures(index: WeatherIndex, originDay: number): number[] | null {
  const three = windowStats(index, originDay - 2, originDay);
  const seven = windowStats(index, originDay - 6, originDay);
  const thirty = windowStats(index, originDay - 29, originDay);
  if (!three || !seven || !thirty) return null;
  return [three.rain, seven.rain, thirty.rain, seven.tmax, seven.tmin, seven.tmax - thirty.tmax];
}

export function windowLength(originDay: number, targetDay: number): number {
  return Math.min(MAX_WINDOW_DAYS, Math.max(1, targetDay - originDay));
}

/** Weather between the origin (exclusive) and the target day (inclusive). */
export function windowWeatherFeatures(
  index: WeatherIndex,
  originDay: number,
  targetDay: number,
): number[] | null {
  const stats = windowStats(index, originDay + 1, originDay + windowLength(originDay, targetDay));
  return stats ? [stats.rain, stats.rainMax, stats.tmax] : null;
}

/**
 * A stand-in for the forecast days that uses only weather known on the origin
 * day: the same number of days just before it ("the coming days will be like
 * the last ones"). Used to test the model without giving it the future.
 */
export function persistenceWindowFeatures(
  index: WeatherIndex,
  originDay: number,
  targetDay: number,
): number[] | null {
  const length = windowLength(originDay, targetDay);
  const stats = windowStats(index, originDay - length + 1, originDay);
  return stats ? [stats.rain, stats.rainMax, stats.tmax] : null;
}
