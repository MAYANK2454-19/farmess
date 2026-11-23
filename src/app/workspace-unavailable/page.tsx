import Link from "next/link";

export default function WorkspaceUnavailablePage() {
  return (
    <main className="auth-page auth-page-single">
      <section className="auth-main">
        <div className="module-unavailable">
          <p className="module-status">Account recognised</p>
          <h1>This workspace is not ready for your account type.</h1>
          <p>
            Farmess currently has the farmer workspace connected. Buyer and service-provider
            workspaces are being built separately; your account role has not been changed.
          </p>
          <Link href="/login" className="button button-secondary">
            Return to sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
