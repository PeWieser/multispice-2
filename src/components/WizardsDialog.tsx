"use client";

import { useState } from "react";
import { Dialog } from "./ui";
import { useEditor } from "@/state/editor";
import { Instance, SchematicDoc, emptyDoc } from "@/lib/schematic/model";
import { normalizeDocGeometry } from "@/lib/schematic/netdraw";
import { presetById } from "@/lib/schematic/tools";
import { formatValue } from "@/lib/library/catalog";

type WizardKind =
  | "voltage_divider"
  | "rc_lowpass"
  | "rc_highpass"
  | "rl_lowpass"
  | "rlc_bandpass"
  | "opamp_noninverter"
  | "opamp_inverter"
  | "opamp_follower"
  | "555_astable"
  | "bjt_ce"
  | "halfwave"
  | "buck_converter";

interface WizardEntry {
  id: WizardKind;
  title: string;
  group: string;
  formula: string;
}

const WIZARDS: WizardEntry[] = [
  { id: "voltage_divider", title: "Spannungsteiler", group: "Passiv & Filter", formula: "U_aus = U_ein · R2 / (R1 + R2)" },
  { id: "rc_lowpass", title: "RC-Tiefpass 1. Ordnung", group: "Passiv & Filter", formula: "f_c = 1 / (2π · R1 · C1)" },
  { id: "rc_highpass", title: "RC-Hochpass 1. Ordnung", group: "Passiv & Filter", formula: "f_c = 1 / (2π · R1 · C1)" },
  { id: "rl_lowpass", title: "RL-Tiefpass 1. Ordnung", group: "Passiv & Filter", formula: "f_c = R1 / (2π · L1)" },
  { id: "rlc_bandpass", title: "RLC-Serienschwingkreis", group: "Passiv & Filter", formula: "f_0 = 1 / (2π · √(L1 · C1))" },
  { id: "opamp_noninverter", title: "Nichtinvertierender Verstärker", group: "Operationsverstärker", formula: "A_v = 1 + RF / RG" },
  { id: "opamp_inverter", title: "Invertierender Verstärker", group: "Operationsverstärker", formula: "A_v = −RF / RIN" },
  { id: "opamp_follower", title: "Impedanzwandler (Spannungsfolger)", group: "Operationsverstärker", formula: "A_v = 1" },
  { id: "555_astable", title: "NE555 Astabiler Taktgeber", group: "Grundschaltungen", formula: "f ≈ 1,44 / ((R1 + 2·R2) · C1)" },
  { id: "bjt_ce", title: "NPN-Emitterverstärker", group: "Grundschaltungen", formula: "A_u ≈ −RC / RE" },
  { id: "halfwave", title: "Einweg-Gleichrichter", group: "Grundschaltungen", formula: "U_dc ≈ U_s − 0,7 V" },
  { id: "buck_converter", title: "Abwärtswandler (Buck)", group: "Grundschaltungen", formula: "U_aus ≈ D · U_ein" },
];

