import type { Component, Instrument, Probe, ProjectDoc, Sheet, Wire } from "./types";
import { defaultProps, getDef } from "./library";

/** Built-in example designs used by File ▸ Examples and as the start document. */

function comp(
  id: string,
  defId: string,
  ref: string,
  x: number,
  y: number,
  props: Record<string, string> = {},
  rot: 0 | 90 | 180 | 270 = 0,
): Component {
  const def = getDef(defId)!;
  return {
    id,
    defId,
    ref,
    x,
    y,
    rot,
    mirror: false,
    props: { ...defaultProps(def), ...props },
    showRef: true,
    showValue: true,
    showPins: false,
  };
}

function wire(id: string, points: [number, number][]): Wire {
  return { id, points: points.map(([x, y]) => ({ x, y })) };
}

function probe(id: string, name: string, x: number, y: number, color: string, type: Probe["type"] = "voltage"): Probe {
  return { id, type, name, color, x, y, plotVisible: true };
}

function gnd(id: string, x: number, y: number): Component {
  return comp(id, "gnd", "GND", x, y);
}

function scope(id: string, ref: string, x: number, y: number): { comp: Component; inst: Instrument } {
  const def = getDef("osc")!;
  return {
    comp: {
      id,
      defId: "osc",
      ref,
      x,
      y,
      rot: 0,
      mirror: false,
      props: defaultProps(def),
      showRef: true,
      showValue: true,
      showPins: true,
    },
    inst: {
      id: `${id}_inst`,
      kind: "oscilloscope",
      ref,
      x,
      y,
      componentId: id,
      name: `Oscilloscope ${ref}`,
      cfg: {
        timeDiv: "0.0005",
        ch0On: "1",
        ch0Src: "V(N_IN)",
        ch0Scale: "2",
        ch0Pos: "2",
        ch0Coupling: "DC",
        ch1On: "1",
        ch1Src: "V(N_OUT)",
        ch1Scale: "1",
        ch1Pos: "-2",
        ch1Coupling: "DC",
        triggerEdge: "rising",
        triggerLevel: "0",
      },
      window: { x: 620, y: 96, w: 520, h: 340, open: true, docked: false, z: 1 },
    },
  };
}

export type ExampleKey = "rc" | "diode" | "digital";

export function exampleSheet(key: ExampleKey): Sheet {
  if (key === "diode") return diodeSheet();
  if (key === "digital") return digitalSheet();
  return rcSheet();
}

function rcSheet(): Sheet {
  const sc = scope("xsc1", "XSC1", 620, 220);
  return {
    id: "sheet_rc",
    name: "RC Low-Pass",
    width: 1400,
    height: 900,
    components: [
      comp("v1", "vsine", "V1", 200, 200, { amplitude: "5", frequency: "1k", offset: "0" }),
      comp("r1", "resistor", "R1", 360, 120, { resistance: "1k" }),
      comp("c1", "capacitor", "C1", 480, 200, { capacitance: "100n" }, 90),
      gnd("gnd1", 200, 300),
      gnd("gnd2", 480, 300),
      sc.comp,
    ],
    wires: [
      wire("w1", [
        [200, 170],
        [200, 120],
        [330, 120],
      ]),
      wire("w2", [
        [390, 120],
        [480, 120],
        [560, 120],
      ]),
      wire("w3", [
        [480, 170],
        [480, 120],
      ]),
      wire("w4", [
        [480, 230],
        [480, 280],
      ]),
      wire("w5", [
        [200, 230],
        [200, 280],
      ]),
    ],
    labels: [
      { id: "lb1", kind: "net", text: "N_IN", x: 250, y: 120, rot: 0 },
      { id: "lb2", kind: "net", text: "N_OUT", x: 530, y: 120, rot: 0 },
      {
        id: "tx1",
        kind: "text",
        text: "RC low-pass · fc ≈ 1.6 kHz",
        x: 210,
        y: 60,
        rot: 0,
      },
    ],
    probes: [
      probe("pr1", "V_IN", 300, 120, "#c77a16"),
      probe("pr2", "V_OUT", 560, 120, "#1f5fd0"),
      probe("pr3", "I_R1", 360, 120, "#2e7a4f", "current"),
    ],
    instruments: [sc.inst],
  };
}

