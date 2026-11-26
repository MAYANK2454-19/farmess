/**
 * Short-term mandi price forecast from saved, dated AGMARKNET reports.
 *
 * Model: Holt's damped-trend exponential smoothing on log prices, one step per
 * market report. Smoothing parameters are chosen on the older part of the
 * series only; the most recent reports are kept back for a walk-forward test
 * against the "price stays the same" (persistence) baseline. A forecast is
 * returned only when the model beats that baseline on the held-back reports;
 * otherwise only the observed trend is reported. Nothing here invents prices:
 * with too little history the result says so.
 */

export type PricePoint = { date: string; price: number };

export type ForecastPoint = { date: string; price: number; low: number; high: number };

export type PriceTrend = {
  latestDate: string;
  latestPrice: number;
  reportCount: number;
  firstDate: string;
  /** Average of the last 7 reports vs reports ~30 days earlier, percent. */
  change30dPercent: number | null;
  history: PricePoint[];
};

export type Backtest = {
  testedReports: number;
  horizon: number;
  modelMae: number;
  baselineMae: number;
};

export type PriceForecastResult =
  | { status: "insufficient_history"; reportCount: number; minimumReports: number }
  | {
      status: "trend_only";
      reason: "no_skill" | "stale";
      trend: PriceTrend;
      backtest: Backtest | null;
    }
  | {
      status: "forecast";
      trend: PriceTrend;
      backtest: Backtest;
      model: string;
      points: ForecastPoint[];
    };

export const MINIMUM_REPORTS = 40;
export const FORECAST_HORIZON = 7;
const MAX_BACKTEST_ORIGINS = 30;
const STALE_AFTER_DAYS = 14;
const MS_PER_DAY = 86_400_000;

const ALPHAS = [0.2, 0.35, 0.5, 0.7, 0.9];
const BETAS = [0.02, 0.08, 0.2];
const PHIS = [0.8, 0.9, 0.98];

type Params = { alpha: number; beta: number; phi: number };

function dayNumber(date: string): number {
  return Math.round(new Date(`${date}T00:00:00.000Z`).getTime() / MS_PER_DAY);
}

function isoFromDay(day: number): string {
  return new Date(day * MS_PER_DAY).toISOString().slice(0, 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[index];
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** One price per report date (median across varieties/grades), oldest first. */
export function dailySeries(points: readonly PricePoint[]): PricePoint[] {
  const byDate = new Map<string, number[]>();
  for (const point of points) {
    if (!Number.isFinite(point.price) || point.price <= 0) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(point.date)) continue;
    const list = byDate.get(point.date) ?? [];
    list.push(point.price);
    byDate.set(point.date, list);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, prices]) => ({ date, price: median(prices) }));
}

/** Run the damped Holt filter over `values`; return level/trend after the last value. */
function holtState(values: number[], params: Params) {
  let level = values[0];
  let trend = values.length > 1 ? values[1] - values[0] : 0;
  let oneStepSse = 0;
  for (let i = 1; i < values.length; i += 1) {
    const predicted = level + params.phi * trend;
    const error = values[i] - predicted;
    oneStepSse += error * error;
    const nextLevel = params.alpha * values[i] + (1 - params.alpha) * predicted;
    trend = params.beta * (nextLevel - level) + (1 - params.beta) * params.phi * trend;
    level = nextLevel;
  }
  return { level, trend, oneStepSse };
}

function holtForecast(state: { level: number; trend: number }, phi: number, horizon: number) {
  const out: number[] = [];
  let damp = 0;
  for (let h = 1; h <= horizon; h += 1) {
    damp += phi ** h;
    out.push(state.level + damp * state.trend);
  }
  return out;
}

function chooseParams(values: number[]): Params {
  let best: Params = { alpha: 0.5, beta: 0.08, phi: 0.9 };
  let bestSse = Number.POSITIVE_INFINITY;
  for (const alpha of ALPHAS) {
    for (const beta of BETAS) {
      for (const phi of PHIS) {
        const { oneStepSse } = holtState(values, { alpha, beta, phi });
        if (oneStepSse < bestSse) {
          bestSse = oneStepSse;
          best = { alpha, beta, phi };
        }
      }
    }
  }
  return best;
}

