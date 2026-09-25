/**
 * Schematic document model: instances, wires, net extraction (union-find),
 * SPICE netlist generation and import.
 */

import { PART_MAP, PartDef, PartInstanceLike, formatValue } from "@/lib/library/catalog";
import { Device, Netlist } from "@/lib/sim/engine";

export const GRID = 10;

export type Rotation = 0 | 90 | 180 | 270;

export interface Instance {
  id: string;
  partId: string;
  x: number;
  y: number;
  rot: Rotation;
  mirror?: boolean;
  label: string;
  params: Record<string, number | string | boolean>;
  /** MCU source code / free text */
  text?: string;
  fault?: "none" | "open" | "short" | "leakage";
}

export interface Wire {
  id: string;
  points: Array<{ x: number; y: number }>;
  color?: string;
  isBus?: boolean;
  busName?: string;
  busWidth?: number;
}

export interface NetLabel {
  id: string;
  x: number;
  y: number;
  name: string;
}

export interface TextNote {
  id: string;
  x: number;
  y: number;
  text: string;
  size?: number;
}

export type ProbeKind = "voltage" | "current" | "power" | "diff" | "ref" | "digital" | "voltage_current";

export interface ProbeShow {
  vdc?: boolean;
  vrms?: boolean;
  vpp?: boolean;
  vavg?: boolean;
  freq?: boolean;
  idc?: boolean;
  irms?: boolean;
  ipp?: boolean;
  power?: boolean;
}

export interface MeasurementProbe {
  id: string;
  kind: ProbeKind;
  x: number;
  y: number;
  net?: string;
  ref?: string; // net name or REF probe id
  color?: string;
  name?: string;
  direction?: number; // 0 = forward, 1 = reverse for current
  rotation?: number;
  periodic?: boolean;
  show?: ProbeShow;
  thresholds?: {
    low?: number;
    high?: number;
  };
  // For diff probes, second point
  x2?: number;
  y2?: number;
  // V2: Leader from anchor (on wire) to body (offset)
  anchorX?: number;
  anchorY?: number;
  offsetX?: number;
  offsetY?: number;
  leader?: "arrow" | "line" | "magnifier";
}

export interface SchematicDoc {
  id: string;
  name: string;
  instances: Instance[];
  wires: Wire[];
  labels: NetLabel[];
  notes: TextNote[];
  probes: MeasurementProbe[];
}

export function emptyDoc(name = "Neue Schaltung"): SchematicDoc {
  return { id: "sch_" + Math.random().toString(36).slice(2, 9), name, instances: [], wires: [], labels: [], notes: [], probes: [] };
}

/* ----------------------------- geometry ----------------------------- */

export function rotatePoint(x: number, y: number, rot: Rotation, mirror = false): { x: number; y: number } {
  const mx = mirror ? -x : x;
  switch (rot) {
    case 90:
      return { x: -y, y: mx };
    case 180:
      return { x: -mx, y: -y };
    case 270:
      return { x: y, y: -mx };
    default:
      return { x: mx, y };
  }
}

export function pinPosition(inst: Instance, pinIndex: number): { x: number; y: number } {
  const part = PART_MAP[inst.partId];
  const pin = part?.pins[pinIndex];
  if (!pin) return { x: inst.x, y: inst.y };
  const r = rotatePoint(pin.x, pin.y, inst.rot, inst.mirror);
  return { x: inst.x + r.x, y: inst.y + r.y };
}

