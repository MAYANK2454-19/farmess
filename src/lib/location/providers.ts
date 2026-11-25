/*
 * Pure parsers for the two public location services Farmess uses:
 *   - India Post PIN directory (api.postalpincode.in): PIN -> post offices,
 *     district and state.
 *   - OpenStreetMap Nominatim: PIN -> approximate coordinates, and
 *     coordinates -> state/district/PIN for the "use my location" button.
 * Network calls live in lookup.ts; these functions are side-effect free so
 * they can be unit tested.
 */
import { canonicalDistrict, canonicalState } from "./india.ts";

export type PincodePlace = {
  pincode: string;
  state: string;
  district: string;
  postOffices: string[];
};

export type ReversePlace = {
  state: string | null;
  district: string | null;
  pincode: string | null;
  locality: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Parse India Post's response. Returns null when the PIN has no post offices. */
export function parseIndiaPostResponse(pincode: string, payload: unknown): PincodePlace | null {
  const first = Array.isArray(payload) ? payload[0] : null;
  if (!isRecord(first) || first.Status !== "Success" || !Array.isArray(first.PostOffice)) {
    return null;
  }
  const offices = first.PostOffice.filter(isRecord);
  if (offices.length === 0) return null;

  const state = canonicalState(text(offices[0].State));
  if (!state) return null;
  const district = canonicalDistrict(state, text(offices[0].District));
  if (!district) return null;

  const postOffices = [
    ...new Set(offices.map((office) => text(office.Name)).filter((name): name is string => !!name)),
  ].slice(0, 12);

  return { pincode, state, district, postOffices };
}

/** Parse a Nominatim search response into a coordinate pair. */
export function parseNominatimSearch(
  payload: unknown,
): { latitude: number; longitude: number } | null {
  const first = Array.isArray(payload) ? payload[0] : null;
  if (!isRecord(first)) return null;
  const latitude = Number(first.lat);
  const longitude = Number(first.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  // India's bounding box, as a sanity check on the geocoder.
  if (latitude < 6 || latitude > 38 || longitude < 68 || longitude > 98) return null;
  return { latitude, longitude };
}

/** Parse a Nominatim reverse-geocoding response (India only). */
export function parseNominatimReverse(payload: unknown): ReversePlace | null {
  if (!isRecord(payload) || !isRecord(payload.address)) return null;
  const address = payload.address;
  if (text(address.country_code) && address.country_code !== "in") return null;

  const state = canonicalState(text(address.state));
  const rawDistrict =
    text(address.state_district) ?? text(address.county) ?? text(address.city_district);
  const district = state ? canonicalDistrict(state, rawDistrict) : null;
  const postcode = text(address.postcode)?.replace(/\s+/g, "") ?? null;

  return {
    state,
    district,
    pincode: postcode && /^[1-9][0-9]{5}$/.test(postcode) ? postcode : null,
    locality:
      text(address.village) ??
      text(address.town) ??
      text(address.suburb) ??
      text(address.city) ??
      null,
  };
}
