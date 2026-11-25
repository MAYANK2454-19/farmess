import { withApiLogging } from "@/lib/observability/logger";
import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { isValidPincode } from "@/lib/location/india";
import { LOCATION_ATTRIBUTION, lookupPincode } from "@/lib/location/lookup";

export const dynamic = "force-dynamic";

/** PIN code -> state, district, post offices and approximate (~1 km) coordinates. */
async function handleGET(request: NextRequest) {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to look up a PIN code." }, { status: 401 });
  }

  const pincode = request.nextUrl.searchParams.get("pin")?.trim() ?? "";
  if (!isValidPincode(pincode)) {
    return NextResponse.json(
      { error: "Enter a 6-digit PIN code that does not start with 0." },
      { status: 400 },
    );
  }

  try {
    const place = await lookupPincode(pincode);
    if (!place) {
      return NextResponse.json(
        { error: "India Post has no post office for this PIN code." },
        { status: 404 },
      );
    }
    return NextResponse.json(
      { place, attribution: LOCATION_ATTRIBUTION },
      { headers: { "Cache-Control": "private, max-age=3600" } },
    );
  } catch {
    return NextResponse.json(
      { error: "The PIN directory is not reachable right now. Choose state and district instead." },
      { status: 502 },
    );
  }
}

export const GET = withApiLogging("/api/location/pincode", "GET", handleGET);
