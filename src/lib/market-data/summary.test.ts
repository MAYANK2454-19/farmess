import assert from "node:assert/strict";
import test from "node:test";

import { summarizeMarketPriceRecords } from "./summary.ts";
import type { MarketPriceRecord } from "./types.ts";

function record(
  id: string,
  market: string,
  modalPrice: string | null,
  valueType: MarketPriceRecord["valueType"] = "reported",
): MarketPriceRecord {
  return {
    id,
    commodity: "Wheat",
    variety: null,
    state: "Rajasthan",
    district: "Jaipur",
    market,
    minPrice: null,
    maxPrice: null,
    modalPrice,
    currency: "INR",
    priceUnit: "INR/quintal",
    sourcePriceUnit: "Quintal",
    observationDate: "2026-11-23",
    retrievedAt: "2026-11-24T10:00:00.000Z",
    sourceName: "OGD India",
    sourceUrl: "https://data.gov.in/",
    valueType,
  };
}

test("summarizes reported modal prices and unique markets", () => {
  const summary = summarizeMarketPriceRecords([
    record("one", "Jaipur", "2000"),
    record("two", "Jaipur", "2400"),
    record("three", "Kishangarh", "2800"),
  ]);

  assert.deepEqual(summary, {
    observationCount: 3,
    reportedPriceCount: 3,
    marketCount: 2,
    averageModalPrice: 2400,
    lowestModalPrice: 2000,
    highestModalPrice: 2800,
  });
});

test("normalizes market names when counting distinct markets", () => {
  const summary = summarizeMarketPriceRecords([
    record("one", " Jaipur  ", "2000"),
    record("two", "jaipur", "2200"),
  ]);

  assert.equal(summary.marketCount, 1);
});

test("ignores missing, invalid and negative modal prices", () => {
  const summary = summarizeMarketPriceRecords([
    record("one", "Jaipur", null),
    record("two", "Kota", "not-a-price"),
    record("three", "Ajmer", "-50"),
  ]);

  assert.equal(summary.observationCount, 3);
  assert.equal(summary.reportedPriceCount, 0);
  assert.equal(summary.averageModalPrice, null);
  assert.equal(summary.lowestModalPrice, null);
  assert.equal(summary.highestModalPrice, null);
});

test("excludes demo prices from reported price metrics", () => {
  const summary = summarizeMarketPriceRecords([
    record("reported", "Jaipur", "2100"),
    record("demo", "Kota", "9900", "demo"),
  ]);

  assert.equal(summary.observationCount, 2);
  assert.equal(summary.reportedPriceCount, 1);
  assert.equal(summary.marketCount, 1);
  assert.equal(summary.averageModalPrice, 2100);
});

test("returns a zeroed summary for an empty result set", () => {
  assert.deepEqual(summarizeMarketPriceRecords([]), {
    observationCount: 0,
    reportedPriceCount: 0,
    marketCount: 0,
    averageModalPrice: null,
    lowestModalPrice: null,
    highestModalPrice: null,
  });
});
