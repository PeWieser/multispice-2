import { LIBMAP, pinsOf, boxOf } from "./library";
import type { Component, Project, Pt } from "./types";
import { parseValue } from "./units";

export function xform(c: Pick<Component, "x" | "y" | "rot" | "mirror">, lx: number, ly: number): Pt {
  let x = c.mirror ? -lx : lx;
  let y = ly;
  for (let i = 0; i < c.rot; i++) [x, y] = [-y, x];
  return [c.x + x, c.y + y];
}

export interface WorldPin { compId: string; ref: string; name: string; num: number; x: number; y: number; sheet: string }
export function worldPins(c: Component): WorldPin[] {
  const def = LIBMAP[c.type];
  if (!def) return [];
  return pinsOf(def, c.props).map((p) => {
    const [x, y] = xform(c, p.x, p.y);
    return { compId: c.id, ref: c.ref, name: p.name, num: p.num, x, y, sheet: c.sheet };
  });
}
export function compBBox(c: Component): [number, number, number, number] {
  const def = LIBMAP[c.type];
  const b = def ? boxOf(def, c.props) : [-10, -10, 10, 10];
  const a = xform(c, b[0], b[1]), d = xform(c, b[2], b[3]);
  return [Math.min(a[0], d[0]), Math.min(a[1], d[1]), Math.max(a[0], d[0]), Math.max(a[1], d[1])];
}

export function onSegment(p: Pt, a: Pt, b: Pt, interiorOnly = false): boolean {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  if (Math.abs(cross) > 1e-9) return false;
  if (p[0] < Math.min(a[0], b[0]) || p[0] > Math.max(a[0], b[0]) || p[1] < Math.min(a[1], b[1]) || p[1] > Math.max(a[1], b[1])) return false;
  if (interiorOnly && ((p[0] === a[0] && p[1] === a[1]) || (p[0] === b[0] && p[1] === b[1]))) return false;
  return true;
}

export interface Net {
  id: string;
  name: string;
  pins: WorldPin[];
  wires: string[];
  labels: string[];
  isGround: boolean;
  isPower: boolean;
  named: boolean;
  sheets: string[];
}

export interface Connectivity {
  nets: Net[];
  netByName: Record<string, Net>;
  pinNet: Record<string, string>; // compId:pinName -> net name
  pointNet: (sheet: string, x: number, y: number) => string | null;
  wireNet: Record<string, string>;
  junctions: { sheet: string; x: number; y: number }[];
  probeNets: Record<string, { pos: string | null; neg: string | null }>;
  danglingWireEnds: { sheet: string; x: number; y: number; wire: string }[];
}

class UF {
  p = new Map<string, string>();
  find(a: string): string {
    if (!this.p.has(a)) this.p.set(a, a);
    let r = a;
    while (this.p.get(r) !== r) r = this.p.get(r)!;
    let c = a;
    while (this.p.get(c) !== r) { const n = this.p.get(c)!; this.p.set(c, r); c = n; }
    return r;
  }
  union(a: string, b: string) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
}
const K = (s: string, x: number, y: number) => `${s}:${x},${y}`;

