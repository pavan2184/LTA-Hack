import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";
import "@/components/plans/planner-workspace.css";
import "./workspace.css";

/**
 * IBM Plex, self-hosted by Next at build time — no runtime request to a font
 * CDN, so the dashboard renders identically offline.
 *
 * Plex was drawn for interfaces where misreading a character has consequences:
 * 1, l and I are unmistakable, as are 0 and O, and it ships true tabular
 * figures. Plex Mono is its matching companion, used for anything a planner
 * compares down a column or reads aloud — request ids, block ids, clock times,
 * the input digest.
 */
const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "RailPlan — overnight engineering planning",
  description:
    "Detects constraint violations in submitted rail maintenance requests, builds a schedule that satisfies them, and verifies its own answer.",
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
