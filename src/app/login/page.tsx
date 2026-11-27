import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { Icon, type IconName } from "@/components/icons";
import { AuthForm } from "@/features/auth/auth-form";
import { LanguageSwitcher } from "@/i18n/language-switcher";

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

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const { reason } = await searchParams;
  return (
    <main className="auth-page">
      <section className="auth-aside field-ground">
        <Link href="/" className="auth-wordmark" aria-label="Farmess home">
          <BrandLogo size={36} tone="light" />
        </Link>

        <div className="auth-aside-copy">
          <p className="auth-aside-kicker" lang="hi">
            खेत से मंडी तक
          </p>
          <h2>Know the market. Understand the costs. Decide with confidence.</h2>
          <ul className="auth-points">
            {VALUE_POINTS.map((point) => (
              <li key={point.title}>
                <span className="auth-point-icon" aria-hidden="true">
                  <Icon name={point.icon} size={19} />
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
        <div className="auth-language">
          <LanguageSwitcher />
        </div>
        <AuthForm reason={typeof reason === "string" ? reason : undefined} />
      </section>
    </main>
  );
}
