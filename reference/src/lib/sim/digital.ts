/**
 * CircuitBench digital engine.
 *
 * A deterministic event-driven logic simulator running on the same
 * connectivity graph as the analog solver. It drives the Logic Analyzer,
 * logic probes and LED indicators with genuinely simulated levels.
 */
import type { NetGraph, Sheet } from "@/lib/domain/types";
import { getDef } from "@/lib/domain/library";
import { pinPos } from "@/lib/domain/connectivity";

export type LogicLevel = 0 | 1 | "X";

export interface DigitalSignal {
  name: string;
  netId: string;
  samples: LogicLevel[];
}

export interface DigitalResult {
  times: number[];
  signals: DigitalSignal[];
  levels: Record<string, LogicLevel>;
  steps: number;
  log: string[];
}

interface Gate {
  ref: string;
  kind: string;
  inputs: string[];
  output: string;
  delay: number;
  state: LogicLevel;
}

export function runDigital(
  sheet: Sheet,
  graph: NetGraph,
  params: { tstop: number; points?: number; threshold?: number },
): DigitalResult {
  const log: string[] = [];
  const nodeOfPin = (compId: string, pinId: string): string | null => {
    const netId = graph.pinToNet[`${compId}:${pinId}`];
    if (!netId) return null;
    return netId;
  };

  const gates: Gate[] = [];
  const sources: { netId: string; kind: "clock" | "input"; freq: number; duty: number; state: LogicLevel; ref: string }[] = [];
  const flipflops: {
    ref: string;
    d: string | null;
    clk: string | null;
    rst: string | null;
    q: string | null;
    qn: string | null;
    lastClk: LogicLevel;
    qState: LogicLevel;
    tco: number;
  }[] = [];
  const indicators: { netId: string | null; ref: string; pin: string }[] = [];
  const named = new Set<string>();

  for (const comp of sheet.components) {
    const def = getDef(comp.defId);
    if (!def || def.kind !== "digital") continue;
    const props = comp.props;
    const p = (id: string) => nodeOfPin(comp.id, id);
    switch (comp.defId) {
      case "logic_clk":
        if (p("out")) {
          sources.push({
            netId: p("out")!,
            kind: "clock",
            freq: Number.parseFloat(props.frequency || "1000") || 1000,
            duty: Number.parseFloat(props.duty || "50") / 100,
            state: props.state === "1" ? 1 : 0,
            ref: comp.ref,
          });
          named.add(p("out")!);
        }
        break;
      case "logic_in":
        if (p("out")) {
          sources.push({
            netId: p("out")!,
            kind: "input",
            freq: 0,
            duty: 0.5,
            state: props.state === "1" ? 1 : 0,
            ref: comp.ref,
          });
        }
        break;
      case "not":
      case "buffer":
      case "and":
      case "or":
      case "nand":
      case "nor":
      case "xor": {
        const ins = def.pins.filter((x) => x.type === "input").map((x) => p(x.id));
        const out = p(def.pins.find((x) => x.type === "output")!.id);
        if (out) {
          gates.push({
            ref: comp.ref,
            kind: comp.defId,
            inputs: ins.filter(Boolean) as string[],
            output: out,
            delay: Number.parseFloat(props.tDelay || "0") || 0,
            state: "X",
          });
        }
        break;
      }
      case "dff":
        flipflops.push({
          ref: comp.ref,
          d: p("D"),
          clk: p("CLK"),
          rst: null,
          q: p("Q"),
          qn: p("QN"),
          lastClk: "X",
          qState: 0,
          tco: Number.parseFloat(props.tclkq || "0") || 0,
        });
        break;
      case "counter":
        flipflops.push({
          ref: comp.ref,
          d: "counter",
          clk: p("CLK"),
          rst: p("RST"),
          q: p("Q0"),
          qn: p("Q1"),
          lastClk: "X",
          qState: 0,
          tco: 0,
        });
        break;
      case "logic_probe":
      case "led_ind":
        if (p("in") || p("A")) indicators.push({ netId: p("in") ?? p("A"), ref: comp.ref, pin: "in" });
        break;
      default:
        break;
    }
  }

  const netIds = new Set<string>();
  for (const s of sources) netIds.add(s.netId);
  for (const g of gates) {
    netIds.add(g.output);
    g.inputs.forEach((i) => netIds.add(i));
  }
  for (const f of flipflops) {
    [f.d, f.clk, f.rst, f.q, f.qn].forEach((n) => n && netIds.add(n));
  }
  for (const i of indicators) if (i.netId) netIds.add(i.netId);

  const states = new Map<string, LogicLevel>();
  for (const id of netIds) states.set(id, "X");
  for (const s of sources) states.set(s.netId, s.state);

  const points = Math.min(4000, Math.max(200, params.points ?? 1200));
  const tstop = params.tstop || 0.01;
  const dt = tstop / (points - 1);
  const times: number[] = [];
  const signalList: DigitalSignal[] = [...netIds].map((id) => ({
    name: netName(id),
    netId: id,
    samples: [],
  }));

  let counterValue = 0;
  const pending = new Map<string, { at: number; level: LogicLevel }>();

  for (let step = 0; step < points; step++) {
    const t = step * dt;

    // apply scheduled delays
    for (const [id, p] of [...pending]) {
      if (p.at <= t) {
        states.set(id, p.level);
        pending.delete(id);
      }
    }

    // drive sources
    for (const s of sources) {
      if (s.kind === "clock") {
        const ph = (t * s.freq) % 1;
        states.set(s.netId, ph < s.duty ? 1 : 0);
      } else {
        states.set(s.netId, s.state);
      }
    }

    // settle combinational logic (bounded iteration)
    for (let iter = 0; iter < 32; iter++) {
      let changed = false;
      for (const g of gates) {
        const out = evalGate(g.kind, g.inputs.map((i) => states.get(i) ?? "X"));
        const cur = states.get(g.output) ?? "X";
        if (out !== cur && !pending.has(g.output)) {
          if (g.delay > 0) pending.set(g.output, { at: t + g.delay, level: out });
          else {
            states.set(g.output, out);
            changed = true;
          }
        }
      }
      // sequential blocks
      for (const f of flipflops) {
        const clk = f.clk ? states.get(f.clk) ?? "X" : "X";
        const rising = clk === 1 && f.lastClk === 0;
        if (f.ref && f.d === "counter") {
          const rst = f.rst ? states.get(f.rst) ?? 0 : 0;
          if (rst === 1) counterValue = 0;
          else if (rising) counterValue = (counterValue + 1) % 16;
          for (let bit = 0; bit < 4; bit++) {
            const node = bit === 0 ? f.q : bit === 1 ? f.qn : bit === 2 ? f.rst : f.d;
            void node;
          }
          const bits = [f.q, f.qn, f.rst, f.d];
          void bits;
          // outputs are Q0..Q3 which we stored in q/qn/rst/d slots
          if (f.q) states.set(f.q, (counterValue >> 0) & 1 ? 1 : 0);
          if (f.qn) states.set(f.qn, (counterValue >> 1) & 1 ? 1 : 0);
          if (f.rst && f.rst !== f.clk) states.set(f.rst, (counterValue >> 2) & 1 ? 1 : 0);
          if (f.d && f.d !== "counter") states.set(f.d, (counterValue >> 3) & 1 ? 1 : 0);
        } else if (rising) {
          const d = f.d ? states.get(f.d) ?? "X" : "X";
          f.qState = d === 1 ? 1 : d === 0 ? 0 : "X";
          if (f.q) states.set(f.q, f.qState);
          if (f.qn) states.set(f.qn, f.qState === 1 ? 0 : f.qState === 0 ? 1 : "X");
        }
        f.lastClk = clk;
      }
      if (!changed) break;
    }

    times.push(t);
    for (const sig of signalList) sig.samples.push(states.get(sig.netId) ?? "X");
  }

  log.push(
    `digital simulation: ${signalList.length} nets, ${gates.length} gates, ${flipflops.length} sequential blocks, ${points} samples`,
  );
  return {
    times,
    signals: signalList,
    levels: Object.fromEntries([...states]) as Record<string, LogicLevel>,
    steps: points,
    log,
  };

  function netName(id: string): string {
    const net = graph.netById[id];
    return net ? net.name : id;
  }
}

