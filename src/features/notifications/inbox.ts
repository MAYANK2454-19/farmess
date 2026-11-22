export const NOTIFICATION_RELATED_ENTITY_TYPES = [
  "offer",
  "logistics_request",
  "sale",
] as const;

export type NotificationRelatedEntityType =
  (typeof NOTIFICATION_RELATED_ENTITY_TYPES)[number];

export type NotificationInboxRecord = {
  id: string;
  recipientUserId: string;
  createdAt: string;
  readAt: string | null;
  relatedEntityType: NotificationRelatedEntityType | null;
  relatedEntityId: string | null;
};

export type NotificationCursor = {
  createdAt: string;
  id: string;
};

export type NotificationListOptions = {
  limit?: number;
  before?: NotificationCursor;
};

export type NotificationListResult<T extends NotificationInboxRecord> = {
  items: T[];
  unreadCount: number;
  nextCursor: NotificationCursor | null;
};

export type NotificationMutationResult<T extends NotificationInboxRecord> = {
  records: T[];
  changedCount: number;
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

function hasUsableId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function timestampValue(value: string, fieldName: string): number {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(fieldName + " must be a valid date/time.");
  }

  return parsed;
}

function compareIdsDescending(left: string, right: string): number {
  if (left === right) return 0;
  return left > right ? -1 : 1;
}

function compareNewestFirst<T extends NotificationInboxRecord>(left: T, right: T): number {
  const timeDifference =
    timestampValue(right.createdAt, "createdAt") -
    timestampValue(left.createdAt, "createdAt");

  return timeDifference || compareIdsDescending(left.id, right.id);
}

function isBeforeCursor(
  record: NotificationInboxRecord,
  cursor: NotificationCursor,
  cursorTime: number,
): boolean {
  const recordTime = timestampValue(record.createdAt, "createdAt");

  return recordTime < cursorTime || (recordTime === cursorTime && record.id < cursor.id);
}

function validatePageSize(limit: number | undefined): number {
  const pageSize = limit ?? DEFAULT_PAGE_SIZE;

  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) {
    throw new Error("Notification page size must be an integer from 1 to 50.");
  }

  return pageSize;
}

function validateReadTimestamp(readAt: string): void {
  timestampValue(readAt, "readAt");
}

/** Count unread notifications for one verified recipient only. */
export function countUnreadNotifications<T extends NotificationInboxRecord>(
  records: readonly T[],
  recipientUserId: string | null | undefined,
): number {
  if (!hasUsableId(recipientUserId)) return 0;

  return records.filter(
    (record) => record.recipientUserId === recipientUserId && record.readAt === null,
  ).length;
}

/**
 * Return a stable, newest-first inbox page for one recipient.
 *
 * The caller must supply an ID from a verified server-side session. This helper
 * is not an authentication boundary; persisted queries must also filter by
 * recipient_user_id in the database/RLS policy.
 */
export function listRecipientNotifications<T extends NotificationInboxRecord>(
  records: readonly T[],
  recipientUserId: string | null | undefined,
  options: NotificationListOptions = {},
): NotificationListResult<T> {
  if (!hasUsableId(recipientUserId)) {
    return { items: [], unreadCount: 0, nextCursor: null };
  }

  const limit = validatePageSize(options.limit);
  const recipientRecords = records.filter(
    (record) => record.recipientUserId === recipientUserId,
  );

  const sortedRecords = [...recipientRecords].sort(compareNewestFirst);
  const cursorTime = options.before
    ? timestampValue(options.before.createdAt, "cursor.createdAt")
    : null;
  const filteredRecords =
    options.before && cursorTime !== null
      ? sortedRecords.filter((record) =>
          isBeforeCursor(record, options.before as NotificationCursor, cursorTime),
        )
      : sortedRecords;

  const items = filteredRecords.slice(0, limit);
  const hasMore = filteredRecords.length > limit;
  const lastItem = items.at(-1);

  return {
    items,
    unreadCount: countUnreadNotifications(recipientRecords, recipientUserId),
    nextCursor:
      hasMore && lastItem
        ? { createdAt: lastItem.createdAt, id: lastItem.id }
        : null,
  };
}

/**
 * Mark one notification as read without changing another recipient's record.
 * Repeated calls are idempotent. The timestamp must be generated server-side.
 */
export function markNotificationRead<T extends NotificationInboxRecord>(
  records: readonly T[],
  recipientUserId: string | null | undefined,
  notificationId: string,
  readAt: string,
): NotificationMutationResult<T> {
  validateReadTimestamp(readAt);

  if (!hasUsableId(recipientUserId) || !hasUsableId(notificationId)) {
    return { records: [...records], changedCount: 0 };
  }

  let changedCount = 0;
  const updatedRecords = records.map((record) => {
    if (
      record.id !== notificationId ||
      record.recipientUserId !== recipientUserId ||
      record.readAt !== null
    ) {
      return record;
    }

    changedCount += 1;
    return { ...record, readAt };
  });

  return { records: updatedRecords, changedCount };
}

/**
 * Mark all unread notifications for one recipient as read.
 * Other users' notifications and previously-read timestamps are preserved.
 */
export function markAllNotificationsRead<T extends NotificationInboxRecord>(
  records: readonly T[],
  recipientUserId: string | null | undefined,
  readAt: string,
): NotificationMutationResult<T> {
  validateReadTimestamp(readAt);

  if (!hasUsableId(recipientUserId)) {
    return { records: [...records], changedCount: 0 };
  }

  let changedCount = 0;
  const updatedRecords = records.map((record) => {
    if (record.recipientUserId !== recipientUserId || record.readAt !== null) {
      return record;
    }

    changedCount += 1;
    return { ...record, readAt };
  });

  return { records: updatedRecords, changedCount };
}

/**
 * Return a typed related-record target. The UI resolves it to a role-specific
 * route and the destination must still re-check access to the related record.
 */
export function getNotificationTarget(
  record: Pick<NotificationInboxRecord, "relatedEntityType" | "relatedEntityId">,
): { entityType: NotificationRelatedEntityType; entityId: string } | null {
  if (
    !record.relatedEntityType ||
    !NOTIFICATION_RELATED_ENTITY_TYPES.includes(record.relatedEntityType) ||
    !hasUsableId(record.relatedEntityId)
  ) {
    return null;
  }

  return {
    entityType: record.relatedEntityType,
    entityId: record.relatedEntityId,
  };
}
