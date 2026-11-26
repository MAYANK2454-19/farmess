/**
 * Short-term mandi price forecast from saved, dated AGMARKNET reports.
 *
 * Model: a small family of forecasters on log prices, one step per market
 * report (Holt damped-trend smoothing, simple exponential smoothing and short
 * moving averages). The one with the lowest 7-report error on a validation
 * window is chosen, then tested walk-forward on later, untouched reports
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

const ALPHAS = [0.1, 0.2, 0.35, 0.5, 0.7, 0.9];
const BETAS = [0, 0.02, 0.08, 0.2];
const PHIS = [0.8, 0.9, 0.98];
const AVERAGE_WINDOWS = [3, 5, 7, 10];

type Params = { alpha: number; beta: number; phi: number };
type Candidate = ({ kind: "holt" } & Params) | { kind: "average"; k: number };

/** Holt variants (beta 0 = simple smoothing) and short moving averages. */
const CANDIDATES: Candidate[] = [
  ...ALPHAS.flatMap((alpha) =>
    BETAS.flatMap((beta) =>
      (beta === 0 ? [0.9] : PHIS).map((phi) => ({ kind: "holt" as const, alpha, beta, phi })),
    ),
  ),
  ...AVERAGE_WINDOWS.map((k) => ({ kind: "average" as const, k })),
];

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
  for (let i = 1; i < values.length; i += 1) {
    const predicted = level + params.phi * trend;
    const nextLevel = params.alpha * values[i] + (1 - params.alpha) * predicted;
    trend = params.beta * (nextLevel - level) + (1 - params.beta) * params.phi * trend;
    level = nextLevel;
  }
  return { level, trend };
}

/** Log-price forecasts for the next `horizon` reports using reports 0..origin only. */
function forecastFrom(candidate: Candidate, logs: number[], origin: number, horizon: number) {
  const history = logs.slice(0, origin + 1);
  if (candidate.kind === "average") {
    return Array<number>(horizon).fill(mean(history.slice(-candidate.k)));
  }
  const state = holtState(history, candidate);
  const out: number[] = [];
  let damp = 0;
  for (let h = 1; h <= horizon; h += 1) {
    damp += candidate.phi ** h;
    out.push(state.level + damp * state.trend);
  }
  return out;
}

/** Average absolute error in rupees over all steps from origins [from, to). */
function windowMae(
  candidate: Candidate,
  logs: number[],
  prices: number[],
  from: number,
  to: number,
  horizon: number,
) {
  const errors: number[] = [];
  for (let origin = from; origin < to; origin += 1) {
    const predicted = forecastFrom(candidate, logs, origin, horizon);
    for (let h = 1; h <= horizon; h += 1) {
      errors.push(Math.abs(Math.exp(predicted[h - 1]) - prices[origin + h]));
    }
  }
  return mean(errors);
}

/** Pick the candidate with the lowest multi-step error on origins [from, to). */
function selectCandidate(
  logs: number[],
  prices: number[],
  from: number,
  to: number,
  horizon: number,
) {
  let best = CANDIDATES[0];
  let bestMae = Number.POSITIVE_INFINITY;
  for (const candidate of CANDIDATES) {
    const mae = windowMae(candidate, logs, prices, from, to, horizon);
    if (mae < bestMae) {
      bestMae = mae;
      best = candidate;
    }
  }
  return best;
}

function describe(candidate: Candidate): string {
  if (candidate.kind === "average") return `Average of the last ${candidate.k} reports`;
  return candidate.beta === 0 ? "Exponential smoothing" : "Holt damped-trend smoothing";
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
  const prices = series.map((point) => point.price);
  const logs = prices.map((price) => Math.log(price));
  const n = logs.length;
  const horizon = FORECAST_HORIZON;
  const origins = Math.min(MAX_BACKTEST_ORIGINS, Math.floor((n - horizon - 10) / 2));

  // Time order: choose the model on a validation window, then test it on the
  // later, untouched test window. Every forecast uses only earlier reports.
  const testStart = n - horizon - origins;
  const validationEnd = testStart - horizon;
  const validationStart = Math.max(1, validationEnd - origins);
  const tested = selectCandidate(logs, prices, validationStart, validationEnd, horizon);

  const modelErrors: number[][] = Array.from({ length: horizon }, () => []);
  const baselineErrors: number[] = [];
  for (let origin = testStart; origin < testStart + origins; origin += 1) {
    const predicted = forecastFrom(tested, logs, origin, horizon);
    for (let h = 1; h <= horizon; h += 1) {
      const actual = prices[origin + h];
      modelErrors[h - 1].push(Math.abs(Math.exp(predicted[h - 1]) - actual));
      baselineErrors.push(Math.abs(prices[origin] - actual));
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
  // The published forecast re-selects on the most recent window, then uses all reports.
  const finalEnd = n - 1 - horizon;
  const finalModel = selectCandidate(
    logs,
    prices,
    Math.max(1, finalEnd - origins),
    finalEnd,
    horizon,
  );
  const finalForecast = forecastFrom(finalModel, logs, n - 1, horizon);
  const lastDay = dayNumber(trend.latestDate);

  return {
    status: "forecast",
    trend,
    backtest,
    model: `${describe(finalModel)} on log prices, chosen on a validation window and walk-forward tested`,
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
