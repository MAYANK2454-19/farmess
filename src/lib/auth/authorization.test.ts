import assert from "node:assert/strict";
import test from "node:test";

import {
  canAccessOwnedResource,
  canReadParticipatingSale,
  canReadRecipientNotification,
  canRevealPrivateFarmerDetails,
  hasPermission,
  isFarmessRole,
  isPrivilegedRole,
  readFarmessRoleFromAppMetadata,
} from "./authorization.ts";

test("accepts only the four documented Farmess roles", () => {
  for (const role of ["farmer", "buyer", "operator", "admin"]) {
    assert.equal(isFarmessRole(role), true);
  }

  for (const role of ["reviewer", "superuser", "", null, 3, undefined]) {
    assert.equal(isFarmessRole(role), false);
  }
});

test("reads the Farmess role from trusted app metadata only", () => {
  assert.equal(
    readFarmessRoleFromAppMetadata({ farmess_role: "farmer" }),
    "farmer",
  );
  assert.equal(
    readFarmessRoleFromAppMetadata({ farmess_role: "buyer" }),
    "buyer",
  );
  assert.equal(
    readFarmessRoleFromAppMetadata({ farmess_role: "operator" }),
    "operator",
  );
  assert.equal(
    readFarmessRoleFromAppMetadata({ farmess_role: "admin" }),
    "admin",
  );

  assert.equal(
    readFarmessRoleFromAppMetadata({
      user_metadata: { farmess_role: "admin" },
    }),
    null,
  );
  assert.equal(readFarmessRoleFromAppMetadata({ role: "admin" }), null);
  assert.equal(readFarmessRoleFromAppMetadata({ farmess_role: "owner" }), null);
  assert.equal(readFarmessRoleFromAppMetadata(null), null);
  assert.equal(readFarmessRoleFromAppMetadata([]), null);
});

test(
  "marks admin as privileged without granting it blanket application permissions",
  () => {
    assert.equal(isPrivilegedRole("admin"), true);
    assert.equal(isPrivilegedRole("farmer"), false);
    assert.equal(hasPermission("admin", "lot:update_own"), false);
    assert.equal(hasPermission("admin", "notification:read_own"), false);
    assert.equal(
      hasPermission("admin", "sale_activity:read_participating"),
      false,
    );
  },
);

test(
  "keeps farmer permissions limited to their own produce and farmer actions",
  () => {
    assert.equal(hasPermission("farmer", "lot:create"), true);
    assert.equal(hasPermission("farmer", "lot:read_own"), true);
    assert.equal(hasPermission("farmer", "lot:update_own"), true);
    assert.equal(hasPermission("farmer", "offer:respond_to_own_lot"), true);
    assert.equal(hasPermission("farmer", "notification:read_own"), true);
    assert.equal(
      hasPermission("farmer", "buyer_requirement:create_own"),
      false,
    );
    assert.equal(hasPermission("farmer", "listing:update_own"), false);
  },
);

test("keeps buyer permissions separate from farmer and provider actions", () => {
  assert.equal(hasPermission("buyer", "buyer_requirement:create_own"), true);
  assert.equal(hasPermission("buyer", "offer:create_own"), true);
  assert.equal(hasPermission("buyer", "lot:read_matched_summary"), true);
  assert.equal(hasPermission("buyer", "lot:update_own"), false);
  assert.equal(
    hasPermission("buyer", "service_request:respond_assigned"),
    false,
  );
});

test(
  "keeps operator permissions limited to listings and assigned service requests",
  () => {
    assert.equal(hasPermission("operator", "listing:create_own"), true);
    assert.equal(hasPermission("operator", "listing:update_own"), true);
    assert.equal(
      hasPermission("operator", "service_request:respond_assigned"),
      true,
    );
    assert.equal(hasPermission("operator", "lot:read_own"), false);
    assert.equal(hasPermission("operator", "offer:create_own"), false);
  },
);

test("rejects missing and mismatched record owners", () => {
  assert.equal(canAccessOwnedResource("farmer-1", "farmer-1"), true);
  assert.equal(canAccessOwnedResource("farmer-1", "farmer-2"), false);
  assert.equal(canAccessOwnedResource(null, "farmer-1"), false);
  assert.equal(canAccessOwnedResource("farmer-1", null), false);
  assert.equal(canAccessOwnedResource(" ", " "), false);
});

test("notification access is restricted to the persisted recipient", () => {
  assert.equal(canReadRecipientNotification("user-1", "user-1"), true);
  assert.equal(canReadRecipientNotification("user-1", "user-2"), false);
  assert.equal(canReadRecipientNotification("user-1", null), false);
});

test("sale activity requires an explicit participant match", () => {
  assert.equal(
    canReadParticipatingSale("buyer-1", ["farmer-1", "buyer-1"]),
    true,
  );
  assert.equal(
    canReadParticipatingSale("operator-1", ["farmer-1", "buyer-1"]),
    false,
  );
  assert.equal(canReadParticipatingSale(null, ["farmer-1"]), false);
});

test(
  "private farmer details require ownership or a consented authorised workflow",
  () => {
    const base = {
      viewerId: "buyer-1",
      viewerRole: "buyer" as const,
      farmerId: "farmer-1",
      farmerConsented: true,
      workflowAuthorized: true,
    };

    assert.equal(canRevealPrivateFarmerDetails(base), true);
    assert.equal(
      canRevealPrivateFarmerDetails({ ...base, farmerConsented: false }),
      false,
    );
    assert.equal(
      canRevealPrivateFarmerDetails({ ...base, workflowAuthorized: false }),
      false,
    );
    assert.equal(
      canRevealPrivateFarmerDetails({
        ...base,
        viewerRole: "farmer",
        viewerId: "farmer-2",
      }),
      false,
    );
    assert.equal(
      canRevealPrivateFarmerDetails({ ...base, viewerRole: "operator" }),
      true,
    );
    assert.equal(
      canRevealPrivateFarmerDetails({ ...base, viewerRole: "admin" }),
      false,
    );
    assert.equal(
      canRevealPrivateFarmerDetails({
        ...base,
        viewerId: "farmer-1",
        viewerRole: "farmer",
      }),
      true,
    );
    assert.equal(
      canRevealPrivateFarmerDetails({ ...base, farmerId: null }),
      false,
    );
  },
);
