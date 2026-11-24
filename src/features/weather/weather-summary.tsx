"use client";

import { useEffect, useState } from "react";

type WeatherSnapshot = {
  current: {
    temperatureC: number | null;
    relativeHumidityPercent: number | null;
    windSpeedKmh: number | null;
    description: string;
  };
  nextSixHoursMaximumPrecipitationProbabilityPercent: number | null;
  timezone: string | null;
  attributionUrl: string;
};

function valueWithUnit(value: number | null, unit: string): string {
  return value === null ? "Unavailable" : String(Math.round(value)) + " " + unit;
}

export function WeatherSummary({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadWeather() {
      setLoading(true);
      setError("");
      setWeather(null);
      const params = new URLSearchParams({
        lat: String(latitude),
        lng: String(longitude),
      });

      try {
        const response = await fetch("/api/weather/forecast?" + params.toString(), {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = (await response.json()) as WeatherSnapshot | { error?: string };
        if (!response.ok || !("current" in result)) {
          throw new Error("error" in result ? result.error : "Weather data is unavailable.");
        }
        setWeather(result);
      } catch (loadError) {
        if (controller.signal.aborted) return;
        setError(
          loadError instanceof Error ? loadError.message : "Weather data is unavailable.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadWeather();
    return () => controller.abort();
  }, [latitude, longitude]);

  return (
    <section className="panel weather-summary" aria-labelledby="weather-summary-heading">
      <div className="weather-summary-heading">
        <div>
          <h2 id="weather-summary-heading">Weather near this search</h2>
          <p>Forecast context for planning; not a storage or transport safety guarantee.</p>
        </div>
      </div>

      {loading ? <p role="status">Loading weather context…</p> : null}
      {error ? <p className="form-help" role="status">{error}</p> : null}

      {weather ? (
        <>
          <div className="weather-summary-values">
            <div>
              <span>Conditions</span>
              <strong>{weather.current.description}</strong>
            </div>
            <div>
              <span>Temperature</span>
              <strong>{valueWithUnit(weather.current.temperatureC, "°C")}</strong>
            </div>
            <div>
              <span>Rain chance · next 6 hours</span>
              <strong>
                {weather.nextSixHoursMaximumPrecipitationProbabilityPercent === null
                  ? "Unavailable"
                  : String(Math.round(weather.nextSixHoursMaximumPrecipitationProbabilityPercent)) + "%"}
              </strong>
            </div>
            <div>
              <span>Wind</span>
              <strong>{valueWithUnit(weather.current.windSpeedKmh, "km/h")}</strong>
            </div>
          </div>
          <p className="weather-summary-attribution">
            Weather data by{" "}
            <a href={weather.attributionUrl} target="_blank" rel="noreferrer">
              Open-Meteo
            </a>
            {weather.timezone ? " · " + weather.timezone : ""}
          </p>
        </>
      ) : null}
    </section>
  );
}
