import { ProfileForm } from "@/features/profile/profile-form";

export default function ProfilePage() {
  return (
    <main className="content">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Profile and privacy</h1>
          <p className="page-subtitle">
            Manage the details connected to your account and choose what may be shared in a relevant workflow.
          </p>
        </div>
      </div>
      <ProfileForm />
    </main>
  );
}