let uidSeq = 0;
function nid(prefix: string): string {
  uidSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidSeq.toString(36)}`;
}

function makeInst(
  partId: string,
  label: string,
  x: number,
  y: number,
  params: Record<string, number | string | boolean> = {},
  rot: 0 | 90 | 180 | 270 = 0,
): Instance {
  return { id: nid("i"), partId, label, x, y, rot, params };
}

function makeWire(...pts: number[]): SchematicDoc["wires"][number] {
  const points = [];
  for (let i = 0; i < pts.length; i += 2) {
    points.push({ x: pts[i], y: pts[i + 1] });
  }
  return { id: nid("w"), points };
}

export default function WizardsDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<WizardKind>("voltage_divider");
  const [params, setParams] = useState({
    vin: 5,
    freq: 1000,
    fc: 1000,
    gain: 10,
    r1: 10000,
    r2: 10000,
    c: 1e-7,
    l: 1e-3,
    duty: 50,
  });

  const active = WIZARDS.find((w) => w.id === kind) ?? WIZARDS[0];
  const groups = Array.from(new Set(WIZARDS.map((w) => w.group)));

  // Berechnete Kennwerte für die Vorschau
  const calc = (() => {
    if (kind === "voltage_divider") {
      const r1 = Math.max(1, params.r1);
      const r2 = Math.max(1, params.r2);
      const vout = (params.vin * r2) / (r1 + r2);
      return [
        ["R1", `${formatValue(r1)}Ω`],
        ["R2", `${formatValue(r2)}Ω`],
        ["U_ein", `${params.vin} V`],
        ["U_aus", `${vout.toFixed(3)} V`],
      ];
    }
    if (kind === "rc_lowpass" || kind === "rc_highpass") {
      const fc = Math.max(1, params.fc);
      const c = Math.max(1e-12, params.c);
      const r = Math.max(1, Math.round(1 / (2 * Math.PI * fc * c)));
      return [
        ["Grenzfrequenz f_c", `${formatValue(fc)}Hz`],
        ["Berechneter R1", `${formatValue(r)}Ω`],
        ["Kondensator C1", `${formatValue(c)}F`],
      ];
    }
    if (kind === "rl_lowpass") {
      const fc = Math.max(1, params.fc);
      const l = Math.max(1e-9, params.l);
      const r = Math.max(1, Math.round(2 * Math.PI * fc * l));
      return [
        ["Grenzfrequenz f_c", `${formatValue(fc)}Hz`],
        ["Berechneter R1", `${formatValue(r)}Ω`],
        ["Induktivität L1", `${formatValue(l)}H`],
      ];
    }
    if (kind === "rlc_bandpass") {
      const f0 = Math.max(1, params.fc);
      const l = Math.max(1e-9, params.l);
      const c = 1 / (Math.pow(2 * Math.PI * f0, 2) * l);
      return [
        ["Resonanzfrequenz f_0", `${formatValue(f0)}Hz`],
        ["Induktivität L1", `${formatValue(l)}H`],
        ["Berechneter C1", `${formatValue(c)}F`],
        ["Dämpfung R1", `${formatValue(params.r1)}Ω`],
      ];
    }
    if (kind === "opamp_noninverter") {
      const av = Math.max(1.1, params.gain);
      const rg = Math.max(100, params.r1);
      const rf = Math.round(rg * (av - 1));
      return [
        ["Verstärkung A_v", `${av.toFixed(2)}×`],
        ["RG", `${formatValue(rg)}Ω`],
        ["Berechneter RF", `${formatValue(rf)}Ω`],
      ];
    }
    if (kind === "opamp_inverter") {
      const av = Math.max(0.1, params.gain);
      const rin = Math.max(100, params.r1);
      const rf = Math.round(rin * av);
      return [
        ["Verstärkung A_v", `−${av.toFixed(2)}×`],
        ["RIN", `${formatValue(rin)}Ω`],
        ["Berechneter RF", `${formatValue(rf)}Ω`],
      ];
    }
    if (kind === "opamp_follower") {
      return [
        ["Verstärkung A_v", "1,00× (0 dB)"],
        ["Eingangsfrequenz", `${formatValue(params.freq)}Hz`],
      ];
    }
    if (kind === "555_astable") {
      const f = Math.max(0.5, params.freq);
      const c = Math.max(1e-10, params.c);
      const rTotal = 1.44 / (f * c);
      const r2 = Math.max(100, Math.round(rTotal * 0.4));
      const r1 = Math.max(100, Math.round(rTotal - 2 * r2));
      return [
        ["Zielfrequenz f", `${formatValue(f)}Hz`],
        ["Berechneter R1", `${formatValue(r1)}Ω`],
        ["Berechneter R2", `${formatValue(r2)}Ω`],
        ["Kondensator C1", `${formatValue(c)}F`],
      ];
    }
    if (kind === "bjt_ce") {
      const rc = Math.max(100, params.r1);
      const re = Math.max(10, params.r2);
      return [
        ["Kollektorwiderstand RC", `${formatValue(rc)}Ω`],
        ["Emitterwiderstand RE", `${formatValue(re)}Ω`],
        ["Spannungsverstärkung", `≈ −${(rc / re).toFixed(1)}×`],
      ];
    }
    if (kind === "halfwave") {
      return [
        ["Eingangsspannung", `${params.vin} V`],
        ["Netzfrequenz", `${formatValue(params.freq)}Hz`],
        ["Lastwiderstand RL", `${formatValue(params.r1)}Ω`],
      ];
    }
    return [
      ["Eingangsspannung", `${params.vin} V`],
      ["Tastgrad D", `${params.duty} %`],
      ["Ausgangsspannung", `≈ ${((params.vin * params.duty) / 100).toFixed(1)} V`],
    ];
  })();

  const build = () => {
    const editor = useEditor.getState();
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
    editor.setDoc(doc);
    editor.fitView();
    editor.log("ok", `${doc.name} erstellt`);
    onClose();
  };

  return (
    <Dialog
      title="Schaltungs-Assistent"
      subtitle="Dimensionierung und Erzeugung parametrierter Grundschaltungen"
      onClose={onClose}
      wide
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={build}>
            Schaltung erzeugen
          </button>
        </>
      }
    >
      <div className="flex gap-4">
        <div className="w-[210px] shrink-0 space-y-3">
          {groups.map((grp) => (
            <div key={grp} className="space-y-0.5">
              <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wider text-mute">
                {grp}
              </div>
              {WIZARDS.filter((w) => w.group === grp).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className="tab flex w-full items-center px-2.5 py-1.5 text-left text-[12px]"
                  data-active={kind === w.id}
                  onClick={() => setKind(w.id)}
                >
                  <span className="truncate font-medium">{w.title}</span>
                </button>
              ))}
            </div>
          ))}
        </div>

        <div
          className="flex flex-1 flex-col justify-between rounded-lg p-4"
          style={{ background: "var(--surface-2)", border: "1px solid var(--hairline)" }}
        >
          <div className="space-y-4">
            <div className="flex items-baseline justify-between border-b pb-2.5" style={{ borderColor: "var(--hairline)" }}>
              <div className="text-[13px] font-semibold">{active.title}</div>
              <div className="mono rounded px-2 py-0.5 text-[11px]" style={{ background: "var(--surface)", border: "1px solid var(--hairline)", color: "var(--ink-2)" }}>
                {active.formula}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(kind === "voltage_divider" || kind === "halfwave" || kind === "buck_converter") && (
                <label className="space-y-1 text-[11px] text-dim">
                  <span>Eingangsspannung U_ein (V)</span>
                  <input
                    className="input mono"
                    type="number"
                    value={params.vin}
                    onChange={(e) => setParams({ ...params, vin: Number(e.target.value) })}
                  />
                </label>
              )}

              {(kind === "555_astable" || kind === "opamp_follower" || kind === "halfwave") && (
                <label className="space-y-1 text-[11px] text-dim">
                  <span>Frequenz f (Hz)</span>
                  <input
                    className="input mono"
                    type="number"
                    value={params.freq}
                    onChange={(e) => setParams({ ...params, freq: Number(e.target.value) })}
                  />
                </label>
              )}

              {(kind === "rc_lowpass" || kind === "rc_highpass" || kind === "rl_lowpass" || kind === "rlc_bandpass") && (
                <label className="space-y-1 text-[11px] text-dim">
                  <span>{kind === "rlc_bandpass" ? "Resonanzfrequenz f_0 (Hz)" : "Grenzfrequenz f_c (Hz)"}</span>
                  <input
                    className="input mono"
                    type="number"
                    value={params.fc}
                    onChange={(e) => setParams({ ...params, fc: Number(e.target.value) })}
                  />
                </label>
              )}

              {(kind === "rc_lowpass" || kind === "rc_highpass" || kind === "555_astable") && (
                <label className="space-y-1 text-[11px] text-dim">
                  <span>Kapazität C1 (F)</span>
                  <input
                    className="input mono"
                    type="number"
                    step="1e-7"
                    value={params.c}
                    onChange={(e) => setParams({ ...params, c: Number(e.target.value) })}
                  />
                </label>
              )}

              {(kind === "rl_lowpass" || kind === "rlc_bandpass") && (
                <label className="space-y-1 text-[11px] text-dim">
                  <span>Induktivität L1 (H)</span>
                  <input
                    className="input mono"
                    type="number"
                    step="1e-4"
                    value={params.l}
                    onChange={(e) => setParams({ ...params, l: Number(e.target.value) })}
                  />
                </label>
              )}

              {(kind === "opamp_noninverter" || kind === "opamp_inverter") && (
                <label className="space-y-1 text-[11px] text-dim">
                  <span>Betragsverstärkung |A_v|</span>
                  <input
                    className="input mono"
                    type="number"
                    step="0.5"
                    value={params.gain}
                    onChange={(e) => setParams({ ...params, gain: Number(e.target.value) })}
                  />
                </label>
              )}

              {(kind === "voltage_divider" ||
                kind === "rlc_bandpass" ||
                kind === "opamp_noninverter" ||
                kind === "opamp_inverter" ||
                kind === "bjt_ce" ||
                kind === "halfwave") && (
                <label className="space-y-1 text-[11px] text-dim">
                  <span>
                    {kind === "bjt_ce"
                      ? "Kollektorwiderstand RC (Ω)"
                      : kind === "halfwave"
                        ? "Lastwiderstand RL (Ω)"
                        : "Widerstand R1 (Ω)"}
                  </span>
                  <input
                    className="input mono"
                    type="number"
                    value={params.r1}
                    onChange={(e) => setParams({ ...params, r1: Number(e.target.value) })}
                  />
                </label>
              )}

              {(kind === "voltage_divider" || kind === "bjt_ce") && (
                <label className="space-y-1 text-[11px] text-dim">
                  <span>{kind === "bjt_ce" ? "Emitterwiderstand RE (Ω)" : "Widerstand R2 (Ω)"}</span>
                  <input
                    className="input mono"
                    type="number"
                    value={params.r2}
                    onChange={(e) => setParams({ ...params, r2: Number(e.target.value) })}
                  />
                </label>
              )}

              {kind === "buck_converter" && (
                <label className="space-y-1 text-[11px] text-dim">
                  <span>Tastgrad D (%)</span>
                  <input
                    className="input mono"
                    type="number"
                    min={5}
                    max={95}
                    value={params.duty}
                    onChange={(e) => setParams({ ...params, duty: Number(e.target.value) })}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-md p-3" style={{ background: "var(--surface)", border: "1px solid var(--hairline)" }}>
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-mute">
              Dimensionierung
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11.5px]">
              {calc.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-mute">{k}</span>
                  <span className="mono font-medium">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
