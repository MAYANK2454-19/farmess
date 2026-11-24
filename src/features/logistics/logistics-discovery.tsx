"use client";

import { useState, type FormEvent } from "react";
import type { Database } from "@/lib/supabase/database.types";
import type {
  LogisticsRecommendation,
  NearbyServiceCandidate,
} from "@/features/logistics/recommendations";
import { LogisticsMap } from "@/features/logistics/logistics-map";
import { LogisticsFeedbackForm } from "@/features/logistics/logistics-feedback-form";

type Origin = { latitude: number; longitude: number };
type ServiceRequest = Pick<
  Database["public"]["Tables"]["service_requests"]["Row"],
  "id" | "listing_id" | "status" | "created_at"
>;

const RATE_LABELS: Record<string, string> = {
  per_trip: "per trip",
  per_km: "per km",
  per_kg: "per kg",
  per_quintal: "per quintal",
  per_tonne: "per tonne",
  per_day: "per day",
  fixed: "fixed charge",
  quote_required: "quote required",
};

function formatPrice(value: number | null, basis: string) {
  if (value === null) return "Ask provider for a quote";
  const amount = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value / 100);
  return `${amount} ${RATE_LABELS[basis] ?? basis.replaceAll("_", " ")}`;
}

function formatDistance(meters: number) {
  return meters >= 1000
    ? `${(meters / 1000).toFixed(1)} km straight-line`
    : `${Math.round(meters)} m straight-line`;
}

function ProviderRequestForm({
  listing,
  onSent,
}: {
  listing: NearbyServiceCandidate;
  onSent: (request: ServiceRequest) => void;
}) {
  const [originArea, setOriginArea] = useState("");
  const [destinationArea, setDestinationArea] = useState(listing.destination_area ?? "");
  const [date, setDate] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("quintal");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const requestedQuantity = quantity.trim() ? Number(quantity) : null;
    if (
      requestedQuantity !== null &&
      (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0)
    ) {
      setError("Enter a positive quantity.");
      setPending(false);
      return;
    }

    try {
      const response = await fetch("/api/service-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          listing_id: listing.id,
          origin_area: originArea.trim() || null,
          destination_area: destinationArea.trim() || null,
          requested_date: date || null,
          requested_quantity: requestedQuantity,
          unit: requestedQuantity === null ? null : unit,
          message: message.trim() || null,
        }),
      });
      const result = (await response.json()) as {
        request?: ServiceRequest;
        error?: string;
      };

      if (!response.ok || !result.request) {
        throw new Error(result.error ?? "Your service request could not be sent.");
      }
      onSent(result.request);
      setSent(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Your service request could not be sent.",
      );
    } finally {
      setPending(false);
    }
  }

  if (sent) {
    return (
      <p className="form-success provider-request-sent" role="status">
        Request sent. The provider must confirm availability before this becomes a booking.
      </p>
    );
  }

  return (
    <details className="provider-request-details">
      <summary>Request this service</summary>
      <form className="provider-request-form" onSubmit={submit}>
        <label className="form-field">
          <span className="form-label">Collection / origin area</span>
          <input
            className="form-control"
            value={originArea}
            onChange={(event) => setOriginArea(event.target.value)}
            maxLength={160}
            placeholder="Village or market area"
          />
        </label>
        <label className="form-field">
          <span className="form-label">Destination area</span>
          <input
            className="form-control"
            value={destinationArea}
            onChange={(event) => setDestinationArea(event.target.value)}
            maxLength={160}
            placeholder="Delivery area"
          />
        </label>
        <label className="form-field">
          <span className="form-label">Requested date</span>
          <input
            className="form-control"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </label>
        <div className="form-field">
          <span className="form-label">Quantity (optional)</span>
          <div className="service-quantity">
            <input
              className="form-control"
              inputMode="decimal"
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              placeholder="Quantity"
            />
            <select
              className="form-control"
              value={unit}
              onChange={(event) => setUnit(event.target.value)}
              aria-label="Quantity unit"
            >
              <option value="kg">kg</option>
              <option value="quintal">quintal</option>
              <option value="tonne">tonne</option>
            </select>
          </div>
        </div>
        <label className="form-field provider-request-message">
          <span className="form-label">Message (optional)</span>
          <textarea
            className="form-control"
            rows={3}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={1000}
            placeholder="Add details the provider needs to assess your request"
          />
        </label>
        {error ? (
          <p className="form-alert" role="alert">
            {error}
          </p>
        ) : null}
        <button className="button button-primary" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send service request"}
        </button>
      </form>
    </details>
  );
}

