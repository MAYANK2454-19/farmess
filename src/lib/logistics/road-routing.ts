export type RoadRouteMetric = {
  distanceMeters: number;
  durationSeconds: number;
};

export type RoadRoutingStatus = "available" | "not-configured" | "not-needed" | "unavailable";

export type RoadRoutingResult = {
  status: RoadRoutingStatus;
  routes: Record<string, RoadRouteMetric>;
};

export type RoutableLocation = {
  id: string;
  latitude: number;
  longitude: number;
};

const MATRIX_ENDPOINT = "https://api.heigit.org/openrouteservice/v2/matrix/driving-car";
const MAX_DESTINATIONS_PER_REQUEST = 15;

function isFiniteCoordinate(value: number, minimum: number, maximum: number): boolean {
  return Number.isFinite(value) && value >= minimum && value <= maximum;
}

export function mapRoadMatrixResponse(
  payload: unknown,
  destinationIds: readonly string[],
): Record<string, RoadRouteMetric> {
  if (typeof payload !== "object" || payload === null) return {};

  const matrix = payload as { distances?: unknown; durations?: unknown };
  if (!Array.isArray(matrix.distances) || !Array.isArray(matrix.durations)) return {};

  const distanceRow = matrix.distances[0];
  const durationRow = matrix.durations[0];
  if (!Array.isArray(distanceRow) || !Array.isArray(durationRow)) return {};

  const routes: Record<string, RoadRouteMetric> = {};
  destinationIds.forEach((id, index) => {
    const distanceMeters = distanceRow[index];
    const durationSeconds = durationRow[index];
    if (
      typeof distanceMeters === "number" &&
      Number.isFinite(distanceMeters) &&
      distanceMeters >= 0 &&
      typeof durationSeconds === "number" &&
      Number.isFinite(durationSeconds) &&
      durationSeconds >= 0
    ) {
      routes[id] = { distanceMeters, durationSeconds };
    }
  });

  return routes;
}

/**
 * Retrieves one-to-many driving distances and durations from HeiGIT.
 * This is an optional enrichment: callers must retain their straight-line fallback.
 */
export async function getRoadRoutes(
  origin: { latitude: number; longitude: number },
  candidates: readonly RoutableLocation[],
): Promise<RoadRoutingResult> {
  const apiKey = process.env.HEIGIT_API_KEY?.trim();
  if (!apiKey) return { status: "not-configured", routes: {} };

  if (
    !isFiniteCoordinate(origin.latitude, -90, 90) ||
    !isFiniteCoordinate(origin.longitude, -180, 180)
  ) {
    return { status: "unavailable", routes: {} };
  }

  const destinations = candidates
    .filter(
      (candidate) =>
        candidate.id &&
        isFiniteCoordinate(candidate.latitude, -90, 90) &&
        isFiniteCoordinate(candidate.longitude, -180, 180),
    )
    .slice(0, MAX_DESTINATIONS_PER_REQUEST);

  if (destinations.length === 0) return { status: "not-needed", routes: {} };

  const destinationIds = destinations.map((candidate) => candidate.id);
  const locations = [
    [origin.longitude, origin.latitude],
    ...destinations.map((candidate) => [candidate.longitude, candidate.latitude]),
  ];

  try {
    const response = await fetch(MATRIX_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        locations,
        sources: [0],
        destinations: destinationIds.map((_, index) => index + 1),
        metrics: ["distance", "duration"],
        units: "m",
        resolve_locations: false,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return { status: "unavailable", routes: {} };

    const routes = mapRoadMatrixResponse(await response.json(), destinationIds);
    return {
      status: Object.keys(routes).length > 0 ? "available" : "unavailable",
      routes,
    };
  } catch {
    return { status: "unavailable", routes: {} };
  }
}
