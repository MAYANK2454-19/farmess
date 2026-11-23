"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./auth-form.module.css";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "sign-in" | "sign-up" | "reset";

export function AuthForm() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");

    try {
      const supabase = createClient();
      const normalizedEmail = email.trim().toLowerCase();

      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(
          normalizedEmail,
          {
            redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
          },
        );

        if (resetError) throw resetError;
        setMessage("If an account uses that email, a password reset link has been sent.");
        return;
      }

      if (mode === "sign-in") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (signInError) throw signInError;
        router.replace("/farmer");
        router.refresh();
        return;
      }

      const name = displayName.trim();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=/farmer`,
          // Display name is profile data, never an authorization role.
          data: { display_name: name },
        },
      });

      if (signUpError) throw signUpError;

      if (data.session) {
        if (name && data.user) {
          const { error: profileError } = await supabase
            .from("profiles")
            .update({ display_name: name })
            .eq("id", data.user.id);

          if (profileError) throw profileError;
        }
        router.replace("/farmer");
        router.refresh();
        return;
      }

      setMessage(
        "Your account has been created. Check your email to confirm the address, then sign in.",
      );
      setMode("sign-in");
      setPassword("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setPending(false);
    }
  }

  const isReset = mode === "reset";
  const isSignUp = mode === "sign-up";

  return (
    <div className={styles.formWrap}>
      <p className={styles.kicker}>Account access</p>
      <h1 className={styles.title}>
        {isReset ? "Reset your password" : isSignUp ? "Create your account" : "Welcome back"}
      </h1>
      <p className={styles.description}>
        {isReset
          ? "Enter the email address associated with your Farmess account."
          : isSignUp
            ? "Create a farmer account to keep your produce records in one place."
            : "Sign in to manage your produce and selling decisions."}
      </p>

      <form className={styles.form} onSubmit={handleSubmit}>
        {isSignUp ? (
          <label className={styles.field}>
            <span>Your name</span>
            <input
              autoComplete="name"
              maxLength={80}
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              required
              placeholder="Name shown on your account"
            />
          </label>
        ) : null}

        <label className={styles.field}>
          <span>Email address</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            placeholder="you@example.com"
          />
        </label>

        {!isReset ? (
          <label className={styles.field}>
            <span>Password</span>
            <input
              type="password"
              autoComplete={isSignUp ? "new-password" : "current-password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              placeholder="At least 8 characters"
            />
          </label>
        ) : null}

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
          {pending
            ? "Please wait…"
            : isReset
              ? "Send reset link"
              : isSignUp
                ? "Create account"
                : "Sign in"}
        </button>
      </form>

      <div className={styles.switches}>
        {mode === "sign-in" ? (
          <>
            <button type="button" onClick={() => { setMode("sign-up"); setError(""); setMessage(""); }}>
              Create a new account
            </button>
            <button type="button" onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>
              Forgot password?
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => {
              setMode("sign-in");
              setError("");
              setMessage("");
            }}
          >
            Back to sign in
          </button>
        )}
      </div>
    </div>
  );
}
