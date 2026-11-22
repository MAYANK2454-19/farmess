export const QUANTITY_UNITS = ["kg", "quintal", "tonne"] as const;

export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const DEDUCTION_FIELDS = [
  { key: "transportCost", label: "Transport" },
  { key: "handlingPackagingCost", label: "Handling and packaging" },
  { key: "marketCharges", label: "Market charges" },
  { key: "storageCost", label: "Storage" },
  { key: "expectedQualityLoss", label: "Expected quality loss" },
  { key: "otherDeductions", label: "Other deductions" },
] as const;

export type DeductionField = (typeof DEDUCTION_FIELDS)[number]["key"];
export type CalculationField =
  | "quantity"
  | "unit"
  | "expectedPricePerUnit"
  | DeductionField;

export type NetRealisationInput = {
  quantity: string;
  unit: QuantityUnit;
  expectedPricePerUnit: string;
  transportCost: string;
  handlingPackagingCost: string;
  marketCharges: string;
  storageCost: string;
  expectedQualityLoss: string;
  otherDeductions: string;
};

export type NetRealisationResult = {
  status: "complete" | "incomplete" | "invalid";
  grossSaleValue: string | null;
  deductionsTotal: string | null;
  netRealisation: string | null;
  deductionBreakdown: Record<DeductionField, string | null>;
  missingFields: CalculationField[];
  errors: Partial<Record<CalculationField, string>>;
};

const EMPTY_BREAKDOWN: Record<DeductionField, string | null> = {
  transportCost: null,
  handlingPackagingCost: null,
  marketCharges: null,
  storageCost: null,
  expectedQualityLoss: null,
  otherDeductions: null,
};

/**
 * Parse a non-negative decimal into an integer at the requested precision.
 * Money is stored as paise (2 decimal places); quantity is stored in
 * thousandths (3 decimal places). Exponents, signs and excess precision
 * are rejected so callers cannot accidentally pass ambiguous values.
 */
function parseFixedDecimal(value: string, precision: number): bigint {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);

  if (!match) {
    throw new Error("Enter a valid non-negative number.");
  }

  const fraction = match[2] ?? "";
  if (fraction.length > precision) {
    throw new Error(
      "The value has more decimal places than this field supports.",
    );
  }

  const scale = 10n ** BigInt(precision);
  const paddedFraction = (fraction + "0".repeat(precision)).slice(0, precision);

  return BigInt(match[1]) * scale + BigInt(paddedFraction || "0");
}

function formatPaise(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const rupees = absolute / 100n;
  const paise = (absolute % 100n).toString().padStart(2, "0");

  return sign + rupees.toString() + "." + paise;
}

function readRequiredValue(
  field: CalculationField,
  value: string,
  precision: number,
  missingFields: CalculationField[],
  errors: Partial<Record<CalculationField, string>>,
): bigint | null {
  if (value.trim() === "") {
    missingFields.push(field);
    return null;
  }

  try {
    return parseFixedDecimal(value, precision);
  } catch (error) {
    errors[field] =
      error instanceof Error ? error.message : "Enter a valid value.";
    return null;
  }
}

/**
 * Calculate the net realisation for one entered selling scenario.
 *
 * Price is interpreted per selected quantity unit. Every deduction is a
 * total amount for the lot in rupees. A cost must be explicitly entered;
 * entering "0" is different from leaving the field blank.
 */
export function calculateNetRealisation(
  input: NetRealisationInput,
): NetRealisationResult {
  const missingFields: CalculationField[] = [];
  const errors: Partial<Record<CalculationField, string>> = {};
  const deductionBreakdown = { ...EMPTY_BREAKDOWN };

  if (!(QUANTITY_UNITS as readonly string[]).includes(input.unit)) {
    errors.unit = "Select a supported quantity unit.";
  }

  const quantityMilli = readRequiredValue(
    "quantity",
    input.quantity,
    3,
    missingFields,
    errors,
  );
  const pricePaise = readRequiredValue(
    "expectedPricePerUnit",
    input.expectedPricePerUnit,
    2,
    missingFields,
    errors,
  );

  if (quantityMilli !== null && quantityMilli <= 0n) {
    errors.quantity = "Quantity must be greater than zero.";
  }

  const validQuantity =
    quantityMilli !== null && quantityMilli > 0n && !errors.quantity
      ? quantityMilli
      : null;

  const grossSaleValuePaise =
    validQuantity !== null && pricePaise !== null
      ? (pricePaise * validQuantity + 500n) / 1000n
      : null;

  let deductionsTotalPaise = 0n;
  let allDeductionsProvided = true;

  for (const field of DEDUCTION_FIELDS) {
    const amountPaise = readRequiredValue(
      field.key,
      input[field.key],
      2,
      missingFields,
      errors,
    );

    if (amountPaise === null) {
      allDeductionsProvided = false;
      continue;
    }

    deductionBreakdown[field.key] = formatPaise(amountPaise);
    deductionsTotalPaise += amountPaise;
  }

  const hasErrors = Object.keys(errors).length > 0;
  const hasMissingFields = missingFields.length > 0;
  const status = hasErrors
    ? "invalid"
    : hasMissingFields
      ? "incomplete"
      : "complete";

  const deductionsTotal =
    allDeductionsProvided && !hasErrors
      ? formatPaise(deductionsTotalPaise)
      : null;

  const netRealisation =
    status === "complete" && grossSaleValuePaise !== null
      ? formatPaise(grossSaleValuePaise - deductionsTotalPaise)
      : null;

  return {
    status,
    grossSaleValue:
      grossSaleValuePaise === null
        ? null
        : formatPaise(grossSaleValuePaise),
    deductionsTotal,
    netRealisation,
    deductionBreakdown,
    missingFields,
    errors,
  };
}
