import assert from "node:assert/strict";
import test from "node:test";
import {
  assessProduceQuality,
  QUALITY_CHECKS,
  type QualityInspectionDraft,
} from "./quality-inspection.ts";

const completeDraft: QualityInspectionDraft = {
  lotId: "lot-42",
  assessorId: "inspector-7",
  inspectedAt: "2026-11-23T10:00:00+05:30",
  checks: {
    appearance: "acceptable",
    physical_damage: "acceptable",
    pest_or_contamination: "acceptable",
    moisture_condition: "acceptable",
    packaging_condition: "acceptable",
    temperature_handling: "acceptable",
  },
  observations: "Visual checks completed at collection point.",
};

test("all completed checks produce a normalized inspection summary", () => {
  const result = assessProduceQuality(completeDraft);
  assert.equal(result.valid, true);
  assert.equal(result.status, "checks_complete");
  assert.equal(result.completedChecks, QUALITY_CHECKS.length);
  assert.deepEqual(result.issues, []);
  assert.equal(result.normalized?.inspectedAt, "2026-11-23T04:30:00.000Z");
});

test("any issue is flagged for attention and never converted into a grade", () => {
  const result = assessProduceQuality({
    ...completeDraft,
    checks: { ...completeDraft.checks, physical_damage: "issue_found" },
  });
  assert.equal(result.valid, true);
  assert.equal(result.status, "needs_attention");
  assert.deepEqual(result.issues, ["physical_damage"]);
  assert.equal("grade" in (result.normalized ?? {}), false);
});

test("missing or explicitly unassessed checks keep inspection incomplete", () => {
  const result = assessProduceQuality({
    ...completeDraft,
    checks: { appearance: "acceptable", moisture_condition: "not_assessed" },
  });
  assert.equal(result.valid, true);
  assert.equal(result.status, "incomplete");
  assert.ok(result.unassessed.includes("physical_damage"));
  assert.ok(result.unassessed.includes("moisture_condition"));
});

test("rejects missing lot and assessor identifiers", () => {
  const result = assessProduceQuality({
    ...completeDraft,
    lotId: " ",
    assessorId: "",
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("lot ID")));
  assert.ok(result.errors.some((error) => error.includes("assessor ID")));
});

test("rejects impossible dates and timestamps without timezone", () => {
  for (const inspectedAt of ["2026-02-30T10:00:00Z", "2026-11-23T10:00:00", "not-a-date"]) {
    const result = assessProduceQuality({ ...completeDraft, inspectedAt });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((error) => error.includes("ISO timestamp")));
  }
});

test("rejects unknown checks and unsupported check results", () => {
  const result = assessProduceQuality({
    ...completeDraft,
    checks: {
      ...completeDraft.checks,
      unknown_check: "acceptable",
      appearance: "maybe",
    } as QualityInspectionDraft["checks"],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Unknown quality check")));
  assert.ok(result.errors.some((error) => error.includes("Invalid result")));
});

test("rejects excessively long observation notes", () => {
  const result = assessProduceQuality({
    ...completeDraft,
    observations: "x".repeat(1001),
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("1,000 characters")));
});
