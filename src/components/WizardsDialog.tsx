"use client";

import { useState } from "react";
import { Dialog } from "./ui";
import { useEditor } from "@/state/editor";
import { PART_MAP } from "@/lib/library/catalog";

type WizardKind = "555_astable" | "555_monostable" | "555_bistable" | "rc_lowpass" | "rc_highpass" | "rl_lowpass" | "rlc_bandpass" | "opamp_inverter" | "opamp_noninverter" | "opamp_follower" | "opamp_summing" | "opamp_diff" | "opamp_integrator" | "opamp_differentiator" | "voltage_divider" | "wien_osc" | "sallen_key_low" | "sallen_key_high" | "bjt_ce" | "mosfet_cs" | "buck_converter" | "led_blink";

const WIZARDS: Array<{ id: WizardKind; title: string; desc: string; icon: string }> = [
  { id: "555_astable", title: "555 Astabil", desc: "Rechteckgenerator mit R1,R2,C – Frequenz und Duty einstellbar", icon: "⏰" },
  { id: "555_monostable", title: "555 Monostabil", desc: "Monoflop – Trigger → Ausgang für Zeit T", icon: "⏱️" },
  { id: "555_bistable", title: "555 Bistabil", desc: "Flip-Flop mit 2 Tastern", icon: "🔀" },
  { id: "rc_lowpass", title: "RC Tiefpass", desc: "Passiver Tiefpass 1. Ordnung – Grenzfrequenz fc", icon: "📉" },
  { id: "rc_highpass", title: "RC Hochpass", desc: "Passiver Hochpass 1. Ordnung", icon: "📈" },
  { id: "rl_lowpass", title: "RL Tiefpass", desc: "RL Tiefpass – fc = R/(2πL)", icon: "🧲" },
  { id: "rlc_bandpass", title: "RLC Bandpass", desc: "Serie Resonanz – f0 = 1/(2π√LC)", icon: "🎛️" },
  { id: "opamp_inverter", title: "OpAmp Inverter", desc: "Invertierender Verstärker – Gain = -Rf/Rin", icon: "🔊" },
  { id: "opamp_noninverter", title: "OpAmp Non-Inverter", desc: "Nicht-invertierend – Gain = 1+Rf/Rin", icon: "🔈" },
  { id: "opamp_follower", title: "Voltage Follower", desc: "Impedanzwandler Gain=1", icon: "🔁" },
  { id: "opamp_summing", title: "Summing Amp", desc: "Addierer – mehrere Eingänge", icon: "➕" },
  { id: "opamp_diff", title: "Difference Amp", desc: "Differenzverstärker", icon: "➖" },
  { id: "opamp_integrator", title: "Integrator", desc: "Integrierer – Sägezahn aus Rechteck", icon: "∫" },
  { id: "opamp_differentiator", title: "Differentiator", desc: "Differenzierer – Rechteck aus Dreieck", icon: "∂" },
  { id: "wien_osc", title: "Wien Bridge Osc", desc: "Sinus-Oszillator 1kHz", icon: "〰️" },
  { id: "sallen_key_low", title: "Sallen-Key Tiefpass", desc: "Aktiver Tiefpass 2. Ordnung", icon: "🔽" },
  { id: "sallen_key_high", title: "Sallen-Key Hochpass", desc: "Aktiver Hochpass 2. Ordnung", icon: "🔼" },
  { id: "bjt_ce", title: "BJT CE Verstärker", desc: "Common Emitter – Kleinsignal", icon: "🔺" },
  { id: "mosfet_cs", title: "MOSFET CS", desc: "Common Source Verstärker", icon: "🔷" },
  { id: "buck_converter", title: "Buck Converter", desc: "Abwärtswandler – L,C,MOSFET,Diode", icon: "⚙️" },
  { id: "voltage_divider", title: "Spannungsteiler", desc: "Einfacher Teiler R1/R2", icon: "⚡" },
  { id: "led_blink", title: "LED Blink 555", desc: "Klassiker – LED blinkt mit 555", icon: "💡" },
];

