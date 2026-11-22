export type StorageQuantityUnit = "kg" | "quintal" | "tonne";
export type StorageRateBasis =
  | "per_kg_day"
  | "per_quintal_day"
  | "per_tonne_day";

export type StorageLotCandidate = {
  id: string;
  crop: string;
  quantity: number;
  unit: StorageQuantityUnit;
  storageArea: string;
  arrivalDate: string;
  storageDays: number;
  requiresColdChain: boolean;
  requiredTemperatureMinC?: number | null;
  requiredTemperatureMaxC?: number | null;
};

export type ColdStorageListing = {
  id: string;
  providerId: string;
  facilityArea: string;
  availableFrom: string;
  availableUntil: string;
  capacity: number;
  capacityUnit: StorageQuantityUnit;
  supportedCrops: string[];
  refrigerated: boolean;
  temperatureMinC?: number | null;
  temperatureMaxC?: number | null;
  ratePaise?: number | null;
  rateBasis?: StorageRateBasis | null;
  rateValueType?: "quoted" | "indicative" | "demo" | null;
  status: "draft" | "published" | "paused";
  verificationState: "unverified" | "verification_pending" | "verified";
};

export type StorageLotRejection = { lotId: string; reasons: string[] };
export type StorageLotEstimate = {
  lotId: string;
  quantityKg: number;
  storageDays: number;
  estimatedCostPaise: number | null;
  costValueType: "quoted" | "indicative" | "demo" | "unavailable";
};

export type ColdStoragePlan = {
  listingId: string;
  eligibleLots: StorageLotEstimate[];
  rejectedLots: StorageLotRejection[];
  totalQuantityKg: number;
  capacityKg: number;
  remainingCapacityKg: number;
  availabilityLabel: "indicative" | "verification_pending";
  bookingStatus: "not_booked";
};

const KG_PER_UNIT: Record<StorageQuantityUnit, number> = {
  kg: 1,
  quintal: 100,
  tonne: 1000,
};

const KG_PER_RATE_UNIT: Record<StorageRateBasis, number> = {
  per_kg_day: 1,
  per_quintal_day: 100,
  per_tonne_day: 1000,
};

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase("en-IN");
}

function toKg(quantity: number, unit: StorageQuantityUnit): number | null {
  if (!Number.isFinite(quantity) || quantity <= 0 || !(unit in KG_PER_UNIT)) {
    return null;
  }
  const value = quantity * KG_PER_UNIT[unit];
  return Number.isFinite(value) ? value : null;
}

function validDate(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}

function validTemperatureRange(
  min?: number | null,
  max?: number | null,
): boolean {
  return (
    min !== null &&
    min !== undefined &&
    max !== null &&
    max !== undefined &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min <= max
  );
}

function estimateCostPaise(
  quantityKg: number,
  storageDays: number,
  ratePaise?: number | null,
  rateBasis?: StorageRateBasis | null,
): number | null {
  if (ratePaise === null || ratePaise === undefined || rateBasis == null) {
    return null;
  }
  if (!Number.isSafeInteger(ratePaise) || ratePaise < 0) {
    return null;
  }
  const amount =
    (quantityKg / KG_PER_RATE_UNIT[rateBasis]) * storageDays * ratePaise;
  return Number.isSafeInteger(Math.round(amount)) ? Math.round(amount) : null;
}

/**
 * Match lots to a published storage listing using explicit area, crop,
 * capacity, date and temperature information. This planner does not reserve
 * space or confirm provider availability.
 */
