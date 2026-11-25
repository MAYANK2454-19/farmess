import assert from "node:assert/strict";
import test from "node:test";
import { validateLogisticsRequestTerms } from "./request-terms.ts";

const validTerms = {
  quantity: 250,
  quantityUnit: "kg" as const,
  pickupArea: "Jammu",
  deliveryArea: "Srinagar",
  requestedAt: "2026-11-22T10:00:00Z",
  neededBy: "2026-11-23T10:00:00Z",
};

test("accepts complete future logistics terms", () => {
  const result = validateLogisticsRequestTerms(validTerms, new Date("2026-11-22T09:00:00Z"));
  assert.deepEqual(result, { valid: true, errors: [] });
});

test("rejects non-positive quantities and unsupported units", () => {
  const result = validateLogisticsRequestTerms(
    { ...validTerms, quantity: 0, quantityUnit: "truck" as never },
    new Date("2026-11-22T09:00:00Z"),
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Quantity must be/);
  assert.match(result.errors.join(" "), /Quantity unit must be/);
});

test("rejects identical areas", () => {
  const result = validateLogisticsRequestTerms(
    { ...validTerms, pickupArea: "Jammu", deliveryArea: " Jammu " },
    new Date("2026-11-22T09:00:00Z"),
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /different/);
});

test("rejects invalid and non-future timing", () => {
  const result = validateLogisticsRequestTerms(
    { ...validTerms, requestedAt: "2026-11-22T07:00:00Z", neededBy: "2026-11-22T08:00:00Z" },
    new Date("2026-11-22T09:00:00Z"),
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /Requested-at/);
  assert.match(result.errors.join(" "), /Needed-by/);
});

test("rejects a needed-by date that precedes the request", () => {
  const result = validateLogisticsRequestTerms(
    { ...validTerms, requestedAt: "2026-11-23T10:00:00Z", neededBy: "2026-11-22T10:00:00Z" },
    new Date("2026-11-22T09:00:00Z"),
  );
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /later than requested-at/);
});
