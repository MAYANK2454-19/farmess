import assert from "node:assert/strict";
import test from "node:test";

import { sortMarketPriceRecords } from "./sort-records.ts";
import type { MarketPriceRecord } from "./types.ts";

function record(id: string, observationDate: string, modalPrice: string | null): MarketPriceRecord {
  return {
    id,
    commodity: "Wheat",
    variety: null,
    state: "Rajasthan",
    district: "Jaipur",
    market: "Jaipur",
    minPrice: null,
    maxPrice: null,
    modalPrice,
    currency: "INR",
    priceUnit: "INR/quintal",
    sourcePriceUnit: "Quintal",
    observationDate,
    retrievedAt: "2026-11-22T12:00:00.000Z",
    sourceName: "OGD India",
    sourceUrl: "https://data.gov.in/",
    valueType: "reported",
  };
}

const records = [
  record("older", "2026-11-19", "2100.00"),
  record("newer", "2026-11-22", "1800.00"),
  record("middle", "2026-11-21", "2500.00"),
  record("missing", "2026-11-20", null),
];

test("sorts observations newest first without mutating source order", () => {
  const input = [...records];
  const sorted = sortMarketPriceRecords(input, "newest");

  assert.deepEqual(
    sorted.map(({ id }) => id),
    ["newer", "middle", "missing", "older"],
  );
  assert.deepEqual(input, records);
});

test("sorts observations oldest first", () => {
  const sorted = sortMarketPriceRecords(records, "oldest");

  assert.deepEqual(
    sorted.map(({ id }) => id),
    ["older", "missing", "middle", "newer"],
  );
});

test("sorts modal prices high to low and keeps missing prices last", () => {
  const sorted = sortMarketPriceRecords(records, "modal-high");

  assert.deepEqual(
    sorted.map(({ id }) => id),
    ["middle", "older", "newer", "missing"],
  );
});

test("sorts modal prices low to high and keeps missing prices last", () => {
  const sorted = sortMarketPriceRecords(records, "modal-low");

  assert.deepEqual(
    sorted.map(({ id }) => id),
    ["newer", "older", "middle", "missing"],
  );
});

test("keeps invalid and blank modal prices last in price sorts", () => {
  const values = [
    record("invalid", "2026-11-22", "not-a-price"),
    record("valid", "2026-11-21", "0.00"),
    record("blank", "2026-11-20", " "),
  ];

  assert.deepEqual(
    sortMarketPriceRecords(values, "modal-low").map(({ id }) => id),
    ["valid", "invalid", "blank"],
  );
});

test("preserves source order when sort values are equal or unavailable", () => {
  const tied = [
    record("first", "2026-11-22", "1800.00"),
    record("second", "2026-11-22", "1800.00"),
    record("third", "2026-11-21", null),
    record("fourth", "2026-11-20", null),
  ];

  assert.deepEqual(
    sortMarketPriceRecords(tied, "modal-high").map(({ id }) => id),
    ["first", "second", "third", "fourth"],
  );
});
