import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { SESSION_COOKIE_OPTIONS } from "./cookie-options";
import { getSupabasePublicConfig } from "./env";

export function createClient() {
  const { url, publishableKey } = getSupabasePublicConfig();
  return createBrowserClient<Database>(url, publishableKey, {
    // The browser must not renew the sign-in by itself on a timer: an open but
    // unattended tab would then never look idle. The server renews it when the
    // person actually does something (see src/proxy.ts).
    auth: { autoRefreshToken: false },
    cookieOptions: SESSION_COOKIE_OPTIONS,
  });
}
