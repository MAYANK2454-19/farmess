export const PROFILE_CONSENT_FIELDS = [
  "approximateLocationSharing",
  "exactLocationDisclosure",
  "buyerContactDisclosure",
  "providerContactDisclosure",
] as const;

export type ProfileConsentField = (typeof PROFILE_CONSENT_FIELDS)[number];

export type ProfileUpdatePatch = {
  displayName?: string;
  phoneNumber?: string;
  marketArea?: string;
  consents?: Partial<Record<ProfileConsentField, boolean>>;
};

export type ProfileUpdateFieldError =
  | "request"
  | "displayName"
  | "phoneNumber"
  | "marketArea"
  | "consents"
  | `consents.${ProfileConsentField}`;

export type ProfileUpdateErrors = Partial<Record<ProfileUpdateFieldError, string>>;

export type ProfileUpdateParseResult =
  | {
      status: "valid";
      data: ProfileUpdatePatch;
      errors: ProfileUpdateErrors;
    }
  | {
      status: "invalid";
      data: null;
      reason: "invalid_payload" | "invalid_fields" | "empty_patch";
      errors: ProfileUpdateErrors;
    };

type UnknownRecord = Record<string, unknown>;

const MAX_DISPLAY_NAME_LENGTH = 80;
const MAX_MARKET_AREA_LENGTH = 160;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const COORDINATE_PAIR_PATTERN =
  /^[-+]?\d{1,2}(?:\.\d+)?\s*,\s*[-+]?\d{1,3}(?:\.\d+)?$/;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.hasOwn(record, key);
}

function normalizePhoneNumber(value: string): string {
  return value.trim().replace(/[\s()-]/g, "");
}

function looksLikeExactCoordinates(value: string): boolean {
  return COORDINATE_PAIR_PATTERN.test(value) || /^geo:/i.test(value);
}

/**
 * Parse an untrusted profile PATCH body into an explicit field whitelist.
 *
 * Identity, role, timestamps and other server-managed profile properties are
 * never copied. Consent is a partial PATCH: omitted consent flags are left
 * unchanged by the caller, while explicit false values revoke consent.
 */
export function parseProfileUpdateRequest(input: unknown): ProfileUpdateParseResult {
  if (!isRecord(input)) {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_payload",
      errors: {
        request: "Expected a JSON object containing profile fields.",
      },
    };
  }

  const data: ProfileUpdatePatch = {};
  const errors: ProfileUpdateErrors = {};
  let suppliedFieldCount = 0;

  if (hasOwn(input, "displayName")) {
    suppliedFieldCount += 1;
    const value = input.displayName;

    if (typeof value !== "string") {
      errors.displayName = "Display name must be a string.";
    } else {
      const displayName = value.trim();

      if (!displayName) {
        errors.displayName = "Display name cannot be empty.";
      } else if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
        errors.displayName = "Display name must contain 80 characters or fewer.";
      } else {
        data.displayName = displayName;
      }
    }
  }

  if (hasOwn(input, "phoneNumber")) {
    suppliedFieldCount += 1;
    const value = input.phoneNumber;

    if (typeof value !== "string") {
      errors.phoneNumber = "Phone number must be a string.";
    } else {
      const phoneNumber = normalizePhoneNumber(value);

      // An empty string explicitly clears the optional phone number.
      if (phoneNumber && !E164_PATTERN.test(phoneNumber)) {
        errors.phoneNumber = "Enter a valid international phone number, including country code.";
      } else {
        data.phoneNumber = phoneNumber;
      }
    }
  }

  if (hasOwn(input, "marketArea")) {
    suppliedFieldCount += 1;
    const value = input.marketArea;

    if (typeof value !== "string") {
      errors.marketArea = "Market area must be a string.";
    } else {
      const marketArea = value.trim();

      if (marketArea.length > MAX_MARKET_AREA_LENGTH) {
        errors.marketArea = "Market area must contain 160 characters or fewer.";
      } else if (marketArea && looksLikeExactCoordinates(marketArea)) {
        errors.marketArea = "Enter a locality or market area, not exact GPS coordinates.";
      } else {
        data.marketArea = marketArea;
      }
    }
  }

  if (hasOwn(input, "consents")) {
    suppliedFieldCount += 1;

    if (!isRecord(input.consents)) {
      errors.consents = "Privacy consents must be provided as an object of boolean values.";
    } else {
      const consents: Partial<Record<ProfileConsentField, boolean>> = {};
      let suppliedConsentCount = 0;

      for (const field of PROFILE_CONSENT_FIELDS) {
        if (!hasOwn(input.consents, field)) continue;

        suppliedConsentCount += 1;
        const value = input.consents[field];

        if (typeof value !== "boolean") {
          errors[`consents.${field}`] = "Consent choice must be true or false.";
        } else {
          consents[field] = value;
        }
      }

      if (suppliedConsentCount > 0) {
        data.consents = consents;
      }
    }
  }

  if (Object.keys(errors).length > 0) {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_fields",
      errors,
    };
  }

  if (suppliedFieldCount === 0 || Object.keys(data).length === 0) {
    return {
      status: "invalid",
      data: null,
      reason: "empty_patch",
      errors: {
        request: "Provide at least one supported profile field to update.",
      },
    };
  }

  return {
    status: "valid",
    data,
    errors: {},
  };
}
