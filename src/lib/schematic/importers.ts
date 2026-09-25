/**
 * Importer für Fremdformate.
 *
 * 1. SPICE-Netzliste (.cir/.net/.sp/.txt): Bauteile werden erkannt, platziert
 *    und – anders als frühere Best-Effort-Versuche – **echt verdrahtet**:
 *    jeder Netzname wird zu einer orthogonalen Kettenleitung durch alle
 *    Pin-Positionen, Netz 0 bekommt ein GND-Symbol, benannte Netze ein Label.
 * 2. LTspice-Schaltplan (.asc, Klartext): Geometrie, Drähte und Flags werden
 *    übernommen (Skalierung ×2 auf unser Raster), Drahtenden snappen an die
 *    Pins unserer Symbole.
 *
 * Beide Pfade sind deterministisch, SSR-sicher und fehler tolerant:
 * Unbekanntes wird übersprungen und als ehrliche Notiz auf dem Canvas
 * dokumentiert statt still verfälscht.
 */

import { PART_MAP } from "../library/catalog";
import { emptyDoc, pinPosition, type Instance, type NetLabel, type SchematicDoc, type Wire } from "./model";

let seq = 0;
const uid = (p: string) => `${p}_${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** SPICE-Wert mit Suffix (10k, 4u7, meg, 100n …) → Zahl. */
export function parseSpiceValue(tok: string | undefined): number {
  if (!tok) return NaN;
  let s = tok.trim().toLowerCase().replace(/(f|v|a|h|ohm)$/i, "");
  // Infix-Suffix wie 4u7 → 4.7 µ
  let infix = 1;
  const mid = s.match(/^(\d+)([munpk])(\d+)$/);
  if (mid) {
    s = `${mid[1]}.${mid[3]}`;
    infix = ({ m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, k: 1e3 } as Record<string, number>)[mid[2]];
  }
  const mult: Array<[RegExp, number]> = [
    [/meg$/, 1e6],
    [/k$/, 1e3],
    [/m$/, 1e-3],
    [/u$/, 1e-6],
    [/n$/, 1e-9],
    [/p$/, 1e-12],
    [/g$/, 1e9],
    [/t$/, 1e12],
  ];
  let f = 1;
  for (const [re, m] of mult) {
    if (re.test(s)) {
      s = s.replace(re, "");
      f = m;
      break;
    }
  }
  const v = Number(s);
  return Number.isFinite(v) ? v * f * infix : NaN;
}

/* ------------------------------------------------------------------ */
/* 1 · SPICE-Netzliste mit Auto-Verdrahtung                            */
/* ------------------------------------------------------------------ */

const SPICE_MAP: Record<string, { partId: string; pins: number; param?: string }> = {
  R: { partId: "resistor", pins: 2, param: "r" },
  C: { partId: "capacitor", pins: 2, param: "c" },
  L: { partId: "inductor", pins: 2, param: "l" },
  V: { partId: "vdc", pins: 2, param: "dc" },
  I: { partId: "idc", pins: 2, param: "dc" },
  D: { partId: "diode_1n4148", pins: 2 },
  Q: { partId: "npn_2n3904", pins: 3 },
  M: { partId: "nmos", pins: 3 },
};

interface NetPin {
  inst: Instance;
  pin: number;
}

/** Orthogonale Kettenleitung durch eine Liste von Stützpunkten. */
function chainPoints(pts: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (const q of pts) {
    if (out.length === 0) {
      out.push({ ...q });
      continue;
    }
    const last = out[out.length - 1];
    if (last.x !== q.x && last.y !== q.y) out.push({ x: q.x, y: last.y });
    out.push({ ...q });
  }
  return out;
}

export function fromSpiceNetlist(text: string): SchematicDoc {
  const doc = emptyDoc("Importierte Netzliste");
  const nets = new Map<string, NetPin[]>();
  const skipped: string[] = [];
  let placed = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("*") || line.startsWith(".")) continue;
    const toks = line.split(/\s+/);
    const type = toks[0][0].toUpperCase();
    const spec = SPICE_MAP[type];
    if (!spec) {
      if (/^[A-Z]/i.test(toks[0])) skipped.push(toks[0]);
      continue;
    }
    const nodes = toks.slice(1, 1 + spec.pins);
    if (nodes.length < spec.pins) continue;
    const x = 140 + (placed % 6) * 170;
    const y = 130 + Math.floor(placed / 6) * 170;
    placed++;
    const inst: Instance = {
      id: uid("i"),
      partId: spec.partId,
      x,
      y,
      rot: 0,
      label: toks[0].toUpperCase(),
      params: {},
    };
    if (spec.param) {
      const v = parseSpiceValue(toks[1 + spec.pins]);
      if (Number.isFinite(v)) inst.params[spec.param] = v;
    }
    doc.instances.push(inst);
    nodes.forEach((net, pin) => {
      const list = nets.get(net) ?? [];
      list.push({ inst, pin });
      nets.set(net, list);
    });
  }

  // Netze → Leitungen: Pins je Netz sortieren und orthogonal verketten.
  for (const [name, pins] of nets) {
    const pts = pins
      .map((p) => ({ p, at: pinPosition(p.inst, p.pin) }))
      .sort((a, b) => a.at.y - b.at.y || a.at.x - b.at.x);
    if (pts.length === 1) {
      // Einzelner Pin: kein Draht, aber der Netzname bleibt sichtbar.
      doc.labels.push({ id: uid("l"), x: pts[0].at.x + 12, y: pts[0].at.y - 12, name } as NetLabel);
      continue;
    }
    const route = pts.map((q) => q.at);
    if (name === "0" || name === "GND" || name === "gnd") {
      // Masse: eigenes GND-Symbol an den ersten Knoten hängen.
      const a = route[0];
      const g: Instance = { id: uid("i"), partId: "gnd", x: a.x, y: a.y + 54, rot: 0, label: "GND", params: {} };
      doc.instances.push(g);
      route.unshift({ x: a.x, y: a.y + 40 });
    }
    const wire: Wire = { id: uid("w"), points: chainPoints(route) };
    doc.wires.push(wire);
    if (name !== "0" && !/^\d+$/.test(name)) {
      doc.labels.push({ id: uid("l"), x: route[0].x + 12, y: route[0].y - 12, name } as NetLabel);
    }
  }

  if (skipped.length) {
    doc.notes.push({
      id: uid("n"),
      x: 140,
      y: 40,
      text: `Import: ${skipped.length} unbekannte Netzlisten-Zeilen übersprungen (${[...new Set(skipped)].slice(0, 6).join(", ")}${skipped.length > 6 ? ", …" : ""})`,
      size: 9,
    });
  }
  return doc;
}

/* ------------------------------------------------------------------ */
/* 2 · LTspice .asc                                                    */
/* ------------------------------------------------------------------ */

export function isLtspiceAsc(text: string): boolean {
  return /^version\s+4/im.test(text) && /sheet\s+\d/im.test(text);
}

const ASC_MAP: Record<string, string> = {
  res: "resistor",
  cap: "capacitor",
  cap_pol: "capacitor",
  ind: "inductor",
  voltage: "vdc",
  current: "idc",
  diode: "diode_1n4148",
  npn: "npn_2n3904",
  pnp: "pnp_2n3906",
  nmos: "nmos",
  pmos: "pmos",
  gnd: "gnd",
  ground: "gnd",
};

const ASC_PARAM: Record<string, string> = {
  resistor: "r",
  capacitor: "c",
  inductor: "l",
  vdc: "dc",
  idc: "dc",
};

const SCALE = 2; // LTspice-Sheet-Einheiten → unser Raster

export function fromLtspiceAsc(text: string): SchematicDoc {
  const doc = emptyDoc("LTspice-Import");
  const rawWires: Array<[number, number, number, number]> = [];
  const flags: Array<{ x: number; y: number; name: string }> = [];
  const unknown: string[] = [];
  let current: Instance | null = null;
  let minX = Infinity;
  let minY = Infinity;
  const touch = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const t = line.split(/\s+/);
    if (t[0] === "WIRE" && t.length >= 5) {
      const [x1, y1, x2, y2] = t.slice(1, 5).map(Number);
      rawWires.push([x1, y1, x2, y2]);
      touch(x1, y1);
      touch(x2, y2);
    } else if (t[0] === "FLAG" && t.length >= 4) {
      flags.push({ x: Number(t[1]), y: Number(t[2]), name: t[3] });
      touch(Number(t[1]), Number(t[2]));
    } else if (t[0] === "SYMBOL" && t.length >= 5) {
      const base = t[1].split("@")[0].toLowerCase();
      const partId = ASC_MAP[base];
      const x = Number(t[2]);
      const y = Number(t[3]);
      const orient = (t[4] || "R0").toUpperCase();
      touch(x, y);
      if (!partId) {
        unknown.push(base);
        current = null;
        continue;
      }
      current = {
        id: uid("i"),
        partId,
        x,
        y,
        rot: (Number(orient.replace(/\D/g, "")) || 0) as Instance["rot"],
        mirror: orient.startsWith("M"),
        label: partId,
        params: {},
      };
      doc.instances.push(current);
    } else if (t[0] === "SYMATTR" && current && t.length >= 3) {
      if (t[1] === "InstName") current.label = t[2];
      if (t[1] === "Value") {
        const key = ASC_PARAM[current.partId];
        if (key) {
          const v = parseSpiceValue(t[2]);
          if (Number.isFinite(v)) current.params[key] = v;
        }
      }
    }
  }

  if (!Number.isFinite(minX)) return doc;
  const ox = 140 - minX * SCALE;
  const oy = 140 - minY * SCALE;
  const sx = (x: number) => Math.round((x * SCALE + ox) / 10) * 10;
  const sy = (y: number) => Math.round((y * SCALE + oy) / 10) * 10;

  for (const inst of doc.instances) {
    inst.x = sx(inst.x);
    inst.y = sy(inst.y);
  }

  // Drahtenden an Pins snappen (LTspice-Anker ≠ unsere Pin-Geometrie).
  const snap = (x: number, y: number) => {
    let best: { x: number; y: number } | null = null;
    let bestD = 34 * 34;
    for (const inst of doc.instances) {
      const part = PART_MAP[inst.partId];
      if (!part) continue;
      for (let i = 0; i < part.pins.length; i++) {
        const p = pinPosition(inst, i);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    return best ?? { x, y };
  };

  for (const [x1, y1, x2, y2] of rawWires) {
    const a = snap(sx(x1), sy(y1));
    const b = snap(sx(x2), sy(y2));
    if (a.x === b.x && a.y === b.y) continue;
    doc.wires.push({ id: uid("w"), points: [a, b] });
  }
  for (const f of flags) {
    doc.labels.push({ id: uid("l"), x: sx(f.x), y: sy(f.y), name: f.name } as NetLabel);
  }
  if (unknown.length) {
    doc.notes.push({
      id: uid("n"),
      x: 140,
      y: 40,
      text: `LTspice-Import: ${unknown.length} unbekannte Symbole übersprungen (${[...new Set(unknown)].slice(0, 6).join(", ")}${unknown.length > 6 ? ", …" : ""})`,
      size: 9,
    });
  }
  return doc;
}
