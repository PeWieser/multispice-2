import { db } from "@/db";
import { simulationRuns } from "@/db/schema";
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
} from "@/lib/sim/analyses";
import { SimOptions } from "@/lib/sim/engine";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface SimRequest {
  doc: SchematicDoc;
  kind: string;
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
  schematicId?: number | null;
}

export async function POST(req: NextRequest) {
  const started = Date.now();
  let body: SimRequest;
  try {
    body = (await req.json()) as SimRequest;
  } catch {
    return Response.json({ error: "Ungültige Anfrage" }, { status: 400 });
  }
  const { doc, kind } = body;
  if (!doc) return Response.json({ error: "Kein Schaltplan übergeben" }, { status: 400 });

  const built = buildNets(doc);
  const netlist = built.netlist;
  const options = body.options ?? {};
  const outputs = (body.outputs ?? []).filter(Boolean);
  const tran = body.tran ?? { stopTime: 0.02, stepTime: 1e-5 };
  const sweep: SweepSpec = body.sweep ?? { start: 10, stop: 1e6, points: 20, type: "dec" };
  const outNode = body.outNode ?? outputs[0] ?? built.nets[0]?.name ?? "0";

  let result: unknown;
  let summary: Record<string, unknown> = {};

  try {
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
        const r = runDcSweep(netlist, options, body.sourceId ?? "", sweep, outputs.length ? outputs : [outNode]);
        result = r;
        summary = { ok: r.ok, points: r.values.length };
        break;
      }
      case "noise": {
        const r = runNoise(netlist, options, sweep, outNode, body.sourceId ?? "");
        result = r;
        summary = { ok: r.ok, totalRms: r.totalRms };
        break;
      }
      case "thd": {
        const r = runThd(netlist, options, body.fundamental ?? 1000, outNode);
        result = r;
        summary = { thd: r.thdPercent };
        break;
      }
      case "montecarlo": {
        const r = runMonteCarlo(
          netlist,
          options,
          { runs: body.runs ?? 50, tolerance: body.tolerance ?? 5, measure: body.measure ?? "vout-peak", outNode },
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
          { runs: 1, tolerance: body.tolerance ?? 5, measure: body.measure ?? "vout-peak", outNode },
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
          body.temps ?? [-40, 0, 25, 50, 85, 125],
          { runs: 1, tolerance: 0, measure: body.measure ?? "vout-dc", outNode },
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
          body.sourceId ?? "",
          sweep,
          body.stepSourceId ?? null,
          body.stepValues ?? [],
          body.measureDeviceId ?? "",
        );
        result = { curves: r };
        summary = { curves: r.length };
        break;
      }
      default:
        return Response.json({ error: `Unbekannte Analyse "${kind}"` }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message, errors: built.errors }, { status: 500 });
  }

  const durationMs = Date.now() - started;
  try {
    await db.insert(simulationRuns).values({
      schematicId: body.schematicId ?? null,
      kind,
      params: { sweep, tran, outputs, outNode },
      summary,
      durationMs,
    });
  } catch {
    // persistence is best effort
  }

  return Response.json({
    kind,
    durationMs,
    result,
    nets: built.nets.map((n) => n.name),
    errors: built.errors,
    warnings: built.warnings,
  });
}
