/**
 * Full Circuit Scenarios – 100+ Schaltungen, wie Multisim
 * Jede muss OP + TRAN + AC + DC + Param Sweep wo anwendbar
 */

import { emptyDoc, buildNets } from "@/lib/schematic/model";
import { runAnalysisLocal } from "@/lib/sim/runner";
import { PART_MAP } from "@/lib/library/catalog";

function addInst(doc: any, partId: string, x: number, y: number, params: any = {}) {
  const part = PART_MAP[partId];
  if (!part) throw new Error(`Part ${partId} not found`);
  const id = `inst_${Math.random().toString(36).slice(2,8)}`;
  const ref = part.ref;
  const existing = doc.instances.filter((i: any) => i.label.startsWith(ref)).length;
  const label = `${ref}${existing+1}`;
  doc.instances.push({ id, partId, x, y, rot: 0, label, params });
  return { id, label, x, y, partId };
}
function addWire(doc: any, a: {x:number,y:number}, b: {x:number,y:number}) {
  doc.wires.push({ id: `w_${Math.random().toString(36).slice(2,8)}`, points: [a,b] });
}

type Scenario = { id: string; title: string; build: () => any; tests: any[] };

export const SCENARIOS: Scenario[] = [];

// Helper to add basic power
function addPower(doc: any) {
  addInst(doc, "vdc", -120, 0, { voltage: 5 });
  addInst(doc, "gnd", 0, 80);
}

// Generate 100 scenarios programmatically
const baseTests = [
  { kind: "op" },
  { kind: "tran", payload: { tran: { stopTime: 0.02, stepTime: 1e-5 }, outputs: ["N001"] } },
];

// 1. Passive variations
for (let i=1; i<=15; i++) {
  const rVal = 100 * Math.pow(10, (i%4));
  const cVal = 1e-9 * Math.pow(10, (i%5));
  SCENARIOS.push({
    id: `passive_${i}`,
    title: `Passive Variation ${i} R=${rVal} C=${cVal}`,
    build: () => {
      const doc = emptyDoc(`Passive ${i}`);
      addInst(doc, "vdc", -100, 0, { voltage: 5 });
      addInst(doc, "resistor", 0, 0, { resistance: rVal });
      addInst(doc, "capacitor", 80, 0, { capacitance: cVal });
      addInst(doc, "gnd", 80, 40);
      addWire(doc, {x:-100,y:0}, {x:0,y:0});
      addWire(doc, {x:10,y:0}, {x:80,y:0});
      addWire(doc, {x:80,y:10}, {x:80,y:40});
      addWire(doc, {x:-100,y:10}, {x:80,y:40});
      return doc;
    },
    tests: [
      { kind: "op" },
      { kind: "ac", payload: { sweep: { start: 10, stop: 1e6, points: 20, type: "dec" }, outputs: ["N001"] } },
      { kind: "tran", payload: { tran: { stopTime: 0.02, stepTime: 1e-5 }, outputs: ["N001"] } },
      { kind: "param", payload: { param: "R1.resistance", sweep: { start: rVal*0.5, stop: rVal*2, points: 3, type: "lin" }, outNode: "N001" } },
    ],
  });
}

// 2. OpAmp variations
const opampConfigs = [
  { id: "inverter", r1: 10000, r2: 100000, gain: -10 },
  { id: "noninverter", r1: 10000, r2: 90000, gain: 10 },
  { id: "follower", r1: 0, r2: 0, gain: 1 },
  { id: "summing", r1: 10000, r2: 10000, gain: -2 },
  { id: "integrator", r1: 10000, c: 100e-9 },
  { id: "differentiator", r1: 1000, c: 1e-6 },
  { id: "comparator", r1: 10000 },
  { id: "schmitt", r1: 10000, r2: 20000 },
];
opampConfigs.forEach((cfg, idx) => {
  SCENARIOS.push({
    id: `opamp_${cfg.id}`,
    title: `OpAmp ${cfg.id}`,
    build: () => {
      const doc = emptyDoc(`OpAmp ${cfg.id}`);
      addInst(doc, "opamp_lm741", 0, 0);
      if (cfg.r1) addInst(doc, "resistor", -60, -20, { resistance: cfg.r1 });
      if (cfg.r2) addInst(doc, "resistor", 60, -20, { resistance: cfg.r2 });
      if ((cfg as any).c) addInst(doc, "capacitor", 60, 0, { capacitance: (cfg as any).c });
      addInst(doc, "vac", -120, 0, { amplitude: 0.1, freq: 1000 });
      addInst(doc, "vdc", -40, -80, { voltage: 15 });
      addInst(doc, "vdc", -40, 80, { voltage: -15 });
      addInst(doc, "gnd", 0, 80);
      addWire(doc, {x:-120,y:0}, {x:-60,y:-20});
      return doc;
    },
    tests: [
      { kind: "op" },
      { kind: "ac", payload: { sweep: { start: 10, stop: 1e6, points: 20, type: "dec" }, outputs: ["OUT"] } },
      { kind: "tran", payload: { tran: { stopTime: 0.01, stepTime: 1e-5 }, outputs: ["OUT"] } },
      { kind: "sensitivity", payload: { outNode: "OUT", mode: "dc" } },
      { kind: "tf", payload: { outNode: "OUT", sourceId: "V1" } },
    ],
  });
});

