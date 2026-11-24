#!/usr/bin/env python3
"""Offline, time-ordered Farmess mandi-price model training.

Reads an exported, source-attributed CSV and writes local candidate artifacts.
It never approves a model or writes directly to Supabase.

Evaluation mirrors how the forecast is used: from every holdout origin the
model forecasts recursively for each horizon step, and a candidate must beat
last-observation persistence on both MAE and sMAPE at every horizon. Each
horizon gets its own empirical uncertainty band.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import statistics
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error

MODEL_NAME = "hist_gradient_boosting"
MODEL_VERSION = "farmess-market-hgb-1.1.0"
FEATURE_SCHEMA_VERSION = "market-lags-v2"
MINIMUM_OBSERVATIONS = 120
MINIMUM_TRAINING_OBSERVATIONS = 90
MINIMUM_EVALUATIONS_PER_HORIZON = 5
MAX_ORIGIN_AGE_DAYS = 7
LOOKBACK = 28
LAGS = (1, 2, 3, 7, 14, 28)
ROLLING_WINDOWS = (7, 14, 28)
SERIES_KEYS = ("crop", "variety", "state", "district", "market_name")
INTERVAL_QUANTILE = 0.90


def parse_price(value: str | None) -> int | None:
    if value is None or not value.strip():
        return None
    numeric = float(value)
    if not math.isfinite(numeric) or numeric <= 0:
        return None
    rounded = int(round(numeric))
    return rounded if rounded > 0 else None


def safe_component(value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]
    readable = "".join(c.lower() if c.isalnum() else "-" for c in value)[:36].strip("-")
    return f"{readable or 'series'}-{digest}"


def load_series(csv_path: Path) -> dict[tuple[str, ...], tuple[list[date], list[int]]]:
    grouped: dict[tuple[str, ...], list[tuple[date, int]]] = defaultdict(list)
    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = set(SERIES_KEYS) | {"observation_date", "modal_price_paise_per_quintal"}
        missing = required - set(reader.fieldnames or [])
        if missing:
            raise ValueError("CSV is missing columns: " + ", ".join(sorted(missing)))

        for row in reader:
            try:
                key = tuple((row.get(field) or "").strip() for field in SERIES_KEYS)
                if not key[0] or not key[4]:
                    continue
                observed_on = date.fromisoformat(row["observation_date"].strip())
                price = parse_price(row.get("modal_price_paise_per_quintal"))
                if price is not None:
                    grouped[key].append((observed_on, price))
            except (TypeError, ValueError, OverflowError):
                # Invalid source rows are skipped, never coerced into labels.
                continue

    result: dict[tuple[str, ...], tuple[list[date], list[int]]] = {}
    for key, observations in grouped.items():
        by_date: dict[date, list[int]] = defaultdict(list)
        for observed_on, price in observations:
            by_date[observed_on].append(price)
        dates = sorted(by_date)
        # Duplicate same-day records are combined by median. Gaps are not filled.
        prices = [int(round(statistics.median(by_date[day]))) for day in dates]
        result[key] = (dates, prices)
    return result


def make_features(
    history: list[float],
    last_history_date: date,
    target_date: date,
    series_start: date,
) -> list[float]:
    """Features for predicting `target_date` from observations up to `last_history_date`.

    Lags are counted in reporting steps (mandis do not report every day), so the
    calendar gap to the target is supplied explicitly.
    """
    if len(history) < LOOKBACK:
        raise ValueError(f"At least {LOOKBACK} preceding observations are required.")
    gap_days = (target_date - last_history_date).days
    if gap_days < 1:
        raise ValueError("The target date must come after the last observation used.")
    features: list[float] = [float(history[-lag]) for lag in LAGS]
    for window in ROLLING_WINDOWS:
        values = np.asarray(history[-window:], dtype=np.float64)
        features.extend([float(np.mean(values)), float(np.std(values, ddof=0))])
    day_of_year = target_date.timetuple().tm_yday
    features.extend(
        [
            math.sin(2.0 * math.pi * day_of_year / 365.25),
            math.cos(2.0 * math.pi * day_of_year / 365.25),
            float((target_date - series_start).days),
            float(gap_days),
        ]
    )
    return features


def smape(actual: np.ndarray, predicted: np.ndarray) -> float:
    denominator = np.abs(actual) + np.abs(predicted)
    valid = denominator > 0
    if not np.any(valid):
        return 0.0
    return float(np.mean(200.0 * np.abs(actual[valid] - predicted[valid]) / denominator[valid]))


def recursive_forecast(
    model: HistGradientBoostingRegressor,
    history: list[float],
    history_dates: list[date],
    target_dates: list[date],
    series_start: date,
) -> list[float]:
    """Forecast each target date in order, feeding every prediction into the next step."""
    rolling = list(history)
    last_date = history_dates[-1]
    predictions: list[float] = []
    for target_date in target_dates:
        row = make_features(rolling, last_date, target_date, series_start)
        point = max(1.0, float(model.predict(np.asarray([row], dtype=np.float64))[0]))
        predictions.append(point)
        rolling.append(point)
        last_date = target_date
    return predictions


def walk_forward_evaluation(
    model: HistGradientBoostingRegressor,
    dates: list[date],
    prices: list[int],
    split_at: int,
    horizon: int,
) -> list[dict[str, Any]]:
    """Score recursive forecasts from every holdout origin at steps 1..horizon.

    Horizon steps are reporting steps; each step's target is the next actual
    observation date, so no observed value after the origin enters a feature.
    """
    actual_by_step: list[list[float]] = [[] for _ in range(horizon)]
    model_by_step: list[list[float]] = [[] for _ in range(horizon)]
    baseline_by_step: list[list[float]] = [[] for _ in range(horizon)]

    for origin in range(split_at, len(prices)):
        steps = min(horizon, len(prices) - origin)
        predictions = recursive_forecast(
            model,
            [float(p) for p in prices[:origin]],
            dates[:origin],
            dates[origin : origin + steps],
            dates[0],
        )
        persistence = float(prices[origin - 1])
        for step in range(steps):
            actual_by_step[step].append(float(prices[origin + step]))
            model_by_step[step].append(predictions[step])
            baseline_by_step[step].append(persistence)

    results: list[dict[str, Any]] = []
    for step in range(horizon):
        if len(actual_by_step[step]) < MINIMUM_EVALUATIONS_PER_HORIZON:
            break
        actual = np.asarray(actual_by_step[step], dtype=np.float64)
        predicted = np.asarray(model_by_step[step], dtype=np.float64)
        baseline = np.asarray(baseline_by_step[step], dtype=np.float64)
        results.append(
            {
                "step": step + 1,
                "evaluations": int(actual.size),
                "modelMae": float(mean_absolute_error(actual, predicted)),
                "baselineMae": float(mean_absolute_error(actual, baseline)),
                "modelSmape": smape(actual, predicted),
                "baselineSmape": smape(actual, baseline),
                "residualBand": float(np.quantile(np.abs(actual - predicted), INTERVAL_QUANTILE)),
            }
        )
    return results


def write_manifest(series_dir: Path, manifest: dict[str, Any]) -> dict[str, Any]:
    (series_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def train_one_series(
    key: tuple[str, ...],
    dates: list[date],
    prices: list[int],
    output_dir: Path,
    horizon_days: int,
    as_of: date,
) -> dict[str, Any]:
    total = len(prices)
    series_dir = output_dir / safe_component("|".join(key))
    series_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, Any] = {
        "domain": "market_price_forecast",
        "modelName": MODEL_NAME,
        "modelVersion": MODEL_VERSION,
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "series": dict(zip(SERIES_KEYS, key, strict=True)),
        "currency": "INR",
        "priceUnit": "paise/quintal",
        "totalValidatedObservations": total,
        "trainingObservationCount": 0,
        "trainingStart": dates[0].isoformat() if dates else None,
        "trainingEnd": None,
        "lastObservationDate": dates[-1].isoformat() if dates else None,
        "forecastAsOf": as_of.isoformat(),
        "evaluation": None,
        "forecastHorizonDays": horizon_days,
        "approvalStatus": "insufficient_data",
        "automaticallyApproved": False,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    if total < MINIMUM_OBSERVATIONS:
        manifest["reason"] = (
            f"Need at least {MINIMUM_OBSERVATIONS} unique dated observations; only {total} exist."
        )
        return write_manifest(series_dir, manifest)

    origin_age = (as_of - dates[-1]).days
    if origin_age < 0:
        manifest["approvalStatus"] = "rejected"
        manifest["reason"] = "The series contains observations dated after the forecast as-of date."
        return write_manifest(series_dir, manifest)
    if origin_age > MAX_ORIGIN_AGE_DAYS:
        manifest["approvalStatus"] = "stale_data"
        manifest["reason"] = (
            f"The latest observation is {origin_age} days old (limit {MAX_ORIGIN_AGE_DAYS}). "
            "Import current reports before forecasting."
        )
        return write_manifest(series_dir, manifest)

    # Final chronological ~20% is held out; no random split or target leakage.
    split_at = max(MINIMUM_TRAINING_OBSERVATIONS, int(math.floor(total * 0.8)))
    if total - split_at < MINIMUM_EVALUATIONS_PER_HORIZON + horizon_days - 1:
        manifest["reason"] = (
            "The chronological split leaves too few holdout origins to evaluate every horizon."
        )
        return write_manifest(series_dir, manifest)

    x_train: list[list[float]] = []
    y_train: list[float] = []
    for index in range(LOOKBACK, split_at):
        x_train.append(make_features(prices[:index], dates[index - 1], dates[index], dates[0]))
        y_train.append(float(prices[index]))

    model = HistGradientBoostingRegressor(
        learning_rate=0.05,
        max_iter=120,
        max_leaf_nodes=7,
        min_samples_leaf=5,
        l2_regularization=5.0,
        random_state=42,
    )
    model.fit(np.asarray(x_train, dtype=np.float64), np.asarray(y_train, dtype=np.float64))

    per_horizon = walk_forward_evaluation(model, dates, prices, split_at, horizon_days)
    if len(per_horizon) < horizon_days:
        manifest["reason"] = "Too few holdout origins to evaluate every forecast horizon."
        return write_manifest(series_dir, manifest)

    beats_every_horizon = all(
        item["modelMae"] < item["baselineMae"] and item["modelSmape"] < item["baselineSmape"]
        for item in per_horizon
    )
    approval_status = "candidate" if beats_every_horizon else "rejected"

    joblib.dump(model, series_dir / "model.joblib")

    # Publish calendar days strictly after the as-of date. Days between the last
    # observation and the as-of date are forecast internally but never published.
    hidden_days = origin_age
    all_targets = [dates[-1] + timedelta(days=step) for step in range(1, hidden_days + horizon_days + 1)]
    projections = recursive_forecast(
        model, [float(p) for p in prices], dates, all_targets, dates[0]
    )
    forecast_points: list[dict[str, Any]] = []
    for offset, (target_date, point) in enumerate(
        zip(all_targets[hidden_days:], projections[hidden_days:], strict=True)
    ):
        band = per_horizon[min(offset, len(per_horizon) - 1)]["residualBand"]
        forecast_points.append(
            {
                "targetDate": target_date.isoformat(),
                "predictedModalPricePaisePerQuintal": round(point, 2),
                "lowerBoundPaisePerQuintal": round(max(1.0, point - band), 2),
                "upperBoundPaisePerQuintal": round(point + band, 2),
                "intervalMethod": (
                    f"{int(INTERVAL_QUANTILE * 100)}th-percentile absolute walk-forward residual "
                    f"at horizon step {offset + 1}"
                ),
            }
        )

    def mean_of(field: str) -> float:
        return float(np.mean([item[field] for item in per_horizon]))

    evaluation = {
        "trainingSupervisedRows": len(x_train),
        "holdoutOrigins": len(prices) - split_at,
        "evaluationStart": dates[split_at].isoformat(),
        "evaluationEnd": dates[-1].isoformat(),
        # Aggregates are means across horizons; the per-horizon table is authoritative.
        "baseline": {
            "name": "last_observation_persistence",
            "maePaisePerQuintal": round(mean_of("baselineMae"), 2),
            "smapePercent": round(mean_of("baselineSmape"), 3),
        },
        "model": {
            "maePaisePerQuintal": round(mean_of("modelMae"), 2),
            "smapePercent": round(mean_of("modelSmape"), 3),
        },
        "perHorizon": [
            {
                "step": item["step"],
                "evaluations": item["evaluations"],
                "modelMaePaisePerQuintal": round(item["modelMae"], 2),
                "baselineMaePaisePerQuintal": round(item["baselineMae"], 2),
                "modelSmapePercent": round(item["modelSmape"], 3),
                "baselineSmapePercent": round(item["baselineSmape"], 3),
                "absoluteResidualBandPaise": round(item["residualBand"], 2),
            }
            for item in per_horizon
        ],
        "beatsBaselineAtEveryHorizon": beats_every_horizon,
        "beatsBaselineOnBothMetrics": beats_every_horizon,
        "evaluationMethod": (
            "Walk-forward over a chronological holdout. From each origin the fixed model "
            "forecasts recursively, using only observations before the origin; every horizon "
            "step is compared with last-observation persistence."
        ),
    }

    manifest.update(
        {
            "trainingObservationCount": split_at,
            "trainingEnd": dates[split_at - 1].isoformat(),
            "evaluation": evaluation,
            "approvalStatus": approval_status,
            "automaticallyApproved": False,
            "modelArtifact": "model.joblib",
            "forecastPointsFile": "forecast_points.json",
            "reason": (
                "Candidate beat persistence at every horizon. Human review is required before publishing."
                if beats_every_horizon
                else "Model did not beat persistence on MAE and sMAPE at every horizon; do not promote."
            ),
        }
    )

    (series_dir / "forecast_points.json").write_text(
        json.dumps(forecast_points, indent=2), encoding="utf-8"
    )
    return write_manifest(series_dir, manifest)


def main() -> int:
    parser = argparse.ArgumentParser(description="Train and evaluate Farmess mandi price models.")
    parser.add_argument("--input", required=True, type=Path, help="CSV export of public.market_observations")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--horizon-days", type=int, default=7)
    parser.add_argument("--max-series", type=int, default=100)
    parser.add_argument(
        "--as-of",
        type=date.fromisoformat,
        default=datetime.now(timezone.utc).date(),
        help="Forecast reference date (YYYY-MM-DD). Published points start the day after.",
    )
    args = parser.parse_args()

    if not 1 <= args.horizon_days <= 30:
        parser.error("--horizon-days must be from 1 to 30.")
    if not 1 <= args.max_series <= 1000:
        parser.error("--max-series must be from 1 to 1000.")
    if not args.input.is_file():
        parser.error(f"Input CSV does not exist: {args.input}")

    series = load_series(args.input)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    manifests: list[dict[str, Any]] = []

    for key, (dates, prices) in sorted(series.items(), key=lambda item: item[0])[: args.max_series]:
        manifests.append(
            train_one_series(key, dates, prices, args.output_dir, args.horizon_days, args.as_of)
        )

    summary = {
        "modelName": MODEL_NAME,
        "modelVersion": MODEL_VERSION,
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "approvalPolicy": "No automatic approval. Human review is mandatory.",
        "forecastAsOf": args.as_of.isoformat(),
        "seriesProcessed": len(manifests),
        "candidateSeries": sum(m["approvalStatus"] == "candidate" for m in manifests),
        "rejectedSeries": sum(m["approvalStatus"] == "rejected" for m in manifests),
        "staleSeries": sum(m["approvalStatus"] == "stale_data" for m in manifests),
        "insufficientDataSeries": sum(m["approvalStatus"] == "insufficient_data" for m in manifests),
        "series": [
            {
                "key": manifest["series"],
                "approvalStatus": manifest["approvalStatus"],
                "trainingObservationCount": manifest["trainingObservationCount"],
                "evaluation": manifest["evaluation"],
                "reason": manifest["reason"],
            }
            for manifest in manifests
        ],
    }
    (args.output_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
