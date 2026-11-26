export type LogisticsMatch = boolean | null;

export type NearbyServiceCandidate = {
  id: string;
  title: string;
  service_type: "transport" | "storage";
  service_area: string;
  destination_area: string | null;
  description: string | null;
  price_paise: number | null;
  rate_basis: string;
  capacity_quantity: number | null;
  capacity_unit: string | null;
  available_from: string | null;
  available_until: string | null;
  service_radius_km: number | null;
  service_radius_match: LogisticsMatch;
  crop_suitability: string[];
  cold_chain_available: boolean;
  verification_state:
    "unverified" | "contact_verified" | "document_verified" | "platform_verified" | "suspended";
  latitude: number;
  longitude: number;
  destination_latitude: number | null;
  destination_longitude: number | null;
  distance_meters: number;
  capacity_match: LogisticsMatch;
  crop_match: LogisticsMatch;
  date_match: LogisticsMatch;
  cold_chain_match: LogisticsMatch;
};

export type RoadRouteMetric = { distanceMeters: number; durationSeconds: number };

/** Road distance is usually longer than straight-line; scale the radius when scoring by road. */
export const ROAD_DETOUR_ALLOWANCE = 1.4;

export type LogisticsRequirements = {
  crop?: string | null;
  requiredQuantity?: number | null;
  unit?: "kg" | "quintal" | "tonne" | null;
  requiredDate?: string | null;
  requiresColdChain?: boolean;
  preferredServiceType?: "transport" | "storage" | null;
  maximumRadiusMeters: number;
};

export type LogisticsRecommendation = {
  listing: NearbyServiceCandidate;
  score: number;
  status: "recommended" | "eligible" | "needs_confirmation" | "excluded";
  completenessPercent: number;
  reasons: string[];
  unknowns: string[];
  scoreBreakdown: {
    proximity: number;
    capacity: number;
    cropSuitability: number;
    availability: number;
    coldChain: number;
    verification: number;
    pricingTransparency: number;
    serviceCoverage: number;
  };
  rankingVersion: "rules-v2";
  method: "explainable-heuristic";
  bookingStatus: "not_booked";
  /** Which distance the proximity score used. */
  distanceBasis: "road" | "straight_line";
  roadRoute?: RoadRouteMetric | null;
  /** price x road km, only for per-km transport listings with a road route. */
  estimatedTripCostPaise?: number | null;
};

const KNOWN_UNITS = ["kg", "quintal", "tonne"] as const;

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 10) / 10;
}

function proximityScore(distanceMeters: number, maximumRadiusMeters: number): number {
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return 0;
  return roundScore(25 * Math.max(0, 1 - distanceMeters / maximumRadiusMeters));
}

function verificationScore(state: NearbyServiceCandidate["verification_state"]): number {
  switch (state) {
    case "platform_verified":
      return 15;
    case "document_verified":
      return 12;
    case "contact_verified":
      return 8;
    case "unverified":
      return 2;
    default:
      return 0;
  }
}

function hasComparableRate(candidate: NearbyServiceCandidate): boolean {
  if (
    candidate.price_paise === null ||
    !Number.isSafeInteger(candidate.price_paise) ||
    candidate.price_paise < 0
  ) {
    return false;
  }
  return ["per_trip", "per_km", "per_kg", "per_quintal", "per_tonne", "per_day", "fixed"].includes(
    candidate.rate_basis,
  );
}

function kilometres(meters: number): string {
  return (meters / 1000).toFixed(meters < 10_000 ? 1 : 0);
}

/**
 * Rank nearby listings with explainable rules. When a road route is known for a
 * listing (HeiGIT), proximity is scored on road distance (radius scaled by
 * ROAD_DETOUR_ALLOWANCE); otherwise on straight-line distance.
 */