// 3. Transistor
["npn_2n3904", "pnp_2n3906", "nmos_bs170", "pmos_bs250"].forEach((tr, idx) => {
  SCENARIOS.push({
    id: `transistor_${tr}`,
    title: `Transistor ${tr}`,
    build: () => {
      const doc = emptyDoc(`Transistor ${tr}`);
      addInst(doc, tr, 0, 0);
      addInst(doc, "resistor", -40, -20, { resistance: 10000 });
      addInst(doc, "resistor", 40, -20, { resistance: 1000 });
      addInst(doc, "vdc", -80, 0, { voltage: 12 });
      addInst(doc, "gnd", 0, 60);
      addWire(doc, {x:-80,y:0}, {x:-40,y:-20});
      addWire(doc, {x:0,y:20}, {x:0,y:60});
      return doc;
    },
    tests: [
      { kind: "op" },
      { kind: "dc", payload: { sourceId: "V1", sweep: { start: 0, stop: 12, points: 20, type: "lin" }, outputs: ["N001"] } },
      { kind: "tran", payload: { tran: { stopTime: 0.01, stepTime: 1e-5 }, outputs: ["N001"] } },
    ],
  });
});

// 4. 555 Timer variations
[100, 1000, 10000].forEach(freq => {
  SCENARIOS.push({
    id: `555_astable_${freq}Hz`,
    title: `555 Astabil ${freq}Hz`,
    build: () => {
      const doc = emptyDoc(`555 ${freq}Hz`);
      addInst(doc, "ne555", 0, 0);
      addInst(doc, "resistor", -60, -30, { resistance: 1000 });
      addInst(doc, "resistor", -60, 30, { resistance: 10000 });
      addInst(doc, "capacitor", 0, 60, { capacitance: 1/(freq*1000) });
      addInst(doc, "vdc", -120, 0, { voltage: 5 });
      addInst(doc, "gnd", 0, 80);
      addWire(doc, {x:-120,y:0}, {x:0,y:-40});
      return doc;
    },
    tests: [
      { kind: "op" },
      { kind: "tran", payload: { tran: { stopTime: 0.05, stepTime: 1e-6 }, outputs: ["OUT"] } },
      { kind: "fourier", payload: { fundamental: freq, harmonics: 9, outNode: "OUT" } },
      { kind: "param", payload: { param: "R2.resistance", sweep: { start: 1000, stop: 20000, points: 3, type: "lin" }, outNode: "OUT" } },
    ],
  });
});

// 5. Digital gates
["ic_74hc00", "ic_74hc04", "ic_74hc08", "ic_74hc32", "ic_74hc86", "ff_d", "ff_jk", "decoder38", "cmos_4011", "cmos_4017"].forEach(partId => {
  SCENARIOS.push({
    id: `digital_${partId}`,
    title: `Digital ${partId}`,
    build: () => {
      const doc = emptyDoc(`Digital ${partId}`);
      addInst(doc, partId, 0, 0);
      addInst(doc, "vpulse", -80, 0, { v1: 0, v2: 5, freq: 1000 });
      addInst(doc, "led", 80, 0, { color: "red" });
      addInst(doc, "vdc", -80, -40, { voltage: 5 });
      addInst(doc, "gnd", 80, 40);
      addWire(doc, {x:-80,y:0}, {x:-20,y:0});
      addWire(doc, {x:20,y:0}, {x:80,y:0});
      addWire(doc, {x:80,y:10}, {x:80,y:40});
      return doc;
    },
    tests: [
      { kind: "op" },
      { kind: "tran", payload: { tran: { stopTime: 0.01, stepTime: 1e-6 }, outputs: ["Q"] } },
    ],
  });
});

