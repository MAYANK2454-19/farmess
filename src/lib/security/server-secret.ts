import "server-only";

import {
  deriveAdminPortalSlug,
  deriveMarketIngestToken,
  isUsableServerSecret,
  safeEqual,
} from "./derive";

/*
 * FARMESS_SERVER_SECRET lives only in the server environment (Vercel and
 * .env.local). Nothing here is ever sent to the browser, and the secret itself
 * is never logged or returned: callers only get values derived from it.
 */

function serverSecret(): string | null {
  const value = process.env.FARMESS_SERVER_SECRET;
  return isUsableServerSecret(value) ? value : null;
}

/** Token for the database ingest functions, or null when the secret is not configured. */
export function marketIngestToken(): string | null {
  const secret = serverSecret();
  return secret ? deriveMarketIngestToken(secret) : null;
}

/** Path segment of the private admin sign-in page, or null when not configured. */
export function adminPortalSlug(): string | null {
  const secret = serverSecret();
  return secret ? deriveAdminPortalSlug(secret) : null;
}

/** True only for the exact private admin sign-in key. */
export function isAdminPortalKey(candidate: string | null | undefined): boolean {
  const slug = adminPortalSlug();
  return Boolean(slug && typeof candidate === "string" && safeEqual(candidate, slug));
}
