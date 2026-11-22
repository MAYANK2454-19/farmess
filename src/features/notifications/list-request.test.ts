import assert from "node:assert/strict";
import test from "node:test";

import { parseNotificationListQuery } from "./list-request.ts";

test("uses the default page size when no supported query parameters are supplied", () => {
  assert.deepEqual(parseNotificationListQuery({}), {
    status: "valid",
    data: { limit: 20 },
    errors: {},
  });
});

test("accepts a bounded whole-number page size", () => {
  assert.deepEqual(parseNotificationListQuery({ limit: "1" }), {
    status: "valid",
    data: { limit: 1 },
    errors: {},
  });
  assert.deepEqual(parseNotificationListQuery({ limit: "50" }), {
    status: "valid",
    data: { limit: 50 },
    errors: {},
  });
});

test("rejects missing, fractional, signed, exponential and out-of-range limits", () => {
  for (const limit of ["", "0", "51", "-1", "+2", "1.5", "1e2", "abc"]) {
    const result = parseNotificationListQuery({ limit });
    assert.equal(result.status, "invalid", "Expected limit to be rejected: " + limit);
    if (result.status !== "invalid") continue;
    assert.equal(result.reason, "invalid_limit");
    assert.ok(result.errors.limit);
  }
});

test("rejects a non-string page size rather than coercing it", () => {
  const result = parseNotificationListQuery({ limit: 20 });

  assert.equal(result.status, "invalid");
  if (result.status !== "invalid") return;
  assert.equal(result.reason, "invalid_limit");
});

test("accepts a complete ISO timestamp and cursor ID", () => {
  assert.deepEqual(
    parseNotificationListQuery({
      limit: "10",
      beforeCreatedAt: "2026-11-22T10:30:00.000Z",
      beforeId: "notification-123",
    }),
    {
      status: "valid",
      data: {
        limit: 10,
        before: {
          createdAt: "2026-11-22T10:30:00.000Z",
          id: "notification-123",
        },
      },
      errors: {},
    },
  );
});

test("accepts timezone-offset cursor timestamps", () => {
  const result = parseNotificationListQuery({
    beforeCreatedAt: "2026-11-22T15:30:00+05:30",
    beforeId: "notification-123",
  });

  assert.equal(result.status, "valid");
});

test("rejects incomplete cursor pairs", () => {
  const missingId = parseNotificationListQuery({
    beforeCreatedAt: "2026-11-22T10:30:00Z",
  });
  const missingDate = parseNotificationListQuery({
    beforeId: "notification-123",
  });

  assert.equal(missingId.status, "invalid");
  assert.equal(missingDate.status, "invalid");
  if (missingId.status === "invalid") assert.ok(missingId.errors.request);
  if (missingDate.status === "invalid") assert.ok(missingDate.errors.request);
});

test("rejects invalid, timezone-free and impossible cursor timestamps", () => {
  for (const beforeCreatedAt of [
    "not-a-date",
    "2026-11-22",
    "2026-11-22T10:30:00",
    "2026-02-30T10:30:00Z",
    "2026-13-01T10:30:00Z",
    "2026-11-22T25:00:00Z",
    "2026-11-22T10:30:00+15:00",
  ]) {
    const result = parseNotificationListQuery({
      beforeCreatedAt,
      beforeId: "notification-123",
    });
    assert.equal(result.status, "invalid", "Expected timestamp to be rejected: " + beforeCreatedAt);
    if (result.status !== "invalid") continue;
    assert.equal(result.reason, "invalid_cursor");
    assert.ok(result.errors.beforeCreatedAt);
  }
});

test("rejects empty and overlong cursor IDs", () => {
  for (const beforeId of [" ", "n".repeat(129)]) {
    const result = parseNotificationListQuery({
      beforeCreatedAt: "2026-11-22T10:30:00Z",
      beforeId,
    });
    assert.equal(result.status, "invalid");
    if (result.status !== "invalid") continue;
    assert.ok(result.errors.beforeId);
  }
});

test("rejects null, arrays and non-object query input", () => {
  for (const input of [null, [], "limit=10", 12]) {
    const result = parseNotificationListQuery(input);
    assert.equal(result.status, "invalid");
    if (result.status !== "invalid") continue;
    assert.equal(result.reason, "invalid_query");
  }
});

test("ignores client-supplied recipient, role, read state and sort direction", () => {
  const result = parseNotificationListQuery({
    limit: "15",
    recipientUserId: "another-user",
    userId: "another-user",
    role: "admin",
    unreadOnly: "false",
    sort: "oldest",
    readAt: "2000-01-01T00:00:00Z",
  });

  assert.deepEqual(result, {
    status: "valid",
    data: { limit: 15 },
    errors: {},
  });
});
