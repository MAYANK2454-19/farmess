"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import {
  ACCOUNT_NAVIGATION,
  FARMER_NAVIGATION,
  MOBILE_NAVIGATION,
  getWorkspacePageLabel,
  isActiveRoute,
} from "@/lib/routes";

function Brand() {
  return (
    <div className="brand-block">
      <Link href="/farmer" className="brand" aria-label="Farmess overview">
        <span className="brand-name">farmess</span>
      </Link>
      <p className="brand-subtitle">Farmer tools</p>
    </div>
  );
}

export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Primary navigation">
        <Brand />
        <p className="nav-section-label">Your farm</p>
        <nav className="nav-list">
          {FARMER_NAVIGATION.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={"nav-link" + (isActiveRoute(pathname, item.href) ? " active" : "")}
              aria-current={isActiveRoute(pathname, item.href) ? "page" : undefined}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <p className="nav-section-label">Account</p>
        <nav className="nav-list">
          {ACCOUNT_NAVIGATION.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={"nav-link" + (isActiveRoute(pathname, item.href) ? " active" : "")}
              aria-current={isActiveRoute(pathname, item.href) ? "page" : undefined}
            >
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <p className="sidebar-preview-label">Preview build</p>
          <p className="sidebar-preview-copy">
            Sign-in and saved farmer records are not connected yet.
          </p>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <Link href="/farmer" className="mobile-brand" aria-label="Farmess overview">
            farmess
          </Link>
          <span className="topbar-context">{getWorkspacePageLabel(pathname)}</span>
          <div className="topbar-right">
            <Link href="/notifications" className="topbar-link">
              Notifications
            </Link>
            <Link href="/profile" className="topbar-link">
              Profile
            </Link>
          </div>
        </header>
        {children}
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {MOBILE_NAVIGATION.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={"mobile-nav-link" + (isActiveRoute(pathname, item.href) ? " active" : "")}
            aria-current={isActiveRoute(pathname, item.href) ? "page" : undefined}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
