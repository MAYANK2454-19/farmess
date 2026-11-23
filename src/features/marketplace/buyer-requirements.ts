import type { QuantityUnit } from "./domain.ts";

export type BuyerRequirementDraft = {
  crop: string;
  variety?: string | null;
  grade?: string | null;
  quantity: number;
  unit: QuantityUnit;
  locationArea: string;
  requiredAt: string;
};

export type ValidatedBuyerRequirement = {
  crop: string;
  variety: string | null;
  grade: string | null;
  quantity: number;
  unit: QuantityUnit;
  locationArea: string;
  requiredAt: string;
};

export type BuyerRequirementFieldError = {
  field: keyof BuyerRequirementDraft;
  message: string;
};

export type BuyerRequirementValidation =
  | { valid: true; value: ValidatedBuyerRequirement; errors: [] }
  | { valid: false; errors: BuyerRequirementFieldError[] };

const QUANTITY_UNITS = ["kg", "quintal", "tonne"] as const;
const MAX_CROP_LENGTH = 80;
const MAX_ATTRIBUTE_LENGTH = 80;
const MAX_LOCATION_LENGTH = 120;

function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/**
 * Validate and normalize buyer-entered requirements before matching.
 * This is a pure input contract, not persistence or authorization.
 */
export function validateBuyerRequirement(
  draft: BuyerRequirementDraft,
): BuyerRequirementValidation {
  const errors: BuyerRequirementFieldError[] = [];
  const crop = typeof draft.crop === "string" ? draft.crop.trim() : "";
  const variety = typeof draft.variety === "string" ? draft.variety.trim() : "";
  const grade = typeof draft.grade === "string" ? draft.grade.trim() : "";
  const locationArea =
    typeof draft.locationArea === "string" ? draft.locationArea.trim() : "";

  if (!crop) {
    errors.push({ field: "crop", message: "Crop is required." });
  } else if (crop.length > MAX_CROP_LENGTH) {
    errors.push({
      field: "crop",
      message: "Crop must be at most " + MAX_CROP_LENGTH + " characters.",
    });
  }

  if (variety.length > MAX_ATTRIBUTE_LENGTH) {
    errors.push({
      field: "variety",
      message: "Variety must be at most " + MAX_ATTRIBUTE_LENGTH + " characters.",
    });
  }
  if (grade.length > MAX_ATTRIBUTE_LENGTH) {
    errors.push({
      field: "grade",
      message: "Grade must be at most " + MAX_ATTRIBUTE_LENGTH + " characters.",
    });
  }

  if (!Number.isFinite(draft.quantity) || draft.quantity <= 0) {
    errors.push({
      field: "quantity",
      message: "Quantity must be a finite number greater than zero.",
    });
  }
  if (!(QUANTITY_UNITS as readonly string[]).includes(draft.unit)) {
    errors.push({ field: "unit", message: "Choose kg, quintal or tonne." });
  }

  if (!locationArea) {
    errors.push({ field: "locationArea", message: "Pickup area is required." });
  } else if (locationArea.length > MAX_LOCATION_LENGTH) {
    errors.push({
      field: "locationArea",
      message: "Pickup area must be at most " + MAX_LOCATION_LENGTH + " characters.",
    });
  }

  const requiredAt = typeof draft.requiredAt === "string" ? draft.requiredAt : "";
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(requiredAt);
  const dateTime =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      requiredAt,
    );
  const parsedDate = Date.parse(dateOnly ? requiredAt + "T00:00:00.000Z" : requiredAt);
  const dateIsReal = isRealCalendarDate(requiredAt.slice(0, 10));

  if ((!dateOnly && !dateTime) || !dateIsReal || !Number.isFinite(parsedDate)) {
    errors.push({
      field: "requiredAt",
      message: "Required date must be a valid ISO date or ISO timestamp with a timezone.",
    });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors: [],
    value: {
      crop,
      variety: variety || null,
      grade: grade || null,
      quantity: draft.quantity,
      unit: draft.unit,
      locationArea,
      requiredAt: new Date(parsedDate).toISOString(),
    },
  };
}
