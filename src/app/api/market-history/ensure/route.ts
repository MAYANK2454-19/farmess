import { after, NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { prepareMarketHistory } from "@/lib/market-data/auto-import-server";
import { withApiLogging } from "@/lib/observability/logger";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// The background fetch started here keeps running after the response is sent.
export const maxDuration = 300;

function field(body: Record<string, unknown>, key: string, max: number) {
  const value = body[key];
  if (value === undefined || value === null || value === "") return { value: null };
  if (typeof value !== "string" || value.trim().length > max) return { error: true as const };
  return { value: value.trim() || null };
}

/**
 * "Make sure Farmess has this crop's prices for this area." Reports what is
 * already saved and, when something is missing, starts fetching it from
 * data.gov.in in the background. Safe to call repeatedly: the database allows
 * one fetch per crop and area at a time and spaces out retries.
 */
async function handlePOST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to look up mandi prices." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the crop and area as JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Send the crop and area as JSON." }, { status: 400 });
  }
  const fields = body as Record<string, unknown>;
  if (Object.keys(fields).some((key) => !["crop", "state", "district"].includes(key))) {
    return NextResponse.json(
      { error: "The request contains unsupported fields." },
      { status: 400 },
    );
  }
  const crop = field(fields, "crop", 100);
  const state = field(fields, "state", 120);
  const district = field(fields, "district", 120);
  if ("error" in crop || "error" in state || "error" in district || !crop.value) {
    return NextResponse.json({ error: "Choose a crop, and a state or district." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const prepared = await prepareMarketHistory(
    supabase,
    data.session?.access_token ?? null,
    { crop: crop.value, state: state.value, district: district.value },
    "search",
  );
  if (prepared.run) after(prepared.run);

  return NextResponse.json(prepared.status, { headers: { "Cache-Control": "private, no-store" } });
}

export const POST = withApiLogging("/api/market-history/ensure", "POST", handlePOST);
