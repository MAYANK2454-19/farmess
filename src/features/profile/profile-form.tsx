"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/lib/supabase/database.types";
import type { FarmessRole } from "@/lib/auth/authorization";
import {
  BUYER_TYPES,
  OPERATOR_SERVICE_TYPES,
  ROLE_DETAIL_FIELDS,
  VEHICLE_TYPES,
} from "@/features/profile/role-details";
import { AccessRequestCard } from "@/features/access/access-request-card";
import { LocationPicker, type LocationValue } from "@/features/location/location-picker";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

type Profile = Pick<
  ProfileRow,
  | "display_name"
  | "phone_number"
  | "market_area"
  | "approximate_location_sharing"
  | "exact_location_disclosure"
  | "buyer_contact_disclosure"
  | "provider_contact_disclosure"
  | "own_transport"
  | "transport_vehicle_type"
  | "transport_capacity_quintal"
  | "farm_size_acres"
  | "primary_crops"
  | "organisation_name"
  | "buyer_type"
  | "operator_service_types"
  | "operator_fleet_size"
  | "operator_cold_chain"
  | "state"
  | "district"
  | "pincode"
  | "location_latitude"
  | "location_longitude"
  | "location_source"
> & { role: FarmessRole };

const BASE_FIELDS = [
  "display_name",
  "phone_number",
  "market_area",
  "approximate_location_sharing",
  "exact_location_disclosure",
  "buyer_contact_disclosure",
  "provider_contact_disclosure",
] as const;

const initialProfile: Profile = {
  role: "farmer",
  display_name: "",
  phone_number: null,
  market_area: null,
  approximate_location_sharing: false,
  exact_location_disclosure: false,
  buyer_contact_disclosure: false,
  provider_contact_disclosure: false,
  own_transport: null,
  transport_vehicle_type: null,
  transport_capacity_quintal: null,
  farm_size_acres: null,
  primary_crops: null,
  organisation_name: null,
  buyer_type: null,
  operator_service_types: null,
  operator_fleet_size: null,
  operator_cold_chain: null,
  state: null,
  district: null,
  pincode: null,
  location_latitude: null,
  location_longitude: null,
  location_source: null,
};

function toLocationValue(profile: Profile): LocationValue {
  return {
    state: profile.state,
    district: profile.district,
    pincode: profile.pincode,
    latitude: profile.location_latitude === null ? null : Number(profile.location_latitude),
    longitude: profile.location_longitude === null ? null : Number(profile.location_longitude),
    source: (profile.location_source as LocationValue["source"]) ?? null,
  };
}

const LABELS: Record<string, string> = {
  two_wheeler: "Two-wheeler",
  tractor_trolley: "Tractor with trolley",
  pickup: "Pickup",
  mini_truck: "Mini truck",
  truck: "Truck",
  other: "Other",
  trader: "Trader / commission agent",
  wholesaler: "Wholesaler",
  retailer: "Retailer",
  processor: "Food processor",
  exporter: "Exporter",
  fpo: "Farmer producer organisation (FPO)",
  institution: "Institution (hotel, hostel, canteen)",
  transport: "Transport",
  cold_storage: "Cold storage",
  warehouse: "Warehouse / dry storage",
  packhouse: "Packhouse / grading",
};

const ROLE_SECTION: Record<FarmessRole, { title: string; caption: string } | null> = {
  farmer: {
    title: "Farm and transport",
    caption: "Helps Farmess estimate transport costs and suggest feasible markets.",
  },
  buyer: {
    title: "Buying business",
    caption: "Shown to farmers only as part of an offer you make.",
  },
  operator: {
    title: "Service business",
    caption: "Describes the transport or storage services you provide.",
  },
  admin: null,
};

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildPayload(profile: Profile) {
  const payload: Record<string, unknown> = {};
  for (const field of BASE_FIELDS) payload[field] = profile[field];
  for (const field of ROLE_DETAIL_FIELDS[profile.role]) {
    payload[field] = profile[field as keyof Profile];
  }
  payload.state = profile.state;
  payload.district = profile.district;
  payload.pincode = profile.pincode;
  payload.location_latitude =
    profile.location_latitude === null ? null : Number(profile.location_latitude);
  payload.location_longitude =
    profile.location_longitude === null ? null : Number(profile.location_longitude);
  payload.location_source = profile.location_source;
  return payload;
}

