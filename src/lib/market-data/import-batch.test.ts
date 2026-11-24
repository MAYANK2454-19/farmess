import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileMarketObservationBatch,
  type MarketObservationImportRow,
} from "./import-batch.ts";

const baseRow: MarketObservationImportRow = {
  crop: "Wheat",
  variety: null,
  district: "Jaipur",
  state: "Rajasthan",
  market_name: "Kishangarh",
  min_price_paise_per_quintal: 2_400_000,
  max_price_paise_per_quintal: 2_600_000,
  modal_price_paise_per_quintal: 2_500_000,
  observation_date: "2026-11-22",
  retrieved_at: "2026-11-23T08:00:00.000Z",
  source_name: "OGD India / AGMARKNET",
  source_url: "https://data.gov.in/resource/example",
};

test("keeps unique source observations in their original order", () => {
  const secondRow = { ...baseRow, market_name: "Ajmer" };
  const result = reconcileMarketObservationBatch([baseRow, secondRow]);

  assert.deepEqual(result, {
    status: "ready",
    rows: [baseRow, secondRow],
    duplicatesRemoved: 0,
  });
});

test("collapses exact duplicates including null variety keys", () => {
  const result = reconcileMarketObservationBatch([baseRow, { ...baseRow }]);

  assert.deepEqual(result, {
    status: "ready",
    rows: [baseRow],
    duplicatesRemoved: 1,
  });
});

test("keeps the first row when only retrieval metadata differs", () => {
  const repeatedFetch = { ...baseRow, retrieved_at: "2026-11-23T08:01:00.000Z" };
  const result = reconcileMarketObservationBatch([baseRow, repeatedFetch]);

  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.deepEqual(result.rows, [baseRow]);
    assert.equal(result.duplicatesRemoved, 1);
  }
});

test("rejects duplicate natural keys with different prices", () => {
  const conflicting = { ...baseRow, modal_price_paise_per_quintal: 2_550_000 };
  assert.deepEqual(reconcileMarketObservationBatch([baseRow, conflicting]), {
    status: "conflicting-duplicates",
    conflictCount: 1,
  });
});

test("rejects duplicate natural keys with different source provenance", () => {
  const conflicting = { ...baseRow, source_url: "https://data.gov.in/resource/other" };
  assert.deepEqual(reconcileMarketObservationBatch([baseRow, conflicting]), {
    status: "conflicting-duplicates",
    conflictCount: 1,
  });
});

test("rejects the complete batch when a conflict appears after valid duplicates", () => {
  const result = reconcileMarketObservationBatch([
    baseRow,
    { ...baseRow },
    { ...baseRow, min_price_paise_per_quintal: 2_350_000 },
  ]);

  assert.deepEqual(result, { status: "conflicting-duplicates", conflictCount: 1 });
});

test("does not treat different observation dates or sources as duplicates", () => {
  const nextDate = { ...baseRow, observation_date: "2026-11-23" };
  const nextSource = { ...baseRow, source_name: "Another verified source" };
  const result = reconcileMarketObservationBatch([baseRow, nextDate, nextSource]);

  assert.equal(result.status, "ready");
  if (result.status === "ready") assert.equal(result.rows.length, 3);
});

test("returns an empty ready batch for an empty input", () => {
  assert.deepEqual(reconcileMarketObservationBatch([]), {
    status: "ready",
    rows: [],
    duplicatesRemoved: 0,
  });
});
