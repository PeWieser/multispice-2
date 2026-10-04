import { Netlist } from "../src/lib/sim/engine";
import { runTransient, runAcSweep } from "../src/lib/sim/analyses";
function follower(slew: number): Netlist {
  return { devices: [
    { id: "V1", type: "V", nodes: ["IN", "0"], params: {}, source: { kind: "sine", amplitude: 1, freq: 100000, acMag: 1 } },
    { id: "U1", type: "OPAMP", nodes: ["IN", "OUT", "OUT"], params: { gain: 2e5, gbw: 1e6, slew, rout: 75, rin: 2e6, vcc: 15, vee: -15, vdrop: 1.2 } },
    { id: "R1", type: "R", nodes: ["OUT", "0"], params: { r: 1e6 } },
  ]};
}
for (const f of [100000, 3000000]) {
  const nl = follower(1e12);
  (nl.devices[0].source as {freq: number}).freq = f;
  const dt = 1 / f / 40;
  const tr = runTransient(nl, {}, { stopTime: 8 / f, stepTime: dt }, ["OUT"]);
  const s = tr.signals.OUT.slice(-80);
  const amp = (Math.max(...s) - Math.min(...s)) / 2;
  console.log(`f=${f}Hz ok=${tr.ok} amp=${amp.toFixed(3)} (erwartet ~${f < 1e6 ? 1 : 0.3})`);
}
const nl = follower(0.5e6);
nl.devices[0] = { id: "V1", type: "V", nodes: ["IN", "0"], params: {}, source: { kind: "pulse", offset: -5, amplitude: 5, period: 40e-6, width: 20e-6, rise: 1e-9, fall: 1e-9 } };
const tr = runTransient(nl, {}, { stopTime: 25e-6, stepTime: 5e-8 }, ["OUT", "IN"]);
let maxSlope = 0;
for (let i = 1; i < tr.time.length; i++) {
  const sl = Math.abs((tr.signals.OUT[i] - tr.signals.OUT[i-1]) / (tr.time[i] - tr.time[i-1]));
  if (sl > maxSlope) maxSlope = sl;
}
console.log(`slew ok=${tr.ok} maxSlope=${(maxSlope/1e6).toFixed(3)} V/us (erwartet <=0.55) final=${tr.signals.OUT.at(-1)?.toFixed(2)}`);
const ac = runAcSweep(follower(0.5e6), {}, { start: 1e4, stop: 1e7, points: 40, type: "dec" }, ["OUT"]);
const mags = ac.magDb.OUT;
const i3 = mags.findIndex((m) => m < -3);
console.log(`AC f_-3dB ~ ${ac.freq[i3]?.toExponential(2)} Hz (erwartet ~1e6), DC=${mags[0].toFixed(3)}dB`);
