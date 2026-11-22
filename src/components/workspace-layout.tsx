"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/icons";
import {
  ACCOUNT_NAVIGATION,
  FARMER_NAVIGATION,
  MOBILE_NAVIGATION,
  getWorkspacePageLabel,
  isActiveRoute,
} from "@/lib/routes";

function Brand() {
  return (
    <div>
      <Link href="/farmer" className="brand" aria-label="Farmess overview">
        <span className="brand-mark">
          <Icon name="leaf" size={21} />
        </span>
        <span className="brand-name">farmess</span>
      </Link>
      <p className="brand-subtitle">Farmer workspace</p>
    </div>
  );
}

export function WorkspaceLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Primary navigation">
        <Brand />
        <p className="nav-section-label">Workspace</p>
        <nav className="nav-list">
          {FARMER_NAVIGATION.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={"nav-link" + (isActiveRoute(pathname, item.href) ? " active" : "")}
              aria-current={isActiveRoute(pathname, item.href) ? "page" : undefined}
            >
              <span className="nav-icon">
                <Icon name={item.icon} size={17} />
              </span>
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
              <span className="nav-icon">
                <Icon name={item.icon} size={17} />
              </span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="preview-note">
            <strong>Team build preview</strong>
            Some modules are still being connected. No real farmer records are stored in this build.
          </div>
          <div className="profile-mini">
            <span className="avatar">F</span>
            <span>
              <span className="profile-name">Farmer workspace</span>
              <br />
              <span className="profile-role">Preview mode</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <Link href="/farmer" className="mobile-brand">
            <span className="brand-mark">
              <Icon name="leaf" size={18} />
            </span>
            farmess
          </Link>
          <span className="topbar-context">
            Farmer workspace <span aria-hidden="true">/</span> {getWorkspacePageLabel(pathname)}
          </span>
          <div className="topbar-right">
            <Link href="/notifications" className="notification-button" aria-label="Notifications">
              <Icon name="bell" size={17} />
            </Link>
            <Link href="/profile" className="topbar-link">
              <Icon name="user" size={16} /> Profile
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
            <Icon name={item.icon} size={18} />
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
