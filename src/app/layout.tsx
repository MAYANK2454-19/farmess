import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Instrument_Sans, Noto_Sans_Devanagari } from "next/font/google";
import type { ReactNode } from "react";
import "leaflet/dist/leaflet.css";
import "./globals.css";
import "./design-system.css";
import { I18nStarter } from "@/i18n/language-switcher";
import { LANGUAGE_COOKIE, LANGUAGE_STORAGE_KEY } from "@/i18n/languages";

/**
 * Runs before the page is shown. If a language other than English was chosen
 * on an earlier visit, the page is kept hidden for a moment so English text
 * does not flash before the translation is applied (at most 2.5 seconds, in
 * case the dictionary cannot be loaded).
 */
const LANGUAGE_BOOT = `(function(){try{var l=null;try{l=localStorage.getItem("${LANGUAGE_STORAGE_KEY}")}catch(e){}if(!l){var m=document.cookie.match(/(?:^|; )${LANGUAGE_COOKIE}=([a-z]{2,3})/);l=m&&m[1]}if(l&&l!=="en"){var d=document.documentElement;d.setAttribute("data-i18n","pending");d.setAttribute("data-i18n-pending","");setTimeout(function(){d.removeAttribute("data-i18n-pending")},2500)}}catch(e){}})();`;

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
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${hindi.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANGUAGE_BOOT }} />
      </head>
      <body>
        <I18nStarter />
        {children}
      </body>
    </html>
  );
}
