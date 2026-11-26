import type { QuantityUnit } from "./domain.ts";

/**
 * Seller-side matching: which active buyer requirements fit one of the
 * farmer's lots. Unlike the buyer-side matcher (which drops anything that
 * conflicts), only the crop is a hard condition here. Every other difference is
 * reported as a gap so the farmer can still see and act on a partial fit (sell
 * part of a requirement, deliver to another area, adjust dates).
 */

export type SellerLot = {
  id: string;
  crop: string;
  variety: string | null;
  grade: string | null;
  quantity: number;
  unit: QuantityUnit;
  area: string | null;
  availableFrom: string;
  sellBy: string | null;
  status: string;
};

export type DemandRequirement = {
  id: string;
  crop: string;
  variety: string | null;
  grade: string | null;
  minQuantity: number;
  maxQuantity: number | null;
  unit: QuantityUnit;
  marketArea: string | null;
  deliveryBy: string | null;
};

export type SellerMatch = {
  requirementId: string;
  status: "match" | "partial";
  /** Share of checked conditions that fit, 0-100. */
  score: number;
  /** How much of the buyer's minimum quantity this lot can cover, 0-100. */
  quantityCoveragePercent: number | null;
  fits: string[];
  gaps: string[];
};

const UNIT_IN_KG: Record<QuantityUnit, number> = { kg: 1, quintal: 100, tonne: 1000 };

function norm(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("en-IN");
}

function sameArea(a: string, b: string): boolean {
  const x = norm(a);
  const y = norm(b);
  return x.length > 0 && y.length > 0 && (x === y || x.includes(y) || y.includes(x));
}

function days(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function matchLotToRequirement(
  lot: SellerLot,
  requirement: DemandRequirement,
): SellerMatch | null {
  if (!norm(lot.crop) || norm(lot.crop) !== norm(requirement.crop)) return null;
  if (lot.status !== "draft" && lot.status !== "published") return null;

  const fits: string[] = ["Same crop."];
  const gaps: string[] = [];
  let checks = 1;
  let passed = 1;

  for (const field of ["variety", "grade"] as const) {
    const wanted = requirement[field];
    if (!norm(wanted)) continue;
    checks += 1;
    if (!norm(lot[field])) {
      gaps.push(`Buyer wants ${field} "${wanted}"; your lot has no ${field} recorded.`);
    } else if (norm(lot[field]) === norm(wanted)) {
      passed += 1;
      fits.push(`${field === "variety" ? "Variety" : "Grade"} matches (${wanted}).`);
    } else {
      gaps.push(`Buyer wants ${field} "${wanted}"; yours is "${lot[field]}".`);
    }
  }

  checks += 1;
  let quantityCoveragePercent: number | null = null;
  const lotKg = lot.quantity * UNIT_IN_KG[lot.unit];
  const minKg = requirement.minQuantity * UNIT_IN_KG[requirement.unit];
  if (Number.isFinite(lotKg) && Number.isFinite(minKg) && minKg > 0) {
    quantityCoveragePercent = Math.min(100, Math.round((lotKg / minKg) * 100));
    if (lotKg >= minKg) {
      passed += 1;
      fits.push("Your quantity meets the buyer's minimum.");
      if (requirement.maxQuantity !== null) {
        const maxKg = requirement.maxQuantity * UNIT_IN_KG[requirement.unit];
        if (lotKg > maxKg) {
          fits.push(
            `Buyer takes up to ${requirement.maxQuantity} ${requirement.unit}; you could sell part of the lot.`,
          );
        }
      }
    } else {
      gaps.push(
        `Your lot covers ${quantityCoveragePercent}% of the buyer's minimum (${requirement.minQuantity} ${requirement.unit}).`,
      );
    }
  }

  if (norm(requirement.marketArea)) {
    checks += 1;
    if (lot.area && sameArea(lot.area, requirement.marketArea!)) {
      passed += 1;
      fits.push(`Same area (${requirement.marketArea}).`);
    } else {
      gaps.push(
        lot.area
          ? `Buyer's area is ${requirement.marketArea}; your lot is in ${lot.area}.`
          : `Buyer's area is ${requirement.marketArea}; your lot has no area recorded.`,
      );
    }
  }

  if (requirement.deliveryBy) {
    checks += 1;
    const late = days(requirement.deliveryBy, lot.availableFrom);
    const expired = lot.sellBy ? days(lot.sellBy, requirement.deliveryBy) : 0;
    if (late > 0) {
      gaps.push(
        `Your lot is available ${late} day(s) after the buyer's date (${requirement.deliveryBy}).`,
      );
    } else if (expired > 0) {
      gaps.push(`The buyer's date (${requirement.deliveryBy}) is after your sell-by date.`);
    } else {
      passed += 1;
      fits.push(`Available by the buyer's date (${requirement.deliveryBy}).`);
    }
  }

  if (lot.status === "draft") {
    gaps.push("This lot is still a draft: publish it so this buyer can see it and make an offer.");
  }

  return {
    requirementId: requirement.id,
    status: gaps.length === 0 ? "match" : "partial",
    score: Math.round((passed / checks) * 100),
    quantityCoveragePercent,
    fits,
    gaps,
  };
}
