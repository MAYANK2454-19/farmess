import assert from "node:assert/strict";
import test from "node:test";
import { createNotificationDraft, notificationDedupeKey } from "./notifications.ts";

test("notification dedupe key is stable for the same event version", () => {
  assert.equal(
    notificationDedupeKey("new_offer", "offer", "offer-1", "created"),
    notificationDedupeKey("new_offer", "offer", "offer-1", "created"),
  );
  assert.notEqual(
    notificationDedupeKey("new_offer", "offer", "offer-1", "created"),
    notificationDedupeKey("new_offer", "offer", "offer-1", "updated"),
  );
});

test("notification draft trims values and scopes an event to a recipient", () => {
  const draft = createNotificationDraft({
    recipientUserId: " farmer-1 ",
    eventType: "new_offer",
    title: " New offer ",
    body: "A buyer sent an offer for your produce lot.",
    relatedEntityType: "offer",
    relatedEntityId: " offer-1 ",
    eventVersion: " created ",
  });
  assert.equal(draft.recipientUserId, "farmer-1");
  assert.equal(draft.relatedEntityId, "offer-1");
  assert.equal(draft.dedupeKey, "new_offer:offer:offer-1:created");
});

test("notification draft rejects missing recipients and private phone numbers", () => {
  assert.throws(() =>
    createNotificationDraft({
      recipientUserId: " ",
      eventType: "new_offer",
      title: "New offer",
      body: "An offer arrived.",
      relatedEntityType: "offer",
      relatedEntityId: "offer-1",
      eventVersion: "created",
    }),
  );
  assert.throws(() =>
    createNotificationDraft({
      recipientUserId: "farmer-1",
      eventType: "new_offer",
      title: "New offer",
      body: "Call me at +91 98765 43210",
      relatedEntityType: "offer",
      relatedEntityId: "offer-1",
      eventVersion: "created",
    }),
  );
});