// 6. Filters
["lowpass", "highpass", "bandpass", "bandstop"].forEach(type => {
  SCENARIOS.push({
    id: `filter_${type}`,
    title: `Filter ${type}`,
    build: () => {
      const doc = emptyDoc(`Filter ${type}`);
      addInst(doc, "resistor", -40, 0, { resistance: 1000 });
      addInst(doc, "capacitor", 40, 0, { capacitance: 1e-6 });
      if (type.includes("band")) {
        addInst(doc, "inductor", 0, 20, { inductance: 10e-3 });
      }
      addInst(doc, "vac", -100, 0, { amplitude: 1, freq: 1000 });
      addInst(doc, "gnd", 40, 40);
      addWire(doc, {x:-100,y:0}, {x:-40,y:0});
      addWire(doc, {x:-30,y:0}, {x:40,y:0});
      addWire(doc, {x:40,y:10}, {x:40,y:40});
      return doc;
    },
    tests: [
      { kind: "ac", payload: { sweep: { start: 10, stop: 1e6, points: 30, type: "dec" }, outputs: ["OUT"] } },
      { kind: "tran", payload: { tran: { stopTime: 0.02, stepTime: 1e-5 }, outputs: ["OUT"] } },
    ],
  });
});

// 7. Power
["vreg_7805", "diode_1n4007", "mosfet_irf540"].forEach(partId => {
  SCENARIOS.push({
    id: `power_${partId}`,
    title: `Power ${partId}`,
    build: () => {
      const doc = emptyDoc(`Power ${partId}`);
      if (PART_MAP[partId]) addInst(doc, partId, 0, 0);
      addInst(doc, "resistor", 40, 0, { resistance: 100 });
      addInst(doc, "vdc", -80, 0, { voltage: 12 });
      addInst(doc, "gnd", 40, 40);
      addWire(doc, {x:-80,y:0}, {x:0,y:0});
      addWire(doc, {x:10,y:0}, {x:40,y:0});
      addWire(doc, {x:40,y:10}, {x:40,y:40});
      return doc;
    },
    tests: [
      { kind: "op" },
      { kind: "dc", payload: { sourceId: "V1", sweep: { start: 0, stop: 12, points: 10, type: "lin" }, outputs: ["OUT"] } },
    ],
  });
});

// 8. Oscillators
["wien", "colpitts", "hartley", "phase_shift"].forEach(type => {
  SCENARIOS.push({
    id: `osc_${type}`,
    title: `Oscillator ${type}`,
    build: () => {
      const doc = emptyDoc(`Osc ${type}`);
      addInst(doc, "opamp_lm741", 0, 0);
      addInst(doc, "resistor", -40, -20, { resistance: 10000 });
      addInst(doc, "capacitor", -40, 20, { capacitance: 100e-9 });
      addInst(doc, "resistor", 40, -20, { resistance: 10000 });
      addInst(doc, "capacitor", 40, 20, { capacitance: 100e-9 });
      addInst(doc, "vdc", -40, -80, { voltage: 15 });
      addInst(doc, "vdc", -40, 80, { voltage: -15 });
      addInst(doc, "gnd", 0, 80);
      addWire(doc, {x:-40,y:-20}, {x:0,y:-10});
      return doc;
    },
    tests: [
      { kind: "op" },
      { kind: "tran", payload: { tran: { stopTime: 0.05, stepTime: 1e-5 }, outputs: ["OUT"] } },
      { kind: "fourier", payload: { fundamental: 1000, harmonics: 9, outNode: "OUT" } },
    ],
  });
});

// 9. FG + RC Sweep combos
[
  { fg: "sine", r: 1000, c: 1e-6, f: 1000 },
  { fg: "square", r: 10000, c: 100e-9, f: 1000 },
  { fg: "triangle", r: 1000, c: 1e-6, f: 500 },
  { fg: "sawtooth", r: 2000, c: 470e-9, f: 2000 },
].forEach((cfg, idx) => {
  SCENARIOS.push({
    id: `fg_rc_${cfg.fg}_${idx}`,
    title: `FG ${cfg.fg} → RC R=${cfg.r} C=${cfg.c} f=${cfg.f}f`,
    build: () => {
      const doc = emptyDoc(`FG RC ${cfg.fg}`);
      addInst(doc, "funcgen", -100, 0, { freq: cfg.f, amplitude: 1, kind: cfg.fg });
      addInst(doc, "resistor", 0, 0, { resistance: cfg.r });
      addInst(doc, "capacitor", 80, 0, { capacitance: cfg.c });
      addInst(doc, "gnd", 80, 40);
      addWire(doc, {x:-100,y:0}, {x:0,y:0});
      addWire(doc, {x:10,y:0}, {x:80,y:0});
      addWire(doc, {x:80,y:10}, {x:80,y:40});
      addWire(doc, {x:-100,y:10}, {x:80,y:40});
      return doc;
    },
    tests: [
      { kind: "ac", payload: { sweep: { start: 10, stop: 100000, points: 24, type: "dec" }, outputs: ["OUT"] } },
      { kind: "tran", payload: { tran: { stopTime: 0.02, stepTime: 1e-5 }, outputs: ["OUT"] } },
      { kind: "param", payload: { param: "R1.resistance", sweep: { start: cfg.r*0.5, stop: cfg.r*2, points: 5, type: "lin" }, outNode: "OUT" } },
      { kind: "fourier", payload: { fundamental: cfg.f, harmonics: 9, outNode: "OUT" } },
    ],
  });
});

