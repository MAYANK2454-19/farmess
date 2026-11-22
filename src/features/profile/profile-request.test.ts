import assert from "node:assert/strict";
import test from "node:test";

import {
  parseProfileUpdateRequest,
  type ProfileConsentField,
} from "./profile-request.ts";

test("accepts a partial profile update and trims user-entered text", () => {
  const result = parseProfileUpdateRequest({
    displayName: "  Prince Kumar  ",
    marketArea: "  Katra  ",
  });

  assert.deepEqual(result, {
    status: "valid",
    data: {
      displayName: "Prince Kumar",
      marketArea: "Katra",
    },
    errors: {},
  });
});

test("normalizes a phone number into E.164 form", () => {
  const result = parseProfileUpdateRequest({
    phoneNumber: " +91 (98765) 43210 ",
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.equal(result.data.phoneNumber, "+919876543210");
});

test("allows explicit empty phone and market area values to clear optional fields", () => {
  const result = parseProfileUpdateRequest({
    phoneNumber: "",
    marketArea: " ",
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.equal(result.data.phoneNumber, "");
  assert.equal(result.data.marketArea, "");
});

test("rejects null, arrays, primitives and non-object request bodies", () => {
  for (const input of [null, [], "profile", 7, false]) {
    assert.deepEqual(parseProfileUpdateRequest(input), {
      status: "invalid",
      data: null,
      reason: "invalid_payload",
      errors: {
        request: "Expected a JSON object containing profile fields.",
      },
    });
  }
});

test("rejects malformed profile field types", () => {
  const result = parseProfileUpdateRequest({
    displayName: 42,
    phoneNumber: null,
    marketArea: ["Katra"],
  });

  assert.equal(result.status, "invalid");
  if (result.status !== "invalid") return;

  assert.equal(result.errors.displayName, "Display name must be a string.");
  assert.equal(result.errors.phoneNumber, "Phone number must be a string.");
  assert.equal(result.errors.marketArea, "Market area must be a string.");
});

test("requires a non-empty display name within the documented length", () => {
  assert.equal(
    parseProfileUpdateRequest({ displayName: " " }).status,
    "invalid",
  );
  assert.equal(
    parseProfileUpdateRequest({ displayName: "x".repeat(81) }).status,
    "invalid",
  );
  assert.equal(
    parseProfileUpdateRequest({ displayName: "x".repeat(80) }).status,
    "valid",
  );
});

test("rejects invalid phone values instead of guessing a country code", () => {
  for (const phoneNumber of ["9876543210", "+0 12345678", "+91 123", "+91 abcdef"]) {
    const result = parseProfileUpdateRequest({ phoneNumber });
    assert.equal(result.status, "invalid", "Expected phone to be rejected: " + phoneNumber);
    if (result.status !== "invalid") continue;
    assert.ok(result.errors.phoneNumber);
  }
});

test("rejects exact GPS coordinates in the market area field", () => {
  for (const marketArea of ["32.9912, 74.9312", "geo:32.9912,74.9312"]) {
    const result = parseProfileUpdateRequest({ marketArea });
    assert.equal(result.status, "invalid");
    if (result.status !== "invalid") continue;
    assert.ok(result.errors.marketArea);
  }
});

test("rejects an overlong market area", () => {
  const result = parseProfileUpdateRequest({ marketArea: "x".repeat(161) });

  assert.equal(result.status, "invalid");
  if (result.status !== "invalid") return;
  assert.ok(result.errors.marketArea);
});

test("accepts partial purpose-specific consent updates and preserves explicit false", () => {
  const result = parseProfileUpdateRequest({
    consents: {
      approximateLocationSharing: true,
      exactLocationDisclosure: false,
    },
  });

  assert.deepEqual(result, {
    status: "valid",
    data: {
      consents: {
        approximateLocationSharing: true,
        exactLocationDisclosure: false,
      },
    },
    errors: {},
  });
});

test("rejects non-boolean privacy consent values", () => {
  const result = parseProfileUpdateRequest({
    consents: {
      approximateLocationSharing: "yes",
      buyerContactDisclosure: 1,
    },
  });

  assert.equal(result.status, "invalid");
  if (result.status !== "invalid") return;

  assert.ok(result.errors["consents.approximateLocationSharing"]);
  assert.ok(result.errors["consents.buyerContactDisclosure"]);
});

test("rejects null or non-object consent patches", () => {
  for (const consents of [null, [], "yes"]) {
    const result = parseProfileUpdateRequest({ consents });
    assert.equal(result.status, "invalid");
    if (result.status !== "invalid") continue;
    assert.ok(result.errors.consents);
  }
});

test("ignores client-supplied identity, role and server-managed profile fields", () => {
  const result = parseProfileUpdateRequest({
    displayName: "Farmer A",
    userId: "attacker-user",
    ownerId: "attacker-user",
    role: "admin",
    isAdmin: true,
    createdAt: "2000-01-01T00:00:00Z",
    verifiedAt: "2000-01-01T00:00:00Z",
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(Object.keys(result.data), ["displayName"]);
  assert.equal("userId" in result.data, false);
  assert.equal("role" in result.data, false);
  assert.equal("isAdmin" in result.data, false);
});

test("ignores unknown keys but rejects an update containing no supported fields", () => {
  const result = parseProfileUpdateRequest({
    userId: "attacker",
    role: "admin",
    updatedAt: "now",
  });

  assert.deepEqual(result, {
    status: "invalid",
    data: null,
    reason: "empty_patch",
    errors: {
      request: "Provide at least one supported profile field to update.",
    },
  });
});

test("allows the current consent contract to grow without accepting unknown consent fields", () => {
  const result = parseProfileUpdateRequest({
    consents: {
      approximateLocationSharing: false,
      exactLocationDisclosure: true,
      buyerContactDisclosure: false,
      providerContactDisclosure: true,
      shareAllPrivateData: true,
    },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(
    Object.keys(result.data.consents ?? {}).sort(),
    [
      "approximateLocationSharing",
      "buyerContactDisclosure",
      "exactLocationDisclosure",
      "providerContactDisclosure",
    ].sort() satisfies ProfileConsentField[],
  );
});
