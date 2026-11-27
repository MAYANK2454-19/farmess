import assert from "node:assert/strict";
import test from "node:test";

import {
  ADMIN_SESSION_POLICY,
  DEFAULT_SESSION_POLICY,
  describeUserAgent,
  judgeSession,
  pathKind,
  policyForRole,
  REFRESH_AFTER_SECONDS,
  signedInAtSeconds,
  signedOutDestination,
} from "./session-policy.ts";

const NOW = 1_800_000_000;
const farmer = (issuedAgo: number, signedInAgo: number) => ({
  iat: NOW - issuedAgo,
  amr: [{ method: "password", timestamp: NOW - signedInAgo }],
  app_metadata: { farmess_role: "farmer" },
});
const admin = (issuedAgo: number, signedInAgo: number) => ({
  ...farmer(issuedAgo, signedInAgo),
  app_metadata: { farmess_role: "admin" },
});

test("admins get the shorter limits", () => {
  assert.equal(policyForRole("admin"), ADMIN_SESSION_POLICY);
  assert.equal(policyForRole("farmer"), DEFAULT_SESSION_POLICY);
  assert.equal(policyForRole(undefined), DEFAULT_SESSION_POLICY);
  assert.ok(ADMIN_SESSION_POLICY.idleSeconds < DEFAULT_SESSION_POLICY.idleSeconds);
  assert.ok(ADMIN_SESSION_POLICY.absoluteSeconds < DEFAULT_SESSION_POLICY.absoluteSeconds);
});

test("a fresh token continues; an older one is renewed on activity", () => {
  assert.deepEqual(judgeSession(farmer(60, 60), NOW), { action: "continue" });
  assert.deepEqual(judgeSession(farmer(REFRESH_AFTER_SECONDS + 1, 600), NOW), {
    action: "refresh",
  });
});

test("background checks never renew a token", () => {
  assert.deepEqual(judgeSession(farmer(600, 600), NOW, { background: true }), {
    action: "continue",
  });
});

test("an old token means nothing happened in between: signed out as idle", () => {
  const idle = DEFAULT_SESSION_POLICY.idleSeconds + REFRESH_AFTER_SECONDS;
  assert.deepEqual(judgeSession(farmer(idle - 1, 3000), NOW), { action: "refresh" });
  assert.deepEqual(judgeSession(farmer(idle + 1, 3000), NOW), {
    action: "sign_out",
    reason: "idle",
  });
  // The same gap already ends an admin session.
  assert.deepEqual(judgeSession(admin(21 * 60, 3000), NOW), { action: "sign_out", reason: "idle" });
  assert.deepEqual(judgeSession(farmer(21 * 60, 3000), NOW), { action: "refresh" });
});

test("a background check on an old token is still signed out", () => {
  assert.deepEqual(judgeSession(farmer(40 * 60, 3000), NOW, { background: true }), {
    action: "sign_out",
    reason: "idle",
  });
});

test("an expired token that had to be renewed just to be read counts as idle", () => {
  assert.deepEqual(judgeSession(farmer(5, 5000), NOW, { renewedBecauseExpired: true }), {
    action: "sign_out",
    reason: "idle",
  });
});

test("the absolute limit ends even an active session", () => {
  const justOver = DEFAULT_SESSION_POLICY.absoluteSeconds + 1;
  assert.deepEqual(judgeSession(farmer(30, justOver), NOW), {
    action: "sign_out",
    reason: "expired",
  });
  assert.deepEqual(judgeSession(farmer(30, justOver - 10), NOW), { action: "continue" });
  assert.deepEqual(judgeSession(admin(30, ADMIN_SESSION_POLICY.absoluteSeconds + 1), NOW), {
    action: "sign_out",
    reason: "expired",
  });
});

test("the sign-in time is the earliest entry and survives token renewals", () => {
  assert.equal(
    signedInAtSeconds({
      iat: NOW,
      amr: [
        { method: "token_refresh", timestamp: NOW - 10 },
        { method: "password", timestamp: NOW - 5000 },
      ],
    }),
    NOW - 5000,
  );
  assert.equal(signedInAtSeconds({ iat: NOW - 7 }), NOW - 7);
  assert.equal(signedInAtSeconds({}), null);
});

test("claims without usable times are refused", () => {
  assert.deepEqual(judgeSession({ app_metadata: { farmess_role: "farmer" } }, NOW), {
    action: "sign_out",
    reason: "expired",
  });
});

test("paths are classified for what happens after a session ends", () => {
  assert.equal(pathKind("/api/profile"), "api");
  assert.equal(pathKind("/farmer"), "protected");
  assert.equal(pathKind("/farmer/markets"), "protected");
  assert.equal(pathKind("/admin/market-data"), "protected");
  assert.equal(pathKind("/profile"), "protected");
  assert.equal(pathKind("/"), "public");
  assert.equal(pathKind("/login"), "public");
  assert.equal(pathKind("/farmers-guide"), "public");
});

test("admins are sent home without a hint; others to sign-in with the reason", () => {
  assert.equal(signedOutDestination("admin", "idle"), "/");
  assert.equal(signedOutDestination("farmer", "idle"), "/login?reason=idle");
  assert.equal(signedOutDestination(null, "expired"), "/login?reason=expired");
});

test("devices are described in plain words", () => {
  assert.equal(
    describeUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    ),
    "Chrome on Windows",
  );
  assert.equal(
    describeUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0",
    ),
    "Edge on Windows",
  );
  assert.equal(
    describeUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    ),
    "Safari on iPhone",
  );
  assert.equal(
    describeUserAgent(
      "Mozilla/5.0 (Linux; Android 14; SM-A155F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
    ),
    "Chrome on Android",
  );
  assert.equal(
    describeUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Gecko/20100101 Firefox/140.0"),
    "Firefox on Linux",
  );
  assert.equal(describeUserAgent("node"), "Unknown device");
  assert.equal(describeUserAgent(null), "Unknown device");
});
