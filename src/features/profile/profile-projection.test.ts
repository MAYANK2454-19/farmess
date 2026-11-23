import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_FARMER_PRIVACY_CONSENTS, type FarmerPrivacyConsents } from "./privacy-policy.ts";
import { buildFarmerProfileProjection } from "./profile-projection.ts";

const profile = {
  userId: "farmer-1",
  displayName: "Farmer One",
  marketArea: "Katra market",
  phoneNumber: "+919876543210",
  exactLocation: {
    latitude: 32.9912,
    longitude: 74.9312,
  },
  consents: { ...DEFAULT_FARMER_PRIVACY_CONSENTS },
};

test("returns a minimal profile with private fields omitted by default", () => {
  const result = buildFarmerProfileProjection({
    viewerId: "buyer-1",
    viewerRole: "buyer",
    workflow: "market_matching",
    profile,
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(result.view, {
    displayName: "Farmer One",
    approximateLocation: null,
    contactDetails: null,
    exactLocation: null,
  });
});

test("shows approximate location for buyer matching only with explicit consent", () => {
  const result = buildFarmerProfileProjection({
    viewerId: "buyer-1",
    viewerRole: "buyer",
    workflow: "market_matching",
    profile: {
      ...profile,
      consents: {
        ...DEFAULT_FARMER_PRIVACY_CONSENTS,
        approximateLocationSharing: true,
      },
    },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.equal(result.view.approximateLocation, "Katra market");
  assert.equal(result.view.contactDetails, null);
  assert.equal(result.view.exactLocation, null);
});

test("shows buyer contact and exact location only after accepted offer and separate consents", () => {
  const result = buildFarmerProfileProjection({
    viewerId: "buyer-1",
    viewerRole: "buyer",
    workflow: "accepted_offer",
    profile: {
      ...profile,
      consents: {
        ...DEFAULT_FARMER_PRIVACY_CONSENTS,
        buyerContactDisclosure: true,
        exactLocationDisclosure: true,
      },
    },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(result.view.contactDetails, { phoneNumber: "+919876543210" });
  assert.deepEqual(result.view.exactLocation, {
    latitude: 32.9912,
    longitude: 74.9312,
  });
  assert.equal(result.view.approximateLocation, null);
});

test("does not expose buyer contact details during market matching even when consent exists", () => {
  const result = buildFarmerProfileProjection({
    viewerId: "buyer-1",
    viewerRole: "buyer",
    workflow: "market_matching",
    profile: {
      ...profile,
      consents: {
        ...DEFAULT_FARMER_PRIVACY_CONSENTS,
        buyerContactDisclosure: true,
      },
    },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.equal(result.view.contactDetails, null);
});

test("shows provider contact only for assigned logistics and provider consent", () => {
  const result = buildFarmerProfileProjection({
    viewerId: "operator-1",
    viewerRole: "operator",
    workflow: "assigned_logistics",
    profile: {
      ...profile,
      consents: {
        ...DEFAULT_FARMER_PRIVACY_CONSENTS,
        providerContactDisclosure: true,
      },
    },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(result.view.contactDetails, { phoneNumber: "+919876543210" });
  assert.equal(result.view.exactLocation, null);
});

test("shows exact location to an assigned operator only with exact-location consent", () => {
  const result = buildFarmerProfileProjection({
    viewerId: "operator-1",
    viewerRole: "operator",
    workflow: "assigned_logistics",
    profile: {
      ...profile,
      consents: {
        ...DEFAULT_FARMER_PRIVACY_CONSENTS,
        exactLocationDisclosure: true,
      },
    },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(result.view.exactLocation, {
    latitude: 32.9912,
    longitude: 74.9312,
  });
});

test("allows farmers to view their own details independent of sharing consent", () => {
  const result = buildFarmerProfileProjection({
    viewerId: "farmer-1",
    viewerRole: "farmer",
    workflow: "market_matching",
    profile,
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.equal(result.view.approximateLocation, "Katra market");
  assert.deepEqual(result.view.contactDetails, { phoneNumber: "+919876543210" });
  assert.deepEqual(result.view.exactLocation, profile.exactLocation);
});

test("does not give admin a wildcard disclosure bypass", () => {
  const result = buildFarmerProfileProjection({
    viewerId: "admin-1",
    viewerRole: "admin",
    workflow: "accepted_offer",
    profile: {
      ...profile,
      consents: {
        ...DEFAULT_FARMER_PRIVACY_CONSENTS,
        buyerContactDisclosure: true,
        exactLocationDisclosure: true,
      },
    },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(result.view, {
    displayName: "Farmer One",
    approximateLocation: null,
    contactDetails: null,
    exactLocation: null,
  });
});

test("does not return raw profile identifiers, consent flags or private source object", () => {
  const result = buildFarmerProfileProjection({
    viewerId: "buyer-1",
    viewerRole: "buyer",
    workflow: "market_matching",
    profile,
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  const serialized = JSON.stringify(result.view);
  for (const key of [
    "userId",
    "consents",
    "buyerContactDisclosure",
    "latitude",
    "longitude",
    "phoneNumber",
  ]) {
    assert.equal(serialized.includes(key), false);
  }
});

test("fails closed for invalid viewer identity, role and workflow", () => {
  const invalidCases = [
    { viewerId: null, viewerRole: "buyer", workflow: "market_matching" },
    { viewerId: "buyer-1", viewerRole: "superuser", workflow: "market_matching" },
    { viewerId: "buyer-1", viewerRole: "buyer", workflow: "public_profile" },
  ] as const;

  for (const item of invalidCases) {
    const result = buildFarmerProfileProjection({
      ...item,
      profile,
    } as Parameters<typeof buildFarmerProfileProjection>[0]);

    assert.equal(result.status, "invalid");
    if (result.status === "invalid") assert.equal(result.view, null);
  }
});

test("rejects malformed persisted profile fields and impossible exact coordinates", () => {
  const malformedProfiles = [
    null,
    {},
    { ...profile, displayName: " " },
    { ...profile, marketArea: 42 },
    { ...profile, phoneNumber: [] },
    { ...profile, exactLocation: { latitude: 91, longitude: 0 } },
    { ...profile, exactLocation: { latitude: 0, longitude: 181 } },
    { ...profile, exactLocation: { latitude: "32.9", longitude: "74.9" } },
  ];

  for (const invalidProfile of malformedProfiles) {
    const result = buildFarmerProfileProjection({
      viewerId: "buyer-1",
      viewerRole: "buyer",
      workflow: "market_matching",
      profile: invalidProfile,
    });

    assert.equal(result.status, "invalid");
    if (result.status === "invalid") assert.equal(result.view, null);
  }
});

test("treats missing privacy consents as opt-out", () => {
  const result = buildFarmerProfileProjection({
    viewerId: "buyer-1",
    viewerRole: "buyer",
    workflow: "accepted_offer",
    profile: { ...profile, consents: undefined },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.equal(result.view.contactDetails, null);
  assert.equal(result.view.exactLocation, null);
});

test("fails closed on malformed persisted consent flags", () => {
  const result = buildFarmerProfileProjection({
    viewerId: "buyer-1",
    viewerRole: "buyer",
    workflow: "accepted_offer",
    profile: {
      ...profile,
      consents: {
        ...DEFAULT_FARMER_PRIVACY_CONSENTS,
        exactLocationDisclosure: "yes",
      } as unknown as FarmerPrivacyConsents,
    },
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.equal(result.view.exactLocation, null);
  assert.equal(result.decisions.exactLocation.allowed, false);
});
