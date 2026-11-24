import assert from "node:assert/strict";
import test from "node:test";

import { buildForecastCandidatePayload } from "./forecast-staging.ts";

function manifest(overrides: Record<string, unknown> = {}) {
  return {
    domain: "market_price_forecast",
    modelName: "hist_gradient_boosting",
    modelVersion: "farmess-market-hgb-1.0.0",
    featureSchemaVersion: "market-lags-v1",
    series: {
      crop: "Onion",
      variety: "",
      state: "Maharashtra",
      district: "Nashik",
      market_name: "Lasalgaon",
    },
    currency: "INR",
    priceUnit: "paise/quintal",
    totalValidatedObservations: 160,
    trainingObservationCount: 128,
    trainingStart: "2026-01-01",
    trainingEnd: "2026-10-01",
    forecastHorizonDays: 2,
    approvalStatus: "candidate",
    automaticallyApproved: false,
    evaluation: {
      baseline: { maePaisePerQuintal: 12000, smapePercent: 12 },
      model: { maePaisePerQuintal: 10000, smapePercent: 9 },
    },
    ...overrides,
  };
}

const points = [
  {
    targetDate: "2026-10-02",
    predictedModalPricePaisePerQuintal: 250000,
    lowerBoundPaisePerQuintal: 230000,
    upperBoundPaisePerQuintal: 270000,
  },
  {
    targetDate: "2026-10-03",
    predictedModalPricePaisePerQuintal: 255000,
    lowerBoundPaisePerQuintal: 235000,
    upperBoundPaisePerQuintal: 275000,
  },
];

test("maps an evaluated candidate and its forecast points to the admin API contract", () => {
  const result = buildForecastCandidatePayload(manifest(), points);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.crop, "Onion");
  assert.equal(result.payload.market_name, "Lasalgaon");
  assert.equal(result.payload.training_observation_count, 128);
  assert.equal(result.payload.variety, null);
  assert.equal(result.payload.points[0].target_date, "2026-10-02");
});

test("rejects candidates that were rejected or insufficient-data", () => {
  for (const approvalStatus of ["rejected", "insufficient_data"]) {
    const result = buildForecastCandidatePayload(manifest({ approvalStatus }), points);
    assert.equal(result.ok, false);
  }
});

test("rejects automatically approved or non-INR manifests", () => {
  assert.equal(
    buildForecastCandidatePayload(manifest({ automaticallyApproved: true }), points).ok,
    false,
  );
  assert.equal(buildForecastCandidatePayload(manifest({ priceUnit: "INR/kg" }), points).ok, false);
});

test("rejects models that do not beat both persistence metrics", () => {
  const candidate = manifest();
  const evaluation = {
    baseline: { maePaisePerQuintal: 12000, smapePercent: 12 },
    model: { maePaisePerQuintal: 11000, smapePercent: 12 },
  };
  assert.equal(buildForecastCandidatePayload({ ...candidate, evaluation }, points).ok, false);
});

test("accepts 120 validated observations while keeping the holdout out of training rows", () => {
  const result = buildForecastCandidatePayload(
    manifest({ totalValidatedObservations: 120, trainingObservationCount: 96 }),
    points,
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.payload.validated_observation_count, 120);
  assert.equal(result.payload.training_observation_count, 96);
});

test("rejects insufficient validated observations or an invalid training split", () => {
  assert.equal(
    buildForecastCandidatePayload(
      manifest({ totalValidatedObservations: 119, trainingObservationCount: 95 }),
      points,
    ).ok,
    false,
  );
  assert.equal(
    buildForecastCandidatePayload(
      manifest({ totalValidatedObservations: 120, trainingObservationCount: 39 }),
      points,
    ).ok,
    false,
  );
  assert.equal(buildForecastCandidatePayload(manifest(), points.slice(0, 1)).ok, false);
});

test("rejects invalid price intervals and malformed dates", () => {
  const invalidInterval = [{ ...points[0], lowerBoundPaisePerQuintal: 300000 }, points[1]];
  assert.equal(buildForecastCandidatePayload(manifest(), invalidInterval).ok, false);
  const invalidDate = [{ ...points[0], targetDate: "2026-02-30" }, points[1]];
  assert.equal(buildForecastCandidatePayload(manifest(), invalidDate).ok, false);
});

test("rejects out-of-order forecasts and forecast dates before the training end", () => {
  const outOfOrder = [points[1], points[0]];
  assert.equal(buildForecastCandidatePayload(manifest(), outOfOrder).ok, false);

  const beforeTrainingEnd = [{ ...points[0], targetDate: "2026-09-30" }, points[1]];
  assert.equal(buildForecastCandidatePayload(manifest(), beforeTrainingEnd).ok, false);
});
