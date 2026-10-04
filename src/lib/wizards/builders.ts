import { emptyDoc, type SchematicDoc } from "../schematic/model";
import { normalizeDocGeometry } from "../schematic/netdraw";
import { presetById } from "../schematic/tools";
import { makeInst, makeWire, nid } from "./shared";
import type { WizardKind, WizardParams } from "./types";

/** S5.6: Schaltungs-Builder — rein, aus WizardsDialog umgezogen. */
export function buildWizard(kind: WizardKind, params: WizardParams): SchematicDoc {
  let doc: SchematicDoc;


if (kind === "voltage_divider") {
  doc = emptyDoc("Spannungsteiler");
  const r1 = Math.max(1, params.r1);
  const r2 = Math.max(1, params.r2);
  doc.instances.push(
    makeInst("vdc", "V1", 200, 300, { dc: params.vin }),
    makeInst("resistor", "R1", 360, 240, { r: r1 }, 90),
    makeInst("resistor", "R2", 360, 360, { r: r2 }, 90),
    makeInst("gnd", "GND1", 200, 420),
    makeInst("gnd", "GND2", 360, 420),
  );
  doc.wires.push(
    makeWire(200, 270, 200, 190, 360, 190, 360, 210),
    makeWire(360, 270, 360, 330),
    makeWire(200, 330, 200, 400),
    makeWire(360, 390, 360, 400),
  );
  doc.labels.push(
    { id: nid("l"), x: 200, y: 190, name: "IN" },
    { id: nid("l"), x: 360, y: 300, name: "OUT" },
  );
} else if (kind === "rc_lowpass") {
  const fc = Math.max(1, params.fc);
  const cVal = Math.max(1e-12, params.c);
  const rVal = Math.max(1, Math.round(1 / (2 * Math.PI * fc * cVal)));
  doc = presetById("rc-lowpass")!.build();
  doc.name = "RC-Tiefpass";
  for (const i of doc.instances) {
    if (i.label === "R1") i.params.r = rVal;
    if (i.label === "C1") i.params.c = cVal;
    if (i.label === "V1") i.params.freq = fc;
  }
} else if (kind === "rc_highpass") {
  const fc = Math.max(1, params.fc);
  const cVal = Math.max(1e-12, params.c);
  const rVal = Math.max(1, Math.round(1 / (2 * Math.PI * fc * cVal)));
  doc = emptyDoc("RC-Hochpass");
  doc.instances.push(
    makeInst("vac", "V1", 200, 300, { amplitude: 1, freq: fc, acMag: 1 }),
    makeInst("capacitor", "C1", 320, 240, { c: cVal }),
    makeInst("resistor", "R1", 420, 300, { r: rVal }, 90),
    makeInst("gnd", "GND1", 200, 400),
    makeInst("gnd", "GND2", 420, 400),
  );
  doc.wires.push(
    makeWire(200, 270, 200, 240, 290, 240),
    makeWire(350, 240, 420, 240, 420, 270),
    makeWire(200, 330, 200, 380),
    makeWire(420, 330, 420, 380),
  );
  doc.labels.push(
    { id: nid("l"), x: 200, y: 240, name: "IN" },
    { id: nid("l"), x: 420, y: 240, name: "OUT" },
  );
} else if (kind === "rl_lowpass") {
  const fc = Math.max(1, params.fc);
  const lVal = Math.max(1e-9, params.l);
  const rVal = Math.max(1, Math.round(2 * Math.PI * fc * lVal));
  doc = emptyDoc("RL-Tiefpass");
  doc.instances.push(
    makeInst("vac", "V1", 200, 300, { amplitude: 1, freq: fc, acMag: 1 }),
    makeInst("inductor", "L1", 320, 240, { l: lVal }),
    makeInst("resistor", "R1", 420, 300, { r: rVal }, 90),
    makeInst("gnd", "GND1", 200, 400),
    makeInst("gnd", "GND2", 420, 400),
  );
  doc.wires.push(
    makeWire(200, 270, 200, 240, 290, 240),
    makeWire(350, 240, 420, 240, 420, 270),
    makeWire(200, 330, 200, 380),
    makeWire(420, 330, 420, 380),
  );
  doc.labels.push(
    { id: nid("l"), x: 200, y: 240, name: "IN" },
    { id: nid("l"), x: 420, y: 240, name: "OUT" },
  );
} else if (kind === "rlc_bandpass") {
  const f0 = Math.max(1, params.fc);
  const lVal = Math.max(1e-9, params.l);
  const cVal = 1 / (Math.pow(2 * Math.PI * f0, 2) * lVal);
  const rVal = Math.max(1, params.r1);
  doc = emptyDoc("RLC-Bandpass");
  doc.instances.push(
    makeInst("vac", "V1", 180, 300, { amplitude: 1, freq: f0, acMag: 1 }),
    makeInst("inductor", "L1", 290, 240, { l: lVal }),
    makeInst("capacitor", "C1", 400, 240, { c: cVal }),
    makeInst("resistor", "R1", 500, 300, { r: rVal }, 90),
    makeInst("gnd", "GND1", 180, 400),
    makeInst("gnd", "GND2", 500, 400),
  );
  doc.wires.push(
    makeWire(180, 270, 180, 240, 260, 240),
    makeWire(320, 240, 370, 240),
    makeWire(430, 240, 500, 240, 500, 270),
    makeWire(180, 330, 180, 380),
    makeWire(500, 330, 500, 380),
  );
  doc.labels.push(
    { id: nid("l"), x: 180, y: 240, name: "IN" },
    { id: nid("l"), x: 500, y: 240, name: "OUT" },
  );
} else if (kind === "opamp_noninverter") {
  const av = Math.max(1.1, params.gain);
  const rg = Math.max(100, params.r1);
  const rf = Math.round(rg * (av - 1));
  doc = presetById("noninv-opamp")!.build();
  doc.name = "Nichtinvertierender Verstärker";
  for (const i of doc.instances) {
    if (i.label === "RG") i.params.r = rg;
    if (i.label === "RF") i.params.r = rf;
  }
} else if (kind === "opamp_inverter") {
  const av = Math.max(0.1, params.gain);
  const rin = Math.max(100, params.r1);
  const rf = Math.round(rin * av);
  doc = presetById("noninv-opamp")!.build();
  doc.name = "Invertierender Verstärker";
  for (const i of doc.instances) {
    if (i.label === "RG") i.params.r = rin;
    if (i.label === "RF") i.params.r = rf;
  }
} else if (kind === "opamp_follower") {
  doc = presetById("noninv-opamp")!.build();
  doc.name = "Impedanzwandler";
  for (const i of doc.instances) {
    if (i.label === "RG") i.params.r = 1e7;
    if (i.label === "RF") i.params.r = 1;
    if (i.label === "V1") i.params.freq = Math.max(1, params.freq);
  }
} else if (kind === "555_astable") {
  const f = Math.max(0.5, params.freq);
  const cVal = Math.max(1e-10, params.c);
  const rTotal = 1.44 / (f * cVal);
  const r2 = Math.max(100, Math.round(rTotal * 0.4));
  const r1 = Math.max(100, Math.round(rTotal - 2 * r2));
  doc = presetById("astable555")!.build();
  doc.name = "NE555 Taktgeber";
  for (const i of doc.instances) {
    if (i.label === "R1") i.params.r = r1;
    if (i.label === "R2") i.params.r = r2;
    if (i.label === "C1") i.params.c = cVal;
  }
} else if (kind === "bjt_ce") {
  const rc = Math.max(100, params.r1);
  const re = Math.max(10, params.r2);
  doc = presetById("ce-amp")!.build();
  doc.name = "NPN-Emitterverstärker";
  for (const i of doc.instances) {
    if (i.label === "RC") i.params.r = rc;
    if (i.label === "RE") i.params.r = re;
  }
} else if (kind === "halfwave") {
  doc = presetById("halfwave")!.build();
  doc.name = "Einweg-Gleichrichter";
  for (const i of doc.instances) {
    if (i.label === "V1") {
      i.params.amplitude = params.vin;
      i.params.freq = params.freq;
    }
    if (i.label === "RL") i.params.r = Math.max(10, params.r1);
  }
} else {
  doc = presetById("buck")!.build();
  doc.name = "Abwärtswandler (Buck)";
  for (const i of doc.instances) {
    if (i.label === "VIN") i.params.dc = params.vin;
    if (i.label === "VG") i.params.duty = Math.max(5, Math.min(95, params.duty));
  }
}


  normalizeDocGeometry(doc);
  return doc;
}
