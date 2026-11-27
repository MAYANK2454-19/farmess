/**
 * Machine-learning price forecast: gradient-boosted regression trees trained
 * on every saved mandi series in the area (all crops and mandis pooled), so the
 * model learns how prices typically move after a given recent pattern.
 *
 * For each forecast step h = 1..7 reports, the model predicts the change in log
 * modal price from the latest report. Features use only reports up to the
 * forecast origin: recent changes (1-10 reports), distance from the 10-report
 * average, recent volatility, season (day of year) and the reporting gap.
 *
 * Honest evaluation, in time order:
 *  1. Settings (tree depth, number of rounds) are chosen on a validation
 *     period using only data before it.
 *  2. The chosen model is retrained on data before the test period and
 *     tested on the target mandi's most recent reports, which it never saw,
 *     against the "price stays the same" baseline.
 *  3. Only if it beats the baseline is a forecast returned; it is then
 *     retrained on all data.
 */

import { fitBooster, mean, MIN_LEAF, predictBooster as predict, quantile } from "./gbm.ts";

export type MlSeries = { key: string; dates: string[]; prices: number[] };

export type MlForecastPoint = { date: string; price: number; low: number; high: number };

export type MlForecastResult =
  | { status: "insufficient_data"; trainingSamples: number; minimumSamples: number }
  | {
      status: "no_skill" | "forecast";
      model: string;
      trainingSamples: number;
      seriesUsed: number;
      backtest: { testedReports: number; horizon: number; modelMae: number; baselineMae: number };
      points: MlForecastPoint[];
    };

export const ML_HORIZON = 7;
export const ML_MINIMUM_SAMPLES = 300;
const MIN_SERIES_REPORTS = 25;
const MIN_TARGET_REPORTS = 40;
const MAX_TEST_ORIGINS = 30;
const FEATURE_WARMUP = 10;
const DEPTHS = [1, 2];
const ROUND_OPTIONS = [40, 120];
const MS_PER_DAY = 86_400_000;

type Sample = { x: number[]; y: number; targetDate: string };

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00.000Z`) / MS_PER_DAY);
}

/** Features at report index t, using reports 0..t only. */
export function mlFeatures(dates: string[], logs: number[], t: number): number[] | null {
  if (t < FEATURE_WARMUP) return null;
  const window = logs.slice(t - 9, t + 1);
  const diffs = window.slice(1).map((value, i) => value - window[i]);
  const average = mean(window);
  const diffMean = mean(diffs);
  const volatility = Math.sqrt(mean(diffs.map((d) => (d - diffMean) ** 2)));
  const date = new Date(`${dates[t]}T00:00:00.000Z`);
  const dayOfYear = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / MS_PER_DAY;
  return [
    logs[t] - logs[t - 1],
    logs[t] - logs[t - 2],
    logs[t] - logs[t - 3],
    logs[t] - logs[t - 5],
    logs[t] - logs[t - 7],
    logs[t] - logs[t - 10],
    logs[t] - average,
    volatility,
    Math.sin((2 * Math.PI * dayOfYear) / 365.25),
    Math.cos((2 * Math.PI * dayOfYear) / 365.25),
    Math.min(14, dayNumber(dates[t]) - dayNumber(dates[t - 1])),
  ];
}

function buildSamples(series: MlSeries[], h: number): Sample[] {
  const samples: Sample[] = [];
  for (const s of series) {
    const logs = s.prices.map((price) => Math.log(price));
    for (let t = FEATURE_WARMUP; t + h < logs.length; t += 1) {
      const x = mlFeatures(s.dates, logs, t);
      if (x) samples.push({ x, y: logs[t + h] - logs[t], targetDate: s.dates[t + h] });
    }
  }
  return samples;
}

// ---------------- evaluation and forecast ----------------

export function mlForecast(target: MlSeries, pool: MlSeries[]): MlForecastResult {
  const horizon = ML_HORIZON;
  const usable = pool.filter((s) => s.prices.length >= MIN_SERIES_REPORTS);
  if (!usable.some((s) => s.key === target.key)) usable.push(target);
  const perHorizon = Array.from({ length: horizon }, (_, i) => buildSamples(usable, i + 1));
  const trainingSamples = perHorizon[0].length;
  const n = target.prices.length;
  if (trainingSamples < ML_MINIMUM_SAMPLES || n < MIN_TARGET_REPORTS) {
    return { status: "insufficient_data", trainingSamples, minimumSamples: ML_MINIMUM_SAMPLES };
  }

  const origins = Math.min(MAX_TEST_ORIGINS, Math.floor((n - horizon - FEATURE_WARMUP) / 2));
  const testStart = n - horizon - origins;
  const validationStart = Math.max(FEATURE_WARMUP, testStart - origins);
  const testCut = target.dates[testStart];
  const validationCut = target.dates[validationStart];
  const logs = target.prices.map((price) => Math.log(price));

  // 1. Choose depth and rounds on the validation period (pooled samples whose
  //    target falls between the two cut dates), training only on earlier data.
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
        for (const sample of valid)
          errors.get(rounds)!.push(Math.abs(predict(booster, sample.x, rounds) - sample.y));
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
  const baselineErrors: number[] = [];
  for (let h = 1; h <= horizon; h += 1) {
    const booster = fitBooster(
      perHorizon[h - 1].filter((s) => s.targetDate <= testCut),
      chosen.depth,
      chosen.rounds,
    );
    for (let origin = testStart; origin < testStart + origins; origin += 1) {
      const x = mlFeatures(target.dates, logs, origin);
      if (!x) continue;
      const actual = target.prices[origin + h];
      modelErrors[h - 1].push(
        Math.abs(target.prices[origin] * Math.exp(predict(booster, x)) - actual),
      );
      baselineErrors.push(Math.abs(target.prices[origin] - actual));
    }
  }
  const backtest = {
    testedReports: origins,
    horizon,
    modelMae: Math.round(mean(modelErrors.flat())),
    baselineMae: Math.round(mean(baselineErrors)),
  };
  const model = `Gradient-boosted trees (depth ${chosen.depth}, ${chosen.rounds} rounds) trained on ${usable.length} mandi series`;
  const base = { model, trainingSamples, seriesUsed: usable.length, backtest };
  if (!(backtest.modelMae < backtest.baselineMae)) {
    return { status: "no_skill", ...base, points: [] };
  }

  // 3. Retrain on everything and forecast from the latest report.
  const lastX = mlFeatures(target.dates, logs, n - 1)!;
  const gaps = target.dates.slice(1).map((d, i) => dayNumber(d) - dayNumber(target.dates[i]));
  const sortedGaps = gaps.slice(-30).sort((a, b) => a - b);
  const step = Math.max(1, sortedGaps[Math.floor(sortedGaps.length / 2)] ?? 1);
  const lastDay = dayNumber(target.dates[n - 1]);
  const latest = target.prices[n - 1];
  const points = Array.from({ length: horizon }, (_, i) => {
    const booster = fitBooster(perHorizon[i], chosen.depth, chosen.rounds);
    const price = latest * Math.exp(predict(booster, lastX));
    const band = quantile(modelErrors[i], 0.9);
    return {
      date: new Date((lastDay + step * (i + 1)) * MS_PER_DAY).toISOString().slice(0, 10),
      price: Math.round(price),
      low: Math.max(0, Math.round(price - band)),
      high: Math.round(price + band),
    };
  });
  return { status: "forecast", ...base, points };
}
