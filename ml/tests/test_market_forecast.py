"""Tests for the offline mandi-price trainer.

Series here are synthetic test fixtures used only to exercise the training
logic. They are never exported, imported or shown as market data.
"""
from __future__ import annotations

import json
import math
import sys
import tempfile
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "market_forecast"))

import train  # noqa: E402

KEY = ("Tomato", "Hybrid", "Jammu and Kashmir", "Jammu", "Narwal")


def fixture_series(
    count: int, end: date, cadence_days: int = 1, noise: float = 0.0
) -> tuple[list[date], list[int]]:
    """Smooth seasonal series with an optional deterministic wiggle."""
    start = end - timedelta(days=cadence_days * (count - 1))
    dates = [start + timedelta(days=cadence_days * i) for i in range(count)]
    prices = [
        int(200_000 + 30_000 * math.sin(i / 9.0) + 400 * i + noise * ((i * 37) % 11 - 5))
        for i in range(count)
    ]
    return dates, prices


class MakeFeaturesTest(unittest.TestCase):
    def test_gap_feature_reflects_calendar_days(self) -> None:
        history = [float(v) for v in range(100, 100 + train.LOOKBACK)]
        last = date(2026, 11, 1)
        one_day = train.make_features(history, last, last + timedelta(days=1), date(2026, 1, 1))
        five_days = train.make_features(history, last, last + timedelta(days=5), date(2026, 1, 1))
        self.assertEqual(one_day[-1], 1.0)
        self.assertEqual(five_days[-1], 5.0)

    def test_target_must_follow_history(self) -> None:
        history = [1.0] * train.LOOKBACK
        last = date(2026, 11, 1)
        with self.assertRaises(ValueError):
            train.make_features(history, last, last, date(2026, 1, 1))

    def test_requires_lookback_history(self) -> None:
        with self.assertRaises(ValueError):
            train.make_features([1.0] * (train.LOOKBACK - 1), date(2026, 1, 2), date(2026, 1, 3), date(2026, 1, 1))


class TrainOneSeriesTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.output = Path(self._tmp.name)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_insufficient_history_is_never_a_candidate(self) -> None:
        as_of = date(2026, 11, 24)
        dates, prices = fixture_series(train.MINIMUM_OBSERVATIONS - 1, as_of)
        manifest = train.train_one_series(KEY, dates, prices, self.output, 7, as_of)
        self.assertEqual(manifest["approvalStatus"], "insufficient_data")
        self.assertFalse(manifest["automaticallyApproved"])

    def test_stale_series_is_rejected_without_forecast(self) -> None:
        as_of = date(2026, 11, 24)
        dates, prices = fixture_series(160, as_of - timedelta(days=train.MAX_ORIGIN_AGE_DAYS + 1))
        manifest = train.train_one_series(KEY, dates, prices, self.output, 7, as_of)
        self.assertEqual(manifest["approvalStatus"], "stale_data")
        series_dir = self.output / train.safe_component("|".join(KEY))
        self.assertFalse((series_dir / "forecast_points.json").exists())

    def test_future_dated_observations_are_rejected(self) -> None:
        as_of = date(2026, 11, 24)
        dates, prices = fixture_series(160, as_of + timedelta(days=2))
        manifest = train.train_one_series(KEY, dates, prices, self.output, 7, as_of)
        self.assertEqual(manifest["approvalStatus"], "rejected")

    def test_evaluated_series_reports_every_horizon_and_publishes_future_dates(self) -> None:
        as_of = date(2026, 11, 24)
        last_observation = as_of - timedelta(days=2)
        dates, prices = fixture_series(170, last_observation, noise=900.0)
        manifest = train.train_one_series(KEY, dates, prices, self.output, 7, as_of)

        self.assertIn(manifest["approvalStatus"], {"candidate", "rejected"})
        self.assertFalse(manifest["automaticallyApproved"])
        self.assertGreaterEqual(manifest["trainingObservationCount"], train.MINIMUM_TRAINING_OBSERVATIONS)

        evaluation = manifest["evaluation"]
        self.assertEqual([item["step"] for item in evaluation["perHorizon"]], list(range(1, 8)))
        expected_pass = all(
            item["modelMaePaisePerQuintal"] < item["baselineMaePaisePerQuintal"]
            and item["modelSmapePercent"] < item["baselineSmapePercent"]
            for item in evaluation["perHorizon"]
        )
        self.assertEqual(evaluation["beatsBaselineAtEveryHorizon"], expected_pass)
        self.assertEqual(manifest["approvalStatus"] == "candidate", expected_pass)

        series_dir = self.output / train.safe_component("|".join(KEY))
        points = json.loads((series_dir / "forecast_points.json").read_text(encoding="utf-8"))
        self.assertEqual(len(points), 7)
        targets = [date.fromisoformat(point["targetDate"]) for point in points]
        self.assertEqual(targets[0], as_of + timedelta(days=1))
        self.assertEqual(targets, [targets[0] + timedelta(days=i) for i in range(7)])
        for point in points:
            self.assertLessEqual(point["lowerBoundPaisePerQuintal"], point["predictedModalPricePaisePerQuintal"])
            self.assertGreaterEqual(point["upperBoundPaisePerQuintal"], point["predictedModalPricePaisePerQuintal"])
            self.assertGreaterEqual(point["lowerBoundPaisePerQuintal"], 1.0)


class WalkForwardLeakageTest(unittest.TestCase):
    def test_holdout_forecasts_ignore_values_after_the_origin(self) -> None:
        dates, prices = fixture_series(150, date(2026, 11, 20), noise=500.0)
        split_at = 120
        x = [
            train.make_features(prices[:i], dates[i - 1], dates[i], dates[0])
            for i in range(train.LOOKBACK, split_at)
        ]
        y = [float(prices[i]) for i in range(train.LOOKBACK, split_at)]
        model = train.HistGradientBoostingRegressor(random_state=0, max_iter=30)
        model.fit(train.np.asarray(x), train.np.asarray(y))

        origin = 130
        base = train.recursive_forecast(
            model, [float(p) for p in prices[:origin]], dates[:origin], dates[origin : origin + 3], dates[0]
        )
        tampered = list(prices)
        tampered[origin:] = [1] * (len(prices) - origin)
        again = train.recursive_forecast(
            model, [float(p) for p in tampered[:origin]], dates[:origin], dates[origin : origin + 3], dates[0]
        )
        self.assertEqual(base, again)


if __name__ == "__main__":
    unittest.main()
