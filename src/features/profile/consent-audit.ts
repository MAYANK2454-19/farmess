export const FARMER_CONSENT_FIELDS = [
  "approximateLocationSharing",
  "exactLocationDisclosure",
  "buyerContactDisclosure",
  "providerContactDisclosure",
] as const;

export type FarmerConsentField = (typeof FARMER_CONSENT_FIELDS)[number];

export type FarmerConsentSnapshot = Record<FarmerConsentField, boolean>;
export type FarmerConsentPatch = Partial<FarmerConsentSnapshot>;

export type FarmerConsentDataCategory =
  "approximate_location" | "exact_location" | "contact_details";

export type FarmerConsentAuditEvent = {
  eventType: "farmer_consent_granted" | "farmer_consent_revoked";
  actorUserId: string;
  farmerUserId: string;
  consentField: FarmerConsentField;
  dataCategory: FarmerConsentDataCategory;
  previousAllowed: boolean;
  nextAllowed: boolean;
  occurredAt: string;
  dedupeKey: string;
};

export type FarmerConsentAuditBuildResult =
  | {
      status: "valid";
      events: FarmerConsentAuditEvent[];
      changedFields: FarmerConsentField[];
      reason: null;
    }
  | {
      status: "invalid";
      events: [];
      changedFields: [];
      reason:
        | "invalid_request"
        | "actor_must_be_farmer"
        | "invalid_consent_state"
        | "invalid_consent_patch"
        | "invalid_timestamp";
    };

type UnknownRecord = Record<string, unknown>;

const CONSENT_DATA_CATEGORY: Record<FarmerConsentField, FarmerConsentDataCategory> = {
  approximateLocationSharing: "approximate_location",
  exactLocationDisclosure: "exact_location",
  buyerContactDisclosure: "contact_details",
  providerContactDisclosure: "contact_details",
};

const ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-](\d{2}):(\d{2}))$/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasUsableId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  const match = ISO_TIMESTAMP_PATTERN.exec(trimmed);
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

  return day >= 1 && day <= daysInMonth && Number.isFinite(Date.parse(trimmed));
}

function parseConsentSnapshot(value: unknown): FarmerConsentSnapshot | null {
  if (!isRecord(value)) return null;

  const fields = FARMER_CONSENT_FIELDS;
  if (!fields.every((field) => typeof value[field] === "boolean")) return null;

  return {
    approximateLocationSharing: value.approximateLocationSharing as boolean,
    exactLocationDisclosure: value.exactLocationDisclosure as boolean,
    buyerContactDisclosure: value.buyerContactDisclosure as boolean,
    providerContactDisclosure: value.providerContactDisclosure as boolean,
  };
}

function parseConsentPatch(value: unknown): FarmerConsentPatch | null {
  if (!isRecord(value)) return null;

  const allowedFields = new Set<string>(FARMER_CONSENT_FIELDS);
  if (Object.keys(value).some((key) => !allowedFields.has(key))) return null;

  const patch: FarmerConsentPatch = {};

  for (const field of FARMER_CONSENT_FIELDS) {
    if (!Object.hasOwn(value, field)) continue;
    if (typeof value[field] !== "boolean") return null;
    patch[field] = value[field] as boolean;
  }

  return patch;
}

function createDedupeKey(
  farmerUserId: string,
  field: FarmerConsentField,
  previousAllowed: boolean,
  nextAllowed: boolean,
  occurredAt: string,
): string {
  return [farmerUserId, field, previousAllowed ? "1" : "0", nextAllowed ? "1" : "0", occurredAt]
    .map(encodeURIComponent)
    .join(":");
}

/**
 * Build audit events for persisted farmer consent changes.
 *
 * The actor must be the farmer whose settings are changing. Callers must load
 * the previous consent snapshot from trusted persistence, obtain the actor
 * from the verified session, and generate occurredAt on the server.
 * This function builds events only; it does not persist them.
 */
export function buildFarmerConsentAuditEvents(input: unknown): FarmerConsentAuditBuildResult {
  if (!isRecord(input)) {
    return { status: "invalid", events: [], changedFields: [], reason: "invalid_request" };
  }

  const actorUserId = input.actorUserId;
  const farmerUserId = input.farmerUserId;

  if (!hasUsableId(actorUserId) || !hasUsableId(farmerUserId)) {
    return { status: "invalid", events: [], changedFields: [], reason: "invalid_request" };
  }

  if (actorUserId !== farmerUserId) {
    return { status: "invalid", events: [], changedFields: [], reason: "actor_must_be_farmer" };
  }

  const previousConsent = parseConsentSnapshot(input.previousConsent);
  if (!previousConsent) {
    return {
      status: "invalid",
      events: [],
      changedFields: [],
      reason: "invalid_consent_state",
    };
  }

  const consentPatch = parseConsentPatch(input.consentPatch);
  if (!consentPatch) {
    return {
      status: "invalid",
      events: [],
      changedFields: [],
      reason: "invalid_consent_patch",
    };
  }

  if (!isValidTimestamp(input.occurredAt)) {
    return { status: "invalid", events: [], changedFields: [], reason: "invalid_timestamp" };
  }

  const events: FarmerConsentAuditEvent[] = [];
  const changedFields: FarmerConsentField[] = [];
  const occurredAt = input.occurredAt.trim();

  for (const field of FARMER_CONSENT_FIELDS) {
    if (!Object.hasOwn(consentPatch, field)) continue;

    const previousAllowed = previousConsent[field];
    const nextAllowed = consentPatch[field] as boolean;
    if (previousAllowed === nextAllowed) continue;

    changedFields.push(field);
    events.push({
      eventType: nextAllowed ? "farmer_consent_granted" : "farmer_consent_revoked",
      actorUserId,
      farmerUserId,
      consentField: field,
      dataCategory: CONSENT_DATA_CATEGORY[field],
      previousAllowed,
      nextAllowed,
      occurredAt,
      dedupeKey: createDedupeKey(farmerUserId, field, previousAllowed, nextAllowed, occurredAt),
    });
  }

  return {
    status: "valid",
    events,
    changedFields,
    reason: null,
  };
}
