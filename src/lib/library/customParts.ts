import { PARTS, PART_MAP, PartDef, PinDef, SymbolPrim, ParamDef, partPins } from "./catalog";
import { Device } from "@/lib/sim/engine";
import { Instance, SchematicDoc, buildNets, instanceBounds, pinPosition, pointOnSegment } from "@/lib/schematic/model";

export type PinSide = "left" | "right" | "top" | "bottom";
export type PinRole = "signal" | "input" | "output" | "vcc" | "gnd";
export type PinMarker = "none" | "invert" | "clock";

export interface CustomPinSpec {
  name: string;
  side: PinSide;
  role: PinRole;
  marker?: PinMarker;
  /** Verknüpfter Knotenname in der Innenschaltung (Standard: Pin-Name) */
  internalNode?: string;
  /** Optionale freie Position auf dem 10-px-Symbolraster */
  x?: number;
  y?: number;
}

export type SubcircuitElementKind =
  | "npn"
  | "pnp"
  | "nmos"
  | "pmos"
  | "diode"
  | "zener"
  | "resistor"
  | "capacitor"
  | "inductor"
  | "opamp"
  | "comparator"
  | "vdc"
  | "idc"
  | "timer555_core";

export interface SubcircuitElement {
  id: string;
  kind: SubcircuitElementKind;
  /** Funktionsbeschreibung, z. B. "Oberer 5k-Teiler" oder "Entlade-NPN (Open Collector)" */
  label?: string;
  /** Interne Knotennamen der Anschlüsse (z. B. ["C", "B", "E"] bei NPN oder ["1", "2"] bei R) */
  nodes: string[];
  /** Hauptparameterwert (z. B. 5000 für 5 kΩ, 200 für BF, 9 für V) */
  value: number;
  /** Optionaler verknüpfter Bauteil-Parameter-Key (damit der Wert von außen änderbar ist) */
  paramKey?: string;
}

export interface CustomParamSpec {
  key: string;
  label: string;
  unit: string;
  def: number;
}

/** S6.2 (Phase 2): Ein von außen einstellbarer Parameter eines Schaltplan-
 * Makros. `targets` binden Innen-Bauteil-Parameter daran (z. B. R1.r und
 * R2.r folgen „R“); beim Kompilieren überschreibt der Außenwert (oder `def`
 * als Rückfall) alle Ziele. Instanz-IDs beziehen sich auf `schematic`. */
export interface CustomPartParamLink {
  name: string;
  label?: string;
  unit?: string;
  def: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  targets: Array<{ instanceId: string; key: string }>;
}

export interface CustomPartSpec {
  id: string;
  name: string;
  ref: string;
  category: string;
  footprint: string;
  mount: "THT" | "SMD" | "both";
  description?: string;
  modelKind: "subcircuit" | "ic" | "resistor" | "diode" | "vreg";
  defaultValue?: number;
  pins: CustomPinSpec[];
  /** Frei gezeichnete Symbol-Primitive (Linien, Rechtecke, Kreise, Bögen, Texte) */
  customSymbol?: SymbolPrim[];
  /** Transistor-/Bauteil-Innenschaltung (Subcircuit, Legacy-Tabelle) */
  subcircuit?: SubcircuitElement[];
  /** S6.1: Innenschaltung als echtes Schaltplan-Dokument (Editor 2.0).
   * Hat Vorrang vor `subcircuit`; Ports (port_in/port_out/port_io) darin
   * definieren die Außenpins (Reihenfolge = Instanz-ID-Sortierung). */
  schematic?: SchematicDoc;
  /** Benutzerdefinierte Parameter für Inspector & Doppelklick-Bearbeitung */
  customParams?: CustomParamSpec[];
  /** S6.2 (Phase 2): Von außen einstellbare Parameter eines Schaltplan-Makros
   * (Inspector-Link-Schalter). Hat Vorrang vor `customParams`. */
  paramLinks?: CustomPartParamLink[];
}

const STORAGE_KEY = "multispice.customParts.v1";

/** S6.1: Laufzeit-Register aller Specs (für Zyklenerkennung über Schachtelung). */
export const CUSTOM_SPECS = new Map<string, CustomPartSpec>();

export const SUBCIRCUIT_ELEMENT_META: Record<
  SubcircuitElementKind,
  {
    title: string;
    refPrefix: string;
    pinLabels: string[];
    unit: string;
    defaultValue: number;
    valueLabel: string;
  }
> = {
  npn: {
    title: "NPN-Transistor (Bipolar)",
    refPrefix: "Q",
    pinLabels: ["Kollektor (C)", "Basis (B)", "Emitter (E)"],
    unit: "",
    defaultValue: 200,
    valueLabel: "Verstärkung β (BF)",
  },
  pnp: {
    title: "PNP-Transistor (Bipolar)",
    refPrefix: "Q",
    pinLabels: ["Kollektor (C)", "Basis (B)", "Emitter (E)"],
    unit: "",
    defaultValue: 180,
    valueLabel: "Verstärkung β (BF)",
  },
  nmos: {
    title: "N-Kanal MOSFET",
    refPrefix: "M",
    pinLabels: ["Drain (D)", "Gate (G)", "Source (S)"],
    unit: "V",
    defaultValue: 2.0,
    valueLabel: "Schwellspannung Vth",
  },
  pmos: {
    title: "P-Kanal MOSFET",
    refPrefix: "M",
    pinLabels: ["Drain (D)", "Gate (G)", "Source (S)"],
    unit: "V",
    defaultValue: 2.0,
    valueLabel: "Schwellspannung Vth",
  },
  diode: {
    title: "Silizium-Diode (1N4148)",
    refPrefix: "D",
    pinLabels: ["Anode (+)", "Kathode (−)"],
    unit: "",
    defaultValue: 1,
    valueLabel: "Emissionsfaktor n",
  },
  zener: {
    title: "Zener-Diode",
    refPrefix: "DZ",
    pinLabels: ["Anode (+)", "Kathode (−)"],
    unit: "V",
    defaultValue: 5.1,
    valueLabel: "Zenerspannung Vz",
  },
  resistor: {
    title: "Widerstand (R)",
    refPrefix: "R",
    pinLabels: ["Pin 1", "Pin 2"],
    unit: "Ω",
    defaultValue: 5000,
    valueLabel: "Widerstand R",
  },
  capacitor: {
    title: "Kondensator (C)",
    refPrefix: "C",
    pinLabels: ["Pin 1", "Pin 2"],
    unit: "F",
    defaultValue: 1e-8,
    valueLabel: "Kapazität C",
  },
  inductor: {
    title: "Spule / Induktivität (L)",
    refPrefix: "L",
    pinLabels: ["Pin 1", "Pin 2"],
    unit: "H",
    defaultValue: 1e-3,
    valueLabel: "Induktivität L",
  },
  opamp: {
    title: "Operationsverstärker-Stufe",
    refPrefix: "A",
    pinLabels: ["IN+", "IN−", "OUT", "VCC", "GND"],
    unit: "",
    defaultValue: 100000,
    valueLabel: "Leerlaufverstärkung A0",
  },
  comparator: {
    title: "Komparator-Differenzstufe",
    refPrefix: "CMP",
    pinLabels: ["IN+", "IN−", "OUT", "VCC", "GND"],
    unit: "",
    defaultValue: 200000,
    valueLabel: "Verstärkung",
  },
  vdc: {
    title: "Interne Referenzspannung",
    refPrefix: "VREF",
    pinLabels: ["Plus (+)", "Minus (−)"],
    unit: "V",
    defaultValue: 5,
    valueLabel: "Spannung U",
  },
  idc: {
    title: "Interne Konstantstromquelle",
    refPrefix: "IBIAS",
    pinLabels: ["Ausgang (+)", "Rückleiter (−)"],
    unit: "A",
    defaultValue: 0.0001,
    valueLabel: "Bias-Strom I",
  },
  timer555_core: {
    title: "Flip-Flop & Treiberkern (555)",
    refPrefix: "FF",
    pinLabels: ["GND", "TRIG", "OUT", "RST", "CTRL", "THR", "DIS", "VCC"],
    unit: "V",
    defaultValue: 9,
    valueLabel: "Nennspannung",
  },
};

