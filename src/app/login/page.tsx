import Link from "next/link";
import { AuthForm } from "@/features/auth/auth-form";

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-aside">
        <Link href="/" className="auth-wordmark" aria-label="Farmess home">
          <span className="auth-mark">f</span>
          <span>farmess</span>
        </Link>
        <div className="auth-aside-copy">
          <p className="auth-aside-kicker">A farmer-first workspace</p>
          <h2>Good decisions begin with clear information.</h2>
          <p>
            Keep your produce details, reported market prices and selling costs together. Use
            information you can check, not promises you cannot verify.
          </p>
        </div>
        <p className="auth-aside-footer">Farmess · White, green and grounded in the details</p>
      </section>
      <section className="auth-main">
        <AuthForm />
      </section>
    </main>
  );
}
