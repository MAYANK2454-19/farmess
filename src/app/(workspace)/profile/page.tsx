import { SignedInDevices } from "@/features/auth/signed-in-devices";
import { ProfileForm } from "@/features/profile/profile-form";
import { MyRatingPanel } from "@/features/ratings/my-rating-panel";
import { DEFAULT_SESSION_POLICY } from "@/lib/auth/session-policy";

export default function ProfilePage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Profile and privacy</h1>
          <p className="page-subtitle">
            Manage the details connected to your account and choose what may be shared in a relevant
            workflow.
          </p>
        </div>
      </div>
      <ProfileForm />
      <MyRatingPanel />
      <SignedInDevices
        idleMinutes={DEFAULT_SESSION_POLICY.idleSeconds / 60}
        absoluteHours={DEFAULT_SESSION_POLICY.absoluteSeconds / 3600}
      />
    </main>
  );
}
