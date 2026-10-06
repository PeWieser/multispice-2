/**
 * Sprint-4-Regression (Modelle): OPV transient (Slew + GBW), D/Q-Temperatur +
 * Sperrschichten, MOSFET-Temperatur + Meyer, MC/Worst-Case-Streuung,
 * Relais/Sicherung, Trafo/Übertragungsleitung.
 *
 * - S4.1: OPV-Folger TRAN 100 kHz / 3 MHz (GBW-Pol), Slew-Rampe, AC-Ecke.
 * - S4.2: Dioden-Vf-Drift ≈ −2 mV/K, IS(T)/BF(T)-Helfer, Depletion-Grading.
 * - S4.3: MOSFET Rds(T), Meyer-Regionen, AC-f3dB mit/ohne TOX.
 * - S4.4: MC-Streuung Halbleiter + Seed-Repro, Worst-Case-Sensitivitäten.
 * - S4.5: Relais Anzug/Abfall, Sicherung Auslösung + Halten + Latch.
 * - S4.6: Trafo rp/DC + Sättigungsknie, TLINE TRAN-Laufzeit + AC-Phase + OP.
 */
import { PARTS } from "@/lib/library/catalog";
import {
  depletionCap,
  meyerCaps,
  mosCoxWL,
  tempScaledBF,
  tempScaledIS,
  type Netlist,
} from "@/lib/sim/engine";
import {
  runAcSweep,
  runMonteCarlo,
  runOperatingPoint,
  runTransient,
  runWorstCase,
} from "@/lib/sim/analyses";

let failed = 0;
function pass(name: string) {
  console.log(`PASS ${name}`);
}
function fail(name: string, detail = "") {
  failed++;
  console.log(`FAIL ${name}${detail ? " — " + detail : ""}`);
}
function expect(cond: boolean, name: string, detail = "") {
  if (cond) pass(name);
  else fail(name, detail);
}
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(Math.abs(b), 1e-12);

/* ---------------- S4.1: OPV transient ---------------- */
{
  // Folger LM741 (A0 2e5, GBW 1 MHz), slew = 0 (reiner Pol; mit SR = 0.5 wäre
  // schon 1 V bei 100 kHz slew-begrenzt: 2π·1e5·1 > 0.5e6 → Dreieck statt Sinus).
  const follower = (freq: number): Netlist => ({
    devices: [
      { id: "V1", type: "V", nodes: ["IN", "0"], params: {}, source: { kind: "sine", amplitude: 1, freq } },
      { id: "U1", type: "OPAMP", nodes: ["IN", "OUT", "OUT"], params: { gain: 2e5, gbw: 1e6, slew: 0, vcc: 15, vee: -15 } },
    ],
  });
  const amp = (freq: number) => {
    const t = runTransient(follower(freq), {}, { stopTime: 30 / freq, stepTime: 1 / freq / 200 }, ["OUT"]);
    const s = t.signals["OUT"] ?? [];
    const tail = s.slice(Math.floor(s.length / 2));
    return (Math.max(...tail) - Math.min(...tail)) / 2;
  };
  expect(close(amp(100e3), 0.995, 0.03), "S4.1 Folger 100 kHz ≈ 0.995");
  expect(close(amp(3e6), 0.316, 0.06), "S4.1 Folger 3 MHz ≈ 0.316");
  // Slew-Rampe per Fit (Einzelwert = Newton-Jitter, s. Audit §45.3).
  // Kante bei 10 µs (PWL; Pulse-Semantik: offset=low, amplitude=high absolut).
  const ramp: Netlist = {
    devices: [
      { id: "V1", type: "V", nodes: ["IN", "0"], params: {}, source: { kind: "pwl", pwl: [[0, -5], [10e-6, -5], [10.01e-6, 5]] } },
      { id: "U1", type: "OPAMP", nodes: ["IN", "OUT", "OUT"], params: { gain: 2e5, gbw: 10e6, slew: 0.5e6, vcc: 15, vee: -15 } },
    ],
  };
  const tr = runTransient(ramp, {}, { stopTime: 40e-6, stepTime: 1e-7 }, ["OUT"]);
  const ts = tr.time;
  const ss = tr.signals["OUT"] ?? [];
  let k0 = -1;
  for (let k = 0; k < ss.length; k++) if (ts[k] > 10e-6 && ss[k] > -4) { k0 = k; break; }
  const k1 = Math.min(k0 + 100, ss.length - 1);
  const sr = (ss[k1] - ss[k0]) / (ts[k1] - ts[k0]) / 1e6;
  expect(close(sr, 0.5, 0.1), "S4.1 Slew-Rampe ≈ 0.5 V/µs", `${sr.toFixed(3)} V/µs`);
  // AC-Ecke bei GBW (0 dB DC, −3 dB bei 1 MHz).
  const acNl: Netlist = {
    devices: [
      { id: "V1", type: "V", nodes: ["IN", "0"], params: { acMag: 1 }, source: { kind: "dc", dc: 0, acMag: 1 } },
      { id: "U1", type: "OPAMP", nodes: ["IN", "OUT", "OUT"], params: { gain: 2e5, gbw: 1e6, slew: 0.5e6, vcc: 15, vee: -15 } },
    ],
  };
  const ac = runAcSweep(acNl, {}, { start: 10, stop: 10e6, points: 80, type: "dec" }, ["OUT"]);
  let f3 = 0;
  for (let k = 0; k < ac.freq.length; k++) {
    if ((ac.mag["OUT"][k] ?? 1) < 1 / Math.SQRT2) { f3 = ac.freq[k]; break; }
  }
  expect(close(f3, 1e6, 0.15), "S4.1 AC-Ecke ≈ 1 MHz", `${f3.toExponential(2)} Hz`);
}