export function ProfileForm() {
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [cropsText, setCropsText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      try {
        const response = await fetch("/api/profile", { cache: "no-store" });
        const result = (await response.json()) as { profile?: Profile; error?: string };
        if (!response.ok || !result.profile) {
          throw new Error(result.error ?? "Your profile could not be loaded.");
        }
        if (active) {
          setProfile({ ...initialProfile, ...result.profile });
          setCropsText((result.profile.primary_crops ?? []).join(", "));
        }
      } catch (loadError) {
        if (active) {
          setLoadError(
            loadError instanceof Error ? loadError.message : "Your profile could not be loaded.",
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

  function update<K extends keyof Profile>(field: K, value: Profile[K]) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  function toggleService(service: string, checked: boolean) {
    const current = new Set(profile.operator_service_types ?? []);
    if (checked) current.add(service);
    else current.delete(service);
    update("operator_service_types", current.size > 0 ? [...current] : null);
  }

  async function submitProfile() {
    setSaving(true);
    setError("");
    setMessage("");

    const next: Profile =
      profile.role === "farmer"
        ? {
            ...profile,
            primary_crops: cropsText
              .split(",")
              .map((crop) => crop.trim())
              .filter(Boolean),
          }
        : profile;

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(buildPayload(next)),
      });
      const result = (await response.json()) as { profile?: Profile; error?: string };

      if (!response.ok || !result.profile) {
        throw new Error(result.error ?? "Your profile could not be saved.");
      }

      setProfile({ ...initialProfile, ...result.profile });
      setCropsText((result.profile.primary_crops ?? []).join(", "));
      setMessage("Your profile and privacy choices have been saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Your profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  const disabled = loading || saving || Boolean(loadError);
  const section = ROLE_SECTION[profile.role];

  return (
    <div className="profile-stack">
      <form
        className="panel profile-card"
        onSubmit={(event) => {
          event.preventDefault();
          void submitProfile();
        }}
      >
        <div className="profile-card-heading">
          <div>
            <p className="eyebrow">Account details</p>
            <h2>Personal information</h2>
            <p className="page-subtitle">These details belong to your account.</p>
          </div>
          <span className="profile-status">Private by default</span>
        </div>

        {loading ? (
          <p className="form-help" role="status">
            Loading account details…
          </p>
        ) : loadError ? (
          <p className="form-alert" role="alert">
            {loadError} Refresh the page before editing your account.
          </p>
        ) : (
          <>
            <div className="profile-form-grid">
              <label className="form-field">
                <span className="form-label">Display name</span>
                <input
                  className="form-control"
                  value={profile.display_name ?? ""}
                  onChange={(event) => update("display_name", event.target.value)}
                  maxLength={80}
                  required
                />
              </label>
              <label className="form-field">
                <span className="form-label">Phone number</span>
                <input
                  className="form-control"
                  type="tel"
                  autoComplete="tel"
                  value={profile.phone_number ?? ""}
                  onChange={(event) => update("phone_number", event.target.value || null)}
                  maxLength={24}
                  placeholder="Optional"
                />
              </label>
              <label className="form-field full">
                <span className="form-label">Village, locality or nearby market area</span>
                <input
                  className="form-control"
                  value={profile.market_area ?? ""}
                  onChange={(event) => update("market_area", event.target.value || null)}
                  maxLength={120}
                  placeholder="Optional; do not enter your full home address"
                />
              </label>
            </div>

            <fieldset className="profile-role-section">
              <legend>
                <span className="profile-role-title">Location</span>
                <span className="profile-role-caption">
                  Used to find nearby markets, transport and cold storage. Saved to about 1 km and
                  visible only to you.
                </span>
              </legend>
              <LocationPicker
                idPrefix="profile-location"
                value={toLocationValue(profile)}
                onChange={(next) =>
                  setProfile((current) => ({
                    ...current,
                    state: next.state,
                    district: next.district,
                    pincode: next.pincode,
                    location_latitude: next.latitude,
                    location_longitude: next.longitude,
                    location_source: next.source,
                  }))
                }
              />
            </fieldset>

            {section ? (
              <fieldset className="profile-role-section">
                <legend>
                  <span className="profile-role-title">{section.title}</span>
                  <span className="profile-role-caption">{section.caption}</span>
                </legend>

                {profile.role === "farmer" ? (
                  <div className="profile-form-grid">
                    <div className="form-field full">
                      <span className="form-label">Do you have your own transport?</span>
                      <div className="choice-pills" role="radiogroup" aria-label="Own transport">
                        {[
                          { label: "Yes", value: true },
                          { label: "No", value: false },
                        ].map((choice) => (
                          <label
                            key={choice.label}
                            className={
                              "choice-pill" +
                              (profile.own_transport === choice.value ? " selected" : "")
                            }
                          >
                            <input
                              type="radio"
                              name="own_transport"
                              checked={profile.own_transport === choice.value}
                              onChange={() => {
                                update("own_transport", choice.value);
                                if (!choice.value) {
                                  update("transport_vehicle_type", null);
                                  update("transport_capacity_quintal", null);
                                }
                              }}
                            />
                            {choice.label}
                          </label>
                        ))}
                      </div>
                    </div>

                    {profile.own_transport ? (
                      <>
                        <label className="form-field">
                          <span className="form-label">Vehicle type</span>
                          <select
                            className="form-control"
                            value={profile.transport_vehicle_type ?? ""}
                            onChange={(event) =>
                              update("transport_vehicle_type", event.target.value || null)
                            }
                          >
                            <option value="">Select vehicle</option>
                            {VEHICLE_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {LABELS[type]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="form-field">
                          <span className="form-label">Load capacity (quintal)</span>
                          <input
                            className="form-control"
                            type="number"
                            inputMode="decimal"
                            min={0.1}
                            max={1000}
                            step="0.1"
                            value={profile.transport_capacity_quintal ?? ""}
                            onChange={(event) =>
                              update("transport_capacity_quintal", numberOrNull(event.target.value))
                            }
                            placeholder="e.g. 20"
                          />
                        </label>
                      </>
                    ) : null}

                    <label className="form-field">
                      <span className="form-label">Farm size (acres)</span>
                      <input
                        className="form-control"
                        type="number"
                        inputMode="decimal"
                        min={0.1}
                        max={10000}
                        step="0.1"
                        value={profile.farm_size_acres ?? ""}
                        onChange={(event) =>
                          update("farm_size_acres", numberOrNull(event.target.value))
                        }
                        placeholder="Optional"
                      />
                    </label>
                    <label className="form-field">
                      <span className="form-label">Main crops</span>
                      <input
                        className="form-control"
                        value={cropsText}
                        onChange={(event) => setCropsText(event.target.value)}
                        placeholder="e.g. Tomato, Apple, Rice"
                        maxLength={400}
                      />
                      <span className="form-help">Separate crops with commas (up to 10).</span>
                    </label>
                  </div>
                ) : null}

                {profile.role === "buyer" ? (
                  <div className="profile-form-grid">
                    <label className="form-field">
                      <span className="form-label">Organisation or business name</span>
                      <input
                        className="form-control"
                        value={profile.organisation_name ?? ""}
                        onChange={(event) =>
                          update("organisation_name", event.target.value || null)
                        }
                        maxLength={120}
                      />
                    </label>
                    <label className="form-field">
                      <span className="form-label">Buyer type</span>
                      <select
                        className="form-control"
                        value={profile.buyer_type ?? ""}
                        onChange={(event) => update("buyer_type", event.target.value || null)}
                      >
                        <option value="">Select buyer type</option>
                        {BUYER_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {LABELS[type]}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                {profile.role === "operator" ? (
                  <div className="profile-form-grid">
                    <label className="form-field full">
                      <span className="form-label">Organisation or business name</span>
                      <input
                        className="form-control"
                        value={profile.organisation_name ?? ""}
                        onChange={(event) =>
                          update("organisation_name", event.target.value || null)
                        }
                        maxLength={120}
                      />
                    </label>
                    <div className="form-field full">
                      <span className="form-label">Services you provide</span>
                      <div className="choice-pills">
                        {OPERATOR_SERVICE_TYPES.map((service) => {
                          const checked = (profile.operator_service_types ?? []).includes(service);
                          return (
                            <label
                              key={service}
                              className={"choice-pill" + (checked ? " selected" : "")}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(event) => toggleService(service, event.target.checked)}
                              />
                              {LABELS[service]}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    <label className="form-field">
                      <span className="form-label">Fleet size (vehicles)</span>
                      <input
                        className="form-control"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={10000}
                        step="1"
                        value={profile.operator_fleet_size ?? ""}
                        onChange={(event) =>
                          update("operator_fleet_size", numberOrNull(event.target.value))
                        }
                      />
                    </label>
                    <label className="form-field privacy-inline">
                      <input
                        className="privacy-checkbox"
                        type="checkbox"
                        checked={profile.operator_cold_chain === true}
                        onChange={(event) => update("operator_cold_chain", event.target.checked)}
                      />
                      <span className="form-label">I offer refrigerated / cold-chain handling</span>
                    </label>
                  </div>
                ) : null}
              </fieldset>
            ) : null}

            <div className="form-footer profile-footer">
              <p className="form-warning">Your phone number and area are not public by default.</p>
              <button className="button button-primary" type="submit" disabled={disabled}>
                {saving ? "Saving…" : "Save profile"}
              </button>
            </div>
          </>
        )}
      </form>

      <section className="panel privacy-card" aria-labelledby="privacy-heading">
        <div className="panel-header">
          <div>
            <h2 className="panel-title" id="privacy-heading">
              Privacy and sharing
            </h2>
            <p className="panel-caption">
              You control whether these details may be shared in a relevant Farmess workflow.
            </p>
          </div>
          <span className="privacy-badge">Optional consent</span>
        </div>

        <label className="privacy-row">
          <span>
            <strong>Share my approximate market area</strong>
            <p>
              May be shown to a matched buyer or service provider where an active workflow needs an
              area.
            </p>
          </span>
          <input
            className="privacy-checkbox"
            type="checkbox"
            checked={profile.approximate_location_sharing}
            disabled={disabled}
            onChange={(event) => update("approximate_location_sharing", event.target.checked)}
          />
        </label>

        <label className="privacy-row">
          <span>
            <strong>Allow exact location disclosure</strong>
            <p>
              Only for a specific, authorised workflow. Farmess does not ask for GPS coordinates on
              the produce form.
            </p>
          </span>
          <input
            className="privacy-checkbox"
            type="checkbox"
            checked={profile.exact_location_disclosure}
            disabled={disabled}
            onChange={(event) => update("exact_location_disclosure", event.target.checked)}
          />
        </label>

        <label className="privacy-row">
          <span>
            <strong>Allow my phone number to be shared with a buyer</strong>
            <p>
              Your number stays private unless you enable this and a buyer contact workflow applies.
            </p>
          </span>
          <input
            className="privacy-checkbox"
            type="checkbox"
            checked={profile.buyer_contact_disclosure}
            disabled={disabled}
            onChange={(event) => update("buyer_contact_disclosure", event.target.checked)}
          />
        </label>

        <label className="privacy-row">
          <span>
            <strong>Allow my phone number to be shared with a service provider</strong>
            <p>
              Used only when you request a transport or storage service that needs provider contact.
            </p>
          </span>
          <input
            className="privacy-checkbox"
            type="checkbox"
            checked={profile.provider_contact_disclosure}
            disabled={disabled}
            onChange={(event) => update("provider_contact_disclosure", event.target.checked)}
          />
        </label>

        <div className="profile-footer">
          {error ? (
            <p className="form-alert" role="alert">
              {error}
            </p>
          ) : null}
          {message ? (
            <p className="form-success" role="status">
              {message}
            </p>
          ) : null}
          <button
            className="button button-primary"
            type="button"
            onClick={() => void submitProfile()}
            disabled={disabled}
          >
            {saving ? "Saving…" : "Save privacy choices"}
          </button>
        </div>
      </section>

      {!loading && !loadError && profile.role === "farmer" ? (
        <AccessRequestCard defaultName={profile.display_name ?? ""} />
      ) : null}
    </div>
  );
}
