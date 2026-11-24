import { NextRequest, NextResponse } from "next/server";
import { parseProviderVerificationReview } from "@/features/admin/provider-verification";
import { getFarmessSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "This request could not be verified." }, { status: 403 });
  }

  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in with a data-steward account." }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json(
      { error: "Only an authorised Farmess admin can review provider listings." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Send a listing ID, decision and review note." }, { status: 400 });
  }

  const review = parseProviderVerificationReview(body);
  if (!review) {
    return NextResponse.json(
      {
        error:
          "Choose a valid listing and verification state, with a review note between 20 and 500 characters.",
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("review_service_listing_verification", {
    p_listing_id: review.id,
    p_verification_state: review.verificationState,
    p_review_note: review.reviewNote,
  });

  if (error || !data) {
    return NextResponse.json(
      { error: "The verification decision could not be saved. Refresh and check the listing state." },
      { status: 409 },
    );
  }

  return NextResponse.json(
    { review: data, message: "Provider verification decision and audit record saved." },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
