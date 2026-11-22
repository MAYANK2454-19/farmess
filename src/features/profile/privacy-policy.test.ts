import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_FARMER_PRIVACY_CONSENTS,
  evaluateFarmerDataDisclosure,
  type FarmerDisclosureRequest,
  type FarmerPrivacyConsents,
} from "./privacy-policy.ts";

const buyerRequest: FarmerDisclosureRequest = {
  viewerId: "buyer-1",
  viewerRole: "buyer",
  farmerId: "farmer-1",
  dataCategory: "approximate_location",
  workflow: "market_matching",
  consent: {
    ...DEFAULT_FARMER_PRIVACY_CONSENTS,
    approximateLocationSharing: true,
  },
};

const operatorRequest: FarmerDisclosureRequest = {
  viewerId: "operator-1",
  viewerRole: "operator",
  farmerId: "farmer-1",
  dataCategory: "contact_details",
  workflow: "assigned_logistics",
  consent: {
    ...DEFAULT_FARMER_PRIVACY_CONSENTS,
    providerContactDisclosure: true,
  },
};

test("defaults every privacy consent to opt-out", () => {
  assert.deepEqual(DEFAULT_FARMER_PRIVACY_CONSENTS, {
    approximateLocationSharing: false,
    exactLocationDisclosure: false,
    buyerContactDisclosure: false,
    providerContactDisclosure: false,
  });

  assert.deepEqual(evaluateFarmerDataDisclosure(buyerRequest), {
    allowed: true,
    reason: "consented_workflow",
  });
});

test("allows a farmer to access their own information without cross-user consent", () => {
  assert.deepEqual(
    evaluateFarmerDataDisclosure({
      viewerId: "farmer-1",
      viewerRole: "farmer",
      farmerId: "farmer-1",
      dataCategory: "exact_location",
      workflow: "market_matching",
      consent: DEFAULT_FARMER_PRIVACY_CONSENTS,
    }),
    { allowed: true, reason: "self_access" },
  );
});

test("allows approximate location for a buyer only in market matching with consent", () => {
  assert.deepEqual(evaluateFarmerDataDisclosure(buyerRequest), {
    allowed: true,
    reason: "consented_workflow",
  });

  assert.deepEqual(
    evaluateFarmerDataDisclosure({
      ...buyerRequest,
      consent: DEFAULT_FARMER_PRIVACY_CONSENTS,
    }),
    { allowed: false, reason: "consent_required" },
  );
});

test("allows approximate location for an assigned operator only with consent", () => {
  assert.deepEqual(
    evaluateFarmerDataDisclosure({
      ...operatorRequest,
      dataCategory: "approximate_location",
      consent: {
        ...DEFAULT_FARMER_PRIVACY_CONSENTS,
        approximateLocationSharing: true,
      },
    }),
    { allowed: true, reason: "consented_workflow" },
  );
});

test("does not expose contact details during buyer market matching", () => {
  assert.deepEqual(
    evaluateFarmerDataDisclosure({
      ...buyerRequest,
      dataCategory: "contact_details",
      consent: {
        ...DEFAULT_FARMER_PRIVACY_CONSENTS,
        buyerContactDisclosure: true,
      },
    }),
    { allowed: false, reason: "workflow_not_authorized" },
  );
});

test("allows buyer contact disclosure only for an accepted offer and separate consent", () => {
  const request: FarmerDisclosureRequest = {
    ...buyerRequest,
    dataCategory: "contact_details",
    workflow: "accepted_offer",
    consent: {
      ...DEFAULT_FARMER_PRIVACY_CONSENTS,
      buyerContactDisclosure: true,
    },
  };

  assert.deepEqual(evaluateFarmerDataDisclosure(request), {
    allowed: true,
    reason: "consented_workflow",
  });
  assert.deepEqual(
    evaluateFarmerDataDisclosure({
      ...request,
      consent: DEFAULT_FARMER_PRIVACY_CONSENTS,
    }),
    { allowed: false, reason: "consent_required" },
  );
});

test("allows provider contact disclosure only in an assigned logistics workflow", () => {
  assert.deepEqual(evaluateFarmerDataDisclosure(operatorRequest), {
    allowed: true,
    reason: "consented_workflow",
  });
  assert.deepEqual(
    evaluateFarmerDataDisclosure({
      ...operatorRequest,
      workflow: "market_matching",
    }),
    { allowed: false, reason: "workflow_not_authorized" },
  );
});

test("exact location requires its own explicit consent and a transaction workflow", () => {
  const request: FarmerDisclosureRequest = {
    ...buyerRequest,
    dataCategory: "exact_location",
    workflow: "accepted_offer",
    consent: {
      ...DEFAULT_FARMER_PRIVACY_CONSENTS,
      exactLocationDisclosure: true,
    },
  };

  assert.deepEqual(evaluateFarmerDataDisclosure(request), {
    allowed: true,
    reason: "consented_workflow",
  });
  assert.deepEqual(
    evaluateFarmerDataDisclosure({
      ...request,
      consent: {
        ...request.consent,
        exactLocationDisclosure: false,
      },
    }),
    { allowed: false, reason: "consent_required" },
  );
});

test("does not allow an admin to bypass disclosure purpose or consent checks", () => {
  assert.deepEqual(
    evaluateFarmerDataDisclosure({
      ...buyerRequest,
      viewerRole: "admin",
    }),
    { allowed: false, reason: "workflow_not_authorized" },
  );
});

test("fails closed for missing identities, unknown roles and malformed requests", () => {
  const invalidRequests: FarmerDisclosureRequest[] = [
    { ...buyerRequest, viewerId: null },
    { ...buyerRequest, farmerId: " " },
    { ...buyerRequest, viewerRole: null },
    { ...buyerRequest, dataCategory: "gps" as never },
    { ...buyerRequest, workflow: "public_profile" as never },
  ];

  for (const request of invalidRequests) {
    assert.deepEqual(evaluateFarmerDataDisclosure(request), {
      allowed: false,
      reason: "invalid_request",
    });
  }
});

test("treats missing consent as opt-out and malformed consent as invalid", () => {
  assert.deepEqual(
    evaluateFarmerDataDisclosure({
      ...buyerRequest,
      consent: undefined,
    }),
    { allowed: false, reason: "consent_required" },
  );

  assert.deepEqual(
    evaluateFarmerDataDisclosure({
      ...buyerRequest,
      consent: { approximateLocationSharing: "yes" } as unknown as FarmerPrivacyConsents,
    }),
    { allowed: false, reason: "invalid_request" },
  );
});

test("requires consent flags to be purpose-specific", () => {
  const buyerContactOnly = {
    ...DEFAULT_FARMER_PRIVACY_CONSENTS,
    buyerContactDisclosure: true,
  };

  assert.deepEqual(
    evaluateFarmerDataDisclosure({
      ...buyerRequest,
      dataCategory: "approximate_location",
      consent: buyerContactOnly,
    }),
    { allowed: false, reason: "consent_required" },
  );

  assert.deepEqual(
    evaluateFarmerDataDisclosure({
      ...buyerRequest,
      dataCategory: "contact_details",
      workflow: "accepted_offer",
      consent: buyerContactOnly,
    }),
    { allowed: true, reason: "consented_workflow" },
  );
});
