import assert from "node:assert/strict";
import test from "node:test";

import { parseLotDraftRequest } from "./lot-request.ts";

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

test("parses a valid JSON payload using the existing lot validation rules", () => {
  const result = parseLotDraftRequest(validPayload({ crop: "  Tomato  " }));

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.equal(result.data.crop, "Tomato");
  assert.equal(result.data.quantity, "12.5");
  assert.equal(result.data.unit, "quintal");
  assert.deepEqual(result.errors, {});
});

test("defaults omitted optional fields to empty strings", () => {
  const result = parseLotDraftRequest({
    crop: "Tomato",
    quantity: "1",
    unit: "kg",
    location: "Katra",
    availableAt: "2026-11-23",
    sellBy: "2026-11-24",
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.equal(result.data.variety, "");
  assert.equal(result.data.grade, "");
  assert.equal(result.data.notes, "");
});

test("rejects null, arrays, primitives and non-object payloads without throwing", () => {
  for (const payload of [null, [], "tomato", 12, true]) {
    assert.deepEqual(parseLotDraftRequest(payload), {
      status: "invalid",
      data: null,
      reason: "invalid_payload",
      errors: {
        request: "Expected a JSON object containing the produce lot fields.",
      },
    });
  }
});

test("rejects non-string field values before the domain validator can throw", () => {
  const result = parseLotDraftRequest(
    validPayload({
      crop: 12,
      quantity: null,
      location: ["Katra"],
      notes: false,
    }),
  );

  assert.equal(result.status, "invalid");
  if (result.status !== "invalid") return;

  assert.equal(result.reason, "invalid_fields");
  assert.ok(result.errors.crop);
  assert.ok(result.errors.quantity);
  assert.ok(result.errors.location);
  assert.ok(result.errors.notes);
});

test("returns the existing field-level errors for missing required fields", () => {
  const result = parseLotDraftRequest({
    variety: "",
    grade: "",
    notes: "",
  });

  assert.equal(result.status, "invalid");
  if (result.status !== "invalid") return;

  assert.ok(result.errors.crop);
  assert.ok(result.errors.quantity);
  assert.ok(result.errors.unit);
  assert.ok(result.errors.location);
  assert.ok(result.errors.availableAt);
  assert.ok(result.errors.sellBy);
});

test("rejects valid strings that fail the shared quantity, unit and date rules", () => {
  const result = parseLotDraftRequest(
    validPayload({
      quantity: "0",
      unit: "bag",
      availableAt: "2026-02-30",
      sellBy: "2026-01-01",
    }),
  );

  assert.equal(result.status, "invalid");
  if (result.status !== "invalid") return;

  assert.ok(result.errors.quantity);
  assert.ok(result.errors.unit);
  assert.ok(result.errors.availableAt);
  assert.ok(result.errors.sellBy);
});

test("whitelists lot form fields and never returns client-supplied ownership or role data", () => {
  const result = parseLotDraftRequest(
    validPayload({
      ownerId: "attacker-user",
      userId: "attacker-user",
      role: "admin",
      status: "published",
      isVerified: true,
      id: "forged-lot-id",
    }),
  );

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(Object.keys(result.data).sort(), [
    "availableAt",
    "crop",
    "grade",
    "location",
    "notes",
    "quantity",
    "sellBy",
    "unit",
    "variety",
  ]);
  assert.equal("ownerId" in result.data, false);
  assert.equal("role" in result.data, false);
  assert.equal("status" in result.data, false);
});

test("rejects explicit null values for optional fields instead of silently coercing them", () => {
  const result = parseLotDraftRequest(validPayload({ variety: null, grade: null, notes: null }));

  assert.equal(result.status, "invalid");
  if (result.status !== "invalid") return;

  assert.ok(result.errors.variety);
  assert.ok(result.errors.grade);
  assert.ok(result.errors.notes);
});

test("enforces the same crop, location, variety and notes length limits", () => {
  const result = parseLotDraftRequest(
    validPayload({
      crop: "x".repeat(81),
      variety: "x".repeat(81),
      location: "x".repeat(161),
      notes: "x".repeat(1001),
    }),
  );

  assert.equal(result.status, "invalid");
  if (result.status !== "invalid") return;

  assert.ok(result.errors.crop);
  assert.ok(result.errors.variety);
  assert.ok(result.errors.location);
  assert.ok(result.errors.notes);
});

test("ignores unknown request keys without copying them into validated form data", () => {
  const result = parseLotDraftRequest(validPayload({ extra: "value", isAdmin: true }));

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.equal("extra" in result.data, false);
  assert.equal("isAdmin" in result.data, false);
});
