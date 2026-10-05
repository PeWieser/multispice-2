/**
 * Einziger Leser für Canvas-Farben. Die Werte kommen aus den Design-Tokens
 * (globals.css); die Fallbacks spiegeln dieselben Tokens je Theme, damit SSR
 * und der allererste Frame nicht mit veralteten Farben zeichnen.
 * Ergebnisse werden pro Theme gecacht — getComputedStyle nur bei Theme-Wechsel.
 */
type Theme = "light" | "dark";

const FALLBACK: Record<Theme, Record<string, string>> = {
  light: {
    "--app": "#edece8", "--surface": "#fbfaf8", "--surface-2": "#f3f2ee", "--surface-3": "#e8e7e2",
    "--ink": "#1c1d1f", "--ink-2": "#53565b", "--ink-3": "#5f6267",
    "--hairline": "rgba(40,32,16,0.12)", "--hairline-strong": "rgba(40,32,16,0.22)",
    "--accent": "#1d5bd6", "--accent-ink": "#ffffff",
    "--ok": "#24744a", "--warn": "#7d5806", "--err": "#b0362b", "--teal": "#1e6c6d", "--violet": "#7044a0",
    "--canvas": "#f7f6f1", "--grid-minor": "rgba(80,64,32,0.075)", "--grid-major": "rgba(80,64,32,0.15)",
    "--wire": "#1d5bd6", "--wire-sel": "#a35a06", "--symbol": "#1c1d1f", "--pin": "#5b5e63",
    "--ch1": "#1d5bd6", "--ch2": "#c2730f", "--ch3": "#24744a", "--ch4": "#b0362b",
  },
  dark: {
    "--app": "#111113", "--surface": "#1e1e21", "--surface-2": "#27272b", "--surface-3": "#313136",
    "--ink": "#f5f5f7", "--ink-2": "#a1a1a6", "--ink-3": "#9a9aa0",
    "--hairline": "rgba(255,255,255,0.09)", "--hairline-strong": "rgba(255,255,255,0.16)",
    "--accent": "#5b9dff", "--accent-ink": "#0b1424",
    "--ok": "#5cc28a", "--warn": "#e0ab47", "--err": "#ff7a6b", "--teal": "#5cc4c5", "--violet": "#b892e6",
    "--canvas": "#161618", "--grid-minor": "rgba(255,255,255,0.045)", "--grid-major": "rgba(255,255,255,0.09)",
    "--wire": "#5aa2ff", "--wire-sel": "#f0a94a", "--symbol": "#e5e5ea", "--pin": "#a1a1a6",
    "--ch1": "#5aa2ff", "--ch2": "#f0a94a", "--ch3": "#5cc28a", "--ch4": "#ff7a6b",
  },
};

let cacheTheme: string | null = null;
let cache = new Map<string, string>();

function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

/** Farbe eines Tokens (`--wire`, `--ink-3` …) für Canvas/SVG-Zeichnung. */
export function canvasColor(name: string): string {
  const theme = currentTheme();
  if (typeof window === "undefined") return FALLBACK[theme][name] ?? "#888";
  if (cacheTheme !== theme) {
    cacheTheme = theme;
    cache = new Map();
  }
  const hit = cache.get(name);
  if (hit) return hit;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim() || FALLBACK[theme][name] || "#888";
  cache.set(name, v);
  return v;
}

/**
 * S5.15: Lesbare Zeichentinte auf beliebigem Grund (Sonden-Badge, ERC-Marker,
 * Messleitungs-Chip). Luminanz nach WCAG (Schwelle ≈ 4,5:1); unparsebare
 * Eingabe (z. B. `var(--x)`) fällt auf Weiß zurück.
 */
export function inkOn(bg: string): string {
  const m = bg.trim().match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
  if (!m) return "#ffffff";
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const lin = (i: number) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const lum = 0.2126 * lin(0) + 0.7152 * lin(2) + 0.0722 * lin(4);
  return lum > 0.179 ? "#101014" : "#ffffff";
}

/** Alle Canvas-relevanten Farben auf einmal. */
export function getCanvasTheme() {
  const c = canvasColor;
  return {
    canvas: c("--canvas"), gridMinor: c("--grid-minor"), gridMajor: c("--grid-major"),
    wire: c("--wire"), selection: c("--wire-sel"), symbol: c("--symbol"), pin: c("--pin"),
    ink: c("--ink"), ink2: c("--ink-2"), ink3: c("--ink-3"), surface: c("--surface"),
    accent: c("--accent"), ok: c("--ok"), warn: c("--warn"), err: c("--err"),
  };
}
