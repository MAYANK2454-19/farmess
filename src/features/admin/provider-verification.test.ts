import assert from "node:assert/strict";
import test from "node:test";

import {
  parseProviderVerificationReview,
  PROVIDER_VERIFICATION_STATES,
} from "./provider-verification.ts";

const listingId = "5f5a4e2e-63a7-4f3e-9c2a-5f4f3b1e9a21";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: listingId,
    verification_state: "platform_verified",
    review_note: "Documents and provider contact were checked.",
    ...overrides,
  };
}

test("accepts and trims a valid platform verification review", () => {
  assert.deepEqual(
    parseProviderVerificationReview(
      payload({ review_note: "  Contact and documents checked carefully.  " }),
    ),
    {
      id: listingId,
      verificationState: "platform_verified",
      reviewNote: "Contact and documents checked carefully.",
    },
  );
});

test("accepts each supported verification state", () => {
  for (const verificationState of PROVIDER_VERIFICATION_STATES) {
    assert.equal(
      parseProviderVerificationReview(payload({ verification_state: verificationState }))
        ?.verificationState,
      verificationState,
    );
  }
});

test("rejects malformed listing identifiers", () => {
  assert.equal(parseProviderVerificationReview(payload({ id: "not-a-uuid" })), null);
});

test("rejects unsupported verification states", () => {
  assert.equal(parseProviderVerificationReview(payload({ verification_state: "verified" })), null);
});

test("rejects review notes shorter than twenty characters", () => {
  assert.equal(parseProviderVerificationReview(payload({ review_note: "Too short" })), null);
});

test("rejects review notes longer than five hundred characters", () => {
  assert.equal(parseProviderVerificationReview(payload({ review_note: "x".repeat(501) })), null);
});

test("rejects unknown fields rather than silently accepting client-controlled metadata", () => {
  assert.equal(parseProviderVerificationReview(payload({ reviewed_by_user_id: listingId })), null);
});

test("rejects arrays, null and incomplete payloads", () => {
  assert.equal(parseProviderVerificationReview(null), null);
  assert.equal(parseProviderVerificationReview([]), null);
  assert.equal(parseProviderVerificationReview({ id: listingId }), null);
});