function diodeSheet(): Sheet {
  return {
    id: "sheet_diode",
    name: "Diode Rectifier",
    width: 1400,
    height: 900,
    components: [
      comp("v1", "vsine", "V1", 200, 200, { amplitude: "5", frequency: "1k" }),
      comp("r1", "resistor", "R1", 360, 120, { resistance: "470" }),
      comp("d1", "diode", "D1", 480, 200, {}, 90),
      comp("rl", "resistor", "RL", 620, 200, { resistance: "10k" }, 90),
      gnd("gnd1", 200, 300),
      gnd("gnd2", 480, 300),
    ],
    wires: [
      wire("w1", [
        [200, 170],
        [200, 120],
        [330, 120],
      ]),
      wire("w2", [
        [390, 120],
        [480, 120],
        [700, 120],
      ]),
      wire("w3", [
        [480, 170],
        [480, 120],
      ]),
      wire("w4", [
        [480, 230],
        [480, 280],
      ]),
      wire("w5", [
        [200, 230],
        [200, 280],
      ]),
      wire("w6", [
        [620, 170],
        [620, 120],
      ]),
      wire("w7", [
        [620, 230],
        [620, 280],
      ]),
    ],
    labels: [
      { id: "lb1", kind: "net", text: "AC_IN", x: 250, y: 120, rot: 0 },
      { id: "lb2", kind: "net", text: "RECT", x: 540, y: 120, rot: 0 },
      { id: "tx1", kind: "text", text: "Half-wave rectifier · run a DC sweep of V1 from −5 V to +5 V", x: 200, y: 60, rot: 0 },
    ],
    probes: [probe("pr1", "V_RECT", 560, 120, "#1f5fd0"), probe("pr2", "I_D", 480, 200, "#b3372c", "current")],
    instruments: [],
  };
}

function digitalSheet(): Sheet {
  return {
    id: "sheet_digital",
    name: "Digital Counter",
    width: 1400,
    height: 900,
    components: [
      comp("clk", "logic_clk", "XG1", 220, 200, { frequency: "500", duty: "50" }),
      comp("u1", "counter", "U1", 460, 200),
      comp("inv", "not", "U2", 680, 120),
      gnd("gnd1", 340, 300),
    ],
    wires: [
      wire("w1", [
        [250, 200],
        [320, 200],
        [320, 190],
        [420, 190],
      ]),
      wire("w2", [
        [420, 210],
        [340, 210],
        [340, 280],
      ]),
      wire("w3", [
        [500, 180],
        [600, 180],
        [600, 120],
        [650, 120],
      ]),
      wire("w4", [
        [500, 193],
        [560, 193],
      ]),
      wire("w5", [
        [500, 206],
        [580, 206],
      ]),
      wire("w6", [
        [500, 219],
        [620, 219],
      ]),
      wire("w7", [
        [710, 120],
        [780, 120],
      ]),
    ],
    labels: [
      { id: "lb1", kind: "net", text: "CLK", x: 300, y: 200, rot: 0 },
      { id: "tx1", kind: "text", text: "4-bit ripple counter · place a Logic Analyzer on Q0…Q3", x: 210, y: 60, rot: 0 },
    ],
    probes: [probe("pr1", "Q0", 560, 180, "#1f5fd0")],
    instruments: [
      {
        id: "xla1_inst",
        kind: "logic",
        ref: "XLA1",
        x: 700,
        y: 320,
        name: "Logic Analyzer 1",
        cfg: { channels: "8", radix: "hex" },
        window: { x: 560, y: 120, w: 620, h: 340, open: true, docked: false, z: 1 },
      },
    ],
  };
}

export function exampleProject(key: ExampleKey, name: string): Partial<ProjectDoc> {
  return {
    name,
    description:
      key === "rc"
        ? "RC low-pass filter with sine source, transient analysis, voltage probes and a bench oscilloscope."
        : key === "diode"
          ? "Half-wave rectifier — run a DC sweep of V1 to plot the diode characteristic."
          : "4-bit ripple counter with a logic clock, inverter and a logic analyzer.",
    sheets: [exampleSheet(key)],
  };
}
