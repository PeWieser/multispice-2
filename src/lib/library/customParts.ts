import { PARTS, PART_MAP, PartDef, PinDef, SymbolPrim } from "./catalog";
import { Device } from "@/lib/sim/engine";

export type PinSide = "left" | "right" | "top" | "bottom";
export type PinRole = "signal" | "input" | "output" | "vcc" | "gnd";

export interface CustomPinSpec {
  name: string;
  side: PinSide;
  role: PinRole;
}

export interface CustomPartSpec {
  id: string;
  name: string;
  ref: string;
  category: string;
  footprint: string;
  mount: "THT" | "SMD" | "both";
  description?: string;
  modelKind: "ic" | "resistor" | "diode" | "vreg";
  defaultValue?: number;
  pins: CustomPinSpec[];
}

const STORAGE_KEY = "multispice.customParts.v1";

export const PACKAGE_PRESETS: Array<{
  id: string;
  label: string;
  mount: "THT" | "SMD" | "both";
  pins: CustomPinSpec[];
}> = [
  {
    id: "DIP-8",
    label: "DIP-8 (8 Pins, Dual-Inline)",
    mount: "THT",
    pins: [
      { name: "1", side: "left", role: "input" },
      { name: "2", side: "left", role: "input" },
      { name: "3", side: "left", role: "output" },
      { name: "GND", side: "left", role: "gnd" },
      { name: "5", side: "right", role: "signal" },
      { name: "6", side: "right", role: "input" },
      { name: "7", side: "right", role: "output" },
      { name: "VCC", side: "right", role: "vcc" },
    ],
  },
  {
    id: "SOIC-8",
    label: "SOIC-8 (8 Pins, SMD)",
    mount: "SMD",
    pins: [
      { name: "IN+", side: "left", role: "input" },
      { name: "IN-", side: "left", role: "input" },
      { name: "FB", side: "left", role: "signal" },
      { name: "GND", side: "left", role: "gnd" },
      { name: "OUT", side: "right", role: "output" },
      { name: "EN", side: "right", role: "input" },
      { name: "NC", side: "right", role: "signal" },
      { name: "VCC", side: "right", role: "vcc" },
    ],
  },
  {
    id: "DIP-14",
    label: "DIP-14 (14 Pins, Dual-Inline)",
    mount: "THT",
    pins: [
      { name: "1A", side: "left", role: "input" },
      { name: "1B", side: "left", role: "input" },
      { name: "1Y", side: "left", role: "output" },
      { name: "2A", side: "left", role: "input" },
      { name: "2B", side: "left", role: "input" },
      { name: "2Y", side: "left", role: "output" },
      { name: "GND", side: "left", role: "gnd" },
      { name: "3Y", side: "right", role: "output" },
      { name: "3A", side: "right", role: "input" },
      { name: "3B", side: "right", role: "input" },
      { name: "4Y", side: "right", role: "output" },
      { name: "4A", side: "right", role: "input" },
      { name: "4B", side: "right", role: "input" },
      { name: "VCC", side: "right", role: "vcc" },
    ],
  },
  {
    id: "DIP-16",
    label: "DIP-16 (16 Pins, Dual-Inline)",
    mount: "THT",
    pins: [
      { name: "P1", side: "left", role: "input" },
      { name: "P2", side: "left", role: "input" },
      { name: "P3", side: "left", role: "input" },
      { name: "P4", side: "left", role: "input" },
      { name: "P5", side: "left", role: "output" },
      { name: "P6", side: "left", role: "output" },
      { name: "P7", side: "left", role: "output" },
      { name: "GND", side: "left", role: "gnd" },
      { name: "Q0", side: "right", role: "output" },
      { name: "Q1", side: "right", role: "output" },
      { name: "Q2", side: "right", role: "output" },
      { name: "Q3", side: "right", role: "output" },
      { name: "CLK", side: "right", role: "input" },
      { name: "RST", side: "right", role: "input" },
      { name: "EN", side: "right", role: "input" },
      { name: "VCC", side: "right", role: "vcc" },
    ],
  },
  {
    id: "TO-220",
    label: "TO-220 (3 Pins, Leistungsgehäuse)",
    mount: "THT",
    pins: [
      { name: "IN", side: "left", role: "input" },
      { name: "GND", side: "bottom", role: "gnd" },
      { name: "OUT", side: "right", role: "output" },
    ],
  },
  {
    id: "SOT-23",
    label: "SOT-23 / TO-92 (3 Pins)",
    mount: "SMD",
    pins: [
      { name: "1", side: "left", role: "input" },
      { name: "2", side: "right", role: "output" },
      { name: "3", side: "bottom", role: "gnd" },
    ],
  },
  {
    id: "0805",
    label: "0805 / Axial (2 Pins)",
    mount: "both",
    pins: [
      { name: "1", side: "left", role: "signal" },
      { name: "2", side: "right", role: "signal" },
    ],
  },
];

