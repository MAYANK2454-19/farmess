"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { BrandLogo, BrandMark } from "@/components/brand-logo";
import { Icon, type IconName } from "@/components/icons";
import { SignOutButton } from "@/components/sign-out-button";
import { SessionGuard } from "@/features/auth/session-guard";
import { LanguageSwitcher } from "@/i18n/language-switcher";
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

type NavItem = { label: string; href: string; icon: string; hindi?: string };

const SIDEBAR_STORAGE_KEY = "farmess.sidebar";

const ROLE_LABEL: Record<WorkspaceRole, string> = {
  farmer: "Farmer",
  buyer: "Buyer",
  operator: "Service operator",
  admin: "Admin",
};

const HOME_BY_ROLE: Record<WorkspaceRole, string> = {
  farmer: "/farmer",
  buyer: "/buyer",
  operator: "/operator",
  admin: "/admin",
};

function initialsOf(name: string) {
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials || "F";
}

/*
 * Sidebar collapse preference: persisted in localStorage, read through
 * useSyncExternalStore. An in-memory copy keeps the toggle working when
 * storage is unavailable (private mode, blocked site data).
 */
const SIDEBAR_CHANGE_EVENT = "farmess:sidebar-change";
let memoryCollapsed = false;

function readStoredCollapse(): boolean {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === null ? memoryCollapsed : stored === "collapsed";
  } catch {
    return memoryCollapsed;
  }
}

function storeCollapse(collapsed: boolean) {
  memoryCollapsed = collapsed;
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "collapsed" : "expanded");
  } catch {
    // Storage unavailable; the in-memory value still applies for this visit.
  }
  window.dispatchEvent(new Event(SIDEBAR_CHANGE_EVENT));
}

function subscribeToCollapse(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(SIDEBAR_CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(SIDEBAR_CHANGE_EVENT, onChange);
  };
}

const serverCollapseSnapshot = () => false;

function NavigationLinks({
  items,
  pathname,
  collapsed,
}: {
  items: readonly NavItem[];
  pathname: string;
  collapsed: boolean;
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
            title={collapsed ? item.label : undefined}
          >
            <span className="nav-icon">
              <Icon name={item.icon as IconName} size={19} />
            </span>
            <span className="nav-text">
              <span className="nav-label">{item.label}</span>
              {item.hindi ? (
                <span className="nav-hindi" lang="hi">
                  {item.hindi}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

export function WorkspaceLayout({ children, user }: { children: ReactNode; user: WorkspaceUser }) {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(
    subscribeToCollapse,
    readStoredCollapse,
    serverCollapseSnapshot,
  );
  // The drawer remembers the page it was opened on, so navigating closes it.
  const [drawerPath, setDrawerPath] = useState<string | null>(null);
  const drawerOpen = drawerPath === pathname;
  const setDrawerOpen = useCallback(
    (open: boolean) => setDrawerPath(open ? pathname : null),
    [pathname],
  );
  const home = HOME_BY_ROLE[user.role];
  const pageLabel = getWorkspacePageLabel(pathname, user.role);

  useEffect(() => {
    if (!drawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerPath(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [drawerOpen]);

  const toggleCollapsed = useCallback(() => storeCollapse(!readStoredCollapse()), []);

  return (
    <div
      className="workspace"
      data-sidebar={collapsed ? "collapsed" : "expanded"}
      data-drawer={drawerOpen ? "open" : "closed"}
    >
      <SessionGuard role={user.role} />
      <aside className="sidebar" id="workspace-sidebar" aria-label="Primary navigation">
        <div className="sidebar-head">
          <Link href={home} className="brand" aria-label="Farmess home">
            <BrandLogo size={34} tone="light" />
          </Link>
          <button
            type="button"
            className="sidebar-toggle"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            aria-controls="workspace-sidebar"
          >
            <Icon name="sidebar" size={18} />
          </button>
          <button
            type="button"
            className="drawer-close"
            onClick={() => setDrawerOpen(false)}
            aria-label="Close menu"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="sidebar-role">
          <span className="sidebar-avatar" aria-hidden="true">
            {initialsOf(user.displayName)}
          </span>
          <span className="sidebar-role-copy">
            <strong>{user.displayName}</strong>
            <span>{ROLE_LABEL[user.role]} workspace</span>
          </span>
        </div>

        <p className="nav-section-label">Workspace</p>
        <NavigationLinks
          items={NAVIGATION_BY_ROLE[user.role]}
          pathname={pathname}
          collapsed={collapsed}
        />

        {/* Notifications and the profile belong to the farmer, buyer and provider workspaces. */}
        {user.role !== "admin" ? (
          <>
            <p className="nav-section-label">Account</p>
            <NavigationLinks items={ACCOUNT_NAVIGATION} pathname={pathname} collapsed={collapsed} />
          </>
        ) : null}

        <div className="sidebar-bottom">
          <div className="sidebar-trust">
            <Icon name="shield" size={17} />
            <span>
              Every price shows its source and date. Unknown costs are never counted as zero.
            </span>
          </div>
        </div>
      </aside>

      <button
        type="button"
        className="drawer-scrim"
        aria-label="Close menu"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={() => setDrawerOpen(false)}
      />

      <div className="main-area">
        <header className="topbar">
          <button
            type="button"
            className="topbar-menu"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            aria-expanded={drawerOpen}
            aria-controls="workspace-sidebar"
          >
            <Icon name="menu" size={20} />
          </button>
          <Link href={home} className="mobile-brand" aria-label="Farmess home">
            <BrandMark size={30} />
          </Link>
          <div className="topbar-context">
            <span className="topbar-crumb">{ROLE_LABEL[user.role]}</span>
            <span className="topbar-crumb-separator" aria-hidden="true">
              /
            </span>
            <span className="topbar-page" aria-current="page">
              {pageLabel}
            </span>
          </div>
          <div className="topbar-right">
            <LanguageSwitcher />
            {user.role === "admin" ? (
              <Link
                href="/admin/security"
                className="topbar-icon-button"
                aria-label="Sign-in and security"
              >
                <Icon name="user" size={18} />
              </Link>
            ) : (
              <>
                <Link
                  href="/notifications"
                  className={
                    "topbar-icon-button" +
                    (isActiveRoute(pathname, "/notifications") ? " active" : "")
                  }
                  aria-label="Notifications"
                >
                  <Icon name="bell" size={18} />
                </Link>
                <Link
                  href="/profile"
                  className="topbar-icon-button"
                  aria-label="Profile and privacy"
                >
                  <Icon name="user" size={18} />
                </Link>
              </>
            )}
            <SignOutButton role={user.role} />
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
              <Icon name={item.icon as IconName} size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
