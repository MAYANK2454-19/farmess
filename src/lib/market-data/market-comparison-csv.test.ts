import assert from "node:assert/strict";
import test from "node:test";

import { marketPriceComparisonsToCsv } from "./market-comparison-csv.ts";
import type { MarketComparisonGroup } from "./market-comparison.ts";

const comparison: MarketComparisonGroup = {
  id: "wheat|sharbati|2026-11-23",
  commodity: "Wheat, premium",
  variety: 'Sharbati "A"',
  observationDate: "2026-11-23",
  markets: [
    {
      market: '=HYPERLINK("https://bad.example")',
      district: "Jaipur, Rural",
      state: "Rajasthan",
      observationCount: 2,
      averageModalPrice: 2250.5,
      lowestModalPrice: 2200,
      highestModalPrice: 2301,
    },
    {
      market: "Kota",
      district: "Kota",
      state: "Rajasthan",
      observationCount: 1,
      averageModalPrice: 2500,
      lowestModalPrice: 2500,
      highestModalPrice: 2500,
    },
  ],
  priceSpread: 249.5,
  spreadPercent: 11.0875,
};

test("exports each comparable mandi row with date, averaged price and provenance context", () => {
  const csv = marketPriceComparisonsToCsv([comparison]);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"Commodity","Variety","Observation date","Mandi"/);
  assert.match(csv, /"Wheat, premium","Sharbati ""A""","2026-11-23"/);
  assert.match(csv, /"2250.50","2","2200.00","2301.00","249.50","11.09"/);
  assert.equal(csv.split("\r\n").filter(Boolean).length, 3);
});

test("neutralizes spreadsheet formulas and escapes CSV delimiters and quotes", () => {
  const csv = marketPriceComparisonsToCsv([comparison]);

  assert.match(csv, /"'=HYPERLINK\(""https:\/\/bad\.example""\)"/);
  assert.match(csv, /"Jaipur, Rural"/);
});

test("returns a header-only UTF-8 CSV when there are no comparisons", () => {
  const csv = marketPriceComparisonsToCsv([]);

  assert.ok(csv.startsWith("\uFEFF"));
  assert.equal(csv.split("\r\n").filter(Boolean).length, 1);
});
