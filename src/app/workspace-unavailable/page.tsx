import Link from "next/link";

export default function WorkspaceUnavailablePage() {
  return (
    <main className="auth-page auth-page-single">
      <section className="auth-main">
        <div className="module-unavailable">
          <p className="module-status">Workspace not enabled</p>
          <h1>This account does not have an available workspace.</h1>
          <p>
            Farmess keeps farmer, buyer and service-provider access separate. This account has
            been recognised, but its role does not currently have a supported workspace.
          </p>
          <p>
            Public sign-up creates farmer accounts only. Buyer and service-provider access must
            be provisioned through an authorised process; changing a browser field cannot grant
            another role.
          </p>
          <Link href="/login" className="button button-secondary">Return to sign in</Link>
        </div>
      </section>
    </main>
  );
}
