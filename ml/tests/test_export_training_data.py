from __future__ import annotations

import csv
import json
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from export_training_data import (  # noqa: E402
    FEEDBACK_COLUMNS,
    MARKET_COLUMNS,
    SupabaseRestClient,
    _logistics_readiness,
    _market_readiness,
    pseudonymise_identifier,
    write_csv,
)


class FakeResponse:
    def __init__(self, payload: list[dict[str, object]]) -> None:
        self.payload = payload

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")


class ExportTrainingDataTests(unittest.TestCase):
    def test_pseudonymised_ids_are_stable_and_namespaced(self) -> None:
        salt = "a-private-export-salt-with-at-least-32-chars"
        first = pseudonymise_identifier("source-id-123", "user", salt)
        repeated = pseudonymise_identifier("source-id-123", "user", salt)
        listing = pseudonymise_identifier("source-id-123", "listing", salt)

        self.assertEqual(first, repeated)
        self.assertNotEqual(first, listing)
        self.assertNotIn("source-id-123", first)
        self.assertEqual(len(first), 64)

    def test_market_readiness_counts_unique_dates_per_series(self) -> None:
        first_day = date(2026, 1, 1)
        rows = [
            {
                "crop": "wheat",
                "variety": "",
                "state": "Jammu and Kashmir",
                "district": "Jammu",
                "market_name": "Example mandi",
                "observation_date": (first_day + timedelta(days=offset)).isoformat(),
            }
            for offset in range(119)
        ]
        # Two duplicate rows must not make 119 unique days look like 120.
        rows.extend([dict(rows[0]), dict(rows[0])])
        readiness = _market_readiness(rows)
        self.assertEqual(readiness["usableSeries"], 1)
        self.assertEqual(readiness["seriesMeetingMinimumHistory"], 0)
        self.assertFalse(readiness["readyToTrainAtLeastOneSeries"])

    def test_empty_logistics_dataset_is_not_ready(self) -> None:
        result = _logistics_readiness([])
        self.assertEqual(result["usableNonNeutralLabels"], 0)
        self.assertFalse(result["readyToTrainCandidate"])

    def test_rest_client_paginates_and_uses_secret_key_only_as_api_key(self) -> None:
        requests = []

        def fake_urlopen(request, timeout):
            requests.append(request)
            query = parse_qs(urlsplit(request.full_url).query)
            offset = int(query["offset"][0])
            if offset == 0:
                return FakeResponse([{"crop": "wheat"}, {"crop": "rice"}])
            return FakeResponse([{"crop": "maize"}])

        client = SupabaseRestClient(
            "https://example-project.supabase.co",
            "sb_secret_test_key",
            page_size=2,
        )
        with patch("export_training_data.urlopen", side_effect=fake_urlopen):
            rows = client.fetch_table(
                "market_observations", MARKET_COLUMNS, order="observation_date.asc"
            )

        self.assertEqual(len(rows), 3)
        self.assertEqual([parse_qs(urlsplit(r.full_url).query)["offset"][0] for r in requests], ["0", "2"])
        self.assertEqual(requests[0].get_header("Apikey"), "sb_secret_test_key")
        self.assertIsNone(requests[0].get_header("Authorization"))
        self.assertNotIn("sb_secret_test_key", requests[0].full_url)

    def test_csv_writer_keeps_to_the_allowlisted_columns(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_dir:
            path = Path(temporary_dir) / "feedback.csv"
            write_csv(
                path,
                FEEDBACK_COLUMNS,
                [
                    {
                        "user_id": "pseudonym",
                        "service_listing_id": "listing-pseudonym",
                        "user_feedback": 5,
                        "feedback_note": "private free text must not be exported",
                    }
                ],
            )
            with path.open("r", encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))

        self.assertEqual(rows[0]["user_id"], "pseudonym")
        self.assertNotIn("feedback_note", rows[0])
        self.assertEqual(rows[0]["user_feedback"], "5")


if __name__ == "__main__":
    unittest.main()
