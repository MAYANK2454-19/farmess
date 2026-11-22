export const FARMESS_ROLES = ["farmer", "buyer", "operator", "admin"] as const;

export type FarmessRole = (typeof FARMESS_ROLES)[number];

export const FARMESS_PERMISSIONS = [
  "lot:create",
  "lot:read_own",
  "lot:update_own",
  "offer:respond_to_own_lot",
  "buyer_requirement:create_own",
  "buyer_requirement:update_own",
  "lot:read_matched_summary",
  "offer:create_own",
  "offer:manage_own",
  "listing:create_own",
  "listing:update_own",
  "service_request:respond_assigned",
  "notification:read_own",
  "notification:mark_own_read",
  "sale_activity:read_participating",
  "sale_activity:read_assigned",
] as const;

export type FarmessPermission = (typeof FARMESS_PERMISSIONS)[number];

type PermissionMap = Readonly<Record<FarmessRole, readonly FarmessPermission[]>>;

// Keep this matrix narrow. Database RLS and record-level checks remain authoritative.
const ROLE_PERMISSIONS: PermissionMap = {
  farmer: [
    "lot:create",
    "lot:read_own",
    "lot:update_own",
    "offer:respond_to_own_lot",
    "notification:read_own",
    "notification:mark_own_read",
    "sale_activity:read_participating",
  ],
  buyer: [
    "buyer_requirement:create_own",
    "buyer_requirement:update_own",
    "lot:read_matched_summary",
    "offer:create_own",
    "offer:manage_own",
    "notification:read_own",
    "notification:mark_own_read",
    "sale_activity:read_participating",
  ],
  operator: [
    "listing:create_own",
    "listing:update_own",
    "service_request:respond_assigned",
    "notification:read_own",
    "notification:mark_own_read",
    "sale_activity:read_assigned",
  ],
  // Admin/reviewer access is case-authorised and audited, never a blanket wildcard.
  admin: [],
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFarmessRole(value: unknown): value is FarmessRole {
  return typeof value === "string" && FARMESS_ROLES.includes(value as FarmessRole);
}

export function isPrivilegedRole(value: unknown): value is "admin" {
  return value === "admin";
}

/**
 * Read the application role only from app_metadata on a verified server-side
 * Supabase user/claims object. Never pass user_metadata or browser-supplied data.
 */
export function readFarmessRoleFromAppMetadata(appMetadata: unknown): FarmessRole | null {
  if (!isRecord(appMetadata)) return null;

  const role = appMetadata.farmess_role;
  return isFarmessRole(role) ? role : null;
}

export function hasPermission(
  role: FarmessRole | null | undefined,
  permission: FarmessPermission,
): boolean {
  return isFarmessRole(role) && ROLE_PERMISSIONS[role].includes(permission);
}

function hasUsableId(value: string | null | undefined): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/** Defence-in-depth check for records whose owner column is enforced by RLS. */
export function canAccessOwnedResource(
  actorId: string | null | undefined,
  ownerId: string | null | undefined,
): boolean {
  return hasUsableId(actorId) && hasUsableId(ownerId) && actorId === ownerId;
}

/** Notification rows are visible only to their persisted recipient. */
export function canReadRecipientNotification(
  actorId: string | null | undefined,
  recipientUserId: string | null | undefined,
): boolean {
  return canAccessOwnedResource(actorId, recipientUserId);
}

/** Sale activity is visible only to a participant explicitly listed on the event. */
export function canReadParticipatingSale(
  actorId: string | null | undefined,
  participantUserIds: readonly string[],
): boolean {
  return hasUsableId(actorId) && participantUserIds.some((id) => id === actorId);
}

export type PrivateFarmerDetailsAccess = {
  viewerId: string | null | undefined;
  viewerRole: FarmessRole | null | undefined;
  farmerId: string | null | undefined;
  farmerConsented: boolean;
  workflowAuthorized: boolean;
};

/**
 * Exact farmer contact/location stays private unless the farmer is viewing
 * their own details or a consented, role-appropriate workflow requires disclosure.
 */
export function canRevealPrivateFarmerDetails(input: PrivateFarmerDetailsAccess): boolean {
  if (!hasUsableId(input.viewerId) || !hasUsableId(input.farmerId)) return false;
  if (input.viewerId === input.farmerId) return true;

  const permittedViewer = input.viewerRole === "buyer" || input.viewerRole === "operator";
  return permittedViewer && input.farmerConsented && input.workflowAuthorized;
}
