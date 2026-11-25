import { withApiLogging } from "@/lib/observability/logger";
import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { LOCATION_ATTRIBUTION, reverseGeocode } from "@/lib/location/lookup";

export const dynamic = "force-dynamic";

function coordinate(value: string | null, min: number, max: number): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : null;
}

/**
 * Device location -> state, district, PIN and locality. Coordinates are
 * rounded to about 1 km before leaving Farmess and are not stored here.
 */
async function handleGET(request: NextRequest) {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to use your location." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const latitude = coordinate(params.get("lat"), -90, 90);
  const longitude = coordinate(params.get("lng"), -180, 180);
  if (latitude === null || longitude === null) {
    return NextResponse.json({ error: "Send a valid latitude and longitude." }, { status: 400 });
  }

  try {
    const place = await reverseGeocode(latitude, longitude);
    if (!place || !place.state) {
      return NextResponse.json(
        { error: "This location is outside India or could not be matched to a state." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { place, attribution: LOCATION_ATTRIBUTION },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Location lookup is not reachable right now. Choose state and district instead." },
      { status: 502 },
    );
  }
}

export const GET = withApiLogging("/api/location/reverse", "GET", handleGET);
