/* Developer smoke test for the SPICE kernel (run with tsc -> node). */
import { Netlist } from "../src/lib/sim/engine";
import { runAcSweep, runOperatingPoint, runTransient } from "../src/lib/sim/analyses";

function nl(devices: Netlist["devices"]): Netlist {
  return { devices };
}

function check(name: string, actual: number, expected: number, tol: number) {
  const ok = Math.abs(actual - expected) <= tol;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: got ${actual.toPrecision(6)} expected ~${expected}`);
}

// 1. resistive divider
const divider = nl([
  { id: "V1", type: "V", nodes: ["in", "0"], params: {}, source: { kind: "dc", dc: 10 } },
  { id: "R1", type: "R", nodes: ["in", "out"], params: { r: 1000 } },
  { id: "R2", type: "R", nodes: ["out", "0"], params: { r: 1000 } },
]);
const op1 = runOperatingPoint(divider, {});
check("divider vout", op1.nodes["out"], 5, 1e-6);

// 2. diode rectifier DC
const diode = nl([
  { id: "V1", type: "V", nodes: ["a", "0"], params: {}, source: { kind: "dc", dc: 5 } },
  { id: "D1", type: "D", nodes: ["a", "b"], params: { is: 1e-14, n: 1 } },
  { id: "R1", type: "R", nodes: ["b", "0"], params: { r: 1000 } },
]);
const op2 = runOperatingPoint(diode, {});
check("diode drop", 5 - op2.nodes["b"], 0.62, 0.15);

// 3. RC transient
const rc = nl([
  { id: "V1", type: "V", nodes: ["in", "0"], params: {}, source: { kind: "dc", dc: 1 } },
  { id: "R1", type: "R", nodes: ["in", "out"], params: { r: 1000 } },
  { id: "C1", type: "C", nodes: ["out", "0"], params: { c: 1e-6 } },
]);
const tr = runTransient(rc, {}, { stopTime: 5e-3, stepTime: 1e-6, uic: true }, ["out"]);
const last = tr.signals["out"][tr.signals["out"].length - 1];
check("RC 5tau", last, 0.993, 0.02);

// 4. AC low pass -3 dB at 159 Hz
const acnl = nl([
  { id: "V1", type: "V", nodes: ["in", "0"], params: {}, source: { kind: "dc", dc: 0, acMag: 1 } },
  { id: "R1", type: "R", nodes: ["in", "out"], params: { r: 1000 } },
  { id: "C1", type: "C", nodes: ["out", "0"], params: { c: 1e-6 } },
]);
const ac = runAcSweep(acnl, {}, { start: 1, stop: 1e5, points: 20, type: "dec" }, ["out"]);
const i159 = ac.freq.findIndex((f) => f >= 159);
check("RC -3dB", ac.magDb["out"][i159], -3, 0.5);

// 5. BJT common emitter bias
const bjt = nl([
  { id: "VCC", type: "V", nodes: ["vcc", "0"], params: {}, source: { kind: "dc", dc: 12 } },
  { id: "RB", type: "R", nodes: ["vcc", "b"], params: { r: 470000 } },
  { id: "RC1", type: "R", nodes: ["vcc", "c"], params: { r: 4700 } },
  { id: "Q1", type: "Q", nodes: ["c", "b", "0"], params: { is: 1e-14, bf: 200, vaf: 100 } },
]);
const op3 = runOperatingPoint(bjt, {});
console.log("BJT vbe", op3.nodes["b"]?.toPrecision(4), "vce", op3.nodes["c"]?.toPrecision(4));
check("BJT vbe", op3.nodes["b"], 0.65, 0.12);

// 6. non-inverting op-amp, gain 2
const oa = nl([
  { id: "V1", type: "V", nodes: ["in", "0"], params: {}, source: { kind: "dc", dc: 1, acMag: 1 } },
  { id: "U1", type: "OPAMP", nodes: ["in", "fb", "out"], params: { gain: 2e5, vcc: 15, vee: -15, gbw: 1e6 } },
  { id: "R1", type: "R", nodes: ["out", "fb"], params: { r: 10000 } },
  { id: "R2", type: "R", nodes: ["fb", "0"], params: { r: 10000 } },
]);
const op4 = runOperatingPoint(oa, {});
check("opamp gain 2", op4.nodes["out"], 2, 0.05);

// 7. MOSFET switch
const mos = nl([
  { id: "VDD", type: "V", nodes: ["vdd", "0"], params: {}, source: { kind: "dc", dc: 10 } },
  { id: "VG", type: "V", nodes: ["g", "0"], params: {}, source: { kind: "dc", dc: 10 } },
  { id: "RD", type: "R", nodes: ["vdd", "d"], params: { r: 1000 } },
  { id: "M1", type: "M", nodes: ["d", "g", "0"], params: { kp: 2e-5, w: 0.1, l: 1e-5, vto: 2, lambda: 0.02 } },
]);
const op5 = runOperatingPoint(mos, {});
console.log("MOSFET vds", op5.nodes["d"]?.toPrecision(4));

// 8. 555 astable sanity (just runs)
const t555 = nl([
  { id: "VCC", type: "V", nodes: ["vcc", "0"], params: {}, source: { kind: "dc", dc: 9 } },
  { id: "R1", type: "R", nodes: ["vcc", "dis"], params: { r: 10000 } },
  { id: "R2", type: "R", nodes: ["dis", "thr"], params: { r: 47000 } },
  { id: "C1", type: "C", nodes: ["thr", "0"], params: { c: 1e-6 } },
  { id: "U1", type: "TIMER555", nodes: ["0", "thr", "out", "vcc", "", "thr", "dis", "vcc"], params: {} },
  { id: "RL", type: "R", nodes: ["out", "0"], params: { r: 1000 } },
]);
const t = runTransient(t555, {}, { stopTime: 0.2, stepTime: 2e-5 }, ["out", "thr"]);
const outs = t.signals["out"];
const hi = outs.filter((v) => v > 4).length;
console.log(`555 transient steps=${t.steps} highRatio=${(hi / outs.length).toFixed(2)} ok=${t.ok}`);
