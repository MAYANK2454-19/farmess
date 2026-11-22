import assert from "node:assert/strict";
import test from "node:test";

import {
  authorizeFarmessRequest,
  type FarmessActor,
  type ResourceAuthorizationRule,
} from "./route-authorization.ts";

const farmer: FarmessActor = { userId: "farmer-1", role: "farmer" };
const buyer: FarmessActor = { userId: "buyer-1", role: "buyer" };
const operator: FarmessActor = { userId: "operator-1", role: "operator" };
const admin: FarmessActor = { userId: "admin-1", role: "admin" };

test("requires a signed-in actor and returns an HTTP 401 decision", () => {
  assert.deepEqual(authorizeFarmessRequest(null, "lot:read_own"), {
    allowed: false,
    statusCode: 401,
    reason: "unauthenticated",
  });
  assert.deepEqual(authorizeFarmessRequest(undefined, "lot:read_own"), {
    allowed: false,
    statusCode: 401,
    reason: "unauthenticated",
  });
});

test("rejects malformed actor identities and roles", () => {
  for (const actor of [
    {},
    { userId: "", role: "farmer" },
    { userId: "user-1", role: "superuser" },
    { userId: "user-1", role: null },
  ]) {
    assert.deepEqual(authorizeFarmessRequest(actor as FarmessActor, "lot:read_own"), {
      allowed: false,
      statusCode: 401,
      reason: "invalid_actor",
    });
  }
});

test("allows a role permission without a record rule", () => {
  assert.deepEqual(authorizeFarmessRequest(farmer, "lot:create"), {
    allowed: true,
    actor: farmer,
  });
});

test("denies a role that does not hold the requested permission", () => {
  assert.deepEqual(authorizeFarmessRequest(buyer, "lot:update_own"), {
    allowed: false,
    statusCode: 403,
    reason: "permission_denied",
  });
});

test("requires both the role permission and matching record ownership", () => {
  assert.deepEqual(
    authorizeFarmessRequest(farmer, "lot:update_own", {
      kind: "owned",
      ownerId: "farmer-1",
    }),
    { allowed: true, actor: farmer },
  );
  assert.deepEqual(
    authorizeFarmessRequest(farmer, "lot:update_own", {
      kind: "owned",
      ownerId: "farmer-2",
    }),
    { allowed: false, statusCode: 403, reason: "not_owner" },
  );
});

test("requires the current actor to be the assigned provider", () => {
  assert.deepEqual(
    authorizeFarmessRequest(operator, "service_request:respond_assigned", {
      kind: "assigned",
      assigneeId: "operator-1",
    }),
    { allowed: true, actor: operator },
  );
  assert.deepEqual(
    authorizeFarmessRequest(operator, "service_request:respond_assigned", {
      kind: "assigned",
      assigneeId: "operator-2",
    }),
    { allowed: false, statusCode: 403, reason: "not_assigned" },
  );
});

test("requires explicit participation to read a sale activity record", () => {
  const rule: ResourceAuthorizationRule = {
    kind: "participant",
    participantUserIds: ["farmer-1", "buyer-1"],
  };

  assert.deepEqual(authorizeFarmessRequest(buyer, "sale_activity:read_participating", rule), {
    allowed: true,
    actor: buyer,
  });
  assert.deepEqual(authorizeFarmessRequest(operator, "sale_activity:read_participating", rule), {
    allowed: false,
    statusCode: 403,
    reason: "permission_denied",
  });
  assert.deepEqual(
    authorizeFarmessRequest(farmer, "sale_activity:read_participating", {
      kind: "participant",
      participantUserIds: ["farmer-2"],
    }),
    { allowed: false, statusCode: 403, reason: "not_participant" },
  );
});

test("requires farmer consent and an authorised workflow for buyer detail access", () => {
  const permitted: ResourceAuthorizationRule = {
    kind: "farmer_details",
    farmerId: "farmer-2",
    farmerConsented: true,
    workflowAuthorized: true,
  };

  assert.deepEqual(authorizeFarmessRequest(buyer, "lot:read_matched_summary", permitted), {
    allowed: true,
    actor: buyer,
  });
  assert.deepEqual(
    authorizeFarmessRequest(buyer, "lot:read_matched_summary", {
      ...permitted,
      farmerConsented: false,
    }),
    { allowed: false, statusCode: 403, reason: "farmer_details_private" },
  );
  assert.deepEqual(
    authorizeFarmessRequest(buyer, "lot:read_matched_summary", {
      ...permitted,
      workflowAuthorized: false,
    }),
    { allowed: false, statusCode: 403, reason: "farmer_details_private" },
  );
});

test("allows farmers to access their own private details without cross-user disclosure", () => {
  assert.deepEqual(
    authorizeFarmessRequest(farmer, "lot:read_own", {
      kind: "farmer_details",
      farmerId: "farmer-1",
      farmerConsented: false,
      workflowAuthorized: false,
    }),
    { allowed: true, actor: farmer },
  );
  assert.deepEqual(
    authorizeFarmessRequest(farmer, "lot:read_own", {
      kind: "farmer_details",
      farmerId: "farmer-2",
      farmerConsented: true,
      workflowAuthorized: true,
    }),
    { allowed: false, statusCode: 403, reason: "farmer_details_private" },
  );
});

test("does not grant admin a wildcard around the role matrix", () => {
  assert.deepEqual(authorizeFarmessRequest(admin, "lot:update_own"), {
    allowed: false,
    statusCode: 403,
    reason: "permission_denied",
  });
});

test("denies malformed or unknown record relationship rules", () => {
  for (const rule of [
    {} as ResourceAuthorizationRule,
    { kind: "owned", ownerId: "" } as ResourceAuthorizationRule,
    { kind: "assigned", assigneeId: null } as unknown as ResourceAuthorizationRule,
    {
      kind: "participant",
      participantUserIds: ["user-1", 3],
    } as unknown as ResourceAuthorizationRule,
    { kind: "superuser" } as unknown as ResourceAuthorizationRule,
  ]) {
    assert.deepEqual(authorizeFarmessRequest(farmer, "lot:read_own", rule), {
      allowed: false,
      statusCode: 403,
      reason: "invalid_resource_rule",
    });
  }
});

test("never accepts an invalid permission simply because the resource rule matches", () => {
  assert.deepEqual(
    authorizeFarmessRequest(farmer, "admin:all" as never, {
      kind: "owned",
      ownerId: "farmer-1",
    }),
    { allowed: false, statusCode: 403, reason: "permission_denied" },
  );
});
