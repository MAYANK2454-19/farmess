import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  BACKGROUND_HEADER,
  judgeSession,
  pathKind,
  roleFromClaims,
  signedOutDestination,
  type SessionEndReason,
} from "@/lib/auth/session-policy";
import { SESSION_COOKIE_OPTIONS } from "@/lib/supabase/cookie-options";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Runs before every page and API request.
 *
 * For a signed-in request it enforces the session rules (session-policy.ts):
 * the sign-in token is verified, an idle or over-age session is signed out,
 * and an active one has its token renewed every few minutes. Pages and APIs
 * still check the role themselves; this only decides whether the session is
 * still alive.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });
  let cookieWrites = 0;
  // Renewals made here are recorded against the person's own browser, so the
  // "signed-in devices" list stays meaningful.
  const userAgent = request.headers.get("user-agent");

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookieOptions: SESSION_COOKIE_OPTIONS,
    ...(userAgent ? { global: { headers: { "User-Agent": userAgent.slice(0, 300) } } } : {}),
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookieWrites += 1;
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });

        response = NextResponse.next({ request });

        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // Verifies the token's signature. If the token had already run out, the
  // library renews it first, which shows up as a cookie write.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims) return response;

  const verdict = judgeSession(claims, Math.floor(Date.now() / 1000), {
    renewedBecauseExpired: cookieWrites > 0,
    background: request.headers.get(BACKGROUND_HEADER) === "1",
  });

  let ended: SessionEndReason | null = verdict.action === "sign_out" ? verdict.reason : null;
  if (verdict.action === "refresh") {
    const { error } = await supabase.auth.refreshSession();
    // A sign-in that can no longer be renewed was ended elsewhere (signed out
    // from another device, or revoked).
    if (error) ended = "expired";
  }
  if (!ended) return response;

  await supabase.auth.signOut({ scope: "local" });

  const kind = pathKind(request.nextUrl.pathname);
  const finished =
    kind === "api"
      ? NextResponse.json(
          {
            error: "Your session has ended. Sign in again to continue.",
            code: "session_expired",
            reason: ended,
          },
          { status: 401, headers: { "Cache-Control": "private, no-store" } },
        )
      : kind === "protected"
        ? NextResponse.redirect(
            new URL(signedOutDestination(roleFromClaims(claims), ended), request.url),
          )
        : response;
  // Carry the cleared sign-in cookies onto whichever response is sent.
  if (finished !== response) {
    for (const cookie of response.cookies.getAll()) finished.cookies.set(cookie);
  }
  return finished;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
