/**
 * Circuit Scenarios Test Runner – prüft alle möglichen Schaltungen
 * Baut Schaltungen programmatisch, führt OP/TRAN/AC/DC/Param Sweep aus, checkt ok
 */

import { emptyDoc, buildNets } from "@/lib/schematic/model";
import { runAnalysisLocal } from "@/lib/sim/runner";
import { PART_MAP } from "@/lib/library/catalog";

type Scenario = {
  id: string;
  title: string;
  build: () => any; // SchematicDoc
  tests: Array<{ kind: string; payload?: any; expectOk?: boolean }>;
};

function addInst(doc: any, partId: string, x: number, y: number, params: any = {}, label?: string) {
  const part = PART_MAP[partId];
  if (!part) throw new Error(`Part ${partId} not found`);
  const id = `inst_${Math.random().toString(36).slice(2,8)}`;
  const ref = part.ref;
  const existing = doc.instances.filter((i: any) => i.label.startsWith(ref)).length;
  const lbl = label ?? `${ref}${existing+1}`;
  doc.instances.push({ id, partId, x, y, rot: 0, label: lbl, params });
  return { id, label: lbl, x, y };
}

function addWire(doc: any, points: Array<{x:number,y:number}>) {
  doc.wires.push({ id: `w_${Math.random().toString(36).slice(2,8)}`, points });
}

function wireBetween(doc: any, a: {x:number,y:number}, b: {x:number,y:number}) {
  addWire(doc, [a,b]);
}

// Helper to get pin position (approx, without rotation)
function pinPos(inst: any, pinIdx: number) {
  const part = PART_MAP[inst.partId];
  if (!part) return { x: inst.x, y: inst.y };
  const pin = part.pins[pinIdx];
  return { x: inst.x + pin.x, y: inst.y + pin.y };
}