/* ---------------- S4.2: D/Q-Temperatur + Sperrschichten ---------------- */
{
  const dNl: Netlist = {
    devices: [
      { id: "I1", type: "I", nodes: ["0", "A"], params: { dc: 1e-3 }, source: { kind: "dc", dc: 1e-3 } },
      { id: "D1", type: "D", nodes: ["A", "0"], params: { is: 2.52e-9, n: 1.75, rs: 0.1 } },
    ],
  };
  const v27 = runOperatingPoint(dNl, { temperature: 27 }).nodes["A"];
  const v77 = runOperatingPoint(dNl, { temperature: 77 }).nodes["A"];
  const drift = ((v77 - v27) / 50) * 1000;
  expect(close(drift, -2, 0.15), "S4.2 Dioden-Drift ≈ −2 mV/K", `${drift.toFixed(2)} mV/K`);
  expect(close(tempScaledBF(200, 77, 27, 1.5), 252, 0.01), "S4.2 BF(T) XTB=1.5");
  expect(close(tempScaledIS(1e-14, 77, 27, 3, 1.11, 1.75) / tempScaledIS(1e-14, 27, 27, 3, 1.11, 1.75), 43, 0.1), "S4.2 IS(T) /N ≈ 43×");
  const cj0 = depletionCap(4e-12, 0, 1, 0.5, 0.5);
  const cjF = depletionCap(4e-12, 0.7, 1, 0.5, 0.5);
  // 0.7 V > FC·VJ → FC-Linearisierung (SPICE), nicht Potenzgesetz (1.83×).
  expect(close(cjF / cj0, 1.697, 0.01), "S4.2 Depletion-Grading 1.697×");
  expect(depletionCap(4e-12, 0.7, 1, 0, 0.5) === 4e-12, "S4.2 MJ=0 → fix");
  // BJT Ende-zu-Ende: Ic steigt mit T (BF-Temp + Vbe-Drift).
  const qNl = (): Netlist => ({
    devices: [
      { id: "VCC", type: "V", nodes: ["VCC", "0"], params: {}, source: { kind: "dc", dc: 5 } },
      { id: "RB", type: "R", nodes: ["VCC", "B"], params: { r: 470e3 } },
      { id: "RC", type: "R", nodes: ["VCC", "C"], params: { r: 1e3 } },
      { id: "Q1", type: "Q", nodes: ["C", "B", "0"], params: { bf: 200, is: 1e-15, xtb: 1.5 } },
    ],
  });
  const ic = (t: number) => (5 - runOperatingPoint(qNl(), { temperature: t }).nodes["C"]) / 1e3;
  expect(close(ic(77) / ic(27), 1.29, 0.08), "S4.2 NPN Ic(77)/Ic(27) ≈ 1.29");
}

