import { withApiLogging } from "@/lib/observability/logger";
import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

async function handlePATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session || session.role !== "buyer") {
    return NextResponse.json(
      { error: "Sign in with a buyer account to withdraw an offer." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send an offer ID." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("id" in body) ||
    typeof body.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.id) ||
    Object.keys(body).some((key) => key !== "id")
  ) {
    return NextResponse.json({ error: "Choose a valid pending offer." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("offers")
    .update({ status: "withdrawn" })
    .eq("id", body.id)
    .eq("buyer_id", session.userId)
    .eq("status", "pending")
    .select("id,status")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: "This offer is no longer pending or does not belong to your account." },
      { status: 409 },
    );
  }

  return NextResponse.json({ offer: data });
}

export const PATCH = withApiLogging("/api/buyer-offers", "PATCH", handlePATCH);
