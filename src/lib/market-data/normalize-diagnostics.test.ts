import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyMarketSourceQuality,
  normalizeOgdResponse,
  normalizeOgdResponseWithDiagnostics,
} from "./normalize.ts";

const retrievedAt = "2026-11-23T12:00:00.000Z";
const validRecord = {
  state: "Rajasthan",
  district: "Jaipur",
  market: "Jaipur (F&V)",
  commodity: "Onion",
  arrival_date: "22/11/2026",
  min_price: "1200",
  max_price: "1800",
  modal_price: "1500",
};

test("reports received, accepted and rejected source rows", () => {
  const result = normalizeOgdResponseWithDiagnostics(
    {
      records: [
        validRecord,
        { ...validRecord, market: "" },
        { ...validRecord, arrival_date: "31/02/2026" },
        { ...validRecord, modal_price: "not-a-price" },
        { ...validRecord, min_price: "", max_price: "", modal_price: "" },
        { ...validRecord, min_price: "1900", max_price: "1800" },
        null,
      ],
    },
    retrievedAt,
  );

  assert.equal(result.quality.received, 7);
  assert.equal(result.quality.accepted, 1);
  assert.equal(result.quality.rejected, 6);
  assert.deepEqual(result.quality.rejectionReasons, {
    invalid_record: 1,
    missing_identity: 1,
    invalid_observation_date: 1,
    invalid_price: 1,
    missing_prices: 1,
    inconsistent_prices: 1,
  });
  assert.equal(result.records.length, 1);
});

test("counts optional missing price fields as valid when another price exists", () => {
  const result = normalizeOgdResponseWithDiagnostics(
    {
      records: [
        { ...validRecord, min_price: "", max_price: "", modal_price: "1500" },
      ],
    },
    retrievedAt,
  );

  assert.equal(result.quality.received, 1);
  assert.equal(result.quality.accepted, 1);
  assert.equal(result.quality.rejected, 0);
  assert.equal(result.records[0].minPrice, null);
});

test("keeps the existing normalizer return contract", () => {
  const records = normalizeOgdResponse({ records: [validRecord] }, retrievedAt);
  assert.equal(records.length, 1);
  assert.equal(records[0].sourceName, "OGD India / AGMARKNET");
});

test("returns a complete zeroed quality report for an empty batch", () => {
  assert.deepEqual(emptyMarketSourceQuality(), {
    received: 0,
    accepted: 0,
    rejected: 0,
    rejectionReasons: {
      invalid_record: 0,
      missing_identity: 0,
      invalid_observation_date: 0,
      invalid_price: 0,
      missing_prices: 0,
      inconsistent_prices: 0,
    },
  });
});

test("rejects a malformed top-level response instead of reporting zero records", () => {
  assert.throws(
    () => normalizeOgdResponseWithDiagnostics({ data: [] }, retrievedAt),
    /records array/,
  );
});