/**
 * Erzeugt ein auf das 10-px-Raster (GRID=10) ausgerichtetes Schaltzeichen
 * samt Pin-Definitionen aus einer CustomPartSpec.
 */
export function buildCustomGeometry(spec: CustomPartSpec): {
  pins: PinDef[];
  symbol: SymbolPrim[];
} {
  const left = spec.pins
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.side === "left");
  const right = spec.pins
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.side === "right");
  const top = spec.pins
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.side === "top");
  const bottom = spec.pins
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.side === "bottom");

  const maxVertCount = Math.max(left.length, right.length, 1);
  const maxHorizCount = Math.max(top.length, bottom.length, 1);

  // Halbe Gehäusebreite und -höhe immer Vielfache von 10 px, damit Kanten + 10 px Pin-Beinchen auf dem 10er-Raster liegen
  const halfW = Math.max(30, Math.ceil((maxHorizCount * 20 + 20) / 20) * 10);
  const halfH = Math.max(20, Math.ceil((maxVertCount * 20 + 10) / 20) * 10);

  const pinOut: PinDef[] = new Array(spec.pins.length);
  const symbol: SymbolPrim[] = [
    { t: "rect", x: -halfW, y: -halfH, w: halfW * 2, h: halfH * 2 },
    // Kleine IC-Kerbe oben
    { t: "arc", x: 0, y: -halfH, r: 5, a0: 0, a1: Math.PI },
  ];

  const placeLinear = (count: number, i: number): number => {
    if (count === 1) return 0;
    const span = (count - 1) * 20;
    const start = -Math.round(span / 20) * 10;
    return start + i * 20;
  };

  left.forEach((p, i) => {
    const py = placeLinear(left.length, i);
    const px = -halfW - 10;
    pinOut[p.idx] = { name: p.name || `${p.idx + 1}`, x: px, y: py };
    symbol.push({ t: "line", pts: [px, py, -halfW, py] });
    symbol.push({ t: "text", x: -halfW + 5, y: py + 3, s: p.name || `${p.idx + 1}`, size: 8, align: "left" });
  });

  right.forEach((p, i) => {
    const py = placeLinear(right.length, i);
    const px = halfW + 10;
    pinOut[p.idx] = { name: p.name || `${p.idx + 1}`, x: px, y: py };
    symbol.push({ t: "line", pts: [halfW, py, px, py] });
    symbol.push({ t: "text", x: halfW - 5, y: py + 3, s: p.name || `${p.idx + 1}`, size: 8, align: "right" });
  });

  top.forEach((p, i) => {
    const px = placeLinear(top.length, i);
    const py = -halfH - 10;
    pinOut[p.idx] = { name: p.name || `${p.idx + 1}`, x: px, y: py };
    symbol.push({ t: "line", pts: [px, py, px, -halfH] });
    symbol.push({ t: "text", x: px, y: -halfH + 10, s: p.name || `${p.idx + 1}`, size: 8, align: "center" });
  });

  bottom.forEach((p, i) => {
    const px = placeLinear(bottom.length, i);
    const py = halfH + 10;
    pinOut[p.idx] = { name: p.name || `${p.idx + 1}`, x: px, y: py };
    symbol.push({ t: "line", pts: [px, halfH, px, py] });
    symbol.push({ t: "text", x: px, y: halfH - 5, s: p.name || `${p.idx + 1}`, size: 8, align: "center" });
  });

  return { pins: pinOut, symbol };
}

