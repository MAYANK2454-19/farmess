import { NextResponse, type NextRequest } from "next/server";
import { parseRatingRequest, toRatingSummary } from "@/features/ratings/rating";
import { getFarmessSession } from "@/lib/auth/session";
import { withApiLogging } from "@/lib/observability/logger";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Messages raised by submit_rating() that are safe and useful to show as they are. */
const KNOWN_REFUSALS = [
  "You have already rated this.",
  "You can rate only after a sale or service you took part in is completed.",
  "Choose a rating from 1 to 5 stars.",
  "Keep the comment to 300 characters or fewer.",
  "Choose a sale or a service request to rate.",
];

/** The signed-in person's own reputation and the ratings they have received. */
async function handleGET() {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to view your ratings." }, { status: 401 });
  }
  const supabase = await createClient();
  const [summary, received] = await Promise.all([
    supabase.rpc("user_rating_summaries", { p_user_ids: [session.userId] }),
    supabase
      .from("ratings")
      .select("id,stars,comment,context_type,created_at")
      .eq("ratee_id", session.userId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  if (summary.error || received.error) {
    return NextResponse.json({ error: "Your ratings could not be loaded." }, { status: 500 });
  }
  const mine = summary.data?.[0];
  return NextResponse.json(
    {
      summary: toRatingSummary(mine?.average, mine?.rating_count),
      received: received.data ?? [],
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Rate the other side of a completed sale or service request (once). */
async function handlePOST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to rate." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the rating as JSON." }, { status: 400 });
  }
  const parsed = parseRatingRequest(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_rating", {
    p_context_type: parsed.value.contextType,
    p_context_id: parsed.value.contextId,
    p_stars: parsed.value.stars,
    p_comment: parsed.value.comment,
  });
  if (error || !data?.[0]) {
    const refusal = KNOWN_REFUSALS.find((message) => error?.message === message);
    return NextResponse.json(
      { error: refusal ?? "Your rating could not be saved. Please try again." },
      { status: refusal ? 409 : 500 },
    );
  }
  return NextResponse.json(
    { rating: { id: data[0].id, stars: data[0].stars, created_at: data[0].created_at } },
    { status: 201, headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("/api/ratings", "GET", handleGET);
export const POST = withApiLogging("/api/ratings", "POST", handlePOST);
