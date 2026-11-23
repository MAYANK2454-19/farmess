import assert from "node:assert/strict";
import test from "node:test";

import { getMarketSourceQualityReasons } from "./source-quality.ts";
import type { MarketSourceQuality } from "./types.ts";

const emptyQuality: MarketSourceQuality = {
  received: 10,
  accepted: 6,
  rejected: 4,
  rejectionReasons: {
    invalid_record: 1,
    missing_identity: 0,
    invalid_observation_date: 1,
    invalid_price: 0,
    missing_prices: 1,
    inconsistent_prices: 1,
  },
};

test("shows only rejection reasons with positive counts in stable order", () => {
  assert.deepEqual(
    getMarketSourceQualityReasons(emptyQuality),
    [
      { reason: "invalid_record", label: "Unreadable source row", count: 1 },
      { reason: "invalid_observation_date", label: "Invalid observation date", count: 1 },
      { reason: "missing_prices", label: "No price values reported", count: 1 },
      { reason: "inconsistent_prices", label: "Price values do not agree", count: 1 },
    ],
  );
});

test("returns an empty breakdown when every source row is accepted", () => {
  const quality: MarketSourceQuality = {
    received: 3,
    accepted: 3,
    rejected: 0,
    rejectionReasons: {
      invalid_record: 0,
      missing_identity: 0,
      invalid_observation_date: 0,
      invalid_price: 0,
      missing_prices: 0,
      inconsistent_prices: 0,
    },
  };

  assert.deepEqual(getMarketSourceQualityReasons(quality), []);
});

test("does not display zero, negative or non-integer rejection counts", () => {
  const quality: MarketSourceQuality = {
    ...emptyQuality,
    rejectionReasons: {
      ...emptyQuality.rejectionReasons,
      invalid_record: -1,
      missing_identity: 0.5,
      invalid_price: 0,
    },
  };

  assert.deepEqual(getMarketSourceQualityReasons(quality).map((item) => item.reason), [
    "invalid_observation_date",
    "missing_prices",
    "inconsistent_prices",
  ]);
});
