/**
 * W69 (Runde 26): Schaltzeichen für den Bauteilstreifen.
 *
 * Vorher stand dort das Kategorie-Symbol plus Textkürzel („R", „C", „GND").
 * Ein Symbol ohne Beschriftung ist schneller zu erfassen – und es zeigt gleich,
 * wie das Bauteil auf dem Plan aussehen wird. Alle Glyphen sind reine SVG-Pfade
 * (currentColor) und werden mit derselben Strichstärke gezeichnet.
 */
import type { ReactNode } from "react";

const S = 1.6;

function Wrap({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

/** Widerstand (Zickzack, ANSI) */
export function ResistorGlyph({ size }: { size?: number }) {
  return (
    <Wrap size={size}>
      <path d="M2 12h2.4l1.6-5 2.4 10 2.4-10 2.4 10 1.6-5H22" />
    </Wrap>
  );
}

/** Kondensator (zwei Platten, unpolarisiert) */
export function CapacitorGlyph({ size }: { size?: number }) {
  return (
    <Wrap size={size}>
      <path d="M2 12h6M16 12h6" />
      <path d="M9 6.5v11M15 6.5v11" />
    </Wrap>
  );
}

/** Spule (drei Bögen) */
export function InductorGlyph({ size }: { size?: number }) {
  return (
    <Wrap size={size}>
      <path d="M2 12h2.5a2.4 2.4 0 0 1 4.8 0 2.4 2.4 0 0 1 4.8 0 2.4 2.4 0 0 1 4.8 0H22" />
    </Wrap>
  );
}

/** Diode (Dreieck + Sperrlinie) */
export function DiodeGlyph({ size }: { size?: number }) {
  return (
    <Wrap size={size}>
      <path d="M2 12h4M18 12h4" />
      <path d="M6.5 7.5v9L14 12z" />
      <path d="M14 7.5v9" />
    </Wrap>
  );
}

/** Spannungsquelle (Kreis mit + / −) */
export function SourceGlyph({ size }: { size?: number }) {
  return (
    <Wrap size={size}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8.4v7.2M8.8 12h2.4" />
    </Wrap>
  );
}

/** Masse (drei kürzer werdende Striche) */
export function GroundGlyph({ size }: { size?: number }) {
  return (
    <Wrap size={size}>
      <path d="M12 3.5v9" />
      <path d="M6.5 12.5h11M8.6 16h6.8M10.6 19.4h2.8" />
    </Wrap>
  );
}

/**
 * W69: Symbol je Bauteil. Fällt auf das Kategorie-Symbol zurück, wenn ein
 * Bauteil im Streifen kein eigenes Zeichen hat.
 */
export function PartGlyph({ partId, category, size = 20 }: { partId: string; category: string; size?: number }) {
  const key = partId.toLowerCase();
  if (key.startsWith("resistor")) return <ResistorGlyph size={size} />;
  if (key.startsWith("capacitor")) return <CapacitorGlyph size={size} />;
  if (key.startsWith("inductor")) return <InductorGlyph size={size} />;
  if (key.startsWith("diode") || key.includes("led") || key.includes("zener") || key.includes("schottky")) return <DiodeGlyph size={size} />;
  if (key === "gnd" || key.includes("ground")) return <GroundGlyph size={size} />;
  if (key.startsWith("vdc") || key.startsWith("vs") || key.startsWith("vac") || key.includes("source")) return <SourceGlyph size={size} />;
  void category;
  return null;
}