export function resolve(p: Project): Connectivity {
  const uf = new UF();
  const wires = p.wires.filter((w) => !w.bus);
  const pins = p.components.flatMap(worldPins);
  const deg = new Map<string, number>();
  const bump = (k: string) => deg.set(k, (deg.get(k) ?? 0) + 1);
  const poi: { s: string; pt: Pt }[] = [];
  for (const w of wires) {
    uf.union(K(w.sheet, ...w.a), K(w.sheet, ...w.b));
    uf.union(K(w.sheet, ...w.a), "W:" + w.id);
    bump(K(w.sheet, ...w.a)); bump(K(w.sheet, ...w.b));
    poi.push({ s: w.sheet, pt: w.a }, { s: w.sheet, pt: w.b });
  }
  for (const pin of pins) { const k = K(pin.sheet, pin.x, pin.y); uf.find(k); bump(k); poi.push({ s: pin.sheet, pt: [pin.x, pin.y] }); }
  for (const l of p.labels) { uf.find(K(l.sheet, l.x, l.y)); poi.push({ s: l.sheet, pt: [l.x, l.y] }); }
  for (const pr of p.probes) {
    if (pr.kind === "voltage" || pr.kind === "diff") {
      poi.push({ s: pr.sheet, pt: [pr.x, pr.y] });
      if (pr.kind === "diff" && pr.x2 != null && pr.y2 != null) poi.push({ s: pr.sheet, pt: [pr.x2, pr.y2] });
    }
  }
  const junctions: Connectivity["junctions"] = [];
  const seenJ = new Set<string>();
  for (const { s, pt } of poi) {
    for (const w of wires) {
      if (w.sheet !== s) continue;
      if (onSegment(pt, w.a, w.b, true)) {
        const k = K(s, ...pt);
        uf.union(k, K(s, ...w.a));
        if ((deg.get(k) ?? 0) >= 1 && !seenJ.has(k)) { seenJ.add(k); junctions.push({ sheet: s, x: pt[0], y: pt[1] }); }
      }
    }
  }
  for (const [k, n] of deg) {
    if (n >= 3 && !seenJ.has(k)) {
      seenJ.add(k);
      const [s, xy] = k.split(":"); const [x, y] = xy.split(",").map(Number);
      junctions.push({ sheet: s, x, y });
    }
  }
  // labels / power
  for (const l of p.labels) uf.union(K(l.sheet, l.x, l.y), l.kind === "local" ? `L:${l.sheet}|${l.name}` : `G:${l.name}`);
  for (const c of p.components) {
    if (c.type === "GND") for (const pin of worldPins(c)) uf.union(K(pin.sheet, pin.x, pin.y), "G:0");
    else if (LIBMAP[c.type]?.model === "PWR") for (const pin of worldPins(c)) uf.union(K(pin.sheet, pin.x, pin.y), "G:" + (c.props.net || c.type));
  }
  // group
  const groups = new Map<string, { pins: WorldPin[]; wires: string[]; labels: string[]; names: string[]; sheets: Set<string> }>();
  const g = (r: string) => {
    if (!groups.has(r)) groups.set(r, { pins: [], wires: [], labels: [], names: [], sheets: new Set() });
    return groups.get(r)!;
  };
  for (const pin of pins) { const e = g(uf.find(K(pin.sheet, pin.x, pin.y))); e.pins.push(pin); e.sheets.add(pin.sheet); }
  for (const w of wires) { const e = g(uf.find("W:" + w.id)); e.wires.push(w.id); e.sheets.add(w.sheet); }
  for (const l of p.labels) { const e = g(uf.find(K(l.sheet, l.x, l.y))); e.labels.push(l.id); e.names.push(l.name); }
  for (const key of uf.p.keys()) if (key.startsWith("G:")) g(uf.find(key)).names.push(key.slice(2));
  const nets: Net[] = [];
  const rootName = new Map<string, string>();
  const unnamed: [string, typeof groups extends Map<string, infer V> ? V : never][] = [];
  const used = new Set<string>();
  for (const [r, e] of groups) {
    if (!e.pins.length && !e.wires.length) continue;
    const names = [...new Set(e.names)];
    let name = names.includes("0") ? "0" : names.sort()[0];
    if (name) { if (used.has(name)) name = name + "_" + r.length; used.add(name); rootName.set(r, name); }
    else unnamed.push([r, e]);
  }
  unnamed.sort((a, b) => {
    const ka = a[1].pins.map((x) => x.ref + "." + x.name).sort()[0] ?? "~" + a[0];
    const kb = b[1].pins.map((x) => x.ref + "." + x.name).sort()[0] ?? "~" + b[0];
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  let n = 1;
  for (const [r] of unnamed) { let nm; do nm = "N" + String(n++).padStart(3, "0"); while (used.has(nm)); used.add(nm); rootName.set(r, nm); }
  const powerNames = new Set(p.components.filter((c) => LIBMAP[c.type]?.model === "PWR").map((c) => c.props.net || c.type));
  for (const [r, e] of groups) {
    const name = rootName.get(r);
    if (!name) continue;
    nets.push({ id: name, name, pins: e.pins, wires: e.wires, labels: e.labels, isGround: name === "0", isPower: powerNames.has(name), named: e.names.length > 0, sheets: [...e.sheets] });
  }
  nets.sort((a, b) => (a.name === "0" ? -1 : b.name === "0" ? 1 : a.name.localeCompare(b.name, undefined, { numeric: true })));
  const netByName = Object.fromEntries(nets.map((x) => [x.name, x]));
  const pinNet: Record<string, string> = {};
  for (const pin of pins) pinNet[pin.compId + ":" + pin.name] = rootName.get(uf.find(K(pin.sheet, pin.x, pin.y)))!;
  const wireNet: Record<string, string> = {};
  for (const w of wires) wireNet[w.id] = rootName.get(uf.find("W:" + w.id))!;
  const pointNet = (s: string, x: number, y: number) => {
    const k = K(s, x, y);
    if (uf.p.has(k)) { const nm = rootName.get(uf.find(k)); if (nm) return nm; }
    for (const w of wires) if (w.sheet === s && onSegment([x, y], w.a, w.b)) return wireNet[w.id];
    return null;
  };
  const probeNets: Connectivity["probeNets"] = {};
  for (const pr of p.probes) {
    if (pr.kind === "voltage") probeNets[pr.id] = { pos: pointNet(pr.sheet, pr.x, pr.y), neg: "0" };
    else if (pr.kind === "diff") probeNets[pr.id] = { pos: pointNet(pr.sheet, pr.x, pr.y), neg: pr.x2 != null ? pointNet(pr.sheet, pr.x2, pr.y2!) : null };
  }
  const danglingWireEnds: Connectivity["danglingWireEnds"] = [];
  for (const w of wires) {
    for (const e of [w.a, w.b]) {
      const k = K(w.sheet, ...e);
      const touching = (deg.get(k) ?? 0) + (seenJ.has(k) ? 1 : 0) + p.labels.filter((l) => l.sheet === w.sheet && l.x === e[0] && l.y === e[1]).length;
      const onOther = wires.some((o) => o !== w && o.sheet === w.sheet && onSegment(e, o.a, o.b));
      if (touching <= 1 && !onOther) danglingWireEnds.push({ sheet: w.sheet, x: e[0], y: e[1], wire: w.id });
    }
  }
  return { nets, netByName, pinNet, pointNet, wireNet, junctions, probeNets, danglingWireEnds };
}

// ---------------- ERC ----------------
export interface Diagnostic {
  id: string;
  severity: "error" | "warning" | "info";
  code: string;
  message: string;
  compId?: string;
  net?: string;
  at?: { sheet: string; x: number; y: number };
}

const DC_PATH_MODELS = new Set(["R", "L", "V", "D", "BJT", "MOS", "POT", "SW", "XFMR", "OPAMP", "COMP", "GATE", "DFF", "CNT4", "LOGIC_IN", "FGEN", "PWR", "WGEN", "WATT"]);

export function runERC(p: Project, cn: Connectivity): Diagnostic[] {
  const out: Diagnostic[] = [];
  let i = 0;
  const add = (d: Omit<Diagnostic, "id">) => out.push({ id: "d" + i++, ...d });
  const simComps = p.components.filter((c) => c.enabled !== false && LIBMAP[c.type]?.model && !LIBMAP[c.type]?.instrument && LIBMAP[c.type]?.model !== "PWR");
  if (simComps.length && !p.components.some((c) => c.type === "GND") && !p.labels.some((l) => l.name === "0"))
    add({ severity: "error", code: "NO_GND", message: "No ground (GND) reference in schematic. Place a Ground symbol." });
  // duplicates
  const refs = new Map<string, Component[]>();
  for (const c of p.components) { if (c.ref.startsWith("#")) continue; refs.set(c.ref, [...(refs.get(c.ref) ?? []), c]); }
  for (const [r, cs] of refs) if (cs.length > 1) for (const c of cs) add({ severity: "error", code: "DUP_REF", message: `Duplicate reference ${r}`, compId: c.id });
  for (const c of p.components) {
    const def = LIBMAP[c.type];
    if (!def) { add({ severity: "error", code: "NO_MODEL", message: `${c.ref}: unknown part type "${c.type}" (missing model)`, compId: c.id }); continue; }
    if (!def.model) { if (def.kind === "physical") add({ severity: "warning", code: "NO_MODEL", message: `${c.ref}: physical part without simulation model — excluded from simulation`, compId: c.id }); }
    for (const pd of def.props) {
      if (!pd.unit || pd.unit === "%" && pd.key === "tol") continue;
      const v = c.props[pd.key];
      if (v == null || v === "") continue;
      if (isNaN(parseValue(v, p.variables))) add({ severity: "error", code: "BAD_VALUE", message: `${c.ref}.${pd.label}: invalid value "${v}"`, compId: c.id });
    }
    if (["R", "C", "L", "POT"].includes(def.model)) {
      const v = parseValue(c.props.value, p.variables);
      if (!isNaN(v) && v <= 0) add({ severity: "error", code: "BAD_VALUE", message: `${c.ref}: value must be > 0`, compId: c.id });
    }
    // unconnected pins
    if (def.instrument || c.type === "GND" || def.model === "PWR") continue;
    for (const pin of worldPins(c)) {
      const net = cn.netByName[cn.pinNet[c.id + ":" + pin.name]];
      if (!net || (net.pins.length <= 1 && !net.named))
        add({ severity: def.model ? "error" : "warning", code: "UNCONNECTED", message: `${c.ref} pin ${pin.name} is not connected`, compId: c.id, at: { sheet: pin.sheet, x: pin.x, y: pin.y } });
    }
  }
  // floating nodes (no DC path to ground)
  const adj = new Map<string, Set<string>>();
  const link = (a: string, b: string) => { if (!adj.has(a)) adj.set(a, new Set()); if (!adj.has(b)) adj.set(b, new Set()); adj.get(a)!.add(b); adj.get(b)!.add(a); };
  for (const c of p.components) {
    const def = LIBMAP[c.type];
    if (!def || c.enabled === false) continue;
    const nets = worldPins(c).map((pp) => cn.pinNet[c.id + ":" + pp.name]).filter(Boolean);
    if (DC_PATH_MODELS.has(def.model)) {
      if (["GATE", "DFF", "CNT4", "LOGIC_IN", "PWR", "WGEN"].includes(def.model)) {
        for (const nn of nets) link(nn, "0"); // outputs driven from rails; inputs high-Z handled by gmin
      } else if (def.model === "XFMR") { link(nets[0], nets[1]); link(nets[2], nets[3]); }
      else for (let k = 1; k < nets.length; k++) link(nets[0], nets[k]);
      if (def.model === "OPAMP" || def.model === "COMP") link(nets[2], "0");
    }
  }
  const seen = new Set<string>(["0"]);
  const st = ["0"];
  while (st.length) { const n = st.pop()!; for (const m of adj.get(n) ?? []) if (!seen.has(m)) { seen.add(m); st.push(m); } }
  for (const net of cn.nets) {
    const devPins = net.pins.filter((pp) => { const c = p.components.find((x) => x.id === pp.compId); const d = c && LIBMAP[c.type]; return d && d.model && !d.instrument && d.model !== "PWR"; });
    if (!devPins.length || seen.has(net.name)) continue;
    add({ severity: "warning", code: "FLOATING", message: `Net ${net.name} has no DC path to ground (floating node)`, net: net.name });
  }
  // incompatible pins: multiple digital outputs driving one net
  for (const net of cn.nets) {
    const drivers = net.pins.filter((pp) => {
      const c = p.components.find((x) => x.id === pp.compId); const m = c && LIBMAP[c.type]?.model;
      return (m === "GATE" && (pp.name === "Y")) || (m === "DFF" && pp.name.includes("Q")) || (m === "CNT4" && pp.name.startsWith("Q")) || m === "LOGIC_IN" || (c?.type === "CLOCK");
    });
    if (drivers.length > 1) add({ severity: "error", code: "PIN_CONFLICT", message: `Net ${net.name}: ${drivers.length} digital outputs drive the same net (${drivers.map((d) => d.ref + "." + d.name).join(", ")})`, net: net.name });
  }
  for (const d of cn.danglingWireEnds) add({ severity: "warning", code: "DANGLING", message: `Wire end at (${d.x}, ${d.y}) is not connected`, at: d });
  for (const pr of p.probes) {
    if ((pr.kind === "voltage" || pr.kind === "diff") && !cn.probeNets[pr.id]?.pos) add({ severity: "warning", code: "PROBE", message: `Probe ${pr.name} is not attached to a net`, at: { sheet: pr.sheet, x: pr.x, y: pr.y } });
    if ((pr.kind === "current" || pr.kind === "power") && !p.components.some((c) => c.id === pr.compId)) add({ severity: "warning", code: "PROBE", message: `Probe ${pr.name} has no target component` });
  }
  return out;
}
