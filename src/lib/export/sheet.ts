/* Runde 11 (W19): Echter Entwurf-Export & Vektor-Druck. Druckbögen Phase ②:
 * SVG entsteht aus dem Dokument-Modell (Symbole = dieselben Primitive wie der
 * Canvas), der Rahmen-Stempel trägt echte Schriftfeld-Daten + Blatt n/N. PNG
 * rastert das SVG. PDF nutzt unter Windows den Selbst-Druck des Fensters
 * (`printToPDF`, Portal-Bögen + @page aus dem Ticket) und im Browser das
 * synchrone Vektor-Druckportal (ohne Pop-up-Blocker!). */
import { PART_MAP, type SymbolPrim } from "@/lib/library/catalog";
import { activePageIndex, instanceBounds, resolveTitleBlock, rotatePoint, type Instance, type PrintFormat, type SchematicDoc } from "@/lib/schematic/model";
import { formatDeDate, formatValue } from "@/lib/format";
import { loadTitleDefaults } from "@/lib/settings";

/* Feste Export-Farben (Papier-Thema – unabhängig vom UI-Theme) */
const INK = "#1c1f22";
const WIRE = "#1f5fd0";
const MUTE = "#5c6167";
const PAPER = "#f7f6f2";
const RULE = "#b4b0a8";
const LABEL = "#7a4fa3";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const n = (v: number) => Math.round(v * 100) / 100;

