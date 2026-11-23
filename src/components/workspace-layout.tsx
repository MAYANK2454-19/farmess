"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon } from "@/components/icons";
import { SignOutButton } from "@/components/sign-out-button";
import {
  ACCOUNT_NAVIGATION,
  NAVIGATION_BY_ROLE,
  MOBILE_NAVIGATION_BY_ROLE,
  isActiveRoute,
} from "@/lib/routes";

type WorkspaceRole = keyof typeof NAVIGATION_BY_ROLE;

type WorkspaceUser = {
  displayName: string;
  email: string | null;
  role: WorkspaceRole;
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

export function WorkspaceLayout({ children, user }: { children: ReactNode; user: WorkspaceUser }) {
  const pathname = usePathname();

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Primary navigation">
        <Brand />
        <NavigationLinks items={NAVIGATION_BY_ROLE[user.role]} pathname={pathname} />
        <div className="sidebar-account-nav">
          <NavigationLinks items={ACCOUNT_NAVIGATION} pathname={pathname} />
        </div>
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
          <div className="topbar-right">
            <SignOutButton />
          </div>
        </header>
        {children}
      </div>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {MOBILE_NAVIGATION_BY_ROLE[user.role].map((item) => {
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
