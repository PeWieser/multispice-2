/**
 * S5.22: Notizzettel-Markup — `**fett**`, `*kursiv*`, `__unterstrichen__`.
 * Lebt im Notiztext (kein Modellwandel, alte Notizen rendern wie bisher).
 * DOM-frei: Canvas, Editor und Tests nutzen dieselben Funktionen.
 */

/** S5.23: Jeder Zettel ist gleich groß (Welt-Einheiten) — innen wird gescrollt. */
export const NOTE_W = 232;
export const NOTE_H = 150;

/* S5.28: Drei Blattgrößen (S/M/L) — M ist der bisherige Zettel (Standard). */
export const NOTE_CARD_SIZES = {
  s: { w: 170, h: 110 },
  m: { w: 232, h: 150 },
  l: { w: 310, h: 200 },
} as const;
export type NoteCardSize = keyof typeof NOTE_CARD_SIZES;
/** Blattmaß auflösen — unbekannt/leer fällt auf M zurück (alter Bestand). */
export function noteCardSize(card: unknown): { w: number; h: number } {
  if (card === "s" || card === "m" || card === "l") return NOTE_CARD_SIZES[card];
  return NOTE_CARD_SIZES.m;
}

/** S5.23: Drei Schriftgrößen (S/M/L) in px. S5.25: M +1, L deutlich (S passt). */
export const NOTE_FONT_STEPS = [9, 12, 16] as const;
export const NOTE_FONT_DEFAULT = 12;

/* S5.27: Karten-Metrik — EINE Quelle für Canvas-Zettel und Direkteditor,
   damit Bearbeitung und Ansicht pixelgleich aussehen (Position + Format).
   Alle Maße in Welt-px; der Editor skaliert sie mit dem Zoom. */
export const NOTE_PAD_X = 10;
export const NOTE_TOP_PAD = 9;
export const NOTE_FONT_STACK = "ui-sans-serif, system-ui";
export const noteLineH = (sz: number): number => sz + 5;
/** Erste Grundlinie ab Kartenoberkante: topPad + lineH − 4. */
export const noteFirstBaseline = (sz: number): number => NOTE_TOP_PAD + noteLineH(sz) - 4;
/** Editor-Innenabstand seitlich (Bildschirm-px): Text beginnt exakt wie auf dem Canvas. */
export const noteEditorPadSide = (zoom: number, borderW: number): number => NOTE_PAD_X * zoom - borderW;
/**
 * Editor-Innenabstand oben (Bildschirm-px): erste Grundlinie wie auf dem Canvas.
 * Herleitung: Grundlinie_0 = Kante + lineH + 5 (Welt); im CSS: Kante + Rahmen
 * + padTop + halber Durchschuss (2.5) + Ascent (~0.83em bei system-ui).
 * Restfehler ≤1px je nach Plattform-Schrift.
 */
export const noteEditorPadTop = (sz: number, zoom: number, borderW: number): number =>
  (sz + 10) * zoom - borderW - 2.5 * zoom - 0.83 * sz * zoom;

/** Fremde/legacy Größen auf die nächste Stufe runden. */
export function nearestFontStep(px: number): number {
  let best: number = NOTE_FONT_STEPS[0];
  for (const s of NOTE_FONT_STEPS) {
    if (Math.abs(s - px) < Math.abs(best - px)) best = s;
  }
  return best;
}

/** Scroll-Offset klemmen: 0 … (Inhalt − Sichtfenster), ohne Überlauf 0. */
export function clampNoteScroll(offset: number, contentH: number, viewH: number): number {
  const max = Math.max(0, contentH - viewH);
  return Math.min(max, Math.max(0, offset));
}

export interface NoteRun {
  t: string;
  b: boolean;
  i: boolean;
  u: boolean;
}

const MARKERS = ["**", "__", "*"] as const;

function toggle(flag: { b: boolean; i: boolean; u: boolean }, m: string): void {
  if (m === "**") flag.b = !flag.b;
  else if (m === "*") flag.i = !flag.i;
  else flag.u = !flag.u;
}

