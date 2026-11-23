export type LogisticsQuantityUnit = "kg" | "quintal" | "tonne";

export type LogisticsRequestTerms = {
  quantity: number;
  quantityUnit: LogisticsQuantityUnit;
  pickupArea: string;
  deliveryArea: string;
  requestedAt: string;
  neededBy: string;
};

export type LogisticsTermsValidation = {
  valid: boolean;
  errors: string[];
};

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function validateLogisticsRequestTerms(
  terms: LogisticsRequestTerms,
  now: Date = new Date(),
): LogisticsTermsValidation {
  const errors: string[] = [];

  if (!Number.isFinite(terms.quantity) || terms.quantity <= 0) {
    errors.push("Quantity must be a finite positive number.");
  }

  if (!["kg", "quintal", "tonne"].includes(terms.quantityUnit)) {
    errors.push("Quantity unit must be kg, quintal, or tonne.");
  }

  if (!terms.pickupArea.trim()) errors.push("Pickup area is required.");
  if (!terms.deliveryArea.trim()) errors.push("Delivery area is required.");

  if (
    terms.pickupArea.trim() &&
    terms.deliveryArea.trim() &&
    terms.pickupArea.trim().toLocaleLowerCase("en-IN") ===
      terms.deliveryArea.trim().toLocaleLowerCase("en-IN")
  ) {
    errors.push("Pickup and delivery areas must be different.");
  }

  if (!isValidDate(terms.requestedAt)) errors.push("Requested-at must be a valid date.");
  if (!isValidDate(terms.neededBy)) errors.push("Needed-by must be a valid date.");

  if (isValidDate(terms.neededBy) && Date.parse(terms.neededBy) <= now.getTime()) {
    errors.push("Needed-by must be in the future.");
  }

  if (isValidDate(terms.requestedAt) && isValidDate(terms.neededBy)) {
    const requestedAt = Date.parse(terms.requestedAt);
    const neededBy = Date.parse(terms.neededBy);
    if (neededBy <= requestedAt) errors.push("Needed-by must be later than requested-at.");
  }

  return { valid: errors.length === 0, errors };
}
