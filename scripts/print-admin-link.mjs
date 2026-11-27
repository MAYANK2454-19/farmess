// Prints the private admin sign-in address for this deployment.
//
//   node scripts/print-admin-link.mjs                      (uses https://farmess.vercel.app)
//   node scripts/print-admin-link.mjs http://localhost:3000
//
// The address is derived from FARMESS_SERVER_SECRET in .env.local (the same
// value that is set in Vercel), so it changes only if that secret is changed.
// Keep it private: share it only with other admins, never in the repository,
// in screenshots or in chat groups. The secret itself is never printed.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const base = (process.argv[2] ?? "https://farmess.vercel.app").replace(/\/+$/, "");
let env = "";
try {
  env = readFileSync(".env.local", "utf8").replace(/^\uFEFF/, "");
} catch {
  console.error("No .env.local file here. Run this from the farmess folder.");
  process.exit(1);
}
const match = env.match(/^FARMESS_SERVER_SECRET\s*=\s*"?([^"\r\n]*)"?/m);
const secret = match?.[1]?.trim() ?? "";
if (secret.length < 32) {
  console.error(
    "FARMESS_SERVER_SECRET is missing from .env.local (or shorter than 32 characters).",
  );
  process.exit(1);
}
const slug = createHmac("sha256", secret)
  .update("farmess:admin-portal:v1")
  .digest("hex")
  .slice(0, 24);
console.log(`${base}/access/${slug}`);
