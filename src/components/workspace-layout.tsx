"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";

const navigation = [
  { label: "Overview", href: "/farmer", icon: "overview" as const },
  { label: "My Produce", href: "/farmer/produce", icon: "produce" as const },
  { label: "Market Prices", href: "/farmer/markets", icon: "markets" as const },
  { label: "Compare Markets", href: "/farmer/compare", icon: "compare" as const },
  { label: "Buyer Offers", href: "/farmer/offers", icon: "offers" as const },
  { label: "Transport & Storage", href: "/farmer/logistics", icon: "logistics" as const },
  { label: "Sale Activity", href: "/farmer/activity", icon: "activity" as const },
];

function Brand() {
  return (
    <div>
      <Link href="/farmer" className="brand" aria-label="Farmess overview">
        <span className="brand-mark"><Icon name="leaf" size={21} /></span>
        <span className="brand-name">farmess</span>
      </Link>
      <p className="brand-subtitle">Farmer workspace</p>
    </div>
  );
}

export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/farmer") return pathname === "/farmer";
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Primary navigation">
        <Brand />
        <p className="nav-section-label">Workspace</p>
        <nav className="nav-list">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href} className={`nav-link${isActive(item.href) ? " active" : ""}`} aria-current={isActive(item.href) ? "page" : undefined}>
              <span className="nav-icon"><Icon name={item.icon} size={17} /></span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <p className="nav-section-label">Account</p>
        <nav className="nav-list">
          <Link href="/notifications" className={`nav-link${isActive("/notifications") ? " active" : ""}`} aria-current={isActive("/notifications") ? "page" : undefined}><span className="nav-icon"><Icon name="bell" size={17} /></span><span>Notifications</span></Link>
          <Link href="/profile" className={`nav-link${isActive("/profile") ? " active" : ""}`} aria-current={isActive("/profile") ? "page" : undefined}><span className="nav-icon"><Icon name="user" size={17} /></span><span>Profile & privacy</span></Link>
        </nav>
        <div className="sidebar-bottom">
          <div className="preview-note">
            <strong>Team build preview</strong>
            Some modules are still being connected. No real farmer records are stored in this build.
          </div>
          <div className="profile-mini">
            <span className="avatar">F</span>
            <span><span className="profile-name">Farmer workspace</span><br /><span className="profile-role">Preview mode</span></span>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <Link href="/farmer" className="mobile-brand"><span className="brand-mark"><Icon name="leaf" size={18} /></span>farmess</Link>
          <span className="topbar-context">Farmer workspace <span aria-hidden="true">/</span> {navigation.find((item) => isActive(item.href))?.label ?? (pathname === "/notifications" ? "Notifications" : pathname === "/profile" ? "Profile" : "Overview")}</span>
          <div className="topbar-right">
            <Link href="/notifications" className="notification-button" aria-label="Notifications">
              <Icon name="bell" size={17} />
            </Link>
            <Link href="/profile" className="topbar-link"><Icon name="user" size={16} /> Profile</Link>
          </div>
        </header>
        {children}
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        <Link href="/farmer" className={`mobile-nav-link${isActive("/farmer") ? " active" : ""}`} aria-current={isActive("/farmer") ? "page" : undefined}><Icon name="overview" size={18} />Overview</Link>
        <Link href="/farmer/produce" className={`mobile-nav-link${isActive("/farmer/produce") ? " active" : ""}`} aria-current={isActive("/farmer/produce") ? "page" : undefined}><Icon name="produce" size={18} />Produce</Link>
        <Link href="/farmer/markets" className={`mobile-nav-link${isActive("/farmer/markets") ? " active" : ""}`} aria-current={isActive("/farmer/markets") ? "page" : undefined}><Icon name="markets" size={18} />Markets</Link>
        <Link href="/farmer/compare" className={`mobile-nav-link${isActive("/farmer/compare") ? " active" : ""}`} aria-current={isActive("/farmer/compare") ? "page" : undefined}><Icon name="compare" size={18} />Compare</Link>
      </nav>
    </div>
  );
}
