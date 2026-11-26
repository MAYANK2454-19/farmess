"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { StateDistrictSelect } from "@/features/location/state-district-select";

/** AGMARKNET commodity names exactly as the source spells them. */
const COMMON_CROPS = [
  "Tomato",
  "Onion",
  "Potato",
  "Green Chilli",
  "Cauliflower",
  "Cabbage",
  "Brinjal",
  "Apple",
  "Banana",
  "Wheat",
  "Rice",
  "Paddy(Dhan)(Common)",
  "Maize",
  "Garlic",
  "Ginger(Green)",
  "Mustard",
  "Soyabean",
];

const QUICK_START_CROPS = ["Tomato", "Onion", "Potato", "Green Chilli", "Cauliflower"];

type HistoryResponse = {
  status?: string;
  stopReason?: string;
  sourcePageSize?: number | null;
  recordsUpserted?: number;
  message?: string;
  error?: string;
};

type Line = { crop: string; state: "running" | "done" | "failed"; text: string };

export function AdminHistoryImport() {
  const router = useRouter();
  const [crop, setCrop] = useState("Tomato");
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");
  const [days, setDays] = useState("90");
  const [running, setRunning] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [error, setError] = useState("");
  const [smallPages, setSmallPages] = useState(false);

  async function importCrop(name: string): Promise<boolean> {
    setLines((prev) => [
      ...prev,
      { crop: name, state: "running", text: "Fetching past prices from data.gov.in…" },
    ]);
    const update = (line: Line) =>
      setLines((prev) => prev.map((item) => (item.crop === name ? line : item)));
    try {
      const response = await fetch("/api/admin/market-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commodity: name,
          state,
          district: district || undefined,
          days: Number(days),
        }),
      });
      const payload = (await response.json()) as HistoryResponse;
      if (payload.sourcePageSize !== undefined && payload.sourcePageSize !== null) {
        setSmallPages(payload.sourcePageSize <= 10);
      }
      if (!response.ok) {
        update({
          crop: name,
          state: "failed",
          text: payload.error ?? payload.message ?? "Failed.",
        });
        return false;
      }
      update({ crop: name, state: "done", text: payload.message ?? "Done." });
      return true;
    } catch {
      update({ crop: name, state: "failed", text: "The import request did not complete." });
      return false;
    }
  }

  async function run(crops: string[]) {
    if (!state) {
      setError("Choose a state first.");
      return;
    }
    setError("");
    setLines([]);
    setRunning(true);
    for (const name of crops) await importCrop(name);
    setRunning(false);
    router.refresh();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run([crop]);
  }

  return (
    <section className="panel admin-panel">
      <div className="panel-header">
        <div>
          <h2 className="panel-title">Import past prices (history)</h2>
          <p className="panel-caption">
            Pulls every day&apos;s reported mandi prices for the chosen period from the government
            AGMARKNET archive on data.gov.in. These fill the price trend and forecast that farmers
            see. Run it again any time; already-saved days are not duplicated.
          </p>
        </div>
      </div>

      <form className="admin-form" onSubmit={handleSubmit}>
        <div className="admin-form-grid">
          <label>
            Crop
            <select value={crop} onChange={(event) => setCrop(event.target.value)}>
              {COMMON_CROPS.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <StateDistrictSelect
            idPrefix="admin-history"
            state={state}
            district={district}
            onChange={(next) => {
              setState(next.state);
              setDistrict(next.district);
            }}
          />
          <label>
            How far back
            <select value={days} onChange={(event) => setDays(event.target.value)}>
              <option value="30">Last 30 days</option>
              <option value="90">Last 3 months</option>
              <option value="180">Last 6 months</option>
              <option value="365">Last 12 months</option>
            </select>
          </label>
        </div>
        <p className="admin-help">
          Choosing a district keeps the import quick and focused on nearby mandis. Each crop can
          take up to about four minutes; leave this page open while it runs. If an import stops
          early (data.gov.in limits), press the button again: it continues further back from where
          it stopped.
        </p>
        {error ? (
          <p className="admin-error" role="alert">
            {error}
          </p>
        ) : null}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button className="button button-primary" type="submit" disabled={running}>
            {running ? "Importing…" : `Import ${crop}`}
          </button>
          <button
            className="button"
            type="button"
            disabled={running}
            onClick={() => void run(QUICK_START_CROPS)}
          >
            Import {QUICK_START_CROPS.length} common vegetables
          </button>
        </div>
      </form>

      {lines.length ? (
        <div className="admin-result" role="status" aria-live="polite">
          {lines.map((line) => (
            <p key={line.crop}>
              <strong>
                {line.state === "running" ? "⏳" : line.state === "done" ? "✓" : "✕"} {line.crop}:
              </strong>{" "}
              {line.text}
            </p>
          ))}
        </div>
      ) : null}
      {smallPages ? (
        <p className="admin-notice" role="status">
          data.gov.in is returning only 10 rows per request, which means the server is using the
          public sample API key. Imports still work but are slow and may stop early. Add your
          personal data.gov.in key as DATA_GOV_IN_API_KEY in Vercel for full-speed imports.
        </p>
      ) : null}
    </section>
  );
}
