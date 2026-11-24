import assert from "node:assert/strict";
import test from "node:test";
import { parseServiceRequestCancellation } from "./request-cancellation.ts";

const requestId = "a0b1c2d3-e4f5-4678-9012-abcdefabcdef";

test("accepts a cancellation action with a valid request ID", () => {
  assert.deepEqual(parseServiceRequestCancellation({ id: requestId, action: "cancel" }), {
    valid: true,
    id: requestId,
  });
});

test("rejects malformed IDs and unknown actions", () => {
  assert.equal(
    parseServiceRequestCancellation({ id: "not-a-uuid", action: "cancel" }).valid,
    false,
  );
  assert.equal(
    parseServiceRequestCancellation({ id: requestId, action: "accept" }).valid,
    false,
  );
});

test("rejects extra fields and non-object payloads", () => {
  assert.equal(
    parseServiceRequestCancellation({
      id: requestId,
      action: "cancel",
      requester_id: requestId,
    }).valid,
    false,
  );
  assert.equal(parseServiceRequestCancellation(null).valid, false);
  assert.equal(parseServiceRequestCancellation([]).valid, false);
});