export function instanceBounds(inst: Instance): { x: number; y: number; w: number; h: number } {
  const part = PART_MAP[inst.partId];
  if (!part) return { x: inst.x - 20, y: inst.y - 20, w: 40, h: 40 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const consider = (px: number, py: number) => {
    const r = rotatePoint(px, py, inst.rot, inst.mirror);
    minX = Math.min(minX, r.x);
    maxX = Math.max(maxX, r.x);
    minY = Math.min(minY, r.y);
    maxY = Math.max(maxY, r.y);
  };
  for (const prim of part.symbol) {
    if (prim.t === "line") for (let i = 0; i < prim.pts.length; i += 2) consider(prim.pts[i], prim.pts[i + 1]);
    else if (prim.t === "rect") {
      consider(prim.x, prim.y);
      consider(prim.x + prim.w, prim.y + prim.h);
    } else if (prim.t === "circle" || prim.t === "arc") {
      consider(prim.x - prim.r, prim.y - prim.r);
      consider(prim.x + prim.r, prim.y + prim.r);
    } else consider(prim.x, prim.y);
  }
  for (const pin of part.pins) consider(pin.x, pin.y);
  if (!Number.isFinite(minX)) return { x: inst.x - 20, y: inst.y - 20, w: 40, h: 40 };
  return { x: inst.x + minX, y: inst.y + minY, w: maxX - minX, h: maxY - minY };
}

/* ----------------------------- nets ----------------------------- */

class UnionFind {
  parent = new Map<string, string>();
  find(a: string): string {
    let r = this.parent.get(a);
    if (r === undefined) {
      this.parent.set(a, a);
      return a;
    }
    if (r !== a) {
      r = this.find(r);
      this.parent.set(a, r);
    }
    return r;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const key = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;

function pointOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): boolean {
  if (ax === bx && ay === by) return px === ax && py === ay;
  const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
  if (Math.abs(cross) > 1) return false;
  const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
  if (dot < 0) return false;
  const len = (bx - ax) ** 2 + (by - ay) ** 2;
  return dot <= len;
}

export interface NetInfo {
  name: string;
  points: Array<{ x: number; y: number }>;
  pins: Array<{ instanceId: string; pinIndex: number; pinName: string }>;
}

export interface NetlistBuildResult {
  netlist: Netlist;
  nets: NetInfo[];
  /** map "instanceId:pinIndex" -> net name */
  pinNets: Record<string, string>;
  /** map point key -> net name */
  pointNets: Record<string, string>;
  errors: string[];
  warnings: string[];
}

export function buildNets(doc: SchematicDoc): NetlistBuildResult {
  const uf = new UnionFind();
  const errors: string[] = [];
  const warnings: string[] = [];

  // wire segments
  const segments: Array<[number, number, number, number]> = [];
  for (const w of doc.wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      segments.push([a.x, a.y, b.x, b.y]);
      uf.union(key(a.x, a.y), key(b.x, b.y));
    }
  }

  // pins snap onto wires (also mid-segment T connections) + fault handling
  const pinPoints: Array<{ instanceId: string; pinIndex: number; pinName: string; x: number; y: number }> = [];
  const faultShortGroups: Array<string[]> = [];
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) {
      errors.push(`Unbekanntes Bauteil "${inst.partId}" (${inst.label})`);
      continue;
    }
    const fault = (inst as any).fault as string | undefined;
    if (fault === "open") {
      warnings.push(`${inst.label}: Fault OPEN – Bauteil wird als unterbrochen simuliert`);
      continue; // don't add pins, so device will be NC and not affect circuit, but we still need to handle device creation later
    }
    if (fault === "short") {
      warnings.push(`${inst.label}: Fault SHORT – Pins werden kurzgeschlossen`);
      // Collect pin keys to short together
      const keys: string[] = [];
      part.pins.forEach((pin, idx) => {
        const pos = pinPosition(inst, idx);
        keys.push(key(pos.x, pos.y));
        pinPoints.push({ instanceId: inst.id, pinIndex: idx, pinName: pin.name, x: pos.x, y: pos.y });
        uf.find(key(pos.x, pos.y));
      });
      if (keys.length > 1) {
        for (let i=1; i<keys.length; i++) uf.union(keys[0], keys[i]);
      }
      continue;
    }
    if (fault === "leakage") {
      warnings.push(`${inst.label}: Fault LEAKAGE – 10k Leckwiderstand wird hinzugefügt (vereinfacht)`);
    }
    part.pins.forEach((pin, idx) => {
      const pos = pinPosition(inst, idx);
      pinPoints.push({ instanceId: inst.id, pinIndex: idx, pinName: pin.name, x: pos.x, y: pos.y });
      uf.find(key(pos.x, pos.y));
    });
  }

  const allPoints = new Set<string>();
  for (const s of segments) {
    allPoints.add(key(s[0], s[1]));
    allPoints.add(key(s[2], s[3]));
  }
  for (const p of pinPoints) allPoints.add(key(p.x, p.y));
  for (const l of doc.labels) allPoints.add(key(l.x, l.y));

  // connect points that lie on a wire segment
  for (const pk of allPoints) {
    const [px, py] = pk.split(",").map(Number);
    for (const [ax, ay, bx, by] of segments) {
      if (pointOnSegment(px, py, ax, ay, bx, by)) uf.union(pk, key(ax, ay));
    }
  }

  // group
  const groups = new Map<string, string[]>();
  for (const pk of allPoints) {
    const root = uf.find(pk);
    const arr = groups.get(root) ?? [];
    arr.push(pk);
    groups.set(root, arr);
  }

  // on-page / off-page connectors: same name = same net (virtual connection)
  const connectorGroups = new Map<string, string[]>(); // name -> root[]
  for (const inst of doc.instances) {
    if (inst.partId === "onpage_connector" || inst.partId === "offpage_connector") {
      const name = String(inst.params.name ?? "NET_A").trim() || "NET_A";
      const pos = pinPosition(inst, 0);
      const root = uf.find(key(pos.x, pos.y));
      const arr = connectorGroups.get(name) ?? [];
      arr.push(root);
      connectorGroups.set(name, arr);
    }
  }
  for (const [name, roots] of connectorGroups) {
    if (roots.length > 1) {
      const first = roots[0];
      for (let i=1; i<roots.length; i++) {
        uf.union(first, roots[i]);
      }
    }
  }
  // Rebuild groups after connector union
  groups.clear();
  for (const pk of allPoints) {
    const root = uf.find(pk);
    const arr = groups.get(root) ?? [];
    arr.push(pk);
    groups.set(root, arr);
  }

  // naming: ground first, then labels, then auto, then onpage/offpage names
  const rootName = new Map<string, string>();
  for (const inst of doc.instances) {
    if (inst.partId === "gnd") {
      const pos = pinPosition(inst, 0);
      rootName.set(uf.find(key(pos.x, pos.y)), "0");
    }
  }
  for (const l of doc.labels) {
    const root = uf.find(key(l.x, l.y));
    if (rootName.get(root) !== "0") rootName.set(root, l.name.trim() || rootName.get(root) || "");
  }
  // onpage/offpage names have priority over auto
  for (const [name, roots] of connectorGroups) {
    if (roots.length) {
      const root = uf.find(roots[0]);
      if (rootName.get(root) !== "0") rootName.set(root, name);
    }
  }
  let counter = 1;
  for (const root of groups.keys()) {
    if (!rootName.get(root)) rootName.set(root, `N${String(counter++).padStart(3, "0")}`);
  }

  // pins that touch nothing at all get a dedicated "not connected" name so that
  // macro models (op-amp supplies, 555 CTRL, ...) can fall back to their defaults
  const pinsPerRoot = new Map<string, number>();
  for (const p of pinPoints) {
    const r = uf.find(key(p.x, p.y));
    pinsPerRoot.set(r, (pinsPerRoot.get(r) ?? 0) + 1);
  }
  for (const p of pinPoints) {
    const r = uf.find(key(p.x, p.y));
    const group = groups.get(r) ?? [];
    if ((pinsPerRoot.get(r) ?? 0) === 1 && group.length === 1 && rootName.get(r) !== "0") {
      rootName.set(r, `${p.instanceId}_nc${p.pinIndex}`);
    }
  }

  const pinNets: Record<string, string> = {};
  for (const p of pinPoints) pinNets[`${p.instanceId}:${p.pinIndex}`] = rootName.get(uf.find(key(p.x, p.y))) ?? "0";

  const pointNets: Record<string, string> = {};
  for (const pk of allPoints) pointNets[pk] = rootName.get(uf.find(pk)) ?? "";

  const nets: NetInfo[] = [];
  for (const [root, pts] of groups) {
    const name = rootName.get(root) ?? "?";
    nets.push({
      name,
      points: pts.map((pk) => {
        const [x, y] = pk.split(",").map(Number);
        return { x, y };
      }),
      pins: pinPoints.filter((p) => uf.find(key(p.x, p.y)) === root).map((p) => ({ instanceId: p.instanceId, pinIndex: p.pinIndex, pinName: p.pinName })),
    });
  }

  // devices + fault handling
  const devices: Device[] = [];
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    const fault = (inst as any).fault as string | undefined;
    if (fault === "open") {
      // Skip device – open circuit
      continue;
    }
    const nodes = part.pins.map((_, idx) => pinNets[`${inst.id}:${idx}`] ?? `${inst.id}_nc${idx}`);
    const like: PartInstanceLike = { id: inst.label || inst.id, partId: inst.partId, params: inst.params, text: inst.text };
    try {
      const devs = part.toDevices(like, nodes);
      if (fault === "short") {
        // For short fault, replace with wire (0 ohm) between first two nodes if possible
        if (nodes.length >= 2) {
          devices.push({ id: inst.label + "_short", type: "R", nodes: [nodes[0], nodes[1]], params: { r: 0.001 } });
        }
      } else if (fault === "leakage") {
        devices.push(...devs);
        // Add 10k leakage between pins
        if (nodes.length >= 2) {
          devices.push({ id: inst.label + "_leak", type: "R", nodes: [nodes[0], nodes[1]], params: { r: 10000 } });
        }
      } else {
        devices.push(...devs);
      }
    } catch (e) {
      errors.push(`${inst.label}: ${(e as Error).message}`);
    }
  }

  if (!devices.length) warnings.push("Keine simulierbaren Bauteile platziert.");
  if (!doc.instances.some((i) => i.partId === "gnd")) warnings.push("Kein Massebezug (GND) im Schaltplan — Simulation kann singulär werden.");

  return { netlist: { devices, title: doc.name }, nets, pinNets, pointNets, errors, warnings };
}