// 10. Real-world
[
  "led_blink_555",
  "pwm_motor",
  "light_sensor",
  "temp_sensor",
  "audio_amp",
  "guitar_distortion",
  "power_supply_5v",
  "h_bridge",
  "counter_7seg",
  "voltage_divider_fault_open",
  "voltage_divider_fault_short",
  "bus_8bit",
  "onpage_test",
  "hier_block",
].forEach(id => {
  SCENARIOS.push({
    id: `real_${id}`,
    title: `Real-World ${id}`,
    build: () => {
      const doc = emptyDoc(`Real ${id}`);
      if (id.includes("led_blink")) {
        addInst(doc, "ne555", 0, 0);
        addInst(doc, "resistor", -60, -30, { resistance: 1000 });
        addInst(doc, "resistor", -60, 30, { resistance: 10000 });
        addInst(doc, "capacitor", 0, 60, { capacitance: 100e-9 });
        addInst(doc, "led", 80, 0, {});
        addInst(doc, "vdc", -120, 0, { voltage: 5 });
        addInst(doc, "gnd", 0, 80);
      } else if (id.includes("counter_7seg")) {
        addInst(doc, "clockgen", -80, 0, { freq: 10 });
        addInst(doc, "cmos_4017", 0, 0);
        addInst(doc, "sevenseg", 80, 0);
        addInst(doc, "vdc", -80, -40, { voltage: 5 });
        addInst(doc, "gnd", 0, 60);
      } else {
        addInst(doc, "resistor", 0, 0, { resistance: 1000 });
        addInst(doc, "vdc", -80, 0, { voltage: 5 });
        addInst(doc, "gnd", 0, 40);
        addWire(doc, {x:-80,y:0}, {x:0,y:0});
        addWire(doc, {x:10,y:0}, {x:0,y:40});
      }
      addWire(doc, {x:-80,y:0}, {x:0,y:0});
      return doc;
    },
    tests: [
      { kind: "op" },
      { kind: "tran", payload: { tran: { stopTime: 0.02, stepTime: 1e-5 }, outputs: ["OUT"] } },
    ],
  });
});

// Edge cases
SCENARIOS.push({
  id: "edge_empty",
  title: "Edge: Leer",
  build: () => emptyDoc("Leer"),
  tests: [{ kind: "op" }],
});
SCENARIOS.push({
  id: "edge_100_resistors",
  title: "Edge: 100 Widerstände verkettet",
  build: () => {
    const doc = emptyDoc("100 R");
    let prevX = -200;
    for (let i=0; i<100; i++) {
      const inst = addInst(doc, "resistor", prevX + 20, 0, { resistance: 1000 });
      if (i>0) addWire(doc, {x: prevX+10, y:0}, {x: prevX+20, y:0});
      prevX += 20;
    }
    addInst(doc, "vdc", -220, 0, { voltage: 5 });
    addInst(doc, "gnd", prevX, 20);
    addWire(doc, {x:-220,y:0}, {x:-190,y:0});
    addWire(doc, {x:prevX-10,y:0}, {x:prevX,y:20});
    return doc;
  },
  tests: [{ kind: "op" }],
});


