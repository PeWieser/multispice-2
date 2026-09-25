"use client";

export interface ProbeHoverConfig {
  showV: boolean;
  showI: boolean;
  showP: boolean;
  showFreq: boolean;
  showNetName: boolean;
}

export const DEFAULT_HOVER: ProbeHoverConfig = {
  showV: true,
  showI: true,
  showP: true,
  showFreq: true,
  showNetName: true,
};

export function loadHoverConfig(): ProbeHoverConfig {
  try {
    const raw = localStorage.getItem("multispice.probeHover");
    if (raw) return { ...DEFAULT_HOVER, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_HOVER;
}

export function saveHoverConfig(cfg: ProbeHoverConfig) {
  try {
    localStorage.setItem("multispice.probeHover", JSON.stringify(cfg));
  } catch {}
}

/* ------------------------------------------------------------------ */
/* Symbol Style – ISO/IEC vs ANSI/US, auto by browser locale          */
/* ------------------------------------------------------------------ */
export type SymbolStylePref = "auto" | "iec" | "ansi";
export type ResolvedSymbolStyle = "iec" | "ansi";

export function detectLocaleSymbol(): ResolvedSymbolStyle {
  try {
    const lang = (typeof navigator !== "undefined" ? navigator.language : "") || "";
    // DE, FR, etc use IEC (rectangle resistor), US, CA, JP, etc use ANSI (zigzag)
    // Rough heuristic: European locales -> IEC, else ANSI
    // DE, AT, CH, FR, IT, ES, NL, BE, PL, CZ, etc
    const iecLangs = ["de", "fr", "it", "es", "pt", "nl", "pl", "cs", "sk", "hu", "ro", "hr", "sl", "et", "lv", "lt", "fi", "sv", "da", "no", "el", "tr", "ru", "uk", "bg", "sr", "bs"];
    const lower = lang.toLowerCase();
    for (const l of iecLangs) {
      if (lower.startsWith(l)) return "iec";
    }
    // en-GB, en-AU, etc – IEC is more common outside US, but we treat en-US as ANSI, others IEC
    if (lower === "en-us" || lower.startsWith("en-us") || lower === "en" || lower.startsWith("en-ca") || lower.startsWith("en-jp") || lower.startsWith("ja") || lower.startsWith("zh") || lower.startsWith("ko")) {
      // US, CA, JP, etc historically ANSI, but IEC is international – we default ANSI for en-US, IEC for en-GB
      if (lower.includes("us") || lower === "en" || lower.startsWith("en-ca")) return "ansi";
      return "iec";
    }
    return "iec"; // default international = IEC
  } catch {
    return "iec";
  }
}

export function resolveSymbolStyle(pref: SymbolStylePref): ResolvedSymbolStyle {
  if (pref === "auto") return detectLocaleSymbol();
  return pref;
}

export function loadSymbolStyle(): SymbolStylePref {
  try {
    const raw = localStorage.getItem("multispice.symbolStyle") as SymbolStylePref | null;
    if (raw === "iec" || raw === "ansi" || raw === "auto") return raw;
  } catch {}
  return "auto";
}

export function saveSymbolStyle(pref: SymbolStylePref) {
  try {
    localStorage.setItem("multispice.symbolStyle", pref);
  } catch {}
}
