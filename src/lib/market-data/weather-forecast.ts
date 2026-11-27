/**
 * Weather-aware price forecast. The same gradient-boosted trees as the plain
 * machine-learning forecast (ml-forecast.ts), trained on every mandi of one
 * crop in the state, with the weather of each mandi's district added:
 *
 *  - weather already seen: rain over the last 3, 7 and 30 days, mean maximum
 *    and minimum temperature over the last week, and how warm the week was
 *    compared with the month;
 *  - weather during the forecast days: total rain, the wettest day and the
 *    mean maximum temperature.
 *
 * Training uses the weather that actually happened in the forecast days, so
 * the model can learn what rain does to a crop's price. Testing is stricter:
 * the model must beat the "price stays the same" baseline on the mandi's
 * latest reports while being given only weather known on the day of the
 * forecast (the previous days stand in for the coming ones). The error with
 * the real weather of those days is reported alongside as the best case.
 *
 * A published forecast uses the Open-Meteo forecast for the coming days, and
 * is repeated for a dry spell and for heavy rain to show how much the weather
 * could move the price. Nothing is shown if the model fails the test.
 */

import { fitBooster, mean, MIN_LEAF, predictBooster, quantile } from "./gbm.ts";
import {
  mlFeatures,
  ML_HORIZON,
  ML_MINIMUM_SAMPLES,
  type MlForecastPoint,
  type MlSeries,
} from "./ml-forecast.ts";
import {
  isoFromWeatherDay,
  PAST_WEATHER_FEATURES,
  pastWeatherFeatures,
  persistenceWindowFeatures,
  weatherDayNumber,
  windowLength,
  windowWeatherFeatures,
  type WeatherIndex,
} from "../weather/daily.ts";

export type WeatherSeries = MlSeries & {
  /** Key of this mandi's district in the weather map. */
  weatherKey: string;
};

export type WeatherScenarios = {
  /** Date of the last forecast step, to which the three prices refer. */
  date: string;
  windowDays: number;
  /** Rain Open-Meteo expects over the forecast days, mm (null when not available). */
  forecastRainMm: number | null;
  /** Rain used for the "heavy rain" case: the wettest tenth of past periods of this length. */
  heavyRainMm: number;
  dry: number;
  asForecast: number;
  heavy: number;
};

export type WeatherForecastResult =
  | {
      status: "insufficient_data";
      reason: "no_weather" | "few_samples";
      trainingSamples: number;
      minimumSamples: number;
    }
  | {
      status: "no_skill" | "forecast";
      model: string;
      trainingSamples: number;
      seriesUsed: number;
      backtest: {
        testedReports: number;
        horizon: number;
        /** Error when given only weather known on the forecast day (decides whether it is shown). */
        modelMae: number;
        baselineMae: number;
        /** Error when given the real weather of the forecast days (best case). */
        knownWeatherMae: number;
      };
      /** Share (0-1) of the model's learning that came from weather inputs. */
      weatherShare: number;
      points: MlForecastPoint[];
      /** Forecast steps beyond the weather forecast, where recent weather was used instead. */
      stepsWithoutForecast: number;
      scenarios: WeatherScenarios | null;
    };

const MIN_SERIES_REPORTS = 25;
const MIN_TARGET_REPORTS = 40;
const MAX_TEST_ORIGINS = 30;
const FEATURE_WARMUP = 10;
const DEPTHS = [1, 2];
const ROUND_OPTIONS = [40, 120];
const PRICE_FEATURE_COUNT = 11;
const PAST_COUNT = PAST_WEATHER_FEATURES.length;
/** Scenarios are shown only if past rainy periods reached at least this much rain. */
const MINIMUM_HEAVY_RAIN_MM = 10;

type Sample = {
  /** Price inputs, weather seen so far, and the real weather of the forecast days. */
  x: number[];
  /** Same, but the forecast days are replaced by weather known on the origin day. */
  xKnownOnly: number[];
  y: number;
  targetDate: string;
};

/** Inputs at report index t of a series for the report at index t + h. */
function sampleAt(
  dates: string[],
  logs: number[],
  weather: WeatherIndex,
  t: number,
  targetDay: number,
): { x: number[]; xKnownOnly: number[] } | null {
  const price = mlFeatures(dates, logs, t);
  if (!price) return null;
  const originDay = weatherDayNumber(dates[t]);
  const past = pastWeatherFeatures(weather, originDay);
  const ahead = windowWeatherFeatures(weather, originDay, targetDay);
  const standIn = persistenceWindowFeatures(weather, originDay, targetDay);
  if (!past || !ahead || !standIn) return null;
  return { x: [...price, ...past, ...ahead], xKnownOnly: [...price, ...past, ...standIn] };
}

