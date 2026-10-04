/* Sprint-1-Tests („Vertrauen"): ehrliche Übertragungsgrößen, vollständige
 * AC-Matrix, echte S-Parameter, On-Page-Verbinder. Alles gegen analytische
 * Werte geprüft. Fehlschlag -> Exit 1. */
import { Netlist } from "../src/lib/sim/engine";
import {
  acLinearizationWarnings,
  runAcSweep,
  runOperatingPoint,
  runPoleZero,
  runSensitivity,
  runSParams,
  runTransferFunction,
} from "../src/lib/sim/analyses";
import { buildNets, emptyDoc } from "../src/lib/schematic/model";

let failed = 0;
function check(name: string, actual: number, expected: number, tol: number) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: got ${Number(actual).toPrecision(6)} expected ~${expected} (±${tol})`);
}
function checkTrue(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
}

const nl = (devices: Netlist["devices"]): Netlist => ({ devices });
const ac1k = { start: 1000, stop: 1000, points: 2, type: "lin" } as const;

/* 1 · Transferfunktion am Spannungsteiler (1k/1k, 10 V) */
{
  const div = nl([
    { id: "V1", type: "V", nodes: ["in", "0"], params: {}, source: { kind: "dc", dc: 10 } },
    { id: "R1", type: "R", nodes: ["in", "out"], params: { r: 1000 } },
    { id: "R2", type: "R", nodes: ["out", "0"], params: { r: 1000 } },
  ]);
  const tf = runTransferFunction(div, {}, "out", "V1");
  checkTrue("TF ok", tf.ok);
  check("TF gain", tf.gain, 0.5, 1e-6);
  check("TF Rin", tf.inputResistance, 2000, 0.5);
  check("TF Rout", tf.outputResistance, 500, 0.5);
}

/* 2 · Sensitivität DC: dlnV/dlnR = ∓0.5 */
{
  const div = nl([
    { id: "V1", type: "V", nodes: ["in", "0"], params: {}, source: { kind: "dc", dc: 10 } },
    { id: "R1", type: "R", nodes: ["in", "out"], params: { r: 1000 } },
    { id: "R2", type: "R", nodes: ["out", "0"], params: { r: 1000 } },
  ]);
  const s = runSensitivity(div, {}, "out", "dc").sensitivities;
  const r1 = s.find((x) => x.device === "R1")?.sensitivity ?? NaN;
  const r2 = s.find((x) => x.device === "R2")?.sensitivity ?? NaN;
  check("SensDC R1", r1, -0.5, 0.01);
  check("SensDC R2", r2, 0.5, 0.01);
}

/* 3 · Sensitivität AC am RC-Tiefpass bei fc: dln|H|/dlnR = dln|H|/dlnC = −0.5 */
{
  const rc = nl([
    { id: "V1", type: "V", nodes: ["in", "0"], params: {}, source: { kind: "dc", dc: 0, acMag: 1 } },
    { id: "R1", type: "R", nodes: ["in", "out"], params: { r: 1000 } },
    { id: "C1", type: "C", nodes: ["out", "0"], params: { c: 1e-6 } },
  ]);
  const fc = 1 / (2 * Math.PI * 1000 * 1e-6);
  const r = runSensitivity(rc, {}, "out", "ac", fc);
  checkTrue("SensAC ok", r.ok && r.mode === "ac");
  check("SensAC Basis |H|", r.base ?? NaN, 1 / Math.SQRT2, 1e-4);
  check("SensAC R1", r.sensitivities.find((x) => x.device === "R1")?.sensitivity ?? NaN, -0.5, 0.02);
  check("SensAC C1", r.sensitivities.find((x) => x.device === "C1")?.sensitivity ?? NaN, -0.5, 0.02);
}

/* 4 · Sensitivität AC ohne AC-Quelle: Auto-Anregung wird offengelegt */
{
  const rc = nl([
    { id: "V1", type: "V", nodes: ["in", "0"], params: {}, source: { kind: "dc", dc: 0 } },
    { id: "R1", type: "R", nodes: ["in", "out"], params: { r: 1000 } },
    { id: "C1", type: "C", nodes: ["out", "0"], params: { c: 1e-6 } },
  ]);
  const r = runSensitivity(rc, {}, "out", "ac", 100);
  checkTrue("SensAC Auto-Drive", r.ok && r.autoDrive === "V1", `autoDrive=${r.autoDrive}`);
}

/* 5 · Pol-/Nullstellen RC-Tiefpass: Pol bei s = −1000, Güte ~0 */
{
  const rc = nl([
    { id: "V1", type: "V", nodes: ["in", "0"], params: {}, source: { kind: "dc", dc: 0 } },
    { id: "R1", type: "R", nodes: ["in", "out"], params: { r: 1000 } },
    { id: "C1", type: "C", nodes: ["out", "0"], params: { c: 1e-6 } },
  ]);
  const pz = runPoleZero(rc, {}, "out", "V1", { order: 1 });
  checkTrue("PZ1 ok", pz.ok, `poles=${pz.poles.length} fit=${pz.fitErrorDb.toExponential(1)}dB`);
  check("PZ1 Pol Real", pz.poles[0]?.real ?? NaN, -1000, 5);
  check("PZ1 Pol Imag", Math.abs(pz.poles[0]?.imag ?? NaN), 0, 5);
  checkTrue("PZ1 Güte", pz.fitErrorDb < 1e-3, `${pz.fitErrorDb}`);
  const pz2 = runPoleZero(rc, {}, "out", "V1", { order: 2 });
  checkTrue("PZ2 ok", pz2.ok);
  check("PZ2 Pol Real", pz2.poles[0]?.real ?? NaN, -1000, 5);
  checkTrue("PZ2 Überordnung bereinigt", pz2.pruned + pz2.outside >= 1, `pruned=${pz2.pruned} outside=${pz2.outside}`);
}

/* 6 · Pol-/Nullstellen RLC-Tiefpass 2. Ordnung: konjugiert-komplexes Paar */
{
  // R=10, L=1mH, C=1µF: ω0 = 31623, Pole −5000 ± j31226
  const rlc = nl([
    { id: "V1", type: "V", nodes: ["in", "0"], params: {}, source: { kind: "dc", dc: 0 } },
    { id: "R1", type: "R", nodes: ["in", "a"], params: { r: 10 } },
    { id: "L1", type: "L", nodes: ["a", "b"], params: { l: 1e-3 } },
    { id: "C1", type: "C", nodes: ["b", "0"], params: { c: 1e-6 } },
  ]);
  const pz = runPoleZero(rlc, {}, "b", "V1", { order: 2, fmin: 100, fmax: 100e3 });
  checkTrue("PZ-RLC ok", pz.ok && pz.poles.length === 2, `poles=${pz.poles.length} fit=${pz.fitErrorDb.toExponential(1)}dB`);
  if (pz.poles.length === 2) {
    check("PZ-RLC Real", pz.poles[0].real, -5000, 800);
    check("PZ-RLC Imag", Math.abs(pz.poles[0].imag), 31226, 3000);
    checkTrue("PZ-RLC konjugiert", Math.abs(pz.poles[0].imag + pz.poles[1].imag) < 3000);
  }
}

/* 7 · S-Parameter 50/50-Dämpfungsglied, Z0 = 50 Ω */
{
  const attn = nl([
    { id: "R1", type: "R", nodes: ["in", "out"], params: { r: 50 } },
    { id: "R2", type: "R", nodes: ["out", "0"], params: { r: 50 } },
  ]);
  const sp = runSParams(attn, {}, { start: 1e3, stop: 1e6, points: 10, type: "dec" }, "in", "out", 50);
  checkTrue("SParam ok", sp.ok);
  // Zin = 50 + (50‖50) = 75 → S11 = 0.2; S21 = 0.4 (Norton 1 A)
  check("S11", sp.s11db[0], 20 * Math.log10(0.2), 0.01);
  check("S21", sp.s21db[0], 20 * Math.log10(0.4), 0.01);
  const thru = nl([{ id: "R0", type: "R", nodes: ["in", "out"], params: { r: 1e-3 } }]);
  const st = runSParams(thru, {}, { start: 1e3, stop: 1e5, points: 6, type: "dec" }, "in", "out", 50);
  checkTrue("SParam Thru", st.ok && st.s21db[0] > -0.05 && st.s11db[0] < -40, `S21=${st.s21db[0]?.toFixed(3)} S11=${st.s11db[0]?.toFixed(1)}`);
}

/* 8 · JFET in AC: CS-Stufe Gain ≈ −18.5 */
{
  const jfet = nl([
    { id: "VDD", type: "V", nodes: ["vdd", "0"], params: {}, source: { kind: "dc", dc: 12 } },
    { id: "VG", type: "V", nodes: ["g", "0"], params: {}, source: { kind: "dc", dc: -1, acMag: 1 } },
    { id: "RD", type: "R", nodes: ["vdd", "d"], params: { r: 10000 } },
    { id: "J1", type: "J", nodes: ["d", "g", "0"], params: { beta: 1e-3, vto: 2, lambda: 0.01 } },
  ]);
  const op = runOperatingPoint(jfet, {});
  checkTrue("JFET OP", op.ok, `Vd=${op.nodes["d"]?.toFixed(2)}`);
  const ac = runAcSweep(jfet, {}, ac1k, ["d"]);
  check("JFET AC |gain|", ac.mag["d"]?.[0] ?? NaN, 18.5, 1.0);
  check("JFET AC Phase", Math.abs(ac.phase["d"]?.[0] ?? NaN), 180, 1);
}

/* 9 · VSWITCH in AC: ein ≈ 0.99, aus ≈ 0 */
{
  const mk = (vc: number) =>
    nl([
      { id: "V1", type: "V", nodes: ["in", "0"], params: {}, source: { kind: "dc", dc: 0, acMag: 1 } },
      { id: "VC", type: "V", nodes: ["c", "0"], params: {}, source: { kind: "dc", dc: vc } },
      { id: "S1", type: "VSWITCH", nodes: ["in", "out", "c", "0"], params: { ron: 10, roff: 1e9, von: 2.5, voff: 2 } },
      { id: "RL", type: "R", nodes: ["out", "0"], params: { r: 1000 } },
    ]);
  const on = runAcSweep(mk(5), {}, ac1k, ["out"]);
  check("VSWITCH ein", on.mag["out"]?.[0] ?? NaN, 1000 / 1010, 1e-3);
  const off = runAcSweep(mk(0), {}, ac1k, ["out"]);
  checkTrue("VSWITCH aus", (off.mag["out"]?.[0] ?? 1) < 1e-3);
}

/* 10 · F/H in AC (Steuerklemmen in Reihe): F |gain| 1, H 0.1 */
{
  const mkF = () =>
    nl([
      { id: "V1", type: "V", nodes: ["a", "0"], params: {}, source: { kind: "dc", dc: 1, acMag: 1 } },
      { id: "R1", type: "R", nodes: ["a", "cp"], params: { r: 1000 } },
      { id: "F1", type: "F", nodes: ["x", "0", "cp", "0"], params: { gain: 10 } },
      { id: "RX", type: "R", nodes: ["x", "0"], params: { r: 100 } },
    ]);
  const f = runAcSweep(mkF(), {}, ac1k, ["x"]);
  checkTrue("F ok (kein Phantom-Branch mehr)", f.ok);
  check("F CCCS |gain|", f.mag["x"]?.[0] ?? NaN, 1.0, 0.01);
  const mkH = () =>
    nl([
      { id: "V1", type: "V", nodes: ["a", "0"], params: {}, source: { kind: "dc", dc: 1, acMag: 1 } },
      { id: "R1", type: "R", nodes: ["a", "cp"], params: { r: 1000 } },
      { id: "H1", type: "H", nodes: ["x", "0", "cp", "0"], params: { gain: 100 } },
      { id: "RX", type: "R", nodes: ["x", "0"], params: { r: 10000 } },
    ]);
  const h = runAcSweep(mkH(), {}, ac1k, ["x"]);
  check("H CCVS gain", h.mag["x"]?.[0] ?? NaN, 0.1, 1e-4);
}

/* 11 · SCR in AC: gezündet ≈ 1, ungezündet ≈ 0 */
{
  const mk = (vg: number) =>
    nl([
      { id: "V1", type: "V", nodes: ["in", "0"], params: {}, source: { kind: "dc", dc: 5, acMag: 1 } },
      { id: "VG", type: "V", nodes: ["g", "0"], params: {}, source: { kind: "dc", dc: vg } },
      { id: "T1", type: "SCR", nodes: ["in", "out", "g"], params: { ron: 0.1, vgt: 0.7, ih: 1e-3 } },
      { id: "RL", type: "R", nodes: ["out", "0"], params: { r: 1000 } },
    ]);
  const on = runAcSweep(mk(5), {}, ac1k, ["out"]);
  check("SCR ein", on.mag["out"]?.[0] ?? NaN, 1000 / 1000.1, 1e-3);
  const off = runAcSweep(mk(0), {}, ac1k, ["out"]);
  checkTrue("SCR aus", (off.mag["out"]?.[0] ?? 1) < 1e-3);
}

/* 12 · AC-Warnungen nennen digitale Näherungen */
{
  const d = nl([
    { id: "V1", type: "V", nodes: ["a", "0"], params: {}, source: { kind: "dc", dc: 5 } },
    { id: "D1", type: "DIGITAL", nodes: ["a", "b"], params: {}, model: "buffer" },
    { id: "R1", type: "R", nodes: ["b", "0"], params: { r: 1000 } },
  ]);
  const w = acLinearizationWarnings(d);
  checkTrue("AC-Warnung", w.length === 1 && w[0].includes("D1"), w[0] ?? "(keine)");
  checkTrue("AC-Warnung leer ohne Digital", acLinearizationWarnings(nl([])).length === 0);
}

/* 13 · On-Page-Verbinder: gleicher Name = gleiches Netz */
{
  const doc = emptyDoc("Verbinder-Test");
  doc.instances.push(
    { id: "c1", partId: "onpage_connector", x: 0, y: 0, rot: 0, label: "J1", params: { name: "SIGX" } },
    { id: "c2", partId: "onpage_connector", x: 200, y: 0, rot: 0, label: "J2", params: { name: "SIGX" } },
    { id: "c3", partId: "onpage_connector", x: 400, y: 0, rot: 0, label: "J3", params: { name: "ANDERS" } },
  );
  // Pin 0 liegt bei (x−30, y) — je eine Leitung ans Pin-Ende hängen.
  doc.wires.push(
    { id: "w1", points: [{ x: -30, y: 0 }, { x: -80, y: 0 }] },
    { id: "w2", points: [{ x: 170, y: 0 }, { x: 120, y: 0 }] },
    { id: "w3", points: [{ x: 370, y: 0 }, { x: 320, y: 0 }] },
  );
  const built = buildNets(doc);
  const netOf = (x: number, y: number) => built.pointNets[`${x},${y}`];
  checkTrue("Verbinder gleicher Name", netOf(-80, 0) === netOf(120, 0) && netOf(-80, 0) === "SIGX", `${netOf(-80, 0)} vs ${netOf(120, 0)}`);
  checkTrue("Verbinder anderer Name getrennt", netOf(320, 0) !== netOf(-80, 0), `${netOf(320, 0)}`);
  checkTrue("Verbinder ohne Devices", built.netlist.devices.length === 0, `${built.netlist.devices.length} Devices`);
}

console.log(failed === 0 ? "\nSprint-1-Prüfungen: alle bestanden." : `\nSprint-1-Prüfungen: ${failed} FEHLSCHLÄGE.`);
process.exit(failed === 0 ? 0 : 1);