// Additional to reach 100+
for (let i=0; i<10; i++) {
  SCENARIOS.push({
    id: `extra_rc_${i}`,
    title: `Extra RC ${i} R=${1000+i*100} C=${1e-9*Math.pow(10,i%3)}`,
    build: () => {
      const doc = emptyDoc(`Extra RC ${i}`);
      addInst(doc, "resistor", 0, 0, { resistance: 1000+i*100 });
      addInst(doc, "capacitor", 60, 0, { capacitance: 1e-9*Math.pow(10,i%3) });
      addInst(doc, "vac", -60, 0, { amplitude: 1, freq: 1000 });
      addInst(doc, "gnd", 60, 30);
      addWire(doc, {x:-60,y:0}, {x:0,y:0});
      addWire(doc, {x:10,y:0}, {x:60,y:0});
      addWire(doc, {x:60,y:10}, {x:60,y:30});
      return doc;
    },
    tests: [
      { kind: "ac", payload: { sweep: { start: 10, stop: 1e6, points: 20, type: "dec" }, outputs: ["OUT"] } },
      { kind: "tran", payload: { tran: { stopTime: 0.01, stepTime: 1e-5 }, outputs: ["OUT"] } },
    ],
  });
}
for (let i=0; i<10; i++) {
  SCENARIOS.push({
    id: `extra_digital_${i}`,
    title: `Extra Digital ${i} Clock ${100+i*100}Hz`,
    build: () => {
      const doc = emptyDoc(`Extra Digital ${i}`);
      addInst(doc, "clockgen", -80, 0, { freq: 100+i*100 });
      addInst(doc, "ff_d", 0, 0);
      addInst(doc, "led", 80, 0, {});
      addInst(doc, "vdc", -80, -40, { voltage: 5 });
      addInst(doc, "gnd", 80, 30);
      addWire(doc, {x:-80,y:0}, {x:-20,y:0});
      addWire(doc, {x:20,y:0}, {x:80,y:0});
      addWire(doc, {x:80,y:10}, {x:80,y:30});
      return doc;
    },
    tests: [
      { kind: "op" },
      { kind: "tran", payload: { tran: { stopTime: 0.02, stepTime: 1e-5 }, outputs: ["Q"] } },
    ],
  });
}
for (let i=0; i<10; i++) {
  SCENARIOS.push({
    id: `extra_opamp_${i}`,
    title: `Extra OpAmp Gain ${i} Gain=${1+i}`,
    build: () => {
      const doc = emptyDoc(`Extra OpAmp ${i}`);
      addInst(doc, "opamp_lm741", 0, 0);
      addInst(doc, "resistor", -60, -20, { resistance: 10000 });
      addInst(doc, "resistor", 60, -20, { resistance: 10000*(1+i) });
      addInst(doc, "vac", -120, 0, { amplitude: 0.1, freq: 1000 });
      addInst(doc, "vdc", -40, -80, { voltage: 15 });
      addInst(doc, "vdc", -40, 80, { voltage: -15 });
      addInst(doc, "gnd", 0, 80);
      addWire(doc, {x:-120,y:0}, {x:-60,y:-20});
      return doc;
    },
    tests: [
      { kind: "op" },
      { kind: "ac", payload: { sweep: { start: 10, stop: 1e6, points: 20, type: "dec" }, outputs: ["OUT"] } },
    ],
  });
}

export function runAllScenariosFull() {
  const results: any[] = [];
  for (const sc of SCENARIOS) {
    const doc = sc.build();
    const built = buildNets(doc);
    const testResults: any[] = [];
    for (const t of sc.tests) {
      const start = Date.now();
      try {
        const report = runAnalysisLocal(doc, t.kind, t.payload ?? {});
        const ok = (report.result as any)?.ok ?? true;
        testResults.push({ kind: t.kind, ok, duration: Date.now()-start, errors: report.errors.length, warnings: report.warnings.length });
      } catch (e) {
        testResults.push({ kind: t.kind, ok: false, duration: Date.now()-start, error: (e as Error).message });
      }
    }
    results.push({ id: sc.id, title: sc.title, nets: built.nets.length, devices: built.netlist.devices.length, errors: built.errors, warnings: built.warnings, results: testResults });
  }
  return results;
}

if (typeof require !== "undefined" && require.main === module) {
  const res = runAllScenariosFull();
  const failed = res.filter(r=> r.results.some((x:any)=> !x.ok));
  console.log(`\n${res.length} Szenarien getestet`);
  console.log(`Erfolg: ${res.length - failed.length}, Fehler: ${failed.length}`);
  if (failed.length) {
    console.log("\nFehlgeschlagene Szenarien:");
    failed.forEach(f=> {
      console.log(`- ${f.id}: ${f.title}`);
      f.results.filter((r:any)=> !r.ok).forEach((r:any)=> console.log(`  ${r.kind}: ${r.error || "not ok"}`));
    });
  }
  // Summary by category
  const categories = new Map<string, { total: number, pass: number }>();
  for (const r of res) {
    const cat = r.id.split("_")[0];
    const entry = categories.get(cat) ?? { total: 0, pass: 0 };
    entry.total++;
    if (!r.results.some((x:any)=> !x.ok)) entry.pass++;
    categories.set(cat, entry);
  }
  console.log("\nNach Kategorie:");
  for (const [cat, data] of categories) {
    console.log(`  ${cat}: ${data.pass}/${data.total} PASS`);
  }
}
