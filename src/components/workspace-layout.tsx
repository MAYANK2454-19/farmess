"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { SignOutButton } from "@/components/sign-out-button";
import {
  ACCOUNT_NAVIGATION,
  FARMER_NAVIGATION,
  MOBILE_NAVIGATION,
  getWorkspacePageLabel,
  isActiveRoute,
} from "@/lib/routes";

type WorkspaceUser = {
  displayName: string;
  email: string | null;
};

function Brand() {
  return (
    <div className="brand-block">
      <Link href="/farmer" className="brand" aria-label="Farmess overview">
        <span className="brand-mark">
          <Icon name="leaf" size={18} />
        </span>
        <span className="brand-name">farmess</span>
      </Link>
      <p className="brand-subtitle">A better way to plan your sale</p>
    </div>
  );
}

function NavigationLinks({
  items,
  pathname,
}: {
  items: readonly { label: string; href: string; icon: string }[];
  pathname: string;
}) {
  return (
    <nav className="nav-list">
      {items.map((item) => {
        const active = isActiveRoute(pathname, item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={"nav-link" + (active ? " active" : "")}
            aria-current={active ? "page" : undefined}
          >
            <span className="nav-icon">
              <Icon name={item.icon as Parameters<typeof Icon>[0]["name"]} size={16} />
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function WorkspaceLayout({
  children,
  user,
}: {
  children: ReactNode;
  user: WorkspaceUser;
}) {
  const pathname = usePathname();

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Primary navigation">
        <Brand />
        <p className="nav-section-label">Workspace</p>
        <NavigationLinks items={FARMER_NAVIGATION} pathname={pathname} />
        <p className="nav-section-label">Account</p>
        <NavigationLinks items={ACCOUNT_NAVIGATION} pathname={pathname} />
        <div className="sidebar-bottom">
          <div className="sidebar-account">
            <span className="sidebar-avatar" aria-hidden="true">
              {user.displayName.slice(0, 1).toUpperCase()}
            </span>
            <span className="sidebar-user-copy">
              <strong className="sidebar-user-name">{user.displayName}</strong>
              <span className="sidebar-user-email">{user.email ?? "Signed in"}</span>
            </span>
          </div>
          <p className="sidebar-preview-label">Farmess workspace</p>
          <p className="sidebar-preview-copy">
            Market reports show their source and date. Other records stay within your account.
          </p>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <Link href="/farmer" className="mobile-brand" aria-label="Farmess overview">
            <span className="brand-mark">
              <Icon name="leaf" size={16} />
            </span>
            <span>farmess</span>
          </Link>
          <span className="topbar-context">{getWorkspacePageLabel(pathname)}</span>
          <div className="topbar-right">
            <Link href="/notifications" className="topbar-link">
              <Icon name="bell" size={15} />
              <span>Notifications</span>
            </Link>
            <Link href="/profile" className="topbar-link">
              <Icon name="user" size={15} />
              <span>Profile</span>
            </Link>
            <SignOutButton />
          </div>
        </header>
        {children}
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {MOBILE_NAVIGATION.map((item) => {
          const active = isActiveRoute(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={"mobile-nav-link" + (active ? " active" : "")}
              aria-current={active ? "page" : undefined}
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
