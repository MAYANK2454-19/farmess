import assert from "node:assert/strict";
import test from "node:test";

import { validateLotDraft, type LotDraftInput } from "./lot-validation.ts";

function validDraft(overrides: Partial<LotDraftInput> = {}): LotDraftInput {
  return {
    crop: "Tomato",
    variety: "",
    grade: "",
    quantity: "12.5",
    unit: "quintal",
    location: "Near Katra market",
    availableAt: "2026-11-23",
    sellBy: "2026-11-26",
    notes: "",
    ...overrides,
  };
}

test("accepts a valid lot and trims user-entered text", () => {
  const result = validateLotDraft(validDraft({ crop: "  Tomato  ", location: "  Katra  " }));

  assert.deepEqual(result.errors, {});
  assert.equal(result.data?.crop, "Tomato");
  assert.equal(result.data?.location, "Katra");
  assert.equal(result.data?.quantity, "12.5");
});

test("keeps variety and grade optional when the farmer does not know them", () => {
  const result = validateLotDraft(validDraft({ variety: "", grade: "" }));

  assert.equal(result.data?.variety, "");
  assert.equal(result.data?.grade, "");
  assert.deepEqual(result.errors, {});
});

test("rejects a missing crop and pickup area", () => {
  const result = validateLotDraft(validDraft({ crop: "  ", location: " " }));

  assert.equal(result.data, null);
  assert.ok(result.errors.crop);
  assert.ok(result.errors.location);
});

test("accepts positive quantities with up to three decimal places", () => {
  for (const quantity of ["0.001", "1", "1.25", "100.125"]) {
    const result = validateLotDraft(validDraft({ quantity }));
    assert.equal(result.errors.quantity, undefined, "Expected " + quantity + " to be valid");
  }
});

test("rejects zero, negative, malformed and over-precision quantities", () => {
  for (const quantity of ["0", "0.000", "-1", "1.2345", "1,000", "1e3", ".5"]) {
    const result = validateLotDraft(validDraft({ quantity }));
    assert.ok(result.errors.quantity, "Expected " + quantity + " to be rejected");
  }
});

test("rejects unsupported units and grade values", () => {
  const result = validateLotDraft(validDraft({ unit: "bag", grade: "Premium" }));

  assert.ok(result.errors.unit);
  assert.ok(result.errors.grade);
});

test("rejects impossible calendar dates and a sell-by date before availability", () => {
  const impossible = validateLotDraft(validDraft({ availableAt: "2026-02-30" }));
  const outOfOrder = validateLotDraft(
    validDraft({ availableAt: "2026-11-25", sellBy: "2026-11-24" }),
  );

  assert.ok(impossible.errors.availableAt);
  assert.ok(outOfOrder.errors.sellBy);
});

test("accepts the same day for availability and sell-by dates", () => {
  const result = validateLotDraft(validDraft({ availableAt: "2026-11-23", sellBy: "2026-11-23" }));

  assert.deepEqual(result.errors, {});
});

test("enforces text limits without rejecting optional empty notes", () => {
  const valid = validateLotDraft(validDraft({ notes: "" }));
  const invalid = validateLotDraft(validDraft({ notes: "x".repeat(1001) }));

  assert.equal(valid.errors.notes, undefined);
  assert.ok(invalid.errors.notes);
});