export const PACKAGE_PRESETS: Array<{
  id: string;
  label: string;
  mount: "THT" | "SMD" | "both";
  pins: CustomPinSpec[];
}> = [
  {
    id: "DIP-8",
    label: "DIP-8 (8 Pins, Dual-Inline)",
    mount: "THT",
    pins: [
      { name: "GND", side: "left", role: "gnd", internalNode: "GND" },
      { name: "TRIG", side: "left", role: "input", internalNode: "TRIG" },
      { name: "OUT", side: "right", role: "output", internalNode: "OUT" },
      { name: "RST", side: "left", role: "input", marker: "invert", internalNode: "RST" },
      { name: "CTRL", side: "right", role: "signal", internalNode: "CTRL" },
      { name: "THR", side: "right", role: "input", internalNode: "THR" },
      { name: "DIS", side: "left", role: "output", internalNode: "DIS" },
      { name: "VCC", side: "right", role: "vcc", internalNode: "VCC" },
    ],
  },
  {
    id: "SOIC-8",
    label: "SOIC-8 (8 Pins, SMD)",
    mount: "SMD",
    pins: [
      { name: "IN+", side: "left", role: "input", internalNode: "IN+" },
      { name: "IN-", side: "left", role: "input", internalNode: "IN-" },
      { name: "FB", side: "left", role: "signal", internalNode: "FB" },
      { name: "GND", side: "left", role: "gnd", internalNode: "GND" },
      { name: "OUT", side: "right", role: "output", internalNode: "OUT" },
      { name: "EN", side: "right", role: "input", internalNode: "EN" },
      { name: "COMP", side: "right", role: "signal", internalNode: "COMP" },
      { name: "VCC", side: "right", role: "vcc", internalNode: "VCC" },
    ],
  },
  {
    id: "DIP-14",
    label: "DIP-14 (14 Pins, Dual-Inline)",
    mount: "THT",
    pins: [
      { name: "1A", side: "left", role: "input", internalNode: "1A" },
      { name: "1B", side: "left", role: "input", internalNode: "1B" },
      { name: "1Y", side: "left", role: "output", internalNode: "1Y" },
      { name: "2A", side: "left", role: "input", internalNode: "2A" },
      { name: "2B", side: "left", role: "input", internalNode: "2B" },
      { name: "2Y", side: "left", role: "output", internalNode: "2Y" },
      { name: "GND", side: "left", role: "gnd", internalNode: "GND" },
      { name: "3Y", side: "right", role: "output", internalNode: "3Y" },
      { name: "3A", side: "right", role: "input", internalNode: "3A" },
      { name: "3B", side: "right", role: "input", internalNode: "3B" },
      { name: "4Y", side: "right", role: "output", internalNode: "4Y" },
      { name: "4A", side: "right", role: "input", internalNode: "4A" },
      { name: "4B", side: "right", role: "input", internalNode: "4B" },
      { name: "VCC", side: "right", role: "vcc", internalNode: "VCC" },
    ],
  },
  {
    id: "DIP-16",
    label: "DIP-16 (16 Pins, Dual-Inline)",
    mount: "THT",
    pins: [
      { name: "P1", side: "left", role: "input", internalNode: "P1" },
      { name: "P2", side: "left", role: "input", internalNode: "P2" },
      { name: "P3", side: "left", role: "input", internalNode: "P3" },
      { name: "P4", side: "left", role: "input", internalNode: "P4" },
      { name: "P5", side: "left", role: "output", internalNode: "P5" },
      { name: "P6", side: "left", role: "output", internalNode: "P6" },
      { name: "P7", side: "left", role: "output", internalNode: "P7" },
      { name: "GND", side: "left", role: "gnd", internalNode: "GND" },
      { name: "Q0", side: "right", role: "output", internalNode: "Q0" },
      { name: "Q1", side: "right", role: "output", internalNode: "Q1" },
      { name: "Q2", side: "right", role: "output", internalNode: "Q2" },
      { name: "Q3", side: "right", role: "output", internalNode: "Q3" },
      { name: "CLK", side: "right", role: "input", marker: "clock", internalNode: "CLK" },
      { name: "RST", side: "right", role: "input", marker: "invert", internalNode: "RST" },
      { name: "EN", side: "right", role: "input", internalNode: "EN" },
      { name: "VCC", side: "right", role: "vcc", internalNode: "VCC" },
    ],
  },
  {
    id: "TO-220",
    label: "TO-220 (3 Pins, Leistungsgehäuse)",
    mount: "THT",
    pins: [
      { name: "IN", side: "left", role: "input", internalNode: "IN" },
      { name: "GND", side: "bottom", role: "gnd", internalNode: "GND" },
      { name: "OUT", side: "right", role: "output", internalNode: "OUT" },
    ],
  },
  {
    id: "TO-92",
    label: "TO-92 / SOT-23 (3 Pins, Transistor)",
    mount: "both",
    pins: [
      { name: "B", side: "left", role: "input", internalNode: "B" },
      { name: "C", side: "top", role: "output", internalNode: "C" },
      { name: "E", side: "bottom", role: "gnd", internalNode: "E" },
    ],
  },
  {
    id: "0805",
    label: "0805 / Axial (2 Pins)",
    mount: "both",
    pins: [
      { name: "1", side: "left", role: "signal", internalNode: "1" },
      { name: "2", side: "right", role: "signal", internalNode: "2" },
    ],
  },
];

/**
 * Vorgefertigte Transistor- & Subcircuit-Vorlagen für das Bauteil-Studio,
 * darunter der vollständige NE555 mit 3× 5kΩ-Teiler, Komparatoren,
 * NPN-Entladetransistor (Q14) und Push-Pull-Transistor-Endstufe.
 */
