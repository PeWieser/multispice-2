/** Smart orthogonal auto-routing (A*) and ready-to-run example circuits. */

import { GRID, Instance, SchematicDoc, emptyDoc, instanceBounds } from "./model";

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

/**
 * Orthogonal A* pathfinding on the schematic grid with bend penalties and
 * component obstacle avoidance. Falls back to an L-shaped route.
 */
export function routeOrthogonal(start: Pt, end: Pt, obstacles: Rect[], grid = GRID): Pt[] {
  const snap = (v: number) => Math.round(v / grid) * grid;
  const s = { x: snap(start.x), y: snap(start.y) };
  const e = { x: snap(end.x), y: snap(end.y) };
  if (s.x === e.x && s.y === e.y) return [s, e];

  const pad = grid;
  const minX = Math.min(s.x, e.x) - 12 * grid;
  const maxX = Math.max(s.x, e.x) + 12 * grid;
  const minY = Math.min(s.y, e.y) - 12 * grid;
  const maxY = Math.max(s.y, e.y) + 12 * grid;

  const blocked = (x: number, y: number) => {
    if (x < minX || x > maxX || y < minY || y > maxY) return true;
    for (const o of obstacles) {
      if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) {
        const nearStart = Math.abs(x - s.x) <= grid && Math.abs(y - s.y) <= grid;
        const nearEnd = Math.abs(x - e.x) <= grid && Math.abs(y - e.y) <= grid;
        if (!nearStart && !nearEnd) return true;
      }
    }
    return false;
  };

  interface Node {
    x: number;
    y: number;
    g: number;
    f: number;
    dir: number;
    parent?: Node;
  }
  const k = (x: number, y: number, d: number) => `${x},${y},${d}`;
  const h = (x: number, y: number) => Math.abs(x - e.x) + Math.abs(y - e.y);
  const open: Node[] = [{ x: s.x, y: s.y, g: 0, f: h(s.x, s.y), dir: -1 }];
  const seen = new Map<string, number>();
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  let guard = 0;
  while (open.length && guard++ < 24000) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    if (cur.x === e.x && cur.y === e.y) {
      const pts: Pt[] = [];
      let n: Node | undefined = cur;
      while (n) {
        pts.unshift({ x: n.x, y: n.y });
        n = n.parent;
      }
      // simplify collinear points
      const out: Pt[] = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = out[out.length - 1];
        const b = pts[i];
        const c = pts[i + 1];
        if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) continue;
        out.push(b);
      }
      out.push(pts[pts.length - 1]);
      return out;
    }
    for (let d = 0; d < 4; d++) {
      const nx = cur.x + dirs[d][0] * grid;
      const ny = cur.y + dirs[d][1] * grid;
      if (blocked(nx, ny)) continue;
      const bend = cur.dir >= 0 && cur.dir !== d ? grid * 3 : 0;
      const g = cur.g + grid + bend;
      const kk = k(nx, ny, d);
      const prev = seen.get(kk);
      if (prev !== undefined && prev <= g) continue;
      seen.set(kk, g);
      open.push({ x: nx, y: ny, g, f: g + h(nx, ny), dir: d, parent: cur });
    }
  }
  // fallback: L shape
  return [s, { x: e.x, y: s.y }, e];
}

export function obstaclesFor(doc: SchematicDoc, ignoreIds: string[] = []): Rect[] {
  return doc.instances.filter((i) => !ignoreIds.includes(i.id)).map((i) => instanceBounds(i));
}

/* ----------------------------- presets ----------------------------- */

let uid = 0;
const nid = (p: string) => `${p}_${Date.now().toString(36)}_${(uid++).toString(36)}`;

function inst(partId: string, label: string, x: number, y: number, params: Record<string, number | string | boolean> = {}, rot: 0 | 90 | 180 | 270 = 0, text?: string): Instance {
  return { id: nid("i"), partId, label, x, y, rot, params, text };
}

