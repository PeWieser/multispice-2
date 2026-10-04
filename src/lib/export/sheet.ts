/* Runde 11 (W19) & Runde 39 (W131): Echter Entwurf-Export & Vektor-Druck.
 * SVG wird aus dem Dokument-Modell erzeugt (Symbole = dieselben Primitive wie
 * der Canvas) – Export-Qualität ohne Runtime-Umbau. PNG rastert das SVG,
 * PDF & Drucken nutzen unter Windows den nativen Electron-PDF/Druck-Dienst und
 * im Browser das synchrone Vektor-Druckblatt (ohne Pop-up-Blocker!). */
import { PART_MAP, type SymbolPrim } from "@/lib/library/catalog";
import { instanceBounds, rotatePoint, type Instance, type SchematicDoc } from "@/lib/schematic/model";

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

function docBounds(doc: SchematicDoc) {
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

export function docToSvg(doc: SchematicDoc, opts: { frame?: boolean; paperColor?: string } = {}): string {
  const { minX, minY, maxX, maxY } = docBounds(doc);
  const w = maxX - minX, h = maxY - minY;
  const bg = opts.paperColor ?? PAPER;
  const out: string[] = [];
  out.push(`<rect x="${n(minX)}" y="${n(minY)}" width="${n(w)}" height="${n(h)}" fill="${bg}"/>`);
  if (opts.frame !== false) {
    out.push(`<rect x="${n(minX)}" y="${n(minY)}" width="${n(w)}" height="${n(h)}" fill="none" stroke="${RULE}" stroke-width="1.5"/>`);
    const tw = 150, th = 34, tx = maxX - tw - 8, ty = maxY - th - 8;
    out.push(`<rect x="${n(tx)}" y="${n(ty)}" width="${tw}" height="${th}" fill="#fbfaf8" stroke="${RULE}"/>`);
    out.push(`<text x="${n(tx + 6)}" y="${n(ty + 13)}" font-size="10" font-weight="600" fill="${INK}">${esc(doc.name || "Unbenannt")}</text>`);
    out.push(`<text x="${n(tx + 6)}" y="${n(ty + 25)}" font-size="8" font-family="'IBM Plex Mono', monospace" fill="${MUTE}">${esc(new Date().toLocaleDateString("de-DE"))}</text>`);
    out.push(`<text x="${n(tx + 90)}" y="${n(ty + 25)}" font-size="8" font-family="'IBM Plex Mono', monospace" fill="${MUTE}">Blatt 1/1</text>`);
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

export async function exportSvg(doc: SchematicDoc): Promise<boolean> {
  const svg = docToSvg(doc);
  const name = `${fileName(doc)}.svg`;
  if (typeof window !== "undefined" && window.multispiceDesktop?.saveFile) {
    const res = await window.multispiceDesktop.saveFile({
      defaultName: name,
      content: svg,
      title: "Entwurf als SVG exportieren",
      filters: [{ name: "SVG-Vektorgrafik (*.svg)", extensions: ["svg"] }],
    });
    return Boolean(res.ok);
  }
  download(name, svg, "image/svg+xml;charset=utf-8");
  return true;
}

export function exportPng(doc: SchematicDoc, scale = 2) {
  const svg = docToSvg(doc);
  const img = new Image();
  const { minX, minY, maxX, maxY } = docBounds(doc);
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
    const name = `${fileName(doc)}.png`;

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
}

/**
 * W131: Exportiert den Entwurf als PDF oder öffnet den Druckdialog.
 * - Unter Windows (Electron): Erzeugt über `printToPDF` eine echte Vektor-PDF-Datei
 *   mit nativem Speicherdialog.
 * - Im Browser: Nutzt das synchrone Inline-Vektor-Druckblatt (`window.print()`),
 *   sodass kein Pop-up-Blocker mehr dazwischenfunken kann!
 */
export async function exportPdf(doc: SchematicDoc): Promise<boolean> {
  const svg = docToSvg(doc);
  const name = `${fileName(doc)}.pdf`;
  if (typeof window !== "undefined" && window.multispiceDesktop?.printSvg) {
    const res = await window.multispiceDesktop.printSvg({
      svg,
      title: doc.name || "Schaltplan",
      mode: "pdf",
      defaultName: name,
    });
    return Boolean(res.ok);
  }
  if (typeof window !== "undefined") {
    window.print();
    return true;
  }
  return false;
}

/**
 * W131: Druckt den Entwurf.
 * - Unter Windows (Electron): Öffnet den nativen Windows-Druckdialog mit dem Entwurf als Vektor.
 * - Im Browser: Öffnet `window.print()` mit dem synchron gerenderten Vektor-`PrintSheet`.
 */
export async function printSchematicSheet(doc: SchematicDoc): Promise<boolean> {
  if (typeof window !== "undefined" && window.multispiceDesktop?.printSvg) {
    const res = await window.multispiceDesktop.printSvg({
      svg: docToSvg(doc),
      title: doc.name || "Schaltplan",
      mode: "print",
    });
    return Boolean(res.ok);
  }
  if (typeof window !== "undefined") {
    window.print();
    return true;
  }
  return false;
}