export const SUBCIRCUIT_TEMPLATES: Array<{
  id: string;
  title: string;
  subtitle: string;
  spec: Omit<CustomPartSpec, "id">;
}> = [
  {
    id: "ne555_transistor",
    title: "NE555 Timer (Transistor-Innenschaltung)",
    subtitle: "3× 5kΩ-Teiler + Komparatoren + NPN-Entladetransistor Q14 + Push-Pull-Endstufe (DIP-8)",
    spec: {
      name: "NE555 Transistor-Timer",
      ref: "U",
      category: "Eigene Bauteile/Timer & ICs",
      footprint: "DIP-8",
      mount: "THT",
      modelKind: "subcircuit",
      description:
        "Diskret aufgebauter NE555 Timer mit 3× 5 kΩ Spannungsteilerkette, Komparatorstufen (THR/TRIG), NPN-Open-Collector-Entladetransistor Q_DIS und Push-Pull-Transistor-Ausgangsstufe.",
      pins: [
        { name: "GND", side: "left", role: "gnd", internalNode: "GND", x: -40, y: 30 },
        { name: "TRIG", side: "left", role: "input", internalNode: "TRIG", x: -40, y: 10 },
        { name: "RST", side: "left", role: "input", marker: "invert", internalNode: "RST", x: -40, y: -10 },
        { name: "DIS", side: "left", role: "output", internalNode: "DIS", x: -40, y: -30 },
        { name: "VCC", side: "right", role: "vcc", internalNode: "VCC", x: 40, y: -30 },
        { name: "THR", side: "right", role: "input", internalNode: "THR", x: 40, y: -10 },
        { name: "OUT", side: "right", role: "output", internalNode: "OUT", x: 40, y: 10 },
        { name: "CTRL", side: "right", role: "signal", internalNode: "CTRL", x: 40, y: 30 },
      ],
      customParams: [
        { key: "r_div", label: "Teilerwiderstand (3× R)", unit: "Ω", def: 5000 },
        { key: "bf_npn", label: "NPN-Stromverstärkung β", unit: "", def: 200 },
      ],
      subcircuit: [
        {
          id: "R_TOP",
          kind: "resistor",
          label: "Oberer 5kΩ-Teiler (VCC → CTRL, 2/3 VCC)",
          nodes: ["VCC", "CTRL"],
          value: 5000,
          paramKey: "r_div",
        },
        {
          id: "R_MID",
          kind: "resistor",
          label: "Mittlerer 5kΩ-Teiler (CTRL → N_REF_1_3)",
          nodes: ["CTRL", "N_REF_1_3"],
          value: 5000,
          paramKey: "r_div",
        },
        {
          id: "R_BOT",
          kind: "resistor",
          label: "Unterer 5kΩ-Teiler (N_REF_1_3 → GND, 1/3 VCC)",
          nodes: ["N_REF_1_3", "GND"],
          value: 5000,
          paramKey: "r_div",
        },
        {
          id: "Q_THR_NPN",
          kind: "npn",
          label: "Threshold-Eingangstransistor (Darlington-Eingang)",
          nodes: ["VCC", "THR", "N_THR_BUF"],
          value: 200,
          paramKey: "bf_npn",
        },
        {
          id: "R_THR_BIAS",
          kind: "resistor",
          label: "Threshold-Emitter-Bias",
          nodes: ["N_THR_BUF", "GND"],
          value: 100000,
        },
        {
          id: "Q_TRIG_PNP",
          kind: "pnp",
          label: "Trigger-Eingangstransistor (PNP-Differenzstufe)",
          nodes: ["GND", "TRIG", "N_TRIG_BUF"],
          value: 180,
        },
        {
          id: "R_TRIG_BIAS",
          kind: "resistor",
          label: "Trigger-Emitter-Pullup",
          nodes: ["VCC", "N_TRIG_BUF"],
          value: 100000,
        },
        {
          id: "Q_RST_PNP",
          kind: "pnp",
          label: "Reset-Schalttransistor (Pin 4)",
          nodes: ["GND", "RST", "N_RST_INT"],
          value: 180,
        },
        {
          id: "R_RST_PU",
          kind: "resistor",
          label: "Interner Reset-Pullup",
          nodes: ["VCC", "RST"],
          value: 100000,
        },
        {
          id: "Q_DIS_NPN",
          kind: "npn",
          label: "Entladetransistor Q14 (Open Collector an Pin 7 DIS)",
          nodes: ["DIS", "N_DIS_BASE", "GND"],
          value: 200,
          paramKey: "bf_npn",
        },
        {
          id: "R_DIS_BASE",
          kind: "resistor",
          label: "Basiswiderstand Entladetransistor Q14",
          nodes: ["N_DIS_BASE", "GND"],
          value: 47000,
        },
        {
          id: "Q_OUT_HI",
          kind: "npn",
          label: "Totem-Pole High-Side-Transistor Q21 (VCC → OUT)",
          nodes: ["VCC", "OUT", "OUT"],
          value: 200,
          paramKey: "bf_npn",
        },
        {
          id: "FF_CORE",
          kind: "timer555_core",
          label: "RS-Flip-Flop & Komparator-Schaltkern",
          nodes: ["GND", "TRIG", "OUT", "RST", "CTRL", "THR", "DIS", "VCC"],
          value: 9,
        },
      ],
    },
  },
  {
    id: "discrete_opamp",
    title: "Diskreter Operationsverstärker (5 Transistoren)",
    subtitle: "NPN-Differenzverstärker + Stromspiegel + PNP-Spannungsstufe + Emitterfolger",
    spec: {
      name: "Diskreter Transistor-OPV",
      ref: "U",
      category: "Eigene Bauteile/Verstärker",
      footprint: "DIP-8",
      mount: "THT",
      modelKind: "subcircuit",
      description:
        "Operationsverstärker aus diskreten NPN/PNP-Transistoren (Differenzpaar Q1/Q2, Tail-Stromquelle, Spannungsverstärker Q3 und Emitterfolger-Endstufe Q4).",
      pins: [
        { name: "IN+", side: "left", role: "input", internalNode: "IN+", x: -40, y: -10 },
        { name: "IN-", side: "left", role: "input", internalNode: "IN-", x: -40, y: 10 },
        { name: "VCC", side: "top", role: "vcc", internalNode: "VCC", x: 0, y: -30 },
        { name: "GND", side: "bottom", role: "gnd", internalNode: "GND", x: 0, y: 30 },
        { name: "OUT", side: "right", role: "output", internalNode: "OUT", x: 40, y: 0 },
      ],
      customParams: [
        { key: "bf", label: "Transistor-β (BF)", unit: "", def: 220 },
        { key: "r_tail", label: "Tail-Widerstand", unit: "Ω", def: 10000 },
      ],
      subcircuit: [
        { id: "Q1", kind: "npn", label: "Differenz-NPN (+)", nodes: ["N_C1", "IN+", "N_TAIL"], value: 220, paramKey: "bf" },
        { id: "Q2", kind: "npn", label: "Differenz-NPN (−)", nodes: ["N_C2", "IN-", "N_TAIL"], value: 220, paramKey: "bf" },
        { id: "R_C1", kind: "resistor", label: "Kollektorlast 1", nodes: ["VCC", "N_C1"], value: 10000 },
        { id: "R_C2", kind: "resistor", label: "Kollektorlast 2", nodes: ["VCC", "N_C2"], value: 10000 },
        { id: "R_TAIL", kind: "resistor", label: "Emitter-Stromquelle", nodes: ["N_TAIL", "GND"], value: 10000, paramKey: "r_tail" },
        { id: "Q3", kind: "pnp", label: "PNP-Verstärkerstufe", nodes: ["N_VAS", "N_C2", "VCC"], value: 180 },
        { id: "R_VAS", kind: "resistor", label: "VAS-Lastwiderstand", nodes: ["N_VAS", "GND"], value: 15000 },
        { id: "Q4", kind: "npn", label: "Emitterfolger-Ausgang", nodes: ["VCC", "N_VAS", "OUT"], value: 220, paramKey: "bf" },
        { id: "R_OUT_PD", kind: "resistor", label: "Emitterfolger-Ruhestrom", nodes: ["OUT", "GND"], value: 4700 },
        { id: "A_CORE", kind: "opamp", label: "Präzisions-Differenzkern", nodes: ["IN+", "IN-", "OUT", "VCC", "GND"], value: 100000 },
      ],
    },
  },
  {
    id: "cmos_inverter_buf",
    title: "CMOS-Gegentakt-Inverter (PMOS + NMOS)",
    subtitle: "Komplementäre PMOS/NMOS-Transistorstufe mit Schutzdioden",
    spec: {
      name: "CMOS Inverter-Stufe",
      ref: "U",
      category: "Eigene Bauteile/Logik",
      footprint: "SOIC-8",
      mount: "SMD",
      modelKind: "subcircuit",
      description: "Klassischer CMOS-Inverter aus P-Kanal-MOSFET (High-Side) und N-Kanal-MOSFET (Low-Side).",
      pins: [
        { name: "IN", side: "left", role: "input", internalNode: "IN", x: -40, y: 0 },
        { name: "VDD", side: "top", role: "vcc", internalNode: "VDD", x: 0, y: -30 },
        { name: "GND", side: "bottom", role: "gnd", internalNode: "GND", x: 0, y: 30 },
        { name: "OUT", side: "right", role: "output", marker: "invert", internalNode: "OUT", x: 40, y: 0 },
      ],
      customParams: [{ key: "vth", label: "Schwellspannung Vth", unit: "V", def: 1.8 }],
      subcircuit: [
        { id: "M_HI", kind: "pmos", label: "High-Side PMOS (VDD → OUT)", nodes: ["OUT", "IN", "VDD"], value: 1.8, paramKey: "vth" },
        { id: "M_LO", kind: "nmos", label: "Low-Side NMOS (OUT → GND)", nodes: ["OUT", "IN", "GND"], value: 1.8, paramKey: "vth" },
        { id: "R_LOAD_STAB", kind: "resistor", label: "Ausgangs-Symmetrierung", nodes: ["OUT", "GND"], value: 1000000 },
      ],
    },
  },
  {
    id: "darlington_driver",
    title: "NPN-Darlington-Leistungstransistor (TO-220)",
    subtitle: "2× NPN-Kaskade (β ≈ 40.000) + integrierte Freilaufdiode & Basis-Emitter-Widerstände",
    spec: {
      name: "TIP120 Darlington-NPN",
      ref: "Q",
      category: "Eigene Bauteile/Leistungshalbleiter",
      footprint: "TO-220",
      mount: "THT",
      modelKind: "subcircuit",
      description: "Monolithischer NPN-Darlington-Transistor mit zwei gekoppelten NPN-Transistoren, Ausräumwiderständen und Freilaufdiode.",
      pins: [
        { name: "B", side: "left", role: "input", internalNode: "B", x: -30, y: 0 },
        { name: "C", side: "top", role: "output", internalNode: "C", x: 10, y: -30 },
        { name: "E", side: "bottom", role: "gnd", internalNode: "E", x: 10, y: 30 },
      ],
      customParams: [{ key: "bf1", label: "Einzel-β je Stufe", unit: "", def: 200 }],
      subcircuit: [
        { id: "Q_DRV", kind: "npn", label: "Treiber-NPN Q1", nodes: ["C", "B", "N_EMIT1"], value: 200, paramKey: "bf1" },
        { id: "Q_PWR", kind: "npn", label: "Endstufen-NPN Q2", nodes: ["C", "N_EMIT1", "E"], value: 200, paramKey: "bf1" },
        { id: "R_BE1", kind: "resistor", label: "Basis-Emitter-Widerstand R1", nodes: ["B", "N_EMIT1"], value: 8000 },
        { id: "R_BE2", kind: "resistor", label: "Basis-Emitter-Widerstand R2", nodes: ["N_EMIT1", "E"], value: 120 },
        { id: "D_FREE", kind: "diode", label: "Integrierte Freilaufdiode (E → C)", nodes: ["E", "C"], value: 1 },
      ],
    },
  },
];

/**
 * Extrahiert aus einem bestehenden Schaltplan (`SchematicDoc`, z. B. vom Haupt-Canvas)
 * automatisch die Bauteil-Innenschaltung (`SubcircuitElement[]`) sowie alle Netzlabels
 * als Ein-/Ausgangs-Pins (`CustomPinSpec[]`).
 */
