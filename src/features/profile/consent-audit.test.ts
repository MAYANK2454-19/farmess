import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFarmerConsentAuditEvents,
  FARMER_CONSENT_FIELDS,
  type FarmerConsentSnapshot,
} from "./consent-audit.ts";

const previousConsent: FarmerConsentSnapshot = {
  approximateLocationSharing: false,
  exactLocationDisclosure: false,
  buyerContactDisclosure: false,
  providerContactDisclosure: false,
};

function build(overrides: Record<string, unknown> = {}) {
  return buildFarmerConsentAuditEvents({
    actorUserId: "farmer-1",
    farmerUserId: "farmer-1",
    previousConsent,
    consentPatch: {},
    occurredAt: "2026-11-22T15:30:00.000Z",
    ...overrides,
  });
}

test("returns no events when a patch contains no consent changes", () => {
  assert.deepEqual(build({ consentPatch: {} }), {
    status: "valid",
    events: [],
    changedFields: [],
    reason: null,
  });
});

test("records an explicit consent grant with field and purpose metadata", () => {
  const result = build({
    consentPatch: { approximateLocationSharing: true },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(result.changedFields, ["approximateLocationSharing"]);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.events[0], {
    eventType: "farmer_consent_granted",
    actorUserId: "farmer-1",
    farmerUserId: "farmer-1",
    consentField: "approximateLocationSharing",
    dataCategory: "approximate_location",
    previousAllowed: false,
    nextAllowed: true,
    occurredAt: "2026-11-22T15:30:00.000Z",
    dedupeKey: "farmer-1:approximateLocationSharing:0:1:2026-11-22T15%3A30%3A00.000Z",
  });
});

test("records a revocation rather than treating false as missing", () => {
  const result = build({
    previousConsent: {
      ...previousConsent,
      exactLocationDisclosure: true,
    },
    consentPatch: { exactLocationDisclosure: false },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.equal(result.events[0].eventType, "farmer_consent_revoked");
  assert.equal(result.events[0].previousAllowed, true);
  assert.equal(result.events[0].nextAllowed, false);
  assert.equal(result.events[0].dataCategory, "exact_location");
});

test("records multiple consent changes in a stable field order", () => {
  const result = build({
    consentPatch: {
      providerContactDisclosure: true,
      exactLocationDisclosure: true,
      approximateLocationSharing: true,
    },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(result.changedFields, [
    "approximateLocationSharing",
    "exactLocationDisclosure",
    "providerContactDisclosure",
  ]);
  assert.equal(result.events.length, 3);
});

test("does not create duplicate audit events for unchanged consent values", () => {
  const result = build({
    previousConsent: {
      ...previousConsent,
      buyerContactDisclosure: true,
    },
    consentPatch: {
      buyerContactDisclosure: true,
      exactLocationDisclosure: true,
    },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(result.changedFields, ["exactLocationDisclosure"]);
  assert.equal(result.events.length, 1);
});

test("maps buyer and provider contact consent to the contact-details category", () => {
  const result = build({
    consentPatch: {
      buyerContactDisclosure: true,
      providerContactDisclosure: true,
    },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(
    result.events.map((event) => event.dataCategory),
    ["contact_details", "contact_details"],
  );
});

test("rejects a different actor attempting to change the farmer's consent", () => {
  assert.deepEqual(build({ actorUserId: "operator-1" }), {
    status: "invalid",
    events: [],
    changedFields: [],
    reason: "actor_must_be_farmer",
  });
});

test("rejects incomplete or malformed persisted consent state", () => {
  const result = build({
    previousConsent: {
      approximateLocationSharing: false,
    },
    consentPatch: { approximateLocationSharing: true },
  });

  assert.equal(result.status, "invalid");
  if (result.status !== "invalid") return;
  assert.equal(result.reason, "invalid_consent_state");
});

test("rejects malformed patches and unsupported consent fields", () => {
  const malformed = build({
    consentPatch: { approximateLocationSharing: "yes" },
  });
  const unsupported = build({
    consentPatch: { shareAllPrivateData: true },
  });
  const notAnObject = build({ consentPatch: null });

  for (const result of [malformed, unsupported, notAnObject]) {
    assert.equal(result.status, "invalid");
    if (result.status === "invalid") {
      assert.equal(result.reason, "invalid_consent_patch");
    }
  }
});

test("rejects invalid timestamps, impossible dates and missing user identities", () => {
  const invalidTimestamp = build({ occurredAt: "not-a-date" });
  const impossibleDate = build({ occurredAt: "2026-02-30T15:30:00.000Z" });
  const missingActor = build({ actorUserId: " " });
  const invalidRequest = buildFarmerConsentAuditEvents(null);

  assert.equal(invalidTimestamp.status, "invalid");
  if (invalidTimestamp.status === "invalid") {
    assert.equal(invalidTimestamp.reason, "invalid_timestamp");
  }
  assert.equal(impossibleDate.status, "invalid");
  if (impossibleDate.status === "invalid") {
    assert.equal(impossibleDate.reason, "invalid_timestamp");
  }
  assert.equal(missingActor.status, "invalid");
  if (missingActor.status === "invalid") {
    assert.equal(missingActor.reason, "invalid_request");
  }
  assert.equal(invalidRequest.status, "invalid");
  if (invalidRequest.status === "invalid") {
    assert.equal(invalidRequest.reason, "invalid_request");
  }
});

test("does not include contact, phone, address or exact location values in audit events", () => {
  const result = build({
    consentPatch: {
      approximateLocationSharing: true,
      buyerContactDisclosure: true,
    },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  const serialized = JSON.stringify(result.events);
  for (const privateValue of ["phone", "address", "latitude", "longitude", "coordinates"]) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test("exports the exact four auditable consent fields", () => {
  assert.deepEqual(FARMER_CONSENT_FIELDS, [
    "approximateLocationSharing",
    "exactLocationDisclosure",
    "buyerContactDisclosure",
    "providerContactDisclosure",
  ]);
});