function evalGate(kind: string, ins: LogicLevel[]): LogicLevel {
  const vals = ins.filter((x) => x !== "X") as (0 | 1)[];
  if (ins.length === 0) return "X";
  if (vals.length !== ins.length) {
    // partially unknown: still deterministic for some gates
    if (kind === "and" && ins.some((x) => x === 0)) return 0;
    if (kind === "or" && ins.some((x) => x === 1)) return 1;
    if (kind === "nand" && ins.some((x) => x === 0)) return 1;
    if (kind === "nor" && ins.some((x) => x === 1)) return 0;
    return "X";
  }
  switch (kind) {
    case "not":
      return vals[0] ? 0 : 1;
    case "buffer":
      return vals[0];
    case "and":
      return vals.every((v) => v) ? 1 : 0;
    case "or":
      return vals.some((v) => v) ? 1 : 0;
    case "nand":
      return vals.every((v) => v) ? 0 : 1;
    case "nor":
      return vals.some((v) => v) ? 0 : 1;
    case "xor":
      return vals.reduce<number>((a, b) => a ^ b, 0) ? 1 : 0;
    default:
      return "X";
  }
}

/** Flip a logic input source at a given schematic position. */
export function findLogicInputAt(sheet: Sheet, x: number, y: number): string | null {
  for (const comp of sheet.components) {
    if (comp.defId !== "logic_in") continue;
    if (Math.abs(comp.x - x) < 25 && Math.abs(comp.y - y) < 25) return comp.id;
  }
  void pinPos;
  return null;
}
