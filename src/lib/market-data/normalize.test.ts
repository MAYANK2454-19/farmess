import test from "node:test";
import assert from "node:assert/strict";

import { isObservationStale, normalizeOgdRecord, normalizeOgdResponse } from "./normalize.ts";

const retrievedAt = "2026-11-22T12:00:00.000Z";

const validRecord = {
  state: "Rajasthan",
  district: "Jaipur",
  market: "Jaipur (F&V)",
  commodity: "Onion",
  variety: "Other",
  grade: "FAQ",
  arrival_date: "21/11/2026",
  min_price: "1200",
  max_price: "1800",
  modal_price: "1500",
};

test("normalizes a valid OGD mandi record with provenance", () => {
  const record = normalizeOgdRecord(validRecord, retrievedAt);
  assert.ok(record);
  assert.equal(record.commodity, "Onion");
  assert.equal(record.observationDate, "2026-11-21");
  assert.equal(record.retrievedAt, retrievedAt);
  assert.equal(record.priceUnit, "INR/quintal");
  assert.equal(record.valueType, "reported");
  assert.equal(record.modalPrice, "1500.00");
});

test("rejects missing market identity and invalid dates", () => {
  assert.equal(normalizeOgdRecord({ ...validRecord, market: "" }, retrievedAt), null);
  assert.equal(
    normalizeOgdRecord({ ...validRecord, arrival_date: "31/02/2026" }, retrievedAt),
    null,
  );
});

test("rejects malformed, negative and inconsistent prices", () => {
  assert.equal(
    normalizeOgdRecord({ ...validRecord, modal_price: "not-a-price" }, retrievedAt),
    null,
  );
  assert.equal(normalizeOgdRecord({ ...validRecord, min_price: "-1" }, retrievedAt), null);
  assert.equal(
    normalizeOgdRecord({ ...validRecord, min_price: "1900", max_price: "1800" }, retrievedAt),
    null,
  );
  assert.equal(normalizeOgdRecord({ ...validRecord, modal_price: "2000" }, retrievedAt), null);
});

test("allows absent optional price fields when at least one price exists", () => {
  const record = normalizeOgdRecord(
    { ...validRecord, min_price: "", max_price: "", modal_price: "1500" },
    retrievedAt,
  );
  assert.ok(record);
  assert.equal(record.minPrice, null);
  assert.equal(record.maxPrice, null);
});

test("rejects an unsupported response shape", () => {
  assert.throws(() => normalizeOgdResponse({ data: [] }, retrievedAt), /records array/);
});

test("filters malformed records from an otherwise valid response", () => {
  const records = normalizeOgdResponse(
    { records: [validRecord, { ...validRecord, market: "" }] },
    retrievedAt,
  );
  assert.equal(records.length, 1);
});

test("marks observations older than 48 hours as stale", () => {
  const now = new Date("2026-11-22T12:00:00.000Z");
  assert.equal(isObservationStale("2026-11-21", now), false);
  assert.equal(isObservationStale("2026-11-19", now), true);
});