export function planColdStorage(
  listing: ColdStorageListing,
  candidates: StorageLotCandidate[],
): ColdStoragePlan {
  const capacityKg = toKg(listing.capacity, listing.capacityUnit);
  if (capacityKg === null) {
    throw new Error(
      "Storage listing must have a valid positive capacity and supported unit.",
    );
  }

  const listingWindowValid =
    validDate(listing.availableFrom) &&
    validDate(listing.availableUntil) &&
    listing.availableFrom <= listing.availableUntil;

  if (
    listing.temperatureMinC != null &&
    listing.temperatureMaxC != null &&
    !validTemperatureRange(listing.temperatureMinC, listing.temperatureMaxC)
  ) {
    throw new Error("Storage listing temperature range is invalid.");
  }

  const eligibleLots: StorageLotEstimate[] = [];
  const rejectedLots: StorageLotRejection[] = [];
  let totalQuantityKg = 0;

  for (const lot of candidates) {
    const reasons: string[] = [];
    const quantityKg = toKg(lot.quantity, lot.unit);

    if (listing.status !== "published") {
      reasons.push("Storage listing is not published.");
    }
    if (
      !normalise(lot.storageArea) ||
      normalise(lot.storageArea) !== normalise(listing.facilityArea)
    ) {
      reasons.push("Lot storage area does not match the facility area.");
    }
    if (
      !listing.supportedCrops.some(
        (crop) => normalise(crop) === normalise(lot.crop),
      )
    ) {
      reasons.push(
        "Crop is not included in the facility's stated suitability.",
      );
    }
    if (
      !validDate(lot.arrivalDate) ||
      !Number.isSafeInteger(lot.storageDays) ||
      lot.storageDays <= 0 ||
      !listingWindowValid
    ) {
      reasons.push(
        "Arrival date, storage duration or facility availability window is invalid.",
      );
    } else {
      const lastStorageDate = new Date(
        Date.parse(lot.arrivalDate) + (lot.storageDays - 1) * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);
      if (
        lot.arrivalDate < listing.availableFrom ||
        lastStorageDate > listing.availableUntil
      ) {
        reasons.push(
          "Requested storage period is outside the facility availability window.",
        );
      }
    }
    if (lot.requiresColdChain && !listing.refrigerated) {
      reasons.push(
        "Lot requires cold storage but the facility is not refrigerated.",
      );
    }
    const hasTemperatureRequirement =
      lot.requiredTemperatureMinC != null ||
      lot.requiredTemperatureMaxC != null;
    if (hasTemperatureRequirement) {
      if (
        !validTemperatureRange(
          lot.requiredTemperatureMinC,
          lot.requiredTemperatureMaxC,
        )
      ) {
        reasons.push("Lot temperature requirement is incomplete or invalid.");
      } else if (
        !validTemperatureRange(listing.temperatureMinC, listing.temperatureMaxC)
      ) {
        reasons.push(
          "Facility temperature range is not provided for verification.",
        );
      } else if (
        listing.temperatureMinC! > lot.requiredTemperatureMinC! ||
        listing.temperatureMaxC! < lot.requiredTemperatureMaxC!
      ) {
        reasons.push(
          "Facility temperature range does not cover the lot requirement.",
        );
      }
    }
    if (quantityKg === null) {
      reasons.push("Lot quantity or unit is invalid.");
    } else if (totalQuantityKg + quantityKg > capacityKg) {
      reasons.push(
        "Adding this lot would exceed the remaining storage capacity.",
      );
    }

    if (reasons.length > 0 || quantityKg === null) {
      rejectedLots.push({ lotId: lot.id, reasons });
      continue;
    }

    const cost = estimateCostPaise(
      quantityKg,
      lot.storageDays,
      listing.ratePaise,
      listing.rateBasis,
    );
    eligibleLots.push({
      lotId: lot.id,
      quantityKg,
      storageDays: lot.storageDays,
      estimatedCostPaise: cost,
      costValueType:
        cost === null ? "unavailable" : (listing.rateValueType ?? "indicative"),
    });
    totalQuantityKg += quantityKg;
  }

  return {
    listingId: listing.id,
    eligibleLots,
    rejectedLots,
    totalQuantityKg,
    capacityKg,
    remainingCapacityKg: Math.max(0, capacityKg - totalQuantityKg),
    availabilityLabel:
      listing.verificationState === "verified"
        ? "indicative"
        : "verification_pending",
    bookingStatus: "not_booked",
  };
}
