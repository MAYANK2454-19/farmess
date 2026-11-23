import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view your notifications." }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .select("id,title,body,event_key,created_at,read_at,related_type,related_id")
    .eq("recipient_user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Unable to load your notifications." }, { status: 500 });
  }

  return NextResponse.json(
    { notifications: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in before updating notifications." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a notification ID." }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    Array.isArray(body) ||
    !("id" in body) ||
    typeof body.id !== "string" ||
    body.id.length > 64
  ) {
    return NextResponse.json({ error: "A valid notification ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", body.id)
    .eq("recipient_user_id", session.userId)
    .is("read_at", null)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "The notification could not be updated." }, { status: 500 });
  }

  return NextResponse.json({ updated: Boolean(data) });
}