/* ---------------- S4.3: MOSFET-Temperatur + Meyer ---------------- */
{
  const mNl = (): Netlist => ({
    devices: [
      { id: "VG", type: "V", nodes: ["G", "0"], params: {}, source: { kind: "dc", dc: 10 } },
      { id: "VD", type: "V", nodes: ["D", "0"], params: {}, source: { kind: "dc", dc: 0.5 } },
      { id: "M1", type: "M", nodes: ["D", "G", "0"], params: { vto: 3, kp: 0.5, w: 1e-3, l: 1e-5, tcv: 2.5e-3, bex: 1.5 } },
    ],
  });
  const i27 = runOperatingPoint(mNl(), { temperature: 27 }).currents["I(M1)"];
  const i125 = runOperatingPoint(mNl(), { temperature: 125 }).currents["I(M1)"];
  expect(close(i27 / i125, 1.47, 0.08), "S4.3 Rds(125)/Rds(27) ≈ 1.47");
  expect(JSON.stringify(meyerCaps(3e-12, -1, 5, false)) === JSON.stringify([0, 0]), "S4.3 Meyer Cutoff");
  expect(JSON.stringify(meyerCaps(3e-12, 2, 1, false)) === JSON.stringify([1.5e-12, 1.5e-12]), "S4.3 Meyer linear");
  expect(JSON.stringify(meyerCaps(3e-12, 2, 5, false)) === JSON.stringify([2e-12, 0]), "S4.3 Meyer Sättigung");
  expect(close(mosCoxWL(1e-3, 1e-5, 1e-7), 3.45e-12, 0.01), "S4.3 Cox·W·L");
  const mAc = (tox: number): Netlist => ({
    devices: [
      { id: "VS", type: "V", nodes: ["S", "0"], params: { acMag: 1 }, source: { kind: "dc", dc: 5, acMag: 1 } },
      { id: "RG", type: "R", nodes: ["S", "G"], params: { r: 1e3 } },
      { id: "VD", type: "V", nodes: ["D", "0"], params: {}, source: { kind: "dc", dc: 5 } },
      { id: "M1", type: "M", nodes: ["D", "G", "0"], params: { vto: 2, kp: 0.05, w: 1e-3, l: 1e-5, cgs: 5e-12, cgd: 2e-12, tox } },
    ],
  });
  const f3db = (tox: number) => {
    const a = runAcSweep(mAc(tox), {}, { start: 1e6, stop: 1e8, points: 60, type: "dec" }, ["G"]);
    for (let k = 0; k < a.freq.length; k++) if ((a.mag["G"][k] ?? 1) < 1 / Math.SQRT2) return a.freq[k];
    return 0;
  };
  expect(close(f3db(0), 22.7e6, 0.08), "S4.3 AC-f3dB ohne TOX ≈ 22.7 MHz");
  expect(close(f3db(1e-7), 17.1e6, 0.08), "S4.3 AC-f3dB mit TOX ≈ 17.1 MHz");
}

