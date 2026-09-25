import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const DESCRIPTION =
  "Multispice: moderner EDA-Arbeitsplatz mit SPICE-Simulationskern – Schaltplan-Editor, Echtzeitsimulation, virtuelle Messgeräte, Monte-Carlo- und Rauschanalyse. Komplett im Browser, ohne Server.";

export const metadata: Metadata = {
  // Kanonische Basis für OG-/Twitter-URLs im statischen Export (Pages-Projekt-Default).
  metadataBase: new URL("https://circuitlab-studio.pages.dev"),
  applicationName: "Multispice",
  title: {
    default: "Multispice — EDA & SPICE-Simulator im Browser",
    template: "%s — Multispice",
  },
  description: DESCRIPTION,
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "512x512" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "de_DE",
    siteName: "Multispice",
    title: "Multispice — EDA & SPICE-Simulator im Browser",
    description: DESCRIPTION,
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "Multispice – Schaltplan-Editor mit Oszilloskop-Trace und Messpunkten",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Multispice — EDA & SPICE-Simulator im Browser",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  // Browser-Zoom bewusst erlaubt (WCAG 1.4.4) – nur die Farben folgen dem System.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0b0d12" },
    { media: "(prefers-color-scheme: light)", color: "#f2f4f8" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="h-full antialiased">{children}</body>
    </html>
  );
}
