export const LOT_UNITS = ["kg", "quintal", "tonne"] as const;
export const LOT_GRADES = ["A", "B", "C", "Not graded"] as const;

export type LotUnit = (typeof LOT_UNITS)[number];
export type LotGrade = (typeof LOT_GRADES)[number];

export type LotDraftInput = {
  crop: string;
  variety: string;
  grade: string;
  quantity: string;
  unit: string;
  location: string;
  availableAt: string;
  sellBy: string;
  notes: string;
};

export type LotField = keyof LotDraftInput;
export type ValidatedLotDraft = Omit<LotDraftInput, "unit" | "grade"> & {
  unit: LotUnit;
  grade: LotGrade | "";
};
export type LotValidationErrors = Partial<Record<LotField, string>>;

export type LotValidationResult = {
  data: ValidatedLotDraft | null;
  errors: LotValidationErrors;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const QUANTITY_PATTERN = /^\d+(?:\.\d{1,3})?$/;
const ALLOWED_UNITS: readonly string[] = LOT_UNITS;
const ALLOWED_GRADES: readonly string[] = LOT_GRADES;

function isCalendarDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;

  const date = new Date(value + "T00:00:00.000Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isPositiveQuantity(value: string): boolean {
  if (!QUANTITY_PATTERN.test(value)) return false;

  const [whole, fractional = ""] = value.split(".");
  const thousandths = BigInt(whole) * 1000n + BigInt((fractional + "000").slice(0, 3));
  return thousandths > 0n && thousandths <= BigInt(Number.MAX_SAFE_INTEGER);
}

export function validateLotDraft(input: LotDraftInput): LotValidationResult {
  const data: ValidatedLotDraft = {
    crop: input.crop.trim(),
    variety: input.variety.trim(),
    grade: input.grade.trim() as LotGrade | "",
    quantity: input.quantity.trim(),
    unit: input.unit as LotUnit,
    location: input.location.trim(),
    availableAt: input.availableAt,
    sellBy: input.sellBy,
    notes: input.notes.trim(),
  };
  const errors: LotValidationErrors = {};

  if (!data.crop) errors.crop = "Enter the produce or commodity name.";
  else if (data.crop.length > 80) errors.crop = "Use 80 characters or fewer.";

  if (data.variety.length > 80) errors.variety = "Use 80 characters or fewer.";

  if (data.grade && !ALLOWED_GRADES.includes(data.grade)) {
    errors.grade = "Select a listed grade or leave this field blank.";
  }

  if (!data.quantity) errors.quantity = "Enter the available quantity.";
  else if (data.quantity.length > 18 || !isPositiveQuantity(data.quantity)) {
    errors.quantity = "Enter a quantity greater than zero, using up to three decimal places.";
  }

  if (!ALLOWED_UNITS.includes(data.unit)) errors.unit = "Select kg, quintal or tonne.";

  if (!data.location) errors.location = "Enter a village, locality or nearby market area.";
  else if (data.location.length > 160) errors.location = "Use 160 characters or fewer.";

  if (!data.availableAt) errors.availableAt = "Select when the produce will be available.";
  else if (!isCalendarDate(data.availableAt)) errors.availableAt = "Enter a valid calendar date.";

  if (!data.sellBy) errors.sellBy = "Select the date by which the produce should be sold.";
  else if (!isCalendarDate(data.sellBy)) errors.sellBy = "Enter a valid calendar date.";

  if (!errors.availableAt && !errors.sellBy && data.sellBy < data.availableAt) {
    errors.sellBy = "The sell-by date cannot be earlier than the available-from date.";
  }

  if (data.notes.length > 1000) errors.notes = "Use 1,000 characters or fewer.";

  return {
    data: Object.keys(errors).length === 0 ? data : null,
    errors,
  };
}
