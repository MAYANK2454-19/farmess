import type { ReactNode, SVGProps } from "react";

type IconName =
  | "overview"
  | "produce"
  | "markets"
  | "compare"
  | "offers"
  | "logistics"
  | "activity"
  | "bell"
  | "plus"
  | "leaf"
  | "chevron"
  | "clock"
  | "user";

const paths: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="4" rx="1.5" />
      <rect x="13.5" y="10.5" width="7" height="10" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  produce: (
    <>
      <path d="M20.5 4.5c-7.2-.2-12 2.7-13.2 7.4-.8 3.2 1 6.2 4.1 6.7 5.1.8 9.4-5.4 9.1-13.1Z" />
      <path d="M3 21c2.7-5.8 7-9.6 13-12" />
    </>
  ),
  markets: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M5 17V10m5 7V5m5 12v-5m5 5V8" />
      <path d="m4 7 5-3 5 5 6-4" />
    </>
  ),
  compare: (
    <>
      <path d="M7 4v16M17 4v16M3.5 8h7M13.5 16h7" />
      <path d="m5.5 6 1.5-2 1.5 2m7 12 1.5 2 1.5-2" />
    </>
  ),
  offers: (
    <>
      <path d="M4 5.5h16v13H4z" />
      <path d="M8 9.5h8M8 13h5" />
      <path d="m15 16 2 2 3-4" />
    </>
  ),
  logistics: (
    <>
      <path d="M3 7h11v11H3zM14 11h4l3 3v4h-7z" />
      <circle cx="7" cy="19" r="1.5" />
      <circle cx="18" cy="19" r="1.5" />
    </>
  ),
  activity: (
    <>
      <path d="M4 17.5 9 12l3.5 3.5L20 7" />
      <path d="M14.5 7H20v5.5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
      <path d="M10 21h4" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14M5 12h14" />
    </>
  ),
  leaf: (
    <>
      <path d="M20.5 3.5C12 3.2 6 6.5 5 12c-.7 3.7 1.6 7 5 7.3 6 .5 10.8-7 10.5-15.8Z" />
      <path d="M3 21c3-6.3 7.4-10.6 13.5-13.5" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c.8-3.2 3.2-5 7-5s6.2 1.8 7 5" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
