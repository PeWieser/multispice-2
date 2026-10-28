/**
 * S5.15: Skalierungs-Benchmark (manuell: `npx tsx scripts/s515perf.ts`).
 * Misst die Solver-Seite bei ~1000 Bauteilen (V + 1000 R in Reihe):
 * Katalog-Expansion, OP-Lösung, Strom-Abfrage aller Devices.
 * Kein Teil von `npm test` (Timing ist maschinenabhängig) — Zahlen fließen
 * dokumentiert in TEST_MATRIX §14 + Audit §54 ein.
 * Canvas-Frames (60 fps) sind nur im Browser messbar → Nutzer-Checkliste.
 */
import { PART_MAP } from "../src/lib/library/catalog";
import { Simulator } from "../src/lib/sim/engine";
import type { Device } from "../src/lib/sim/engine";

const N = 1000;

const t0 = performance.now();
const rPart = PART_MAP["resistor"];
const devices: Device[] = [
  { id: "V1", type: "V", nodes: ["N0", "0"], params: { dc: 100 }, source: { kind: "dc", dc: 100 } },
];
for (let i = 0; i < N; i++) {
  const devs = rPart.toDevices(
    { id: `R${i + 1}`, partId: "resistor", params: { r: 1000 } } as never,
    i === N - 1 ? [`N${i}`, "0"] : [`N${i}`, `N${i + 1}`],
  );
  devices.push(...devs);
}
const tCatalog = performance.now() - t0;

const t1 = performance.now();
const sim = new Simulator({ devices }, { temperature: 27 });
const tBuild = performance.now() - t1;

const t2 = performance.now();
const op = sim.operatingPoint();
const tOp = performance.now() - t2;

const t3 = performance.now();
let checksum = 0;
for (const d of devices) checksum += Math.abs(sim.deviceCurrent(d));
const tSweep = performance.now() - t3;

const vMid = sim.nodeVoltage(`N${N / 2}`);
console.log(`Bauteile: ${devices.length}, Knoten: ${sim.nodeNames.length}`);
console.log(`Katalog-Expansion (1000× toDevices): ${tCatalog.toFixed(0)} ms`);
console.log(`Simulator-Aufbau: ${tBuild.toFixed(0)} ms`);
console.log(`Arbeitspunkt: ${tOp.toFixed(0)} ms (ok=${op.ok})`);
console.log(`Strom-Sweep alle Devices: ${tSweep.toFixed(0)} ms`);
console.log(`Plausibilität: V(N500)=${vMid.toFixed(3)} V (erwartet ≈ 50), Σ|I|=${checksum.toExponential(2)}`);
if (!op.ok || Math.abs(vMid - 50) > 1) {
  console.error("S515PERF FAILED: unplausibles Ergebnis");
  process.exit(1);
}
console.log("s515perf: OK");