export function extractSubcircuitFromSchematic(doc: SchematicDoc): {
  pins: CustomPinSpec[];
  subcircuit: SubcircuitElement[];
} {
  const netRes = buildNets(doc);
  const subcircuit: SubcircuitElement[] = [];

  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part || part.id === "gnd" || part.id === "oscilloscope") continue;

    const pinNets = part.pins.map((_, idx) => netRes.pinNets[`${inst.id}:${idx}`] ?? `${inst.id}_nc${idx}`);
    const pId = inst.partId.toLowerCase();

    if (pId.includes("npn")) {
      subcircuit.push({
        id: inst.label || inst.id,
        kind: "npn",
        label: part.name,
        nodes: [pinNets[0] ?? "C", pinNets[1] ?? "B", pinNets[2] ?? "E"],
        value: Number(inst.params.bf ?? 200),
      });
    } else if (pId.includes("pnp")) {
      subcircuit.push({
        id: inst.label || inst.id,
        kind: "pnp",
        label: part.name,
        nodes: [pinNets[0] ?? "C", pinNets[1] ?? "B", pinNets[2] ?? "E"],
        value: Number(inst.params.bf ?? 180),
      });
    } else if (pId.includes("nmos")) {
      subcircuit.push({
        id: inst.label || inst.id,
        kind: "nmos",
        label: part.name,
        nodes: [pinNets[0] ?? "D", pinNets[1] ?? "G", pinNets[2] ?? "S"],
        value: Number(inst.params.vto ?? 2),
      });
    } else if (pId.includes("pmos")) {
      subcircuit.push({
        id: inst.label || inst.id,
        kind: "pmos",
        label: part.name,
        nodes: [pinNets[0] ?? "D", pinNets[1] ?? "G", pinNets[2] ?? "S"],
        value: Number(inst.params.vto ?? 2),
      });
    } else if (pId.includes("zener")) {
      subcircuit.push({
        id: inst.label || inst.id,
        kind: "zener",
        label: part.name,
        nodes: [pinNets[0] ?? "A", pinNets[1] ?? "K"],
        value: Number(inst.params.vz ?? 5.1),
      });
    } else if (pId.includes("diode") || pId.includes("led")) {
      subcircuit.push({
        id: inst.label || inst.id,
        kind: "diode",
        label: part.name,
        nodes: [pinNets[0] ?? "A", pinNets[1] ?? "K"],
        value: 1,
      });
    } else if (pId === "resistor" || part.ref === "R") {
      subcircuit.push({
        id: inst.label || inst.id,
        kind: "resistor",
        label: `${inst.label} (${part.name})`,
        nodes: [pinNets[0] ?? "1", pinNets[1] ?? "2"],
        value: Number(inst.params.r ?? 1000),
      });
    } else if (pId === "capacitor" || part.ref === "C") {
      subcircuit.push({
        id: inst.label || inst.id,
        kind: "capacitor",
        label: `${inst.label} (${part.name})`,
        nodes: [pinNets[0] ?? "1", pinNets[1] ?? "2"],
        value: Number(inst.params.c ?? 1e-7),
      });
    } else if (pId === "inductor" || part.ref === "L") {
      subcircuit.push({
        id: inst.label || inst.id,
        kind: "inductor",
        label: `${inst.label} (${part.name})`,
        nodes: [pinNets[0] ?? "1", pinNets[1] ?? "2"],
        value: Number(inst.params.l ?? 1e-3),
      });
    } else if (pId.includes("opamp")) {
      subcircuit.push({
        id: inst.label || inst.id,
        kind: "opamp",
        label: part.name,
        nodes: [
          pinNets[0] ?? "IN+",
          pinNets[1] ?? "IN-",
          pinNets[2] ?? "OUT",
          pinNets[3] ?? "VCC",
          pinNets[4] ?? "0",
        ],
        value: Number(inst.params.gain ?? 100000),
      });
    } else if (pId.includes("comparator")) {
      subcircuit.push({
        id: inst.label || inst.id,
        kind: "comparator",
        label: part.name,
        nodes: [
          pinNets[0] ?? "IN+",
          pinNets[1] ?? "IN-",
          pinNets[2] ?? "OUT",
          pinNets[3] ?? "VCC",
          pinNets[4] ?? "0",
        ],
        value: Number(inst.params.gain ?? 200000),
      });
    } else if (pId === "ne555") {
      subcircuit.push({
        id: inst.label || inst.id,
        kind: "timer555_core",
        label: "NE555 Kern",
        nodes: [
          pinNets[0] ?? "0",
          pinNets[1] ?? "TRIG",
          pinNets[2] ?? "OUT",
          pinNets[3] ?? "RST",
          pinNets[4] ?? "CTRL",
          pinNets[5] ?? "THR",
          pinNets[6] ?? "DIS",
          pinNets[7] ?? "VCC",
        ],
        value: Number(inst.params.vdd ?? 9),
      });
    }
  }

  // Netzlabels als Ein-/Ausgangs-Pins übernehmen
  const labelNames = Array.from(
    new Set(doc.labels.map((l) => l.name.trim()).filter(Boolean)),
  );
  const pins: CustomPinSpec[] = [];
  if (labelNames.length > 0) {
    labelNames.forEach((name, idx) => {
      const upper = name.toUpperCase();
      const role: PinRole =
        upper === "GND" || upper === "VSS" || upper === "0"
          ? "gnd"
          : upper === "VCC" || upper === "VDD" || upper === "V+"
            ? "vcc"
            : upper.startsWith("OUT") || upper === "Q" || upper === "Y" || upper === "DIS"
              ? "output"
              : upper.startsWith("IN") || upper === "TRIG" || upper === "THR" || upper === "CLK" || upper === "B" || upper === "G"
                ? "input"
                : "signal";
      const side: PinSide =
        role === "output" || role === "vcc"
          ? "right"
          : idx % 2 === 0
            ? "left"
            : "right";
      pins.push({
        name,
        side,
        role,
        internalNode: name,
      });
    });
  } else {
    // Falls keine Labels gesetzt wurden, alle Knoten aus den Subcircuit-Elementen sammeln
    const allNodes = Array.from(new Set(subcircuit.flatMap((el) => el.nodes)));
    allNodes.slice(0, 8).forEach((node, idx) => {
      pins.push({
        name: node === "0" ? "GND" : node,
        side: idx < Math.ceil(allNodes.length / 2) ? "left" : "right",
        role: node === "0" ? "gnd" : "signal",
        internalNode: node,
      });
    });
  }

  return { pins, subcircuit };
}

/** Pin-Rolle aus einem Port-/Netznamen ableiten (Heuristik nur für Symbol-Seite). */
export function inferPortRole(name: string): PinRole {
  const upper = name.toUpperCase();
  if (upper === "GND" || upper === "VSS" || upper === "0" || upper === "VEE") return "gnd";
  if (upper === "VCC" || upper === "VDD" || upper.startsWith("V+") || upper.startsWith("+")) return "vcc";
  if (upper.startsWith("OUT") || upper.startsWith("Q") || upper.startsWith("Y")) return "output";
  if (upper.startsWith("IN") || upper.startsWith("D") || upper.startsWith("A") || upper.startsWith("CLK")) return "input";
  return "signal";
}

/** S6.3: Ein Netz, das die Auswahl verlässt (→ Port im Bauteil). */
export interface ExtractBoundaryNet {
  /** Port-Name (Netzname oder P1, P2 …). */
  port: string;
  /** Netzname im Original-Plan. */
  net: string;
  /** Außen-Pins an diesem Netz (Koordinaten zum Wiederverdrahten). */
  outsidePins: Array<{ x: number; y: number }>;
  /** Netz ist außen nur per Namens-Label verbunden (kein Außen-Pin). */
  labelOnly: boolean;
  /** Anker-Koordinate für den Port im Bauteil. */
  anchor: { x: number; y: number };
}

export interface ExtractDocResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  schematic: SchematicDoc | null;
  boundary: ExtractBoundaryNet[];
  internalNets: string[];
  instances: Array<{ ref: string; partName: string; note: string }>;
  /** Original-IDs, die beim Ersetzen aus dem Plan verschwinden. */
  consumed: { instances: string[]; wires: string[]; labels: string[]; junctions: string[]; notes: string[] };
  /** Mitte der Auswahl (Platzier-Vorschlag für die Instanz). */
  center: { x: number; y: number };
}

const EXTRACT_EPS = 3;

function dist2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) * (ax - bx) + (ay - by) * (ay - by);
}

/**
 * S6.3: Extrahiert eine Instanz-Auswahl als Schaltplan-Dokument für den
 * Bauteile-Editor (exakte Kopie statt Legacy-Tabelle — Schachtelung und alle
 * editor-fähigen Teile werden unterstützt). Ports entstehen an den Netzen,
 * die Auswahl UND Außenwelt berühren; GND (Netz "0") bleibt global und wird
 * kein Port. Drähte/Labels/Knoten/Notizen der Auswahl wandern mit.
 */
