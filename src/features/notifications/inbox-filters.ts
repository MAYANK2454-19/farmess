import type { NotificationInboxRecord, NotificationRelatedEntityType } from "./inbox.ts";

export type NotificationReadFilter = "all" | "unread" | "read";

export type NotificationInboxFilterOptions = {
  query?: string;
  read?: NotificationReadFilter;
  relatedEntityType?: NotificationRelatedEntityType;
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase("en-IN");
}

function matchesQuery(record: NotificationInboxRecord, query: string): boolean {
  if (!query) return true;
  return [record.id, record.relatedEntityType ?? "", record.relatedEntityId ?? "", record.createdAt]
    .map(normalize)
    .some((value) => value.includes(query));
}

export function filterNotificationInbox<T extends NotificationInboxRecord>(
  records: readonly T[],
  options: NotificationInboxFilterOptions = {},
): T[] {
  const query = normalize(options.query ?? "");
  const read = options.read ?? "all";

  return records.filter((record) => {
    if (read === "unread" && record.readAt !== null) return false;
    if (read === "read" && record.readAt === null) return false;
    if (options.relatedEntityType && record.relatedEntityType !== options.relatedEntityType) {
      return false;
    }
    return matchesQuery(record, query);
  });
}

export function countNotificationFilterResults(
  records: readonly NotificationInboxRecord[],
): { all: number; unread: number; read: number } {
  return {
    all: records.length,
    unread: records.filter((record) => record.readAt === null).length,
    read: records.filter((record) => record.readAt !== null).length,
  };
}
