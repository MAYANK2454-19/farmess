import assert from "node:assert/strict";
import test from "node:test";

import {
  deriveAdminPortalSlug,
  deriveMarketIngestToken,
  deriveServerValue,
  isUsableServerSecret,
  safeEqual,
} from "./derive.ts";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

test("derived values are stable, distinct per purpose and do not contain the secret", () => {
  const token = deriveMarketIngestToken(SECRET);
  const slug = deriveAdminPortalSlug(SECRET);
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.match(slug, /^[0-9a-f]{24}$/);
  assert.equal(token, deriveMarketIngestToken(SECRET));
  assert.notEqual(token.slice(0, 24), slug);
  assert.ok(!token.includes(SECRET.slice(0, 16)));
});

test("a different secret gives different values", () => {
  const other = SECRET.replace("0", "f");
  assert.notEqual(deriveMarketIngestToken(SECRET), deriveMarketIngestToken(other));
  assert.notEqual(deriveAdminPortalSlug(SECRET), deriveAdminPortalSlug(other));
});

test("surrounding whitespace in the configured secret is ignored", () => {
  assert.equal(deriveServerValue(`  ${SECRET}\n`, "x"), deriveServerValue(SECRET, "x"));
});

test("missing or short secrets are rejected", () => {
  assert.equal(isUsableServerSecret(undefined), false);
  assert.equal(isUsableServerSecret("short"), false);
  assert.equal(isUsableServerSecret(SECRET), true);
  assert.throws(() => deriveMarketIngestToken("short"));
});

test("safeEqual compares whole strings", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
  assert.equal(safeEqual("", ""), true);
});
