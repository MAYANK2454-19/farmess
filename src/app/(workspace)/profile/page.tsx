"use client";
import { useState } from "react";
export default function ProfilePage() {
  const [locationSharing, setLocationSharing] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <main className="content module-page profile-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Profile & privacy</h1>
          <p className="page-subtitle">
            Control the information Farmess can use and how it communicates with you.
          </p>
        </div>
      </div>
      <section className="panel profile-card">
        <div className="profile-card-heading">
          <div>
            <h2 className="panel-title">Your profile</h2>
            <p className="panel-caption">
              These fields will be connected to your signed-in account.
            </p>
          </div>
          <span className="profile-status">Preview</span>
        </div>
        <div className="profile-avatar-large" aria-hidden="true">
          F
        </div>
        <div className="profile-form-grid">
          <label className="form-field">
            <span className="form-label">Display name</span>
            <input className="form-control" placeholder="Your name" />
          </label>
          <label className="form-field">
            <span className="form-label">Phone number</span>
            <input className="form-control" type="tel" placeholder="+91 …" />
          </label>
          <label className="form-field full">
            <span className="form-label">Market area / locality</span>
            <input className="form-control" placeholder="Nearby market or locality" />
            <span className="form-help">
              Use a locality or market area. Do not enter exact GPS coordinates here.
            </span>
          </label>
        </div>
      </section>
      <section className="panel privacy-card">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Privacy & consent</h2>
            <p className="panel-caption">Choose what can be used for matching and communication.</p>
          </div>
        </div>
        <div className="privacy-row">
          <div>
            <strong>Location sharing</strong>
            <p>Allow approximate location to help compare nearby markets and logistics options.</p>
          </div>
          <button
            type="button"
            className={"privacy-toggle" + (locationSharing ? " on" : "")}
            aria-pressed={locationSharing}
            onClick={() => setLocationSharing((value) => !value)}
          >
            <span />
            {locationSharing ? "On" : "Off"}
          </button>
        </div>
        <div className="privacy-row">
          <div>
            <strong>Buyer communication</strong>
            <p>Receive notifications when a buyer sends an offer or updates an existing offer.</p>
          </div>
          <span className="privacy-badge">Coming with account setup</span>
        </div>
        <div className="privacy-row">
          <div>
            <strong>Data visibility</strong>
            <p>
              Your produce and contact details should only be visible according to server-side
              sharing rules.
            </p>
          </div>
          <span className="privacy-badge">Server controlled</span>
        </div>
      </section>
      <div className="form-footer profile-footer">
        <p className="form-warning">
          {saved
            ? "Preview saved locally for this session."
            : "Preview only — profile persistence will be connected by the authentication/database owner."}
        </p>
        <button className="button button-primary" type="button" onClick={() => setSaved(true)}>
          Save preferences
        </button>
      </div>
    </main>
  );
}
