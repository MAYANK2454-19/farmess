import type { SVGProps } from "react";

type Ground = "solid" | "glass";

/**
 * Farmess mark: a sprout whose stem rises like a price trend line —
 * the farm and the market in one symbol. Keep in sync with app/icon.svg.
 *
 * `ground="glass"` draws a translucent tile for use on dark brand backgrounds.
 */
export function BrandMark({
  size = 32,
  ground = "solid",
  ...props
}: SVGProps<SVGSVGElement> & { size?: number; ground?: Ground }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {ground === "glass" ? (
        <rect
          x="1"
          y="1"
          width="62"
          height="62"
          rx="17"
          fill="#ffffff"
          fillOpacity="0.08"
          stroke="#ffffff"
          strokeOpacity="0.2"
          strokeWidth="2"
        />
      ) : (
        <rect width="64" height="64" rx="18" fill="#12372c" />
      )}
      <path d="M13 51h38" stroke="#2f6b4f" strokeWidth="3" strokeLinecap="round" />
      <path
        d="M17 47c9.5-1.6 16.6-8.1 21.4-19.6"
        stroke="#f5f3ec"
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      <path d="M28.3 39.7c-5.6-1.4-8.7-6.2-8.1-12.4 5.7 1.3 8.9 6.2 8.1 12.4Z" fill="#8fc2a0" />
      <path d="M38.4 27.4c-.3-9.1 5.3-14.9 14.6-15.4.4 9.1-5.3 14.9-14.6 15.4Z" fill="#e8a33a" />
    </svg>
  );
}

export function BrandLogo({
  size = 32,
  tone = "dark",
  className,
}: {
  size?: number;
  tone?: "dark" | "light";
  className?: string;
}) {
  return (
    <span className={"brand-logo brand-logo-" + tone + (className ? " " + className : "")}>
      <BrandMark size={size} ground={tone === "light" ? "glass" : "solid"} />
      <span className="brand-logo-word">Farmess</span>
    </span>
  );
}
