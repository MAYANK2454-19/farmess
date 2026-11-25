import type { NotificationRelatedEntityType } from "./inbox";

export type NotificationDedupeInput = {
  recipientUserId: string;
  eventType: string;
  relatedEntityType?: NotificationRelatedEntityType | null;
  relatedEntityId?: string | null;
};

function requiredPart(value: string, fieldName: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(fieldName + " must not be empty.");
  return normalized;
}

/**
 * Build a deterministic key for one recipient-scoped notification event.
 *
 * Persistence should enforce uniqueness on this key (or its equivalent)
 * when inserting notifications. This helper does not authorize recipients
 * or perform persistence.
 */
export function buildNotificationDedupeKey(input: NotificationDedupeInput): string {
  const recipient = requiredPart(input.recipientUserId, "recipientUserId");
  const eventType = requiredPart(input.eventType, "eventType");
  const entityType = input.relatedEntityType?.trim() ?? "";
  const entityId = input.relatedEntityId?.trim() ?? "";

  if ((entityType && !entityId) || (!entityType && entityId)) {
    throw new Error("relatedEntityType and relatedEntityId must be provided together.");
  }

  return [recipient, eventType, entityType, entityId].map(encodeURIComponent).join(":");
}
