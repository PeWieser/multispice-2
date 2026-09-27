"use client";

/**
 * Plattform-Wahrheit für Tastenkürzel: Auf Windows/Linux sieht der Nutzer
 * Strg/Alt/Shift, auf macOS ⌘/⌥/⇧. Keine Apple-Glyphen auf fremden Tastaturen.
 *
 * Hydration-sicher: `useIsApple()` liefert serverseitig (statischer Export) und
 * im ersten Client-Render `true` (Apple-Glyphen wie im geprerenderten HTML) und
 * wechselt erst nach dem Mount auf den echten Plattformwert — kein Mismatch.
 */

import { useSyncExternalStore } from "react";

let cached: boolean | null = null;

export function isApplePlatform(): boolean {
  if (cached !== null) return cached;
  if (typeof navigator === "undefined") {
    cached = true; // Build/Prerender: Apple-Glyphen sind die Quellform.
    return cached;
  }
  const ua = navigator.userAgent || "";
  const plat = String((navigator as unknown as { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || "");
  cached = /Mac|iPhone|iPad|iPod/i.test(plat) || /Mac OS X|iPhone|iPad|iPod/i.test(ua);
  return cached;
}

const noopSubscribe = () => () => {};

/** Hydration-sicherer Hook: erste Client-Render = Server-Snapshot (Apple), dann echt. */
export function useIsApple(): boolean {
  return useSyncExternalStore(noopSubscribe, () => isApplePlatform(), () => true);
}

/**
 * Wandelt Apple-Glyphen in die Windows/Linux-Schreibweise (deutsch: Strg).
 * `apple === true` lässt den Text unverändert.
 */
export function adaptShortcut(text: string, apple: boolean = isApplePlatform()): string {
  if (apple || !text) return text;
  return text
    .replace(/⇧\s*⌘|⌘\s*⇧/g, "Strg+Shift+")
    .replace(/⌥\s*⌘|⌘\s*⌥/g, "Strg+Alt+")
    .replace(/⌘/g, "Strg+")
    .replace(/⌥/g, "Alt+")
    .replace(/⇧/g, "Shift+")
    .replace(/⏎/g, "Enter")
    .replace(/⌫/g, "Entf")
    .replace(/␣/g, "Leertaste");
}
