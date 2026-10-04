/**
 * Client-seitiger Analyse-Runner.
 *
 * Führt alle SPICE-Analysen direkt im Browser aus — derselbe Kernel
 * (`./analyses`), den früher die `/api/simulate`-Route auf dem Server
 * aufgerufen hat. Kein Netzwerk, keine Persistenz, keine Überraschungen:
 * Was reinkommt (`SchematicDoc`), kommt als Ergebnis wieder heraus.
 */

import { buildNets, SchematicDoc } from "@/lib/schematic/model";
import {
  acLinearizationWarnings,
  runAcSweep,
  runBatched,
  runDcSweep,
  runFourier,
  runIvCurve,
  runMonteCarlo,
  runNestedSweep,
  runNoise,
  runNoiseFigure,
  runOperatingPoint,
  runParamSweep,
  runPoleZero,
  runSensitivity,
  runSParams,
  runTempSweep,
  runThd,
  runThdSweep,
  runTransferFunction,
  runTransient,
  runWorstCase,
  SweepSpec,
} from "./analyses";
import { SimOptions } from "./engine";
import type { ProgressFn } from "./analyses";

export interface AnalysisPayload {
  outputs?: string[];
  options?: Partial<SimOptions>;
  sweep?: SweepSpec;
  tran?: { stopTime: number; stepTime: number; maxPoints?: number };
  sourceId?: string;
  outNode?: string;
  fundamental?: number;
  harmonics?: number;
  runs?: number;
  tolerance?: number;
  temps?: number[];
  measure?: "vout-peak" | "vout-rms" | "vout-dc" | "gain-db";
  stepSourceId?: string | null;
  stepValues?: number[];
  measureDeviceId?: string;
  param?: string;
  param2?: string;
  sweep2?: SweepSpec;
  levels?: number[];
  mode?: string;
  order?: number;
  z0?: number;
  frequency?: number;
  inNode?: string;
  /**
   * S2.1: Fortschritt 0..1 (nur lokal gesetzt — Funktionen überleben kein
   * structured-clone, der Worker hängt den Callback daher selbst an).
   */
  progress?: ProgressFn;
}

export interface AnalysisReport {
  kind: string;
  durationMs: number;
  result: unknown;
  nets: string[];
  errors: string[];
  warnings: string[];
  summary: Record<string, unknown>;
  /** S2.2: Konvergenz-Diagnose des Kernels (nur bei Fehlschlag belegt). */
  convergence?: "singular" | "nonconvergent";
  suspects?: string[];
}

/**
 * Führt eine Analyse synchron aus. Wirft einen `Error` mit lesbarer
 * deutscher Meldung, wenn `kind` unbekannt ist oder der Kernel scheitert.
 */
