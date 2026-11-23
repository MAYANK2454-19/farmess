import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/farmer";
  return value;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const nextPath = safeNextPath(request.nextUrl.searchParams.get("next"));
  const supabase = await createClient();

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=callback", request.url));
  }

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return NextResponse.redirect(new URL("/login?error=callback", request.url));
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName = user?.user_metadata?.display_name;
  if (user && typeof displayName === "string" && displayName.trim()) {
    const { error: profileError } = await supabase
      .from("profiles")
      .update({ display_name: displayName.trim().slice(0, 80) })
      .eq("id", user.id);

    if (profileError) {
      return NextResponse.redirect(new URL("/login?error=profile", request.url));
    }
  }

  return NextResponse.redirect(new URL(nextPath, request.url));
}
