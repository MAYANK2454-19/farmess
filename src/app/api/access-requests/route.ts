import { NextResponse, type NextRequest } from "next/server";
import { parseAccessRequest } from "@/features/access/access-request";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const REQUEST_SELECT =
  "id,requested_role,requester_name,organisation_name,reason,status,review_note,created_at,reviewed_at";

/** The signed-in user's own buyer/operator access requests. */
export async function GET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view access requests." }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_access_requests")
    .select(REQUEST_SELECT)
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Access requests could not be loaded." }, { status: 500 });
  }

  return NextResponse.json(
    { requests: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** A farmer account asks for buyer or operator access; an admin reviews it. */
export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in before requesting access." }, { status: 401 });
  }
  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "Only a new account can request buyer or operator access." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the access request as JSON." }, { status: 400 });
  }

  const parsed = parseAccessRequest(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_access_requests")
    .insert(parsed.data)
    .select(REQUEST_SELECT)
    .single();

  if (error) {
    // 23505: unique index allows only one pending request per account.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "You already have a request waiting for review." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Your access request could not be submitted. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    { request: data },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}
