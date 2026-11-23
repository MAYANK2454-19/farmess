"use client";

import { useEffect, useState } from "react";
import type { Database } from "@/lib/supabase/database.types";

type Profile = Pick<
  Database["public"]["Tables"]["profiles"]["Row"],
  | "display_name"
  | "phone_number"
  | "market_area"
  | "approximate_location_sharing"
  | "exact_location_disclosure"
  | "buyer_contact_disclosure"
  | "provider_contact_disclosure"
>;

const initialProfile: Profile = {
  display_name: "",
  phone_number: null,
  market_area: null,
  approximate_location_sharing: false,
  exact_location_disclosure: false,
  buyer_contact_disclosure: false,
  provider_contact_disclosure: false,
};

export function ProfileForm() {
  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
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
        if (active) setProfile(result.profile);
      } catch (loadError) {
        if (active) {
          setError(
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

  async function submitProfile() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(profile),
      });
      const result = (await response.json()) as { profile?: Profile; error?: string };

      if (!response.ok || !result.profile) {
        throw new Error(result.error ?? "Your profile could not be saved.");
      }

      setProfile(result.profile);
      setMessage("Your account details and privacy choices have been saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Your profile could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
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

            <div className="form-footer profile-footer">
              <p className="form-warning">Your phone number and area are not public by default.</p>
              <button className="button button-primary" type="submit" disabled={saving}>
                {saving ? "Saving…" : "Save account details"}
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
            disabled={loading || saving}
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
            disabled={loading || saving}
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
            disabled={loading || saving}
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
            disabled={loading || saving}
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
            disabled={loading || saving}
          >
            {saving ? "Saving…" : "Save privacy choices"}
          </button>
        </div>
      </section>
    </div>
  );
}
