import assert from "node:assert/strict";
import test from "node:test";
import { countNotificationFilterResults, filterNotificationInbox } from "./inbox-filters.ts";

const records = [
  {
    id: "n-1",
    recipientUserId: "farmer-1",
    createdAt: "2026-11-25T10:00:00Z",
    readAt: null,
    relatedEntityType: "offer" as const,
    relatedEntityId: "offer-9",
  },
  {
    id: "n-2",
    recipientUserId: "farmer-1",
    createdAt: "2026-11-25T09:00:00Z",
    readAt: "2026-11-25T09:30:00Z",
    relatedEntityType: "logistics_request" as const,
    relatedEntityId: "log-4",
  },
  {
    id: "n-3",
    recipientUserId: "farmer-1",
    createdAt: "2026-11-25T08:00:00Z",
    readAt: null,
    relatedEntityType: "sale" as const,
    relatedEntityId: "sale-2",
  },
];

test("filters unread notifications", () => {
  assert.deepEqual(
    filterNotificationInbox(records, { read: "unread" }).map((record) => record.id),
    ["n-1", "n-3"],
  );
});

test("filters by related entity and search query", () => {
  assert.deepEqual(
    filterNotificationInbox(records, {
      relatedEntityType: "offer",
      query: "offer-9",
    }).map((record) => record.id),
    ["n-1"],
  );
});

test("supports read-only filter", () => {
  assert.deepEqual(
    filterNotificationInbox(records, { read: "read" }).map((record) => record.id),
    ["n-2"],
  );
});

test("returns stable counts", () => {
  assert.deepEqual(countNotificationFilterResults(records), { all: 3, unread: 2, read: 1 });
});

test("does not mutate the input collection", () => {
  const snapshot = records.map((record) => ({ ...record }));
  filterNotificationInbox(records, { query: "sale" });
  assert.deepEqual(records, snapshot);
});
