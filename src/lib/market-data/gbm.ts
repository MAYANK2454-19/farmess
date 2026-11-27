/**
 * Gradient-boosted regression trees with histogram binning (squared error).
 * Small, dependency-free and deterministic, so it runs inside a request and
 * gives the same answer every time for the same data. Used by the price
 * forecasts (ml-forecast.ts, weather-forecast.ts).
 */

const BINS = 24;
const LEARNING_RATE = 0.05;
export const MIN_LEAF = 20;

export type Tree = { value: number } | { feature: number; bin: number; left: Tree; right: Tree };

export type Booster = {
  base: number;
  edges: number[][];
  trees: Tree[];
  /** Total error reduction credited to each feature across all splits. */
  gains: number[];
};

export function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
}

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
  gains: number[],
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
  gains[best.feature] += best.gain;
  const split = best;
  const left = index.filter((i) => binned[i][split.feature] <= split.bin);
  const right = index.filter((i) => binned[i][split.feature] > split.bin);
  return {
    feature: split.feature,
    bin: split.bin,
    left: growTree(binned, residual, left, depth - 1, edges, gains),
    right: growTree(binned, residual, right, depth - 1, edges, gains),
  };
}

function treeValue(tree: Tree, bins: number[]): number {
  let node = tree;
  while (!("value" in node)) node = bins[node.feature] <= node.bin ? node.left : node.right;
  return node.value;
}

export function fitBooster(
  samples: readonly { x: number[]; y: number }[],
  depth: number,
  rounds: number,
): Booster {
  const rows = samples.map((sample) => sample.x);
  const edges = binEdges(rows);
  const binned = rows.map((row) => row.map((value, j) => binOf(edges[j], value)));
  const y = samples.map((sample) => sample.y);
  const base = mean(y);
  const prediction = y.map(() => base);
  const index = y.map((_, i) => i);
  const trees: Tree[] = [];
  const gains = edges.map(() => 0);
  for (let round = 0; round < rounds; round += 1) {
    const residual = y.map((value, i) => value - prediction[i]);
    const tree = growTree(binned, residual, index, depth, edges, gains);
    trees.push(tree);
    for (let i = 0; i < y.length; i += 1)
      prediction[i] += LEARNING_RATE * treeValue(tree, binned[i]);
  }
  return { base, edges, trees, gains };
}

/** Prediction using the first `rounds` trees (staged, so one fit serves several settings). */
export function predictBooster(
  booster: Booster,
  x: number[],
  rounds = booster.trees.length,
): number {
  const bins = x.map((value, j) => binOf(booster.edges[j], value));
  let out = booster.base;
  for (let r = 0; r < rounds; r += 1) out += LEARNING_RATE * treeValue(booster.trees[r], bins);
  return out;
}