/* ---------------- S4.4: MC/Worst-Case Halbleiter ---------------- */
{
  const mcNl = (): Netlist => ({
    devices: [
      { id: "VCC", type: "V", nodes: ["VCC", "0"], params: {}, source: { kind: "dc", dc: 5 } },
      { id: "RB", type: "R", nodes: ["VCC", "B"], params: { r: 470e3 } },
      { id: "RC", type: "R", nodes: ["VCC", "C"], params: { r: 1e3 } },
      { id: "Q1", type: "Q", nodes: ["C", "B", "0"], params: { bf: 200, is: 1e-15, tol: 10 } },
    ],
  });
  const mcOpt = { runs: 60, tolerance: 10, measure: "vout-dc" as const, outNode: "C", seed: 7 };
  const tran = { stopTime: 1e-3, stepTime: 1e-5 };
  const mc = runMonteCarlo(mcNl(), {}, mcOpt, tran);
  expect(mc.sigma > 0.02 && mc.sigma < 0.3, "S4.4 MC-σ im Fenster", `σ=${mc.sigma.toFixed(4)}`);
  const mc2 = runMonteCarlo(mcNl(), {}, mcOpt, tran);
  expect(JSON.stringify(mc.samples) === JSON.stringify(mc2.samples), "S4.4 Seed-Repro");
  const wc = runWorstCase(mcNl(), {}, mcOpt, tran);
  expect(wc.low < wc.nominal && wc.nominal < wc.high, "S4.4 WC-Ecken um Nominal");
  expect(wc.sensitivities.some((s) => s.id === "Q1" && s.param === "bf+is"), "S4.4 WC listet Q1 bf+is");
  const dMc: Netlist = {
    devices: [
      { id: "I1", type: "I", nodes: ["0", "A"], params: { dc: 1e-3 }, source: { kind: "dc", dc: 1e-3 } },
      { id: "D1", type: "D", nodes: ["A", "0"], params: { is: 2.52e-9, n: 1.75, tol: 20 } },
    ],
  };
  const mcd = runMonteCarlo(dMc, {}, { runs: 60, tolerance: 20, measure: "vout-dc" as const, outNode: "A", seed: 3 }, tran);
  expect(close(mcd.sigma * 1000, 2.6, 0.35), "S4.4 MC-Diode σ ≈ 2.6 mV", `${(mcd.sigma * 1000).toFixed(2)} mV`);
}

/* ---------------- S4.5: Relais + Sicherung ---------------- */
{
  const relay = PARTS.find((p) => p.id === "relay")!;
  const rdev = relay.toDevices({ id: "K1", params: {} } as never, ["CP", "CM", "COM", "NO", "NC"]); // S5.26: Relais ist echter Wechsler (5 Pins)
  const rNl: Netlist = {
    devices: [
      ...rdev,
      { id: "VC", type: "V", nodes: ["CP", "0"], params: {}, source: { kind: "pwl", pwl: [[0, 0], [0.01, 6], [0.02, 0]] } },
      { id: "RCM", type: "R", nodes: ["CM", "0"], params: { r: 1e-3 } },
      { id: "V5", type: "V", nodes: ["V5", "0"], params: {}, source: { kind: "dc", dc: 5 } },
      { id: "RP", type: "R", nodes: ["V5", "COM"], params: { r: 1e3 } },
      { id: "RN", type: "R", nodes: ["NO", "0"], params: { r: 1e-3 } },
    ],
  };
  const rt = runTransient(rNl, {}, { stopTime: 0.02, stepTime: 1e-5 }, ["CP", "COM"]);
  let vClose = -1;
  let vOpen = -1;
  let wasClosed = false;
  for (let k = 0; k < rt.time.length; k++) {
    const closed = (rt.signals["COM"][k] ?? 5) < 2.5;
    if (closed && !wasClosed) { vClose = rt.signals["CP"][k]; wasClosed = true; }
    if (!closed && wasClosed) { vOpen = rt.signals["CP"][k]; break; }
  }
  expect(close(vClose, 4, 0.03), "S4.5 Relais-Anzug ≈ 4 V", `${vClose.toFixed(2)} V`);
  expect(close(vOpen, 2, 0.05), "S4.5 Relais-Abfall ≈ 2 V", `${vOpen.toFixed(2)} V`);
  const fNl = (vsrc: number, rser: number, stop: number): Netlist => ({
    devices: [
      { id: "V1", type: "V", nodes: ["S", "0"], params: {}, source: { kind: "dc", dc: vsrc } },
      { id: "R1", type: "R", nodes: ["S", "A"], params: { r: rser } },
      { id: "F1", type: "FUSE", nodes: ["A", "0"], params: { r: 0.05, irated: 1 } },
    ],
  });
  const blow = (vsrc: number, rser: number, stop: number) => {
    const t = runTransient(fNl(vsrc, rser, stop), {}, { stopTime: stop, stepTime: stop / 2000 }, ["A"]);
    for (let k = 0; k < t.time.length; k++) if ((t.signals["A"][k] ?? 0) > vsrc * 0.5) return t.time[k];
    return -1;
  };
  expect(close(blow(10, 1, 0.2), 0.045, 0.1), "S4.5 Fuse-Trip ≈ 45 ms bei 9.5 A");
  expect(blow(1, 1, 2) < 0, "S4.5 Fuse hält bei Nennstrom");
}

