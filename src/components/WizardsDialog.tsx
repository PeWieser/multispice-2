"use client";

import { useState } from "react";
import { Dialog } from "./ui";
import { useEditor } from "@/state/editor";
import { DEFAULT_WIZARD_PARAMS, WIZARDS, buildWizard, calcWizard } from "@/lib/wizards";
import type { WizardKind } from "@/lib/wizards";

export default function WizardsDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<WizardKind>("voltage_divider");
  const [params, setParams] = useState(DEFAULT_WIZARD_PARAMS);

  const active = WIZARDS.find((w) => w.id === kind) ?? WIZARDS[0];
  const groups = Array.from(new Set(WIZARDS.map((w) => w.group)));

  // Berechnete Kennwerte für die Vorschau (lib/wizards).
  const calc = calcWizard(kind, params);

  const build = () => {
    const editor = useEditor.getState();
    // S5.6d: Lehrer-Modus — kein Planwechsel (Dialog bleibt offen).
    if (editor.teacher.locked) {
      editor.setToast({ message: "Lehrer-Modus: Plan ist gesperrt." });
      return;
    }
    const doc = buildWizard(kind, params);
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
              <div className="px-2 pb-1 text-2xs font-medium uppercase tracking-wider text-ink-3">
                {grp}
              </div>
              {WIZARDS.filter((w) => w.group === grp).map((w) => (
                <button
                  key={w.id}
                  type="button"
                  className="tab flex w-full items-center px-2.5 py-1.5 text-left text-xs"
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
          className="flex flex-1 flex-col justify-between rounded-lg p-4 bg-surface-2 border border-hairline"
        >
          <div className="space-y-4">
            <div className="flex items-baseline justify-between border-b pb-2.5 border-hairline">
              <div className="text-sm font-semibold">{active.title}</div>
              <div className="mono rounded px-2 py-0.5 text-2xs bg-surface border border-hairline text-ink-2">
                {active.formula}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {(kind === "voltage_divider" || kind === "halfwave" || kind === "buck_converter" || kind === "led_resistor") && (
                <label className="space-y-1 text-2xs text-ink-2">
                  <span>{kind === "led_resistor" ? "Versorgung U_V (V)" : "Eingangsspannung U_ein (V)"}</span>
                  <input
                    className="input mono"
                    type="number"
                    value={params.vin}
                    onChange={(e) => setParams({ ...params, vin: Number(e.target.value) })}
                  />
                </label>
              )}

              {(kind === "555_astable" || kind === "opamp_follower" || kind === "halfwave") && (
                <label className="space-y-1 text-2xs text-ink-2">
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
                <label className="space-y-1 text-2xs text-ink-2">
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
                <label className="space-y-1 text-2xs text-ink-2">
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
                <label className="space-y-1 text-2xs text-ink-2">
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
                <label className="space-y-1 text-2xs text-ink-2">
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
                kind === "halfwave" ||
                kind === "schmitt_trigger") && (
                <label className="space-y-1 text-2xs text-ink-2">
                  <span>
                    {kind === "bjt_ce"
                      ? "Kollektorwiderstand RC (Ω)"
                      : kind === "halfwave"
                        ? "Lastwiderstand RL (Ω)"
                        : kind === "schmitt_trigger"
                          ? "Teiler R1 (Ω, → GND)"
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

              {(kind === "voltage_divider" || kind === "bjt_ce" || kind === "schmitt_trigger") && (
                <label className="space-y-1 text-2xs text-ink-2">
                  <span>{kind === "bjt_ce" ? "Emitterwiderstand RE (Ω)" : kind === "schmitt_trigger" ? "Rückkopplung R2 (Ω)" : "Widerstand R2 (Ω)"}</span>
                  <input
                    className="input mono"
                    type="number"
                    value={params.r2}
                    onChange={(e) => setParams({ ...params, r2: Number(e.target.value) })}
                  />
                </label>
              )}

              {kind === "buck_converter" && (
                <label className="space-y-1 text-2xs text-ink-2">
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

              {kind === "led_resistor" && (
                <label className="space-y-1 text-2xs text-ink-2">
                  <span>Flussspannung U_F (V)</span>
                  <input
                    className="input mono"
                    type="number"
                    step="0.1"
                    value={params.vf}
                    onChange={(e) => setParams({ ...params, vf: Number(e.target.value) })}
                  />
                </label>
              )}

              {kind === "led_resistor" && (
                <label className="space-y-1 text-2xs text-ink-2">
                  <span>Strom I (mA)</span>
                  <input
                    className="input mono"
                    type="number"
                    step="1"
                    value={params.iled}
                    onChange={(e) => setParams({ ...params, iled: Number(e.target.value) })}
                  />
                </label>
              )}
            </div>
          </div>

          <div className="mt-6 rounded-md p-3 bg-surface border border-hairline">
            <div className="mb-2 text-2xs font-medium uppercase tracking-wider text-ink-3">
              Dimensionierung
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-2xs">
              {calc.map(([k, v]) => (
                <div key={k} className="flex items-center justify-between">
                  <span className="text-ink-3">{k}</span>
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
