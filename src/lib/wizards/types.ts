import type { SchematicDoc } from "../schematic/model";

export type WizardKind =
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
  | "buck_converter"
  | "led_resistor"
  | "schmitt_trigger";

export interface WizardEntry {
  id: WizardKind;
  title: string;
  group: string;
  formula: string;
}

export const WIZARDS: WizardEntry[] = [
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
  { id: "led_resistor", title: "LED-Vorwiderstand", group: "Grundschaltungen", formula: "R = (U_V − U_F) / I" },
  { id: "schmitt_trigger", title: "Schmitt-Trigger (invertierend)", group: "Operationsverstärker", formula: "V_th = ±V_sat · R1 / (R1 + R2)" },
];

/** Geteilter Eingabe-Parametersatz aller Wizards (jeder nutzt seine Teilmenge). */
export interface WizardParams {
  vin: number;
  freq: number;
  fc: number;
  gain: number;
  r1: number;
  r2: number;
  c: number;
  l: number;
  duty: number;
  /** LED-Flussspannung (V) */
  vf: number;
  /** LED-Strom (mA) */
  iled: number;
}

export const DEFAULT_WIZARD_PARAMS: WizardParams = {
  vin: 5,
  freq: 1000,
  fc: 1000,
  gain: 10,
  r1: 10000,
  r2: 10000,
  c: 1e-7,
  l: 1e-3,
  duty: 50,
  vf: 2,
  iled: 20,
};

/** [Name, formatierter Wert]-Zeilen der Dimensionierungs-Vorschau. */
export type WizardCalcRow = [string, string];

export type WizardDoc = SchematicDoc;
