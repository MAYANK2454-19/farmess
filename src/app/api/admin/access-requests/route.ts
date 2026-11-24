import { NextResponse, type NextRequest } from "next/server";
import { parseAccessReview } from "@/features/access/access-request";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const REQUEST_SELECT =
  "id,requested_role,requester_name,organisation_name,reason,status,review_note,created_at,reviewed_at";

async function requireAdmin() {
  const session = await getFarmessSession();
  if (!session) {
    return {
      error: NextResponse.json({ error: "Sign in with an admin account." }, { status: 401 }),
    };
  }
  if (session.role !== "admin") {
    return {
      error: NextResponse.json(
        { error: "Only an authorised Farmess admin can review access requests." },
        { status: 403 },
      ),
    };
  }
  return { session };
}

/** All access requests, newest first. Admin only (also enforced by RLS). */
export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("role_access_requests")
    .select(REQUEST_SELECT)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: "Access requests could not be loaded." }, { status: 500 });
  }

  return NextResponse.json(
    { requests: data ?? [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

/** Approve or reject a request through the audited admin-only database function. */
export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const auth = await requireAdmin();
  if (auth.error) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send the review decision as JSON." }, { status: 400 });
  }

  const review = parseAccessReview(body);
  if (!review.ok) {
    return NextResponse.json({ error: review.error }, { status: 400 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_role_access_request", {
    p_request_id: review.data.id,
    p_decision: review.data.decision,
    p_review_note: review.data.review_note,
  });

  if (error || !data) {
    return NextResponse.json(
      { error: "The decision could not be saved. Refresh and check whether it is still pending." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    {
      review: data,
      message:
        review.data.decision === "approved"
          ? "Access approved. The user must sign out and sign in again to use the new workspace."
          : "Request rejected.",
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
