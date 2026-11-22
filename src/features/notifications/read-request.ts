export type NotificationReadAction =
  | {
      action: "mark_one_read";
      notificationId: string;
    }
  | {
      action: "mark_all_read";
    };

export type NotificationReadRequestErrors = {
  request?: string;
  action?: string;
  notificationId?: string;
};

export type NotificationReadRequestParseResult =
  | {
      status: "valid";
      data: NotificationReadAction;
      errors: {};
    }
  | {
      status: "invalid";
      data: null;
      reason: "invalid_payload" | "invalid_action" | "invalid_fields";
      errors: NotificationReadRequestErrors;
    };

type UnknownRecord = Record<string, unknown>;

const MAX_NOTIFICATION_ID_LENGTH = 128;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.hasOwn(record, key);
}

/**
 * Parse a notification read-action request.
 *
 * The request may choose only the action and, for mark-one, the notification
 * identifier. The recipient user ID must come from a verified server session.
 * The read timestamp must be generated on the server.
 */
export function parseNotificationReadRequest(
  input: unknown,
): NotificationReadRequestParseResult {
  if (!isRecord(input)) {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_payload",
      errors: {
        request: "Expected a JSON object containing a notification read action.",
      },
    };
  }

  if (typeof input.action !== "string") {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_action",
      errors: {
        action: "Action must be mark_one_read or mark_all_read.",
      },
    };
  }

  if (input.action === "mark_all_read") {
    return {
      status: "valid",
      data: { action: "mark_all_read" },
      errors: {},
    };
  }

  if (input.action !== "mark_one_read") {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_action",
      errors: {
        action: "Action must be mark_one_read or mark_all_read.",
      },
    };
  }

  if (!hasOwn(input, "notificationId") || typeof input.notificationId !== "string") {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_fields",
      errors: {
        notificationId: "A notification ID is required for mark_one_read.",
      },
    };
  }

  const notificationId = input.notificationId.trim();

  if (!notificationId) {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_fields",
      errors: {
        notificationId: "Notification ID cannot be empty.",
      },
    };
  }

  if (notificationId.length > MAX_NOTIFICATION_ID_LENGTH) {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_fields",
      errors: {
        notificationId: "Notification ID must contain 128 characters or fewer.",
      },
    };
  }

  return {
    status: "valid",
    data: {
      action: "mark_one_read",
      notificationId,
    },
    errors: {},
  };
}
