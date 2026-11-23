"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "@/features/auth/auth-form.module.css";
import { createClient } from "@/lib/supabase/client";

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setMessage("Password updated. Opening your workspace…");
      router.replace("/farmer");
      router.refresh();
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update your password. Please request a new reset link.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="auth-page auth-page-single">
      <section className="auth-main">
        <div className={styles.formWrap}>
          <p className={styles.kicker}>Account security</p>
          <h1 className={styles.title}>Choose a new password</h1>
          <p className={styles.description}>Use at least eight characters for your new password.</p>
          <form className={styles.form} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Confirm password</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            {message ? (
              <p className={styles.message} role="status">
                {message}
              </p>
            ) : null}
            <button className={styles.submit} type="submit" disabled={pending}>
              {pending ? "Updating…" : "Update password"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
