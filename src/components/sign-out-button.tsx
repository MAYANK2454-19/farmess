"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/icons";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleSignOut() {
    setPending(true);
    setError("");

    const supabase = createClient();
    const { error: signOutError } = await supabase.auth.signOut();

    if (signOutError) {
      setError("Could not sign out. Please try again.");
      setPending(false);
      return;
    }

    router.replace("/login");
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
