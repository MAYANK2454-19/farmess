"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LotStatusButton({ lotId, status }: { lotId: string; status: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  if (status !== "draft" && status !== "published") {
    return <span className="form-help">No action available</span>;
  }

  const action = status === "draft" ? "publish" : "withdraw";
  const label = action === "publish" ? "Publish" : "Withdraw";

  async function updateStatus() {
    setPending(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/produce-lots", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ id: lotId, action }),
      });
      const result = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "The lot could not be updated.");

      setMessage(result.message ?? "Lot updated.");
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "The lot could not be updated.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="lot-status-control">
      <button
        type="button"
        className={action === "publish" ? "button button-primary" : "button button-secondary"}
        onClick={() => void updateStatus()}
        disabled={pending}
      >
        {pending ? "Saving…" : label}
      </button>
      {error ? (
        <span className="lot-status-error" role="alert">
          {error}
        </span>
      ) : null}
      {message ? (
        <span className="lot-status-success" role="status">
          {message}
        </span>
      ) : null}
    </div>
  );
}
