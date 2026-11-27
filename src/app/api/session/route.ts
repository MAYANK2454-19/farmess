import { NextResponse } from "next/server";
import { policyForRole, roleFromClaims, signedInAtSeconds } from "@/lib/auth/session-policy";
import { withApiLogging } from "@/lib/observability/logger";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * The state of the current session: who is signed in, when they signed in and
 * the limits that apply. The browser uses it to warn before an idle sign-out;
 * the limits themselves are enforced on the server (src/proxy.ts).
 */
async function handleGET() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) {
    return NextResponse.json(
      { signedIn: false, code: "session_expired", error: "Sign in to continue." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const role = roleFromClaims(claims);
  const policy = policyForRole(role);
  const signedInAt = signedInAtSeconds(claims);
  return NextResponse.json(
    {
      signedIn: true,
      role,
      now: Math.floor(Date.now() / 1000),
      signedInAt,
      idleSeconds: policy.idleSeconds,
      absoluteSeconds: policy.absoluteSeconds,
      endsAt: signedInAt === null ? null : signedInAt + policy.absoluteSeconds,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withApiLogging("/api/session", "GET", handleGET);
