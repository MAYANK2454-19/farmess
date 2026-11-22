export type NotificationListCursor = {
  createdAt: string;
  id: string;
};

export type NotificationListQuery = {
  limit: number;
  before?: NotificationListCursor;
};

export type NotificationListQueryErrors = {
  request?: string;
  limit?: string;
  beforeCreatedAt?: string;
  beforeId?: string;
};

export type NotificationListQueryParseResult =
  | {
      status: "valid";
      data: NotificationListQuery;
      errors: NotificationListQueryErrors;
    }
  | {
      status: "invalid";
      data: null;
      reason: "invalid_query" | "invalid_limit" | "invalid_cursor";
      errors: NotificationListQueryErrors;
    };

type UnknownRecord = Record<string, unknown>;

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MAX_CURSOR_ID_LENGTH = 128;
const TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.hasOwn(record, key);
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidCursorTimestamp(value: string): boolean {
  const match = TIMESTAMP_PATTERN.exec(value.trim());
  if (!match) return false;

  const [
    ,
    yearText,
    monthText,
    dayText,
    hourText,
    minuteText,
    secondText,
    offsetHourText,
    offsetMinuteText,
  ] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);

  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) {
    return false;
  }

  const daysInMonth = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];

  if (day < 1 || day > daysInMonth) return false;

  return Number.isFinite(Date.parse(value));
}

/**
 * Parse notification inbox list query parameters.
 *
 * The query accepts only page size and an opaque cursor. Recipient identity,
 * role, read state and sort direction are derived by the server and are never
 * accepted from request parameters.
 */
export function parseNotificationListQuery(input: unknown): NotificationListQueryParseResult {
  if (!isRecord(input)) {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_query",
      errors: {
        request: "Expected an object containing notification inbox query parameters.",
      },
    };
  }

  let limit = DEFAULT_PAGE_SIZE;

  if (hasOwn(input, "limit")) {
    if (typeof input.limit !== "string" || !/^\d+$/.test(input.limit.trim())) {
      return {
        status: "invalid",
        data: null,
        reason: "invalid_limit",
        errors: {
          limit: "Page size must be a whole number from 1 to 50.",
        },
      };
    }

    limit = Number(input.limit.trim());

    if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
      return {
        status: "invalid",
        data: null,
        reason: "invalid_limit",
        errors: {
          limit: "Page size must be a whole number from 1 to 50.",
        },
      };
    }
  }

  const hasBeforeCreatedAt = hasOwn(input, "beforeCreatedAt");
  const hasBeforeId = hasOwn(input, "beforeId");

  if (hasBeforeCreatedAt !== hasBeforeId) {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_cursor",
      errors: {
        request: "Both beforeCreatedAt and beforeId are required for cursor pagination.",
      },
    };
  }

  if (!hasBeforeCreatedAt) {
    return {
      status: "valid",
      data: { limit },
      errors: {},
    };
  }

  if (typeof input.beforeCreatedAt !== "string" || !isValidCursorTimestamp(input.beforeCreatedAt)) {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_cursor",
      errors: {
        beforeCreatedAt: "Cursor timestamp must be a valid ISO 8601 date-time with a timezone.",
      },
    };
  }

  if (
    typeof input.beforeId !== "string" ||
    !input.beforeId.trim() ||
    input.beforeId.trim().length > MAX_CURSOR_ID_LENGTH
  ) {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_cursor",
      errors: {
        beforeId: "Cursor ID must contain 1 to 128 characters.",
      },
    };
  }

  return {
    status: "valid",
    data: {
      limit,
      before: {
        createdAt: input.beforeCreatedAt.trim(),
        id: input.beforeId.trim(),
      },
    },
    errors: {},
  };
}
