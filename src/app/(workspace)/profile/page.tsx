export default function ProfilePage() {
  return (
    <main className="content module-page profile-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Farmess</p>
          <h1>Profile and privacy</h1>
          <p className="page-subtitle">
            Account details and sharing preferences will be managed here.
          </p>
        </div>
      </div>

      <section className="module-unavailable" aria-labelledby="profile-status-heading">
        <h2 id="profile-status-heading">Account setup is not connected</h2>
        <p>
          You can browse the current preview, but there is no sign-in or saved profile attached to
          this page yet. For that reason, profile fields and consent switches are not shown as
          working controls.
        </p>
        <p>
          When account setup is added, location and contact sharing will be controlled by the
          privacy settings on your account and checked on the server.
        </p>
      </section>
    </main>
  );
}