/* ----------------------------- SPICE I/O ----------------------------- */

const sp = (v: number) => {
  if (!Number.isFinite(v)) return "0";
  const a = Math.abs(v);
  if (a === 0) return "0";
  if (a >= 1e6) return `${v / 1e6}Meg`;
  if (a >= 1e3) return `${v / 1e3}k`;
  if (a >= 1) return `${v}`;
  if (a >= 1e-3) return `${v * 1e3}m`;
  if (a >= 1e-6) return `${v * 1e6}u`;
  if (a >= 1e-9) return `${v * 1e9}n`;
  return `${v * 1e12}p`;
};

export function toSpiceNetlist(doc: SchematicDoc, analysis?: string): string {
  const { netlist, errors } = buildNets(doc);
  const lines: string[] = [`* ${doc.name} — exportiert aus CircuitLab Studio`, "* SPICE3/ngspice kompatible Netzliste", ""];
  const models = new Set<string>();
  for (const d of netlist.devices) {
    const n = d.nodes.map((x) => x || "0");
    switch (d.type) {
      case "R":
      case "FUSE":
      case "LAMP":
        lines.push(`R${d.id} ${n[0]} ${n[1]} ${sp(d.params.r ?? 1000)}`);
        break;
      case "POT":
        lines.push(`R${d.id}A ${n[0]} ${n[1]} ${sp((d.params.r ?? 1e4) * (d.params.pos ?? 0.5))}`);
        lines.push(`R${d.id}B ${n[1]} ${n[2]} ${sp((d.params.r ?? 1e4) * (1 - (d.params.pos ?? 0.5)))}`);
        break;
      case "C":
        lines.push(`C${d.id} ${n[0]} ${n[1]} ${sp(d.params.c ?? 1e-6)}`);
        break;
      case "L":
        lines.push(`L${d.id} ${n[0]} ${n[1]} ${sp(d.params.l ?? 1e-3)}`);
        break;
      case "V": {
        const s = d.source;
        let spec = `DC ${sp(s?.dc ?? 0)}`;
        if (s?.kind === "sine") spec = `DC ${sp(s.offset ?? 0)} AC ${s.acMag ?? 1} SIN(${sp(s.offset ?? 0)} ${sp(s.amplitude ?? 1)} ${sp(s.freq ?? 1000)} 0 0 ${s.phase ?? 0})`;
        else if (s?.kind === "pulse") spec = `PULSE(${sp(s.offset ?? 0)} ${sp(s.amplitude ?? 5)} ${sp(s.delay ?? 0)} ${sp(s.rise ?? 1e-9)} ${sp(s.fall ?? 1e-9)} ${sp(s.width ?? 1e-4)} ${sp(s.period ?? 1e-3)})`;
        else if (s?.acMag) spec += ` AC ${s.acMag}`;
        lines.push(`V${d.id} ${n[0]} ${n[1]} ${spec}`);
        break;
      }
      case "I":
        lines.push(`I${d.id} ${n[0]} ${n[1]} DC ${sp(d.source?.dc ?? 0)}`);
        break;
      case "D":
      case "LED":
      case "ZENER":
      case "SCHOTTKY": {
        const mdl = `DMOD_${d.id}`;
        models.add(`.model ${mdl} D(IS=${d.params.is ?? 1e-14} N=${d.params.n ?? 1} RS=${d.params.rs ?? 0.1} BV=${d.params.bv ?? 100} CJO=${d.params.cjo ?? 1e-12})`);
        lines.push(`D${d.id} ${n[0]} ${n[1]} ${mdl}`);
        break;
      }
      case "Q": {
        const mdl = `QMOD_${d.id}`;
        models.add(`.model ${mdl} ${d.params.pnp ? "PNP" : "NPN"}(IS=${d.params.is ?? 1e-15} BF=${d.params.bf ?? 200} VAF=${d.params.vaf ?? 100} CJE=${d.params.cje ?? 5e-12} CJC=${d.params.cjc ?? 2e-12})`);
        lines.push(`Q${d.id} ${n[0]} ${n[1]} ${n[2]} ${mdl}`);
        break;
      }
      case "M": {
        const mdl = `MMOD_${d.id}`;
        models.add(`.model ${mdl} ${d.params.pmos ? "PMOS" : "NMOS"}(VTO=${d.params.vto ?? 2} KP=${d.params.kp ?? 2e-5} LAMBDA=${d.params.lambda ?? 0.02})`);
        lines.push(`M${d.id} ${n[0]} ${n[1]} ${n[2]} ${n[2]} ${mdl} W=${d.params.w ?? 1e-4} L=${d.params.l ?? 1e-5}`);
        break;
      }
      case "J": {
        const mdl = `JMOD_${d.id}`;
        models.add(`.model ${mdl} NJF(VTO=${d.params.vto ?? -3} BETA=${d.params.beta ?? 1e-3} LAMBDA=${d.params.lambda ?? 0.01})`);
        lines.push(`J${d.id} ${n[0]} ${n[1]} ${n[2]} ${mdl}`);
        break;
      }
      case "E":
      case "G":
      case "H":
      case "F":
        lines.push(`${d.type}${d.id} ${n[0]} ${n[1]} ${n[2]} ${n[3]} ${d.params.gain ?? 1}`);
        break;
      case "OPAMP":
      case "COMPARATOR":
        lines.push(`X${d.id} ${n[0]} ${n[1]} ${n[2]} OPAMP_MACRO ; A0=${d.params.gain} GBW=${d.params.gbw ?? 1e6}`);
        break;
      case "TIMER555":
        lines.push(`X${d.id} ${n.join(" ")} NE555`);
        break;
      case "VREG":
        lines.push(`X${d.id} ${n[0]} ${n[1]} ${n[2]} VREG ; Vout=${d.params.vout}`);
        break;
      case "SWITCH":
      case "PUSHBUTTON":
      case "DIPSWITCH":
        lines.push(`R${d.id} ${n[0]} ${n[1]} ${d.params.closed ? sp(d.params.ron ?? 0.01) : "1G"} ; Schalter`);
        break;
      case "VSWITCH":
        lines.push(`S${d.id} ${n[0]} ${n[1]} ${n[2]} ${n[3]} SWMOD`);
        models.add(`.model SWMOD SW(VT=${d.params.von ?? 2.5} VH=0.2 RON=${d.params.ron ?? 1} ROFF=${d.params.roff ?? 1e9})`);
        break;
      case "TRANSFORMER":
        lines.push(`L${d.id}P ${n[0]} ${n[1]} ${sp(d.params.lp ?? 1)}`);
        lines.push(`L${d.id}S ${n[2]} ${n[3]} ${sp((d.params.lp ?? 1) / (d.params.ratio ?? 1) ** 2)}`);
        lines.push(`K${d.id} L${d.id}P L${d.id}S ${d.params.k ?? 0.999}`);
        break;
      case "GATE":
      case "DIGITAL":
      case "MCU":
        lines.push(`* ${d.type} ${d.id} (${d.model ?? ""}) Knoten: ${n.join(" ")} — XSPICE/digitale Co-Simulation`);
        break;
      default:
        break;
    }
  }
  lines.push("", ...[...models]);
  lines.push("", analysis ?? ".op", ".end");
  if (errors.length) lines.unshift(...errors.map((e) => `* FEHLER: ${e}`));
  return lines.join("\n");
}

