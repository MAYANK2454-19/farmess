export const QUALITY_CHECKS = [
  "appearance",
  "physical_damage",
  "pest_or_contamination",
  "moisture_condition",
  "packaging_condition",
  "temperature_handling",
] as const;

export type QualityCheck = (typeof QUALITY_CHECKS)[number];
export type QualityCheckResult = "acceptable" | "issue_found" | "not_assessed";

export type QualityInspectionDraft = {
  lotId: string;
  assessorId: string;
  inspectedAt: string;
  checks: Partial<Record<QualityCheck, QualityCheckResult>>;
  observations?: string;
};

export type QualityInspectionStatus = "incomplete" | "needs_attention" | "checks_complete";

export type QualityInspectionResult = {
  valid: boolean;
  status: QualityInspectionStatus;
  completedChecks: number;
  totalChecks: number;
  issues: QualityCheck[];
  unassessed: QualityCheck[];
  errors: string[];
  normalized: {
    lotId: string;
    assessorId: string;
    inspectedAt: string;
    checks: Partial<Record<QualityCheck, QualityCheckResult>>;
    observations: string;
  } | null;
};

const CHECK_SET: readonly string[] = QUALITY_CHECKS;
const RESULT_SET: readonly string[] = ["acceptable", "issue_found", "not_assessed"];

function isRealIsoDateTime(value: string): boolean {
  const pattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!pattern.test(value) || !Number.isFinite(Date.parse(value))) return false;

  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return (
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day
  );
}

/**
 * Summarise a human-entered produce inspection without assigning a grade,
 * certifying food safety, or changing the lot's publication status.
 */
export function assessProduceQuality(draft: QualityInspectionDraft): QualityInspectionResult {
  const errors: string[] = [];
  const lotId = typeof draft.lotId === "string" ? draft.lotId.trim() : "";
  const assessorId = typeof draft.assessorId === "string" ? draft.assessorId.trim() : "";
  const inspectedAt = typeof draft.inspectedAt === "string" ? draft.inspectedAt.trim() : "";
  const observations = typeof draft.observations === "string" ? draft.observations.trim() : "";

  if (!lotId) errors.push("A lot ID is required.");
  if (!assessorId) errors.push("An assessor ID is required.");
  if (!isRealIsoDateTime(inspectedAt)) {
    errors.push("Inspection time must be a valid timezone-qualified ISO timestamp.");
  }
  if (observations.length > 1000) {
    errors.push("Observations must be 1,000 characters or fewer.");
  }

  const sourceChecks = draft.checks && typeof draft.checks === "object" ? draft.checks : {};
  const checks: Partial<Record<QualityCheck, QualityCheckResult>> = {};
  for (const [key, value] of Object.entries(sourceChecks)) {
    if (!CHECK_SET.includes(key)) {
      errors.push(`Unknown quality check: ${key}.`);
    } else if (!RESULT_SET.includes(value)) {
      errors.push(`Invalid result for quality check: ${key}.`);
    } else {
      checks[key as QualityCheck] = value as QualityCheckResult;
    }
  }

  const issues = QUALITY_CHECKS.filter((check) => checks[check] === "issue_found");
  const unassessed = QUALITY_CHECKS.filter(
    (check) => checks[check] === undefined || checks[check] === "not_assessed",
  );
  const completedChecks = QUALITY_CHECKS.length - unassessed.length;
  const status: QualityInspectionStatus =
    unassessed.length > 0
      ? "incomplete"
      : issues.length > 0
        ? "needs_attention"
        : "checks_complete";

  if (errors.length > 0) {
    return {
      valid: false,
      status,
      completedChecks,
      totalChecks: QUALITY_CHECKS.length,
      issues,
      unassessed,
      errors,
      normalized: null,
    };
  }

  return {
    valid: true,
    status,
    completedChecks,
    totalChecks: QUALITY_CHECKS.length,
    issues,
    unassessed,
    errors: [],
    normalized: {
      lotId,
      assessorId,
      inspectedAt: new Date(inspectedAt).toISOString(),
      checks,
      observations,
    },
  };
}
