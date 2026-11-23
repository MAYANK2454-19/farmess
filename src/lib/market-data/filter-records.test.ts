import assert from "node:assert/strict";
import test from "node:test";

import { EMPTY_MARKET_RECORD_FILTERS, filterMarketPriceRecords } from "./filter-records.ts";
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
  record("low", "2026-11-19", "1800"),
  record("middle", "2026-11-21", "2200"),
  record("high", "2026-11-23", "2800"),
  record("missing", "2026-11-22", null),
  record("invalid", "2026-11-22", "not-a-price"),
];

test("returns a new list with all records when no filters are active", () => {
  const result = filterMarketPriceRecords(records, EMPTY_MARKET_RECORD_FILTERS);
  assert.deepEqual(result, records);
  assert.notEqual(result, records);
});

test("applies inclusive observation date bounds", () => {
  const result = filterMarketPriceRecords(records, {
    ...EMPTY_MARKET_RECORD_FILTERS,
    fromDate: "2026-11-21",
    toDate: "2026-11-22",
  });
  assert.deepEqual(
    result.map(({ id }) => id),
    ["middle", "missing"],
  );
});

test("applies inclusive modal-price bounds and excludes missing or invalid prices", () => {
  const result = filterMarketPriceRecords(records, {
    ...EMPTY_MARKET_RECORD_FILTERS,
    minModalPrice: "2200",
    maxModalPrice: "2400",
  });
  assert.deepEqual(
    result.map(({ id }) => id),
    ["middle"],
  );
});

test("combines date and modal-price filters", () => {
  const result = filterMarketPriceRecords(records, {
    fromDate: "2026-11-20",
    toDate: "2026-11-23",
    minModalPrice: "2000",
    maxModalPrice: "3000",
  });
  assert.deepEqual(
    result.map(({ id }) => id),
    ["middle", "high"],
  );
});


test("excludes malformed observation dates only when a date bound is active", () => {
  const result = filterMarketPriceRecords(records, {
    ...EMPTY_MARKET_RECORD_FILTERS,
    fromDate: "2026-11-20",
  });
  assert.deepEqual(
    result.map(({ id }) => id),
    ["middle", "high", "missing"],
  );
});

test("rejects reversed date and price ranges", () => {
  assert.throws(
    () =>
      filterMarketPriceRecords(records, {
        ...EMPTY_MARKET_RECORD_FILTERS,
        fromDate: "2026-11-23",
        toDate: "2026-11-21",
      }),
    /Start date must be on or before end date/,
  );
  assert.throws(
    () =>
      filterMarketPriceRecords(records, {
        ...EMPTY_MARKET_RECORD_FILTERS,
        minModalPrice: "3000",
        maxModalPrice: "2000",
      }),
    /Minimum modal price must be on or below maximum modal price/,
  );
});

test("rejects malformed dates and negative or non-numeric price bounds", () => {
  assert.throws(
    () =>
      filterMarketPriceRecords(records, {
        ...EMPTY_MARKET_RECORD_FILTERS,
        fromDate: "2026-02-30",
      }),
    /Start date must be a valid date/,
  );
  assert.throws(
    () =>
      filterMarketPriceRecords(records, {
        ...EMPTY_MARKET_RECORD_FILTERS,
        minModalPrice: "-1",
      }),
    /Minimum modal price must be a non-negative number/,
  );
  assert.throws(
    () =>
      filterMarketPriceRecords(records, {
        ...EMPTY_MARKET_RECORD_FILTERS,
        maxModalPrice: "not-a-price",
      }),
    /Maximum modal price must be a non-negative number/,
  );
});
