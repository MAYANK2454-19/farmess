import assert from "node:assert/strict";
import test from "node:test";

import { summarizeMarketDataHealth, type MarketHealthInput } from "./market-health.ts";

const now = new Date("2026-11-24T12:00:00.000Z");

function record(overrides: Partial<MarketHealthInput> = {}): MarketHealthInput {
  return {
    crop: "Onion",
    variety: "Red",
    state: "Maharashtra",
    district: "Nashik",
    market_name: "Lasalgaon",
    observation_date: "2026-11-24",
    source_name: "OGD / AGMARKNET",
    modal_price_paise_per_quintal: 250000,
    ...overrides,
  };
}

test("summarises market, crop and series coverage from the bounded sample", () => {
  const result = summarizeMarketDataHealth(
    [
      record(),
      record({ variety: "White", market_name: "Pimpalgaon" }),
      record({ crop: "Tomato", state: "Karnataka", district: "Kolar", market_name: "Kolar" }),
    ],
    3,
    now,
  );

  assert.equal(result.totalObservations, 3);
  assert.equal(result.sampledObservations, 3);
  assert.equal(result.cropCount, 2);
  assert.equal(result.marketCount, 3);
  assert.equal(result.seriesCount, 3);
  assert.deepEqual(result.dateRange, { oldest: "2026-11-24", newest: "2026-11-24" });
});

test("classifies record freshness and flags markets by their latest observation", () => {
  const result = summarizeMarketDataHealth(
    [
      record({ observation_date: "2026-11-24" }),
      record({ observation_date: "2026-11-19" }),
      record({ observation_date: "2026-11-25", market_name: "Future Mandi" }),
    ],
    3,
    now,
  );

  assert.equal(result.freshness.fresh, 1);
  assert.equal(result.freshness.stale, 1);
  assert.equal(result.freshness.future, 1);
  assert.equal(result.marketsNeedingReview.length, 2);
  assert.equal(result.marketsNeedingReview[0].name, "Lasalgaon, Nashik, Maharashtra");
  assert.equal(result.marketsNeedingReview[0].latestStatus, "stale");
});

test("uses newest date for a market instead of treating its older history as stale", () => {
  const result = summarizeMarketDataHealth(
    [
      record({ observation_date: "2026-11-18" }),
      record({ observation_date: "2026-11-24" }),
    ],
    2,
    now,
  );

  assert.equal(result.marketsNeedingReview.length, 0);
  assert.equal(result.marketCount, 1);
});

test("reports missing modal prices and limits without hiding the exact total", () => {
  const result = summarizeMarketDataHealth(
    [record({ modal_price_paise_per_quintal: null })],
    5001,
    now,
  );

  assert.equal(result.totalObservations, 5001);
  assert.equal(result.sampledObservations, 1);
  assert.equal(result.sampleIsLimited, true);
  assert.equal(result.missingModalPriceCount, 1);
});

test("does not count invalid dates in the valid observation date range", () => {
  const result = summarizeMarketDataHealth(
    [record({ observation_date: "2026-02-30" }), record({ observation_date: "2026-11-23" })],
    2,
    now,
  );

  assert.equal(result.freshness.invalid, 1);
  assert.equal(result.dateRange.oldest, "2026-11-23");
  assert.equal(result.dateRange.newest, "2026-11-23");
});

test("returns a safe empty summary when no source observations exist", () => {
  const result = summarizeMarketDataHealth([], 0, now);

  assert.equal(result.totalObservations, 0);
  assert.equal(result.cropCount, 0);
  assert.equal(result.marketCount, 0);
  assert.equal(result.seriesCount, 0);
  assert.equal(result.dateRange.newest, null);
  assert.deepEqual(result.sources, []);
});