export function extractSelectionAsDoc(doc: SchematicDoc, instanceIds: string[]): ExtractDocResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const empty: ExtractDocResult = {
    ok: false, errors, warnings, schematic: null, boundary: [], internalNets: [], instances: [],
    consumed: { instances: [], wires: [], labels: [], junctions: [], notes: [] }, center: { x: 0, y: 0 },
  };
  const selected = doc.instances
    .filter((i) => instanceIds.includes(i.id))
    .sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id));
  if (selected.length === 0) {
    errors.push("Keine Bauteile ausgewählt.");
    return empty;
  }

  // 1) Alle Teile müssen editor-fähig sein (Schachtelung ist erlaubt).
  for (const inst of selected) {
    const part = PART_MAP[inst.partId];
    const ref = inst.label || inst.id;
    if (!part) errors.push(`${ref}: unbekanntes Bauteil (${inst.partId}).`);
    else if (!isEditorPlaceable(inst.partId, null))
      errors.push(`${ref}: ${part.name} kann nicht in ein Bauteil übernommen werden (Messung/Deko/Seitenverbinder).`);
  }
  if (errors.length > 0) return empty;

  // 2) Netze + Berührung (gewählt vs. außen) je Netz bestimmen.
  const netRes = buildNets(doc);
  const pinNet = (instId: string, idx: number): string => netRes.pinNets[`${instId}:${idx}`] ?? `${instId}_nc${idx}`;
  const selIds = new Set(selected.map((i) => i.id));
  const touched = new Map<string, { sel: string[]; out: string[] }>();
  const touch = (net: string, ref: string, isSel: boolean) => {
    const e = touched.get(net) ?? { sel: [], out: [] };
    const arr = isSel ? e.sel : e.out;
    if (!arr.includes(ref)) arr.push(ref);
    touched.set(net, e);
  };
  const pinPosOf = new Map<string, { x: number; y: number }>();
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    const isSel = selIds.has(inst.id);
    const ref = inst.label || inst.id;
    partPins(part, inst.params).forEach((_, idx) => {
      touch(pinNet(inst.id, idx), ref, isSel);
      try {
        const pp = pinPosition(inst, idx);
        pinPosOf.set(`${inst.id}:${idx}`, { x: pp.x, y: pp.y });
      } catch { /* Pin ohne Geometrie: ignorieren */ }
    });
  }

  // 3) Boundary-Netze in deterministischer Reihenfolge (Auswahl, dann Pin-Index).
  const orderedNets: string[] = [];
  for (const inst of selected) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    partPins(part, inst.params).forEach((_, idx) => {
      const net = pinNet(inst.id, idx);
      if (!orderedNets.includes(net)) orderedNets.push(net);
    });
  }
  const usedNames = new Set<string>();
  const boundaryNets: string[] = [];
  const internalNets: string[] = [];
  const portNameOf = new Map<string, string>();
  let autoPort = 1;
  for (const net of orderedNets) {
    const t = touched.get(net);
    if (!t || t.sel.length === 0) continue;
    if (net === "0") continue; // GND bleibt global
    if (t.out.length === 0) {
      internalNets.push(net);
      continue;
    }
    boundaryNets.push(net);
    let port = /^N\d+$/.test(net) ? "" : net;
    if (!port || usedNames.has(port.toUpperCase())) {
      do { port = `P${autoPort++}`; } while (usedNames.has(port.toUpperCase()));
    }
    usedNames.add(port.toUpperCase());
    portNameOf.set(net, port);
  }

  // 4) Geometrie einbeziehen: Drähte mit gewähltem Kontakt wandern mit.
  const selPinPts: Array<{ x: number; y: number }> = [];
  for (const inst of selected) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    partPins(part, inst.params).forEach((_, idx) => {
      const pp = pinPosOf.get(`${inst.id}:${idx}`);
      if (pp) selPinPts.push(pp);
    });
  }
  const nearSelPin = (x: number, y: number): boolean =>
    selPinPts.some((p) => dist2(x, y, p.x, p.y) <= EXTRACT_EPS * EXTRACT_EPS);
  const includedWires = doc.wires.filter((w) => {
    if (w.points.length === 0) return false;
    const a = w.points[0];
    const b = w.points[w.points.length - 1];
    return nearSelPin(a.x, a.y) || nearSelPin(b.x, b.y);
  });
  const onIncludedWire = (x: number, y: number): boolean =>
    includedWires.some((w) =>
      w.points.some((p, i) => {
        if (i === 0) return false;
        const q = w.points[i - 1];
        return pointOnSegment(x, y, q.x, q.y, p.x, p.y);
      }),
    );
  const knownNets = new Set([...boundaryNets, ...internalNets]);
  const includedLabels = doc.labels.filter(
    (l) => knownNets.has(l.name) && (nearSelPin(l.x, l.y) || onIncludedWire(l.x, l.y)),
  );
  const includedJunctions = (doc.junctions ?? []).filter((j) => onIncludedWire(j.x, j.y));
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const inst of selected) {
    try {
      const b = instanceBounds(inst);
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    } catch {
      minX = Math.min(minX, inst.x); minY = Math.min(minY, inst.y);
      maxX = Math.max(maxX, inst.x); maxY = Math.max(maxY, inst.y);
    }
  }
  const includedNotes = doc.notes.filter(
    (n) => n.x >= minX - 20 && n.x <= maxX + 20 && n.y >= minY - 20 && n.y <= maxY + 20,
  );

  // 5) Port-Anker: bevorzugt Außen-Pin auf einbezogenem Draht, sonst Innen-Pin.
  const wireEnds: Array<{ x: number; y: number }> = [];
  for (const w of includedWires) {
    if (w.points.length === 0) continue;
    wireEnds.push(w.points[0], w.points[w.points.length - 1]);
  }
  const boundary: ExtractBoundaryNet[] = boundaryNets.map((net) => {
    const outsidePins: Array<{ x: number; y: number }> = [];
    for (const inst of doc.instances) {
      if (selIds.has(inst.id)) continue;
      const part = PART_MAP[inst.partId];
      if (!part) continue;
      partPins(part, inst.params).forEach((_, idx) => {
        if (pinNet(inst.id, idx) !== net) return;
        const pp = pinPosOf.get(`${inst.id}:${idx}`);
        if (pp && !outsidePins.some((q) => dist2(q.x, q.y, pp.x, pp.y) <= EXTRACT_EPS * EXTRACT_EPS)) outsidePins.push(pp);
      });
    }
    const onWire = outsidePins.find((pp) => wireEnds.some((e) => dist2(e.x, e.y, pp.x, pp.y) <= EXTRACT_EPS * EXTRACT_EPS));
    let anchor = onWire;
    if (!anchor) {
      for (const inst of selected) {
        const part = PART_MAP[inst.partId];
        if (!part) continue;
        const pins = partPins(part, inst.params);
        for (let idx = 0; idx < pins.length; idx++) {
          if (pinNet(inst.id, idx) !== net) continue;
          const pp = pinPosOf.get(`${inst.id}:${idx}`);
          if (pp) { anchor = pp; break; }
        }
        if (anchor) break;
      }
    }
    const labelOnly = outsidePins.length === 0;
    if (labelOnly) warnings.push(`Netz „${net}“ ist außen nur per Name verbunden — der Port sitzt am Innen-Pin.`);
    return { port: portNameOf.get(net) ?? net, net, outsidePins, labelOnly, anchor: anchor ?? { x: 0, y: 0 } };
  });

  // 6) Schaltplan-Dokument bauen (Port-IDs erzwingen die Pin-Reihenfolge).
  const cloneJson = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  const portInstances: Instance[] = boundary.map((b, idx) => {
    const role = inferPortRole(b.port);
    const partId = role === "input" ? "port_in" : role === "output" || role === "vcc" ? "port_out" : "port_io";
    return {
      id: `xport_${String(idx).padStart(2, "0")}`,
      partId,
      x: Math.round((b.anchor.x + 30) / 10) * 10,
      y: Math.round(b.anchor.y / 10) * 10,
      rot: 0,
      label: b.port,
      params: { pname: b.port },
    };
  });
  const schematic: SchematicDoc = {
    id: `extract_${Date.now().toString(36)}`,
    name: "Extrahiert",
    instances: [...cloneJson(selected), ...portInstances],
    wires: cloneJson(includedWires),
    labels: cloneJson(includedLabels),
    notes: cloneJson(includedNotes),
    junctions: cloneJson(includedJunctions),
    probes: [],
  };
  if (boundary.length === 0) {
    warnings.push("Insellösung: kein Netz verlässt die Auswahl — im Editor Ports von Hand ergänzen oder Auswahl erweitern.");
  }

  return {
    ok: true, errors, warnings, schematic, boundary, internalNets,
    instances: selected.map((i) => ({
      ref: i.label || i.id,
      partName: PART_MAP[i.partId]?.name ?? i.partId,
      note: i.partId === "gnd" ? "Masse (global, kein Port)" : "",
    })),
    consumed: {
      instances: selected.map((i) => i.id),
      wires: includedWires.map((w) => w.id),
      labels: includedLabels.map((l) => l.id),
      junctions: includedJunctions.map((j) => j.id),
      notes: includedNotes.map((n) => n.id),
    },
    center: {
      x: Math.round((minX + maxX) / 20) * 10,
      y: Math.round((minY + maxY) / 20) * 10,
    },
  };
}


/**
 * Erzeugt ein auf das 10-px-Raster (GRID=10) ausgerichtetes Schaltzeichen
 * samt Pin-Definitionen aus einer CustomPartSpec.
 * Unterstützt sowohl automatisch platzierte Seiten-Pins als auch frei
 * positionierte Pins und ein komplett selbst gezeichnetes `customSymbol`.
 */
export function buildCustomGeometry(spec: CustomPartSpec): {
  pins: PinDef[];
  symbol: SymbolPrim[];
} {
  const left = spec.pins
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.side === "left");
  const right = spec.pins
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.side === "right");
  const top = spec.pins
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.side === "top");
  const bottom = spec.pins
    .map((p, idx) => ({ ...p, idx }))
    .filter((p) => p.side === "bottom");

  const maxVertCount = Math.max(left.length, right.length, 1);
  const maxHorizCount = Math.max(top.length, bottom.length, 1);

  const halfW = Math.max(30, Math.ceil((maxHorizCount * 20 + 20) / 20) * 10);
  const halfH = Math.max(20, Math.ceil((maxVertCount * 20 + 10) / 20) * 10);

  const pinOut: PinDef[] = new Array(spec.pins.length);
  const autoSymbol: SymbolPrim[] = [
    { t: "rect", x: -halfW, y: -halfH, w: halfW * 2, h: halfH * 2, r: 3 },
    { t: "arc", x: 0, y: -halfH, r: 5, a0: 0, a1: Math.PI },
    { t: "text", x: 0, y: -halfH + 13, s: spec.name.slice(0, 10), size: 8, align: "center" },
  ];

  const placeLinear = (count: number, i: number): number => {
    if (count === 1) return 0;
    const span = (count - 1) * 20;
    const start = -Math.round(span / 20) * 10;
    return start + i * 20;
  };

  const addPinVisuals = (
    p: CustomPinSpec & { idx: number },
    px: number,
    py: number,
    edgeX: number,
    edgeY: number,
    textX: number,
    textY: number,
    align: "left" | "right" | "center",
  ) => {
    const finalX = typeof p.x === "number" ? Math.round(p.x / 10) * 10 : px;
    const finalY = typeof p.y === "number" ? Math.round(p.y / 10) * 10 : py;
    // S3.4: Rolle -> elektrischer Pin-Typ (eigene VCC/GND-Pins sind Versorgungs-EINGÄNGE des ICs).
    pinOut[p.idx] = {
      name: p.name || `${p.idx + 1}`,
      x: finalX,
      y: finalY,
      electrical: p.role === "input" ? "input" : p.role === "output" ? "output" : p.role === "vcc" || p.role === "gnd" ? "power_in" : "passive",
    };

    if (!spec.customSymbol || spec.customSymbol.length === 0) {
      autoSymbol.push({ t: "line", pts: [finalX, finalY, edgeX, edgeY] });
      if (p.marker === "invert") {
        const bx = (finalX + edgeX) / 2;
        const by = (finalY + edgeY) / 2;
        autoSymbol.push({ t: "circle", x: bx, y: by, r: 3 });
      } else if (p.marker === "clock") {
        if (p.side === "left") {
          autoSymbol.push({ t: "line", pts: [edgeX, edgeY - 4, edgeX + 6, edgeY, edgeX, edgeY + 4] });
        } else if (p.side === "right") {
          autoSymbol.push({ t: "line", pts: [edgeX, edgeY - 4, edgeX - 6, edgeY, edgeX, edgeY + 4] });
        }
      }
      autoSymbol.push({
        t: "text",
        x: textX,
        y: textY,
        s: p.name || `${p.idx + 1}`,
        size: 8,
        align,
      });
    }
  };

  left.forEach((p, i) => {
    const py = placeLinear(left.length, i);
    addPinVisuals(p, -halfW - 10, py, -halfW, py, -halfW + 6, py + 3, "left");
  });

  right.forEach((p, i) => {
    const py = placeLinear(right.length, i);
    addPinVisuals(p, halfW + 10, py, halfW, py, halfW - 6, py + 3, "right");
  });

  top.forEach((p, i) => {
    const px = placeLinear(top.length, i);
    addPinVisuals(p, px, -halfH - 10, px, -halfH, px, -halfH + 11, "center");
  });

  bottom.forEach((p, i) => {
    const px = placeLinear(bottom.length, i);
    addPinVisuals(p, px, halfH + 10, px, halfH, px, halfH - 5, "center");
  });

  const finalSymbol =
    spec.customSymbol && spec.customSymbol.length > 0 ? spec.customSymbol : autoSymbol;

  return { pins: pinOut, symbol: finalSymbol };
}

