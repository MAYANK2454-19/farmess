import assert from "node:assert/strict";
import test from "node:test";

import { buildMarketPriceComparisons } from "./market-comparison.ts";
import type { MarketPriceRecord } from "./types.ts";

function record(
  id: string,
  market: string,
  modalPrice: string | null,
  overrides: Partial<MarketPriceRecord> = {},
): MarketPriceRecord {
  return {
    id,
    commodity: "Wheat",
    variety: "Sharbati",
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
    valueType: "reported",
    ...overrides,
  };
}

test("compares mandis only for the same commodity, variety and observation date", () => {
  const comparisons = buildMarketPriceComparisons([
    record("one", "Jaipur", "2200"),
    record("two", "Kota", "2400"),
    record("three", "Jaipur", "2600", { observationDate: "2026-11-22" }),
    record("four", "Ajmer", "2500", { variety: "Durum" }),
    record("five", "Udaipur", "2700", { commodity: "Mustard" }),
  ]);

  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0].markets.length, 2);
  assert.equal(comparisons[0].priceSpread, 200);
});

test("averages repeated records for one mandi before comparing markets", () => {
  const comparisons = buildMarketPriceComparisons([
    record("one", "Jaipur", "2000"),
    record("two", "JAIPUR", "2400", { district: " Jaipur " }),
    record("three", "Kota", "2500", { district: "Kota" }),
  ]);

  assert.equal(comparisons.length, 1);
  assert.equal(comparisons[0].markets.length, 2);
  assert.equal(comparisons[0].markets[0].averageModalPrice, 2200);
  assert.equal(comparisons[0].markets[0].observationCount, 2);
});

test("excludes demo, missing, invalid, negative and invalid-date observations", () => {
  const comparisons = buildMarketPriceComparisons([
    record("one", "Jaipur", "2000"),
    record("two", "Kota", "2500", { valueType: "demo" }),
    record("three", "Ajmer", null),
    record("four", "Bikaner", "not-a-number"),
    record("five", "Jodhpur", "-1"),
    record("six", "Udaipur", "2300", { observationDate: "2026-02-30" }),
  ]);

  assert.deepEqual(comparisons, []);
});

test("does not compare a single mandi against itself", () => {
  assert.deepEqual(
    buildMarketPriceComparisons([
      record("one", "Jaipur", "2000"),
      record("two", "Jaipur", "2100"),
    ]),
    [],
  );
});

test("handles a zero lowest price without an infinite percentage", () => {
  const [comparison] = buildMarketPriceComparisons([
    record("one", "Jaipur", "0"),
    record("two", "Kota", "1000"),
  ]);

  assert.equal(comparison.priceSpread, 1000);
  assert.equal(comparison.spreadPercent, null);
});

test("sorts comparable mandi rows from lower to higher average price", () => {
  const [comparison] = buildMarketPriceComparisons([
    record("one", "Jaipur", "2800"),
    record("two", "Kota", "2200"),
    record("three", "Ajmer", "2500"),
  ]);

  assert.deepEqual(
    comparison.markets.map((market) => market.market),
    ["Kota", "Ajmer", "Jaipur"],
  );
});
