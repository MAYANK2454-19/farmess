import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/supabase/database.types";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

type ProfileUpdate = Database["public"]["Tables"]["profiles"]["Update"];

const PROFILE_FIELDS = [
  "display_name",
  "phone_number",
  "market_area",
  "approximate_location_sharing",
  "exact_location_disclosure",
  "buyer_contact_disclosure",
  "provider_contact_disclosure",
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function GET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view your profile." }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "display_name,phone_number,market_area,approximate_location_sharing,exact_location_disclosure,buyer_contact_disclosure,provider_contact_disclosure",
    )
    .eq("id", session.userId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Unable to load your profile." }, { status: 500 });
  }

  return NextResponse.json(
    { profile: data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in before updating your profile." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send profile changes as JSON." }, { status: 400 });
  }

  if (!isRecord(body)) {
    return NextResponse.json({ error: "Invalid profile update." }, { status: 400 });
  }

  const keys = Object.keys(body);
  if (
    keys.length === 0 ||
    keys.some((key) => !PROFILE_FIELDS.includes(key as (typeof PROFILE_FIELDS)[number]))
  ) {
    return NextResponse.json(
      { error: "The update contains unsupported profile fields." },
      { status: 400 },
    );
  }

  const update: ProfileUpdate = {};

  if ("display_name" in body) {
    if (
      typeof body.display_name !== "string" ||
      !body.display_name.trim() ||
      body.display_name.trim().length > 80
    ) {
      return NextResponse.json(
        { error: "Enter a name using 1 to 80 characters." },
        { status: 400 },
      );
    }
    update.display_name = body.display_name.trim();
  }

  if ("phone_number" in body) {
    if (body.phone_number !== null && typeof body.phone_number !== "string") {
      return NextResponse.json({ error: "Enter a valid phone number." }, { status: 400 });
    }
    const phone = typeof body.phone_number === "string" ? body.phone_number.trim() : "";
    if (phone && !/^[+0-9()\s-]{7,24}$/.test(phone)) {
      return NextResponse.json(
        { error: "Enter a phone number using digits and common separators." },
        { status: 400 },
      );
    }
    update.phone_number = phone || null;
  }

  if ("market_area" in body) {
    if (body.market_area !== null && typeof body.market_area !== "string") {
      return NextResponse.json({ error: "Enter a valid market area." }, { status: 400 });
    }
    const area = typeof body.market_area === "string" ? body.market_area.trim() : "";
    if (area.length > 120) {
      return NextResponse.json(
        { error: "Use 120 characters or fewer for the market area." },
        { status: 400 },
      );
    }
    update.market_area = area || null;
  }

  for (const field of [
    "approximate_location_sharing",
    "exact_location_disclosure",
    "buyer_contact_disclosure",
    "provider_contact_disclosure",
  ] as const) {
    if (field in body) {
      if (typeof body[field] !== "boolean") {
        return NextResponse.json(
          { error: "Privacy preferences must be true or false." },
          { status: 400 },
        );
      }
      update[field] = body[field];
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .update(update)
    .eq("id", session.userId)
    .select(
      "display_name,phone_number,market_area,approximate_location_sharing,exact_location_disclosure,buyer_contact_disclosure,provider_contact_disclosure",
    )
    .single();

  if (error) {
    return NextResponse.json(
      { error: "Your profile could not be saved. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { profile: data },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
