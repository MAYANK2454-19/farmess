import { INDIA_STATES, approximateCoordinate, isValidPincode } from "../../lib/location/india.ts";

/*
 * Validates the location part of a profile update. Coordinates are rounded to
 * about 1 km on the server, whatever the client sends, so a precise home
 * location is never stored.
 */

export const LOCATION_FIELDS = [
  "state",
  "district",
  "pincode",
  "location_latitude",
  "location_longitude",
  "location_source",
] as const;

export const LOCATION_SOURCES = ["gps", "pincode", "manual"] as const;
export type LocationSource = (typeof LOCATION_SOURCES)[number];

export type LocationUpdate = {
  state?: string | null;
  district?: string | null;
  pincode?: string | null;
  location_latitude?: number | null;
  location_longitude?: number | null;
  location_source?: LocationSource | null;
  location_updated_at?: string;
};

export type LocationParseResult =
  { ok: true; update: LocationUpdate } | { ok: false; error: string };

function emptyToNull(value: unknown): unknown {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

export function parseLocationPatch(
  body: Record<string, unknown>,
  now: Date = new Date(),
): LocationParseResult {
  const touched = LOCATION_FIELDS.some((field) => field in body);
  if (!touched) return { ok: true, update: {} };

  const state = emptyToNull(body.state);
  const district = emptyToNull(body.district);
  const pincode = emptyToNull(body.pincode);
  const latitude = emptyToNull(body.location_latitude);
  const longitude = emptyToNull(body.location_longitude);
  const source = emptyToNull(body.location_source);

  if (state !== null && state !== undefined) {
    if (typeof state !== "string" || !INDIA_STATES.includes(state)) {
      return { ok: false, error: "Choose a state or union territory from the list." };
    }
  }
  if (district !== null && district !== undefined) {
    if (typeof district !== "string" || district.trim().length < 2 || district.trim().length > 80) {
      return { ok: false, error: "Choose a district." };
    }
    if (!state) return { ok: false, error: "Choose the state before the district." };
  }
  if (pincode !== null && pincode !== undefined) {
    if (typeof pincode !== "string" || !isValidPincode(pincode.trim())) {
      return { ok: false, error: "Enter a 6-digit PIN code that does not start with 0." };
    }
  }

  const hasLat = latitude !== null && latitude !== undefined;
  const hasLng = longitude !== null && longitude !== undefined;
  if (hasLat !== hasLng) {
    return { ok: false, error: "Location needs both latitude and longitude." };
  }
  if (hasLat) {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (
      typeof latitude !== "number" ||
      typeof longitude !== "number" ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < 6 ||
      lat > 38 ||
      lng < 68 ||
      lng > 98
    ) {
      return { ok: false, error: "The selected location must be inside India." };
    }
  }

  if (
    source !== null &&
    source !== undefined &&
    !LOCATION_SOURCES.includes(source as LocationSource)
  ) {
    return { ok: false, error: "Unknown location source." };
  }

  return {
    ok: true,
    update: {
      state: (state as string | null | undefined) ?? null,
      district: typeof district === "string" ? district.trim() : null,
      pincode: typeof pincode === "string" ? pincode.trim() : null,
      location_latitude: hasLat ? approximateCoordinate(latitude as number) : null,
      location_longitude: hasLng ? approximateCoordinate(longitude as number) : null,
      location_source: (source as LocationSource | null | undefined) ?? null,
      location_updated_at: now.toISOString(),
    },
  };
}
