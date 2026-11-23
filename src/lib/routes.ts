export const FARMER_NAVIGATION = [
  { label: "Overview", href: "/farmer", icon: "overview" },
  { label: "My Produce", href: "/farmer/produce", icon: "produce" },
  { label: "Market Prices", href: "/farmer/markets", icon: "markets" },
  { label: "Compare Markets", href: "/farmer/compare", icon: "compare" },
  { label: "Buyer Offers", href: "/farmer/offers", icon: "offers" },
  { label: "Transport & Storage", href: "/farmer/logistics", icon: "logistics" },
  { label: "Sale Activity", href: "/farmer/activity", icon: "activity" },
] as const;

export const BUYER_NAVIGATION = [
  { label: "Overview", href: "/buyer", icon: "overview" },
  { label: "My Requirements", href: "/buyer/requirements", icon: "produce" },
  { label: "Matches", href: "/buyer/matches", icon: "compare" },
  { label: "Marketplace", href: "/buyer/marketplace", icon: "markets" },
  { label: "My Offers", href: "/buyer/offers", icon: "offers" },
] as const;

export const OPERATOR_NAVIGATION = [
  { label: "Overview", href: "/operator", icon: "overview" },
  { label: "Service Listings", href: "/operator/services", icon: "logistics" },
  { label: "Requests", href: "/operator/requests", icon: "activity" },
] as const;

export const ACCOUNT_NAVIGATION = [
  { label: "Notifications", href: "/notifications", icon: "bell" },
  { label: "Profile & privacy", href: "/profile", icon: "user" },
] as const;

export const NAVIGATION_BY_ROLE = {
  farmer: FARMER_NAVIGATION,
  buyer: BUYER_NAVIGATION,
  operator: OPERATOR_NAVIGATION,
  admin: OPERATOR_NAVIGATION,
} as const;

export const MOBILE_NAVIGATION_BY_ROLE = {
  farmer: [
    { label: "Overview", href: "/farmer", icon: "overview" },
    { label: "Produce", href: "/farmer/produce", icon: "produce" },
    { label: "Markets", href: "/farmer/markets", icon: "markets" },
    { label: "Compare", href: "/farmer/compare", icon: "compare" },
  ],
  buyer: BUYER_NAVIGATION.slice(0, 4),
  operator: OPERATOR_NAVIGATION,
  admin: OPERATOR_NAVIGATION,
} as const;

export const APP_ROUTE_FILES = [
  { href: "/farmer", file: "src/app/(workspace)/farmer/page.tsx" },
  { href: "/farmer/produce", file: "src/app/(workspace)/farmer/produce/page.tsx" },
  { href: "/farmer/produce/new", file: "src/app/(workspace)/farmer/produce/new/page.tsx" },
  { href: "/farmer/markets", file: "src/app/(workspace)/farmer/markets/page.tsx" },
  { href: "/farmer/compare", file: "src/app/(workspace)/farmer/compare/page.tsx" },
  { href: "/farmer/offers", file: "src/app/(workspace)/farmer/offers/page.tsx" },
  { href: "/farmer/logistics", file: "src/app/(workspace)/farmer/logistics/page.tsx" },
  { href: "/farmer/activity", file: "src/app/(workspace)/farmer/activity/page.tsx" },
  { href: "/buyer", file: "src/app/(workspace)/buyer/page.tsx" },
  { href: "/buyer/requirements", file: "src/app/(workspace)/buyer/requirements/page.tsx" },
  { href: "/buyer/marketplace", file: "src/app/(workspace)/buyer/marketplace/page.tsx" },
  { href: "/buyer/offers", file: "src/app/(workspace)/buyer/offers/page.tsx" },
  { href: "/operator", file: "src/app/(workspace)/operator/page.tsx" },
  { href: "/operator/services", file: "src/app/(workspace)/operator/services/page.tsx" },
  { href: "/operator/requests", file: "src/app/(workspace)/operator/requests/page.tsx" },
  { href: "/notifications", file: "src/app/(workspace)/notifications/page.tsx" },
  { href: "/profile", file: "src/app/(workspace)/profile/page.tsx" },
] as const;

export function isActiveRoute(pathname: string, href: string): boolean {
  if (href === "/farmer" || href === "/buyer" || href === "/operator") {
    return pathname === href;
  }
  return pathname === href || pathname.startsWith(href + "/");
}

export function getWorkspacePageLabel(
  pathname: string,
  role: keyof typeof NAVIGATION_BY_ROLE,
): string {
  const item = [...NAVIGATION_BY_ROLE[role], ...ACCOUNT_NAVIGATION].find((entry) =>
    isActiveRoute(pathname, entry.href),
  );

  return item?.label ?? "Overview";
}
