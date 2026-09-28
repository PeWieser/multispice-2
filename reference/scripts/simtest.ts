/**
 * Headless verification of the CircuitBench simulation core.
 * Run with:  npx tsx scripts/simtest.ts
 *
 * Builds the RC low-pass example through the real component library,
 * connectivity resolver and netlist builder, then solves it.
 */
import { exampleSheet } from "../src/lib/domain/examples";
import { resolveNetlist } from "../src/lib/domain/connectivity";
import { buildCircuit, runAcSweep, runDcSweep, runOperatingPoint, runTransient } from "../src/lib/sim/engine";
import type { ProjectDoc } from "../src/lib/domain/types";

const settings: ProjectDoc["simSettings"] = {
  engine: "internal-mna",
  temperature: 27,
  gmin: 1e-12,
  reltol: 1e-3,
  abstol: 1e-12,
  vntol: 1e-6,
  maxNewton: 60,
  integration: "be",
};

function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? " — " + detail : ""}`);
  if (!ok) process.exitCode = 1;
}

const sheet = exampleSheet("rc");
const graph = resolveNetlist(sheet);
check("resolver finds nets", graph.nets.length >= 3, `${graph.nets.length} nets: ${graph.nets.map((n) => n.name).join(", ")}`);
check("ground present", graph.nets.some((n) => n.isGround));
check("no errors", graph.errors.length === 0, graph.errors.map((e) => e.message).join(" / "));

const circuit = buildCircuit(sheet, graph, {}, settings);
check("circuit assembles", circuit.ok, `${circuit.elements.length} elements, nodes: ${circuit.nodes.join(", ")}`);

const op = runOperatingPoint(circuit, settings);
check("operating point converges", op.converged);
console.log("     op:", Object.entries(op.opPoint).map(([k, v]) => `${k}=${v.toFixed(3)}`).join(" "));

const tran = runTransient(
  circuit,
  settings,
  { tstart: "0", tstop: "2m", tstep: "20u", useOp: "true" },
  {},
  "Transient Analysis",
);
check("transient converges", tran.converged, `${tran.x.length} points in ${tran.solveMs.toFixed(1)} ms`);
const out = tran.traces.find((t) => t.name.includes("OUT") || t.name === "V(N_OUT)") ?? tran.traces[1];
const input = tran.traces.find((t) => t !== out)!;
const outMax = Math.max(...out.values.filter(Number.isFinite));
const inMax = Math.max(...input.values.filter(Number.isFinite));
check("output is attenuated by the low-pass", outMax < inMax * 0.95, `Vin peak ${inMax.toFixed(3)} V, Vout peak ${outMax.toFixed(3)} V`);
check("output has finite values", out.values.every(Number.isFinite));

// measured cutoff check via AC sweep
const ac = runAcSweep(circuit, settings, { fstart: "10", fstop: "100k", sweepType: "dec", points: "10" }, {}, "AC");
const acOut = ac.traces.find((t) => t.name.includes("OUT"))!;
const acIn = ac.traces.find((t) => t.name.includes("IN"))!;
const gains = acOut.values.map((v, i) => 20 * Math.log10(v / (acIn.values[i] || 1e-12)));
const dcGain = gains[0];
const idx3db = gains.findIndex((g) => g <= dcGain - 3.05);
const fc = idx3db > 0 ? ac.x[idx3db] : NaN;
check("AC sweep runs", ac.traces.length > 0, `${ac.x.length} frequency points`);
check(
  "measured -3 dB frequency ≈ 1/(2πRC) = 1591 Hz",
  Number.isFinite(fc) && fc > 900 && fc < 3000,
  `fc = ${fc?.toFixed(0)} Hz`,
);

// diode DC sweep
const dSheet = exampleSheet("diode");
const dGraph = resolveNetlist(dSheet);
const dCircuit = buildCircuit(dSheet, dGraph, {}, settings);
const dc = runDcSweep(dCircuit, settings, { source: "V1", start: "-5", stop: "5", step: "0.25" }, {}, "DC Sweep");
check("DC sweep converges", dc.converged, `${dc.x.length} sweep points`);
const iTrace = dc.traces.find((t) => t.name.startsWith("I("))!;
const iAtNeg = iTrace.values[0];
const iAtPos = iTrace.values[iTrace.values.length - 1];
check("diode blocks reverse current", Math.abs(iAtNeg) < 1e-6, `I(-5 V) = ${iAtNeg.toExponential(2)} A`);
check(
  "diode conducts forward current",
  Math.abs(iAtPos) > 1e-3,
  `I(+5 V) = ${iAtPos.toExponential(2)} A (source current sign convention)`,
);

console.log("\nfinished");
