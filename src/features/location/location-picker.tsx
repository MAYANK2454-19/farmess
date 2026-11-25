"use client";

import { useState } from "react";
import { INDIA_STATES, districtsForState, isValidPincode } from "@/lib/location/india";

export type LocationValue = {
  state: string | null;
  district: string | null;
  pincode: string | null;
  latitude: number | null;
  longitude: number | null;
  source: "gps" | "pincode" | "manual" | null;
};

export const EMPTY_LOCATION: LocationValue = {
  state: null,
  district: null,
  pincode: null,
  latitude: null,
  longitude: null,
  source: null,
};

type PincodePlace = {
  pincode: string;
  state: string;
  district: string;
  postOffices: string[];
  latitude: number | null;
  longitude: number | null;
};

type ReversePlace = {
  state: string | null;
  district: string | null;
  pincode: string | null;
  locality: string | null;
  latitude: number;
  longitude: number;
};

export function describeLocation(value: LocationValue): string | null {
  const parts = [value.district, value.state].filter(Boolean);
  if (parts.length === 0) return null;
  return parts.join(", ") + (value.pincode ? ` — ${value.pincode}` : "");
}

export function LocationPicker({
  value,
  onChange,
  idPrefix = "location",
}: {
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  idPrefix?: string;
}) {
  const [pinInput, setPinInput] = useState(value.pincode ?? "");
  const [busy, setBusy] = useState<"gps" | "pin" | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [postOffices, setPostOffices] = useState<string[]>([]);

  const districts = value.state ? [...districtsForState(value.state)] : [];
  if (value.district && !districts.includes(value.district)) districts.unshift(value.district);

  async function lookupPin(pin: string) {
    if (!isValidPincode(pin)) {
      setError("Enter a 6-digit PIN code that does not start with 0.");
      return;
    }
    setBusy("pin");
    setError("");
    setNote("");
    try {
      const response = await fetch(`/api/location/pincode?pin=${encodeURIComponent(pin)}`);
      const result = (await response.json()) as { place?: PincodePlace; error?: string };
      if (!response.ok || !result.place) throw new Error(result.error ?? "PIN lookup failed.");
      const place = result.place;
      if (value.state && value.state !== place.state) {
        setNote(`PIN ${pin} is in ${place.district}, ${place.state} — state and district updated.`);
      } else {
        setNote(`PIN ${pin} confirmed by India Post: ${place.district}, ${place.state}.`);
      }
      setPostOffices(place.postOffices);
      onChange({
        state: place.state,
        district: place.district,
        pincode: place.pincode,
        latitude: place.latitude,
        longitude: place.longitude,
        source: place.latitude !== null ? "pincode" : "manual",
      });
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "PIN lookup failed.");
    } finally {
      setBusy(null);
    }
  }

  function useDeviceLocation() {
    if (!("geolocation" in navigator)) {
      setError("This browser cannot share location. Choose state, district and PIN instead.");
      return;
    }
    setBusy("gps");
    setError("");
    setNote("");
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const response = await fetch(
            `/api/location/reverse?lat=${latitude.toFixed(5)}&lng=${longitude.toFixed(5)}`,
          );
          const result = (await response.json()) as { place?: ReversePlace; error?: string };
          if (!response.ok || !result.place) {
            throw new Error(result.error ?? "Location could not be matched to a place.");
          }
          const place = result.place;
          setPinInput(place.pincode ?? "");
          setPostOffices([]);
          setNote(
            `Detected near ${[place.locality, place.district, place.state].filter(Boolean).join(", ")}` +
              " (saved to about 1 km, never your exact position).",
          );
          onChange({
            state: place.state,
            district: place.district,
            pincode: place.pincode,
            latitude: place.latitude,
            longitude: place.longitude,
            source: "gps",
          });
        } catch (gpsError) {
          setError(gpsError instanceof Error ? gpsError.message : "Location lookup failed.");
        } finally {
          setBusy(null);
        }
      },
      (geoError) => {
        setBusy(null);
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Location permission was not given. Choose state, district and PIN instead."
            : "Your device could not find its location. Choose state, district and PIN instead.",
        );
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  return (
    <div className="location-picker">
      <div className="location-picker-gps">
        <button
          type="button"
          className="button button-secondary"
          onClick={useDeviceLocation}
          disabled={busy !== null}
        >
          <span aria-hidden="true">📍</span>
          {busy === "gps" ? "Finding your location…" : "Use my current location"}
        </button>
        <span className="form-help">Only when you tap. Saved to about 1 km.</span>
      </div>

      <div className="location-picker-grid">
        <label className="form-field">
          <span className="form-label">State / UT</span>
          <select
            id={`${idPrefix}-state`}
            className="form-control"
            value={value.state ?? ""}
            onChange={(event) => {
              const state = event.target.value || null;
              setNote("");
              setPostOffices([]);
              onChange({
                ...value,
                state,
                district: state && value.state === state ? value.district : null,
                latitude: null,
                longitude: null,
                source: state ? "manual" : null,
              });
            }}
          >
            <option value="">Select state</option>
            {INDIA_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span className="form-label">District</span>
          <select
            id={`${idPrefix}-district`}
            className="form-control"
            value={value.district ?? ""}
            disabled={!value.state}
            onChange={(event) =>
              onChange({
                ...value,
                district: event.target.value || null,
                latitude: value.source === "manual" ? null : value.latitude,
                longitude: value.source === "manual" ? null : value.longitude,
              })
            }
          >
            <option value="">{value.state ? "Select district" : "Choose a state first"}</option>
            {districts.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span className="form-label">PIN code</span>
          <span className="location-pin-row">
            <input
              id={`${idPrefix}-pincode`}
              className="form-control"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={6}
              placeholder="e.g. 180001"
              value={pinInput}
              onChange={(event) => {
                const pin = event.target.value.replace(/\D/g, "").slice(0, 6);
                setPinInput(pin);
                if (pin.length === 6) void lookupPin(pin);
              }}
            />
            <button
              type="button"
              className="button button-secondary"
              onClick={() => void lookupPin(pinInput)}
              disabled={busy !== null || pinInput.length !== 6}
            >
              {busy === "pin" ? "Checking…" : "Check"}
            </button>
          </span>
        </label>
      </div>

      {note ? (
        <p className="form-success location-note" role="status">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="form-alert location-note" role="alert">
          {error}
        </p>
      ) : null}
      {postOffices.length > 0 ? (
        <p className="form-help">Post offices for this PIN: {postOffices.join(", ")}.</p>
      ) : null}
      {value.latitude !== null && value.longitude !== null ? (
        <p className="form-help location-coordinates">
          Approximate point {value.latitude.toFixed(2)}, {value.longitude.toFixed(2)} (
          {value.source === "gps" ? "device" : "PIN code"}). PIN directory: India Post · Map data ©
          OpenStreetMap contributors.
        </p>
      ) : value.state ? (
        <p className="form-help">
          Add your PIN code or use your current location so nearby transport and storage can be
          found.
        </p>
      ) : null}
    </div>
  );
}
