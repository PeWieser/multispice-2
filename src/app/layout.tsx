import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "CircuitLab Studio — EDA & SPICE Simulator",
  description:
    "Moderner EDA-Arbeitsplatz mit SPICE-Simulationskern: Schaltplan-Editor, Echtzeitsimulation, virtuelle Messgeräte, Monte-Carlo- und Rauschanalyse.",
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "512x512" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.png",
    apple: "/favicon.png",
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body className="h-full antialiased select-none">{children}</body>
    </html>
  );
}
