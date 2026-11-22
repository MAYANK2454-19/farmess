export type QuantityUnit = "kg" | "quintal" | "tonne";

export type ProduceLotForMatching = {
  id: string;
  crop: string;
  variety?: string | null;
  grade?: string | null;
  quantity: number;
  unit: QuantityUnit;
  locationArea: string;
  availableAt: string;
  sellBy?: string | null;
  status: "draft" | "published" | "sold" | "withdrawn";
};

export type BuyerRequirementForMatching = {
  id: string;
  crop: string;
  variety?: string | null;
  grade?: string | null;
  quantity: number;
  unit: QuantityUnit;
  locationArea: string;
  requiredAt: string;
};

export type MatchResult = {
  lotId: string;
  requirementId: string;
  status: "match" | "partial" | "no_match";
  reasons: string[];
  unknowns: string[];
};

const UNIT_IN_KG: Record<QuantityUnit, number> = {
  kg: 1,
  quintal: 100,
  tonne: 1000,
};

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase("en-IN");
}

function isValidDate(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

/**
 * Explainable, deterministic lot matching. Unknown optional attributes produce
 * a partial result; incompatible known attributes produce no match.
 */
export function matchProduceLot(
  lot: ProduceLotForMatching,
  requirement: BuyerRequirementForMatching,
): MatchResult {
  const reasons: string[] = [];
  const unknowns: string[] = [];
  let incompatible = false;

  if (lot.status !== "published") {
    incompatible = true;
    reasons.push("The lot is not published for buyer matching.");
  }

  if (!lot.crop.trim() || !requirement.crop.trim()) {
    unknowns.push("Crop information is incomplete.");
  } else if (normalise(lot.crop) !== normalise(requirement.crop)) {
    incompatible = true;
    reasons.push("Crop does not match the buyer requirement.");
  } else {
    reasons.push("Crop matches.");
  }

  for (const field of ["variety", "grade"] as const) {
    const lotValue = lot[field]?.trim();
    const requiredValue = requirement[field]?.trim();
    if (!requiredValue) {
      unknowns.push(`Buyer has not specified ${field}.`);
    } else if (!lotValue) {
      unknowns.push(`Lot ${field} is not specified.`);
    } else if (normalise(lotValue) !== normalise(requiredValue)) {
      incompatible = true;
      reasons.push(`${field[0].toUpperCase()}${field.slice(1)} does not match.`);
    } else {
      reasons.push(`${field[0].toUpperCase()}${field.slice(1)} matches.`);
    }
  }

  if (
    !Number.isFinite(lot.quantity) ||
    lot.quantity <= 0 ||
    !Number.isFinite(requirement.quantity) ||
    requirement.quantity <= 0
  ) {
    unknowns.push("A valid positive quantity is required to compare volume.");
  } else if (
    !(lot.unit in UNIT_IN_KG) ||
    !(requirement.unit in UNIT_IN_KG) ||
    !Number.isFinite(lot.quantity * UNIT_IN_KG[lot.unit]) ||
    !Number.isFinite(requirement.quantity * UNIT_IN_KG[requirement.unit])
  ) {
    unknowns.push("A supported quantity unit is required to compare volume.");
  } else {
    const lotKg = lot.quantity * UNIT_IN_KG[lot.unit];
    const requiredKg = requirement.quantity * UNIT_IN_KG[requirement.unit];
    if (lotKg < requiredKg) {
      incompatible = true;
      reasons.push("Lot quantity is below the requested quantity.");
    } else {
      reasons.push("Lot quantity meets or exceeds the requested quantity.");
    }
  }

  if (!lot.locationArea.trim() || !requirement.locationArea.trim()) {
    unknowns.push("Location compatibility cannot be determined.");
  } else if (normalise(lot.locationArea) !== normalise(requirement.locationArea)) {
    incompatible = true;
    reasons.push("Pickup area does not match the requested area.");
  } else {
    reasons.push("Pickup area matches.");
  }

  if (!isValidDate(lot.availableAt) || !isValidDate(requirement.requiredAt)) {
    unknowns.push("Availability date compatibility cannot be determined.");
  } else {
    const available = Date.parse(lot.availableAt);
    const required = Date.parse(requirement.requiredAt);
    if (lot.sellBy && !isValidDate(lot.sellBy)) {
      unknowns.push("The lot sell-by date is invalid.");
    }
    const sellBy = lot.sellBy && isValidDate(lot.sellBy) ? Date.parse(lot.sellBy) : null;
    if (available > required || (sellBy !== null && sellBy < required)) {
      incompatible = true;
      reasons.push("Lot availability does not cover the required date.");
    } else {
      reasons.push("Lot availability covers the required date.");
    }
  }

  return {
    lotId: lot.id,
    requirementId: requirement.id,
    status: incompatible ? "no_match" : unknowns.length > 0 ? "partial" : "match",
    reasons,
    unknowns,
  };
}

export type OfferStatus = "pending" | "accepted" | "declined" | "withdrawn" | "expired";
export type OfferAction = "accept" | "decline" | "withdraw" | "expire";

export type OfferForTransition = {
  id: string;
  buyerId: string;
  farmerId: string;
  validUntil: string;
  status: OfferStatus;
};

export type MarketplaceActor = { id: string; role: "farmer" | "buyer" | "provider" };

export type TransitionResult<TStatus extends string> = {
  status: TStatus;
  changed: boolean;
  reason?: string;
};

export function transitionOffer(
  offer: OfferForTransition,
  actor: MarketplaceActor,
  action: OfferAction,
  now: Date = new Date(),
): TransitionResult<OfferStatus> {
  if (offer.status !== "pending") {
    return {
      status: offer.status,
      changed: false,
      reason: "Only pending offers can change state.",
    };
  }

  const expiry = Date.parse(offer.validUntil);
  if (!Number.isFinite(expiry)) {
    return { status: offer.status, changed: false, reason: "Offer validity date is invalid." };
  }
  if (now.getTime() >= expiry && action !== "expire") {
    return { status: "expired", changed: true, reason: "Offer validity has ended." };
  }

  if (action === "expire") {
    if (now.getTime() < expiry) {
      return { status: offer.status, changed: false, reason: "Offer has not expired." };
    }
    return { status: "expired", changed: true };
  }

  if (action === "accept" || action === "decline") {
    if (actor.role !== "farmer" || actor.id !== offer.farmerId) {
      return {
        status: offer.status,
        changed: false,
        reason: "Only the lot-owning farmer can respond.",
      };
    }
    return { status: action === "accept" ? "accepted" : "declined", changed: true };
  }

  if (action === "withdraw") {
    if (actor.role !== "buyer" || actor.id !== offer.buyerId) {
      return {
        status: offer.status,
        changed: false,
        reason: "Only the offer's buyer can withdraw it.",
      };
    }
    return { status: "withdrawn", changed: true };
  }

  return { status: offer.status, changed: false, reason: "Unsupported offer action." };
}

export type LogisticsStatus =
  "pending" | "accepted" | "declined" | "more_information" | "cancelled";

export type LogisticsAction = "accept" | "decline" | "request_information" | "resubmit" | "cancel";

export type LogisticsRequestForTransition = {
  id: string;
  farmerId: string;
  providerId: string;
  status: LogisticsStatus;
};

export function transitionLogisticsRequest(
  request: LogisticsRequestForTransition,
  actor: MarketplaceActor,
  action: LogisticsAction,
): TransitionResult<LogisticsStatus> {
  if (action === "accept" || action === "decline" || action === "request_information") {
    if (actor.role !== "provider" || actor.id !== request.providerId) {
      return {
        status: request.status,
        changed: false,
        reason: "Only the assigned provider can respond.",
      };
    }
    if (request.status !== "pending") {
      return {
        status: request.status,
        changed: false,
        reason: "Only pending requests can receive a provider response.",
      };
    }
    const status =
      action === "accept" ? "accepted" : action === "decline" ? "declined" : "more_information";
    return { status, changed: true };
  }

  if (action === "resubmit") {
    if (actor.role !== "farmer" || actor.id !== request.farmerId) {
      return {
        status: request.status,
        changed: false,
        reason: "Only the requesting farmer can update this request.",
      };
    }
    if (request.status !== "more_information") {
      return {
        status: request.status,
        changed: false,
        reason: "Only requests awaiting information can be resubmitted.",
      };
    }
    return { status: "pending", changed: true };
  }

  if (action === "cancel") {
    if (actor.role !== "farmer" || actor.id !== request.farmerId) {
      return {
        status: request.status,
        changed: false,
        reason: "Only the requesting farmer can cancel this request.",
      };
    }
    if (
      request.status !== "pending" &&
      request.status !== "more_information" &&
      request.status !== "accepted"
    ) {
      return {
        status: request.status,
        changed: false,
        reason: "This request can no longer be cancelled.",
      };
    }
    return { status: "cancelled", changed: true };
  }

  return { status: request.status, changed: false, reason: "Unsupported logistics action." };
}
