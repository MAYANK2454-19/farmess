import "server-only";

import { TtlCache } from "@/lib/market-data/ogd-cache";
import { approximateCoordinate } from "./india";
import {
  parseIndiaPostResponse,
  parseNominatimReverse,
  parseNominatimSearch,
  type PincodePlace,
  type ReversePlace,
} from "./providers";

/*
 * Network lookups for PIN codes and approximate coordinates, cached for a day
 * (PIN codes and places do not move). Requests identify Farmess as required by
 * the OpenStreetMap Nominatim usage policy; no user data is sent beyond the PIN
 * or ~1 km-rounded coordinates.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 8_000;
const USER_AGENT = "Farmess/1.0 (+https://farmess.vercel.app)";

export const LOCATION_ATTRIBUTION =
  "PIN directory: India Post. Map data © OpenStreetMap contributors (ODbL).";

export type PincodeLookup = PincodePlace & {
  latitude: number | null;
  longitude: number | null;
};

export type ReverseLookup = ReversePlace & { latitude: number; longitude: number };

const pincodeCache = new TtlCache<PincodeLookup | null>(500);
const reverseCache = new TtlCache<ReverseLookup | null>(500);

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Location provider returned HTTP ${response.status}.`);
  return response.json();
}

/** PIN -> state, district, post offices and approximate coordinates. Null when unknown. */
export async function lookupPincode(pincode: string): Promise<PincodeLookup | null> {
  const cached = pincodeCache.get(pincode);
  if (cached !== undefined) return cached;

  const place = parseIndiaPostResponse(
    pincode,
    await getJson(`https://api.postalpincode.in/pincode/${encodeURIComponent(pincode)}`),
  );
  if (!place) {
    pincodeCache.set(pincode, null, DAY_MS);
    return null;
  }

  let coordinates: { latitude: number; longitude: number } | null = null;
  try {
    coordinates = parseNominatimSearch(
      await getJson(
        `https://nominatim.openstreetmap.org/search?postalcode=${encodeURIComponent(pincode)}` +
          "&country=India&format=json&limit=1",
      ),
    );
  } catch {
    // The PIN is still valid without coordinates; nearby search can use the district.
  }

  const result: PincodeLookup = {
    ...place,
    latitude: coordinates ? approximateCoordinate(coordinates.latitude) : null,
    longitude: coordinates ? approximateCoordinate(coordinates.longitude) : null,
  };
  pincodeCache.set(pincode, result, DAY_MS);
  return result;
}

/** Approximate coordinates -> state, district, PIN and locality. Null outside India. */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
): Promise<ReverseLookup | null> {
  const lat = approximateCoordinate(latitude);
  const lng = approximateCoordinate(longitude);
  const key = `${lat},${lng}`;
  const cached = reverseCache.get(key);
  if (cached !== undefined) return cached;

  const place = parseNominatimReverse(
    await getJson(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}` +
        "&format=json&zoom=14&addressdetails=1",
    ),
  );
  const result = place ? { ...place, latitude: lat, longitude: lng } : null;
  reverseCache.set(key, result, DAY_MS);
  return result;
}

const districtCache = new TtlCache<{ latitude: number; longitude: number } | null>(500);

/**
 * Approximate centre of a district (OpenStreetMap), so choosing only state and
 * district is enough for nearby search. Rounded to ~1 km; cached for a day.
 */
export async function lookupDistrictCentre(
  state: string,
  district: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const key = `${state.toLowerCase()}|${district.toLowerCase()}`;
  const cached = districtCache.get(key);
  if (cached !== undefined) return cached;

  const query = encodeURIComponent(`${district} district, ${state}, India`);
  let coordinates = parseNominatimSearch(
    await getJson(
      `https://nominatim.openstreetmap.org/search?q=${query}&countrycodes=in&format=json&limit=1`,
    ),
  );
  if (!coordinates) {
    // Some districts are indexed by their headquarters town rather than "<name> district".
    const fallback = encodeURIComponent(`${district}, ${state}, India`);
    coordinates = parseNominatimSearch(
      await getJson(
        `https://nominatim.openstreetmap.org/search?q=${fallback}&countrycodes=in&format=json&limit=1`,
      ),
    );
  }
  const result = coordinates
    ? {
        latitude: approximateCoordinate(coordinates.latitude),
        longitude: approximateCoordinate(coordinates.longitude),
      }
    : null;
  districtCache.set(key, result, DAY_MS);
  return result;
}