function buildSamples(
  series: WeatherSeries[],
  weather: Map<string, WeatherIndex>,
  h: number,
): Sample[] {
  const samples: Sample[] = [];
  for (const s of series) {
    const index = weather.get(s.weatherKey);
    if (!index) continue;
    const logs = s.prices.map((price) => Math.log(price));
    for (let t = FEATURE_WARMUP; t + h < logs.length; t += 1) {
      const inputs = sampleAt(s.dates, logs, index, t, weatherDayNumber(s.dates[t + h]));
      if (inputs) samples.push({ ...inputs, y: logs[t + h] - logs[t], targetDate: s.dates[t + h] });
    }
  }
  return samples;
}

export function weatherForecast(input: {
  target: WeatherSeries;
  /** Every mandi series of the same crop in the state (the target may be included). */
  pool: WeatherSeries[];
  /** Saved weather by district key. */
  weather: Map<string, WeatherIndex>;
  /** Saved weather plus the Open-Meteo forecast for the target's district, if available. */
  outlook: WeatherIndex | null;
}): WeatherForecastResult {
  const { target, weather } = input;
  const horizon = ML_HORIZON;
  const targetWeather = weather.get(target.weatherKey);
  if (!targetWeather) {
    return {
      status: "insufficient_data",
      reason: "no_weather",
      trainingSamples: 0,
      minimumSamples: ML_MINIMUM_SAMPLES,
    };
  }

  const usable = input.pool.filter(
    (s) => s.prices.length >= MIN_SERIES_REPORTS && weather.has(s.weatherKey),
  );
  if (!usable.some((s) => s.key === target.key)) usable.push(target);
  const perHorizon = Array.from({ length: horizon }, (_, i) =>
    buildSamples(usable, weather, i + 1),
  );
  const trainingSamples = perHorizon[0].length;
  const n = target.prices.length;
  if (trainingSamples < ML_MINIMUM_SAMPLES || n < MIN_TARGET_REPORTS) {
    return {
      status: "insufficient_data",
      reason: "few_samples",
      trainingSamples,
      minimumSamples: ML_MINIMUM_SAMPLES,
    };
  }

  const origins = Math.min(MAX_TEST_ORIGINS, Math.floor((n - horizon - FEATURE_WARMUP) / 2));
  const testStart = n - horizon - origins;
  const validationStart = Math.max(FEATURE_WARMUP, testStart - origins);
  const testCut = target.dates[testStart];
  const validationCut = target.dates[validationStart];
  const logs = target.prices.map((price) => Math.log(price));

  // 1. Choose depth and rounds on the validation period, scoring the model the
  //    way it will be judged: without the real weather of the forecast days.
  let chosen = { depth: DEPTHS[0], rounds: ROUND_OPTIONS[0] };
  let bestError = Number.POSITIVE_INFINITY;
  for (const depth of DEPTHS) {
    const errors = new Map<number, number[]>(ROUND_OPTIONS.map((r) => [r, []]));
    for (let h = 0; h < horizon; h += 1) {
      const train = perHorizon[h].filter((s) => s.targetDate <= validationCut);
      const valid = perHorizon[h].filter(
        (s) => s.targetDate > validationCut && s.targetDate <= testCut,
      );
      if (train.length < MIN_LEAF * 4 || valid.length === 0) continue;
      const booster = fitBooster(train, depth, Math.max(...ROUND_OPTIONS));
      for (const rounds of ROUND_OPTIONS) {
        for (const sample of valid) {
          errors
            .get(rounds)!
            .push(Math.abs(predictBooster(booster, sample.xKnownOnly, rounds) - sample.y));
        }
      }
    }
    for (const rounds of ROUND_OPTIONS) {
      const list = errors.get(rounds)!;
      if (list.length && mean(list) < bestError) {
        bestError = mean(list);
        chosen = { depth, rounds };
      }
    }
  }

  // 2. Test on the target mandi's latest reports, unseen in training.
  const modelErrors: number[][] = Array.from({ length: horizon }, () => []);
  const knownErrors: number[] = [];
  const baselineErrors: number[] = [];
  for (let h = 1; h <= horizon; h += 1) {
    const train = perHorizon[h - 1].filter((s) => s.targetDate <= testCut);
    if (train.length < MIN_LEAF * 4) continue;
    const booster = fitBooster(train, chosen.depth, chosen.rounds);
    for (let origin = testStart; origin < testStart + origins; origin += 1) {
      const inputs = sampleAt(
        target.dates,
        logs,
        targetWeather,
        origin,
        weatherDayNumber(target.dates[origin + h]),
      );
      if (!inputs) continue;
      const actual = target.prices[origin + h];
      const from = target.prices[origin];
      modelErrors[h - 1].push(
        Math.abs(from * Math.exp(predictBooster(booster, inputs.xKnownOnly)) - actual),
      );
      knownErrors.push(Math.abs(from * Math.exp(predictBooster(booster, inputs.x)) - actual));
      baselineErrors.push(Math.abs(from - actual));
    }
  }
  if (modelErrors.some((list) => list.length === 0)) {
    return {
      status: "insufficient_data",
      reason: "few_samples",
      trainingSamples,
      minimumSamples: ML_MINIMUM_SAMPLES,
    };
  }
  const backtest = {
    testedReports: origins,
    horizon,
    modelMae: Math.round(mean(modelErrors.flat())),
    baselineMae: Math.round(mean(baselineErrors)),
    knownWeatherMae: Math.round(mean(knownErrors)),
  };
  const model = `Gradient-boosted trees with district weather (depth ${chosen.depth}, ${chosen.rounds} rounds) trained on ${usable.length} mandi series of this crop`;
  const base = { model, trainingSamples, seriesUsed: usable.length, backtest };
  if (!(backtest.modelMae < backtest.baselineMae)) {
    return {
      status: "no_skill",
      ...base,
      weatherShare: 0,
      points: [],
      stepsWithoutForecast: 0,
      scenarios: null,
    };
  }

  // 3. Retrain on everything and forecast from the latest report with the
  //    Open-Meteo forecast for the coming days.
  const liveWeather = input.outlook ?? targetWeather;
  const price = mlFeatures(target.dates, logs, n - 1)!;
  const lastDay = weatherDayNumber(target.dates[n - 1]);
  const past =
    pastWeatherFeatures(liveWeather, lastDay) ?? pastWeatherFeatures(targetWeather, lastDay);
  if (!past) {
    return {
      status: "insufficient_data",
      reason: "no_weather",
      trainingSamples,
      minimumSamples: ML_MINIMUM_SAMPLES,
    };
  }
  const gaps = target.dates
    .slice(1)
    .map((d, i) => weatherDayNumber(d) - weatherDayNumber(target.dates[i]));
  const sortedGaps = gaps.slice(-30).sort((a, b) => a - b);
  const step = Math.max(1, sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 1);
  const latest = target.prices[n - 1];

  let stepsWithoutForecast = 0;
  let weatherGain = 0;
  let totalGain = 0;
  let scenarios: WeatherScenarios | null = null;
  const points: MlForecastPoint[] = [];
  for (let i = 0; i < horizon; i += 1) {
    const booster = fitBooster(perHorizon[i], chosen.depth, chosen.rounds);
    booster.gains.forEach((gain, feature) => {
      totalGain += gain;
      if (feature >= PRICE_FEATURE_COUNT) weatherGain += gain;
    });
    const targetDay = lastDay + step * (i + 1);
    const forecastDays = windowWeatherFeatures(liveWeather, lastDay, targetDay);
    const ahead =
      forecastDays ??
      persistenceWindowFeatures(liveWeather, lastDay, targetDay) ??
      persistenceWindowFeatures(targetWeather, lastDay, targetDay);
    if (!ahead) {
      return {
        status: "insufficient_data",
        reason: "no_weather",
        trainingSamples,
        minimumSamples: ML_MINIMUM_SAMPLES,
      };
    }
    if (!forecastDays) stepsWithoutForecast += 1;
    const predicted = (window: number[]) =>
      latest * Math.exp(predictBooster(booster, [...price, ...past, ...window]));
    const value = predicted(ahead);
    const band = quantile(modelErrors[i], 0.9);
    points.push({
      date: isoFromWeatherDay(targetDay),
      price: Math.round(value),
      low: Math.max(0, Math.round(value - band)),
      high: Math.round(value + band),
    });

    if (i === horizon - 1) {
      // What rain could do: the same forecast for a dry spell and for a spell as
      // wet as the wettest tenth of past periods of this length.
      const rainIndex = PRICE_FEATURE_COUNT + PAST_COUNT;
      const heavyRain = quantile(
        perHorizon[i].map((s) => s.x[rainIndex]),
        0.9,
      );
      const heavyDay = quantile(
        perHorizon[i].map((s) => s.x[rainIndex + 1]),
        0.9,
      );
      if (heavyRain >= MINIMUM_HEAVY_RAIN_MM) {
        scenarios = {
          date: isoFromWeatherDay(targetDay),
          windowDays: windowLength(lastDay, targetDay),
          forecastRainMm: forecastDays ? Math.round(forecastDays[0] * 10) / 10 : null,
          heavyRainMm: Math.round(heavyRain),
          dry: Math.round(predicted([0, 0, ahead[2]])),
          asForecast: Math.round(value),
          heavy: Math.round(predicted([heavyRain, heavyDay, ahead[2]])),
        };
      }
    }
  }

  return {
    status: "forecast",
    ...base,
    weatherShare: totalGain > 0 ? Math.round((weatherGain / totalGain) * 100) / 100 : 0,
    points,
    stepsWithoutForecast,
    scenarios,
  };
}
