"use client";

import { useEffect, useState } from "react";

type Device = {
  id: string;
  device: string;
  signedInAt: string;
  lastActiveAt: string;
  current: boolean;
};

function formatWhen(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

/**
 * Where this account is signed in, with a way to sign other devices out.
 * Shown on the profile page for every role.
 */
export function SignedInDevices({
  idleMinutes,
  absoluteHours,
}: {
  idleMinutes: number;
  absoluteHours: number;
}) {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/session/devices", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as { devices?: Device[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "Your devices could not be loaded.");
        if (active) setDevices(result.devices ?? []);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Your devices could not be loaded.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

  async function signOut(target: { id: string } | { others: true }) {
    const key = "id" in target ? target.id : "others";
    setBusy(key);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/session/devices", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(target),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "That device could not be signed out.");
      setDevices((current) =>
        (current ?? []).filter((device) =>
          "id" in target ? device.id !== target.id : device.current,
        ),
      );
      setMessage(
        "id" in target
          ? "That device has been signed out."
          : "All other devices have been signed out.",
      );
    } catch (signOutError) {
      setError(
        signOutError instanceof Error
          ? signOutError.message
          : "That device could not be signed out.",
      );
    } finally {
      setBusy(null);
    }
  }

  const others = (devices ?? []).filter((device) => !device.current);

  return (
    <section className="panel" aria-labelledby="devices-heading">
      <div className="panel-header">
        <div>
          <h2 className="panel-title" id="devices-heading">
            Sign-in and security
          </h2>
          <p className="panel-caption">
            For your security Farmess signs you out after {idleMinutes} minutes without activity,
            and {absoluteHours} hours after you signed in. These are the devices where your account
            is signed in now.
          </p>
        </div>
      </div>
      {error ? (
        <p className="form-alert" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="form-help" role="status">
          {message}
        </p>
      ) : null}
      {devices === null && !error ? (
        <p className="empty-copy" role="status">
          Loading your devices…
        </p>
      ) : (
        <ul className="device-list">
          {(devices ?? []).map((device) => (
            <li key={device.id} className="device-row">
              <div>
                <strong>
                  {device.device}
                  {device.current ? " (this device)" : ""}
                </strong>
                <span>
                  Signed in {formatWhen(device.signedInAt)} · last active{" "}
                  {formatWhen(device.lastActiveAt)}
                </span>
              </div>
              {device.current ? null : (
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => void signOut({ id: device.id })}
                  disabled={busy !== null}
                >
                  {busy === device.id ? "Signing out…" : "Sign out"}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 ? (
        <div>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void signOut({ others: true })}
            disabled={busy !== null}
          >
            {busy === "others" ? "Signing out…" : "Sign out of all other devices"}
          </button>
        </div>
      ) : devices && devices.length > 0 ? (
        <p className="form-help">Your account is not signed in anywhere else.</p>
      ) : null}
    </section>
  );
}
