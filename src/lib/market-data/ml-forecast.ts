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
const BINS = 24;
const LEARNING_RATE = 0.05;
const MIN_LEAF = 20;
const DEPTHS = [1, 2];
const ROUND_OPTIONS = [40, 120];
const MS_PER_DAY = 86_400_000;

type Sample = { x: number[]; y: number; targetDate: string };

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00.000Z`) / MS_PER_DAY);
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
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

// ---------------- gradient boosting (histogram-binned regression trees) ----------------

type Tree = { value: number } | { feature: number; bin: number; left: Tree; right: Tree };

type Booster = {
  base: number;
  edges: number[][];
  trees: Tree[];
};

function binEdges(rows: number[][]): number[][] {
  const features = rows[0].length;
  return Array.from({ length: features }, (_, j) => {
    const sorted = rows.map((row) => row[j]).sort((a, b) => a - b);
    const edges: number[] = [];
    for (let b = 1; b < BINS; b += 1) {
      const edge = sorted[Math.floor((b / BINS) * (sorted.length - 1))];
      if (edges.length === 0 || edge > edges[edges.length - 1]) edges.push(edge);
    }
    return edges;
  });
}

function binOf(edges: number[], value: number): number {
  let low = 0;
  let high = edges.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (value <= edges[mid]) high = mid;
    else low = mid + 1;
  }
  return low;
}

function growTree(
  binned: number[][],
  residual: number[],
  index: number[],
  depth: number,
  edges: number[][],
): Tree {
  let total = 0;
  for (const i of index) total += residual[i];
  const value = total / index.length;
  if (depth === 0 || index.length < 2 * MIN_LEAF) return { value };

  let best: { gain: number; feature: number; bin: number } | null = null;
  const baseScore = (total * total) / index.length;
  for (let j = 0; j < edges.length; j += 1) {
    const bins = edges[j].length + 1;
    const sums = new Float64Array(bins);
    const counts = new Int32Array(bins);
    for (const i of index) {
      sums[binned[i][j]] += residual[i];
      counts[binned[i][j]] += 1;
    }
    let leftSum = 0;
    let leftCount = 0;
    for (let b = 0; b < bins - 1; b += 1) {
      leftSum += sums[b];
      leftCount += counts[b];
      const rightCount = index.length - leftCount;
      if (leftCount < MIN_LEAF || rightCount < MIN_LEAF) continue;
      const gain =
        (leftSum * leftSum) / leftCount + (total - leftSum) ** 2 / rightCount - baseScore;
      if (!best || gain > best.gain) best = { gain, feature: j, bin: b };
    }
  }
  if (!best || best.gain <= 0) return { value };
  const left = index.filter((i) => binned[i][best.feature] <= best.bin);
  const right = index.filter((i) => binned[i][best.feature] > best.bin);
  return {
    feature: best.feature,
    bin: best.bin,
    left: growTree(binned, residual, left, depth - 1, edges),
    right: growTree(binned, residual, right, depth - 1, edges),
  };
}

function treeValue(tree: Tree, bins: number[]): number {
  let node = tree;
  while (!("value" in node)) node = bins[node.feature] <= node.bin ? node.left : node.right;
  return node.value;
}

function fitBooster(samples: Sample[], depth: number, rounds: number): Booster {
  const rows = samples.map((sample) => sample.x);
  const edges = binEdges(rows);
  const binned = rows.map((row) => row.map((value, j) => binOf(edges[j], value)));
  const y = samples.map((sample) => sample.y);
  const base = mean(y);
  const prediction = y.map(() => base);
  const index = y.map((_, i) => i);
  const trees: Tree[] = [];
  for (let round = 0; round < rounds; round += 1) {
    const residual = y.map((value, i) => value - prediction[i]);
    const tree = growTree(binned, residual, index, depth, edges);
    trees.push(tree);
    for (let i = 0; i < y.length; i += 1)
      prediction[i] += LEARNING_RATE * treeValue(tree, binned[i]);
  }
  return { base, edges, trees };
}

/** Prediction using the first `rounds` trees (staged, so one fit serves several settings). */
function predict(booster: Booster, x: number[], rounds = booster.trees.length): number {
  const bins = x.map((value, j) => binOf(booster.edges[j], value));
  let out = booster.base;
  for (let r = 0; r < rounds; r += 1) out += LEARNING_RATE * treeValue(booster.trees[r], bins);
  return out;
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
