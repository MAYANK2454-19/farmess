import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  ACCOUNT_NAVIGATION,
  APP_ROUTE_FILES,
  FARMER_NAVIGATION,
  getWorkspacePageLabel,
  isActiveRoute,
} from "./routes.ts";

test("farmer overview is only active on its exact route", () => {
  assert.equal(isActiveRoute("/farmer", "/farmer"), true);
  assert.equal(isActiveRoute("/farmer/produce", "/farmer"), false);
  assert.equal(isActiveRoute("/farmer/produce/new", "/farmer"), false);
});

test("parent navigation entries remain active for their nested screens", () => {
  assert.equal(isActiveRoute("/farmer/produce/new", "/farmer/produce"), true);
  assert.equal(isActiveRoute("/farmer/markets/history", "/farmer/markets"), true);
  assert.equal(isActiveRoute("/farmer/offers", "/farmer/offers"), true);
});

test("account routes receive their own active state and page labels", () => {
  assert.equal(isActiveRoute("/notifications", "/notifications"), true);
  assert.equal(isActiveRoute("/profile/security", "/profile"), true);
  assert.equal(getWorkspacePageLabel("/profile", "farmer"), "Profile & privacy");
  assert.equal(getWorkspacePageLabel("/notifications", "farmer"), "Notifications");
  assert.equal(getWorkspacePageLabel("/farmer/produce/new", "farmer"), "My Produce");
});

test("primary and account navigation destinations have matching route files", () => {
  const navigationHrefs = new Set([
    ...FARMER_NAVIGATION.map((item) => item.href),
    ...ACCOUNT_NAVIGATION.map((item) => item.href),
  ]);
  const routeHrefs = new Set(APP_ROUTE_FILES.map((route) => route.href));

  for (const href of navigationHrefs) {
    assert.ok(routeHrefs.has(href), "Navigation destination " + href + " has no route entry");
  }

  for (const route of APP_ROUTE_FILES) {
    assert.ok(
      existsSync(resolve(process.cwd(), route.file)),
      route.href + " is missing " + route.file,
    );
  }
});

test("create-lot navigation stays separate from the My Produce collection", () => {
  assert.equal(isActiveRoute("/farmer/produce/new", "/farmer/produce"), true);
  assert.equal(
    APP_ROUTE_FILES.find((route) => route.href === "/farmer/produce")?.file,
    "src/app/(workspace)/farmer/produce/page.tsx",
  );
  assert.equal(
    APP_ROUTE_FILES.find((route) => route.href === "/farmer/produce/new")?.file,
    "src/app/(workspace)/farmer/produce/new/page.tsx",
  );
});
