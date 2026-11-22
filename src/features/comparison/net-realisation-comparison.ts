import {
  DEDUCTION_FIELDS,
  QUANTITY_UNITS,
  type DeductionField,
  type QuantityUnit,
} from "../calculations/net-realisation.ts";

export const COMPARISON_OPTION_SOURCES = [
  "market_observation",
  "buyer_offer",
  "entered_scenario",
] as const;

export type ComparisonOptionSource = (typeof COMPARISON_OPTION_SOURCES)[number];
export type ComparisonValueType = "reported" | "quoted" | "entered" | "estimated";
export type OptionFeasibility = "feasible" | "infeasible" | "unknown";

export type ComparisonOptionInput = {
  id: string;
  lotId: string;
  label: string;
  source: ComparisonOptionSource;
  sourceName: string;
  valueType: ComparisonValueType;
  pricePerUnit: string;
  priceUnit: QuantityUnit;
  deductions: Record<DeductionField, string>;
  feasibility: {
    status: OptionFeasibility;
    reasons?: string[];
  };
  observationDate?: string | null;
  retrievedAt?: string | null;
  validUntil?: string | null;
  sourceUrl?: string | null;
};

export type NetReturnComparisonInput = {
  lotId: string;
  quantity: string;
  quantityUnit: QuantityUnit;
  options: readonly ComparisonOptionInput[];
};

export type ComparisonOptionStatus =
  | "ranked"
  | "eligible"
  | "incomplete"
  | "invalid"
  | "infeasible"
  | "feasibility_unknown"
  | "incompatible";

export type ComparisonOptionResult = {
  id: string;
  label: string;
  source: ComparisonOptionSource;
  sourceName: string;
  valueType: ComparisonValueType;
  observationDate: string | null;
  retrievedAt: string | null;
  validUntil: string | null;
  status: ComparisonOptionStatus;
  rank: number | null;
  grossSaleValue: string | null;
  deductionsTotal: string | null;
  netRealisation: string | null;
  netPerQuintal: string | null;
  deductionBreakdown: Record<DeductionField, string | null>;
  reasons: string[];
};

export type NetReturnComparisonResult = {
  status: "comparable" | "insufficient_data" | "no_feasible_options" | "invalid_lot";
  lotId: string;
  quantity: string | null;
  quantityUnit: QuantityUnit | null;
  rankedOptionCount: number;
  options: ComparisonOptionResult[];
  reasons: string[];
};

const GRAMS_PER_UNIT: Record<QuantityUnit, bigint> = {
  kg: 1_000n,
  quintal: 100_000n,
  tonne: 1_000_000n,
};

const GRAMS_PER_QUINTAL = 100_000n;

const EMPTY_BREAKDOWN: Record<DeductionField, string | null> = {
  transportCost: null,
  handlingPackagingCost: null,
  marketCharges: null,
  storageCost: null,
  expectedQualityLoss: null,
  otherDeductions: null,
};

type ParsedDecimal = {
  scaledValue: bigint;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseDecimal(value: string, precision: number): ParsedDecimal | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(normalized);

  if (!match) return null;

  const fraction = match[2] ?? "";
  if (fraction.length > precision) return null;

  const scale = 10n ** BigInt(precision);
  const paddedFraction = (fraction + "0".repeat(precision)).slice(0, precision);

  return {
    scaledValue: BigInt(match[1]) * scale + BigInt(paddedFraction || "0"),
  };
}

function formatPaise(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  const rupees = absolute / 100n;
  const paise = (absolute % 100n).toString().padStart(2, "0");

  return sign + rupees.toString() + "." + paise;
}

function roundRatio(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("A positive denominator is required.");

  const sign = numerator < 0n ? -1n : 1n;
  const absolute = numerator < 0n ? -numerator : numerator;

  return sign * ((absolute + denominator / 2n) / denominator);
}

function isQuantityUnit(value: unknown): value is QuantityUnit {
  return typeof value === "string" && QUANTITY_UNITS.includes(value as QuantityUnit);
}

