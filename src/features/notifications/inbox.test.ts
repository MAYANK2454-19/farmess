import assert from "node:assert/strict";
import test from "node:test";

import {
  countUnreadNotifications,
  getNotificationTarget,
  listRecipientNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationInboxRecord,
} from "./inbox.ts";

type TestNotification = NotificationInboxRecord & {
  title: string;
};

const farmerOne: TestNotification = {
  id: "notification-1",
  recipientUserId: "farmer-1",
  createdAt: "2026-11-22T10:00:00.000Z",
  readAt: null,
  relatedEntityType: "offer",
  relatedEntityId: "offer-1",
  title: "New offer",
};

const farmerTwo: TestNotification = {
  id: "notification-2",
  recipientUserId: "farmer-2",
  createdAt: "2026-11-22T11:00:00.000Z",
  readAt: null,
  relatedEntityType: "sale",
  relatedEntityId: "sale-1",
  title: "Sale update",
};

const farmerOneOlder: TestNotification = {
  id: "notification-3",
  recipientUserId: "farmer-1",
  createdAt: "2026-11-21T10:00:00.000Z",
  readAt: "2026-11-21T11:00:00.000Z",
  relatedEntityType: "logistics_request",
  relatedEntityId: "request-1",
  title: "Provider responded",
};

test("lists only the verified recipient's notifications", () => {
  const result = listRecipientNotifications([farmerOne, farmerTwo, farmerOneOlder], "farmer-1");

  assert.deepEqual(
    result.items.map((item) => item.id),
    ["notification-1", "notification-3"],
  );
  assert.equal(result.unreadCount, 1);
  assert.equal(
    result.items.some((item) => item.recipientUserId === "farmer-2"),
    false,
  );
});

test("returns an empty inbox when the recipient identity is missing", () => {
  const result = listRecipientNotifications([farmerOne, farmerTwo], null);

  assert.deepEqual(result, { items: [], unreadCount: 0, nextCursor: null });
  assert.equal(countUnreadNotifications([farmerOne, farmerTwo], undefined), 0);
});

test("orders equal timestamps deterministically by descending ID", () => {
  const second = { ...farmerOne, id: "notification-b" };
  const first = { ...farmerOne, id: "notification-a" };
  const result = listRecipientNotifications([first, second], "farmer-1");

  assert.deepEqual(
    result.items.map((item) => item.id),
    ["notification-b", "notification-a"],
  );
});

test("uses a stable cursor without repeating the last item from the prior page", () => {
  const records = [
    farmerOne,
    { ...farmerOne, id: "notification-4", createdAt: "2026-11-22T09:00:00.000Z" },
    farmerOneOlder,
  ];

  const firstPage = listRecipientNotifications(records, "farmer-1", { limit: 2 });
  assert.equal(firstPage.items.length, 2);
  assert.deepEqual(firstPage.nextCursor, {
    createdAt: "2026-11-22T09:00:00.000Z",
    id: "notification-4",
  });

  const secondPage = listRecipientNotifications(records, "farmer-1", {
    limit: 2,
    before: firstPage.nextCursor ?? undefined,
  });
  assert.deepEqual(
    secondPage.items.map((item) => item.id),
    ["notification-3"],
  );
  assert.equal(secondPage.nextCursor, null);
});

test("counts unread notifications across the full inbox, not only the current page", () => {
  const records = [
    farmerOne,
    farmerTwo,
    { ...farmerOne, id: "notification-4", readAt: null },
    farmerOneOlder,
  ];

  const result = listRecipientNotifications(records, "farmer-1", { limit: 1 });

  assert.equal(result.items.length, 1);
  assert.equal(result.unreadCount, 2);
});

test("rejects invalid page sizes and cursors", () => {
  assert.throws(() => listRecipientNotifications([farmerOne], "farmer-1", { limit: 0 }));
  assert.throws(() => listRecipientNotifications([farmerOne], "farmer-1", { limit: 51 }));
  assert.throws(() =>
    listRecipientNotifications([farmerOne], "farmer-1", {
      before: { createdAt: "not-a-date", id: "notification-1" },
    }),
  );
});

test("mark-one changes only an unread notification owned by the recipient", () => {
  const original = [farmerOne, farmerTwo, farmerOneOlder];
  const result = markNotificationRead(
    original,
    "farmer-1",
    "notification-1",
    "2026-11-22T12:00:00.000Z",
  );

  assert.equal(result.changedCount, 1);
  assert.equal(result.records[0].readAt, "2026-11-22T12:00:00.000Z");
  assert.equal(result.records[1].readAt, null);
  assert.equal(result.records[2].readAt, farmerOneOlder.readAt);
  assert.equal(original[0].readAt, null);
});

test("mark-one cannot read another recipient's notification and is idempotent", () => {
  const unauthorised = markNotificationRead(
    [farmerOne, farmerTwo],
    "farmer-1",
    "notification-2",
    "2026-11-22T12:00:00.000Z",
  );
  assert.equal(unauthorised.changedCount, 0);
  assert.equal(unauthorised.records[1].readAt, null);

  const alreadyRead = markNotificationRead(
    [farmerOneOlder],
    "farmer-1",
    "notification-3",
    "2026-11-22T12:00:00.000Z",
  );
  assert.equal(alreadyRead.changedCount, 0);
  assert.equal(alreadyRead.records[0].readAt, farmerOneOlder.readAt);
});

test("mark-all changes only unread notifications for the recipient", () => {
  const result = markAllNotificationsRead(
    [farmerOne, farmerTwo, farmerOneOlder],
    "farmer-1",
    "2026-11-22T12:30:00.000Z",
  );

  assert.equal(result.changedCount, 1);
  assert.equal(result.records[0].readAt, "2026-11-22T12:30:00.000Z");
  assert.equal(result.records[1].readAt, null);
  assert.equal(result.records[2].readAt, farmerOneOlder.readAt);
});

test("mark-all is a no-op without a verified recipient and on a second call", () => {
  const unauthorised = markAllNotificationsRead([farmerOne], "", "2026-11-22T12:30:00.000Z");
  assert.equal(unauthorised.changedCount, 0);

  const first = markAllNotificationsRead([farmerOne], "farmer-1", "2026-11-22T12:30:00.000Z");
  const second = markAllNotificationsRead(first.records, "farmer-1", "2026-11-22T12:45:00.000Z");
  assert.equal(first.changedCount, 1);
  assert.equal(second.changedCount, 0);
  assert.equal(second.records[0].readAt, "2026-11-22T12:30:00.000Z");
});

test("returns a related-record target only for supported types and non-empty IDs", () => {
  assert.deepEqual(
    getNotificationTarget({ relatedEntityType: "offer", relatedEntityId: "offer-1" }),
    { entityType: "offer", entityId: "offer-1" },
  );
  assert.deepEqual(
    getNotificationTarget({
      relatedEntityType: "logistics_request",
      relatedEntityId: "request-1",
    }),
    { entityType: "logistics_request", entityId: "request-1" },
  );
  assert.equal(getNotificationTarget({ relatedEntityType: "sale", relatedEntityId: " " }), null);
  assert.equal(getNotificationTarget({ relatedEntityType: null, relatedEntityId: null }), null);
});