function buildTrend(series: PricePoint[]): PriceTrend {
  const latest = series[series.length - 1];
  const latestDay = dayNumber(latest.date);
  const recent = series.slice(-7).map((point) => point.price);
  const earlier = series
    .filter((point) => {
      const age = latestDay - dayNumber(point.date);
      return age >= 23 && age <= 37;
    })
    .map((point) => point.price);
  const change30dPercent =
    earlier.length > 0 ? ((mean(recent) - mean(earlier)) / mean(earlier)) * 100 : null;
  return {
    latestDate: latest.date,
    latestPrice: latest.price,
    reportCount: series.length,
    firstDate: series[0].date,
    change30dPercent: change30dPercent === null ? null : Math.round(change30dPercent * 10) / 10,
    history: series.slice(-120),
  };
}

export function forecastPrices(
  points: readonly PricePoint[],
  now: Date = new Date(),
): PriceForecastResult {
  const series = dailySeries(points);
  if (series.length < MINIMUM_REPORTS) {
    return {
      status: "insufficient_history",
      reportCount: series.length,
      minimumReports: MINIMUM_REPORTS,
    };
  }

  const trend = buildTrend(series);
  const logs = series.map((point) => Math.log(point.price));
  const n = logs.length;
  const horizon = FORECAST_HORIZON;
  const origins = Math.min(MAX_BACKTEST_ORIGINS, n - horizon - 20);

  // Parameters are fitted only on reports before the held-back test window.
  const testStart = n - horizon - origins;
  const params = chooseParams(logs.slice(0, testStart + 1));

  const modelErrors: number[][] = Array.from({ length: horizon }, () => []);
  const baselineErrors: number[] = [];
  for (let origin = testStart; origin < testStart + origins; origin += 1) {
    const state = holtState(logs.slice(0, origin + 1), params);
    const predicted = holtForecast(state, params.phi, horizon);
    for (let h = 1; h <= horizon; h += 1) {
      const actual = series[origin + h].price;
      modelErrors[h - 1].push(Math.abs(Math.exp(predicted[h - 1]) - actual));
      baselineErrors.push(Math.abs(series[origin].price - actual));
    }
  }
  const backtest: Backtest = {
    testedReports: origins,
    horizon,
    modelMae: Math.round(mean(modelErrors.flat())),
    baselineMae: Math.round(mean(baselineErrors)),
  };

  const staleDays = dayNumber(now.toISOString().slice(0, 10)) - dayNumber(trend.latestDate);
  if (staleDays > STALE_AFTER_DAYS) {
    return { status: "trend_only", reason: "stale", trend, backtest };
  }
  if (!(backtest.modelMae < backtest.baselineMae)) {
    return { status: "trend_only", reason: "no_skill", trend, backtest };
  }

  // Report dates are irregular (holidays, closures); step by the typical gap.
  const gaps = series.slice(1).map((point, i) => dayNumber(point.date) - dayNumber(series[i].date));
  const step = Math.max(1, Math.round(median(gaps.slice(-30))));
  const finalParams = chooseParams(logs);
  const finalForecast = holtForecast(holtState(logs, finalParams), finalParams.phi, horizon);
  const lastDay = dayNumber(trend.latestDate);

  return {
    status: "forecast",
    trend,
    backtest,
    model: "Holt damped trend (log price), walk-forward tested",
    points: finalForecast.map((logPrice, i) => {
      const price = Math.exp(logPrice);
      const band = quantile(modelErrors[i], 0.9);
      return {
        date: isoFromDay(lastDay + step * (i + 1)),
        price: Math.round(price),
        low: Math.max(0, Math.round(price - band)),
        high: Math.round(price + band),
      };
    }),
  };
}
