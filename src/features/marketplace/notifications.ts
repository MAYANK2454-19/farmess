export const NOTIFICATION_EVENT_TYPES = [
  "new_offer",
  "offer_accepted",
  "offer_declined",
  "offer_withdrawn",
  "offer_expired",
  "logistics_request_received",
  "logistics_provider_responded",
  "sale_milestone_recorded",
] as const;

export type NotificationEventType = (typeof NOTIFICATION_EVENT_TYPES)[number];

export type NotificationDraft = {
  recipientUserId: string;
  eventType: NotificationEventType;
  title: string;
  body: string;
  relatedEntityType: "offer" | "logistics_request" | "sale";
  relatedEntityId: string;
  dedupeKey: string;
};

/**
 * Build a stable idempotency key for a persisted notification.
 * This is a domain helper only: the database must enforce uniqueness on
 * (recipient_user_id, dedupe_key) to make concurrent delivery idempotent.
 */
export function notificationDedupeKey(
  eventType: NotificationEventType,
  entityType: NotificationDraft["relatedEntityType"],
  entityId: string,
  eventVersion: string,
): string {
  return [eventType, entityType, entityId, eventVersion].map(encodeURIComponent).join(":");
}

export function createNotificationDraft(
  input: Omit<NotificationDraft, "dedupeKey"> & {
    eventVersion: string;
  },
): NotificationDraft {
  const recipientUserId = input.recipientUserId.trim();
  const entityId = input.relatedEntityId.trim();
  const eventVersion = input.eventVersion.trim();
  const title = input.title.trim();
  const body = input.body.trim();

  if (!recipientUserId || !entityId || !eventVersion) {
    throw new Error("Recipient, related record and event version are required.");
  }
  if (!title || title.length > 120) {
    throw new Error("Notification title must contain 1–120 characters.");
  }
  if (!body || body.length > 280) {
    throw new Error("Notification body must contain 1–280 characters.");
  }
  if (/\b(?:\+?\d[\d\s()-]{7,}\d)\b/.test(body)) {
    throw new Error("Notification body must not contain a phone number.");
  }

  return {
    recipientUserId,
    eventType: input.eventType,
    title,
    body,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: entityId,
    dedupeKey: notificationDedupeKey(
      input.eventType,
      input.relatedEntityType,
      entityId,
      eventVersion,
    ),
  };
}
