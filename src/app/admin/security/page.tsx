import { SignedInDevices } from "@/features/auth/signed-in-devices";
import { ADMIN_SESSION_POLICY } from "@/lib/auth/session-policy";

export const dynamic = "force-dynamic";

export default function AdminSecurityPage() {
  return (
    <main className="admin-content">
      <div className="admin-page-heading">
        <div>
          <p className="admin-eyebrow">Account</p>
          <h1>Sign-in and security</h1>
          <p>
            Admin sessions are shorter than everyone else&apos;s. The admin sign-in page is not
            linked from the site: keep its address private and share it only with other admins.
          </p>
        </div>
      </div>
      <SignedInDevices
        idleMinutes={ADMIN_SESSION_POLICY.idleSeconds / 60}
        absoluteHours={ADMIN_SESSION_POLICY.absoluteSeconds / 3600}
      />
    </main>
  );
}
