#!/usr/bin/env python3
"""Offline, time-ordered Farmess mandi-price model training.

Reads an exported, source-attributed CSV and writes local candidate artifacts.
It never approves a model or writes directly to Supabase.
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
MODEL_VERSION = "farmess-market-hgb-1.0.0"
FEATURE_SCHEMA_VERSION = "market-lags-v1"
MINIMUM_OBSERVATIONS = 120
LOOKBACK = 28
LAGS = (1, 2, 3, 7, 14, 28)
ROLLING_WINDOWS = (7, 14, 28)
SERIES_KEYS = ("crop", "variety", "state", "district", "market_name")


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


def make_features(history: list[int], target_date: date, series_start: date) -> list[float]:
    if len(history) < LOOKBACK:
        raise ValueError(f"At least {LOOKBACK} preceding observations are required.")
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
        ]
    )
    return features


def smape(actual: np.ndarray, predicted: np.ndarray) -> float:
    denominator = np.abs(actual) + np.abs(predicted)
    valid = denominator > 0
    if not np.any(valid):
        return 0.0
    return float(np.mean(200.0 * np.abs(actual[valid] - predicted[valid]) / denominator[valid]))


def train_one_series(
    key: tuple[str, ...],
    dates: list[date],
    prices: list[int],
    output_dir: Path,
    horizon_days: int,
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
        (series_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    # Final chronological 20% is held out; no random split or target leakage.
    split_at = max(LOOKBACK + 40, int(math.floor(total * 0.8)))
    split_at = min(split_at, total - 10)

    x_train: list[list[float]] = []
    y_train: list[float] = []
    for index in range(LOOKBACK, split_at):
        x_train.append(make_features(prices[:index], dates[index], dates[0]))
        y_train.append(float(prices[index]))

    x_test: list[list[float]] = []
    y_test: list[float] = []
    baseline_test: list[float] = []
    for index in range(split_at, total):
        x_test.append(make_features(prices[:index], dates[index], dates[0]))
        y_test.append(float(prices[index]))
        baseline_test.append(float(prices[index - 1]))

    if len(x_train) < 40 or len(x_test) < 10:
        manifest["reason"] = "The chronological split leaves too few training or evaluation rows."
        (series_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        return manifest

    model = HistGradientBoostingRegressor(
        learning_rate=0.05,
        max_iter=120,
        max_leaf_nodes=7,
        min_samples_leaf=5,
        l2_regularization=5.0,
        random_state=42,
    )
    model.fit(np.asarray(x_train, dtype=np.float64), np.asarray(y_train, dtype=np.float64))

    actual = np.asarray(y_test, dtype=np.float64)
    baseline = np.asarray(baseline_test, dtype=np.float64)
    predicted = np.maximum(1.0, model.predict(np.asarray(x_test, dtype=np.float64)))

    model_mae = float(mean_absolute_error(actual, predicted))
    baseline_mae = float(mean_absolute_error(actual, baseline))
    model_smape = smape(actual, predicted)
    baseline_smape = smape(actual, baseline)
    residual_band = float(np.quantile(np.abs(actual - predicted), 0.90))

    # A candidate must beat persistence on both MAE and sMAPE.
    beats_baseline = model_mae < baseline_mae and model_smape < baseline_smape
    approval_status = "candidate" if beats_baseline else "rejected"

    joblib.dump(model, series_dir / "model.joblib")

    # Recursive seven-calendar-day projection. Each forecast step feeds the next.
    # No future observed values enter these features.
    forecast_points: list[dict[str, Any]] = []
    rolling_history = list(prices)
    last_date = dates[-1]
    for step in range(1, horizon_days + 1):
        target_date = last_date + timedelta(days=step)
        feature_row = make_features(rolling_history, target_date, dates[0])
        point = max(1.0, float(model.predict(np.asarray([feature_row], dtype=np.float64))[0]))
        forecast_points.append(
            {
                "targetDate": target_date.isoformat(),
                "predictedModalPricePaisePerQuintal": round(point, 2),
                "lowerBoundPaisePerQuintal": round(max(1.0, point - residual_band), 2),
                "upperBoundPaisePerQuintal": round(point + residual_band, 2),
                "intervalMethod": "90th-percentile absolute walk-forward residual band",
            }
        )
        rolling_history.append(int(round(point)))

    evaluation = {
        "trainingSupervisedRows": len(x_train),
        "evaluationRows": len(x_test),
        "evaluationStart": dates[split_at].isoformat(),
        "evaluationEnd": dates[-1].isoformat(),
        "baseline": {
            "name": "last_observation_persistence",
            "maePaisePerQuintal": round(baseline_mae, 2),
            "smapePercent": round(baseline_smape, 3),
        },
        "model": {
            "maePaisePerQuintal": round(model_mae, 2),
            "smapePercent": round(model_smape, 3),
        },
        "absoluteResidual90thPercentilePaise": round(residual_band, 2),
        "beatsBaselineOnBothMetrics": beats_baseline,
        "evaluationMethod": (
            "Chronological holdout; each validation feature uses only observations before its target. "
            "The trained model is fixed during holdout."
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
                "Candidate beat the persistence baseline. Human review is required before publishing."
                if beats_baseline
                else "Model did not beat persistence on both MAE and sMAPE; do not promote."
            ),
        }
    )

    (series_dir / "forecast_points.json").write_text(
        json.dumps(forecast_points, indent=2), encoding="utf-8"
    )
    (series_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Train and evaluate Farmess mandi price models.")
    parser.add_argument("--input", required=True, type=Path, help="CSV export of public.market_observations")
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--horizon-days", type=int, default=7)
    parser.add_argument("--max-series", type=int, default=100)
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
        manifests.append(train_one_series(key, dates, prices, args.output_dir, args.horizon_days))

    summary = {
        "modelName": MODEL_NAME,
        "modelVersion": MODEL_VERSION,
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "approvalPolicy": "No automatic approval. Human review is mandatory.",
        "seriesProcessed": len(manifests),
        "candidateSeries": sum(m["approvalStatus"] == "candidate" for m in manifests),
        "rejectedSeries": sum(m["approvalStatus"] == "rejected" for m in manifests),
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
