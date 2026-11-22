export const FARMER_NAVIGATION = [
  { label: "Overview", href: "/farmer", icon: "overview" },
  { label: "My Produce", href: "/farmer/produce", icon: "produce" },
  { label: "Market Prices", href: "/farmer/markets", icon: "markets" },
  { label: "Compare Markets", href: "/farmer/compare", icon: "compare" },
  { label: "Buyer Offers", href: "/farmer/offers", icon: "offers" },
  { label: "Transport & Storage", href: "/farmer/logistics", icon: "logistics" },
  { label: "Sale Activity", href: "/farmer/activity", icon: "activity" },
] as const;

export const ACCOUNT_NAVIGATION = [
  { label: "Notifications", href: "/notifications", icon: "bell" },
  { label: "Profile & privacy", href: "/profile", icon: "user" },
] as const;

export const MOBILE_NAVIGATION = [
  { label: "Overview", href: "/farmer", icon: "overview" },
  { label: "Produce", href: "/farmer/produce", icon: "produce" },
  { label: "Markets", href: "/farmer/markets", icon: "markets" },
  { label: "Compare", href: "/farmer/compare", icon: "compare" },
] as const;

export const APP_ROUTE_FILES = [
  { href: "/farmer", file: "src/app/(workspace)/farmer/page.tsx" },
  { href: "/farmer/produce", file: "src/app/(workspace)/farmer/produce/page.tsx" },
  { href: "/farmer/produce/new", file: "src/app/(workspace)/farmer/produce/new/page.tsx" },
  { href: "/farmer/markets", file: "src/app/(workspace)/farmer/markets/page.tsx" },
  { href: "/farmer/compare", file: "src/app/(workspace)/farmer/compare/page.tsx" },
  { href: "/farmer/offers", file: "src/app/(workspace)/farmer/offers/page.tsx" },
  { href: "/farmer/logistics", file: "src/app/(workspace)/farmer/logistics/page.tsx" },
  { href: "/farmer/activity", file: "src/app/(workspace)/farmer/activity/page.tsx" },
  { href: "/notifications", file: "src/app/(workspace)/notifications/page.tsx" },
  { href: "/profile", file: "src/app/(workspace)/profile/page.tsx" },
] as const;

export function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/farmer") return pathname === href;
  return pathname === href || pathname.startsWith(href + "/");
}

export function getWorkspacePageLabel(pathname: string): string {
  const item = [...FARMER_NAVIGATION, ...ACCOUNT_NAVIGATION].find((entry) =>
    isActiveRoute(pathname, entry.href),
  );

  return item?.label ?? "Overview";
}