/* ---------------- S4.6: Trafo + TLINE ---------------- */
{
  const tDc: Netlist = {
    devices: [
      { id: "V1", type: "V", nodes: ["P", "0"], params: {}, source: { kind: "dc", dc: 2 } },
      { id: "T1", type: "TRANSFORMER", nodes: ["P", "0", "S", "0"], params: { ratio: 10, lp: 10, rp: 2, rs: 0.1 } },
    ],
  };
  expect(close(runOperatingPoint(tDc, {}).currents["I(V1)"], -1, 0.001), "S4.6 Trafo-DC rp wirkt");
  const tSat: Netlist = {
    devices: [
      { id: "I1", type: "I", nodes: ["0", "P"], params: {}, source: { kind: "pwl", pwl: [[0, 0], [0.01, 10]] } },
      { id: "T1", type: "TRANSFORMER", nodes: ["P", "0", "S", "0"], params: { ratio: 1, lp: 1, k: 0.999, isat: 2 } },
      { id: "RL", type: "R", nodes: ["S", "0"], params: { r: 1e6 } },
    ],
  };
  const st = runTransient(tSat, {}, { stopTime: 0.01, stepTime: 1e-5 }, ["P"]);
  const vv = (t: number) => st.signals["P"][Math.round(t / 1e-5)] ?? NaN;
  expect(close(vv(0.001) / vv(0.009), 3.667, 0.03), "S4.6 Sättigungsknie 3.67×");
  const tTl: Netlist = {
    devices: [
      { id: "V1", type: "V", nodes: ["S", "0"], params: {}, source: { kind: "pulse", dc: 0, amplitude: 2, period: 10e-6, width: 9e-6, rise: 1e-9, fall: 1e-9 } },
      { id: "RS", type: "R", nodes: ["S", "I"], params: { r: 50 } },
      { id: "T1", type: "TLINE", nodes: ["I", "0", "O", "0"], params: { z0: 50, td: 1e-6 } },
      { id: "RL", type: "R", nodes: ["O", "0"], params: { r: 50 } },
    ],
  };
  const lt = runTransient(tTl, {}, { stopTime: 5e-6, stepTime: 1e-8 }, ["O"]);
  let tArr = -1;
  for (let k = 0; k < lt.time.length; k++) if ((lt.signals["O"][k] ?? 0) > 0.25) { tArr = lt.time[k]; break; }
  expect(close(tArr, 1e-6, 0.05), "S4.6 TLINE-Laufzeit 1 µs", `${(tArr * 1e6).toFixed(2)} µs`);
  const tAc: Netlist = {
    devices: [
      { id: "V1", type: "V", nodes: ["I", "0"], params: { acMag: 1 }, source: { kind: "dc", dc: 0, acMag: 1 } },
      { id: "T1", type: "TLINE", nodes: ["I", "0", "O", "0"], params: { z0: 50, td: 1e-6 } },
      { id: "RL", type: "R", nodes: ["O", "0"], params: { r: 50 } },
    ],
  };
  const la = runAcSweep(tAc, {}, { start: 125e3, stop: 125e3, points: 1, type: "lin" }, ["O"]);
  expect(close(la.mag["O"][0] ?? 0, 1, 0.01), "S4.6 TLINE-AC |H|=1 angepasst");
  expect(close(la.phase["O"][0] ?? 0, -45, 0.02), "S4.6 TLINE-AC Phase −45°");
  const tOp: Netlist = {
    devices: [
      { id: "V1", type: "V", nodes: ["I", "0"], params: {}, source: { kind: "dc", dc: 3 } },
      { id: "T1", type: "TLINE", nodes: ["I", "0", "O", "0"], params: { z0: 50, td: 1e-6 } },
      { id: "RL", type: "R", nodes: ["O", "0"], params: { r: 1e3 } },
    ],
  };
  expect(close(runOperatingPoint(tOp, {}).nodes["O"], 3, 0.001), "S4.6 TLINE-OP durchverbunden");
}

if (failed) {
  console.log(`\nSprint-4-Prüfungen: ${failed} FEHLSCHLÄGE.`);
  process.exit(1);
}
console.log("\nSprint-4-Prüfungen: alle bestanden.");
