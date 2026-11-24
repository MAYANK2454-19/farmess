import assert from "node:assert/strict";
import test from "node:test";
import { parseOperatorListingUpdate } from "./listing-update.ts";

const validUpdate = {
  id: "a0b1c2d3-e4f5-4678-9012-abcdefabcdef",
  capacity_quantity: 12.5,
  capacity_unit: "tonne",
  available_from: "2026-11-25",
  available_until: "2026-12-05",
};

test("accepts a valid capacity and availability update", () => {
  assert.deepEqual(parseOperatorListingUpdate(validUpdate), {
    valid: true,
    value: {
      capacity_quantity: 12.5,
      capacity_unit: "tonne",
      available_from: "2026-11-25",
      available_until: "2026-12-05",
    },
  });
});

test("allows a provider to clear capacity and availability dates", () => {
  const result = parseOperatorListingUpdate({
    ...validUpdate,
    capacity_quantity: null,
    capacity_unit: null,
    available_from: null,
    available_until: null,
  });
  assert.equal(result.valid, true);
});

test("rejects partial capacity values and unsupported units", () => {
  assert.equal(parseOperatorListingUpdate({ ...validUpdate, capacity_unit: null }).valid, false);
  assert.equal(parseOperatorListingUpdate({ ...validUpdate, capacity_unit: "truck" }).valid, false);
});

test("rejects invalid quantities and malformed calendar dates", () => {
  assert.equal(parseOperatorListingUpdate({ ...validUpdate, capacity_quantity: 0 }).valid, false);
  assert.equal(
    parseOperatorListingUpdate({ ...validUpdate, available_from: "2026-02-30" }).valid,
    false,
  );
});

test("rejects reversed availability windows", () => {
  const result = parseOperatorListingUpdate({
    ...validUpdate,
    available_from: "2026-12-06",
    available_until: "2026-12-05",
  });
  assert.equal(result.valid, false);
  if (!result.valid) assert.match(result.error, /must not precede/);
});

test("rejects unknown fields and invalid listing identifiers", () => {
  assert.equal(
    parseOperatorListingUpdate({ ...validUpdate, verification_state: "platform_verified" }).valid,
    false,
  );
  assert.equal(parseOperatorListingUpdate({ ...validUpdate, id: "not-a-uuid" }).valid, false);
});
