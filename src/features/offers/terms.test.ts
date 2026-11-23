import assert from "node:assert/strict";
import test from "node:test";

import { validateOfferTerms } from "./terms.ts";

const now = new Date("2026-11-22T12:00:00.000Z");

const valid = {
  quantity: 25,
  unit: "quintal" as const,
  pricePaise: 2_500_00,
  priceBasis: "per_quintal" as const,
  validUntil: "2026-11-23T12:00:00.000Z",
};

test("accepts explicit, future offer terms", () => {
  assert.deepEqual(validateOfferTerms(valid, now), { valid: true, errors: [] });
});

test("rejects invalid quantity and price", () => {
  const result = validateOfferTerms({ ...valid, quantity: 0, pricePaise: 1.5 }, now);
  assert.equal(result.valid, false);
  assert.equal(result.errors.length, 2);
});

test("rejects mismatched quantity and price units", () => {
  const result = validateOfferTerms({ ...valid, unit: "tonne", priceBasis: "per_quintal" }, now);
  assert.equal(result.valid, false);
  assert.match(result.errors[0], /same unit/i);
});

test("rejects expired or invalid validity", () => {
  assert.equal(
    validateOfferTerms({ ...valid, validUntil: "2026-11-22T11:59:59.000Z" }, now).valid,
    false,
  );
  assert.equal(validateOfferTerms({ ...valid, validUntil: "not-a-date" }, now).valid, false);
});


test("accepts the largest safe integer price and rejects an unsafe integer", () => {
  const safe = validateOfferTerms({ ...valid, pricePaise: Number.MAX_SAFE_INTEGER }, now);
  const unsafe = validateOfferTerms({ ...valid, pricePaise: Number.MAX_SAFE_INTEGER + 1 }, now);

  assert.equal(safe.valid, true);
  assert.equal(unsafe.valid, false);
  assert.match(unsafe.errors.join(" "), /positive integer number of paise/);
});
