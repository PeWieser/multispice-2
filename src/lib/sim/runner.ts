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
  runAcSweep,
  runDcSweep,
  runIvCurve,
  runMonteCarlo,
  runNoise,
  runOperatingPoint,
  runTempSweep,
  runThd,
  runTransient,
  runWorstCase,
  SweepSpec,
} from "./analyses";
import { SimOptions } from "./engine";

export interface AnalysisPayload {
  outputs?: string[];
  options?: Partial<SimOptions>;
  sweep?: SweepSpec;
  tran?: { stopTime: number; stepTime: number; maxPoints?: number };
  sourceId?: string;
  outNode?: string;
  fundamental?: number;
  runs?: number;
  tolerance?: number;
  temps?: number[];
  measure?: "vout-peak" | "vout-rms" | "vout-dc" | "gain-db";
  stepSourceId?: string | null;
  stepValues?: number[];
  measureDeviceId?: string;
}

export interface AnalysisReport {
  kind: string;
  durationMs: number;
  result: unknown;
  nets: string[];
  errors: string[];
  warnings: string[];
  summary: Record<string, unknown>;
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
      const r = runTransient(netlist, options, { ...tran, maxPoints: tran.maxPoints ?? 5000 }, outputs.length ? outputs : [outNode]);
      result = r;
      summary = { ok: r.ok, steps: r.steps, points: r.time.length };
      break;
    }
    case "ac": {
      const r = runAcSweep(netlist, options, sweep, outputs.length ? outputs : [outNode]);
      result = r;
      summary = { ok: r.ok, points: r.freq.length };
      break;
    }
    case "dc": {
      const r = runDcSweep(netlist, options, payload.sourceId ?? "", sweep, outputs.length ? outputs : [outNode]);
      result = r;
      summary = { ok: r.ok, points: r.values.length };
      break;
    }
    case "noise": {
      const r = runNoise(netlist, options, sweep, outNode, payload.sourceId ?? "");
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
    default:
      throw new Error(`Unbekannte Analyse "${kind}"`);
  }

  return {
    kind,
    durationMs: Date.now() - started,
    result,
    nets: built.nets.map((n) => n.name),
    errors: built.errors,
    warnings: built.warnings,
    summary,
  };
}
