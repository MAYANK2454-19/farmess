import type { FarmessRole } from "../../lib/auth/authorization.ts";

/*
 * Role-specific profile details. Each role may only edit its own fields;
 * values mirror the database CHECK constraints so invalid input is rejected
 * with a clear message before it reaches PostgreSQL.
 */

export const VEHICLE_TYPES = [
  "two_wheeler",
  "tractor_trolley",
  "pickup",
  "mini_truck",
  "truck",
  "other",
] as const;

export const BUYER_TYPES = [
  "trader",
  "wholesaler",
  "retailer",
  "processor",
  "exporter",
  "fpo",
  "institution",
  "other",
] as const;

export const OPERATOR_SERVICE_TYPES = [
  "transport",
  "cold_storage",
  "warehouse",
  "packhouse",
] as const;

export type VehicleType = (typeof VEHICLE_TYPES)[number];
export type BuyerType = (typeof BUYER_TYPES)[number];
export type OperatorServiceType = (typeof OPERATOR_SERVICE_TYPES)[number];

export const ROLE_DETAIL_FIELDS = {
  farmer: [
    "own_transport",
    "transport_vehicle_type",
    "transport_capacity_quintal",
    "farm_size_acres",
    "primary_crops",
  ],
  buyer: ["organisation_name", "buyer_type"],
  operator: [
    "organisation_name",
    "operator_service_types",
    "operator_fleet_size",
    "operator_cold_chain",
  ],
  admin: [],
} as const satisfies Record<FarmessRole, readonly string[]>;

export type RoleDetailsUpdate = {
  own_transport?: boolean | null;
  transport_vehicle_type?: VehicleType | null;
  transport_capacity_quintal?: number | null;
  farm_size_acres?: number | null;
  primary_crops?: string[] | null;
  organisation_name?: string | null;
  buyer_type?: BuyerType | null;
  operator_service_types?: OperatorServiceType[] | null;
  operator_fleet_size?: number | null;
  operator_cold_chain?: boolean | null;
};

export type RoleDetailsParseResult =
  { ok: true; update: RoleDetailsUpdate } | { ok: false; error: string };

const ALL_DETAIL_FIELDS = new Set<string>(Object.values(ROLE_DETAIL_FIELDS).flat());
const MAX_CROPS = 10;
const MAX_CROP_LENGTH = 40;

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function optionalNumber(
  value: unknown,
  {
    min,
    max,
    integer,
    exclusiveMin,
  }: { min: number; max: number; integer?: boolean; exclusiveMin?: boolean },
): number | null | undefined {
  if (value === null || value === "") return null;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (integer && !Number.isInteger(value)) return undefined;
  if (exclusiveMin ? value <= min : value < min) return undefined;
  if (value > max) return undefined;
  return value;
}

/**
 * Validates the role-specific part of a profile PATCH body. Fields that belong
 * to another role are rejected; absent fields are left unchanged.
 */
export function parseRoleDetailsPatch(
  body: Record<string, unknown>,
  role: FarmessRole,
): RoleDetailsParseResult {
  const allowed = new Set<string>(ROLE_DETAIL_FIELDS[role]);
  const update: RoleDetailsUpdate = {};

  for (const key of Object.keys(body)) {
    if (ALL_DETAIL_FIELDS.has(key) && !allowed.has(key)) {
      return { ok: false, error: "That detail does not apply to your account type." };
    }
  }

  if ("own_transport" in body) {
    if (body.own_transport !== null && typeof body.own_transport !== "boolean") {
      return { ok: false, error: "Choose whether you have your own transport." };
    }
    update.own_transport = body.own_transport as boolean | null;
  }

  if ("transport_vehicle_type" in body) {
    const value = body.transport_vehicle_type;
    if (value !== null && value !== "" && !isOneOf(VEHICLE_TYPES, value)) {
      return { ok: false, error: "Choose a listed vehicle type." };
    }
    update.transport_vehicle_type = value ? (value as VehicleType) : null;
  }

  if ("transport_capacity_quintal" in body) {
    const value = optionalNumber(body.transport_capacity_quintal, {
      min: 0,
      max: 1000,
      exclusiveMin: true,
    });
    if (value === undefined) {
      return { ok: false, error: "Vehicle capacity must be between 0 and 1,000 quintal." };
    }
    update.transport_capacity_quintal = value;
  }

  if ("farm_size_acres" in body) {
    const value = optionalNumber(body.farm_size_acres, { min: 0, max: 10000, exclusiveMin: true });
    if (value === undefined) {
      return { ok: false, error: "Farm size must be between 0 and 10,000 acres." };
    }
    update.farm_size_acres = value;
  }

  if ("primary_crops" in body) {
    const value = body.primary_crops;
    if (value === null) {
      update.primary_crops = null;
    } else if (!Array.isArray(value) || value.some((crop) => typeof crop !== "string")) {
      return { ok: false, error: "List your main crops as text." };
    } else {
      const crops = [...new Set((value as string[]).map((crop) => crop.trim()).filter(Boolean))];
      if (crops.length > MAX_CROPS || crops.some((crop) => crop.length > MAX_CROP_LENGTH)) {
        return {
          ok: false,
          error: `List up to ${MAX_CROPS} crops of ${MAX_CROP_LENGTH} characters or fewer.`,
        };
      }
      update.primary_crops = crops.length > 0 ? crops : null;
    }
  }

  if ("organisation_name" in body) {
    const value = body.organisation_name;
    if (value !== null && typeof value !== "string") {
      return { ok: false, error: "Enter a valid organisation name." };
    }
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed.length > 120) {
      return { ok: false, error: "Use 120 characters or fewer for the organisation name." };
    }
    update.organisation_name = trimmed || null;
  }

  if ("buyer_type" in body) {
    const value = body.buyer_type;
    if (value !== null && value !== "" && !isOneOf(BUYER_TYPES, value)) {
      return { ok: false, error: "Choose a listed buyer type." };
    }
    update.buyer_type = value ? (value as BuyerType) : null;
  }

  if ("operator_service_types" in body) {
    const value = body.operator_service_types;
    if (value === null) {
      update.operator_service_types = null;
    } else if (
      !Array.isArray(value) ||
      !value.every((item) => isOneOf(OPERATOR_SERVICE_TYPES, item))
    ) {
      return { ok: false, error: "Choose listed service types only." };
    } else {
      const services = [...new Set(value as OperatorServiceType[])];
      update.operator_service_types = services.length > 0 ? services : null;
    }
  }

  if ("operator_fleet_size" in body) {
    const value = optionalNumber(body.operator_fleet_size, { min: 0, max: 10000, integer: true });
    if (value === undefined) {
      return { ok: false, error: "Fleet size must be a whole number from 0 to 10,000." };
    }
    update.operator_fleet_size = value;
  }

  if ("operator_cold_chain" in body) {
    if (body.operator_cold_chain !== null && typeof body.operator_cold_chain !== "boolean") {
      return { ok: false, error: "Choose whether you offer cold-chain handling." };
    }
    update.operator_cold_chain = body.operator_cold_chain as boolean | null;
  }

  // Vehicle details are only meaningful with own transport (mirrors the DB check).
  if (update.own_transport === false || update.own_transport === null) {
    update.transport_vehicle_type = null;
    update.transport_capacity_quintal = null;
  } else if (
    update.own_transport !== true &&
    ((update.transport_vehicle_type ?? null) !== null ||
      (update.transport_capacity_quintal ?? null) !== null)
  ) {
    return {
      ok: false,
      error: "Mark that you have your own transport before adding vehicle details.",
    };
  }

  return { ok: true, update };
}
