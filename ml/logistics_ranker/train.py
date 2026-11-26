#!/usr/bin/env python3
"""Offline candidate training for the Farmess logistics preference ranker.

The target is explicit farmer usefulness feedback, not a completed service.
Training is time-ordered and uses no user IDs or provider IDs as model features.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import (
    balanced_accuracy_score,
    brier_score_loss,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

MODEL_NAME = "hist_gradient_boosting_logistics_preference"
MODEL_VERSION = "farmess-logistics-preference-1.0.0"
FEATURE_SCHEMA_VERSION = "logistics-feedback-v2"
MINIMUM_LABELS = 300
MINIMUM_TRAINING_LABELS = 200
MINIMUM_EVALUATION_LABELS = 60
MINIMUM_UNIQUE_USERS = 30
MINIMUM_UNIQUE_LISTINGS = 20

NUMERIC_FEATURES = ["distance_meters", "price_paise", "service_radius_km"]
# HeiGIT road route shown to the farmer (v2). Optional: older exports lack these
# columns, and ratings without a road route leave them empty (imputed).
OPTIONAL_NUMERIC_FEATURES = ["road_distance_meters", "drive_duration_seconds"]
MODEL_NUMERIC_FEATURES = NUMERIC_FEATURES + OPTIONAL_NUMERIC_FEATURES
CATEGORICAL_FEATURES = [
    "service_type",
    "rate_basis",
    "provider_verification_state",
    "capacity_match",
    "crop_match",
    "date_match",
    "cold_chain_match",
    "service_radius_match",
]
REQUIRED_COLUMNS = {
    "user_id",
    "service_listing_id",
    "created_at",
    "user_feedback",
    *NUMERIC_FEATURES,
    *CATEGORICAL_FEATURES,
}


def parse_optional_number(value: str | None) -> float | None:
    if value is None or not value.strip():
        return None
    number = float(value)
    if not math.isfinite(number):
        return None
    return number


def parse_timestamp(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        raise ValueError("created_at timestamps must include a timezone")
    return parsed.astimezone(timezone.utc)


def load_rows(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        missing = REQUIRED_COLUMNS - set(reader.fieldnames or [])
        if missing:
            raise ValueError("CSV is missing columns: " + ", ".join(sorted(missing)))

        for source in reader:
            try:
                rating = int(source["user_feedback"])
                if rating in (1, 2):
                    label = 0
                elif rating in (4, 5):
                    label = 1
                else:
                    # A neutral rating is ambiguous; don't force it into either class.
                    continue

                timestamp = parse_timestamp(source["created_at"])
                if not source["user_id"].strip() or not source["service_listing_id"].strip():
                    continue

                row: dict[str, Any] = {
                    "created_at": timestamp,
                    "user_id": source["user_id"].strip(),
                    "service_listing_id": source["service_listing_id"].strip(),
                    "label": label,
                }
                for column in NUMERIC_FEATURES + OPTIONAL_NUMERIC_FEATURES:
                    row[column] = parse_optional_number(source.get(column))
                for column in CATEGORICAL_FEATURES:
                    value = (source.get(column) or "").strip()
                    row[column] = value if value else "unknown"
                rows.append(row)
            except (TypeError, ValueError, OverflowError):
                continue

    return sorted(rows, key=lambda item: item["created_at"])


def build_pipeline() -> Pipeline:
    numeric = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median", add_indicator=True)),
            ("scale", StandardScaler()),
        ]
    )
    categorical = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="constant", fill_value="unknown")),
            ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
        ]
    )
    numeric_indices = list(range(len(MODEL_NUMERIC_FEATURES)))
    categorical_indices = list(
        range(len(MODEL_NUMERIC_FEATURES), len(MODEL_NUMERIC_FEATURES) + len(CATEGORICAL_FEATURES))
    )
    features = ColumnTransformer(
        transformers=[
            ("numeric", numeric, numeric_indices),
            ("categorical", categorical, categorical_indices),
        ],
        remainder="drop",
        sparse_threshold=0.0,
    )
    classifier = HistGradientBoostingClassifier(
        learning_rate=0.05,
        max_iter=120,
        max_leaf_nodes=7,
        min_samples_leaf=12,
        l2_regularization=5.0,
        random_state=42,
    )
    return Pipeline(steps=[("features", features), ("classifier", classifier)])


def safe_slug(value: str) -> str:
    digest = hashlib.sha256(value.encode("utf-8")).hexdigest()[:12]
    return f"logistics-{digest}"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Train a time-ordered logistics preference candidate."
    )
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    args = parser.parse_args()

    if not args.input.is_file():
        parser.error(f"Input CSV does not exist: {args.input}")

    rows = load_rows(args.input)
    output = args.output_dir / safe_slug(str(args.input.resolve()))
    output.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, Any] = {
        "domain": "logistics_ranker",
        "target": "explicit_usefulness_rating_binary",
        "positiveLabel": "rating_4_or_5",
        "negativeLabel": "rating_1_or_2",
        "neutralRatings": "excluded",
        "modelName": MODEL_NAME,
        "modelVersion": MODEL_VERSION,
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "featureColumns": MODEL_NUMERIC_FEATURES + CATEGORICAL_FEATURES,
        "identifiersExcludedFromFeatures": ["user_id", "service_listing_id"],
        "totalUsableLabels": len(rows),
        "uniqueUsers": len({row["user_id"] for row in rows}),
        "uniqueListings": len({row["service_listing_id"] for row in rows}),
        "approvalStatus": "insufficient_data",
        "automaticallyApproved": False,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }

    if len(rows) < MINIMUM_LABELS:
        manifest["reason"] = (
            f"Need at least {MINIMUM_LABELS} clear non-neutral ratings; got {len(rows)}."
        )
    elif manifest["uniqueUsers"] < MINIMUM_UNIQUE_USERS:
        manifest["reason"] = (
            f"Need ratings from at least {MINIMUM_UNIQUE_USERS} distinct users."
        )
    elif manifest["uniqueListings"] < MINIMUM_UNIQUE_LISTINGS:
        manifest["reason"] = (
            f"Need at least {MINIMUM_UNIQUE_LISTINGS} distinct provider listings."
        )
    else:
        split_at = int(math.floor(len(rows) * 0.8))
        train_rows = rows[:split_at]
        test_rows = rows[split_at:]

        if (
            len(train_rows) < MINIMUM_TRAINING_LABELS
            or len(test_rows) < MINIMUM_EVALUATION_LABELS
            or len({row["label"] for row in train_rows}) < 2
            or len({row["label"] for row in test_rows}) < 2
        ):
            manifest["reason"] = "Chronological split does not contain enough examples of both rating classes."
        else:
            feature_columns = MODEL_NUMERIC_FEATURES + CATEGORICAL_FEATURES
            x_train = np.asarray(
                [[row[column] for column in feature_columns] for row in train_rows],
                dtype=object,
            )
            x_test = np.asarray(
                [[row[column] for column in feature_columns] for row in test_rows],
                dtype=object,
            )
            y_train = np.asarray([row["label"] for row in train_rows], dtype=np.int8)
            y_test = np.asarray([row["label"] for row in test_rows], dtype=np.int8)

            model = build_pipeline()
            model.fit(x_train, y_train)
            probability = model.predict_proba(x_test)[:, 1]
            prediction = (probability >= 0.5).astype(np.int8)

            prior = DummyClassifier(strategy="prior")
            prior.fit(x_train, y_train)
            baseline_probability = prior.predict_proba(x_test)[:, 1]

            metrics = {
                "rocAuc": float(roc_auc_score(y_test, probability)),
                "brierScore": float(brier_score_loss(y_test, probability)),
                "balancedAccuracy": float(balanced_accuracy_score(y_test, prediction)),
                "precision": float(precision_score(y_test, prediction, zero_division=0)),
                "recall": float(recall_score(y_test, prediction, zero_division=0)),
                "baselineBrierScore": float(brier_score_loss(y_test, baseline_probability)),
                "trainingRows": len(train_rows),
                "evaluationRows": len(test_rows),
                "trainingEnd": train_rows[-1]["created_at"].isoformat(),
                "evaluationStart": test_rows[0]["created_at"].isoformat(),
                "evaluationEnd": test_rows[-1]["created_at"].isoformat(),
            }

            # Conservative promotion gate; human review remains mandatory.
            passed = (
                metrics["rocAuc"] >= 0.65
                and metrics["balancedAccuracy"] >= 0.55
                and metrics["brierScore"] < metrics["baselineBrierScore"]
            )
            manifest.update(
                {
                    "evaluation": metrics,
                    "approvalStatus": "candidate" if passed else "rejected",
                    "reason": (
                        "Candidate passed the offline preference-label evaluation. "
                        "Human review is mandatory before use."
                        if passed
                        else "The candidate did not pass all preference-label evaluation thresholds."
                    ),
                }
            )
            joblib.dump(model, output / "model.joblib")

    (output / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