/**
 * Übersetzt die Transistor-/Subcircuit-Innenschaltung (`spec.subcircuit`) einer
 * platzierten Bauteil-Instanz in echte MNA-Simulator-Devices (`Device[]`).
 */
export function compileSubcircuitToDevices(
  spec: CustomPartSpec,
  inst: { id: string; params?: Record<string, number | string | boolean> },
  externalPinNets: string[],
): Device[] {
  const elements = spec.subcircuit ?? [];
  if (elements.length === 0) return [];

  // Mappe interne Knotennamen -> externes Schaltplan-Netz (falls an Pin gebunden)
  // oder isoliertes Instanz-Netz `${inst.id}__sub_${node}`
  const portNodeToExternal = new Map<string, string>();
  spec.pins.forEach((pin, idx) => {
    const extNet = externalPinNets[idx] ?? "0";
    const intKey = (pin.internalNode || pin.name || `${idx + 1}`).trim();
    if (intKey) {
      portNodeToExternal.set(intKey, extNet);
      portNodeToExternal.set(intKey.toUpperCase(), extNet);
    }
    if (pin.name) {
      portNodeToExternal.set(pin.name.trim(), extNet);
      portNodeToExternal.set(pin.name.trim().toUpperCase(), extNet);
    }
    if (pin.role === "gnd") {
      portNodeToExternal.set("GND", extNet);
      portNodeToExternal.set("0", extNet);
    }
    if (pin.role === "vcc") {
      portNodeToExternal.set("VCC", extNet);
      portNodeToExternal.set("VDD", extNet);
    }
  });

  const resolveNode = (rawNode: string | undefined): string => {
    const clean = (rawNode || "0").trim();
    if (!clean || clean === "0") {
      return portNodeToExternal.get("GND") ?? portNodeToExternal.get("0") ?? "0";
    }
    const direct = portNodeToExternal.get(clean) ?? portNodeToExternal.get(clean.toUpperCase());
    if (direct) return direct;
    return `${inst.id}__sub_${clean}`;
  };

  const resolveValue = (el: SubcircuitElement): number => {
    if (el.paramKey && inst.params && inst.params[el.paramKey] !== undefined) {
      const v = Number(inst.params[el.paramKey]);
      if (Number.isFinite(v) && v > 0) return v;
    }
    return Number.isFinite(el.value) ? el.value : SUBCIRCUIT_ELEMENT_META[el.kind]?.defaultValue ?? 1;
  };

  const devices: Device[] = [];

  for (const el of elements) {
    const devId = `${inst.id}_${el.id}`;
    const n = el.nodes.map(resolveNode);
    const val = resolveValue(el);

    switch (el.kind) {
      case "resistor":
        devices.push({
          id: devId,
          type: "R",
          nodes: [n[0] ?? "0", n[1] ?? "0"],
          params: { r: Math.max(1e-3, val) },
        });
        break;
      case "capacitor":
        devices.push({
          id: devId,
          type: "C",
          nodes: [n[0] ?? "0", n[1] ?? "0"],
          params: { c: Math.max(1e-15, val), esr: 0.01 },
        });
        break;
      case "inductor":
        devices.push({
          id: devId,
          type: "L",
          nodes: [n[0] ?? "0", n[1] ?? "0"],
          params: { l: Math.max(1e-12, val), rser: 0.01 },
        });
        break;
      case "diode":
        devices.push({
          id: devId,
          type: "D",
          nodes: [n[0] ?? "0", n[1] ?? "0"],
          params: { is: 1e-14, n: Math.max(0.5, val || 1) },
        });
        break;
      case "zener":
        devices.push({
          id: devId,
          type: "ZENER",
          nodes: [n[0] ?? "0", n[1] ?? "0"],
          params: { vz: Math.max(0.7, val || 5.1), is: 1e-14, n: 1 },
        });
        break;
      case "npn":
      case "pnp":
        devices.push({
          id: devId,
          type: "Q",
          nodes: [n[0] ?? "0", n[1] ?? "0", n[2] ?? "0"],
          params: {
            bf: Math.max(5, val || 200),
            is: 1e-14,
            vaf: 100,
            br: 4,
            cje: 4.5e-12,
            cjc: 3.6e-12,
            pnp: el.kind === "pnp" ? 1 : 0,
          },
        });
        break;
      case "nmos":
      case "pmos":
        devices.push({
          id: devId,
          type: "M",
          nodes: [n[0] ?? "0", n[1] ?? "0", n[2] ?? "0"],
          params: {
            vto: Math.max(0.2, val || 2),
            kp: 2e-4,
            w: 1e-3,
            l: 1e-5,
            lambda: 0.02,
            cgs: 1e-11,
            pmos: el.kind === "pmos" ? 1 : 0,
          },
        });
        break;
      case "opamp":
        devices.push({
          id: devId,
          type: "OPAMP",
          nodes: [n[0] ?? "0", n[1] ?? "0", n[2] ?? "0", n[3] ?? "0", n[4] ?? "0"],
          params: {
            gain: Math.max(100, val || 100000),
            gbw: 1e6,
            rin: 2e6,
            rout: 75,
            vdrop: 0.6,
            vcc: 15,
            vee: -15,
          },
        });
        break;
      case "comparator":
        devices.push({
          id: devId,
          type: "COMPARATOR",
          nodes: [n[0] ?? "0", n[1] ?? "0", n[2] ?? "0", n[3] ?? "0", n[4] ?? "0"],
          params: {
            gain: Math.max(100, val || 200000),
            rout: 80,
            vcc: 9,
            vee: 0,
            vdrop: 0.2,
          },
        });
        break;
      case "vdc":
        devices.push({
          id: devId,
          type: "V",
          nodes: [n[0] ?? "0", n[1] ?? "0"],
          params: { rser: 0.05 },
          source: { kind: "dc", dc: val },
        });
        break;
      case "idc":
        devices.push({
          id: devId,
          type: "I",
          nodes: [n[0] ?? "0", n[1] ?? "0"],
          params: {},
          source: { kind: "dc", dc: val },
        });
        break;
      case "timer555_core":
        devices.push({
          id: devId,
          type: "TIMER555",
          nodes: [
            n[0] ?? "0",
            n[1] ?? "0",
            n[2] ?? "0",
            n[3] ?? "0",
            n[4] ?? "0",
            n[5] ?? "0",
            n[6] ?? "0",
            n[7] ?? "0",
          ],
          params: { vdd: val || 9 },
        });
        break;
    }
  }

  return devices;
}

/* ================= S6.1: Schaltplan-Innenschaltung (Editor 2.0) ================= */

export const PORT_PART_IDS = ["port_in", "port_out", "port_io"] as const;

/** S6.2 (Phase 2): Strenger Editor-Filter — diese Bauteile tragen elektrisch
 * nichts bei (Messgeräte, Displays, Zeichenhilfen, seitenlokale Verbinder)
 * und wären in einem Makro toter Ballast oder irreführend. */
export const EDITOR_DENY_PARTS: ReadonlySet<string> = new Set([
  "oscilloscope",
  "probe",
  "voltmeter",
  "ammeter",
  "lcd_16x2",
  "onpage_connector",
  "descbox",
  "bus_tap",
  "bus_splitter",
]);

/** Darf `partId` in den Bauteile-Editor gesetzt werden? Schließt das gerade
 * bearbeitete Teil (Selbsteinbau), die Deny-Liste und modellose Alt-Bauteile
 * (reine „ic“-Hüllen ohne Innenschaltung) aus. Ports sind immer erlaubt. */
export function isEditorPlaceable(partId: string, editingId?: string | null): boolean {
  if (editingId && partId === editingId) return false;
  if ((PORT_PART_IDS as readonly string[]).includes(partId)) return true;
  if (EDITOR_DENY_PARTS.has(partId)) return false;
  if (!PART_MAP[partId]) return false;
  const spec = CUSTOM_SPECS.get(partId);
  if (spec && !spec.schematic && !(spec.subcircuit && spec.subcircuit.length > 0)) return false;
  return true;
}

/** S6.2 (Phase 2): Außenpins aus den Ports eines Innen-Dokuments ableiten.
 * Seiten-Konvention: Eingänge links, Ausgänge rechts, Bidirektionale links;
 * `overrides` (Pin-Reiter/Symbol) können Seite, Markierung, Rolle und freie
 * Position je Port-Namen überschreiben. */
export function derivePinsFromPorts(
  doc: SchematicDoc,
  overrides?: Record<string, Partial<CustomPinSpec>>,
): CustomPinSpec[] {
  return collectPorts(doc).map((p) => {
    const ov = overrides?.[p.name];
    return {
      name: p.name,
      side: ov?.side ?? (p.role === "output" ? "right" : "left"),
      role: ov?.role ?? p.role,
      ...(ov?.marker ? { marker: ov.marker } : {}),
      internalNode: p.name,
      ...(ov?.x !== undefined ? { x: ov.x } : {}),
      ...(ov?.y !== undefined ? { y: ov.y } : {}),
    };
  });
}


export interface CollectedPort {
  instanceId: string;
  partId: string;
  role: PinRole;
  name: string;
}

export function portInstanceName(inst: Instance): string {
  const p = inst.params?.pname;
  if (typeof p === "string" && p.trim()) return p.trim();
  if (inst.label) return inst.label;
  return inst.id;
}

/** Alle Ports eines Innen-Dokuments, stabil nach Instanz-ID sortiert.
 * Die Reihenfolge definiert die Außenpin-Reihenfolge (Netz-Array). */
