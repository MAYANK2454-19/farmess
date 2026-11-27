import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BrandLogo } from "@/components/brand-logo";
import { AuthForm } from "@/features/auth/auth-form";
import { LanguageSwitcher } from "@/i18n/language-switcher";
import { getFarmessSession } from "@/lib/auth/session";
import { isAdminPortalKey } from "@/lib/security/server-secret";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

/**
 * The admin sign-in page. It has no link anywhere on the site and answers only
 * at an address derived from the server secret; every other address under
 * /access is an ordinary "page not found". Knowing the address grants nothing
 * by itself: an admin email and password are still required.
 */
export default async function PrivateAdminSignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ reason?: string | string[] }>;
}) {
  const { key } = await params;
  if (!isAdminPortalKey(key)) notFound();

  const session = await getFarmessSession();
  if (session?.role === "admin") redirect("/admin");

  const { reason } = await searchParams;
  return (
    <main className="auth-page auth-page-single">
      <section className="auth-main">
        <div className="auth-language">
          <LanguageSwitcher />
        </div>
        <div className="auth-single-brand">
          <BrandLogo size={34} />
        </div>
        <AuthForm variant="admin" reason={typeof reason === "string" ? reason : undefined} />
      </section>
    </main>
  );
}
