"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./auth-form.module.css";
import { createClient } from "@/lib/supabase/client";

type AuthMode = "sign-in" | "sign-up" | "reset";
type Portal = "farmer" | "buyer" | "operator" | "admin";

/**
 * What a failed sign-in says. The same words are used when an account exists
 * but belongs behind the other sign-in page, so the public form never confirms
 * that an email is an admin account.
 */
const SIGN_IN_FAILED = "Invalid login credentials";

const NOTICES: Record<string, string> = {
  idle: "You were signed out because there was no activity for a while. Sign in again to continue.",
  expired: "Your session reached its time limit. Sign in again to continue.",
  signed_out: "You have been signed out.",
};

const ADMIN_PORTAL = {
  id: "admin" as const,
  label: "Admin",
  hindi: "प्रशासन",
  signInCopy: "Sign in to the data-steward console for reviews and access.",
};

/** Account types offered on the public sign-in page. Admin sign-in is not public. */
const PORTALS: { id: Portal; label: string; hindi: string; signInCopy: string }[] = [
  {
    id: "farmer",
    label: "Farmer",
    hindi: "किसान",
    signInCopy: "Sign in to manage your produce and selling decisions.",
  },
  {
    id: "buyer",
    label: "Buyer",
    hindi: "खरीदार",
    signInCopy: "Sign in to post requirements, find matching lots and manage offers.",
  },
  {
    id: "operator",
    label: "Transport & storage",
    hindi: "परिवहन",
    signInCopy: "Sign in to manage your service listings and farmer requests.",
  },
];

const PORTAL_LABEL: Record<Portal, string> = {
  farmer: "Farmer",
  buyer: "Buyer",
  operator: "Transport & storage",
  admin: "Admin",
};

function workspaceForRole(role: unknown): string {
  if (role === "buyer") return "/buyer";
  if (role === "operator") return "/operator";
  if (role === "admin") return "/admin";
  return "/farmer";
}

function isPortal(value: unknown): value is Portal {
  return value === "farmer" || value === "buyer" || value === "operator" || value === "admin";
}

export function AuthForm({
  variant = "public",
  reason,
}: {
  /** "admin" is used only by the private admin sign-in page. */
  variant?: "public" | "admin";
  /** Why the person was sent here (from ?reason=), shown as a notice. */
  reason?: string;
}) {
  const router = useRouter();
  const adminOnly = variant === "admin";
  const [portal, setPortal] = useState<Portal>(adminOnly ? "admin" : "farmer");
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
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
          redirectTo: `${window.location.origin}/auth/callback?next=/auth/update-password`,
        });

        if (resetError) throw resetError;
        setMessage("If an account uses that email, a password reset link has been sent.");
        return;
      }

      if (mode === "sign-in") {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

        if (signInError) throw signInError;

        // The role comes from server-controlled app_metadata, never from this form.
        // A mismatch with the chosen portal signs the user out again; server-side
        // session and route guards still verify the role on every workspace request.
        const accountRole = data.user.app_metadata?.farmess_role;
        // Admin accounts sign in only through their private page, and that page
        // accepts nothing else. Either way the answer looks like a wrong password.
        if ((accountRole === "admin") !== adminOnly) {
          await supabase.auth.signOut({ scope: "local" });
          setError(SIGN_IN_FAILED);
          return;
        }
        if (isPortal(accountRole) && accountRole !== portal) {
          await supabase.auth.signOut({ scope: "local" });
          setError(
            `This is a ${PORTAL_LABEL[accountRole]} account, not a ${PORTAL_LABEL[portal]} account. ` +
              `Choose the ${PORTAL_LABEL[accountRole]} tab to sign in.`,
          );
          return;
        }

        router.replace(workspaceForRole(accountRole));
        router.refresh();
        return;
      }

      const name = displayName.trim();
      // New accounts are always farmers; buyer/operator sign-ups continue to the
      // profile page to request verified access.
      const afterSignUp = portal === "buyer" || portal === "operator" ? "/profile" : "/farmer";
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${afterSignUp}`,
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
        router.replace(afterSignUp);
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
  const activePortal = adminOnly
    ? ADMIN_PORTAL
    : (PORTALS.find((item) => item.id === portal) ?? PORTALS[0]);
  const notice = reason ? NOTICES[reason] : undefined;

  const signUpCopy =
    portal === "farmer"
      ? "Create a farmer account to keep your produce records in one place."
      : portal === "admin"
        ? "Admin accounts are created only by the Farmess project owner."
        : `Create your account first, then request ${PORTAL_LABEL[portal]} access from your profile. A Farmess admin verifies every ${PORTAL_LABEL[portal].toLowerCase()} account.`;

  return (
    <div className={styles.formWrap}>
      {notice && !error && !message ? (
        <p className={`${styles.message} ${styles.notice}`} role="status">
          {notice}
        </p>
      ) : null}
      {!isReset && !adminOnly ? (
        <div className={styles.portals} role="tablist" aria-label="Choose your account type">
          {PORTALS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={portal === item.id}
              className={styles.portal + (portal === item.id ? " " + styles.portalActive : "")}
              onClick={() => {
                setPortal(item.id);
                setError("");
                setMessage("");
                if (item.id === "admin") setMode("sign-in");
              }}
            >
              <span>{item.label}</span>
              <span className={styles.portalHindi} lang="hi">
                {item.hindi}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <p className={styles.kicker}>{isReset ? "Account access" : `${activePortal.label} access`}</p>
      <h1 className={styles.title}>
        {isReset ? "Reset your password" : isSignUp ? "Create your account" : "Welcome back"}
      </h1>
      <p className={styles.description}>
        {isReset
          ? "Enter the email address associated with your Farmess account."
          : isSignUp
            ? signUpCopy
            : activePortal.signInCopy}
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
            {!adminOnly ? (
              <button
                type="button"
                onClick={() => {
                  setMode("sign-up");
                  setError("");
                  setMessage("");
                }}
              >
                Create a new account
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setError("");
                setMessage("");
              }}
            >
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
