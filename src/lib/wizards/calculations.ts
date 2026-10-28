import { formatValue } from "../format";
import type { WizardCalcRow, WizardKind, WizardParams } from "./types";

/** S5.6: Dimensionierungs-Vorschau — rein, aus WizardsDialog umgezogen. */
export function calcWizard(kind: WizardKind, params: WizardParams): WizardCalcRow[] {

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
if (kind === "led_resistor") {
  const i = Math.max(0.1, params.iled) / 1000;
  const rExact = Math.max(0, (params.vin - params.vf) / i);
  const rE12 = nearestE12(rExact);
  const pR = i * i * rE12;
  return [
    ["Versorgung U_V", `${params.vin} V`],
    ["Flussspannung U_F", `${params.vf} V`],
    ["Strom I", `${params.iled} mA`],
    ["Rechnerisch R", `${formatValue(rExact)}Ω`],
    ["Gewählt (E12)", `${formatValue(rE12)}Ω`],
    ["Verlustleistung R", `${formatValue(pR)}W`],
  ];
}
if (kind === "schmitt_trigger") {
  const r1 = Math.max(100, params.r1);
  const r2 = Math.max(100, params.r2);
  // LM741 an ±15 V sättigt bei ca. ±13 V (Näherung für die Dimensionierung).
  const vsat = 13;
  const vth = (vsat * r1) / (r1 + r2);
  return [
    ["Versorgung", "±15 V (fest)"],
    ["Eingang", "10 V, 100 Hz (fest)"],
    ["Eingang R1", `${formatValue(r1)}Ω`],
    ["Rückkopplung R2", `${formatValue(r2)}Ω`],
    ["Schaltschwelle Vth+", `+${vth.toFixed(2)} V`],
    ["Schaltschwelle Vth−", `−${vth.toFixed(2)} V`],
    ["Hysterese", `${(2 * vth).toFixed(2)} V`],
  ];
}
return [
  ["Eingangsspannung", `${params.vin} V`],
  ["Tastgrad D", `${params.duty} %`],
  ["Ausgangsspannung", `≈ ${((params.vin * params.duty) / 100).toFixed(1)} V`],
];

}

/** Nächster E12-Normwert (1.0, 1.2, 1.5, …, 8.2 × 10er-Potenz). */
export function nearestE12(r: number): number {
  if (!(r > 0) || !Number.isFinite(r)) return 0;
  const e12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
  const exp = Math.floor(Math.log10(r));
  const mant = r / Math.pow(10, exp);
  let best = e12[0];
  for (const v of e12) {
    if (Math.abs(v - mant) < Math.abs(best - mant)) best = v;
  }
  return best * Math.pow(10, exp);
}
