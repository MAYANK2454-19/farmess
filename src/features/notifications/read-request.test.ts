import assert from "node:assert/strict";
import test from "node:test";

import { parseNotificationReadRequest } from "./read-request.ts";

test("accepts mark-one-read with a trimmed notification ID", () => {
  assert.deepEqual(parseNotificationReadRequest({
    action: "mark_one_read",
    notificationId: " notification-123 ",
  }), {
    status: "valid",
    data: {
      action: "mark_one_read",
      notificationId: "notification-123",
    },
    errors: {},
  });
});

test("accepts mark-all-read without requiring a notification ID", () => {
  assert.deepEqual(
    parseNotificationReadRequest({ action: "mark_all_read" }),
    {
      status: "valid",
      data: { action: "mark_all_read" },
      errors: {},
    },
  );
});

test("rejects null, arrays, primitives and non-object payloads", () => {
  for (const input of [null, [], "mark_all_read", 12, false]) {
    assert.deepEqual(parseNotificationReadRequest(input), {
      status: "invalid",
      data: null,
      reason: "invalid_payload",
      errors: {
        request: "Expected a JSON object containing a notification read action.",
      },
    });
  }
});

test("rejects a missing or non-string action", () => {
  for (const input of [{}, { action: null }, { action: 2 }]) {
    const result = parseNotificationReadRequest(input);
    assert.equal(result.status, "invalid");
    if (result.status !== "invalid") continue;
    assert.equal(result.reason, "invalid_action");
    assert.ok(result.errors.action);
  }
});

test("rejects unsupported notification actions", () => {
  const result = parseNotificationReadRequest({ action: "delete_all" });

  assert.deepEqual(result, {
    status: "invalid",
    data: null,
    reason: "invalid_action",
    errors: {
      action: "Action must be mark_one_read or mark_all_read.",
    },
  });
});

test("requires a string notification ID for mark-one-read", () => {
  for (const input of [
    { action: "mark_one_read" },
    { action: "mark_one_read", notificationId: null },
    { action: "mark_one_read", notificationId: 7 },
  ]) {
    const result = parseNotificationReadRequest(input);
    assert.equal(result.status, "invalid");
    if (result.status !== "invalid") continue;
    assert.equal(result.reason, "invalid_fields");
    assert.ok(result.errors.notificationId);
  }
});

test("rejects blank and overlong notification IDs", () => {
  const blank = parseNotificationReadRequest({
    action: "mark_one_read",
    notificationId: "  ",
  });
  const tooLong = parseNotificationReadRequest({
    action: "mark_one_read",
    notificationId: "n".repeat(129),
  });

  assert.equal(blank.status, "invalid");
  assert.equal(tooLong.status, "invalid");
  if (blank.status === "invalid") assert.ok(blank.errors.notificationId);
  if (tooLong.status === "invalid") assert.ok(tooLong.errors.notificationId);
});

test("does not accept recipient IDs, read timestamps or client-supplied user identities", () => {
  const result = parseNotificationReadRequest({
    action: "mark_one_read",
    notificationId: "notification-1",
    recipientUserId: "victim-user",
    userId: "victim-user",
    readAt: "2000-01-01T00:00:00.000Z",
    role: "admin",
  });

  assert.equal(result.status, "valid");
  if (result.status !== "valid") return;

  assert.deepEqual(result.data, {
    action: "mark_one_read",
    notificationId: "notification-1",
  });
  assert.equal("recipientUserId" in result.data, false);
  assert.equal("readAt" in result.data, false);
  assert.equal("userId" in result.data, false);
});

test("ignores extra fields for mark-all-read and returns only the action", () => {
  const result = parseNotificationReadRequest({
    action: "mark_all_read",
    notificationId: "not-used",
    recipientUserId: "another-user",
    readAt: "2000-01-01T00:00:00Z",
  });

  assert.deepEqual(result, {
    status: "valid",
    data: { action: "mark_all_read" },
    errors: {},
  });
});
