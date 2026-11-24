import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "@/components/sign-out-button";

const navigation = [
  { label: "Overview", href: "/admin" },
  { label: "Market imports", href: "/admin/market-data" },
  { label: "Data health", href: "/admin/market-health" },
  { label: "Provider review", href: "/admin/providers" },
  { label: "Forecast review", href: "/admin/forecasts" },
];

export function AdminLayout({
  children,
  displayName,
}: {
  children: ReactNode;
  displayName: string;
}) {
  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Admin navigation">
        <Link href="/admin" className="admin-brand">
          farmess <span>STEWARDSHIP</span>
        </Link>
        <nav className="admin-nav">
          {navigation.map((item) => (
            <Link href={item.href} key={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <span>{displayName}</span>
          <span>Data steward</span>
        </div>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <span>Farmess data operations</span>
          <SignOutButton />
        </header>
        {children}
      </div>
    </div>
  );
}