function wire(...pts: number[]): SchematicDoc["wires"][number] {
  const points = [];
  for (let i = 0; i < pts.length; i += 2) points.push({ x: pts[i], y: pts[i + 1] });
  return { id: nid("w"), points };
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  build: () => SchematicDoc;
}

export const PRESETS: Preset[] = [
  {
    id: "rc-lowpass",
    name: "RC-Tiefpass",
    description: "Klassischer Tiefpass 1. Ordnung — ideal für Bode-Plot und Transienten.",
    build: () => {
      const doc = emptyDoc("RC-Tiefpass");
      const v = inst("vac", "V1", 200, 300, { amplitude: 1, freq: 1000, acMag: 1 });
      const r = inst("resistor", "R1", 320, 240, { r: 1600 });
      const c = inst("capacitor", "C1", 420, 300, { c: 1e-7 }, 90);
      const g = inst("gnd", "GND1", 200, 400);
      const g2 = inst("gnd", "GND2", 420, 400);
      doc.instances.push(v, r, c, g, g2);
      doc.wires.push(
        wire(200, 270, 200, 240, 290, 240),
        wire(350, 240, 420, 240, 420, 270),
        wire(200, 330, 200, 386),
        wire(420, 330, 420, 386),
      );
      doc.labels.push({ id: nid("l"), x: 420, y: 240, name: "OUT" }, { id: nid("l"), x: 200, y: 240, name: "IN" });
      return doc;
    },
  },
  {
    id: "halfwave",
    name: "Einweg-Gleichrichter",
    description: "Trafo, Diode und Ladeelko — Ripple und Spitzenwerte messen.",
    build: () => {
      const doc = emptyDoc("Einweg-Gleichrichter");
      const v = inst("vac", "V1", 180, 300, { amplitude: 12, freq: 50, acMag: 1 });
      const d = inst("diode_1n4007", "D1", 320, 240);
      const c = inst("capacitor_elko", "C1", 430, 300, { c: 4.7e-4 }, 90);
      const r = inst("resistor", "RL", 540, 300, { r: 470 }, 90);
      const g1 = inst("gnd", "GND1", 180, 400);
      const g2 = inst("gnd", "GND2", 430, 400);
      const g3 = inst("gnd", "GND3", 540, 400);
      doc.instances.push(v, d, c, r, g1, g2, g3);
      doc.wires.push(
        wire(180, 270, 180, 240, 290, 240),
        wire(350, 240, 430, 240, 430, 270),
        wire(430, 240, 540, 240, 540, 270),
        wire(180, 330, 180, 386),
        wire(430, 330, 430, 386),
        wire(540, 330, 540, 386),
      );
      doc.labels.push({ id: nid("l"), x: 430, y: 240, name: "VOUT" });
      return doc;
    },
  },
  {
    id: "astable555",
    name: "555 Astabiler Multivibrator",
    description: "Blinkschaltung mit NE555 und LED — interaktive Echtzeitsimulation.",
    build: () => {
      const doc = emptyDoc("555 Blinker");
      const vcc = inst("vdc", "V1", 140, 300, { dc: 9 });
      const u = inst("ne555", "U1", 420, 280, { vdd: 9 });
      const r1 = inst("resistor", "R1", 300, 170, { r: 10000 }, 90);
      const r2 = inst("resistor", "R2", 300, 290, { r: 47000 }, 90);
      const c1 = inst("capacitor_elko", "C1", 300, 400, { c: 1e-5 }, 90);
      const r3 = inst("resistor", "R3", 620, 268, { r: 470 });
      const led = inst("led", "D1", 720, 268, { vf: 2, color: "red" });
      const g1 = inst("gnd", "GND1", 140, 420);
      const g2 = inst("gnd", "GND2", 300, 470);
      const g3 = inst("gnd", "GND3", 380, 420);
      const g4 = inst("gnd", "GND4", 750, 340);
      doc.instances.push(vcc, u, r1, r2, c1, r3, led, g1, g2, g3, g4);
      doc.wires.push(
        wire(140, 270, 140, 120),
        wire(140, 120, 700, 120),
        wire(140, 330, 140, 406),
        wire(300, 140, 300, 120),
        wire(300, 200, 300, 260),
        wire(300, 230, 380, 230, 380, 244),
        wire(300, 320, 300, 370),
        wire(300, 370, 240, 370, 240, 292, 380, 292),
        wire(300, 370, 540, 370, 540, 292, 460, 292),
        wire(300, 430, 300, 456),
        wire(380, 268, 340, 268, 340, 120),
        wire(460, 244, 500, 244, 500, 120),
        wire(380, 316, 380, 406),
        wire(460, 268, 590, 268),
        wire(650, 268, 690, 268),
        wire(750, 268, 750, 326),
      );
      doc.labels.push({ id: nid("l"), x: 460, y: 268, name: "OUT" }, { id: nid("l"), x: 300, y: 370, name: "CAP" });
      return doc;
    },
  },
  {
    id: "ce-amp",
    name: "Emitterschaltung (NPN)",
    description: "Verstärkerstufe mit Spannungsteiler-Bias — AC-Sweep und THD.",
    build: () => {
      const doc = emptyDoc("Emitterschaltung");
      const vcc = inst("vdc", "VCC", 140, 200, { dc: 12 });
      const rb1 = inst("resistor", "RB1", 340, 160, { r: 68000 }, 90);
      const rb2 = inst("resistor", "RB2", 340, 340, { r: 12000 }, 90);
      const rc = inst("resistor", "RC", 470, 160, { r: 3300 }, 90);
      const re = inst("resistor", "RE", 470, 380, { r: 680 }, 90);
      const q = inst("npn_2n3904", "Q1", 420, 270);
      const cin = inst("capacitor", "CIN", 240, 270, { c: 1e-6 });
      const cout = inst("capacitor", "COUT", 590, 240, { c: 1e-6 });
      const ce = inst("capacitor_elko", "CE", 560, 380, { c: 1e-4 }, 90);
      const rl = inst("resistor", "RL", 680, 300, { r: 10000 }, 90);
      const src = inst("vac", "V1", 150, 300, { amplitude: 0.01, freq: 1000, acMag: 0.01 });
      const g1 = inst("gnd", "GND1", 140, 320);
      const g2 = inst("gnd", "GND2", 150, 400);
      const g3 = inst("gnd", "GND3", 340, 420);
      const g4 = inst("gnd", "GND4", 470, 460);
      const g5 = inst("gnd", "GND5", 560, 460);
      const g6 = inst("gnd", "GND6", 680, 400);
      doc.instances.push(vcc, rb1, rb2, rc, re, q, cin, cout, ce, rl, src, g1, g2, g3, g4, g5, g6);
      doc.wires.push(
        wire(140, 170, 140, 100, 340, 100, 340, 130),
        wire(340, 100, 470, 100, 470, 130),
        wire(340, 190, 340, 270, 390, 270),
        wire(340, 270, 340, 310),
        wire(340, 370, 340, 406),
        wire(270, 270, 340, 270),
        wire(150, 270, 210, 270),
        wire(150, 330, 150, 386),
        wire(140, 230, 140, 306),
        wire(470, 190, 470, 240),
        wire(432, 240, 470, 240),
        wire(470, 240, 560, 240),
        wire(620, 240, 680, 240, 680, 270),
        wire(432, 300, 470, 300, 470, 350),
        wire(470, 410, 470, 446),
        wire(470, 350, 560, 350),
        wire(560, 410, 560, 446),
        wire(680, 330, 680, 386),
      );
      doc.labels.push({ id: nid("l"), x: 470, y: 240, name: "VC" }, { id: nid("l"), x: 680, y: 240, name: "OUT" }, { id: nid("l"), x: 150, y: 270, name: "IN" });
      return doc;
    },
  },
  {
    id: "noninv-opamp",
    name: "Nichtinvertierender OPV",
    description: "LM741 mit Verstärkung 11 — Bode-Plotter und Slew-Rate.",
    build: () => {
      const doc = emptyDoc("Nichtinvertierender Verstärker");
      const u = inst("opamp_lm741", "U1", 420, 260);
      const src = inst("vac", "V1", 200, 300, { amplitude: 0.5, freq: 1000, acMag: 1 });
      const rf = inst("resistor", "RF", 440, 150, { r: 100000 });
      const rg = inst("resistor", "RG", 320, 380, { r: 10000 }, 90);
      const vp = inst("vdc", "VP", 660, 130, { dc: 15 });
      const vn = inst("vdc", "VN", 660, 430, { dc: -15 });
      const g1 = inst("gnd", "GND1", 200, 400);
      const g2 = inst("gnd", "GND2", 320, 450);
      const g3 = inst("gnd", "GND3", 660, 200);
      const g4 = inst("gnd", "GND4", 660, 500);
      doc.instances.push(u, src, rf, rg, vp, vn, g1, g2, g3, g4);
      doc.wires.push(
        wire(200, 270, 200, 245, 380, 245),
        wire(200, 330, 200, 386),
        wire(380, 275, 320, 275, 320, 350),
        wire(320, 410, 320, 436),
        wire(320, 275, 320, 150, 410, 150),
        wire(470, 150, 540, 150, 540, 260, 460, 260),
        wire(420, 230, 420, 100, 660, 100),
        wire(660, 160, 660, 186),
        wire(420, 290, 420, 400, 660, 400),
        wire(660, 460, 660, 486),
      );
      doc.labels.push({ id: nid("l"), x: 540, y: 260, name: "OUT" }, { id: nid("l"), x: 200, y: 245, name: "IN" });
      return doc;
    },
  },
  {
    id: "arduino-blink",
    name: "Arduino Blink (Co-Simulation)",
    description: "ATmega328P führt echten Sketch-Code aus und treibt LEDs.",
    build: () => {
      const doc = emptyDoc("Arduino Co-Simulation");
      const mcu = inst("mcu_atmega328p", "MCU1", 300, 300, { vdd: 5 }, 0);
      const r1 = inst("resistor", "R1", 520, 246, { r: 330 });
      const led1 = inst("led", "D1", 640, 246, { vf: 2 });
      const r2 = inst("resistor", "R2", 520, 340, { r: 330 });
      const led2 = inst("led", "D2", 640, 340, { vf: 2, color: "green" });
      const g1 = inst("gnd", "GND1", 760, 300);
      const vcc = inst("vdc", "V1", 120, 300, { dc: 5 });
      const g2 = inst("gnd", "GND2", 120, 400);
      doc.instances.push(mcu, r1, led1, r2, led2, g1, vcc, g2);
      doc.wires.push(
        wire(370, 246, 490, 246),
        wire(370, 228, 440, 228, 440, 340, 490, 340),
        wire(550, 246, 610, 246),
        wire(550, 340, 610, 340),
        wire(670, 246, 760, 246, 760, 286),
        wire(670, 340, 760, 340, 760, 286),
        wire(120, 270, 120, 120, 420, 120, 420, 372, 370, 372),
        wire(120, 330, 120, 386),
        wire(370, 390, 420, 390, 420, 430, 120, 430, 120, 386),
      );
      doc.notes.push({ id: nid("n"), x: 200, y: 180, text: "Sketch im Inspector bearbeiten (setup/loop)", size: 11 });
      return doc;
    },
  },
  {
    id: "logic-counter",
    name: "Digitaler 4-Bit-Zähler",
    description: "Taktgenerator, Zähler und BCD-7-Segment-Dekoder mit Anzeige.",
    build: () => {
      const doc = emptyDoc("4-Bit Zähler");
      const clk = inst("clockgen", "CLK1", 180, 283, { freq: 4 });
      const cnt = inst("counter4", "U1", 380, 300, {});
      const dec = inst("bcd7seg", "U2", 620, 300, {});
      const disp = inst("sevenseg", "DS1", 880, 300, { common: "cathode" });
      const en = inst("vcc", "VCC1", 250, 360, { dc: 5 });
      const g = inst("gnd", "GND1", 880, 394);
      doc.instances.push(clk, cnt, dec, disp, en, g);
      doc.wires.push(
        wire(122, 275, 100, 275, 100, 360, 300, 360, 300, 275, 322, 275),
        wire(250, 374, 250, 307, 322, 307),
        wire(438, 275, 500, 275, 500, 251, 562, 251),
        wire(438, 291, 510, 291, 510, 267, 562, 267),
        wire(438, 307, 520, 307, 520, 283, 562, 283),
        wire(438, 323, 530, 323, 530, 299, 562, 299),
        wire(678, 251, 700, 251, 700, 270, 830, 270),
        wire(678, 267, 710, 267, 710, 290, 830, 290),
        wire(678, 283, 720, 283, 720, 310, 830, 310),
        wire(678, 299, 730, 299, 730, 330, 830, 330),
        wire(678, 315, 740, 315, 740, 200, 990, 200, 990, 270, 930, 270),
        wire(678, 331, 750, 331, 750, 190, 1000, 190, 1000, 290, 930, 290),
        wire(678, 347, 760, 347, 760, 180, 1010, 180, 1010, 310, 930, 310),
        wire(930, 330, 930, 380, 880, 380),
      );
      doc.notes.push({ id: nid("n"), x: 120, y: 200, text: "Taktfrequenz im Inspector oder Mustergenerator einstellen", size: 11 });
      return doc;
    },
  },
  {
    id: "buck",
    name: "Schaltregler (Buck)",
    description: "MOSFET, Freilaufdiode, LC-Filter — Leistungselektronik in Echtzeit.",
    build: () => {
      const doc = emptyDoc("Buck-Konverter");
      const vin = inst("vdc", "VIN", 160, 280, { dc: 24 });
      const drv = inst("vpulse", "VG", 300, 420, { offset: 0, amplitude: 34, freq: 20000, duty: 40, rise: 2e-8, fall: 2e-8 });
      const m = inst("nmos_irf540", "M1", 360, 220, { vto: 3.5, kp: 4e-4, w: 0.05, l: 1e-5 });
      const d = inst("diode_1n5819", "D1", 470, 320, { is: 3.1e-6 }, 270);
      const l = inst("inductor", "L1", 560, 220, { l: 1e-4, rser: 0.05 });
      const c = inst("capacitor_elko", "C1", 660, 300, { c: 1e-4 }, 90);
      const rl = inst("resistor", "RL", 760, 300, { r: 10 }, 90);
      const g1 = inst("gnd", "GND1", 160, 400);
      const g2 = inst("gnd", "GND2", 300, 500);
      const g3 = inst("gnd", "GND3", 470, 400);
      const g4 = inst("gnd", "GND4", 660, 400);
      const g5 = inst("gnd", "GND5", 760, 400);
      doc.instances.push(vin, drv, m, d, l, c, rl, g1, g2, g3, g4, g5);
      doc.wires.push(
        wire(160, 250, 160, 190, 374, 190),
        wire(160, 310, 160, 386),
        wire(300, 390, 300, 220, 330, 220),
        wire(300, 450, 300, 486),
        wire(374, 250, 374, 290, 470, 290),
        wire(470, 290, 470, 250, 530, 250, 530, 220),
        wire(470, 350, 470, 386),
        wire(590, 220, 660, 220, 660, 270),
        wire(660, 220, 760, 220, 760, 270),
        wire(660, 330, 660, 386),
        wire(760, 330, 760, 386),
      );
      doc.labels.push({ id: nid("l"), x: 660, y: 220, name: "VOUT" }, { id: nid("l"), x: 470, y: 290, name: "SW" });
      return doc;
    },
  },
];

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
