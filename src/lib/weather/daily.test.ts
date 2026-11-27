import assert from "node:assert/strict";
import test from "node:test";

import {
  indexWeather,
  isoFromWeatherDay,
  parseOpenMeteoDaily,
  pastWeatherFeatures,
  persistenceWindowFeatures,
  weatherDayNumber,
  windowStats,
  windowWeatherFeatures,
  type DailyWeather,
} from "./daily.ts";

function days(start: string, count: number, rain: (i: number) => number): DailyWeather[] {
  const first = weatherDayNumber(start);
  return Array.from({ length: count }, (_, i) => ({
    date: isoFromWeatherDay(first + i),
    rainMm: rain(i),
    tmaxC: 30 + (i % 5),
    tminC: 18,
  }));
}

test("Open-Meteo daily arrays become validated rows", () => {
  const rows = parseOpenMeteoDaily({
    daily: {
      time: ["2026-11-20", "2026-11-21", "bad", "2026-11-23"],
      precipitation_sum: [1.5, null, 3, -4],
      temperature_2m_max: [24.1, 25, 26, 999],
      temperature_2m_min: [11, 12, 13, 9],
    },
  });
  assert.deepEqual(rows, [
    { date: "2026-11-20", rainMm: 1.5, tmaxC: 24.1, tminC: 11 },
    { date: "2026-11-21", rainMm: null, tmaxC: 25, tminC: 12 },
    { date: "2026-11-23", rainMm: null, tmaxC: null, tminC: 9 },
  ]);
  assert.deepEqual(parseOpenMeteoDaily({}), []);
  assert.deepEqual(parseOpenMeteoDaily(null), []);
});

test("window totals, wettest day and mean temperatures", () => {
  const index = indexWeather(days("2026-01-01", 10, (i) => i));
  const first = weatherDayNumber("2026-01-01");
  const stats = windowStats(index, first + 2, first + 4);
  assert.deepEqual(stats && [stats.rain, stats.rainMax, stats.days], [9, 4, 3]);
  assert.equal(stats?.tmin, 18);
  assert.equal(windowStats(index, first + 8, first + 20), null, "mostly missing days");
});

test("later lists override earlier ones (forecast over saved history)", () => {
  const saved = days("2026-01-01", 5, () => 0);
  const outlook = [{ date: "2026-01-05", rainMm: 40, tmaxC: 20, tminC: 10 }];
  const index = indexWeather(saved, outlook);
  assert.equal(index.get(weatherDayNumber("2026-01-05"))?.rainMm, 40);
  assert.equal(index.size, 5);
});

test("inputs known on the forecast day ignore later weather; forecast-day inputs do not", () => {
  const origin = weatherDayNumber("2026-03-01");
  const calm = indexWeather(days("2026-01-01", 90, () => 1));
  const stormAfter = indexWeather(
    days("2026-01-01", 90, (i) => (weatherDayNumber("2026-01-01") + i > origin ? 50 : 1)),
  );
  assert.deepEqual(pastWeatherFeatures(calm, origin), pastWeatherFeatures(stormAfter, origin));
  assert.deepEqual(
    persistenceWindowFeatures(calm, origin, origin + 7),
    persistenceWindowFeatures(stormAfter, origin, origin + 7),
  );
  assert.deepEqual(windowWeatherFeatures(calm, origin, origin + 7)?.slice(0, 2), [7, 1]);
  assert.deepEqual(windowWeatherFeatures(stormAfter, origin, origin + 7)?.slice(0, 2), [350, 50]);
  assert.deepEqual(pastWeatherFeatures(calm, origin)?.slice(0, 3), [3, 7, 30]);
});

test("missing history gives no inputs rather than guessed ones", () => {
  const index = indexWeather(days("2026-03-01", 5, () => 1));
  assert.equal(pastWeatherFeatures(index, weatherDayNumber("2026-03-05")), null);
});