function isValidDate(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

function emptyResult(
  option: ComparisonOptionInput,
  status: ComparisonOptionStatus,
  reasons: string[],
): ComparisonOptionResult {
  return {
    id: option.id,
    label: option.label,
    source: option.source,
    sourceName: option.sourceName,
    valueType: option.valueType,
    observationDate: option.observationDate ?? null,
    retrievedAt: option.retrievedAt ?? null,
    validUntil: option.validUntil ?? null,
    status,
    rank: null,
    grossSaleValue: null,
    deductionsTotal: null,
    netRealisation: null,
    netPerQuintal: null,
    deductionBreakdown: { ...EMPTY_BREAKDOWN },
    reasons,
  };
}

function validateProvenance(option: ComparisonOptionInput): string[] {
  const errors: string[] = [];

  if (typeof option.sourceName !== "string" || !option.sourceName.trim()) {
    errors.push("A source name is required.");
  }

  if (option.source === "market_observation") {
    if (option.valueType !== "reported") {
      errors.push("Market observations must be labelled as reported values.");
    }
    if (!isValidDate(option.observationDate)) {
      errors.push("A valid market observation date is required.");
    }
    if (!isValidDate(option.retrievedAt)) {
      errors.push("A valid retrieval timestamp is required for market observations.");
    }
  } else if (option.source === "buyer_offer") {
    if (option.valueType !== "quoted") {
      errors.push("Buyer offers must be labelled as quoted values.");
    }
    if (!isValidDate(option.validUntil)) {
      errors.push("A valid offer expiry timestamp is required.");
    }
  } else if (option.source === "entered_scenario") {
    if (option.valueType !== "entered" && option.valueType !== "estimated") {
      errors.push("Entered scenarios must be labelled as entered or estimated.");
    }
  } else {
    errors.push("The option source is not supported.");
  }

  return errors;
}

function calculateOption(
  input: NetReturnComparisonInput,
  option: ComparisonOptionInput,
  quantityGrams: bigint,
  duplicateId: boolean,
): { result: ComparisonOptionResult; netPerQuintalPaise: bigint | null } {
  const reasons: string[] = [];

  if (duplicateId) {
    return {
      result: emptyResult(option, "invalid", ["Option IDs must be unique within a comparison."]),
      netPerQuintalPaise: null,
    };
  }

  if (typeof option.id !== "string" || !option.id.trim()) {
    return {
      result: emptyResult(option, "invalid", ["An option ID is required."]),
      netPerQuintalPaise: null,
    };
  }

  if (option.lotId !== input.lotId) {
    return {
      result: emptyResult(option, "incompatible", [
        "This option belongs to a different produce lot and cannot be compared.",
      ]),
      netPerQuintalPaise: null,
    };
  }

  if (
    typeof option.label !== "string" ||
    !option.label.trim() ||
    typeof option.source !== "string" ||
    !COMPARISON_OPTION_SOURCES.includes(option.source) ||
    !isQuantityUnit(option.priceUnit)
  ) {
    return {
      result: emptyResult(option, "invalid", [
        "The option label, source or price unit is invalid.",
      ]),
      netPerQuintalPaise: null,
    };
  }

  const provenanceErrors = validateProvenance(option);
  if (provenanceErrors.length > 0) {
    return {
      result: emptyResult(option, "invalid", provenanceErrors),
      netPerQuintalPaise: null,
    };
  }

  if (!isRecord(option.feasibility) || !["feasible", "infeasible", "unknown"].includes(option.feasibility.status)) {
    return {
      result: emptyResult(option, "invalid", ["A valid feasibility status is required."]),
      netPerQuintalPaise: null,
    };
  }

  if (option.feasibility.status === "infeasible") {
    return {
      result: emptyResult(
        option,
        "infeasible",
        option.feasibility.reasons?.length
          ? option.feasibility.reasons
          : ["This option has been marked infeasible."],
      ),
      netPerQuintalPaise: null,
    };
  }

  if (option.feasibility.status === "unknown") {
    return {
      result: emptyResult(
        option,
        "feasibility_unknown",
        option.feasibility.reasons?.length
          ? option.feasibility.reasons
          : ["Feasibility has not been verified."],
      ),
      netPerQuintalPaise: null,
    };
  }

  const price = parseDecimal(option.pricePerUnit, 2);
  if (!price) {
    return {
      result: emptyResult(option, "invalid", [
        "Enter a valid non-negative price with at most two decimal places.",
      ]),
      netPerQuintalPaise: null,
    };
  }

  const priceUnitGrams = GRAMS_PER_UNIT[option.priceUnit];
  const grossPaise = roundRatio(price.scaledValue * quantityGrams, priceUnitGrams);

  let deductionsPaise = 0n;
  let allDeductionsProvided = true;
  const deductionBreakdown = { ...EMPTY_BREAKDOWN };

  for (const field of DEDUCTION_FIELDS) {
    const rawValue = option.deductions?.[field.key];
    const amount = typeof rawValue === "string" ? parseDecimal(rawValue, 2) : null;

    if (!amount) {
      allDeductionsProvided = false;
      reasons.push(field.label + " cost is missing or invalid.");
      continue;
    }

    deductionsPaise += amount.scaledValue;
    deductionBreakdown[field.key] = formatPaise(amount.scaledValue);
  }

  const grossSaleValue = formatPaise(grossPaise);
  const deductionsTotal = allDeductionsProvided ? formatPaise(deductionsPaise) : null;
  const netPaise = allDeductionsProvided ? grossPaise - deductionsPaise : null;
  const netRealisation = netPaise === null ? null : formatPaise(netPaise);
  const netPerQuintalPaise =
    netPaise === null ? null : roundRatio(netPaise * GRAMS_PER_QUINTAL, quantityGrams);

  if (!allDeductionsProvided) {
    return {
      result: {
        ...emptyResult(option, "incomplete", reasons),
        grossSaleValue,
        deductionsTotal,
        netRealisation,
        netPerQuintal: null,
        deductionBreakdown,
      },
      netPerQuintalPaise: null,
    };
  }

  return {
    result: {
      id: option.id,
      label: option.label.trim(),
      source: option.source,
      sourceName: option.sourceName.trim(),
      valueType: option.valueType,
      observationDate: option.observationDate ?? null,
      retrievedAt: option.retrievedAt ?? null,
      validUntil: option.validUntil ?? null,
      status: "eligible",
      rank: null,
      grossSaleValue,
      deductionsTotal,
      netRealisation,
      netPerQuintal: formatPaise(netPerQuintalPaise as bigint),
      deductionBreakdown,
      reasons,
    },
    netPerQuintalPaise,
  };
}

/**
 * Compare options for one produce lot on an INR/quintal basis.
 *
 * The same physical lot must be used for every option. Unknown deductions,
 * unverified feasibility and incompatible lots remain visible but never rank.
 * The expected quality-loss value is represented once in the deductions map.
 */
export function compareNetRealisationOptions(
  input: NetReturnComparisonInput,
): NetReturnComparisonResult {
  if (
    typeof input.lotId !== "string" ||
    !input.lotId.trim() ||
    !isQuantityUnit(input.quantityUnit)
  ) {
    return {
      status: "invalid_lot",
      lotId: typeof input.lotId === "string" ? input.lotId : "",
      quantity: null,
      quantityUnit: null,
      rankedOptionCount: 0,
      options: input.options.map((option) =>
        emptyResult(option, "invalid", ["A valid lot ID and quantity unit are required."]),
      ),
      reasons: ["A valid lot ID and quantity unit are required."],
    };
  }

  const quantity = parseDecimal(input.quantity, 3);
  if (!quantity || quantity.scaledValue <= 0n) {
    return {
      status: "invalid_lot",
      lotId: input.lotId,
      quantity: null,
      quantityUnit: input.quantityUnit,
      rankedOptionCount: 0,
      options: input.options.map((option) =>
        emptyResult(option, "invalid", ["Lot quantity must be greater than zero."]),
      ),
      reasons: ["Lot quantity must be greater than zero and support at most three decimals."],
    };
  }

  const quantityGrams = (quantity.scaledValue * GRAMS_PER_UNIT[input.quantityUnit]) / 1000n;
  if (quantityGrams <= 0n) {
    return {
      status: "invalid_lot",
      lotId: input.lotId,
      quantity: null,
      quantityUnit: input.quantityUnit,
      rankedOptionCount: 0,
      options: input.options.map((option) =>
        emptyResult(option, "invalid", ["Lot quantity is below the supported precision."]),
      ),
      reasons: ["Lot quantity is below the supported precision."],
    };
  }

  const idCounts = new Map<string, number>();
  for (const option of input.options) {
    if (typeof option.id === "string" && option.id.trim()) {
      idCounts.set(option.id, (idCounts.get(option.id) ?? 0) + 1);
    }
  }

  const calculated = input.options.map((option) =>
    calculateOption(input, option, quantityGrams, (idCounts.get(option.id) ?? 0) > 1),
  );
  const rankable = calculated
    .filter((item) => item.result.status === "eligible" && item.netPerQuintalPaise !== null)
    .sort((left, right) => {
      const difference = (right.netPerQuintalPaise as bigint) - (left.netPerQuintalPaise as bigint);
      return difference === 0n ? left.result.id.localeCompare(right.result.id) : difference > 0n ? 1 : -1;
    });

  if (rankable.length >= 2) {
    let currentRank = 0;
    let previousValue: bigint | null = null;

    rankable.forEach((item, index) => {
      const value = item.netPerQuintalPaise as bigint;
      if (previousValue === null || value !== previousValue) {
        currentRank = index + 1;
      }
      item.result.status = "ranked";
      item.result.rank = currentRank;
      previousValue = value;
    });
  }

  const options = calculated.map((item) => item.result);
  const rankedOptionCount = rankable.length;

  if (rankedOptionCount >= 2) {
    return {
      status: "comparable",
      lotId: input.lotId,
      quantity: input.quantity,
      quantityUnit: input.quantityUnit,
      rankedOptionCount,
      options: options.sort((left, right) => {
        if (left.rank === null) return 1;
        if (right.rank === null) return -1;
        return left.rank - right.rank || left.id.localeCompare(right.id);
      }),
      reasons: ["Only complete, feasible options for the same lot are ranked by estimated net INR per quintal."],
    };
  }

  const hasFeasibleOption = options.some(
    (option) => option.status === "eligible" || option.status === "incomplete",
  );

  return {
    status: hasFeasibleOption ? "insufficient_data" : "no_feasible_options",
    lotId: input.lotId,
    quantity: input.quantity,
    quantityUnit: input.quantityUnit,
    rankedOptionCount: 0,
    options,
    reasons: [
      hasFeasibleOption
        ? "At least two complete and feasible options are required before a comparison can be ranked."
        : "No option is currently eligible for comparison.",
    ],
  };
}