export function collectPorts(doc: SchematicDoc): CollectedPort[] {
  return doc.instances
    .filter((i) => (PORT_PART_IDS as readonly string[]).includes(i.partId))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((i) => ({
      instanceId: i.id,
      partId: i.partId,
      role: i.partId === "port_in" ? "input" : i.partId === "port_out" ? "output" : "signal",
      name: portInstanceName(i),
    }));
}

const MAX_SCHEMATIC_DEPTH = 8;
let schematicCompileDepth = 0;

/**
 * S6.1: Macro-Expansion einer Schaltplan-Innenschaltung. Das Innen-Doc wird
 * geklont (IDs präfixiert → Instanz-Isolation), per buildNets kompiliert und
 * danach umbenannt: Port-Netze → Außennetze, "0" bleibt global, alles andere
 * bekommt den Instanz-Präfix. Schachtelung läuft automatisch über PART_MAP;
 * der Tiefenzähler fängt Zyklen zur Laufzeit ab (statisch: findSpecCycle).
 * Fehler werfen (buildNets fängt je Instanz und meldet sie).
 */
export function compileSchematicToDevices(
  spec: CustomPartSpec,
  inst: { id: string; params?: Record<string, number | string | boolean> },
  externalPinNets: string[],
): Device[] {
  const doc = spec.schematic;
  if (!doc || doc.instances.length === 0) return [];
  if (schematicCompileDepth >= MAX_SCHEMATIC_DEPTH)
    throw new Error(`${spec.id}: Verschachtelungstiefe überschritten (zyklischer Einbau?)`);
  const ports = collectPorts(doc);
  if (ports.length !== spec.pins.length)
    throw new Error(`${spec.id}: ${ports.length} Ports im Schaltplan, aber ${spec.pins.length} Außenpins definiert`);
  const pre = `${inst.id}__`;
  const clone = JSON.parse(JSON.stringify(doc)) as SchematicDoc;
  clone.id = pre + doc.id;
  for (const i of clone.instances) {
    i.id = pre + i.id;
    i.label = "";
  }
  for (const w of clone.wires) w.id = pre + w.id;
  for (const l of clone.labels) l.id = pre + l.id;
  for (const j of clone.junctions ?? []) j.id = pre + j.id;
  // S6.2 (Phase 2): Freigegebene Parameter auf die gebundenen Innen-Werte
  // legen (Außenwert gewinnt, sonst Link-Default; Ziele auf dem präfixierten
  // Klon suchen, damit Instanzen untereinander isoliert bleiben).
  const byId = new Map(clone.instances.map((i) => [i.id, i]));
  for (const link of spec.paramLinks ?? []) {
    const v = inst.params?.[link.name] ?? link.def;
    for (const t of link.targets) {
      const inner = byId.get(pre + t.instanceId);
      if (inner) inner.params = { ...(inner.params ?? {}), [t.key]: v };
    }
  }
  schematicCompileDepth++;
  try {
    const built = buildNets(clone);
    if (built.errors.length > 0) throw new Error(`${spec.id} (innen): ${built.errors.join("; ")}`);
    const portNetOf = new Map<string, string>();
    ports.forEach((p, idx) => {
      const innerNet = built.pinNets[`${pre}${p.instanceId}:0`];
      if (innerNet === undefined) throw new Error(`${spec.id}: Port ${p.name} hat kein Netz`);
      portNetOf.set(innerNet, externalPinNets[idx] ?? "0");
    });
    return built.netlist.devices.map((d) => ({
      ...d,
      nodes: d.nodes.map((n) => portNetOf.get(n) ?? (n === "0" ? "0" : `${inst.id}__${n}`)),
    }));
  } finally {
    schematicCompileDepth--;
  }
}

export interface PartIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
  instanceId?: string;
}

/** Tiefensuche über das Spec-Register: Enthält `spec` (transitiv) sich selbst? */
export function findSpecCycle(spec: CustomPartSpec): string[] | null {
  const get = (id: string): CustomPartSpec | undefined => (id === spec.id ? spec : CUSTOM_SPECS.get(id));
  const path: string[] = [spec.id];
  const visit = (id: string): string[] | null => {
    for (const i of get(id)?.schematic?.instances ?? []) {
      if (i.partId !== spec.id && !CUSTOM_SPECS.has(i.partId)) continue;
      if (get(i.partId) === undefined) continue;
      if (path.includes(i.partId)) return [...path, i.partId];
      path.push(i.partId);
      const hit = visit(i.partId);
      if (hit) return hit;
      path.pop();
    }
    return null;
  };
  return visit(spec.id);
}

/** S6.1: Rein prüfbare Spec-Validierung (Editor zeigt Issues rot auf der Leinwand). */
export function validatePartSchematic(spec: CustomPartSpec): PartIssue[] {
  const issues: PartIssue[] = [];
  const doc = spec.schematic;
  if (!doc) {
    issues.push({ severity: "error", code: "no-doc", message: "Keine Innenschaltung vorhanden." });
    return issues;
  }
  const ports = collectPorts(doc);
  if (ports.length === 0)
    issues.push({
      severity: "error",
      code: "no-ports",
      message: "Keine Ports platziert – das Bauteil hätte keine Außenpins.",
    });
  const seen = new Map<string, string>();
  for (const p of ports) {
    const k = p.name.toUpperCase();
    if (seen.has(k))
      issues.push({ severity: "error", code: "dup-port", message: `Port-Name doppelt: „${p.name}"`, instanceId: p.instanceId });
    else seen.set(k, p.instanceId);
  }
  if (spec.pins.length > 0 && ports.length !== spec.pins.length)
    issues.push({
      severity: "error",
      code: "port-count",
      message: `${ports.length} Ports, aber ${spec.pins.length} Außenpins – erneut speichern.`,
    });
  for (const i of doc.instances) {
    if (!PART_MAP[i.partId])
      issues.push({ severity: "error", code: "unknown-part", message: `Unbekanntes Bauteil „${i.partId}"`, instanceId: i.id });
    if (i.partId === spec.id)
      issues.push({ severity: "error", code: "self-nesting", message: "Das Bauteil enthält sich selbst.", instanceId: i.id });
    else if (EDITOR_DENY_PARTS.has(i.partId))
      issues.push({
        severity: "error",
        code: "denied-part",
        message: `„${PART_MAP[i.partId]?.name ?? i.partId}“ trägt elektrisch nichts bei und ist im Bauteil nicht erlaubt.`,
        instanceId: i.id,
      });
  }
  // S6.2 (Phase 2): Freigegebene Parameter prüfen (Namen eindeutig/nicht leer,
  // Ziele müssen existieren und den Parameter-Key besitzen).
  const linkNames = new Set<string>();
  for (const link of spec.paramLinks ?? []) {
    const nm = link.name.trim();
    if (!nm) {
      issues.push({ severity: "error", code: "link-noname", message: "Ein freigegebener Parameter hat keinen Namen." });
      continue;
    }
    const k = nm.toUpperCase();
    if (linkNames.has(k))
      issues.push({ severity: "error", code: "link-dup", message: `Parameter-Name doppelt: „${nm}“` });
    else linkNames.add(k);
    if (link.targets.length === 0)
      issues.push({ severity: "warning", code: "link-orphan", message: `Parameter „${nm}“ steuert kein Bauteil.` });
    for (const t of link.targets) {
      const inner = doc.instances.find((x) => x.id === t.instanceId);
      if (!inner) {
        issues.push({ severity: "error", code: "link-dangling", message: `Parameter „${nm}“ verweist auf ein gelöschtes Bauteil.` });
        continue;
      }
      const pdef = PART_MAP[inner.partId];
      if (pdef && !pdef.params.some((p) => p.key === t.key))
        issues.push({
          severity: "error",
          code: "link-badkey",
          message: `Parameter „${nm}“: „${pdef.name}“ hat keinen Wert „${t.key}“.`,
          instanceId: t.instanceId,
        });
    }
  }
  const cycle = findSpecCycle(spec);
  if (cycle) issues.push({ severity: "error", code: "nest-cycle", message: `Verschachtelungs-Zyklus: ${cycle.join(" → ")}` });
  try {
    const built = buildNets(doc);
    for (const e of built.errors) {
      if (e.startsWith("Unbekanntes Bauteil")) continue; // oben schon präziser gemeldet
      issues.push({ severity: "error", code: "inner-net", message: e });
    }
    for (const p of ports) {
      const net = built.pinNets[`${p.instanceId}:0`];
      const info = built.nets.find((n) => n.name === net);
      if (info && info.pins.length <= 1)
        issues.push({ severity: "warning", code: "port-open", message: `Port „${p.name}" ist unverdrahtet.`, instanceId: p.instanceId });
    }
  } catch (e) {
    issues.push({ severity: "error", code: "inner-fail", message: `Innenschaltung fehlerhaft: ${(e as Error).message}` });
  }
  return issues;
}

const MIGRATE_PART: Record<SubcircuitElementKind, { part: string; param: string | null }> = {
  npn: { part: "npn_bc547", param: "bf" },
  pnp: { part: "pnp_bc557", param: "bf" },
  nmos: { part: "nmos_2n7000", param: "vto" },
  pmos: { part: "pmos_bs250", param: "vto" },
  diode: { part: "diode_1n4148", param: "n" },
  zener: { part: "diode_zener", param: "bv" },
  resistor: { part: "resistor", param: "r" },
  capacitor: { part: "capacitor", param: "c" },
  inductor: { part: "inductor", param: "l" },
  opamp: { part: "opamp_ideal", param: "gain" },
  comparator: { part: "comparator_lm393", param: "gain" },
  vdc: { part: "vdc", param: "dc" },
  idc: { part: "idc", param: "dc" },
  timer555_core: { part: "ne555", param: "vdd" },
};

