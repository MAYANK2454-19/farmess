import type { NextConfig } from "next";

/** Sent with every response. */
const SECURITY_HEADERS = [
  // Farmess is never shown inside another site's frame (clickjacking).
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  // Browsers must not guess a different content type than the one sent.
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Other sites learn only that a visitor came from Farmess, not which page.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Location is used only by Farmess itself; camera and microphone never.
  { key: "Permissions-Policy", value: "geolocation=(self), camera=(), microphone=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

/** Pages that must never be indexed, cached by intermediaries, or leak their address. */
const PRIVATE_PAGE_HEADERS = [
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
  { key: "Cache-Control", value: "private, no-store" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      { source: "/access/:path*", headers: PRIVATE_PAGE_HEADERS },
      { source: "/admin/:path*", headers: PRIVATE_PAGE_HEADERS },
      // Language dictionaries are requested with a fingerprint of their content
      // (src/i18n/versions.json), so browsers can safely keep them for a week.
      {
        source: "/i18n/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=604800" }],
      },
    ];
  },
};

export default nextConfig;
