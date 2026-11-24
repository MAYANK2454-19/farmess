import type { Metadata } from "next";
import Link from "next/link";
import { Icon, type IconName } from "@/components/icons";
import { AuthForm } from "@/features/auth/auth-form";

export const metadata: Metadata = {
  title: "Sign in",
};

const VALUE_POINTS: { icon: IconName; title: string; copy: string }[] = [
  {
    icon: "markets",
    title: "Reported mandi prices",
    copy: "Every observation shows its market, date, unit and source.",
  },
  {
    icon: "rupee",
    title: "Net return, not headline price",
    copy: "See what remains after transport, handling and market charges.",
  },
  {
    icon: "shield",
    title: "Your data stays private",
    copy: "Exact location and contact details are shared only with consent.",
  },
];

export default function LoginPage() {
  return (
    <main className="auth-page">
      <section className="auth-aside">
        <Link href="/" className="auth-wordmark" aria-label="Farmess home">
          <span className="auth-mark">
            <Icon name="leaf" size={18} />
          </span>
          <span>Farmess</span>
        </Link>

        <div className="auth-aside-copy">
          <p className="auth-aside-kicker">Farmer-to-market decision support</p>
          <h2>Know the market. Understand the costs. Decide with confidence.</h2>
          <ul className="auth-points">
            {VALUE_POINTS.map((point) => (
              <li key={point.title}>
                <span className="auth-point-icon" aria-hidden="true">
                  <Icon name={point.icon} size={18} />
                </span>
                <span>
                  <strong>{point.title}</strong>
                  <span>{point.copy}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="auth-aside-footer">
          Farmess supports your decision — you stay in control of every sale.
        </p>
      </section>
      <section className="auth-main">
        <AuthForm />
      </section>
    </main>
  );
}
