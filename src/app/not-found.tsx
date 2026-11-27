import Link from "next/link";

export default function NotFound() {
  return (
    <main className="auth-page auth-page-single">
      <section className="auth-main">
        <div className="module-unavailable">
          <p className="module-status">Page not found</p>
          <h1>This page does not exist.</h1>
          <p>The address may be mistyped, or the page may have moved.</p>
          <Link href="/" className="button button-secondary">
            Go to the Farmess home page
          </Link>
        </div>
      </section>
    </main>
  );
}