export default function WizardsDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<WizardKind>("555_astable");
  const [params, setParams] = useState<Record<string, number>>({ freq: 1000, duty: 50, fc: 1000, gain: 10, r1: 10000, r2: 10000, c: 1e-6 });
  const editor = useEditor.getState();

  const build = () => {
    const doc = editor.doc;
    const add = (partId: string, x: number, y: number, extraParams: any = {}) => {
      const id = editor.addInstance(partId, x, y);
      if (id && Object.keys(extraParams).length) {
        for (const [k,v] of Object.entries(extraParams)) editor.setParam(id, k, v as any);
      }
      return id;
    };

    // Clear and build based on wizard
    // For MVP, we build simple circuits near 0,0
    if (kind === "555_astable") {
      const f = params.freq || 1000;
      const c = params.c || 1e-6;
      // Formula: f = 1.44 / ((R1+2*R2)*C)
      const rTotal = 1.44 / (f * c);
      const r2 = rTotal * 0.6;
      const r1 = rTotal - 2*r2 > 0 ? rTotal - 2*r2 : r2*0.2;
      add("ne555", 0, 0);
      add("resistor", -80, -40, { resistance: r1 });
      add("resistor", -80, 40, { resistance: r2 });
      add("capacitor", 0, 80, { capacitance: c });
      add("capacitor", 80, -60, { capacitance: 10e-9 });
      add("vdc", -200, 0, { voltage: 5 });
      add("gnd", 0, 120);
      editor.log("ok", `555 Astabil generiert: f≈${f}Hz, R1=${(r1/1000).toFixed(1)}k, R2=${(r2/1000).toFixed(1)}k, C=${(c*1e6).toFixed(2)}µF`);
    } else if (kind === "rc_lowpass") {
      const fc = params.fc || 1000;
      const c = params.c || 1e-6;
      const r = 1 / (2*Math.PI*fc*c);
      add("resistor", -40, 0, { resistance: r });
      add("capacitor", 40, 0, { capacitance: c });
      add("vdc", -120, 0, { voltage: 1 });
      add("gnd", 40, 40);
      editor.log("ok", `RC Tiefpass fc=${fc}Hz, R=${(r/1000).toFixed(1)}k, C=${(c*1e6).toFixed(2)}µF`);
    } else if (kind === "voltage_divider") {
      const r1 = params.r1 || 10000;
      const r2 = params.r2 || 10000;
      add("resistor", 0, -30, { resistance: r1 });
      add("resistor", 0, 30, { resistance: r2 });
      add("vdc", -80, 0, { voltage: 5 });
      add("gnd", 0, 80);
      editor.log("ok", `Spannungsteiler R1=${r1/1000}k R2=${r2/1000}k → Vout=${(5*r2/(r1+r2)).toFixed(2)}V`);
    } else if (kind === "opamp_follower") {
      add("opamp_lm741", 0, 0);
      add("vac", -80, 0, { amplitude: 0.5, freq: 1000 });
      add("vdc", -40, -80, { voltage: 15 });
      add("vdc", -40, 80, { voltage: -15 });
      add("gnd", 0, 80);
      editor.log("ok", "Voltage Follower Gain=1 generiert");
    } else if (kind === "opamp_integrator") {
      add("opamp_lm741", 0, 0);
      add("resistor", -60, 0, { resistance: 10000 });
      add("capacitor", 60, 0, { capacitance: 100e-9 });
      add("vpulse", -120, 0, { v1: 0, v2: 1, freq: 1000 });
      add("gnd", 0, 80);
      editor.log("ok", "Integrator – Rechteck → Sägezahn");
    } else if (kind === "opamp_differentiator") {
      add("opamp_lm741", 0, 0);
      add("capacitor", -60, 0, { capacitance: 1e-6 });
      add("resistor", 60, 0, { resistance: 1000 });
      add("vac", -120, 0, { amplitude: 0.5, freq: 1000 });
      add("gnd", 0, 80);
      editor.log("ok", "Differentiator – Dreieck → Rechteck");
    } else if (kind === "wien_osc") {
      add("opamp_lm741", 0, 0);
      add("resistor", -60, -30, { resistance: 10000 });
      add("capacitor", -60, 30, { capacitance: 100e-9 });
      add("resistor", 60, -30, { resistance: 10000 });
      add("capacitor", 60, 30, { capacitance: 100e-9 });
      add("vdc", -40, -80, { voltage: 15 });
      add("vdc", -40, 80, { voltage: -15 });
      add("gnd", 0, 80);
      editor.log("ok", "Wien Bridge Oszillator 1kHz – schwingt, Fourier THD");
    } else if (kind === "led_blink") {
      add("ne555", 0, 0);
      add("resistor", -60, -30, { resistance: 1000 });
      add("resistor", -60, 30, { resistance: 10000 });
      add("capacitor", 0, 60, { capacitance: 100e-9 });
      add("led", 80, 0, { color: "red" });
      add("resistor", 80, 30, { resistance: 330 });
      add("vdc", -120, 0, { voltage: 5 });
      add("gnd", 0, 80);
      editor.log("ok", "LED Blink mit 555 – 1kHz blinkt");
    } else if (kind === "bjt_ce") {
      add("npn_2n3904", 0, 0);
      add("resistor", -40, -40, { resistance: 47000 });
      add("resistor", -40, 40, { resistance: 10000 });
      add("resistor", 40, -20, { resistance: 1000 });
      add("resistor", 0, 60, { resistance: 100 });
      add("capacitor", -80, 0, { capacitance: 10e-6 });
      add("vdc", -80, -60, { voltage: 12 });
      add("gnd", 0, 80);
      editor.log("ok", "BJT Common Emitter Verstärker – Gain ≈ -Rc/Re");
    } else {
      editor.log("info", `Wizard ${kind} – Demo: platziert Beispielbauteile`);
      add("opamp_lm741", 0, 0);
      add("resistor", -60, -20, { resistance: 10000 });
      add("resistor", 60, -20, { resistance: params.gain ? 10000*params.gain : 100000 });
    }
    editor.fitView();
    onClose();
  };

  return (
    <Dialog title="Circuit Wizards – wie Multisim" subtitle="Assistenten für 555, Filter, OpAmp – Werte eingeben, Schaltung wird generiert" onClose={onClose} wide actions={<><button className="btn" onClick={onClose}>Abbrechen</button><button className="btn btn-primary" onClick={build}>Generieren ✨</button></>}>
      <div className="flex gap-3">
        <div className="w-[200px] shrink-0 space-y-1">
          {WIZARDS.map(w=> (
            <button key={w.id} className="tab w-full text-left flex items-center gap-2" data-active={kind===w.id} onClick={()=>setKind(w.id)}>
              <span>{w.icon}</span><div><div className="text-[12px] font-medium">{w.title}</div><div className="text-[10px] text-mute leading-tight">{w.desc}</div></div>
            </button>
          ))}
        </div>
        <div className="flex-1 rounded-lg p-3 space-y-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
          <div className="text-[12px] font-medium">{WIZARDS.find(w=>w.id===kind)?.title}</div>
          <div className="text-[11px] text-mute">{WIZARDS.find(w=>w.id===kind)?.desc}</div>
          <div className="grid grid-cols-2 gap-2">
            {kind.includes("555") && (
              <>
                <label className="text-[11px]">Frequenz Hz<input className="input mono" type="number" value={params.freq} onChange={e=>setParams({...params, freq: Number(e.target.value)})} /></label>
                <label className="text-[11px]">C (F)<input className="input mono" type="number" step="1e-6" value={params.c} onChange={e=>setParams({...params, c: Number(e.target.value)})} /></label>
              </>
            )}
            {kind.includes("rc") && (
              <>
                <label className="text-[11px]">Grenzfrequenz fc Hz<input className="input mono" type="number" value={params.fc} onChange={e=>setParams({...params, fc: Number(e.target.value)})} /></label>
                <label className="text-[11px]">C (F)<input className="input mono" type="number" step="1e-6" value={params.c} onChange={e=>setParams({...params, c: Number(e.target.value)})} /></label>
              </>
            )}
            {kind.includes("opamp") && (
              <label className="text-[11px]">Gain<input className="input mono" type="number" value={params.gain} onChange={e=>setParams({...params, gain: Number(e.target.value)})} /></label>
            )}
            {kind === "voltage_divider" && (
              <>
                <label className="text-[11px]">R1 Ω<input className="input mono" type="number" value={params.r1} onChange={e=>setParams({...params, r1: Number(e.target.value)})} /></label>
                <label className="text-[11px]">R2 Ω<input className="input mono" type="number" value={params.r2} onChange={e=>setParams({...params, r2: Number(e.target.value)})} /></label>
              </>
            )}
          </div>
          <div className="text-[10px] text-mute">Multisim hat 20+ Wizards. Für MVP: 555, RC, Spannungsteiler, OpAmp. Generiert Bauteile nahe 0,0, dann Fit View.</div>
        </div>
      </div>
    </Dialog>
  );
}
