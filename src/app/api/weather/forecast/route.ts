import { NextRequest, NextResponse } from "next/server";
import { getFarmessSession } from "@/lib/auth/session";
import { nextSixHourMaxPrecipitationProbability } from "@/lib/weather/forecast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type WeatherPayload = {
  current?: {
    time?: unknown;
    temperature_2m?: unknown;
    relative_humidity_2m?: unknown;
    precipitation?: unknown;
    weather_code?: unknown;
    wind_speed_10m?: unknown;
  };
  hourly?: {
    time?: unknown;
    precipitation_probability?: unknown;
  };
  timezone?: unknown;
};

function parseCoordinate(
  value: string | null,
  minimum: number,
  maximum: number,
): number | null {
  if (value === null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function weatherDescription(code: number | null): string {
  if (code === null) return "Conditions unavailable";
  if (code === 0) return "Clear";
  if (code === 1) return "Mainly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Overcast";
  if (code === 45 || code === 48) return "Fog";
  if (code >= 51 && code <= 57) return "Drizzle";
  if (code >= 61 && code <= 67) return "Rain";
  if (code >= 71 && code <= 77) return "Snow";
  if (code >= 80 && code <= 82) return "Rain showers";
  if (code >= 85 && code <= 86) return "Snow showers";
  if (code >= 95) return "Thunderstorm";
  return "Variable conditions";
}

export async function GET(request: NextRequest) {
  const session = await getFarmessSession();
  if (!session) {
    return NextResponse.json(
      { error: "Sign in to view weather for a selected locality." },
      { status: 401 },
    );
  }
  if (session.role !== "farmer") {
    return NextResponse.json(
      { error: "Local weather context is available to farmer accounts." },
      { status: 403 },
    );
  }

  const latitude = parseCoordinate(
    request.nextUrl.searchParams.get("lat"),
    -90,
    90,
  );
  const longitude = parseCoordinate(
    request.nextUrl.searchParams.get("lng"),
    -180,
    180,
  );
  if (latitude === null || longitude === null) {
    return NextResponse.json(
      { error: "Provide valid coordinates for the selected locality." },
      { status: 400 },
    );
  }

  const customerKey = process.env.OPEN_METEO_CUSTOMER_API_KEY?.trim();
  const isVercelProduction = process.env.VERCEL_ENV === "production";

  // Open-Meteo's public endpoint is for non-commercial evaluation only.
  // Require a paid customer key for Vercel production deployments.
  if (isVercelProduction && !customerKey) {
    return NextResponse.json(
      {
        error:
          "Weather forecasts are not enabled for this production deployment.",
      },
      { status: 503 },
    );
  }

  const endpoint = customerKey
    ? "https://customer-api.open-meteo.com/v1/forecast"
    : "https://api.open-meteo.com/v1/forecast";
  const url = new URL(endpoint);
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m",
  );
  url.searchParams.set("hourly", "precipitation_probability");
  url.searchParams.set("forecast_days", "1");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("precipitation_unit", "mm");
  url.searchParams.set("timezone", "auto");
  if (customerKey) url.searchParams.set("apikey", customerKey);

  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 900 },
      signal: AbortSignal.timeout(8_000),
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: "Weather data is temporarily unavailable." },
        { status: 503 },
      );
    }

    const payload = (await response.json()) as WeatherPayload;
    const current = payload.current;
    if (!current || typeof current.time !== "string") {
      return NextResponse.json(
        { error: "The weather provider returned an unsupported response." },
        { status: 502 },
      );
    }
    const currentTime = current.time;

    const times = Array.isArray(payload.hourly?.time)
      ? payload.hourly.time
      : [];
    const probabilities = Array.isArray(
      payload.hourly?.precipitation_probability,
    )
      ? payload.hourly.precipitation_probability
      : [];
    const nextSixHoursMaximumPrecipitationProbabilityPercent =
      nextSixHourMaxPrecipitationProbability(times, probabilities, currentTime);
    const weatherCode = finiteNumber(current.weather_code);

    return NextResponse.json(
      {
        current: {
          observedAt: current.time,
          temperatureC: finiteNumber(current.temperature_2m),
          relativeHumidityPercent: finiteNumber(current.relative_humidity_2m),
          precipitationMm: finiteNumber(current.precipitation),
          windSpeedKmh: finiteNumber(current.wind_speed_10m),
          weatherCode,
          description: weatherDescription(weatherCode),
        },
        nextSixHoursMaximumPrecipitationProbabilityPercent,
        timezone: typeof payload.timezone === "string" ? payload.timezone : null,
        source: "Open-Meteo",
        attributionUrl: "https://open-meteo.com/",
        forecastUse:
          "Context only; not a guarantee of local weather or storage suitability.",
      },
      { headers: { "Cache-Control": "private, max-age=900" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Weather data is temporarily unavailable." },
      { status: 503 },
    );
  }
}