/** Text → Zeilen → Läufe. `\\` maskiert das Folgezeichen. */
export function parseNoteRuns(text: string): NoteRun[][] {
  return text.split(/\r?\n/).map((line) => {
    const runs: NoteRun[] = [];
    const flag = { b: false, i: false, u: false };
    let cur = "";
    const flush = () => {
      if (cur) runs.push({ t: cur, b: flag.b, i: flag.i, u: flag.u });
      cur = "";
    };
    for (let k = 0; k < line.length;) {
      const c = line[k];
      if (c === "\\" && k + 1 < line.length) {
        cur += line[k + 1];
        k += 2;
        continue;
      }
      let matched: string | null = null;
      for (const m of MARKERS) {
        if (line.startsWith(m, k)) {
          // `*` nicht mitten in `**` matchen (längster Marker zuerst — MARKERS
          // ist danach sortiert, `**` steht vor `*`).
          matched = m;
          break;
        }
      }
      if (matched) {
        flush();
        toggle(flag, matched);
        k += matched.length;
      } else {
        cur += c;
        k++;
      }
    }
    flush();
    return runs;
  });
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Markup → HTML fürs Bearbeitungsfeld (eine Zeile pro `<div>`). */
export function markupToHtml(text: string): string {
  return parseNoteRuns(text)
    .map((runs) =>
      runs
        .map((r) => {
          let h = escHtml(r.t);
          if (r.u) h = `<u>${h}</u>`;
          if (r.i) h = `<i>${h}</i>`;
          if (r.b) h = `<b>${h}</b>`;
          return h;
        })
        .join("") || "<br>",
    )
    .map((l) => `<div>${l}</div>`)
    .join("");
}

interface HtmlFlag {
  b: boolean;
  i: boolean;
  u: boolean;
}

/** HTML aus dem Bearbeitungsfeld → Markup (eigener Tag-Scanner, kein DOM). */
export function htmlToMarkup(html: string): string {
  const lines: string[] = [];
  let cur = "";
  const stack: HtmlFlag[] = [];
  const flags = (): HtmlFlag => {
    const f = { b: false, i: false, u: false };
    for (const s of stack) {
      f.b = f.b || s.b;
      f.i = f.i || s.i;
      f.u = f.u || s.u;
    }
    return f;
  };
  let open: HtmlFlag = { b: false, i: false, u: false };
  const syncMarkers = () => {
    const f = flags();
    // schließen (innen nach außen), öffnen (außen nach innen)
    if (open.i && !f.i) cur += "*";
    if (open.u && !f.u) cur += "__";
    if (open.b && !f.b) cur += "**";
    if (f.b && !open.b) cur += "**";
    if (f.u && !open.u) cur += "__";
    if (f.i && !open.i) cur += "*";
    open = { ...f };
  };
  const newline = () => {
    if (open.b) cur += "**";
    if (open.u) cur += "__";
    if (open.i) cur += "*";
    open = { b: false, i: false, u: false };
    lines.push(cur);
    cur = "";
  };
  const tokens = html.split(/(<[^>]*>)/g);
  let firstBlock = true;
  for (const tk of tokens) {
    if (!tk) continue;
    if (tk.startsWith("<")) {
      const closing = tk[1] === "/";
      const tag = tk.replace(/[<>/\s]/g, "").toLowerCase();
      if (tag === "br") newline();
      else if (!closing && (tag === "div" || tag === "p" || tag === "li")) {
        if (!firstBlock) newline();
        firstBlock = false;
      } else if (closing) {
        // `</div>` & Co. schließen nur Inline-Stile, keine Zeilen.
        if (tag === "b" || tag === "strong" || tag === "i" || tag === "em" || tag === "u") {
          stack.pop();
          syncMarkers();
        }
      } else if (tag === "b" || tag === "strong") {
        stack.push({ b: true, i: false, u: false });
        syncMarkers();
      } else if (tag === "i" || tag === "em") {
        stack.push({ b: false, i: true, u: false });
        syncMarkers();
      } else if (tag === "u") {
        stack.push({ b: false, i: false, u: true });
        syncMarkers();
      }
      // alle anderen Tags (font, span, …) fallen still weg
    } else {
      const f = flags();
      if (f.b !== open.b || f.i !== open.i || f.u !== open.u) syncMarkers();
      cur += tk.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    }
  }
  if (open.b) cur += "**";
  if (open.u) cur += "__";
  if (open.i) cur += "*";
  lines.push(cur);
  // Leere Schlusszeilen aus Editor-Artefakten (`<div><br></div>`) streichen.
  while (lines.length > 1 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.join("\n");
}
