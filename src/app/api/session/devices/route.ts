import { NextResponse, type NextRequest } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { describeUserAgent } from "@/lib/auth/session-policy";
import { withApiLogging } from "@/lib/observability/logger";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Devices (browsers) where the signed-in account currently has a session. */
async function handleGET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view your devices." }, { status: 401 });
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_sessions");
  if (error) {
    return NextResponse.json({ error: "Your devices could not be loaded." }, { status: 500 });
  }
  return NextResponse.json(
    {
      devices: (data ?? []).map((device) => ({
        id: device.id,
        device: describeUserAgent(device.user_agent),
        signedInAt: device.created_at,
        lastActiveAt: device.last_active_at,
        current: device.is_current,
      })),
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Sign one other device out ({ id }), or every other device ({ others: true }). */
async function handleDELETE(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to manage your devices." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Choose a device to sign out." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Choose a device to sign out." }, { status: 400 });
  }
  const fields = body as { id?: unknown; others?: unknown };
  if (Object.keys(fields).some((key) => key !== "id" && key !== "others")) {
    return NextResponse.json(
      { error: "The request contains unsupported fields." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  if (fields.others === true) {
    const { error } = await supabase.auth.signOut({ scope: "others" });
    if (error) {
      return NextResponse.json(
        { error: "The other devices could not be signed out. Please try again." },
        { status: 500 },
      );
    }
    return NextResponse.json({ signedOut: "others" });
  }

  if (typeof fields.id !== "string" || !UUID.test(fields.id)) {
    return NextResponse.json({ error: "Choose a device to sign out." }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("revoke_my_session", { p_session_id: fields.id });
  if (error) {
    return NextResponse.json(
      { error: "That device could not be signed out. Please try again." },
      { status: 500 },
    );
  }
  if (data !== true) {
    return NextResponse.json({ error: "That device is no longer signed in." }, { status: 404 });
  }
  return NextResponse.json({ signedOut: fields.id });
}

export const GET = withApiLogging("/api/session/devices", "GET", handleGET);
export const DELETE = withApiLogging("/api/session/devices", "DELETE", handleDELETE);
