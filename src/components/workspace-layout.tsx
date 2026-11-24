"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons";
import { SignOutButton } from "@/components/sign-out-button";
import {
  ACCOUNT_NAVIGATION,
  NAVIGATION_BY_ROLE,
  MOBILE_NAVIGATION_BY_ROLE,
  getWorkspacePageLabel,
  isActiveRoute,
} from "@/lib/routes";

type WorkspaceRole = keyof typeof NAVIGATION_BY_ROLE;

type WorkspaceUser = {
  displayName: string;
  email: string | null;
  role: WorkspaceRole;
};

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  farmer: "Farmer workspace",
  buyer: "Buyer workspace",
  operator: "Operator workspace",
  admin: "Admin",
};

const HOME_BY_ROLE: Record<WorkspaceRole, string> = {
  farmer: "/farmer",
  buyer: "/buyer",
  operator: "/operator",
  admin: "/admin",
};

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials || "F";
}

function Brand({ href }: { href: string }) {
  return (
    <Link href={href} className="brand" aria-label="Farmess home">
      <span className="brand-mark">
        <Icon name="leaf" size={17} />
      </span>
      <span className="brand-name">Farmess</span>
    </Link>
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
              <Icon name={item.icon as IconName} size={17} />
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
  const home = HOME_BY_ROLE[user.role];
  const pageLabel = getWorkspacePageLabel(pathname, user.role);
  const initials = initialsOf(user.displayName);

  return (
    <div className="workspace">
      <aside className="sidebar" aria-label="Primary navigation">
        <div className="brand-block">
          <Brand href={home} />
          <span className="role-badge">{ROLE_LABEL[user.role]}</span>
        </div>

        <p className="nav-section-label">Workspace</p>
        <NavigationLinks items={NAVIGATION_BY_ROLE[user.role]} pathname={pathname} />

        <p className="nav-section-label">Account</p>
        <NavigationLinks items={ACCOUNT_NAVIGATION} pathname={pathname} />

        <div className="sidebar-bottom">
          <div className="sidebar-trust">
            <Icon name="shield" size={16} />
            <span>Prices show their source and date. Unknown costs are never counted as zero.</span>
          </div>
        </div>
      </aside>

      <div className="main-area">
        <header className="topbar">
          <Link href={home} className="mobile-brand" aria-label="Farmess home">
            <span className="brand-mark">
              <Icon name="leaf" size={15} />
            </span>
            <span>Farmess</span>
          </Link>
          <div className="topbar-context" aria-label="Current page">
            <span className="topbar-crumb">{ROLE_LABEL[user.role]}</span>
            <Icon name="chevron" size={14} className="topbar-crumb-separator" />
            <span className="topbar-page">{pageLabel}</span>
          </div>
          <div className="topbar-right">
            <Link
              href="/notifications"
              className={
                "topbar-icon-button" + (isActiveRoute(pathname, "/notifications") ? " active" : "")
              }
              aria-label="Notifications"
            >
              <Icon name="bell" size={18} />
            </Link>
            <Link href="/profile" className="topbar-user" aria-label="Profile and privacy">
              <span className="sidebar-avatar" aria-hidden="true">
                {initials}
              </span>
              <span className="topbar-user-copy">
                <strong>{user.displayName}</strong>
                <span>{user.email ?? "Signed in"}</span>
              </span>
            </Link>
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
              <Icon name={item.icon as IconName} size={19} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
