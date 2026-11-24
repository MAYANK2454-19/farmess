import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, Noto_Sans_Devanagari } from "next/font/google";
import type { ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./design-system.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-bricolage",
});

const body = Instrument_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-instrument",
});

const hindi = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-devanagari",
});

export const metadata: Metadata = {
  title: {
    default: "Farmess — Know the market. Decide with confidence.",
    template: "%s · Farmess",
  },
  description:
    "Farmess helps small farmers compare reported mandi prices, understand every selling cost and decide where and when to sell.",
  applicationName: "Farmess",
};

export const viewport: Viewport = {
  themeColor: "#12372c",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${hindi.variable}`}>
      <body>{children}</body>
    </html>
  );
}