function RecommendationCard({
  recommendation,
  onRequestSent,
  rankPosition,
}: {
  recommendation: LogisticsRecommendation;
  onRequestSent: (request: ServiceRequest) => void;
  rankPosition: number;
}) {
  const listing = recommendation.listing;
  const statusLabel =
    recommendation.status === "recommended"
      ? "Recommended by rules"
      : recommendation.status === "needs_confirmation"
        ? "More details needed"
        : recommendation.status === "excluded"
          ? "Not suitable"
          : "Eligible option";

  return (
    <article className={"logistics-result logistics-result-" + recommendation.status}>
      <div className="logistics-result-heading">
        <div>
          <p className="eyebrow">
            {listing.service_type === "transport" ? "Transport" : "Storage"} · {statusLabel}
          </p>
          <h3>{listing.title}</h3>
          <p className="logistics-result-area">
            {listing.service_area}
            {listing.destination_area ? ` → ${listing.destination_area}` : ""}
          </p>
        </div>
        <div className="logistics-result-score">
          <strong>{Math.round(recommendation.score)}</strong>
          <span>rules score / 100</span>
        </div>
      </div>

      <div className="logistics-result-facts">
        <div>
          <span>Distance</span>
          <strong>{formatDistance(listing.distance_meters)}</strong>
        </div>
        <div>
          <span>Rate</span>
          <strong>{formatPrice(listing.price_paise, listing.rate_basis)}</strong>
        </div>
        <div>
          <span>Verification</span>
          <strong>{listing.verification_state.replaceAll("_", " ")}</strong>
        </div>
        <div>
          <span>Capacity</span>
          <strong>
            {listing.capacity_quantity !== null
              ? `${listing.capacity_quantity} ${listing.capacity_unit ?? ""}`
              : "Not specified"}
          </strong>
        </div>
      </div>

      {recommendation.reasons.length ? (
        <div className="logistics-explanation">
          <strong>Why it appears</strong>
          <ul>
            {recommendation.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {recommendation.unknowns.length ? (
        <div className="logistics-unknowns">
          <strong>Confirm before choosing</strong>
          <ul>
            {recommendation.unknowns.map((unknown) => (
              <li key={unknown}>{unknown}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="logistics-result-footer">
        <span>{recommendation.completenessPercent}% of ranking inputs available</span>
        <a
          href={`https://www.openstreetmap.org/?mlat=${listing.latitude}&mlon=${listing.longitude}#map=14/${listing.latitude}/${listing.longitude}`}
          target="_blank"
          rel="noreferrer"
          className="text-link"
        >
          Open provider pin in OpenStreetMap
        </a>
      </div>

      {recommendation.status !== "excluded" ? (
        <ProviderRequestForm listing={listing} onSent={onRequestSent} />
      ) : null}
      <LogisticsFeedbackForm listing={listing} rankPosition={rankPosition} />
      <p className="logistics-result-disclaimer">
        Straight-line distance only. Price bases differ and are not directly comparable unless their
        units match. A request is not a confirmed booking.
      </p>
    </article>
  );
}

export function LogisticsDiscovery() {
  const [origin, setOrigin] = useState<Origin | null>(null);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [locationMessage, setLocationMessage] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [radiusKm, setRadiusKm] = useState("25");
  const [crop, setCrop] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("quintal");
  const [requiredDate, setRequiredDate] = useState("");
  const [coldChain, setColdChain] = useState(false);
  const [recommendations, setRecommendations] = useState<LogisticsRecommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");
  const [requestMessage, setRequestMessage] = useState("");

  function useCurrentLocation() {
    setError("");
    setLocationMessage("Requesting your location permission…");

    if (!navigator.geolocation) {
      setLocationMessage(
        "This browser does not support location sharing. Enter coordinates manually.",
      );
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const next = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setOrigin(next);
        setLatitude(next.latitude.toFixed(6));
        setLongitude(next.longitude.toFixed(6));
        setLocationMessage(
          "Location received. It will be used for this search and is not saved to your profile.",
        );
      },
      (positionError) => {
        setLocationMessage(
          positionError.code === positionError.PERMISSION_DENIED
            ? "Location permission was not granted. You can enter service-search coordinates manually."
            : "Could not read your location. Try again or enter coordinates manually.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
    );
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setRequestMessage("");

    const lat = Number(latitude);
    const lng = Number(longitude);
    const radius = Number(radiusKm);
    const requiredQuantity = quantity.trim() ? Number(quantity) : null;

    if (
      !Number.isFinite(lat) ||
      lat < -90 ||
      lat > 90 ||
      !Number.isFinite(lng) ||
      lng < -180 ||
      lng > 180
    ) {
      setError("Enter valid latitude and longitude, or use your current location.");
      return;
    }
    if (!Number.isFinite(radius) || radius < 0.5 || radius > 100) {
      setError("Choose a radius between 0.5 and 100 km.");
      return;
    }
    if (
      requiredQuantity !== null &&
      (!Number.isFinite(requiredQuantity) || requiredQuantity <= 0)
    ) {
      setError("Enter a valid positive quantity.");
      return;
    }

    const nextOrigin = { latitude: lat, longitude: lng };
    setOrigin(nextOrigin);
    setLoading(true);
    setSearched(true);

    const params = new URLSearchParams({
      lat: String(lat),
      lng: String(lng),
      radiusKm: String(radius),
      coldChain: String(coldChain),
    });
    if (serviceType) params.set("serviceType", serviceType);
    if (crop.trim()) params.set("crop", crop.trim());
    if (requiredQuantity !== null) {
      params.set("quantity", String(requiredQuantity));
      params.set("unit", unit);
    }
    if (requiredDate) params.set("date", requiredDate);

    try {
      const response = await fetch(`/api/logistics/discover?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as {
        recommendations?: LogisticsRecommendation[];
        error?: string;
      };
      if (!response.ok) throw new Error(result.error ?? "Local services could not be found.");
      setRecommendations(result.recommendations ?? []);
    } catch (searchError) {
      setError(
        searchError instanceof Error ? searchError.message : "Local services could not be found.",
      );
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  }

  function onRequestSent() {
    setRequestMessage(
      "Your service request was sent. The provider still needs to confirm availability.",
    );
  }

  return (
    <section className="logistics-discovery" aria-labelledby="logistics-discovery-heading">
      <div className="logistics-discovery-intro">
        <p className="eyebrow">Locality-based support</p>
        <h2 id="logistics-discovery-heading">Find transport and storage near a location</h2>
        <p>
          Search Farmess provider listings by distance, service type, crop, quantity, date and
          cold-chain need. Location access is optional and starts only when you press the location
          button.
        </p>
      </div>

      <form className="panel logistics-search-form" onSubmit={search}>
        <div className="logistics-location-control">
          <div>
            <strong>Search origin</strong>
            <p>
              Your coordinates are sent to Farmess for this search only. They are not written to
              your profile or shown to providers.
            </p>
          </div>
          <button type="button" className="button button-secondary" onClick={useCurrentLocation}>
            Use my current location
          </button>
        </div>
        {locationMessage ? (
          <p className="form-help" role="status">
            {locationMessage}
          </p>
        ) : null}

        <div className="form-grid">
          <label className="form-field">
            <span className="form-label">Latitude</span>
            <input
              className="form-control"
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              inputMode="decimal"
              placeholder="e.g. 32.7266"
              required
            />
          </label>
          <label className="form-field">
            <span className="form-label">Longitude</span>
            <input
              className="form-control"
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              inputMode="decimal"
              placeholder="e.g. 74.8570"
              required
            />
          </label>
          <label className="form-field">
            <span className="form-label">Search radius</span>
            <select
              className="form-control"
              value={radiusKm}
              onChange={(event) => setRadiusKm(event.target.value)}
            >
              <option value="5">5 km</option>
              <option value="10">10 km</option>
              <option value="25">25 km</option>
              <option value="50">50 km</option>
              <option value="100">100 km</option>
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Service type</span>
            <select
              className="form-control"
              value={serviceType}
              onChange={(event) => setServiceType(event.target.value)}
            >
              <option value="">Transport and storage</option>
              <option value="transport">Transport</option>
              <option value="storage">Storage</option>
            </select>
          </label>
          <label className="form-field">
            <span className="form-label">Crop (optional)</span>
            <input
              className="form-control"
              value={crop}
              onChange={(event) => setCrop(event.target.value)}
              maxLength={80}
              placeholder="e.g. Tomato"
            />
          </label>
          <div className="form-field">
            <span className="form-label">Quantity (optional)</span>
            <div className="service-quantity">
              <input
                className="form-control"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="Quantity"
              />
              <select
                className="form-control"
                value={unit}
                onChange={(event) => setUnit(event.target.value)}
                aria-label="Quantity unit"
              >
                <option value="kg">kg</option>
                <option value="quintal">quintal</option>
                <option value="tonne">tonne</option>
              </select>
            </div>
          </div>
          <label className="form-field">
            <span className="form-label">Required date (optional)</span>
            <input
              className="form-control"
              type="date"
              value={requiredDate}
              onChange={(event) => setRequiredDate(event.target.value)}
            />
          </label>
          <label className="form-field logistics-cold-chain">
            <span className="form-label">Storage / transport requirements</span>
            <span className="service-checkbox-row">
              <input
                type="checkbox"
                checked={coldChain}
                onChange={(event) => setColdChain(event.target.checked)}
              />
              <span>Cold-chain service required</span>
            </span>
          </label>
        </div>
        {error ? (
          <p className="form-alert" role="alert">
            {error}
          </p>
        ) : null}
        {requestMessage ? (
          <p className="form-success" role="status">
            {requestMessage}
          </p>
        ) : null}
        <div className="form-footer">
          <p className="form-warning">
            Map pins only show provider locations that have been explicitly published by the
            provider.
          </p>
          <button type="submit" className="button button-primary" disabled={loading}>
            {loading ? "Searching nearby services…" : "Find local support"}
          </button>
        </div>
      </form>

      {searched && origin ? (
        <>
          <LogisticsMap origin={origin} recommendations={recommendations} />
          <section className="logistics-results" aria-labelledby="logistics-results-heading">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Search results</p>
                <h2 id="logistics-results-heading">Provider options within {radiusKm} km</h2>
                <p>
                  {recommendations.length} Farmess listing(s) found. Distance is straight-line, not
                  road distance.
                </p>
              </div>
            </div>
            {recommendations.length === 0 ? (
              <div className="panel empty-state">
                <h3 className="empty-title">No mapped provider listings in this area</h3>
                <p className="empty-copy">
                  Try a wider search radius or remove a requirement. A provider only appears on this
                  map when they have published service coordinates.
                </p>
              </div>
            ) : (
              <div className="logistics-results-list">
                {recommendations.map((recommendation, index) => (
                  <RecommendationCard
                    key={recommendation.listing.id}
                    recommendation={recommendation}
                    onRequestSent={onRequestSent}
                    rankPosition={index + 1}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </section>
  );
}
