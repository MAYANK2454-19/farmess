import { NextRequest, NextResponse } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  rankLogisticsCandidates,
  type NearbyServiceCandidate,
} from "@/features/logistics/recommendations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseCoordinate(value: string | null, minimum: number, maximum: number): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : null;
}

function parseOptionalPositiveNumber(value: string | null): number | null | undefined {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= Number.MAX_SAFE_INTEGER
    ? parsed
    : undefined;
}

function parseCalendarDate(value: string | null): string | null | undefined {
  if (value === null || value.trim() === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value
    : undefined;
}

export async function GET(request: NextRequest) {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to find nearby logistics support." },
      { status: 401 },
    );
  }
  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "Local logistics discovery is available to farmer accounts." },
      { status: 403 },
    );
  }

  const params = request.nextUrl.searchParams;
  const latitude = parseCoordinate(params.get("lat"), -90, 90);
  const longitude = parseCoordinate(params.get("lng"), -180, 180);
  if (latitude === null || longitude === null) {
    return NextResponse.json(
      { error: "Provide a valid location after choosing to share your current area." },
      { status: 400 },
    );
  }

  const radiusKm = params.has("radiusKm") ? Number(params.get("radiusKm")) : 25;
  if (!Number.isFinite(radiusKm) || radiusKm < 0.5 || radiusKm > 100) {
    return NextResponse.json(
      { error: "Search radius must be between 0.5 and 100 km." },
      { status: 400 },
    );
  }

  const serviceType = params.get("serviceType") || null;
  if (serviceType !== null && serviceType !== "transport" && serviceType !== "storage") {
    return NextResponse.json({ error: "Select transport or storage." }, { status: 400 });
  }

  const crop = params.get("crop")?.trim() || null;
  if (crop && crop.length > 80) {
    return NextResponse.json(
      { error: "Crop name must be 80 characters or fewer." },
      { status: 400 },
    );
  }

  const quantity = parseOptionalPositiveNumber(params.get("quantity"));
  if (quantity === undefined) {
    return NextResponse.json({ error: "Enter a valid positive quantity." }, { status: 400 });
  }

  const unit = params.get("unit") || null;
  if (quantity !== null && unit !== "kg" && unit !== "quintal" && unit !== "tonne") {
    return NextResponse.json(
      { error: "Choose kg, quintal or tonne for the requested quantity." },
      { status: 400 },
    );
  }
  if (quantity === null && unit !== null) {
    return NextResponse.json(
      { error: "Enter a quantity when selecting its unit." },
      { status: 400 },
    );
  }

  const requiredDate = parseCalendarDate(params.get("date"));
  if (requiredDate === undefined) {
    return NextResponse.json({ error: "Enter a valid required date." }, { status: 400 });
  }

  const coldChain = params.get("coldChain") === "true";

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("find_nearby_service_listings", {
    p_latitude: latitude,
    p_longitude: longitude,
    p_radius_meters: Math.round(radiusKm * 1000),
    p_service_type: serviceType,
    p_crop: crop,
    p_required_quantity: quantity,
    p_unit: unit,
    p_required_date: requiredDate,
    p_requires_cold_chain: coldChain,
  });

  if (error) {
    return NextResponse.json(
      { error: "Nearby services could not be searched. Please try again." },
      { status: 503 },
    );
  }

  const candidates = (data ?? []) as unknown as NearbyServiceCandidate[];
  const recommendations = rankLogisticsCandidates(candidates, {
    crop,
    requiredQuantity: quantity,
    unit,
    requiredDate,
    requiresColdChain: coldChain,
    preferredServiceType: serviceType,
    maximumRadiusMeters: Math.round(radiusKm * 1000),
  });

  return NextResponse.json(
    {
      recommendations,
      search: {
        radiusKm,
        serviceType,
        crop,
        requiredQuantity: quantity,
        unit,
        requiredDate,
        coldChain,
        locationUsedForThisSearchOnly: true,
      },
      metadata: {
        rankingVersion: "rules-v1",
        method: "explainable-heuristic",
        distanceMeaning:
          "Straight-line distance to the provider's published service location; not road distance or travel time.",
        bookingMeaning: "A discovery result is not a booking. Provider confirmation is required.",
        verificationMeaning:
          "Provider verification reflects the evidence state stored in Farmess; it does not guarantee live availability.",
      },
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