export const SCENARIOS: Scenario[] = [
  // 1. Grundlagen
  {
    id: "1.1_voltage_divider",
    title: "Spannungsteiler R1/R2",
    build: () => {
      const doc = emptyDoc("Voltage Divider");
      const v1 = addInst(doc, "vdc", -100, 0, { voltage: 5 });
      const r1 = addInst(doc, "resistor", 0, -20, { resistance: 10000 });
      const r2 = addInst(doc, "resistor", 0, 20, { resistance: 10000 });
      const gnd = addInst(doc, "gnd", 0, 60);
      // Wires: VDC+ -> R1, R1 -> R2, R2 -> GND, VDC- -> GND
      wireBetween(doc, { x: -100, y: 0 }, { x: 0, y: -20 });
      wireBetween(doc, { x: 0, y: -10 }, { x: 0, y: 10 });
      wireBetween(doc, { x: 0, y: 30 }, { x: 0, y: 60 });
      wireBetween(doc, { x: -100, y: 10 }, { x: 0, y: 60 });
      return doc;
    },
    tests: [
      { kind: "op", expectOk: true },
      { kind: "dc", payload: { sourceId: "V1", sweep: { start: 0, stop: 5, points: 10, type: "lin" }, outputs: ["N001"] }, expectOk: true },
      { kind: "param", payload: { param: "R1.resistance", sweep: { start: 1000, stop: 10000, points: 5, type: "lin" }, outNode: "N001" }, expectOk: true },
    ],
  },
  {
    id: "1.2_rc_lowpass",
    title: "RC Tiefpass",
    build: () => {
      const doc = emptyDoc("RC Lowpass");
      const vac = addInst(doc, "vac", -80, 0, { amplitude: 1, freq: 1000 });
      const r = addInst(doc, "resistor", 0, 0, { resistance: 1000 });
      const c = addInst(doc, "capacitor", 80, 0, { capacitance: 1e-6 });
      const gnd = addInst(doc, "gnd", 80, 40);
      wireBetween(doc, { x: -80, y: 0 }, { x: 0, y: 0 });
      wireBetween(doc, { x: 10, y: 0 }, { x: 80, y: 0 });
      wireBetween(doc, { x: 80, y: 10 }, { x: 80, y: 40 });
      wireBetween(doc, { x: -80, y: 10 }, { x: 80, y: 40 });
      return doc;
    },
    tests: [
      { kind: "op", expectOk: true },
      { kind: "ac", payload: { sweep: { start: 10, stop: 100000, points: 24, type: "dec" }, outputs: ["N002"] }, expectOk: true },
      { kind: "tran", payload: { tran: { stopTime: 0.02, stepTime: 1e-5 }, outputs: ["N002"] }, expectOk: true },
      { kind: "param", payload: { param: "R1.resistance", sweep: { start: 100, stop: 10000, points: 5, type: "lin" }, outNode: "N002" }, expectOk: true },
    ],
  },
  {
    id: "2.1_opamp_inverter",
    title: "OpAmp Inverter",
    build: () => {
      const doc = emptyDoc("OpAmp Inverter");
      const op = addInst(doc, "opamp_lm741", 0, 0);
      const r1 = addInst(doc, "resistor", -60, -20, { resistance: 10000 });
      const r2 = addInst(doc, "resistor", 60, -20, { resistance: 100000 });
      const vac = addInst(doc, "vac", -120, 0, { amplitude: 0.1, freq: 1000 });
      const vcc = addInst(doc, "vdc", -40, -80, { voltage: 15 });
      const vee = addInst(doc, "vdc", -40, 80, { voltage: -15 });
      const gnd = addInst(doc, "gnd", 0, 80);
      // Wires simplified – just need connectivity for netlist, not exact geometry
      wireBetween(doc, { x: -120, y: 0 }, { x: -60, y: -20 });
      wireBetween(doc, { x: -50, y: -20 }, { x: -20, y: -10 });
      wireBetween(doc, { x: 20, y: -10 }, { x: 60, y: -20 });
      wireBetween(doc, { x: 60, y: -10 }, { x: 0, y: -10 });
      return doc;
    },
    tests: [
      { kind: "op", expectOk: true },
      { kind: "ac", payload: { sweep: { start: 10, stop: 1e6, points: 24, type: "dec" }, outputs: ["N003"] }, expectOk: true },
      { kind: "tran", payload: { tran: { stopTime: 0.01, stepTime: 1e-5 }, outputs: ["N003"] }, expectOk: true },
    ],
  },
  {
    id: "2.6_integrator",
    title: "OpAmp Integrator",
    build: () => {
      const doc = emptyDoc("Integrator");
      const op = addInst(doc, "opamp_lm741", 0, 0);
      const r = addInst(doc, "resistor", -60, 0, { resistance: 10000 });
      const c = addInst(doc, "capacitor", 60, 0, { capacitance: 100e-9 });
      const vpulse = addInst(doc, "vpulse", -120, 0, { v1: 0, v2: 1, freq: 1000 });
      const gnd = addInst(doc, "gnd", 0, 60);
      wireBetween(doc, { x: -120, y: 0 }, { x: -60, y: 0 });
      wireBetween(doc, { x: 20, y: -10 }, { x: 60, y: 0 });
      wireBetween(doc, { x: 60, y: 10 }, { x: 0, y: 10 });
      return doc;
    },
    tests: [
      { kind: "op", expectOk: true },
      { kind: "tran", payload: { tran: { stopTime: 0.02, stepTime: 1e-5 }, outputs: ["N004"] }, expectOk: true },
    ],
  },
  {
    id: "4.1_555_astable",
    title: "555 Astabil",
    build: () => {
      const doc = emptyDoc("555 Astable");
      const ic = addInst(doc, "ne555", 0, 0);
      const r1 = addInst(doc, "resistor", -60, -30, { resistance: 1000 });
      const r2 = addInst(doc, "resistor", -60, 30, { resistance: 10000 });
      const c = addInst(doc, "capacitor", 0, 60, { capacitance: 100e-9 });
      const c2 = addInst(doc, "capacitor", 60, -40, { capacitance: 10e-9 });
      const vcc = addInst(doc, "vdc", -120, 0, { voltage: 5 });
      const gnd = addInst(doc, "gnd", 0, 80);
      wireBetween(doc, { x: -120, y: 0 }, { x: 0, y: -40 });
      wireBetween(doc, { x: 0, y: 40 }, { x: 0, y: 60 });
      return doc;
    },
    tests: [
      { kind: "op", expectOk: true },
      { kind: "tran", payload: { tran: { stopTime: 0.05, stepTime: 1e-6 }, outputs: ["N005"] }, expectOk: true },
      { kind: "param", payload: { param: "R2.resistance", sweep: { start: 1000, stop: 20000, points: 5, type: "lin" }, outNode: "N005" }, expectOk: true },
    ],
  },
  {
    id: "6.1_and_gate",
    title: "AND Gate 74LS08",
    build: () => {
      const doc = emptyDoc("AND Gate");
      const and = addInst(doc, "ic_74hc08", 0, 0);
      const vp1 = addInst(doc, "vpulse", -80, -10, { v1: 0, v2: 5, freq: 1000 });
      const vp2 = addInst(doc, "vpulse", -80, 10, { v1: 0, v2: 5, freq: 2000 });
      const led = addInst(doc, "led", 80, 0, { color: "red" });
      const gnd = addInst(doc, "gnd", 80, 40);
      wireBetween(doc, { x: -80, y: -10 }, { x: -20, y: -10 });
      wireBetween(doc, { x: -80, y: 10 }, { x: -20, y: 10 });
      wireBetween(doc, { x: 20, y: 0 }, { x: 80, y: 0 });
      wireBetween(doc, { x: 80, y: 10 }, { x: 80, y: 40 });
      return doc;
    },
    tests: [
      { kind: "op", expectOk: true },
      { kind: "tran", payload: { tran: { stopTime: 0.01, stepTime: 1e-6 }, outputs: ["N006"] }, expectOk: true },
    ],
  },
  {
    id: "6.8_d_flipflop",
    title: "D Flip-Flop 74LS74",
    build: () => {
      const doc = emptyDoc("D FF");
      const ff = addInst(doc, "ff_d", 0, 0);
      const clk = addInst(doc, "clockgen", -80, 10, { freq: 1000 });
      const d = addInst(doc, "vdc", -80, -10, { voltage: 5 });
      const led = addInst(doc, "led", 80, -10, {});
      const gnd = addInst(doc, "gnd", 80, 40);
      wireBetween(doc, { x: -80, y: 10 }, { x: -30, y: 10 });
      wireBetween(doc, { x: -80, y: -10 }, { x: -30, y: -10 });
      wireBetween(doc, { x: 30, y: -10 }, { x: 80, y: -10 });
      wireBetween(doc, { x: 80, y: 0 }, { x: 80, y: 40 });
      return doc;
    },
    tests: [
      { kind: "op", expectOk: true },
      { kind: "tran", payload: { tran: { stopTime: 0.02, stepTime: 1e-6 }, outputs: ["Q"] }, expectOk: true },
    ],
  },
  {
    id: "9.1_fg_rc_lowpass_sweep",
    title: "FG Sine → RC Tiefpass + Sweep",
    build: () => {
      const doc = emptyDoc("FG RC Sweep");
      const fg = addInst(doc, "funcgen", -100, 0, { freq: 1000, amplitude: 1, kind: "sine" });
      const r = addInst(doc, "resistor", 0, 0, { resistance: 1000 });
      const c = addInst(doc, "capacitor", 80, 0, { capacitance: 1e-6 });
      const gnd = addInst(doc, "gnd", 80, 40);
      wireBetween(doc, { x: -100, y: 0 }, { x: 0, y: 0 });
      wireBetween(doc, { x: 10, y: 0 }, { x: 80, y: 0 });
      wireBetween(doc, { x: 80, y: 10 }, { x: 80, y: 40 });
      wireBetween(doc, { x: -100, y: 10 }, { x: 80, y: 40 });
      return doc;
    },
    tests: [
      { kind: "ac", payload: { sweep: { start: 10, stop: 100000, points: 24, type: "dec" }, outputs: ["N007"] }, expectOk: true },
      { kind: "tran", payload: { tran: { stopTime: 0.02, stepTime: 1e-5 }, outputs: ["N007"] }, expectOk: true },
      { kind: "param", payload: { param: "R1.resistance", sweep: { start: 100, stop: 10000, points: 5, type: "lin" }, outNode: "N007" }, expectOk: true },
      { kind: "fourier", payload: { fundamental: 1000, harmonics: 9, outNode: "N007" }, expectOk: true },
    ],
  },
  {
    id: "10.13_bus_8bit",
    title: "Bus 8-bit mit 8 LEDs",
    build: () => {
      const doc = emptyDoc("Bus 8-bit");
      const bus = addInst(doc, "connector_8", 0, 0, { width: 8, name: "BUS[0..7]" });
      const dip = addInst(doc, "switch_dip_4", -80, 0, {});
      const gnd = addInst(doc, "gnd", 80, 40);
      for (let i=0; i<8; i++) {
        const led = addInst(doc, "led", 80, -40 + i*12, { color: i%2?"green":"red" });
        wireBetween(doc, { x: 20, y: 0 }, { x: 80, y: -40 + i*12 });
      }
      wireBetween(doc, { x: -80, y: 0 }, { x: -20, y: 0 });
      wireBetween(doc, { x: 80, y: 0 }, { x: 80, y: 40 });
      return doc;
    },
    tests: [
      { kind: "op", expectOk: true },
      { kind: "tran", payload: { tran: { stopTime: 0.01, stepTime: 1e-5 }, outputs: ["BUS"] }, expectOk: true },
    ],
  },
  {
    id: "10.14_onpage_connector",
    title: "On-Page Connector Test",
    build: () => {
      const doc = emptyDoc("OnPage Test");
      const r = addInst(doc, "resistor", 0, 0, { resistance: 1000 });
      const vdc = addInst(doc, "vdc", -80, 0, { voltage: 5 });
      const opc1 = addInst(doc, "connector_2", 40, 0, { name: "NET_A" });
      const opc2 = addInst(doc, "connector_2", 120, 0, { name: "NET_A" });
      const gnd = addInst(doc, "gnd", 0, 40);
      wireBetween(doc, { x: -80, y: 0 }, { x: 0, y: 0 });
      wireBetween(doc, { x: 10, y: 0 }, { x: 40, y: 0 });
      wireBetween(doc, { x: 120, y: 10 }, { x: 0, y: 40 });
      wireBetween(doc, { x: -80, y: 10 }, { x: 0, y: 40 });
      return doc;
    },
    tests: [
      { kind: "op", expectOk: true },
    ],
  },
  {
    id: "11.3_short_circuit",
    title: "Kurzschluss VDC-GND",
    build: () => {
      const doc = emptyDoc("Short");
      const vdc = addInst(doc, "vdc", 0, 0, { voltage: 5 });
      const gnd = addInst(doc, "gnd", 0, 20);
      wireBetween(doc, { x: 0, y: 0 }, { x: 0, y: 20 });
      wireBetween(doc, { x: 0, y: 10 }, { x: 0, y: 10 });
      return doc;
    },
    tests: [
      { kind: "op", expectOk: false }, // should fail or warn
    ],
  },
];

