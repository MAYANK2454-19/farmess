#!/usr/bin/env python3
"""Export privacy-minimised, allow-listed Farmess ML training datasets.

The script uses a server-side Supabase key only from the process environment.
It writes local CSV files and a readiness manifest; it never writes to Supabase.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import hmac
import json
import math
import os
import re
import sys
import time
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urlsplit
from urllib.request import Request, urlopen

EXPORT_VERSION = "farmess-ml-export-v1"
DEFAULT_PAGE_SIZE = 500
MAX_PAGE_SIZE = 1000

MARKET_COLUMNS = (
    "crop",
    "variety",
    "state",
    "district",
    "market_name",
    "observation_date",
    "modal_price_paise_per_quintal",
)
FEEDBACK_COLUMNS = (
    "user_id",
    "service_listing_id",
    "created_at",
    "user_feedback",
    "distance_meters",
    "price_paise",
    "service_radius_km",
    "service_type",
    "rate_basis",
    "provider_verification_state",
    "capacity_match",
    "crop_match",
    "date_match",
    "cold_chain_match",
    "service_radius_match",
)
MARKET_SERIES_COLUMNS = ("crop", "variety", "state", "district", "market_name")
MARKET_MINIMUM_DATES = 120
LOGISTICS_MINIMUM_LABELS = 300
LOGISTICS_MINIMUM_USERS = 30
LOGISTICS_MINIMUM_LISTINGS = 20
LOGISTICS_MINIMUM_TRAIN_ROWS = 200
LOGISTICS_MINIMUM_EVALUATION_ROWS = 60
IDENTIFIER_PATTERN = re.compile(r"^[a-z_][a-z0-9_]*$")


class ExportError(RuntimeError):
    """Raised when a source dataset cannot be safely exported."""


def pseudonymise_identifier(value: Any, namespace: str, salt: str) -> str:
    """Return a stable, non-reversible identifier for diversity checks."""
    if value is None or str(value).strip() == "":
        return ""
    message = f"{namespace}:{str(value).strip()}".encode("utf-8")
    return hmac.new(salt.encode("utf-8"), message, hashlib.sha256).hexdigest()


class SupabaseRestClient:
    """Small read-only PostgREST client with bounded pages and transient retries."""

    def __init__(
        self, project_url: str, api_key: str, page_size: int = DEFAULT_PAGE_SIZE, timeout: int = 30
    ) -> None:
        parsed = urlsplit(project_url)
        if parsed.scheme not in {"https", "http"} or not parsed.netloc:
            raise ValueError("SUPABASE_URL must be a valid HTTPS project URL.")
        if parsed.scheme != "https" and parsed.hostname not in {"localhost", "127.0.0.1"}:
            raise ValueError("HTTP is allowed only for a local Supabase development project.")
        if parsed.query or parsed.fragment:
            raise ValueError("SUPABASE_URL must not include a query string or fragment.")
        if not api_key.strip():
            raise ValueError("A Supabase secret key is required.")
        if not 1 <= page_size <= MAX_PAGE_SIZE:
            raise ValueError(f"Page size must be between 1 and {MAX_PAGE_SIZE}.")
        if not 5 <= timeout <= 120:
            raise ValueError("Request timeout must be between 5 and 120 seconds.")

        self.project_url = project_url.rstrip("/")
        self.api_key = api_key.strip()
        self.page_size = page_size
        self.timeout = timeout

    def _fetch_page(
        self,
        table: str,
        columns: tuple[str, ...],
        order: str,
        offset: int,
        not_null_column: str | None,
    ) -> list[dict[str, Any]]:
        if not IDENTIFIER_PATTERN.fullmatch(table):
            raise ValueError("Invalid table name.")
        if any(not IDENTIFIER_PATTERN.fullmatch(column) for column in columns):
            raise ValueError("Invalid selected column name.")
        if not IDENTIFIER_PATTERN.fullmatch(order.split(".", 1)[0]):
            raise ValueError("Invalid order column.")
        if not_null_column and not IDENTIFIER_PATTERN.fullmatch(not_null_column):
            raise ValueError("Invalid non-null filter column.")

        query: dict[str, str | int] = {
            "select": ",".join(columns),
            "order": order,
            "limit": self.page_size,
            "offset": offset,
        }
        if not_null_column:
            query[not_null_column] = "not.is.null"

        url = f"{self.project_url}/rest/v1/{quote(table)}?{urlencode(query)}"
        headers = {
            "apikey": self.api_key,
            "Accept": "application/json",
            "User-Agent": "farmess-ml-export/1.0",
        }

        # New sb_secret_* keys are API keys, not JWTs. Legacy service_role
        # JWTs can also be supplied and are accepted as a bearer token.
        if self.api_key.count(".") == 2:
            headers["Authorization"] = f"Bearer {self.api_key}"

        for attempt in range(3):
            request = Request(url, headers=headers, method="GET")
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    payload = json.loads(response.read().decode("utf-8"))
                if not isinstance(payload, list) or any(not isinstance(row, dict) for row in payload):
                    raise ExportError(f"Supabase returned an unexpected response for {table}.")
                return payload
            except HTTPError as error:
                detail = error.read().decode("utf-8", errors="replace")[:500]
                if error.code not in {429, 500, 502, 503, 504} or attempt == 2:
                    raise ExportError(
                        f"Supabase export failed for {table} (HTTP {error.code}): {detail}"
                    ) from error
                retry_after = error.headers.get("Retry-After") if error.headers else None
                try:
                    delay = min(10.0, max(1.0, float(retry_after))) if retry_after else 2**attempt
                except ValueError:
                    delay = 2**attempt
                time.sleep(delay)
            except URLError as error:
                if attempt == 2:
                    raise ExportError(f"Could not reach Supabase while exporting {table}: {error.reason}") from error
                time.sleep(2**attempt)
            except (UnicodeDecodeError, json.JSONDecodeError) as error:
                raise ExportError(f"Supabase returned invalid JSON for {table}.") from error

        raise ExportError(f"Supabase export failed for {table} after retries.")

    def fetch_table(
        self,
        table: str,
        columns: tuple[str, ...],
        order: str,
        not_null_column: str | None = None,
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        offset = 0
        while True:
            page = self._fetch_page(table, columns, order, offset, not_null_column)
            rows.extend(page)
            if len(page) < self.page_size:
                break
            offset += len(page)
        return rows


def _parse_timestamp(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return None
    return parsed.astimezone(timezone.utc)


def _market_readiness(rows: list[dict[str, Any]]) -> dict[str, Any]:
    series_dates: dict[tuple[str, ...], set[date]] = {}
    for row in rows:
        key = tuple(str(row.get(column) or "").strip() for column in MARKET_SERIES_COLUMNS)
        if not key[0] or not key[-1]:
            continue
        try:
            observed_on = date.fromisoformat(str(row.get("observation_date", "")))
        except ValueError:
            continue
        series_dates.setdefault(key, set()).add(observed_on)

    ready_series = sum(len(observed_dates) >= MARKET_MINIMUM_DATES for observed_dates in series_dates.values())
    return {
        "sourceRows": len(rows),
        "usableSeries": len(series_dates),
        "seriesMeetingMinimumHistory": ready_series,
        "minimumUniqueDatedObservationsPerSeries": MARKET_MINIMUM_DATES,
        "readyToTrainAtLeastOneSeries": ready_series > 0,
    }


def _logistics_readiness(rows: list[dict[str, Any]]) -> dict[str, Any]:
    labelled: list[tuple[datetime, str, str, int, int]] = []
    for row in rows:
        try:
            rating = int(row.get("user_feedback"))
        except (TypeError, ValueError, OverflowError):
            continue
        if rating not in {1, 2, 4, 5}:
            continue
        user_id = str(row.get("user_id") or "").strip()
        listing_id = str(row.get("service_listing_id") or "").strip()
        timestamp = _parse_timestamp(row.get("created_at"))
        if not user_id or not listing_id or timestamp is None:
            continue
        label = 0 if rating in {1, 2} else 1
        labelled.append((timestamp, user_id, listing_id, rating, label))

    labelled.sort(key=lambda item: item[0])
    split_at = math.floor(len(labelled) * 0.8)
    train_rows, evaluation_rows = labelled[:split_at], labelled[split_at:]
    train_classes = {row[4] for row in train_rows}
    evaluation_classes = {row[4] for row in evaluation_rows}
    both_classes_in_both_splits = train_classes == {0, 1} and evaluation_classes == {0, 1}

    unique_users = len({row[1] for row in labelled})
    unique_listings = len({row[2] for row in labelled})
    thresholds_met = (
        len(labelled) >= LOGISTICS_MINIMUM_LABELS
        and unique_users >= LOGISTICS_MINIMUM_USERS
        and unique_listings >= LOGISTICS_MINIMUM_LISTINGS
        and len(train_rows) >= LOGISTICS_MINIMUM_TRAIN_ROWS
        and len(evaluation_rows) >= LOGISTICS_MINIMUM_EVALUATION_ROWS
    )

    return {
        "sourceRows": len(rows),
        "usableNonNeutralLabels": len(labelled),
        "positiveLabels": sum(row[4] == 1 for row in labelled),
        "negativeLabels": sum(row[4] == 0 for row in labelled),
        "uniqueUsers": unique_users,
        "uniqueListings": unique_listings,
        "trainingRowsAfterChronologicalSplit": len(train_rows),
        "evaluationRowsAfterChronologicalSplit": len(evaluation_rows),
        "chronologicalSplitContainsBothClasses": both_classes_in_both_splits,
        "minimums": {
            "labels": LOGISTICS_MINIMUM_LABELS,
            "distinctUsers": LOGISTICS_MINIMUM_USERS,
            "distinctListings": LOGISTICS_MINIMUM_LISTINGS,
            "trainingRows": LOGISTICS_MINIMUM_TRAIN_ROWS,
            "evaluationRows": LOGISTICS_MINIMUM_EVALUATION_ROWS,
        },
        "readyToTrainCandidate": thresholds_met and both_classes_in_both_splits,
    }


def write_csv(path: Path, columns: tuple[str, ...], rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    with temporary.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({column: row.get(column) for column in columns})
    temporary.replace(path)


def export_training_data(
    client: SupabaseRestClient, output_dir: Path, pseudonym_salt: str
) -> dict[str, Any]:
    if len(pseudonym_salt.encode("utf-8")) < 32:
        raise ValueError("FARMESS_ML_EXPORT_SALT must contain at least 32 characters.")

    market_rows = client.fetch_table(
        "market_observations",
        MARKET_COLUMNS,
        order="observation_date.asc",
        not_null_column="modal_price_paise_per_quintal",
    )
    feedback_source_rows = client.fetch_table(
        "logistics_recommendation_feedback",
        FEEDBACK_COLUMNS,
        order="created_at.asc",
    )

    # User/provider identifiers are retained only as salted HMACs so the
    # trainer can check diversity without exporting raw database identifiers.
    feedback_rows: list[dict[str, Any]] = []
    for source in feedback_source_rows:
        row = dict(source)
        row["user_id"] = pseudonymise_identifier(row.get("user_id"), "user", pseudonym_salt)
        row["service_listing_id"] = pseudonymise_identifier(
            row.get("service_listing_id"), "listing", pseudonym_salt
        )
        feedback_rows.append(row)

    output_dir.mkdir(parents=True, exist_ok=True)
    market_path = output_dir / "market_observations.csv"
    feedback_path = output_dir / "logistics_recommendation_feedback.csv"
    write_csv(market_path, MARKET_COLUMNS, market_rows)
    write_csv(feedback_path, FEEDBACK_COLUMNS, feedback_rows)

    manifest = {
        "exportVersion": EXPORT_VERSION,
        "createdAtUtc": datetime.now(timezone.utc).isoformat(),
        "sourceProjectHost": urlsplit(client.project_url).hostname,
        "files": {
            market_path.name: {
                "rows": len(market_rows),
                "columns": list(MARKET_COLUMNS),
                "containsDirectIdentifiers": False,
            },
            feedback_path.name: {
                "rows": len(feedback_rows),
                "columns": list(FEEDBACK_COLUMNS),
                "containsDirectIdentifiers": False,
                "identifierHandling": "user_id and service_listing_id replaced with salted HMAC-SHA256 values",
                "freeTextFeedbackExcluded": True,
            },
        },
        "readiness": {
            "marketForecast": _market_readiness(market_rows),
            "logisticsPreferenceRanker": _logistics_readiness(feedback_rows),
        },
        "privacy": {
            "rawUserAndListingIdsExported": False,
            "freeTextFeedbackNotesExported": False,
            "pseudonymisationSaltIncluded": False,
            "databaseWritesPerformed": False,
        },
        "trainingIsAutomaticallyApproved": False,
    }

    manifest_path = output_dir / "manifest.json"
    temporary = manifest_path.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    temporary.replace(manifest_path)
    return manifest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Export privacy-minimised Farmess ML training datasets from Supabase."
    )
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--page-size", type=int, default=DEFAULT_PAGE_SIZE)
    parser.add_argument("--timeout", type=int, default=30)
    args = parser.parse_args(argv)

    project_url = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    api_key = os.getenv("SUPABASE_SECRET_KEY") or os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    pseudonym_salt = os.getenv("FARMESS_ML_EXPORT_SALT")

    if not project_url:
        parser.error("Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) in the process environment.")
    if not api_key:
        parser.error("Set SUPABASE_SECRET_KEY (preferred) or legacy SUPABASE_SERVICE_ROLE_KEY.")
    if not pseudonym_salt or len(pseudonym_salt.encode("utf-8")) < 32:
        parser.error("Set FARMESS_ML_EXPORT_SALT to a private value of at least 32 characters.")

    try:
        client = SupabaseRestClient(project_url, api_key, args.page_size, args.timeout)
        manifest = export_training_data(client, args.output_dir, pseudonym_salt)
    except (ExportError, OSError, ValueError) as error:
        print(f"ML export failed: {error}", file=sys.stderr)
        return 1

    print(json.dumps(manifest["readiness"], indent=2))
    print(f"\nLocal datasets and manifest written to: {args.output_dir.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
