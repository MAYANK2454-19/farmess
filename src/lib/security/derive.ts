import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Values derived from the single server secret (FARMESS_SERVER_SECRET) with
 * HMAC-SHA256. Each purpose has its own label, so knowing one derived value
 * (for example the private admin sign-in path) reveals nothing about the
 * secret or about any other derived value.
 */

export const MINIMUM_SECRET_LENGTH = 32;
const INGEST_LABEL = "farmess:market-ingest:v1";
const ADMIN_PORTAL_LABEL = "farmess:admin-portal:v1";
const ADMIN_PORTAL_SLUG_LENGTH = 24;

export function isUsableServerSecret(secret: string | null | undefined): secret is string {
  return typeof secret === "string" && secret.trim().length >= MINIMUM_SECRET_LENGTH;
}

export function deriveServerValue(secret: string, label: string): string {
  if (!isUsableServerSecret(secret)) {
    throw new Error("The server secret is missing or too short.");
  }
  return createHmac("sha256", secret.trim()).update(label).digest("hex");
}

/** Token the app server presents to the database's ingest functions. */
export function deriveMarketIngestToken(secret: string): string {
  return deriveServerValue(secret, INGEST_LABEL);
}

/** Unguessable path segment of the private admin sign-in page. */
export function deriveAdminPortalSlug(secret: string): string {
  return deriveServerValue(secret, ADMIN_PORTAL_LABEL).slice(0, ADMIN_PORTAL_SLUG_LENGTH);
}

/** Constant-time comparison, so response timing does not leak a partial match. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}
