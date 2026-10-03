/**
 * W69 (Runde 26) / W73 (Runde 27): Schaltzeichen für den Bauteilstreifen.
 *
 * Alle Glyphen sind reine SVG-Pfade (currentColor) mit einheitlicher
 * Strichstärke. Das Widerstandssymbol folgt der eingestellten Symbolnorm
 * (IEC-Rechteck vs. ANSI-Zickzack).
 */
import type { ReactNode } from "react";
import type { ResolvedSymbolStyle } from "@/lib/settings";

const S = 1.6;

function Wrap({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={S} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

/** Widerstand (IEC-Rechteck oder ANSI-Zickzack) */
export function ResistorGlyph({ size, symbolStyle = "iec" }: { size?: number; symbolStyle?: ResolvedSymbolStyle }) {
  if (symbolStyle === "ansi") {
    return (
      <Wrap size={size}>
        <path d="M2 12h2.4l1.6-5 2.4 10 2.4-10 2.4 10 1.6-5H22" />
      </Wrap>
    );
  }
  return (
    <Wrap size={size}>
      <path d="M2 12h4M18 12h4" />
      <rect x="6" y="8" width="12" height="8" rx="0.8" />
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

/** NPN-Bipolartransistor */
export function TransistorGlyph({ size }: { size?: number }) {
  return (
    <Wrap size={size}>
      <path d="M3 12h6M9 6.5v11" />
      <path d="M9 9.5L16 5v-2M9 14.5L16 19v2" />
      <path d="M13.2 18.8l2.8.2-.9-2.6" />
    </Wrap>
  );
}

/** Operationsverstärker (Dreieck mit + / −) */
export function OpampGlyph({ size }: { size?: number }) {
  return (
    <Wrap size={size}>
      <path d="M5 5v14l14-7z" />
      <path d="M2 9h3M2 15h3M19 12h3" />
      <path d="M7.2 9h2.4M7.2 15h2.4M8.4 13.8v2.4" />
    </Wrap>
  );
}

/** Spannungsquelle (Kreis mit + / −) */
export function SourceGlyph({ size }: { size?: number }) {
  return (
    <Wrap size={size}>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7.2v3.2M10.4 8.8h3.2M10.4 15.2h3.2" />
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
 * W69/W73: Symbol je Bauteil.
 */
export function PartGlyph({
  partId,
  category,
  size = 20,
  symbolStyle = "iec",
}: {
  partId: string;
  category: string;
  size?: number;
  symbolStyle?: ResolvedSymbolStyle;
}) {
  const key = partId.toLowerCase();
  if (key.startsWith("resistor")) return <ResistorGlyph size={size} symbolStyle={symbolStyle} />;
  if (key.startsWith("capacitor")) return <CapacitorGlyph size={size} />;
  if (key.startsWith("inductor")) return <InductorGlyph size={size} />;
  if (key.startsWith("diode") || key.includes("led") || key.includes("zener") || key.includes("schottky")) return <DiodeGlyph size={size} />;
  if (key.startsWith("npn") || key.startsWith("pnp") || key.includes("mos") || key.includes("transistor")) return <TransistorGlyph size={size} />;
  if (key.startsWith("opamp") || key.includes("lm741") || key.includes("tl0")) return <OpampGlyph size={size} />;
  if (key === "gnd" || key.includes("ground")) return <GroundGlyph size={size} />;
  if (key.startsWith("vdc") || key.startsWith("vs") || key.startsWith("vac") || key.includes("source")) return <SourceGlyph size={size} />;
  void category;
  return null;
}
