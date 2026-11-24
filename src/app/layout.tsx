import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./design-system.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Farmess — Know the market. Decide with confidence.",
    template: "%s · Farmess",
  },
  description:
    "Record produce, compare reported mandi prices and understand the costs behind a selling decision.",
};

export const viewport: Viewport = {
  themeColor: "#173d32",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