export function specToPartDef(spec: CustomPartSpec): PartDef {
  const { pins, symbol } = buildCustomGeometry(spec);
  const valDef = spec.defaultValue ?? (spec.modelKind === "resistor" ? 1000 : spec.modelKind === "vreg" ? 5 : 5);
  return {
    id: spec.id,
    name: spec.name,
    ref: spec.ref || "U",
    category: spec.category || "Eigene Bauteile/ICs",
    tags: ["custom", "eigenes bauteil", spec.name.toLowerCase(), spec.footprint.toLowerCase()],
    mount: spec.mount,
    footprint: spec.footprint,
    description: spec.description || `Benutzerdefiniertes Bauteil (${spec.footprint}, ${spec.pins.length} Pins)`,
    pins,
    symbol,
    params:
      spec.modelKind === "resistor"
        ? [{ key: "r", label: "Widerstand", unit: "Ω", type: "number", def: valDef }]
        : spec.modelKind === "vreg"
          ? [{ key: "vout", label: "Ausgangsspannung", unit: "V", type: "number", def: valDef }]
          : [{ key: "vdd", label: "Pegel / Versorgung", unit: "V", type: "number", def: valDef }],
    toDevices: (inst, nets): Device[] => {
      if (spec.modelKind === "resistor" && nets.length >= 2) {
        const r = Number(inst.params?.r ?? valDef) || 1000;
        return [{ id: inst.id, type: "R", nodes: [nets[0], nets[1]], params: { r } }];
      }
      if (spec.modelKind === "diode" && nets.length >= 2) {
        return [{ id: inst.id, type: "D", nodes: [nets[0], nets[1]], params: { is: 1e-14, n: 1 } }];
      }
      if (spec.modelKind === "vreg" && nets.length >= 3) {
        const vout = Number(inst.params?.vout ?? valDef) || 5;
        return [{ id: inst.id, type: "VREG", nodes: [nets[0], nets[2], nets[1]], params: { vout, dropout: 1.5, rout: 0.1 } }];
      }
      // Allgemeines IC-Makromodell: verbindet Eingänge hochohmig (1 MΩ) und Signal-Pins über 10 kΩ mit GND-Pin
      const gndIdx = spec.pins.findIndex((p) => p.role === "gnd");
      const vccIdx = spec.pins.findIndex((p) => p.role === "vcc");
      const refNode = gndIdx >= 0 && nets[gndIdx] ? nets[gndIdx] : "0";
      const vccNode = vccIdx >= 0 && nets[vccIdx] ? nets[vccIdx] : null;
      const devs: Device[] = [];
      spec.pins.forEach((p, idx) => {
        const n = nets[idx] ?? "0";
        if (idx === gndIdx || n === refNode) return;
        if (p.role === "vcc") {
          devs.push({ id: `${inst.id}_sup_${idx}`, type: "R", nodes: [n, refNode], params: { r: 5000 } });
        } else if (p.role === "input") {
          devs.push({ id: `${inst.id}_in_${idx}`, type: "R", nodes: [n, refNode], params: { r: 1e6 } });
        } else if (p.role === "output") {
          const target = vccNode ?? refNode;
          devs.push({ id: `${inst.id}_out_${idx}`, type: "R", nodes: [n, target], params: { r: 100 } });
        } else {
          devs.push({ id: `${inst.id}_sig_${idx}`, type: "R", nodes: [n, refNode], params: { r: 10000 } });
        }
      });
      if (devs.length === 0 && nets.length >= 2) {
        devs.push({ id: inst.id, type: "R", nodes: [nets[0], nets[1]], params: { r: 10000 } });
      }
      return devs;
    },
  };
}

export function registerCustomPart(spec: CustomPartSpec): PartDef {
  const def = specToPartDef(spec);
  PART_MAP[def.id] = def;
  const existingIdx = PARTS.findIndex((p) => p.id === def.id);
  if (existingIdx >= 0) {
    PARTS[existingIdx] = def;
  } else {
    PARTS.unshift(def);
  }
  return def;
}

export function loadCustomParts(): CustomPartSpec[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as CustomPartSpec[];
    if (!Array.isArray(list)) return [];
    for (const spec of list) {
      if (spec && spec.id && Array.isArray(spec.pins)) {
        registerCustomPart(spec);
      }
    }
    return list;
  } catch {
    return [];
  }
}

export function saveCustomPart(spec: CustomPartSpec): CustomPartSpec[] {
  const list = loadCustomParts();
  const idx = list.findIndex((x) => x.id === spec.id);
  if (idx >= 0) list[idx] = spec;
  else list.unshift(spec);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
  registerCustomPart(spec);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("multispice-custom-parts"));
  }
  return list;
}

export function deleteCustomPart(id: string): CustomPartSpec[] {
  const list = loadCustomParts().filter((x) => x.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
  delete PART_MAP[id];
  const pIdx = PARTS.findIndex((p) => p.id === id);
  if (pIdx >= 0) PARTS.splice(pIdx, 1);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("multispice-custom-parts"));
  }
  return list;
}