/** Very small SPICE importer: R/C/L/V/I/D/Q lines are placed on a grid. */
export function fromSpiceNetlist(text: string): SchematicDoc {
  const doc = emptyDoc("Importierte Netzliste");
  const lines = text.split(/\r?\n/);
  let x = 120;
  let y = 120;
  const advance = () => {
    x += 140;
    if (x > 900) {
      x = 120;
      y += 140;
    }
  };
  const map: Record<string, string> = { R: "resistor", C: "capacitor", L: "inductor", V: "vdc", I: "idc", D: "diode_1n4148", Q: "npn_2n3904", M: "nmos" };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("*") || line.startsWith(".")) continue;
    const parts = line.split(/\s+/);
    const type = parts[0][0].toUpperCase();
    const partId = map[type];
    if (!partId) continue;
    const valueTok = parts[type === "Q" || type === "M" ? 4 : 3] ?? "0";
    const value = Number(valueTok.replace(/meg/i, "e6").replace(/k$/i, "e3").replace(/m$/i, "e-3").replace(/u$/i, "e-6").replace(/n$/i, "e-9").replace(/p$/i, "e-12"));
    const params: Record<string, number | string | boolean> = {};
    if (type === "R") params.r = Number.isFinite(value) ? value : 1000;
    if (type === "C") params.c = Number.isFinite(value) ? value : 1e-7;
    if (type === "L") params.l = Number.isFinite(value) ? value : 1e-3;
    if (type === "V") params.dc = Number.isFinite(value) ? value : 5;
    doc.instances.push({
      id: "i_" + Math.random().toString(36).slice(2, 9),
      partId,
      x,
      y,
      rot: 0,
      label: parts[0].toUpperCase(),
      params,
    });
    doc.notes.push({ id: "n_" + Math.random().toString(36).slice(2, 8), x, y: y + 40, text: `Knoten: ${parts.slice(1, 3).join(", ")}`, size: 9 });
    advance();
  }
  return doc;
}

/** Bill of materials */
export interface BomRow {
  ref: string;
  part: string;
  value: string;
  footprint: string;
  mount: string;
  qty: number;
}

export function buildBom(doc: SchematicDoc): BomRow[] {
  const rows = new Map<string, BomRow>();
  for (const inst of doc.instances) {
    const part: PartDef | undefined = PART_MAP[inst.partId];
    if (!part || part.mount === "virtual") continue;
    const main = part.params[0];
    const value = main ? formatValue(Number(inst.params[main.key] ?? main.def), main.unit ?? "") : "";
    const k = `${part.id}|${value}`;
    const existing = rows.get(k);
    if (existing) {
      existing.qty++;
      existing.ref += ", " + inst.label;
    } else {
      rows.set(k, { ref: inst.label, part: part.name, value, footprint: part.footprint ?? "—", mount: part.mount, qty: 1 });
    }
  }
  return [...rows.values()];
}
