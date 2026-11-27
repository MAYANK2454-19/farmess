"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ role }: { role?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    setPending(true);
    setError("");

    const supabase = createClient();
    // This device only. Other devices are signed out from "Sign-in and security".
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });

    if (signOutError) {
      setError("Could not sign out. Please try again.");
      setPending(false);
      return;
    }

    // Admins return to the public home page, which has no admin sign-in on it.
    router.replace(role === "admin" ? "/" : "/login?reason=signed_out");
    router.refresh();
  }

  return (
    <div className="sign-out-control">
      <button className="topbar-action" type="button" onClick={handleSignOut} disabled={pending}>
        <Icon name="logout" size={16} />
        <span>{pending ? "Signing out…" : "Sign out"}</span>
      </button>
      {error ? (
        <span className="sign-out-error" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