export function runAnalysisLocal(doc: SchematicDoc, kind: string, payload: AnalysisPayload = {}): AnalysisReport {
  const started = Date.now();
  if (!doc) throw new Error("Kein Schaltplan übergeben");

  const built = buildNets(doc);
  const netlist = built.netlist;
  const options = payload.options ?? {};
  const outputs = (payload.outputs ?? []).filter(Boolean);
  const tran = payload.tran ?? { stopTime: 0.02, stepTime: 1e-5 };
  const sweep: SweepSpec = payload.sweep ?? { start: 10, stop: 1e6, points: 20, type: "dec" };
  const outNode = payload.outNode ?? outputs[0] ?? built.nets[0]?.name ?? "0";

  let result: unknown;
  let summary: Record<string, unknown> = {};

  switch (kind) {
    case "op": {
      const r = runOperatingPoint(netlist, options);
      result = r;
      summary = { ok: r.ok, nodes: Object.keys(r.nodes).length };
      break;
    }
    case "tran": {
      const r = runTransient(netlist, options, { ...tran, maxPoints: tran.maxPoints ?? 5000 }, outputs.length ? outputs : [outNode], payload.progress);
      result = r;
      summary = { ok: r.ok, steps: r.steps, points: r.time.length };
      break;
    }
    case "ac": {
      const r = runAcSweep(netlist, options, sweep, outputs.length ? outputs : [outNode], payload.progress);
      result = r;
      summary = { ok: r.ok, points: r.freq.length };
      break;
    }
    case "dc": {
      const r = runDcSweep(netlist, options, payload.sourceId ?? "", sweep, outputs.length ? outputs : [outNode], payload.progress);
      result = r;
      summary = { ok: r.ok, points: r.values.length };
      break;
    }
    case "noise": {
      const r = runNoise(netlist, options, sweep, outNode, payload.sourceId ?? "", payload.progress);
      result = r;
      summary = { ok: r.ok, totalRms: r.totalRms };
      break;
    }
    case "thd": {
      const r = runThd(netlist, options, payload.fundamental ?? 1000, outNode);
      result = r;
      summary = { thd: r.thdPercent };
      break;
    }
    case "montecarlo": {
      const r = runMonteCarlo(
        netlist,
        options,
        { runs: payload.runs ?? 50, tolerance: payload.tolerance ?? 5, measure: payload.measure ?? "vout-peak", outNode },
        { ...tran, maxPoints: 2000 },
        payload.progress,
      );
      result = r;
      summary = { mean: r.mean, sigma: r.sigma };
      break;
    }
    case "worstcase": {
      const r = runWorstCase(
        netlist,
        options,
        { runs: 1, tolerance: payload.tolerance ?? 5, measure: payload.measure ?? "vout-peak", outNode },
        { ...tran, maxPoints: 2000 },
        payload.progress,
      );
      result = r;
      summary = { nominal: r.nominal, low: r.low, high: r.high };
      break;
    }
    case "temp": {
      const r = runTempSweep(
        netlist,
        options,
        payload.temps ?? [-40, 0, 25, 50, 85, 125],
        { runs: 1, tolerance: 0, measure: payload.measure ?? "vout-dc", outNode },
        { ...tran, maxPoints: 2000 },
        payload.progress,
      );
      result = r;
      summary = { points: r.temps.length };
      break;
    }
    case "iv": {
      const r = runIvCurve(
        netlist,
        options,
        payload.sourceId ?? "",
        sweep,
        payload.stepSourceId ?? null,
        payload.stepValues ?? [],
        payload.measureDeviceId ?? "",
      );
      result = { curves: r };
      summary = { curves: r.length };
      break;
    }
    case "param": {
      const r = runParamSweep(netlist, options, payload.param ?? "R1.resistance", sweep, outputs.length ? outputs : [outNode], payload.tran, payload.progress);
      result = r;
      summary = { values: r.values.length, ok: r.ok };
      break;
    }
    case "nested": {
      const sweep2: SweepSpec = payload.sweep2 ?? sweep;
      const r = runNestedSweep(
        netlist,
        options,
        payload.param ?? "R1.resistance",
        sweep,
        payload.param2 ?? "R2.resistance",
        sweep2,
        outputs.length ? outputs : [outNode],
        payload.tran,
        payload.progress,
      );
      result = r;
      summary = { runs: r.curves.length, ok: r.ok };
      break;
    }
    case "batched": {
      const r = runBatched(
        netlist,
        options,
        {
          sourceId: payload.sourceId ?? "",
          dcSweep: sweep,
          acSweep: payload.sweep2 ?? { start: 10, stop: 1e6, points: 10, type: "dec" },
          tran,
          outputs: outputs.length ? outputs : [outNode],
        },
        payload.progress,
      );
      result = r;
      summary = { ok: r.ok };
      break;
    }
    case "thdsweep": {
      const levels = (payload.levels ?? [0.5, 1, 2]).filter((v) => Number.isFinite(v) && v > 0);
      const r = runThdSweep(
        netlist,
        options,
        payload.fundamental ?? 1000,
        outNode,
        payload.param ?? "V1.amplitude",
        levels.length ? levels : [1],
        12,
        payload.progress,
      );
      result = r;
      summary = { levels: r.levels.length, ok: r.ok };
      break;
    }
    case "fourier": {
      const r = runFourier(netlist, options, payload.fundamental ?? 1000, outNode, payload.harmonics ?? 9);
      result = r;
      summary = { thd: r.thd, ok: r.ok };
      break;
    }
    case "sensitivity": {
      const r = runSensitivity(
        netlist,
        options,
        outNode,
        payload.mode === "ac" ? "ac" : "dc",
        payload.frequency ?? 1000,
      );
      result = r;
      summary = { count: r.sensitivities.length, ok: r.ok };
      break;
    }
    case "tf": {
      const r = runTransferFunction(netlist, options, outNode, payload.sourceId ?? "");
      result = r;
      summary = { gain: r.gain, ok: r.ok };
      break;
    }
    case "pz": {
      const r = runPoleZero(netlist, options, outNode, payload.sourceId ?? "", {
        order: payload.order ?? 2,
        fmin: sweep.start,
        fmax: sweep.stop,
        points: sweep.points,
      });
      result = r;
      summary = { poles: r.poles.length, zeros: r.zeros.length, ok: r.ok };
      break;
    }
    case "sparams": {
      const r = runSParams(netlist, options, sweep, payload.inNode ?? outNode, outNode, payload.z0 ?? 50);
      result = r;
      summary = { points: r.freq.length, ok: r.ok };
      break;
    }
    case "noisefigure": {
      const r = runNoiseFigure(netlist, options, outNode, payload.sourceId ?? "", sweep);
      result = r;
      summary = { points: r.freq.length, ok: r.ok };
      break;
    }
    default:
      throw new Error(`Unbekannte Analyse "${kind}"`);
  }

  // S1.4: AC-basierte Analysen nennen ihre Näherungen beim Namen.
  const acKinds = new Set(["ac", "noise", "noisefigure", "pz", "tf", "sparams"]);
  const acWarn =
    acKinds.has(kind) || (kind === "sensitivity" && payload.mode === "ac") ? acLinearizationWarnings(netlist) : [];
  const autoDrive = kind === "sensitivity" ? (result as { autoDrive?: string }).autoDrive : undefined;
  if (autoDrive) {
    acWarn.push(`AC-Anregung: Quelle ${autoDrive} wurde mit ac = 1 angeregt (keine AC-Quelle in der Schaltung).`);
  }

  // S2.2: Kernel-Fehlschlag (ok:false) wird zum Report-Fehler — der Grapher
  // zeigte bisher leere Diagramme, weil niemand `.ok` prüfte.
  const res = result as { ok?: boolean; message?: string; failure?: "singular" | "nonconvergent"; suspects?: string[] };
  const failed = res && res.ok === false;
  const errors = [...built.errors];
  if (failed && res.message) errors.push(res.message);

  return {
    kind,
    durationMs: Date.now() - started,
    result,
    nets: built.nets.map((n) => n.name),
    errors,
    warnings: [...built.warnings, ...acWarn],
    summary,
    convergence: failed ? res.failure : undefined,
    suspects: failed ? res.suspects : undefined,
  };
}
