import assert from "node:assert/strict";
import test from "node:test";

import { mlFeatures, mlForecast, ML_MINIMUM_SAMPLES, type MlSeries } from "./ml-forecast.ts";

function makeSeries(key: string, count: number, price: (i: number) => number): MlSeries {
  const start = Date.UTC(2026, 0, 1);
  return {
    key,
    dates: Array.from({ length: count }, (_, i) =>
      new Date(start + i * 86_400_000).toISOString().slice(0, 10),
    ),
    prices: Array.from({ length: count }, (_, i) => price(i)),
  };
}

test("features use only reports up to the origin", () => {
  const s = makeSeries("a", 30, (i) => 1000 + i);
  const logs = s.prices.map(Math.log);
  const before = mlFeatures(s.dates, logs, 20);
  const changedFuture = logs.map((v, i) => (i > 20 ? v * 2 : v));
  assert.deepEqual(mlFeatures(s.dates, changedFuture, 20), before);
  assert.equal(mlFeatures(s.dates, logs, 5), null);
});

test("too little pooled data returns insufficient_data", () => {
  const target = makeSeries("a", 60, (i) => 1000 + i);
  const result = mlForecast(target, [target]);
  assert.equal(result.status, "insufficient_data");
  if (result.status === "insufficient_data")
    assert.equal(result.minimumSamples, ML_MINIMUM_SAMPLES);
});

test("a learnable repeating pattern is forecast and beats the baseline", () => {
  const cycle = (phase: number) => (i: number) => 1500 * Math.exp(0.15 * Math.sin((i + phase) / 2));
  const pool = [0, 1, 2, 3, 4, 5].map((p) => makeSeries(`s${p}`, 140, cycle(p * 1.7)));
  const result = mlForecast(pool[0], pool);
  assert.equal(result.status, "forecast");
  if (result.status !== "forecast") return;
  assert.ok(result.backtest.modelMae < result.backtest.baselineMae);
  assert.equal(result.points.length, 7);
  for (const point of result.points)
    assert.ok(point.low <= point.price && point.price <= point.high);
});

test("random price walks pool enough samples to be evaluated", () => {
  let seed = 7;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const walk = (key: string) => {
    let level = 1500;
    return makeSeries(key, 140, () => (level *= Math.exp((rand() - 0.5) * 0.1)));
  };
  const pool = ["a", "b", "c", "d", "e"].map(walk);
  const result = mlForecast(pool[0], pool);
  assert.notEqual(result.status, "insufficient_data");
  if (result.status !== "insufficient_data")
    assert.ok(result.trainingSamples >= ML_MINIMUM_SAMPLES);
});