function instanceSvg(inst: Instance): string {
  const part = PART_MAP[inst.partId];
  if (!part) return "";
  const out: string[] = [];
  const tp = (x: number, y: number) => {
    const r = rotatePoint(x, y, inst.rot, inst.mirror ?? false);
    return [r.x + inst.x, r.y + inst.y] as const;
  };
  for (const pr of part.symbol as SymbolPrim[]) {
    if (pr.t === "line") {
      const pts: string[] = [];
      for (let i = 0; i + 1 < pr.pts.length; i += 2) {
        const [x, y] = tp(pr.pts[i], pr.pts[i + 1]);
        pts.push(`${n(x)},${n(y)}`);
      }
      out.push(`<polyline points="${pts.join(" ")}" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`);
    } else if (pr.t === "rect") {
      const [x1, y1] = tp(pr.x, pr.y);
      const [x2, y2] = tp(pr.x + pr.w, pr.y + pr.h);
      out.push(
        `<rect x="${n(Math.min(x1, x2))}" y="${n(Math.min(y1, y2))}" width="${n(Math.abs(x2 - x1))}" height="${n(Math.abs(y2 - y1))}" rx="${pr.r ?? 0}" fill="${pr.fill ? INK : "none"}" stroke="${INK}" stroke-width="1.6"/>`,
      );
    } else if (pr.t === "circle") {
      const [cx, cy] = tp(pr.x, pr.y);
      out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="${pr.r}" fill="${pr.fill ? INK : "none"}" stroke="${INK}" stroke-width="1.6"/>`);
    } else if (pr.t === "arc") {
      const [cx, cy] = tp(pr.x, pr.y);
      const rotR = (inst.rot * Math.PI) / 180 * (inst.mirror ? -1 : 1);
      const s0 = pr.a0 + rotR;
      const s1 = pr.a1 + rotR;
      const x0 = cx + pr.r * Math.cos(s0), y0 = cy + pr.r * Math.sin(s0);
      const x1 = cx + pr.r * Math.cos(s1), y1 = cy + pr.r * Math.sin(s1);
      const large = Math.abs(s1 - s0) > Math.PI ? 1 : 0;
      out.push(`<path d="M ${n(x0)} ${n(y0)} A ${pr.r} ${pr.r} 0 ${large} 1 ${n(x1)} ${n(y1)}" fill="none" stroke="${INK}" stroke-width="1.6"/>`);
    } else if (pr.t === "text") {
      const [tx, ty] = tp(pr.x, pr.y);
      const anchor = pr.align === "left" ? "start" : pr.align === "right" ? "end" : "middle";
      out.push(`<text x="${n(tx)}" y="${n(ty)}" font-size="${pr.size ?? 9}" fill="${INK}" text-anchor="${anchor}">${esc(pr.s)}</text>`);
    }
  }
  const b = instanceBounds(inst);
  out.push(`<text x="${n(inst.x)}" y="${n(b.y + b.h + 13)}" font-size="9" fill="${MUTE}" text-anchor="middle">${esc(inst.label)}</text>`);
  const p0 = part.params?.[0];
  const val = p0 ? String(inst.params[p0.key] ?? p0.def ?? "") : "";
  if (val) out.push(`<text x="${n(inst.x)}" y="${n(b.y + b.h + 23)}" font-size="8" font-family="'IBM Plex Mono', monospace" fill="${MUTE}" text-anchor="middle">${esc(val)}</text>`);
  return out.join("");
}

export function docBounds(doc: SchematicDoc) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const inst of doc.instances) {
    const b = instanceBounds(inst);
    minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h + 24);
  }
  for (const w of doc.wires) for (const p of w.points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  for (const l of doc.labels) { minX = Math.min(minX, l.x - 30); maxX = Math.max(maxX, l.x + 30); minY = Math.min(minY, l.y - 10); maxY = Math.max(maxY, l.y + 10); }
  for (const t of doc.notes) { minX = Math.min(minX, t.x); maxX = Math.max(maxX, t.x + 120); minY = Math.min(minY, t.y - 10); maxY = Math.max(maxY, t.y + 10); }
  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 400; maxY = 300; }
  const pad = 30;
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

export interface SvgFrameInfo {
  title: string;
  docNo: string;
  date: string;
  sheet: number;
  of: number;
}

export function docToSvg(doc: SchematicDoc, opts: { frame?: boolean; paperColor?: string; frameInfo?: SvgFrameInfo; zones?: boolean } = {}): string {
  const { minX, minY, maxX, maxY } = docBounds(doc);
  const w = maxX - minX, h = maxY - minY;
  const bg = opts.paperColor ?? PAPER;
  const out: string[] = [];
  out.push(`<rect x="${n(minX)}" y="${n(minY)}" width="${n(w)}" height="${n(h)}" fill="${bg}"/>`);
  if (opts.frame !== false) {
    // Druckbögen Phase ②: Stempel mit echten Schriftfeld-Daten (Blatt n/N).
    const fi = opts.frameInfo ?? {
      title: doc.name || "Unbenannt",
      docNo: "",
      date: formatDeDate(new Date().toISOString().slice(0, 10)),
      sheet: 1,
      of: 1,
    };
    const stampTitle = fi.title.length > 30 ? fi.title.slice(0, 29) + "\u2026" : fi.title;
    const stampSub = [fi.docNo, fi.date].filter(Boolean).join(" \u00b7 ");
    out.push(`<rect x="${n(minX)}" y="${n(minY)}" width="${n(w)}" height="${n(h)}" fill="none" stroke="${RULE}" stroke-width="1.5"/>`);
    const tw = 190, th = 46, tx = maxX - tw - 8, ty = maxY - th - 8;
    out.push(`<rect x="${n(tx)}" y="${n(ty)}" width="${tw}" height="${th}" fill="#fbfaf8" stroke="${RULE}"/>`);
    out.push(`<text x="${n(tx + 6)}" y="${n(ty + 14)}" font-size="10" font-weight="600" fill="${INK}">${esc(stampTitle)}</text>`);
    out.push(`<text x="${n(tx + 6)}" y="${n(ty + 27)}" font-size="8" font-family="'IBM Plex Mono', monospace" fill="${MUTE}">${esc(stampSub)}</text>`);
    out.push(`<text x="${n(tx + 6)}" y="${n(ty + 39)}" font-size="8" font-family="'IBM Plex Mono', monospace" fill="${MUTE}">Blatt ${fi.sheet}/${fi.of}</text>`);
  }
  if (opts.zones) {
    // Druckbögen Phase ③: Zonenraster A–D/1–4 (Kantenmarken + feine Teilungslinien).
    const gx = (i: number) => minX + ((maxX - minX) * i) / 4;
    const gy = (i: number) => minY + ((maxY - minY) * i) / 4;
    for (let i = 1; i < 4; i++) {
      out.push(`<line x1="${n(gx(i))}" y1="${n(minY)}" x2="${n(gx(i))}" y2="${n(maxY)}" stroke="${RULE}" stroke-width="0.5" stroke-dasharray="4 3"/>`);
      out.push(`<line x1="${n(minX)}" y1="${n(gy(i))}" x2="${n(maxX)}" y2="${n(gy(i))}" stroke="${RULE}" stroke-width="0.5" stroke-dasharray="4 3"/>`);
    }
    for (let c = 0; c < 4; c++) {
      out.push(`<text x="${n((gx(c) + gx(c + 1)) / 2)}" y="${n(minY - 20)}" font-size="9" fill="${MUTE}" text-anchor="middle">${c + 1}</text>`);
    }
    for (let r = 0; r < 4; r++) {
      out.push(`<text x="${n(minX - 20)}" y="${n((gy(r) + gy(r + 1)) / 2 + 3)}" font-size="9" fill="${MUTE}" text-anchor="middle">${ZONE_ROWS[r]}</text>`);
    }
  }
  for (const wire of doc.wires) {
    const pts = wire.points.map((p) => `${n(p.x)},${n(p.y)}`).join(" ");
    out.push(`<polyline points="${pts}" fill="none" stroke="${wire.color ?? WIRE}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const j of doc.junctions ?? []) {
    out.push(`<circle cx="${n(j.x)}" cy="${n(j.y)}" r="3.2" fill="${WIRE}"/>`);
  }
  for (const l of doc.labels) {
    out.push(`<text x="${n(l.x)}" y="${n(l.y - 4)}" font-size="9" fill="${LABEL}" text-anchor="middle">${esc(l.name)}</text>`);
  }
  for (const t of doc.notes) {
    out.push(`<text x="${n(t.x)}" y="${n(t.y)}" font-size="${t.size ?? 11}" fill="${MUTE}">${esc(t.text)}</text>`);
  }
  for (const inst of doc.instances) out.push(instanceSvg(inst));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${n(minX)} ${n(minY)} ${n(w)} ${n(h)}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" font-family="'IBM Plex Sans', sans-serif">${out.join("")}</svg>`;
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

const fileName = (doc: SchematicDoc) => (doc.name || "schaltplan").trim().replace(/\s+/g, "_").replace(/[^\wäöüÄÖÜß.-]+/g, "-");

/** Blätter Stufe B: Entwurfsseiten als Einzeldokumente (aktive aus den flachen Arrays). */
export function pageDocs(doc: SchematicDoc): SchematicDoc[] {
  const pages = doc.pages;
  if (!pages || pages.length <= 1) return [doc];
  const ap = activePageIndex(doc);
  return pages.map((pg, i) => {
    const src = i === ap ? doc : pg;
    return {
      id: pg.id,
      name: `${doc.name} – ${pg.name}`,
      instances: src.instances,
      wires: src.wires,
      labels: src.labels,
      notes: src.notes,
      probes: src.probes ?? [],
      junctions: src.junctions,
    };
  });
}

export async function exportSvg(doc: SchematicDoc): Promise<boolean> {
  // Blätter Stufe B: mehrere Seiten → je eine Datei (Entwurf_S1.svg, …).
  // Druckbögen Phase ②: Stempel je Seite mit Schriftfeld-Daten + Blatt n/N.
  const all = pageDocs(doc);
  const tb = resolveTitleBlock(doc, loadTitleDefaults());
  const frameInfo = (i: number): SvgFrameInfo => ({
    title: tb.title || doc.name,
    docNo: tb.docNo,
    date: formatDeDate(tb.drawnDate),
    sheet: i + 1,
    of: all.length,
  });
  for (let i = 0; i < all.length; i++) {
    const svg = docToSvg(all[i], { frameInfo: frameInfo(i), zones: true });
    const name = all.length > 1 ? `${fileName(doc)}_S${i + 1}.svg` : `${fileName(doc)}.svg`;
    if (typeof window !== "undefined" && window.multispiceDesktop?.saveFile) {
      const res = await window.multispiceDesktop.saveFile({
        defaultName: name,
        content: svg,
        title: all.length > 1 ? `Seite ${i + 1} als SVG exportieren` : "Entwurf als SVG exportieren",
        filters: [{ name: "SVG-Vektorgrafik (*.svg)", extensions: ["svg"] }],
      });
      if (!res.ok) return false;
    } else {
      download(name, svg, "image/svg+xml;charset=utf-8");
    }
  }
  return true;
}

export function exportPng(doc: SchematicDoc, scale = 2) {
  // Blätter Stufe B: mehrere Seiten → je eine Datei (Entwurf_S1.png, …).
  const all = pageDocs(doc);
  const tb = resolveTitleBlock(doc, loadTitleDefaults());
  all.forEach((pdoc, i) => {
  const svg = docToSvg(pdoc, {
    frameInfo: {
      title: tb.title || doc.name,
      docNo: tb.docNo,
      date: formatDeDate(tb.drawnDate),
      sheet: i + 1,
      of: all.length,
    },
    zones: true,
  });
  const img = new Image();
  const { minX, minY, maxX, maxY } = docBounds(pdoc);
  img.onload = async () => {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((maxX - minX) * scale));
    canvas.height = Math.max(1, Math.round((maxY - minY) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    const name = all.length > 1 ? `${fileName(doc)}_S${i + 1}.png` : `${fileName(doc)}.png`;

    if (typeof window !== "undefined" && window.multispiceDesktop?.saveFile) {
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, "");
      await window.multispiceDesktop.saveFile({
        defaultName: name,
        content: base64,
        encoding: "base64",
        title: "Entwurf als PNG exportieren",
        filters: [{ name: "PNG-Grafik (*.png)", extensions: ["png"] }],
      });
      return;
    }

    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = name;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  });
}

/**
 * Druckbögen Phase ②: Exportiert den Entwurf als PDF.
 * - Unter Windows (Electron): Das Fenster druckt sich selbst als Vektor-PDF
 *   (Portal-Bögen + @page aus dem aktuellen Ticket) mit nativem Speicherdialog.
 * - Im Browser: `window.print()` (Browser-Dialog → „Als PDF sichern“).
 */
export async function exportPdf(doc: SchematicDoc): Promise<boolean> {
  if (typeof window !== "undefined" && window.multispiceDesktop?.printPdf) {
    try {
      const res = await window.multispiceDesktop.printPdf({
        title: doc.name || "Schaltplan",
        defaultName: `${fileName(doc)}.pdf`,
      });
      return Boolean(res?.ok);
    } catch {
      return false;
    }
  }
  if (typeof window !== "undefined") {
    window.print();
    return true;
  }
  return false;
}

/* ---------------- Druckbögen Phase ③: Zonen, Fundstellen, Druckplan -------- */

const ZONE_ROWS = "ABCD";

/** Zone einer Koordinate im Blattraster A1–D4 (Zeilen oben→unten, Spalten links→rechts). */
export function zoneAt(
  b: { minX: number; minY: number; maxX: number; maxY: number },
  x: number,
  y: number,
): string {
  const w = Math.max(1e-6, b.maxX - b.minX);
  const h = Math.max(1e-6, b.maxY - b.minY);
  const col = Math.min(3, Math.max(0, Math.floor(((x - b.minX) / w) * 4)));
  const row = Math.min(3, Math.max(0, Math.floor(((y - b.minY) / h) * 4)));
  return `${ZONE_ROWS[row]}${col + 1}`;
}

/** Tabellenzeilen je Stücklisten-Blatt (Inhaltshöhe ab Format — konservativ). */
export const BOM_ROWS_PER_SHEET: Record<PrintFormat, number> = { a4p: 34, a4l: 24, a3l: 40 };

export function chunkRows<T>(rows: T[], per: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += per) out.push(rows.slice(i, i + per));
  return out;
}

export interface PrintBomRow {
  ref: string;
  part: string;
  value: string;
  footprint: string;
  qty: number;
  locations: string;
}

export interface PrintPlanSheet {
  pageId: string;
  name: string;
  blatt: number;
  doc: SchematicDoc;
}

export interface PrintPlan {
  sheets: PrintPlanSheet[];
  showToc: boolean;
  bom: PrintBomRow[][];
  bomStart: number;
  total: number;
}

/**
 * Druckbögen: Nummerierungs-Kern (eine Quelle für Dialog-Vorschau, Portal und
 * Tests). Blätter in gedruckter Reihenfolge, Verzeichnis = Blatt 1, Stückliste
 * (gruppiert wie am Bildschirm, plus Fundstellen „Blatt·Zone“) paginiert am
 * Ende — entfällt lautlos, wenn die gedruckten Seiten keine Bauteile tragen.
 */
export function buildPrintPlan(
  doc: SchematicDoc,
  opts: { scope: "all" | "active"; toc: boolean; bom: boolean; format: PrintFormat },
): PrintPlan {
  const allDocs = pageDocs(doc);
  const pages: Array<{ id: string; name: string }> =
    doc.pages?.length ? doc.pages : [{ id: doc.id, name: "Seite 1" }];
  let idx = allDocs.map((_, i) => i);
  if (opts.scope === "active") {
    const ai = pages.findIndex((p) => p.id === doc.activePageId);
    idx = [ai < 0 ? 0 : ai];
  }
  const showToc = opts.toc && idx.length > 1;
  const shift = showToc ? 1 : 0;
  const sheets: PrintPlanSheet[] = idx.map((pi, k) => ({
    pageId: pages[pi].id,
    name: pages[pi].name,
    blatt: k + 1 + shift,
    doc: allDocs[pi],
  }));
  let bom: PrintBomRow[][] = [];
  if (opts.bom) {
    const groups = new Map<string, PrintBomRow>();
    for (const sh of sheets) {
      const b = docBounds(sh.doc);
      for (const inst of sh.doc.instances) {
        const part = PART_MAP[inst.partId];
        if (!part || part.mount === "virtual") continue;
        const main = part.params[0];
        const value = main ? formatValue(Number(inst.params[main.key] ?? main.def), main.unit ?? "") : "";
        const k = `${part.id}|${value}`;
        const loc = `${sh.blatt}·${zoneAt(b, inst.x, inst.y)}`;
        const g = groups.get(k);
        if (!g) {
          groups.set(k, {
            ref: inst.label,
            part: part.name,
            value,
            footprint: part.footprint ?? "—",
            qty: 1,
            locations: loc,
          });
        } else {
          g.ref += `, ${inst.label}`;
          g.qty++;
          g.locations += `, ${loc}`;
        }
      }
    }
    const flat = [...groups.values()];
    if (flat.length) bom = chunkRows(flat, BOM_ROWS_PER_SHEET[opts.format]);
  }
  const bomStart = sheets.length + shift + 1;
  return { sheets, showToc, bom, bomStart, total: bomStart - 1 + bom.length };
}