export function rankLogisticsCandidates(
  candidates: readonly NearbyServiceCandidate[],
  requirements: LogisticsRequirements,
  roadRoutes: Readonly<Record<string, RoadRouteMetric>> = {},
): LogisticsRecommendation[] {
  const radius = requirements.maximumRadiusMeters;
  if (!Number.isFinite(radius) || radius < 500 || radius > 100_000) {
    throw new Error("Maximum radius must be between 500 and 100000 metres.");
  }

  if (requirements.requiredQuantity !== undefined && requirements.requiredQuantity !== null) {
    if (
      !Number.isFinite(requirements.requiredQuantity) ||
      requirements.requiredQuantity <= 0 ||
      !requirements.unit ||
      !KNOWN_UNITS.includes(requirements.unit)
    ) {
      throw new Error("A positive requested quantity and supported unit are required together.");
    }
  }

  const cropRequested = Boolean(requirements.crop?.trim());
  const dateRequested = Boolean(requirements.requiredDate);
  const coldChainRequested = requirements.requiresColdChain === true;

  const ranked = candidates.map((candidate): LogisticsRecommendation => {
    const reasons: string[] = [];
    const unknowns: string[] = [];
    const exclusions: string[] = [];

    if (candidate.verification_state === "suspended") {
      exclusions.push("This provider listing is suspended.");
    }
    if (
      requirements.preferredServiceType &&
      candidate.service_type !== requirements.preferredServiceType
    ) {
      exclusions.push("This listing does not match the selected service type.");
    }
    if (
      !Number.isFinite(candidate.latitude) ||
      !Number.isFinite(candidate.longitude) ||
      candidate.latitude < -90 ||
      candidate.latitude > 90 ||
      candidate.longitude < -180 ||
      candidate.longitude > 180
    ) {
      exclusions.push("The provider location is invalid.");
    }
    if (
      !Number.isFinite(candidate.distance_meters) ||
      candidate.distance_meters < 0 ||
      candidate.distance_meters > radius
    ) {
      exclusions.push("The listing is outside the requested search radius.");
    }

    let capacityScore = 5;
    if (requirements.requiredQuantity === undefined || requirements.requiredQuantity === null) {
      capacityScore = 15;
      reasons.push("No quantity constraint was requested for this search.");
    } else if (candidate.capacity_match === true) {
      capacityScore = 15;
      reasons.push("The stated provider capacity can accommodate the requested quantity.");
    } else if (candidate.capacity_match === false) {
      exclusions.push("The stated provider capacity is below the requested quantity.");
      capacityScore = 0;
    } else {
      unknowns.push("Provider capacity is not sufficient to confirm a quantity match.");
    }

    let cropScore = 5;
    if (!cropRequested) {
      cropScore = 15;
      reasons.push("No crop-specific restriction was requested.");
    } else if (candidate.crop_match === true) {
      cropScore = 15;
      reasons.push("The provider lists this crop as suitable.");
    } else if (candidate.crop_match === false) {
      cropScore = 0;
      exclusions.push("The provider does not list the requested crop as suitable.");
    } else {
      unknowns.push("Crop suitability has not been specified by the provider.");
    }

    let availabilityScore = 3;
    if (!dateRequested) {
      availabilityScore = 10;
      reasons.push("No specific service date was requested.");
    } else if (candidate.date_match === true) {
      availabilityScore = 10;
      reasons.push("The requested date falls within the provider's stated availability.");
    } else if (candidate.date_match === false) {
      availabilityScore = 0;
      exclusions.push("The requested date is outside the provider's stated availability.");
    } else {
      unknowns.push("Provider availability for the requested date is not confirmed.");
    }

    let serviceCoverageScore = 3;
    if (candidate.service_radius_match === true) {
      serviceCoverageScore = 10;
      reasons.push("The origin falls within the provider's stated service radius.");
    } else if (candidate.service_radius_match === false) {
      serviceCoverageScore = 0;
      exclusions.push("The origin is outside the provider's stated service radius.");
    } else {
      unknowns.push("The provider has not specified a maximum service radius.");
    }

    let coldChainScore = 10;
    if (coldChainRequested) {
      if (candidate.cold_chain_match === true) {
        reasons.push("The provider states that cold-chain service is available.");
      } else if (candidate.cold_chain_match === false) {
        coldChainScore = 0;
        exclusions.push("Cold-chain support is required but is not available on this listing.");
      } else {
        coldChainScore = 3;
        unknowns.push("Cold-chain capability has not been verified for this listing.");
      }
    }

    const road = roadRoutes[candidate.id] ?? null;
    const proximity = road
      ? proximityScore(road.distanceMeters, radius * ROAD_DETOUR_ALLOWANCE)
      : proximityScore(candidate.distance_meters, radius);
    if (road) {
      reasons.push(
        `About ${kilometres(road.distanceMeters)} km by road, roughly ${Math.max(1, Math.round(road.durationSeconds / 60))} min drive.`,
      );
    } else if (Number.isFinite(candidate.distance_meters) && candidate.distance_meters >= 0) {
      reasons.push(
        `About ${kilometres(candidate.distance_meters)} km away in a straight line (road route unavailable).`,
      );
    }
    const estimatedTripCostPaise =
      road &&
      candidate.service_type === "transport" &&
      candidate.rate_basis === "per_km" &&
      candidate.price_paise !== null &&
      Number.isSafeInteger(candidate.price_paise) &&
      candidate.price_paise >= 0
        ? Math.round((candidate.price_paise * road.distanceMeters) / 1000)
        : null;
    if (estimatedTripCostPaise !== null) {
      reasons.push(
        `Estimated one-way trip cost about ₹${Math.round(estimatedTripCostPaise / 100).toLocaleString("en-IN")} at the listed per-km rate (confirm with the provider).`,
      );
    }
    const verification = verificationScore(candidate.verification_state);
    if (candidate.verification_state === "platform_verified") {
      reasons.push("Provider identity and listing have platform verification.");
    } else if (candidate.verification_state === "document_verified") {
      reasons.push(
        "Provider documents have been checked; live availability still needs confirmation.",
      );
    } else if (candidate.verification_state === "contact_verified") {
      reasons.push("Provider contact has been checked; service availability is still unconfirmed.");
    } else {
      unknowns.push("Provider verification is pending.");
    }

    const pricingTransparency = hasComparableRate(candidate) ? 5 : 0;
    if (pricingTransparency === 5) {
      reasons.push(`The listing states a rate basis: ${candidate.rate_basis}.`);
    } else {
      unknowns.push("A comparable rate is not listed; request a provider quote.");
    }

    const score = roundScore(
      roundScore(proximity * 0.8) +
        capacityScore +
        cropScore +
        availabilityScore +
        coldChainScore +
        verification +
        pricingTransparency +
        serviceCoverageScore,
    );

    const evaluated = [
      candidate.distance_meters,
      candidate.service_radius_match,
      requirements.requiredQuantity == null ? true : candidate.capacity_match,
      cropRequested ? candidate.crop_match : true,
      dateRequested ? candidate.date_match : true,
      coldChainRequested ? candidate.cold_chain_match : true,
      candidate.verification_state !== "unverified",
      hasComparableRate(candidate),
    ];
    const knownCount = evaluated.filter((value) => value !== null && value !== undefined).length;
    const completenessPercent = Math.round((knownCount / evaluated.length) * 100);

    const status = exclusions.length
      ? "excluded"
      : unknowns.length
        ? "needs_confirmation"
        : score >= 70 && candidate.verification_state !== "unverified"
          ? "recommended"
          : "eligible";

    return {
      listing: candidate,
      score,
      status,
      completenessPercent,
      reasons: [...reasons, ...exclusions],
      unknowns,
      scoreBreakdown: {
        proximity,
        capacity: capacityScore,
        cropSuitability: cropScore,
        availability: availabilityScore,
        coldChain: coldChainScore,
        verification,
        pricingTransparency,
        serviceCoverage: serviceCoverageScore,
      },
      rankingVersion: "rules-v2",
      method: "explainable-heuristic",
      bookingStatus: "not_booked",
      distanceBasis: road ? "road" : "straight_line",
      roadRoute: road,
      estimatedTripCostPaise,
    };
  });

  return ranked.sort((a, b) => {
    const statusRank = (status: LogisticsRecommendation["status"]) =>
      status === "recommended"
        ? 0
        : status === "eligible"
          ? 1
          : status === "needs_confirmation"
            ? 2
            : 3;
    return (
      statusRank(a.status) - statusRank(b.status) ||
      b.score - a.score ||
      (a.roadRoute?.distanceMeters ?? a.listing.distance_meters) -
        (b.roadRoute?.distanceMeters ?? b.listing.distance_meters)
    );
  });
}