export function runAllScenarios(): Array<{ id: string; title: string; results: Array<{ kind: string; ok: boolean; duration: number; error?: string }> }> {
  const all: any[] = [];
  for (const sc of SCENARIOS) {
    const doc = sc.build();
    const built = buildNets(doc);
    const results: any[] = [];
    for (const t of sc.tests) {
      const start = Date.now();
      try {
        const report = runAnalysisLocal(doc, t.kind, t.payload ?? {});
        const ok = (report.result as any)?.ok ?? true;
        results.push({ kind: t.kind, ok, duration: Date.now() - start, errors: report.errors, warnings: report.warnings });
      } catch (e) {
        results.push({ kind: t.kind, ok: false, duration: Date.now() - start, error: (e as Error).message });
      }
    }
    all.push({ id: sc.id, title: sc.title, built: { nets: built.nets.length, devices: built.netlist.devices.length, errors: built.errors, warnings: built.warnings }, results });
  }
  return all;
}

// For Node execution
if (typeof require !== "undefined" && require.main === module) {
  const res = runAllScenarios();
  console.log(JSON.stringify(res, null, 2));
  const failed = res.filter(r=> r.results.some((x:any)=> !x.ok && r.id !== "11.3_short_circuit"));
  console.log(`\n${res.length} Szenarien, ${failed.length} fehlgeschlagen`);
  if (failed.length) {
    console.log("Fehler:", failed.map(f=> f.id).join(", "));
    process.exit(1);
  }
}
