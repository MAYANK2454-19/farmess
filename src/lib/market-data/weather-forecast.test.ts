import assert from "node:assert/strict";
import test from "node:test";

import { weatherForecast, type WeatherSeries } from "./weather-forecast.ts";
import {
  indexWeather,
  isoFromWeatherDay,
  weatherDayNumber,
  type DailyWeather,
  type WeatherIndex,
} from "../weather/daily.ts";

const START = weatherDayNumber("2026-01-01");
const DAYS = 300;

/** Wet spells of 8 days every `period` days, offset by `phase`. */
function rainOn(day: number, period: number, phase: number): number {
  return (day + phase) % period < 8 ? 12 : 0;
}

function weatherFor(period: number, phase: number, extraDays = 0): DailyWeather[] {
  return Array.from({ length: DAYS + extraDays }, (_, i) => ({
    date: isoFromWeatherDay(START + i),
    rainMm: rainOn(i, period, phase),
    tmaxC: 28 + 4 * Math.sin(i / 20),
    tminC: 15,
  }));
}

/** Price follows rain with a delay: wet days three to seven days ago raise it. */
function series(key: string, period: number, phase: number, driven: boolean): WeatherSeries {
  const dates: string[] = [];
  const prices: number[] = [];
  for (let i = 0; i < DAYS; i += 1) {
    let rain = 0;
    for (let d = i - 7; d <= i - 3; d += 1) if (d >= 0) rain += rainOn(d, period, phase);
    dates.push(isoFromWeatherDay(START + i));
    prices.push(driven ? 1500 * Math.exp(0.004 * rain) : 1500 + (i % 3));
  }
  return { key, dates, prices, weatherKey: key };
}

function world(driven: boolean) {
  const specs = [
    ["a", 23, 0],
    ["b", 29, 5],
    ["c", 31, 11],
    ["d", 26, 17],
    ["e", 34, 3],
    ["f", 21, 9],
  ] as const;
  const pool = specs.map(([key, period, phase]) => series(key, period, phase, driven));
  const weather = new Map<string, WeatherIndex>(
    specs.map(([key, period, phase]) => [key, indexWeather(weatherFor(period, phase))]),
  );
  // Saved weather plus 16 more days standing in for the Open-Meteo forecast.
  const outlook = indexWeather(weatherFor(specs[0][1], specs[0][2], 16));
  return { pool, weather, outlook };
}

test("without saved weather for the mandi's district there is no weather forecast", () => {
  const { pool, weather, outlook } = world(true);
  weather.delete("a");
  const result = weatherForecast({ target: pool[0], pool, weather, outlook });
  assert.equal(result.status, "insufficient_data");
  if (result.status === "insufficient_data") assert.equal(result.reason, "no_weather");
});

test("too few examples are reported, not forecast", () => {
  const { pool, weather, outlook } = world(true);
  const short = {
    ...pool[0],
    dates: pool[0].dates.slice(0, 60),
    prices: pool[0].prices.slice(0, 60),
  };
  const result = weatherForecast({ target: short, pool: [short], weather, outlook });
  assert.equal(result.status, "insufficient_data");
  if (result.status === "insufficient_data") assert.equal(result.reason, "few_samples");
});

test("when rain drives the price, the model learns it and passes the stricter test", () => {
  const { pool, weather, outlook } = world(true);
  const result = weatherForecast({ target: pool[0], pool, weather, outlook });
  assert.equal(result.status, "forecast");
  if (result.status !== "forecast") return;
  assert.ok(result.backtest.modelMae < result.backtest.baselineMae, "beats the baseline");
  assert.ok(
    result.backtest.knownWeatherMae <= result.backtest.modelMae,
    "knowing the real weather of the forecast days can only help",
  );
  assert.ok(result.weatherShare > 0.2, `weather share ${result.weatherShare}`);
  assert.equal(result.points.length, 7);
  assert.equal(result.stepsWithoutForecast, 0);
  for (const point of result.points) {
    assert.ok(point.low <= point.price && point.price <= point.high);
  }
  assert.ok(result.scenarios, "scenarios are available when past periods were rainy");
  if (result.scenarios) {
    assert.ok(result.scenarios.heavy > result.scenarios.dry, "more rain, higher price here");
    assert.equal(result.scenarios.date, result.points[6].date);
  }
});

test("beyond the weather forecast, recent weather is used and counted", () => {
  const { pool, weather } = world(true);
  const result = weatherForecast({ target: pool[0], pool, weather, outlook: null });
  if (result.status === "forecast") assert.equal(result.stepsWithoutForecast, 7);
  else assert.notEqual(result.status, "insufficient_data");
});

test("when prices ignore the weather, the weather gets no credit", () => {
  const { pool, weather, outlook } = world(false);
  const result = weatherForecast({ target: pool[0], pool, weather, outlook });
  assert.notEqual(result.status, "insufficient_data");
  if (result.status === "forecast") {
    // A repeating 3-step pattern is learnable from prices alone; weather must not get the credit.
    assert.ok(result.weatherShare < 0.2, `weather share ${result.weatherShare}`);
  }
});
