import assert from "node:assert/strict";
import test from "node:test";
import { parseProviderRequestCancellation } from "./request-cancellation.ts";

const requestId = "a0b1c2d3-e4f5-4678-9012-abcdefabcdef";

test("accepts an exact provider cancellation action", () => {
  assert.deepEqual(
    parseProviderRequestCancellation({ id: requestId, action: "cancel" }),
    { valid: true, id: requestId },
  );
});

test("rejects malformed identifiers and unsupported actions", () => {
  assert.equal(
    parseProviderRequestCancellation({ id: "bad", action: "cancel" }).valid,
    false,
  );
  assert.equal(
    parseProviderRequestCancellation({ id: requestId, action: "accept" }).valid,
    false,
  );
});

test("rejects extra fields and non-object payloads", () => {
  assert.equal(
    parseProviderRequestCancellation({
      id: requestId,
      action: "cancel",
      status: "cancelled",
    }).valid,
    false,
  );
  assert.equal(parseProviderRequestCancellation(null).valid, false);
  assert.equal(parseProviderRequestCancellation([]).valid, false);
});
