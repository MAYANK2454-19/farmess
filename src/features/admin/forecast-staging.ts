type JsonRecord = Record<string, unknown>;

export type ForecastCandidatePayload = {
  crop: string;
  variety: string | null;
  state: string | null;
  district: string | null;
  market_name: string;
  horizon_days: number;
  model_name: string;
  model_version: string;
  training_observation_count: number;
  validated_observation_count: number;
  training_start: string;
  training_end: string;
  baseline_mae_paise_per_quintal: number;
  model_mae_paise_per_quintal: number;
  baseline_smape_percent: number;
  model_smape_percent: number;
  points: Array<{
    target_date: string;
    predicted_modal_price_paise_per_quintal: number;
    lower_bound_paise_per_quintal: number;
    upper_bound_paise_per_quintal: number;
  }>;
};

export type ForecastPayloadResult =
  | { ok: true; payload: ForecastCandidatePayload }
  | { ok: false; error: string };

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isCalendarDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Converts the two files written by ml/market_forecast/train.py into the
 * server API's staging contract. The server repeats every quality and access check.
 */
export function buildForecastCandidatePayload(
  manifestValue: unknown,
  pointsValue: unknown,
): ForecastPayloadResult {
  if (!isRecord(manifestValue) || !isRecord(manifestValue.series)) {
    return { ok: false, error: "The manifest must contain a series object." };
  }
  if (manifestValue.domain !== "market_price_forecast") {
    return { ok: false, error: "This is not a Farmess market-price forecast manifest." };
  }
  if (
    manifestValue.approvalStatus !== "candidate" ||
    manifestValue.automaticallyApproved !== false
  ) {
    return { ok: false, error: "Only an evaluated candidate awaiting human review can be staged." };
  }
  if (manifestValue.currency !== "INR" || manifestValue.priceUnit !== "paise/quintal") {
    return { ok: false, error: "The candidate must use INR paise per quintal." };
  }

  const series = manifestValue.series;
  const evaluation = manifestValue.evaluation;
  if (
    !isRecord(evaluation) ||
    !isRecord(evaluation.baseline) ||
    !isRecord(evaluation.model)
  ) {
    return { ok: false, error: "The manifest is missing its baseline/model evaluation." };
  }

  const crop = series.crop;
  const market = series.market_name;
  const modelName = manifestValue.modelName;
  const modelVersion = manifestValue.modelVersion;
  const trainingStart = manifestValue.trainingStart;
  const trainingEnd = manifestValue.trainingEnd;
  const horizon = manifestValue.forecastHorizonDays;
  const observationCount = manifestValue.trainingObservationCount;
  const validatedObservationCount = manifestValue.totalValidatedObservations;
  const baselineMae = evaluation.baseline.maePaisePerQuintal;
  const modelMae = evaluation.model.maePaisePerQuintal;
  const baselineSmape = evaluation.baseline.smapePercent;
  const modelSmape = evaluation.model.smapePercent;

  if (
    !nonEmptyText(crop) ||
    !nonEmptyText(market) ||
    !nonEmptyText(modelName) ||
    !nonEmptyText(modelVersion)
  ) {
    return { ok: false, error: "The crop, market or model identity is incomplete." };
  }
  if (
    typeof horizon !== "number" ||
    !Number.isSafeInteger(horizon) ||
    horizon < 1 ||
    horizon > 30 ||
    typeof observationCount !== "number" ||
    !Number.isSafeInteger(observationCount) ||
    observationCount < 40 ||
    typeof validatedObservationCount !== "number" ||
    !Number.isSafeInteger(validatedObservationCount) ||
    validatedObservationCount < 120 ||
    observationCount > validatedObservationCount
  ) {
    return {
      ok: false,
      error:
        "At least 120 unique validated observations and 40 actual training rows are required.",
    };
  }
  if (
    !finiteNumber(baselineMae) ||
    !finiteNumber(modelMae) ||
    !finiteNumber(baselineSmape) ||
    !finiteNumber(modelSmape) ||
    baselineMae <= 0 ||
    baselineSmape <= 0 ||
    modelMae < 0 ||
    modelSmape < 0 ||
    modelMae >= baselineMae ||
    modelSmape >= baselineSmape
  ) {
    return { ok: false, error: "The candidate must beat persistence on both MAE and sMAPE." };
  }
  if (
    !isCalendarDate(trainingStart) ||
    !isCalendarDate(trainingEnd) ||
    trainingStart > trainingEnd
  ) {
    return { ok: false, error: "The model training date range is invalid." };
  }
  if (!Array.isArray(pointsValue) || pointsValue.length !== horizon) {
    return { ok: false, error: "The forecast-points file must contain exactly the declared horizon." };
  }

  const points: ForecastCandidatePayload["points"] = [];
  let previousDate = trainingEnd;
  for (const point of pointsValue) {
    if (!isRecord(point)) {
      return { ok: false, error: "A forecast point is not a valid object." };
    }
    const targetDate = point.targetDate;
    const predicted = point.predictedModalPricePaisePerQuintal;
    const lower = point.lowerBoundPaisePerQuintal;
    const upper = point.upperBoundPaisePerQuintal;
    if (
      !isCalendarDate(targetDate) ||
      targetDate <= previousDate ||
      !finiteNumber(predicted) ||
      !finiteNumber(lower) ||
      !finiteNumber(upper) ||
      lower <= 0 ||
      lower > predicted ||
      predicted > upper
    ) {
      return { ok: false, error: "A forecast point has an invalid date or price interval." };
    }
    points.push({
      target_date: targetDate,
      predicted_modal_price_paise_per_quintal: predicted,
      lower_bound_paise_per_quintal: lower,
      upper_bound_paise_per_quintal: upper,
    });
    previousDate = targetDate;
  }

  return {
    ok: true,
    payload: {
      crop: crop.trim(),
      variety: nonEmptyText(series.variety) ? series.variety.trim() : null,
      state: nonEmptyText(series.state) ? series.state.trim() : null,
      district: nonEmptyText(series.district) ? series.district.trim() : null,
      market_name: market.trim(),
      horizon_days: horizon,
      model_name: modelName.trim(),
      model_version: modelVersion.trim(),
      training_observation_count: observationCount,
      validated_observation_count: validatedObservationCount,
      training_start: trainingStart,
      training_end: trainingEnd,
      baseline_mae_paise_per_quintal: baselineMae,
      model_mae_paise_per_quintal: modelMae,
      baseline_smape_percent: baselineSmape,
      model_smape_percent: modelSmape,
      points,
    },
  };
}
