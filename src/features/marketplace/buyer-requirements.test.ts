import assert from "node:assert/strict";
import test from "node:test";
import { validateBuyerRequirement, type BuyerRequirementDraft } from "./buyer-requirements.ts";

const validDraft: BuyerRequirementDraft = {
  crop: " Tomato ",
  variety: " Hybrid ",
  grade: " A ",
  quantity: 1.5,
  unit: "quintal",
  locationArea: " Jammu ",
  requiredAt: "2026-11-25",
};

test("valid requirement is trimmed and date is normalized to ISO timestamp", () => {
  const result = validateBuyerRequirement(validDraft);
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.value, {
    crop: "Tomato",
    variety: "Hybrid",
    grade: "A",
    quantity: 1.5,
    unit: "quintal",
    locationArea: "Jammu",
    requiredAt: "2026-11-25T00:00:00.000Z",
  });
});

test("optional variety and grade may be left blank without inventing values", () => {
  const result = validateBuyerRequirement({ ...validDraft, variety: " ", grade: null });
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.value.variety, null);
  assert.equal(result.value.grade, null);
});

test("rejects missing crop and pickup area", () => {
  const result = validateBuyerRequirement({ ...validDraft, crop: " ", locationArea: "" });
  assert.equal(result.valid, false);
  if (result.valid) return;
  assert.deepEqual(
    result.errors.map((error) => error.field),
    ["crop", "locationArea"],
  );
});

test("rejects zero, negative, infinite and non-numeric quantities", () => {
  for (const quantity of [0, -1, Number.POSITIVE_INFINITY, Number.NaN, "5" as unknown as number]) {
    const result = validateBuyerRequirement({ ...validDraft, quantity });
    assert.equal(result.valid, false);
    if (!result.valid) assert.ok(result.errors.some((error) => error.field === "quantity"));
  }
});

test("rejects unsupported units and malformed calendar dates", () => {
  const unitResult = validateBuyerRequirement({
    ...validDraft,
    unit: "bag" as BuyerRequirementDraft["unit"],
  });
  const dateResult = validateBuyerRequirement({ ...validDraft, requiredAt: "2026-02-30" });
  assert.equal(unitResult.valid, false);
  assert.equal(dateResult.valid, false);
});

test("accepts a timezone-qualified ISO timestamp and normalizes it to UTC", () => {
  const result = validateBuyerRequirement({
    ...validDraft,
    requiredAt: "2026-11-25T10:00:00+05:30",
  });
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.value.requiredAt, "2026-11-25T04:30:00.000Z");
});

test("rejects overlong crop, variety, grade and location values", () => {
  const result = validateBuyerRequirement({
    ...validDraft,
    crop: "c".repeat(81),
    variety: "v".repeat(81),
    grade: "g".repeat(81),
    locationArea: "l".repeat(121),
  });
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.deepEqual(
      result.errors.map((error) => error.field),
      ["crop", "variety", "grade", "locationArea"],
    );
  }
});
