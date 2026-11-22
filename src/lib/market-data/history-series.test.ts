import assert from "node:assert/strict";
import test from "node:test";

import type { MarketPriceRecord } from "./types.ts";
import { buildMarketHistorySeries } from "./history-series.ts";

function record(overrides: Partial<MarketPriceRecord> = {}): MarketPriceRecord {
  return {
    id: "record-1",
    commodity: "Tomato",
    variety: "Hybrid",
    state: "Jammu and Kashmir",
    district: "Jammu",
    market: "Narwal",
    minPrice: "1800.00",
    maxPrice: "2200.00",
    modalPrice: "2000.00",
    currency: "INR",
    priceUnit: "INR/quintal",
    sourcePriceUnit: "INR/quintal",
    observationDate: "2026-11-20",
    retrievedAt: "2026-11-22T09:00:00.000Z",
    sourceName: "OGD India / AGMARKNET",
    sourceUrl: "https://data.gov.in/resource/example",
    valueType: "reported",
    ...overrides,
  };
}

test("sorts observations chronologically and preserves price provenance", () => {
  const result = buildMarketHistorySeries([
    record({ id: "later", observationDate: "2026-11-22", modalPrice: "2100" }),
    record({ id: "earlier", observationDate: "2026-11-20", modalPrice: "2000" }),
  ]);

  assert.equal(result.status, "available");
  assert.equal(result.series.length, 1);
  assert.deepEqual(
    result.series[0].points.map((point) => point.observationDate),
    ["2026-11-20", "2026-11-22"],
  );
  assert.equal(result.series[0].points[0].modalPrice, "2000.00");
  assert.equal(result.series[0].points[0].sourceName, "OGD India / AGMARKNET");
  assert.equal(result.series[0].points[0].sourceUrl, "https://data.gov.in/resource/example");
  assert.equal(result.series[0].points[0].valueType, "reported");
});

test("describes missing dates as gaps and does not fabricate history points", () => {
  const result = buildMarketHistorySeries([
    record({ id: "day-one", observationDate: "2026-11-20" }),
    record({ id: "day-four", observationDate: "2026-11-23" }),
  ]);
  const series = result.series[0];

  assert.equal(series.points.length, 2);
  assert.deepEqual(series.gaps, [
    {
      fromDate: "2026-11-21",
      toDate: "2026-11-22",
      missingDays: 2,
    },
  ]);
});

test("keeps different crops, varieties and markets in separate series", () => {
  const result = buildMarketHistorySeries([
    record({ id: "tomato", observationDate: "2026-11-20" }),
    record({
      id: "potato",
      commodity: "Potato",
      observationDate: "2026-11-20",
    }),
    record({
      id: "other-market",
      market: "Akhnoor",
      observationDate: "2026-11-20",
    }),
    record({
      id: "other-variety",
      variety: "Desi",
      observationDate: "2026-11-20",
    }),
  ]);

  assert.equal(result.series.length, 4);
});

test("keeps reported observations separate from demo data", () => {
  const result = buildMarketHistorySeries([
    record({ id: "reported", valueType: "reported" }),
    record({ id: "demo", valueType: "demo" }),
  ]);

  assert.equal(result.series.length, 2);
  assert.deepEqual(
    result.series.map((item) => item.valueType).sort(),
    ["demo", "reported"],
  );
});

test("does not require modal price when a valid min/max range is available", () => {
  const result = buildMarketHistorySeries([
    record({ minPrice: "1000", maxPrice: "1200", modalPrice: null }),
  ]);

  assert.equal(result.status, "insufficient_history");
  assert.equal(result.series[0].points[0].modalPrice, null);
  assert.equal(result.series[0].points[0].minPrice, "1000.00");
  assert.equal(result.series[0].points[0].maxPrice, "1200.00");
});

test("rejects records with invalid dates, retrieval timestamps or price values", () => {
  const result = buildMarketHistorySeries([
    record({ id: "bad-date", observationDate: "2026-02-30" }),
    record({ id: "bad-retrieval", retrievedAt: "not-a-date" }),
    record({ id: "bad-price", modalPrice: "2,000.00" }),
  ]);

  assert.equal(result.status, "no_data");
  assert.equal(result.series.length, 0);
  assert.equal(result.rejectedRecords.length, 3);
});

test("rejects inconsistent price ranges and records with no price values", () => {
  const result = buildMarketHistorySeries([
    record({ id: "range", minPrice: "2500", maxPrice: "1500", modalPrice: "2000" }),
    record({ id: "empty", minPrice: null, maxPrice: null, modalPrice: null }),
  ]);

  assert.equal(result.status, "no_data");
  assert.equal(result.rejectedRecords.length, 2);
});

test("rejects unsupported currency and price units", () => {
  const result = buildMarketHistorySeries([
    record({ id: "usd", currency: "USD" as "INR" }),
    record({ id: "per-kg", priceUnit: "INR/kg" as "INR/quintal" }),
  ]);

  assert.equal(result.status, "no_data");
  assert.equal(result.rejectedRecords.length, 2);
});

test("does not create a date gap between observations on the same day", () => {
  const result = buildMarketHistorySeries([
    record({ id: "morning", observationDate: "2026-11-20", retrievedAt: "2026-11-20T08:00:00Z" }),
    record({ id: "evening", observationDate: "2026-11-20", retrievedAt: "2026-11-20T17:00:00Z" }),
    record({ id: "next-day", observationDate: "2026-11-21" }),
  ]);

  assert.equal(result.series[0].observationCount, 3);
  assert.equal(result.series[0].uniqueObservationDateCount, 2);
  assert.deepEqual(result.series[0].gaps, []);
});

test("deduplicates repeated record IDs by keeping the latest retrieval", () => {
  const result = buildMarketHistorySeries([
    record({
      id: "duplicate",
      modalPrice: "1900",
      retrievedAt: "2026-11-21T09:00:00Z",
    }),
    record({
      id: "duplicate",
      modalPrice: "2050",
      retrievedAt: "2026-11-22T09:00:00Z",
    }),
  ]);

  assert.equal(result.series[0].observationCount, 1);
  assert.equal(result.series[0].points[0].modalPrice, "2050.00");
  assert.equal(result.discardedDuplicateCount, 1);
});

test("retains a single observation without presenting a trend", () => {
  const result = buildMarketHistorySeries([record()]);

  assert.equal(result.status, "insufficient_history");
  assert.equal(result.series[0].status, "single_observation");
  assert.equal(result.series[0].gaps.length, 0);
});

test("normalizes grouping keys without mixing different sources", () => {
  const result = buildMarketHistorySeries([
    record({ id: "normal", commodity: " Tomato " }),
    record({ id: "different-source", sourceName: "Other source" }),
    record({ id: "different-url", sourceUrl: "https://example.com/other" }),
  ]);

  assert.equal(result.series.length, 3);
});

test("returns a no-data state for an empty input", () => {
  assert.deepEqual(buildMarketHistorySeries([]), {
    status: "no_data",
    series: [],
    rejectedRecords: [],
    discardedDuplicateCount: 0,
  });
});
