import { NextResponse } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view sale activity." }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sale_activity")
    .select("id,event_key,summary,created_at,sale_id")
    .contains("participant_user_ids", [session.userId])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Unable to load sale activity." }, { status: 500 });
  }

  return NextResponse.json(
    { activity: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
