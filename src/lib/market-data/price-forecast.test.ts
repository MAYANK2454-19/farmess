import assert from "node:assert/strict";
import test from "node:test";

import { dailySeries, forecastPrices, MINIMUM_REPORTS, type PricePoint } from "./price-forecast.ts";

function series(count: number, price: (i: number) => number, start = "2026-06-01"): PricePoint[] {
  const base = new Date(`${start}T00:00:00.000Z`).getTime();
  return Array.from({ length: count }, (_, i) => ({
    date: new Date(base + i * 86_400_000).toISOString().slice(0, 10),
    price: price(i),
  }));
}

test("one price per date: median across varieties, invalid rows dropped", () => {
  const out = dailySeries([
    { date: "2026-11-02", price: 1200 },
    { date: "2026-11-01", price: 1000 },
    { date: "2026-11-01", price: 1400 },
    { date: "2026-11-01", price: 1100 },
    { date: "2026-11-03", price: 0 },
    { date: "bad", price: 900 },
  ]);
  assert.deepEqual(out, [
    { date: "2026-11-01", price: 1100 },
    { date: "2026-11-02", price: 1200 },
  ]);
});

test("too little history returns insufficient_history, never a made-up price", () => {
  const result = forecastPrices(
    series(MINIMUM_REPORTS - 1, () => 1000),
    new Date("2026-07-15"),
  );
  assert.equal(result.status, "insufficient_history");
});

test("a steady trend is forecast and beats the persistence baseline", () => {
  const points = series(120, (i) => 1000 + i * 10);
  const now = new Date("2026-09-29T12:00:00Z");
  const result = forecastPrices(points, now);
  assert.equal(result.status, "forecast");
  if (result.status !== "forecast") return;
  assert.ok(result.backtest.modelMae < result.backtest.baselineMae);
  assert.equal(result.points.length, 7);
  assert.equal(result.points[0].date, "2026-09-29");
  assert.ok(
    result.points[0].price > 2190,
    `expected rising forecast, got ${result.points[0].price}`,
  );
  for (const point of result.points)
    assert.ok(point.low <= point.price && point.price <= point.high);
  assert.ok(result.trend.change30dPercent !== null && result.trend.change30dPercent > 0);
});

test("old data is reported as a trend only", () => {
  const points = series(120, (i) => 1000 + i * 10);
  const result = forecastPrices(points, new Date("2027-03-01T00:00:00Z"));
  assert.equal(result.status, "trend_only");
  if (result.status === "trend_only") assert.equal(result.reason, "stale");
});

test("the same saved prices always give the same forecast", () => {
  const a = series(100, (i) => 1500 + 40 * Math.sin(i / 5) + i * 3);
  const now = new Date("2026-09-10T00:00:00Z");
  const first = forecastPrices(a, now);
  const second = forecastPrices(a.slice(), now);
  assert.deepEqual(first, second);
});
