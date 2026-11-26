import { withApiLogging } from "@/lib/observability/logger";
import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { canonicalDistrict, canonicalState } from "@/lib/location/india";
import { LOCATION_ATTRIBUTION, lookupDistrictCentre } from "@/lib/location/lookup";

export const dynamic = "force-dynamic";

/** State + district -> approximate (~1 km) centre point, for nearby search. */
async function handleGET(request: NextRequest) {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to look up a district." }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;
  const state = canonicalState(params.get("state"));
  const district = state ? canonicalDistrict(state, params.get("district")) : null;
  if (!state || !district) {
    return NextResponse.json(
      { error: "Choose a valid state and one of its districts." },
      { status: 400 },
    );
  }

  try {
    const centre = await lookupDistrictCentre(state, district);
    if (!centre) {
      return NextResponse.json(
        { error: "This district could not be placed on the map. Add a PIN code instead." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { place: { state, district, ...centre }, attribution: LOCATION_ATTRIBUTION },
      { headers: { "Cache-Control": "private, max-age=86400" } },
    );
  } catch {
    return NextResponse.json(
      { error: "The map service is not reachable right now. Add a PIN code instead." },
      { status: 502 },
    );
  }
}

export const GET = withApiLogging("/api/location/district", "GET", handleGET);
