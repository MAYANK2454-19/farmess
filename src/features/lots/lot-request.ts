import {
  validateLotDraft,
  type LotDraftInput,
  type LotField,
  type LotValidationErrors,
  type ValidatedLotDraft,
} from "./lot-validation.ts";

const LOT_FIELDS: readonly LotField[] = [
  "crop",
  "variety",
  "grade",
  "quantity",
  "unit",
  "location",
  "availableAt",
  "sellBy",
  "notes",
];

const OPTIONAL_FIELDS: readonly LotField[] = ["variety", "grade", "notes"];

export type LotRequestErrors = LotValidationErrors & {
  request?: string;
};

export type LotRequestParseResult =
  | {
      status: "valid";
      data: ValidatedLotDraft;
      errors: {};
    }
  | {
      status: "invalid";
      data: null;
      reason: "invalid_payload" | "invalid_fields";
      errors: LotRequestErrors;
    };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function emptyDraft(): LotDraftInput {
  return {
    crop: "",
    variety: "",
    grade: "",
    quantity: "",
    unit: "",
    location: "",
    availableAt: "",
    sellBy: "",
    notes: "",
  };
}

/**
 * Parse an untrusted JSON body into the whitelist of fields accepted by the
 * farmer lot form, then run the shared lot validation rules.
 *
 * Owner IDs, roles, publication flags and any other unknown fields are never
 * copied into the returned data. The server must attach ownership from its
 * verified session after this parser succeeds.
 */
export function parseLotDraftRequest(input: unknown): LotRequestParseResult {
  if (!isRecord(input)) {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_payload",
      errors: {
        request: "Expected a JSON object containing the produce lot fields.",
      },
    };
  }

  const draft = emptyDraft();
  const inputErrors: LotRequestErrors = {};

  for (const field of LOT_FIELDS) {
    const fieldExists = Object.hasOwn(input, field);
    const value = input[field];

    if (!fieldExists && OPTIONAL_FIELDS.includes(field)) {
      draft[field] = "";
      continue;
    }

    if (!fieldExists) {
      // Let validateLotDraft return the existing field-specific required error.
      continue;
    }

    if (typeof value !== "string") {
      inputErrors[field] = "This field must be sent as a string.";
      continue;
    }

    draft[field] = value;
  }

  const validation = validateLotDraft(draft);
  const errors: LotRequestErrors = {
    ...validation.errors,
    ...inputErrors,
  };

  if (Object.keys(errors).length > 0 || validation.data === null) {
    return {
      status: "invalid",
      data: null,
      reason: "invalid_fields",
      errors,
    };
  }

  return {
    status: "valid",
    data: validation.data,
    errors: {},
  };
}
