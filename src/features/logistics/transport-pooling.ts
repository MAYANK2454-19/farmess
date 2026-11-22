export type PoolQuantityUnit = "kg" | "quintal" | "tonne";

export type PoolLotCandidate = {
  id: string;
  crop: string;
  quantity: number;
  unit: PoolQuantityUnit;
  pickupArea: string;
  dropoffArea: string;
  pickupDate: string;
  requiresColdChain: boolean;
};

export type TransportPoolListing = {
  id: string;
  providerId: string;
  routeFrom: string;
  routeTo: string;
  availableFrom: string;
  availableUntil: string;
  capacity: number;
  capacityUnit: PoolQuantityUnit;
  supportedCrops: string[];
  refrigerated: boolean;
  status: "draft" | "published" | "paused";
  verificationState: "unverified" | "verification_pending" | "verified";
};

export type PoolRejection = {
  lotId: string;
  reasons: string[];
};

export type TransportPoolPlan = {
  listingId: string;
  eligibleLotIds: string[];
  rejectedLots: PoolRejection[];
  totalQuantityKg: number;
  capacityKg: number;
  remainingCapacityKg: number;
  utilisationPercent: number;
  availabilityLabel: "indicative" | "verification_pending";
  bookingStatus: "not_booked";
};

const KG_PER_UNIT: Record<PoolQuantityUnit, number> = {
  kg: 1,
  quintal: 100,
  tonne: 1000,
};

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase("en-IN");
}

function toKg(quantity: number, unit: PoolQuantityUnit): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || !(unit in KG_PER_UNIT)) {
    return null;
  }
  const kg = quantity * KG_PER_UNIT[unit];
  return Number.isFinite(kg) ? kg : null;
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
}

/**
 * Evaluate a transport listing against candidate lots without booking or
 * claiming provider confirmation. Route keys are exact area labels supplied
 * by the product; this function does not calculate distance or infer routes.
 */
export function planTransportPool(
  listing: TransportPoolListing,
  candidates: PoolLotCandidate[],
): TransportPoolPlan {
  const capacityKg = toKg(listing.capacity, listing.capacityUnit);
  if (capacityKg === null) {
    throw new Error("Transport listing must have a valid positive capacity and supported unit.");
  }

  const windowValid =
    validDate(listing.availableFrom) &&
    validDate(listing.availableUntil) &&
    listing.availableFrom <= listing.availableUntil;

  const eligibleLotIds: string[] = [];
  const rejectedLots: PoolRejection[] = [];
  let totalQuantityKg = 0;

  for (const lot of candidates) {
    const reasons: string[] = [];
    const quantityKg = toKg(lot.quantity, lot.unit);

    if (listing.status !== "published") {
      reasons.push("Transport listing is not published.");
    }
    if (!normalise(lot.pickupArea) || !normalise(lot.dropoffArea) ||
        normalise(lot.pickupArea) !== normalise(listing.routeFrom) ||
        normalise(lot.dropoffArea) !== normalise(listing.routeTo)) {
      reasons.push("Lot pickup and drop-off areas do not match the listed route.");
    }
    if (!validDate(lot.pickupDate) || !windowValid ||
        lot.pickupDate < listing.availableFrom || lot.pickupDate > listing.availableUntil) {
      reasons.push("Pickup date is outside the valid listing availability window.");
    }
    if (!lot.crop.trim() || !listing.supportedCrops.some(
      (crop) => normalise(crop) === normalise(lot.crop),
    )) {
      reasons.push("Crop is not included in the provider's stated suitability.");
    }
    if (lot.requiresColdChain && !listing.refrigerated) {
      reasons.push("Lot requires cold-chain transport but the listing is not refrigerated.");
    }
    if (quantityKg === null) {
      reasons.push("Lot quantity or unit is invalid.");
    } else if (totalQuantityKg + quantityKg > capacityKg) {
      reasons.push("Adding this lot would exceed the remaining vehicle capacity.");
    }

    if (reasons.length > 0 || quantityKg === null) {
      rejectedLots.push({ lotId: lot.id, reasons });
      continue;
    }

    eligibleLotIds.push(lot.id);
    totalQuantityKg += quantityKg;
  }

  const remainingCapacityKg = Math.max(0, capacityKg - totalQuantityKg);
  const utilisationPercent = Math.round((totalQuantityKg / capacityKg) * 1000) / 10;

  return {
    listingId: listing.id,
    eligibleLotIds,
    rejectedLots,
    totalQuantityKg,
    capacityKg,
    remainingCapacityKg,
    utilisationPercent,
    availabilityLabel:
      listing.verificationState === "verified" ? "indicative" : "verification_pending",
    bookingStatus: "not_booked",
  };
}
