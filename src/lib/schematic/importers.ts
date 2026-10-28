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
import { normalizeDocGeometry } from "./netdraw";

let seq = 0;
const uid = (p: string) => `${p}_${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** SPICE-Wert mit Suffix (10k, 4u7, meg, 100n, 10kΩ, 4,7k …) → Zahl. */
export function parseSpiceValue(tok: string | undefined): number {
  if (!tok) return NaN;
  let s = tok
    .trim()
    .replace(/,/g, ".")
    .replace(/[µμ]/g, "u")
    .replace(/\s+/g, "")
    .toLowerCase()
    .replace(/(ohm|ω|Ω|hz|f|v|a|h|w|s)$/i, "");
  // Infix-Suffix wie 4u7 → 4.7 µ, 4k7 → 4.7 k, 4r7 → 4.7
  let infix = 1;
  const mid = s.match(/^(\d+)([munpkr])(\d+)$/);
  if (mid) {
    s = `${mid[1]}.${mid[3]}`;
    infix = ({ m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, k: 1e3, r: 1 } as Record<string, number>)[mid[2]];
  } else if (/^\d+(\.\d+)?r$/.test(s)) {
    s = s.slice(0, -1);
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
  J: { partId: "jfet_2n3819", pins: 3 },
};

const upper = (s: string | undefined): string => (s ?? "").toUpperCase();

/** Modellname -> konkretes Bibliotheks-Bauteil (Heuristik, dokumentiert). */
function spiceModelPart(type: string, model: string): string {
  const m = upper(model);
  if (type === "D") {
    if (/4007/.test(m)) return "diode_1n4007";
    if (/5819|SCHOTTKY/.test(m)) return "diode_1n5819";
    if (/ZENER|BZX|BZY/.test(m)) return "diode_zener";
    return "diode_1n4148";
  }
  if (type === "Q") {
    if (/PNP|3906|557|2907/.test(m)) return /557/.test(m) ? "pnp_bc557" : "pnp_2n3906";
    if (/547/.test(m)) return "npn_bc547";
    if (/139/.test(m)) return "npn_bd139";
    return "npn_2n3904";
  }
  // M
  if (/P-?CH|PMOS|9540/.test(m)) return /9540/.test(m) ? "pmos_irf9540" : "pmos";
  if (/540/.test(m)) return "nmos_irf540";
  return "nmos";
}

/** Rest-Tokens einer V/I-Zeile -> { partId, params, note }. */
function spiceSource(ref: string, isCurrent: boolean, toks: string[]): { partId: string; params: Record<string, number>; note?: string } {
  const flat = toks.join(" ").toUpperCase();
  const words = flat.split(/[\s(),=]+/).filter(Boolean);
  const num = (w: string | undefined): number => parseSpiceValue(w);
  const firstNum = (): number => {
    for (const w of words) {
      const v = num(w);
      if (Number.isFinite(v)) return v;
    }
    return NaN;
  };
  const acIdx = words.indexOf("AC");
  const acMag = acIdx >= 0 ? num(words[acIdx + 1]) : NaN;
  const withAc = (p: Record<string, number>): Record<string, number> =>
    Number.isFinite(acMag) ? { ...p, acMag } : p;
  if (words[0] === "SIN" || flat.includes("SIN(")) {
    // SIN(voff vamp freq td phase)
    const vals = words.slice(1, 6).map(num);
    if (isCurrent) {
      const p = withAc({ dc: Number.isFinite(vals[0]) ? vals[0] : 0 });
      return { partId: "idc", params: p, note: `${ref}: SIN-Stromquelle → DC-Anteil (kein IAC-Bauteil)` };
    }
    const p = withAc({
      offset: Number.isFinite(vals[0]) ? vals[0] : 0,
      amplitude: Number.isFinite(vals[1]) ? vals[1] : 5,
      freq: Number.isFinite(vals[2]) ? vals[2] : 1000,
      phase: Number.isFinite(vals[4]) ? vals[4] : 0,
    });
    const tdNote = Number.isFinite(vals[3]) && vals[3] !== 0 ? ` (Einschaltverzögerung ${vals[3]} s entfällt)` : "";
    return { partId: "vac", params: p, note: tdNote ? `${ref}: SIN importiert${tdNote}` : undefined };
  }
  if (words[0] === "PULSE" || flat.includes("PULSE(")) {
    // PULSE(v1 v2 td tr tf pw per)
    const vals = words.slice(1, 8).map(num);
    if (isCurrent) {
      const p = withAc({ dc: Number.isFinite(vals[0]) ? vals[0] : 0 });
      return { partId: "idc", params: p, note: `${ref}: PULSE-Stromquelle → DC-Anteil (kein IAC-Bauteil)` };
    }
    const per = Number.isFinite(vals[6]) && vals[6] > 0 ? (vals[6] as number) : 1e-3;
    const pw = Number.isFinite(vals[5]) ? (vals[5] as number) : per / 2;
    return {
      partId: "vpulse",
      params: withAc({
        offset: Number.isFinite(vals[0]) ? vals[0] : 0,
        amplitude: Number.isFinite(vals[1]) ? vals[1] : 5,
        delay: Number.isFinite(vals[2]) ? vals[2] : 0,
        rise: Number.isFinite(vals[3]) ? vals[3] : 1e-9,
        fall: Number.isFinite(vals[4]) ? vals[4] : 1e-9,
        freq: 1 / per,
        duty: Math.min(99, Math.max(1, (pw / per) * 100)),
      }),
    };
  }
  if (/EXP\(|PWL\(|SFFM\(|AM\(|PWL/.test(flat)) {
    const dc = firstNum();
    const p = withAc(Number.isFinite(dc) ? { dc } : {});
    return { partId: isCurrent ? "idc" : "vdc", params: p, note: `${ref}: Zeitverlauf (EXP/PWL/SFFM/AM) → DC-Anteil` };
  }
  // DC v [AC mag] oder reiner Wert
  const dcIdx = words.indexOf("DC");
  const dc = dcIdx >= 0 ? num(words[dcIdx + 1]) : firstNum();
  const p = withAc(Number.isFinite(dc) ? { dc } : {});
  return { partId: isCurrent ? "idc" : "vdc", params: p };
}

interface NetPin {
  inst: Instance;
  pin: number;
}

interface RoutePt { x: number; y: number }

/** Liegt Punkt p exakt auf dem achsparallelen Segment a-b (Endpunkte inklusive)? */
function hitsSeg(p: RoutePt, a: RoutePt, b: RoutePt): boolean {
  if (a.x === b.x && p.x === a.x) return p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
  if (a.y === b.y && p.y === a.y) return p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
  return false;
}

/**
 * S3.5: Kollisionsfreies Lane-Routing. Verbindet zwei eigene Pins orthogonal,
 * ohne einen fremden Pin zu berühren (das hätte Netze kurzgeschlossen —
 * der alte chainPoints-Import war bei mehrpoligen Netzen unbrauchbar).
 * Zusätzlich meidet jeder Knick fremde Stützpunkte (`blockedVerts`):
 * `buildNets` vereint Drahtketten über exakt gleiche Stütz-Schlüssel —
 * ein geteilter Knick würde zwei Netze still kurzschließen (W61-Lücke).
 * Alle Knicke liegen auf dem 10er-Raster (normalisierungsstabil).
 * Gibt null zurück, wenn keine freie Gasse existiert (→ Verbinder-Fallback).
 */
function routeHop(a: RoutePt, b: RoutePt, avoid: RoutePt[], blockedVerts?: Set<string>): RoutePt[] | null {
  const vkey = (p: RoutePt): string => `${Math.round(p.x)},${Math.round(p.y)}`;
  const clear = (pts: RoutePt[]): boolean => {
    for (let i = 0; i + 1 < pts.length; i++) {
      for (const p of avoid) {
        // Eigene Endpunkte sind ausgenommen (Anschluss ist gewollt).
        if ((p.x === a.x && p.y === a.y) || (p.x === b.x && p.y === b.y)) continue;
        if (hitsSeg(p, pts[i], pts[i + 1])) return false;
      }
    }
    if (blockedVerts) {
      for (let i = 1; i + 1 < pts.length; i++) {
        if (blockedVerts.has(vkey(pts[i]))) return false;
      }
    }
    return true;
  };
  const direct: RoutePt[] = [a, b];
  if ((a.x === b.x || a.y === b.y) && clear(direct)) return direct;
  for (const lane of [0, 10, -10, 20, -20, 30, -30, 40, -40, 50, -50, 60, -60, 70, -70, 80, -80]) {
    for (const xoff of [0, 10, -10, 20, -20]) {
      // Strikt Manhattan (jeder Schritt teilt x oder y) — sonst würde die
      // Nach-Normalisierung Diagonale zurück in blockierte Bahnen biegen.
      const elbow = { x: b.x + xoff, y: a.y + lane };
      const cand = lane === 0 && xoff === 0
        ? [a, elbow, b]
        : [a, { x: a.x, y: a.y + lane }, elbow, { x: b.x + xoff, y: b.y }, b];
      // Entartete Knicke (identisch mit Vorgänger) entfernen.
      const pts = cand.filter((p, i) => i === 0 || p.x !== cand[i - 1].x || p.y !== cand[i - 1].y);
      if (pts.length >= 2 && clear(pts)) return pts;
    }
  }
  return null;
}

export function fromSpiceNetlist(text: string): SchematicDoc {
  const doc = emptyDoc("Importierte Netzliste");
  const nets = new Map<string, NetPin[]>();
  const skipped: string[] = [];
  const notes: string[] = [];
  const vSources = new Map<string, string[]>(); // REF -> Netze (für F/H-Steuerung)
  const deferredFH: Array<{ inst: Instance; ctrl: string; ref: string }> = [];
  let placed = 0;
  let subcktDepth = 0;
  let subcktSkipped = 0;

  // Fortsetzungszeilen (+) an die Vorzeile hängen (SPICE-Konvention).
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    if (/^\+\s?/.test(raw) && lines.length) lines[lines.length - 1] += " " + raw.replace(/^\+\s?/, "");
    else lines.push(raw);
  }

  const place = (partId: string, label: string, params: Record<string, number | string | boolean> = {}): Instance => {
    const x = 140 + (placed % 6) * 170;
    const y = 130 + Math.floor(placed / 6) * 170;
    placed++;
    const inst: Instance = { id: uid("i"), partId, x, y, rot: 0, label, params };
    doc.instances.push(inst);
    return inst;
  };
  const bind = (inst: Instance, nodes: string[]) => {
    nodes.forEach((net, pin) => {
      const list = nets.get(net) ?? [];
      list.push({ inst, pin });
      nets.set(net, list);
    });
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("*")) continue;
    if (/^\.(SUBCKT|SUBCIRCUIT)\b/i.test(line)) {
      subcktDepth++;
      notes.push(`Subcircuit ${(line.split(/\s+/)[1] ?? "").toUpperCase()} übersprungen (flacher Import, keine Hierarchie)`);
      continue;
    }
    if (/^\.ENDS\b/i.test(line)) {
      subcktDepth = Math.max(0, subcktDepth - 1);
      continue;
    }
    if (line.startsWith(".")) continue;
    if (subcktDepth > 0) {
      subcktSkipped++;
      continue;
    }
    const toks = line.split(/\s+/);
    const ref = toks[0].toUpperCase();
    const type = ref[0];
    const spec = SPICE_MAP[type];
    if (type === "V" || type === "I") {
      const nodes = toks.slice(1, 3);
      if (nodes.length < 2) continue;
      const src = spiceSource(ref, type === "I", toks.slice(3));
      const inst = place(src.partId, ref, src.params);
      bind(inst, nodes);
      if (type === "V") vSources.set(ref, nodes);
      if (src.note) notes.push(src.note);
      continue;
    }
    if (type === "D" || type === "Q" || type === "M") {
      const need = type === "D" ? 2 : 3;
      const nodes = toks.slice(1, 1 + need);
      if (nodes.length < need) continue;
      // M mit 4 Knoten (Bulk liegt am 4.): Bulk ignorieren, Modell folgt danach.
      let model = toks[1 + need] ?? "";
      if (type === "M") {
        const plain = toks.slice(1).filter((t) => !t.includes("="));
        if (plain.length >= 5) {
          model = plain[4] ?? "";
          notes.push(`${ref}: Bulk-Anschluss ignoriert (3-Pin-MOSFET-Modell)`);
        } else model = plain[3] ?? "";
      }
      const partId = spiceModelPart(type, model);
      const params: Record<string, number> = {};
      if (partId === "diode_zener") {
        const mV = upper(model).match(/(\d+)[Vv](\d?)/);
        params.vz = mV ? Number(mV[1]) + (mV[2] ? Number(mV[2]) / 10 : 0) : 5.1;
      }
      bind(place(partId, ref, params), nodes);
      continue;
    }
    if (type === "E" || type === "G") {
      // En+ n- nc+ nc- gain  (POLY(1): Verstärkung = p1)
      const nodes = toks.slice(1, 5);
      if (nodes.length < 4) continue;
      let gain = parseSpiceValue(toks[5]);
      if (upper(toks[5]) === "POLY(1)") {
        gain = parseSpiceValue(toks[8]);
        const p0 = parseSpiceValue(toks[7]);
        if (Number.isFinite(p0) && p0 !== 0) notes.push(`${ref}: POLY-Offset ${p0} ignoriert (nur p1 als Verstärkung)`);
      }
      const params: Record<string, number> = Number.isFinite(gain) ? { gain } : {};
      bind(place(type === "E" ? "vcvs" : "vccs", ref, params), nodes);
      continue;
    }
    if (type === "F" || type === "H") {
      // Fn+ n- Vcontrol gain (Steuerzweig wird nach dem Platzieren aufgelöst)
      const nodes = toks.slice(1, 3);
      if (nodes.length < 2) continue;
      const gain = parseSpiceValue(toks[4]);
      const inst = place(type === "F" ? "cccs" : "ccvs", ref, Number.isFinite(gain) ? { gain } : {});
      bind(inst, nodes);
      deferredFH.push({ inst, ctrl: upper(toks[3]), ref });
      continue;
    }
    if (!spec) {
      if (/^[A-Z]/i.test(toks[0])) skipped.push(toks[0]);
      continue;
    }
    const nodes = toks.slice(1, 1 + spec.pins);
    if (nodes.length < spec.pins) continue;
    const inst = place(spec.partId, ref);
    if (spec.param) {
      const v = parseSpiceValue(toks[1 + spec.pins]);
      if (Number.isFinite(v)) inst.params[spec.param] = v;
    }
    bind(inst, nodes);
  }

  // F/H-Steuerzweige auflösen: CTRL-Pins an die Netze der steuernden Quelle.
  for (const d of deferredFH) {
    const ctrlNets = vSources.get(d.ctrl);
    if (!ctrlNets) {
      notes.push(`${d.ref}: steuernde Quelle ${d.ctrl} nicht gefunden (CTRL-Pins offen)`);
      continue;
    }
    // CTRL-Pins (2,3) an die Netze der steuernden Quelle hängen.
    for (const [k, net] of ctrlNets.entries()) {
      const list = nets.get(net) ?? [];
      list.push({ inst: d.inst, pin: 2 + k });
      nets.set(net, list);
    }
  }
  if (subcktSkipped > 0) notes.push(`${subcktSkipped} Subcircuit-Zeilen übersprungen (flacher Import)`);

  // Alle Pin-Positionen (Kollisionsmenge fürs Routing).
  const allPins: RoutePt[] = [];
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    for (let idx = 0; idx < part.pins.length; idx++) {
      const q = pinPosition(inst, idx);
      allPins.push({ x: q.x, y: q.y });
    }
  }
  // S3.5: Netze → Leitungen in vier Pässen (alle kollisionsgeprüft).
  const netPts = new Map<string, RoutePt[]>();
  for (const [name, pins] of nets) {
    netPts.set(name, pins
      .map((pp) => pinPosition(pp.inst, pp.pin))
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((q) => ({ x: q.x, y: q.y })));
  }
  const isGroundName = (name: string): boolean => name === "0" || upper(name) === "GND";
  // GND-Spots vorab bestimmen (Pin 40 unter dem ersten Masse-Pin) — alle
  // Netze routen daran vorbei.
  const gndSpots: Array<{ net: string; pin: RoutePt }> = [];
  for (const [name, pts] of netPts) {
    if (isGroundName(name) && pts.length) gndSpots.push({ net: name, pin: { x: pts[0].x, y: pts[0].y + 40 } });
  }
  const pinAvoid = [...allPins, ...gndSpots.map((g) => g.pin)];
  // Alle belegten Stützpunkte (Pins + GND-Spots + geroutete Knicke): kein
  // fremder Knick darf exakt darauf landen (W61-Lücke: geteilter Schlüssel
  // vereint zwei Drahtketten). Eigene Ketten-Enden sind ausgenommen.
  const vkey = (p: RoutePt): string => `${Math.round(p.x)},${Math.round(p.y)}`;
  const usedVerts = new Set<string>(pinAvoid.map(vkey));
  // Eigene Segmente je Netz (Labels meiden fremde Segmente — sonst Kurzschluss).
  const netSegs = new Map<string, Array<[RoutePt, RoutePt]>>();
  const ownSet = (name: string): Set<string> => new Set((netPts.get(name) ?? []).map((q) => `${q.x},${q.y}`));
  const onForeignSeg = (name: string, pt: RoutePt): boolean => {
    for (const [n, segs] of netSegs) {
      if (n === name) continue;
      for (const [a, b] of segs) if (hitsSeg(pt, a, b)) return true;
    }
    return false;
  };
  const avoidFor = (name: string): RoutePt[] => {
    const own = ownSet(name);
    return pinAvoid.filter((q) => !own.has(`${q.x},${q.y}`));
  };

  let impConn = 0;
  // Pass A: mehrpolige Netze kollisionsfrei verketten.
  for (const [name, pts] of netPts) {
    if (pts.length < 2) continue;
    const avoid = avoidFor(name);
    let route: RoutePt[] | null = [{ ...pts[0] }];
    for (let i = 1; i < pts.length && route; i++) {
      const hop = routeHop(pts[i - 1], pts[i], avoid, usedVerts);
      route = hop ? [...route, ...hop.slice(1)] : null;
    }
    if (!route) {
      // Fallback: On-Page-Verbinder je Pin (gleicher Name = gleiches Netz).
      const cname = `IMP_${name.replace(/[^A-Za-z0-9_]+/g, "_").slice(0, 18) || "NET"}`;
      for (const q of pts) {
        doc.instances.push({
          id: uid("i"), partId: "onpage_connector", x: q.x + 30, y: q.y,
          rot: 0, label: `IMP${++impConn}`, params: { name: cname },
        });
      }
      notes.push(`Netz ${name}: geometrisch nicht routbar, per Verbinder ${cname} verbunden`);
      continue;
    }
    if (isGroundName(name)) route.unshift({ x: route[0].x, y: route[0].y + 40 });
    doc.wires.push({ id: uid("w"), points: route });
    for (const q of route) usedVerts.add(vkey(q));
    const segs: Array<[RoutePt, RoutePt]> = [];
    for (let i = 0; i + 1 < route.length; i++) segs.push([route[i], route[i + 1]]);
    netSegs.set(name, segs);
  }
  // Pass B: GND-Symbole setzen (Spots sind pinfrei per Konstruktion).
  for (const g of gndSpots) {
    doc.instances.push({ id: uid("i"), partId: "gnd", x: g.pin.x, y: g.pin.y + 20, rot: 0, label: "GND", params: {} });
    const pts = netPts.get(g.net) ?? [];
    if (pts.length === 1) {
      doc.wires.push({ id: uid("w"), points: [{ ...g.pin }, { ...pts[0] }] });
      netSegs.set(g.net, [[{ ...g.pin }, { ...pts[0] }]]);
    }
  }
  // Pass C: einpolige Netze (L-Stich in freier Richtung, sonst schwebendes Label).
  for (const [name, pts] of netPts) {
    if (pts.length !== 1 || isGroundName(name)) continue;
    const a = pts[0];
    const own = ownSet(name);
    const endOk = (end: RoutePt, mid: RoutePt): boolean => {
      for (const q of pinAvoid) {
        if (own.has(`${q.x},${q.y}`)) continue;
        if (hitsSeg(q, a, mid) || hitsSeg(q, mid, end)) return false;
      }
      // Stich-Knick und -Ende dürfen auf keinem fremden Stützpunkt landen
      // (W61-Lücke) und das Ende auf keinem fremden Segment.
      if (usedVerts.has(vkey(mid)) || usedVerts.has(vkey(end))) return false;
      return !onForeignSeg(name, end);
    };
    const dirs = [
      { x: 30, y: -30 }, { x: -30, y: -30 }, { x: 30, y: 30 }, { x: -30, y: 30 },
    ];
    let done = false;
    for (const d of dirs) {
      const mid = { x: a.x + d.x, y: a.y };
      const end = { x: a.x + d.x, y: a.y + d.y };
      if (!endOk(end, mid)) continue;
      doc.wires.push({ id: uid("w"), points: [{ ...a }, mid, end] });
      usedVerts.add(vkey(mid));
      usedVerts.add(vkey(end));
      netSegs.set(name, [[{ ...a }, mid], [mid, end]]);
      doc.labels.push({ id: uid("l"), x: end.x, y: end.y, name } as NetLabel);
      done = true;
      break;
    }
    if (!done) {
      doc.labels.push({ id: uid("l"), x: a.x + 30, y: a.y - 30, name } as NetLabel);
      notes.push(`Netz ${name}: Stichpin ohne Leitung (Label schwebt)`);
    }
  }
  // Pass D: Labels mehrpoliger Netze (Anker auf eigener Leitung, nie auf fremder).
  const netRoute = new Map<string, RoutePt[]>();
  for (const w of doc.wires) {
    for (const [name, pts] of netPts) {
      if (netRoute.has(name) || pts.length < 2) continue;
      const first = w.points[0];
      if (first && pts.some((q) => Math.abs(q.x - first.x) < 0.01 && Math.abs(q.y - first.y) < 0.01)) netRoute.set(name, w.points);
    }
  }
  for (const [name, pts] of netPts) {
    if (pts.length < 2 || isGroundName(name) || /^\d+$/.test(name)) continue;
    const own = ownSet(name);
    const route = netRoute.get(name) ?? [];
    const anchor: RoutePt | null = route.find((q) => !own.has(`${Math.round(q.x)},${Math.round(q.y)}`) && !onForeignSeg(name, { x: Math.round(q.x), y: Math.round(q.y) })) ?? null;
    let finalAnchor: RoutePt | null = anchor;
    if (!finalAnchor) {
      // Längstes Segment, Rasterpunkt in der Mitte (innen + fremdsegmentfrei).
      let best: [RoutePt, RoutePt] | null = null;
      let bestLen = -1;
      for (let i = 0; i + 1 < route.length; i++) {
        const len = Math.abs(route[i].x - route[i + 1].x) + Math.abs(route[i].y - route[i + 1].y);
        if (len > bestLen) { bestLen = len; best = [route[i], route[i + 1]]; }
      }
      if (best && bestLen >= 10) {
        const gx = Math.round(((best[0].x + best[1].x) / 2) / 10) * 10;
        const gy = Math.round(((best[0].y + best[1].y) / 2) / 10) * 10;
        const cand = { x: gx, y: gy };
        if (hitsSeg(cand, best[0], best[1]) && !onForeignSeg(name, cand)) finalAnchor = cand;
      }
      finalAnchor ??= { ...pts[0] };
    }
    doc.labels.push({ id: uid("l"), x: Math.round(finalAnchor.x), y: Math.round(finalAnchor.y), name } as NetLabel);
  }

  const importHints = [...notes];
  if (skipped.length) {
    importHints.push(`${skipped.length} unbekannte Netzlisten-Zeilen übersprungen (${[...new Set(skipped)].slice(0, 6).join(", ")}${skipped.length > 6 ? ", …" : ""})`);
  }
  if (importHints.length) {
    doc.notes.push({
      id: uid("n"),
      x: 140,
      y: 40,
      text: `Import: ${importHints.slice(0, 8).join(" · ")}${importHints.length > 8 ? " · …" : ""}`,
      size: 9,
    });
  }
  // W49/W62: importierte Leitungsenden auf die tatsächlichen Pins rasten und
  // die Geometrie rechtwinklig/rasterkonform aufräumen.
  normalizeDocGeometry(doc);
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
  // W49/W62: LTspice zeichnet auf sein eigenes Raster – Enden rasten, Segmente
  // werden rechtwinklig.
  normalizeDocGeometry(doc);
  return doc;
}

/* ------------------------------------------------------------------ */
/* 3 · KiCad-Schaltplan (.kicad_sch, S-Expr, minimal — Sprint 3.5)       */
/*                                                                      */
/* Unterstützt: R/C/L, D/Schottky/Zener/LED, NPN/PNP, NMOS/PMOS, JFET,  */
/* Poti, Quarz, Sicherung, NE555, Einzel-OPV, VDC/Batterie, GND und     */
/* sonstige Power-Symbole (→ Verbindungspunkt), Drähte,                */
/* Verbindungspunkte, Netz-/Global-/Hierarchie-Labels (alle als global  */
/* behandelt), Texte. Übersprungen + im Plan vermerkt: Busse,           */
/* Unterschaltpläne, Logik-ICs, Stecker, unbekannte Symbole.            */
/* Annahmen (dokumentiert, Prüfen empfohlen): KiCad-Y wächst nach       */
/* unten (kein Flip); Pin-(at) ist der Anschlusspunkt; Drehung im       */
/* Uhrzeigersinn; Dioden-Pin 1 = Kathode (außer LED: Pin 1 = Anode);    */
/* gespiegelte Symbole werden nicht erkannt. Die Bauteil-Drehung wird   */
/* per Suche (0/90/180/270) so gewählt, dass unsere Pins bestmöglich    */
/* auf den KiCad-Pinspitzen liegen; Drahtenden rasten danach auf Pins.  */
/* ------------------------------------------------------------------ */

export function isKicadSch(text: string): boolean {
  return /\(\s*kicad_sch[\s)]/.test(text.slice(0, 4000));
}

type Sx = string | Sx[];

function parseSexpr(text: string): Sx[] {
  const root: Sx[] = [];
  const stack: Sx[][] = [root];
  let tok = "";
  let inStr = false;
  let esc = false;
  const flush = () => {
    if (tok.length) {
      stack[stack.length - 1].push(tok);
      tok = "";
    }
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) { tok += c; esc = false; }
      else if (c === "\\") esc = true;
      else if (c === '"') { inStr = false; stack[stack.length - 1].push(tok); tok = ""; }
      else tok += c;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "(") { const n: Sx[] = []; stack[stack.length - 1].push(n); stack.push(n); continue; }
    if (c === ")") { flush(); stack.pop(); if (!stack.length) stack.push(root); continue; }
    if (/\s/.test(c)) { flush(); continue; }
    tok += c;
  }
  flush();
  return root;
}

const sxKids = (n: Sx[], head: string): Sx[][] =>
  n.filter((c): c is Sx[] => Array.isArray(c) && c[0] === head);
const sxFirst = (n: Sx[], head: string): Sx[] | undefined => sxKids(n, head)[0];
const sxAtom = (n: Sx[] | undefined, idx: number): string =>
  n && typeof n[idx] === "string" ? (n[idx] as string) : "";

interface KPin { num: string; name: string; x: number; y: number }

function kicadLibPins(symNode: Sx[]): KPin[] {
  const out = new Map<string, KPin>();
  const key = (p: KPin) => `${p.num}¦${p.x.toFixed(3)},${p.y.toFixed(3)}`;
  const walk = (n: Sx): void => {
    if (!Array.isArray(n)) return;
    if (n[0] === "pin") {
      const at = sxFirst(n, "at");
      const num = sxAtom(sxFirst(n, "number"), 1);
      const name = sxAtom(sxFirst(n, "name"), 1);
      const p: KPin = { num, name, x: Number(sxAtom(at, 1)), y: Number(sxAtom(at, 2)) };
      if (num && Number.isFinite(p.x) && Number.isFinite(p.y) && !out.has(key(p))) out.set(key(p), p);
    } else {
      n.forEach(walk);
    }
  };
  walk(symNode);
  return [...out.values()];
}

interface KMap {
  partId: string;
  param?: string;
  pin: (num: string, name: string) => number | null;
}
const kByNum = (m: Record<string, number>): KMap["pin"] => (num) => m[num] ?? null;
const kByName = (m: Record<string, number>): KMap["pin"] => (_num, name) => m[name.toUpperCase()] ?? null;

function kicadPartFor(libId: string): (KMap & { power?: "gnd" | "pwr" }) | null {
  const ci = libId.indexOf(":");
  const lib = (ci >= 0 ? libId.slice(0, ci) : "").toLowerCase();
  const s = (ci >= 0 ? libId.slice(ci + 1) : libId).toUpperCase();
  if (lib === "power") return { partId: "gnd", power: /GND/.test(s) ? "gnd" : "pwr", pin: () => null };
  if (/^R(_|$)/.test(s) && !/POT|RV/i.test(s)) return { partId: "resistor", param: "r", pin: kByNum({ 1: 0, 2: 1 }) };
  if (/POT/.test(s)) return { partId: "potentiometer", param: "r", pin: kByNum({ 1: 0, 2: 1, 3: 2 }) };
  if (/^C(_|$)/.test(s)) return { partId: "capacitor", param: "c", pin: kByNum({ 1: 0, 2: 1 }) };
  if (/^L(_|$)/.test(s)) return { partId: "inductor", param: "l", pin: kByNum({ 1: 0, 2: 1 }) };
  if (/SCHOTTKY/.test(s)) return { partId: "diode_1n5819", pin: kByNum({ 1: 1, 2: 0 }) };
  if (/ZENER/.test(s)) return { partId: "diode_zener", pin: kByNum({ 1: 1, 2: 0 }) };
  if (s === "LED" || s.startsWith("LED_")) return { partId: "led", param: "vf", pin: kByNum({ 1: 0, 2: 1 }) };
  if (/^D(_|$)/.test(s)) return { partId: "diode_1n4148", pin: kByNum({ 1: 1, 2: 0 }) };
  if (/_PNP_/.test(s) || s.endsWith("_PNP")) return { partId: "pnp_2n3906", pin: kByName({ C: 0, B: 1, E: 2 }) };
  if (/_NPN_/.test(s) || s.endsWith("_NPN")) return { partId: "npn_2n3904", pin: kByName({ C: 0, B: 1, E: 2 }) };
  if (/NMOS/.test(s)) return { partId: "nmos", pin: kByName({ D: 0, G: 1, S: 2 }) };
  if (/PMOS/.test(s)) return { partId: "pmos", pin: kByName({ D: 0, G: 1, S: 2 }) };
  if (/JFET/.test(s)) return { partId: "jfet_2n3819", pin: kByName({ D: 0, G: 1, S: 2 }) };
  if (/CRYSTAL/.test(s)) return { partId: "crystal", param: "freq", pin: kByNum({ 1: 0, 2: 1 }) };
  if (/FUSE/.test(s)) return { partId: "fuse", pin: kByNum({ 1: 0, 2: 1 }) };
  if (lib === "timer" && /555/.test(s)) {
    return { partId: "ne555", pin: (num) => { const n = Number(num); return n >= 1 && n <= 8 ? n - 1 : null; } };
  }
  if (lib === "amplifier_operational" && /OPAMP/.test(s)) {
    return { partId: "opamp_ideal", pin: kByName({ "+": 0, "-": 1, "~": 2, OUT: 2, "V+": 3, "V-": 4 }) };
  }
  if (/VSRC|VDC|^V(_|$)/.test(s) || s === "BATTERY" || s.startsWith("BATTERY_")) {
    return {
      partId: "vdc", param: "dc",
      pin: (num, name) => ({ "+": 0, "-": 1 }[name] ?? ({ 1: 0, 2: 1 }[num] ?? null)),
    };
  }
  return null;
}

/** KiCad-Drehung (0/90/180/270, Uhrzeigersinn bei Y-nach-unten) auf lokale Pinspitze. */
function kicadRot(px: number, py: number, deg: number): [number, number] {
  const d = ((Math.round(deg / 90) % 4) + 4) % 4;
  if (d === 1) return [-py, px];
  if (d === 2) return [-px, -py];
  if (d === 3) return [py, -px];
  return [px, py];
}

const KSCALE = 10; // mm → unsere Einheiten

export function fromKicadSch(text: string): SchematicDoc {
  const doc = emptyDoc("KiCad-Import");
  const root = parseSexpr(text).find((n): n is Sx[] => Array.isArray(n) && n[0] === "kicad_sch");
  if (!root) throw new Error("Kein (kicad_sch …)-Dokument gefunden.");
  const unknown: string[] = [];
  let buses = 0;
  let sheets = 0;
  let noConn = 0;

  const libPins = new Map<string, KPin[]>();
  for (const libs of sxKids(root, "lib_symbols")) {
    for (const sym of sxKids(libs, "symbol")) {
      const name = sxAtom(sym, 1);
      if (name && !libPins.has(name)) libPins.set(name, kicadLibPins(sym));
    }
  }

  interface KInst {
    inst: Instance; tips: Map<number, { x: number; y: number }>; power?: "gnd" | "pwr"; value: string;
  }
  const kinsts: KInst[] = [];
  const rawWires: Array<Array<{ x: number; y: number }>> = [];
  const rawLabels: Array<{ x: number; y: number; name: string }> = [];
  const rawJuncts: Array<{ x: number; y: number }> = [];
  const rawTexts: Array<{ x: number; y: number; text: string }> = [];
  let minX = Infinity;
  let minY = Infinity;
  const touch = (x: number, y: number) => {
    if (Number.isFinite(x) && Number.isFinite(y)) { minX = Math.min(minX, x); minY = Math.min(minY, y); }
  };

  for (const sym of sxKids(root, "symbol")) {
    const libId = sxAtom(sxFirst(sym, "lib_id"), 1);
    if (!libId) continue; // Bibliotheks-Definition, keine Instanz
    const at = sxFirst(sym, "at");
    const ix = Number(sxAtom(at, 1));
    const iy = Number(sxAtom(at, 2));
    const irot = Number(sxAtom(at, 3)) || 0;
    if (!Number.isFinite(ix) || !Number.isFinite(iy)) continue;
    let ref = "";
    let value = "";
    for (const p of sxKids(sym, "property")) {
      const k = sxAtom(p, 1);
      if (k === "Reference") ref = sxAtom(p, 2);
      else if (k === "Value") value = sxAtom(p, 2);
    }
    const mapped = kicadPartFor(libId);
    if (!mapped) {
      unknown.push(libId);
      touch(ix, iy);
      continue;
    }
    const short = libId.slice(libId.indexOf(":") + 1);
    const pins = libPins.get(short) ?? [];
    const tips = new Map<number, { x: number; y: number }>();
    if (pins.length) {
      for (const p of pins) {
        const idx = mapped.pin(p.num, p.name);
        if (idx === null || tips.has(idx)) continue;
        const [lx, ly] = kicadRot(p.x, p.y, irot);
        tips.set(idx, { x: ix + lx, y: iy + ly });
      }
    } else {
      touch(ix, iy); // Symbol ohne Bibliotheks-Pins: an (at) andocken
    }
    for (const t of tips.values()) touch(t.x, t.y);
    touch(ix, iy);
    kinsts.push({
      inst: {
        id: uid("i"), partId: mapped.partId, x: 0, y: 0, rot: 0,
        label: ref || mapped.partId, params: {},
      },
      tips, power: mapped.power, value,
    });
    const last = kinsts[kinsts.length - 1];
    (last.inst as Instance & { kx?: number; ky?: number }).kx = ix;
    (last.inst as Instance & { kx?: number; ky?: number }).ky = iy;
    if (mapped.param) {
      let v = parseSpiceValue(value);
      if (mapped.param === "freq") {
        const m = /^([\d.]+)\s*([kMGT]?)[Hh][Zz]/.exec(value.trim());
        if (m) v = Number(m[1]) * ({ k: 1e3, M: 1e6, G: 1e9, T: 1e12 } as Record<string, number>)[m[2] || ""]! || Number(m[1]);
      }
      if (mapped.partId === "zener") {
        const m = /(\d+)[Vv](\d)?/.exec(value);
        if (m) v = Number(m[1] + "." + (m[2] ?? "0"));
      }
      if (Number.isFinite(v)) last.inst.params[mapped.param] = v;
    }
  }

  for (const w of sxKids(root, "wire")) {
    const pts = sxFirst(w, "pts");
    const list = pts ? sxKids(pts, "xy").map((n) => ({ x: Number(sxAtom(n, 1)), y: Number(sxAtom(n, 2)) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)) : [];
    if (list.length >= 2) {
      list.forEach((p) => touch(p.x, p.y));
      rawWires.push(list);
    }
  }
  buses += sxKids(root, "bus").length;
  sheets += sxKids(root, "sheet").length;
  noConn += sxKids(root, "no_connect").length;
  for (const j of sxKids(root, "junction")) {
    const at = sxFirst(j, "at");
    const x = Number(sxAtom(at, 1));
    const y = Number(sxAtom(at, 2));
    if (Number.isFinite(x) && Number.isFinite(y)) { rawJuncts.push({ x, y }); touch(x, y); }
  }
  for (const kind of ["label", "global_label", "hierarchical_label"] as const) {
    for (const l of sxKids(root, kind)) {
      const name = sxAtom(l, 1);
      const at = sxFirst(l, "at");
      const x = Number(sxAtom(at, 1));
      const y = Number(sxAtom(at, 2));
      if (name && Number.isFinite(x) && Number.isFinite(y)) { rawLabels.push({ x, y, name }); touch(x, y); }
    }
  }
  for (const t of sxKids(root, "text")) {
    const str = sxAtom(t, 1);
    const at = sxFirst(t, "at");
    const x = Number(sxAtom(at, 1));
    const y = Number(sxAtom(at, 2));
    if (str && Number.isFinite(x) && Number.isFinite(y)) { rawTexts.push({ x, y, text: str }); touch(x, y); }
  }

  if (!Number.isFinite(minX)) return doc;
  const ox = 140 - minX * KSCALE;
  const oy = 140 - minY * KSCALE;
  const sx = (x: number) => Math.round((x * KSCALE + ox) / 10) * 10;
  const sy = (y: number) => Math.round((y * KSCALE + oy) / 10) * 10;

  // Instanzen platzieren: Drehung per Suche auf die KiCad-Pinspitzen.
  let pwrN = 0;
  for (const k of kinsts) {
    const kx = (k.inst as Instance & { kx?: number }).kx ?? 0;
    const ky = (k.inst as Instance & { ky?: number }).ky ?? 0;
    const scaled = new Map<number, { x: number; y: number }>();
    for (const [idx, t] of k.tips) scaled.set(idx, { x: sx(t.x), y: sy(t.y) });
    delete (k.inst as Partial<Instance & { kx?: number; ky?: number }>).kx;
    delete (k.inst as Partial<Instance & { kx?: number; ky?: number }>).ky;
    if (k.power === "gnd") {
      const t = scaled.get(0) ?? [...scaled.values()][0] ?? { x: sx(kx), y: sy(ky) };
      const gp = PART_MAP["gnd"]?.pins[0] ?? { x: 0, y: -20 }; // Laufzeit-Pin (W25-normalisiert)
      k.inst.x = t.x - gp.x;
      k.inst.y = t.y - gp.y;
      k.inst.label = k.inst.label.startsWith("#PWR") ? "GND" : k.inst.label;
    } else if (k.power === "pwr") {
      const t = [...scaled.values()][0] ?? { x: sx(kx), y: sy(ky) };
      k.inst.partId = "onpage_connector";
      const cp = PART_MAP["onpage_connector"]?.pins[0] ?? { x: -30, y: 0 };
      k.inst.x = t.x - cp.x;
      k.inst.y = t.y - cp.y;
      pwrN += 1;
      k.inst.params = { name: k.value || `PWR${pwrN}` };
      if (k.inst.label.startsWith("#PWR")) k.inst.label = `PWR${pwrN}`;
    } else {
      k.inst.x = sx(kx);
      k.inst.y = sy(ky);
      if (scaled.size && PART_MAP[k.inst.partId]) {
        let best: Instance["rot"] = 0;
        let bestScore = Infinity;
        for (const r of [0, 90, 180, 270] as const) {
          k.inst.rot = r;
          let s = 0;
          for (const [idx, t] of scaled) {
            const p = pinPosition(k.inst, idx);
            s += Math.hypot(p.x - t.x, p.y - t.y);
          }
          if (s < bestScore) { bestScore = s; best = r; }
        }
        k.inst.rot = best;
      }
    }
    doc.instances.push(k.inst);
  }

  // Pin-auf-Pin-Docking: KiCad erlaubt direkt aneinanderstoßende Pins ohne
  // Draht (z. B. Bauteilfuß auf GND-Symbol) — kurze Brücken einziehen.
  {
    const pins: Array<{ x: number; y: number }> = [];
    for (const inst of doc.instances) {
      const part = PART_MAP[inst.partId];
      if (!part) continue;
      for (let i = 0; i < part.pins.length; i++) pins.push(pinPosition(inst, i));
    }
    for (let a = 0; a < pins.length; a++) {
      for (let b = a + 1; b < pins.length; b++) {
        const dx = pins[a].x - pins[b].x;
        const dy = pins[a].y - pins[b].y;
        if (dx * dx + dy * dy > 0 && dx * dx + dy * dy <= 15 * 15) {
          doc.wires.push({ id: uid("w"), points: [pins[a], pins[b]] });
        }
      }
    }
  }

  // Drahtenden an Pins snappen (KiCad-Anker ≠ unsere Pin-Geometrie).
  const snap = (x: number, y: number) => {
    let best: { x: number; y: number } | null = null;
    let bestD = 34 * 34;
    for (const inst of doc.instances) {
      const part = PART_MAP[inst.partId];
      if (!part) continue;
      for (let i = 0; i < part.pins.length; i++) {
        const p = pinPosition(inst, i);
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d < bestD) { bestD = d; best = p; }
      }
    }
    return best ?? { x, y };
  };

  for (const list of rawWires) {
    const pts = list.map((p) => ({ x: sx(p.x), y: sy(p.y) }));
    pts[0] = snap(pts[0].x, pts[0].y);
    pts[pts.length - 1] = snap(pts[pts.length - 1].x, pts[pts.length - 1].y);
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (pts.length === 2 && first.x === last.x && first.y === last.y) continue;
    doc.wires.push({ id: uid("w"), points: pts });
  }
  for (const j of rawJuncts) (doc.junctions ??= []).push({ id: uid("j"), x: sx(j.x), y: sy(j.y) });
  for (const l of rawLabels) doc.labels.push({ id: uid("l"), x: sx(l.x), y: sy(l.y), name: l.name });
  for (const t of rawTexts) doc.notes.push({ id: uid("n"), x: sx(t.x), y: sy(t.y), text: t.text, size: 9 });

  const skipped: string[] = [];
  if (unknown.length) skipped.push(`${unknown.length} unbekannte Symbole (${[...new Set(unknown)].slice(0, 6).join(", ")}${unknown.length > 6 ? ", …" : ""})`);
  if (buses) skipped.push(`${buses} Busse`);
  if (sheets) skipped.push(`${sheets} Unterschaltpläne`);
  if (noConn) skipped.push(`${noConn} Nicht-Verbunden-Markierungen`);
  doc.notes.push({
    id: uid("n"),
    x: 140,
    y: 40,
    text: `KiCad-Import: ${doc.instances.length} Bauteile, ${doc.wires.length} Drähte.` +
      (skipped.length ? ` Übersprungen: ${skipped.join("; ")}.` : " Alles übernommen.") +
      " Bitte prüfen: Drehungen, Dioden-Polarität, Hierarchie-Labels (als global behandelt).",
    size: 9,
  });
  normalizeDocGeometry(doc);
  return doc;
}
