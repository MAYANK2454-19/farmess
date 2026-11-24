import assert from "node:assert/strict";
import test from "node:test";

import { parseAccessRequest, parseAccessReview } from "./access-request.ts";

const validRequest = {
  requested_role: "buyer",
  requester_name: " Asha Verma ",
  organisation_name: "Jammu Fresh Traders",
  reason: "We buy tomatoes and apples weekly for retail stores in Jammu.",
};

test("a complete buyer request is accepted and trimmed", () => {
  const result = parseAccessRequest(validRequest);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.requester_name, "Asha Verma");
});

test("operator access can be requested", () => {
  assert.equal(parseAccessRequest({ ...validRequest, requested_role: "operator" }).ok, true);
});

test("admin and farmer roles can never be requested", () => {
  assert.equal(parseAccessRequest({ ...validRequest, requested_role: "admin" }).ok, false);
  assert.equal(parseAccessRequest({ ...validRequest, requested_role: "farmer" }).ok, false);
});

test("clients cannot set review or identity fields", () => {
  for (const extra of [{ status: "approved" }, { user_id: "x" }, { reviewed_by_user_id: "x" }]) {
    assert.equal(parseAccessRequest({ ...validRequest, ...extra }).ok, false);
  }
});

test("short reasons and missing names are rejected", () => {
  assert.equal(parseAccessRequest({ ...validRequest, reason: "please" }).ok, false);
  assert.equal(parseAccessRequest({ ...validRequest, requester_name: "" }).ok, false);
  assert.equal(parseAccessRequest({ ...validRequest, organisation_name: "x" }).ok, false);
  assert.equal(parseAccessRequest(null).ok, false);
});

test("a review needs a valid id, decision and note", () => {
  const id = "3f0b2c1e-6a4d-4f8e-9b2a-1c2d3e4f5a6b";
  assert.equal(
    parseAccessReview({ id, decision: "approved", review_note: "Verified trade licence." }).ok,
    true,
  );
  assert.equal(parseAccessReview({ id, decision: "approved", review_note: "ok" }).ok, false);
  assert.equal(
    parseAccessReview({ id, decision: "maybe", review_note: "Verified licence." }).ok,
    false,
  );
  assert.equal(
    parseAccessReview({ id: "not-a-uuid", decision: "rejected", review_note: "Not a buyer." }).ok,
    false,
  );
});