/**
 * S6.1: Einmalige Überführung Legacy-Tabelle → Schaltplan-Dokument.
 * Elemente werden gestapelt, Innenknoten als Netzlabels angeheftet
 * (gleichnamige Labels verbinden virtuell — kein Routing nötig).
 * Ports entstehen in spec.pins-Reihenfolge (IDs erzwingen die Sortierung).
 */
export function migrateSubcircuitToDoc(spec: CustomPartSpec): SchematicDoc {
  const doc: SchematicDoc = {
    id: `mig_${spec.id}`,
    name: spec.name,
    instances: [],
    wires: [],
    labels: [],
    notes: [],
    probes: [],
  };
  (spec.subcircuit ?? []).forEach((el, ei) => {
    const m = MIGRATE_PART[el.kind];
    const part = PART_MAP[m.part];
    const inst: Instance = {
      id: `mig_${el.id}`,
      partId: m.part,
      x: 0,
      y: ei * 90,
      rot: 0,
      label: `${SUBCIRCUIT_ELEMENT_META[el.kind].refPrefix}${ei + 1}`,
      params: m.param && Number.isFinite(el.value) ? { [m.param]: el.value } : {},
    };
    if (el.paramKey) inst.params.__paramKey = el.paramKey; // Phase 2: Params-Bindung
    doc.instances.push(inst);
    const npins = part ? partPins(part, inst.params).length : el.nodes.length;
    el.nodes.forEach((node, pi) => {
      if (pi >= npins) return;
      let pos = { x: inst.x + 40, y: inst.y };
      try {
        pos = pinPosition(inst, pi);
      } catch {
        /* Pin-Geometrie fehlt: Label ans Bauteil */
      }
      doc.labels.push({ id: `migl_${el.id}_${pi}`, x: pos.x, y: pos.y, name: (node || "0").trim() || "0" });
    });
  });
  spec.pins.forEach((pin, idx) => {
    const dir = pin.role === "output" ? "port_out" : pin.role === "input" || pin.role === "vcc" ? "port_in" : "port_io";
    const id = `port_${String(idx).padStart(2, "0")}`;
    const inst: Instance = {
      id,
      partId: dir,
      x: dir === "port_out" ? 320 : -320,
      y: idx * 70 - (spec.pins.length - 1) * 35,
      rot: 0,
      label: pin.name,
      params: { pname: pin.name },
    };
    doc.instances.push(inst);
    try {
      const pos = pinPosition(inst, 0);
      doc.labels.push({ id: `migl_${id}`, x: pos.x, y: pos.y, name: (pin.internalNode || pin.name || "0").trim() || "0" });
    } catch {
      /* Port-Pin fehlt: kein Label */
    }
  });
  return doc;
}

export function specToPartDef(spec: CustomPartSpec): PartDef {
  const { pins, symbol } = buildCustomGeometry(spec);
  const valDef = spec.defaultValue ?? (spec.modelKind === "resistor" ? 1000 : spec.modelKind === "vreg" ? 5 : 5);

  const paramDefs: ParamDef[] =
    spec.paramLinks && spec.paramLinks.length > 0
      ? spec.paramLinks.map((link) => ({
          key: link.name,
          label: link.label || link.name,
          unit: link.unit || undefined,
          type: typeof link.def === "number" ? "number" : typeof link.def === "boolean" ? "bool" : "text",
          def: link.def,
          ...(link.min !== undefined ? { min: link.min } : {}),
          ...(link.max !== undefined ? { max: link.max } : {}),
          ...(link.step !== undefined ? { step: link.step } : {}),
        }))
      : spec.customParams && spec.customParams.length > 0
      ? spec.customParams.map((cp) => ({
          key: cp.key,
          label: cp.label,
          unit: cp.unit || undefined,
          type: "number",
          def: cp.def,
        }))
      : spec.modelKind === "resistor"
        ? [{ key: "r", label: "Widerstand", unit: "Ω", type: "number", def: valDef }]
        : spec.modelKind === "vreg"
          ? [{ key: "vout", label: "Ausgangsspannung", unit: "V", type: "number", def: valDef }]
          : [{ key: "vdd", label: "Pegel / Versorgung", unit: "V", type: "number", def: valDef }];

  return {
    id: spec.id,
    name: spec.name,
    ref: spec.ref || "U",
    category: spec.category || "Eigene Bauteile/ICs",
    tags: ["custom", "eigenes bauteil", spec.name.toLowerCase(), spec.footprint.toLowerCase()],
    mount: spec.mount,
    footprint: spec.footprint,
    description:
      spec.description ||
      `Benutzerdefiniertes Bauteil (${spec.footprint}, ${spec.pins.length} Pins${
        spec.schematic?.instances.length
          ? `, Innenschaltung (${spec.schematic.instances.length} Teile)`
          : spec.subcircuit?.length
            ? `, ${spec.subcircuit.length} interne Elemente`
            : ""
      })`,
    pins,
    symbol,
    params: paramDefs,
    toDevices: (inst, nets): Device[] => {
      // S6.1: Schaltplan-Innenschaltung hat Vorrang (Macro-Expansion).
      if (spec.schematic && spec.schematic.instances.length > 0) {
        return compileSchematicToDevices(spec, inst, nets);
      }
      // W120: Falls eine Transistor-/Subcircuit-Innenschaltung definiert ist,
      // wird diese direkt in echte MNA-Simulator-Devices übersetzt!
      if (spec.subcircuit && spec.subcircuit.length > 0) {
        const subDevs = compileSubcircuitToDevices(spec, inst, nets);
        if (subDevs.length > 0) return subDevs;
      }
      if (spec.modelKind === "resistor" && nets.length >= 2) {
        const r = Number(inst.params?.r ?? valDef) || 1000;
        return [{ id: inst.id, type: "R", nodes: [nets[0], nets[1]], params: { r } }];
      }
      if (spec.modelKind === "diode" && nets.length >= 2) {
        return [{ id: inst.id, type: "D", nodes: [nets[0], nets[1]], params: { is: 1e-14, n: 1 } }];
      }
      if (spec.modelKind === "vreg" && nets.length >= 3) {
        const vout = Number(inst.params?.vout ?? valDef) || 5;
        return [{ id: inst.id, type: "VREG", nodes: [nets[0], nets[2], nets[1]], params: { vout, dropout: 1.5, rout: 0.1 } }];
      }
      const gndIdx = spec.pins.findIndex((p) => p.role === "gnd");
      const vccIdx = spec.pins.findIndex((p) => p.role === "vcc");
      const refNode = gndIdx >= 0 && nets[gndIdx] ? nets[gndIdx] : "0";
      const vccNode = vccIdx >= 0 && nets[vccIdx] ? nets[vccIdx] : null;
      const devs: Device[] = [];
      spec.pins.forEach((p, idx) => {
        const n = nets[idx] ?? "0";
        if (idx === gndIdx || n === refNode) return;
        if (p.role === "vcc") {
          devs.push({ id: `${inst.id}_sup_${idx}`, type: "R", nodes: [n, refNode], params: { r: 5000 } });
        } else if (p.role === "input") {
          devs.push({ id: `${inst.id}_in_${idx}`, type: "R", nodes: [n, refNode], params: { r: 1e6 } });
        } else if (p.role === "output") {
          const target = vccNode ?? refNode;
          devs.push({ id: `${inst.id}_out_${idx}`, type: "R", nodes: [n, target], params: { r: 100 } });
        } else {
          devs.push({ id: `${inst.id}_sig_${idx}`, type: "R", nodes: [n, refNode], params: { r: 10000 } });
        }
      });
      if (devs.length === 0 && nets.length >= 2) {
        devs.push({ id: inst.id, type: "R", nodes: [nets[0], nets[1]], params: { r: 10000 } });
      }
      return devs;
    },
  };
}

export function registerCustomPart(spec: CustomPartSpec): PartDef {
  CUSTOM_SPECS.set(spec.id, spec);
  const def = specToPartDef(spec);
  PART_MAP[def.id] = def;
  const existingIdx = PARTS.findIndex((p) => p.id === def.id);
  if (existingIdx >= 0) {
    PARTS[existingIdx] = def;
  } else {
    PARTS.unshift(def);
  }
  return def;
}

export function loadCustomParts(): CustomPartSpec[] {
  if (typeof window === "undefined") return [];
  try {
    let list: CustomPartSpec[] | null = null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      list = JSON.parse(raw) as CustomPartSpec[];
    } else if (window.multispiceDesktop?.loadAppDataSync) {
      list = window.multispiceDesktop.loadAppDataSync(STORAGE_KEY) as CustomPartSpec[] | null;
    }
    if (!Array.isArray(list)) return [];
    for (const spec of list) {
      if (spec && spec.id && Array.isArray(spec.pins)) {
        registerCustomPart(spec);
      }
    }
    return list;
  } catch {
    return [];
  }
}

export function saveCustomPart(spec: CustomPartSpec): CustomPartSpec[] {
  const list = loadCustomParts();
  const idx = list.findIndex((x) => x.id === spec.id);
  if (idx >= 0) list[idx] = spec;
  else list.unshift(spec);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
  try {
    window.multispiceDesktop?.saveAppData?.(STORAGE_KEY, list);
  } catch {}
  registerCustomPart(spec);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("multispice-custom-parts"));
  }
  return list;
}

export function deleteCustomPart(id: string): CustomPartSpec[] {
  const list = loadCustomParts().filter((x) => x.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {}
  try {
    window.multispiceDesktop?.saveAppData?.(STORAGE_KEY, list);
  } catch {}
  delete PART_MAP[id];
  CUSTOM_SPECS.delete(id);
  const pIdx = PARTS.findIndex((p) => p.id === id);
  if (pIdx >= 0) PARTS.splice(pIdx, 1);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("multispice-custom-parts"));
  }
  return list;
}
