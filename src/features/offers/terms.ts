export type OfferQuantityUnit = "kg" | "quintal" | "tonne";
export type OfferPriceBasis = "per_kg" | "per_quintal" | "per_tonne";

export type OfferTermsInput = {
  quantity: number;
  unit: OfferQuantityUnit;
  pricePaise: number;
  priceBasis: OfferPriceBasis;
  validUntil: string;
};

export type OfferTermsValidation = {
  valid: boolean;
  errors: string[];
};

const BASIS_UNITS: Record<OfferPriceBasis, OfferQuantityUnit> = {
  per_kg: "kg",
  per_quintal: "quintal",
  per_tonne: "tonne",
};

export function validateOfferTerms(input: OfferTermsInput, now = new Date()): OfferTermsValidation {
  const errors: string[] = [];

  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    errors.push("Quantity must be a finite positive number.");
  }

  if (!Number.isInteger(input.pricePaise) || input.pricePaise <= 0) {
    errors.push("Price must be a positive integer number of paise.");
  }

  if (BASIS_UNITS[input.priceBasis] !== input.unit) {
    errors.push("Price basis must use the same unit as the offered quantity.");
  }

  const expiry = Date.parse(input.validUntil);
  if (!Number.isFinite(expiry)) {
    errors.push("Offer validity must be a valid date.");
  } else if (expiry <= now.getTime()) {
    errors.push("Offer validity must be in the future.");
  }

  return { valid: errors.length === 0, errors };
}
