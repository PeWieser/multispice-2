"use client";

import { useEffect, useMemo, useState } from "react";
import { ANALYSIS_MAP, AnalysisContext, FieldValue, defaultValues } from "@/lib/sim/analysis_defs";
import { useEditor } from "@/state/editor";
import { Dialog, NetsField, NumberField, SelectField, TextField } from "./ui";

const SOURCE_PARTS = new Set(["vdc", "vac", "vpulse", "funcgen"]);

/** Letzte Dialogwerte je Analyse — überleben das Schließen, kein Reload-Theater. */
const lastValues = new Map<string, Record<string, FieldValue>>();

export default function AnalysisDialog({ kind, onClose }: { kind: string; onClose: () => void }) {
  const def = ANALYSIS_MAP[kind];
  const doc = useEditor((s) => s.doc);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const probes = useEditor((s) => s.probes);
  const running = useEditor((s) => s.analysis.running);
  const runAnalysis = useEditor((s) => s.runAnalysis);
  const setBottomTab = useEditor((s) => s.setBottomTab);

  const measurementProbeNets = useMemo(()=> doc.probes.map(p=> p.net).filter(Boolean) as string[], [doc.probes]);
  const ctx: AnalysisContext = useMemo(() => {
    const nonGnd = nets.filter((n) => n !== "0");
    // Multisim-like: auto-add measurement probes to Grapher output
    const probePool = [...new Set([...probes, ...measurementProbeNets])];
    const suggested = [...probePool.filter((p) => nonGnd.includes(p)), ...nonGnd.filter((n) => !probePool.includes(n))].slice(0, 8);
    return {
      nets,
      sources: doc.instances.filter((i) => SOURCE_PARTS.has(i.partId)).map((i) => i.label),
      suggestedOutputs: suggested,
    };
  }, [nets, probes, measurementProbeNets, doc.instances]);

  const [values, setValues] = useState<Record<string, FieldValue>>(() => {
    if (!def) return {};
    const saved = lastValues.get(kind);
    const fresh = defaultValues(def, ctx);
    if (!saved) return fresh;
    // Gespeicherte Werte übernehmen, aber gegen die aktuelle Schaltung prüfen.
    const merged = { ...fresh, ...saved };
    for (const f of def.fields) {
      if (f.kind === "nets") {
        const arr = saved[f.key];
        merged[f.key] = Array.isArray(arr) ? (arr as string[]).filter((n) => ctx.nets.includes(n)) : fresh[f.key];
      }
      if (f.kind === "net" && !ctx.nets.includes(saved[f.key] as string)) merged[f.key] = fresh[f.key];
      if (f.kind === "source" && !ctx.sources.includes(saved[f.key] as string)) merged[f.key] = fresh[f.key];
    }
    return merged;
  });
  const [error, setError] = useState<string | null>(null);

  if (!def) return null;
  const set = (key: string, v: FieldValue) => {
    setValues((s) => ({ ...s, [key]: v }));
    setError(null);
  };

  const run = () => {
    const problem = def.validate(values, ctx);
    if (problem) {
      setError(problem);
      return;
    }
    lastValues.set(kind, values);
    onClose();
    setBottomTab("results");
    void runAnalysis(kind, def.build(values));
  };

  return (
    <Dialog
      title={`${def.title} (${def.spice})`}
      subtitle={def.hint}
      onClose={onClose}
      actions={
        <>
          <button className="btn" onClick={onClose}>
            Abbrechen
          </button>
          <button className="btn btn-primary" onClick={run} disabled={running}>
            {running ? "Läuft …" : "Ausführen"}
          </button>
        </>
      }
    >
      {def.fields.map((f) => {
        const v = values[f.key];
        switch (f.kind) {
          case "nets":
            return <NetsField key={f.key} label={f.label} nets={ctx.nets.filter((n) => n !== "0")} selected={Array.isArray(v) ? v : []} onChange={(x) => set(f.key, x)} />;
          case "net":
            return (
              <SelectField
                key={f.key}
                label={f.label}
                value={typeof v === "string" ? v : ""}
                options={ctx.nets.filter((n) => n !== "0").map((n) => ({ value: n, label: `Netz ${n}` }))}
                onChange={(x) => set(f.key, x)}
              />
            );
          case "source":
            return (
              <SelectField
                key={f.key}
                label={f.label}
                value={typeof v === "string" ? v : ""}
                options={ctx.sources.map((s) => ({ value: s, label: s }))}
                onChange={(x) => set(f.key, x)}
              />
            );
          case "number":
          case "int":
            return <NumberField key={f.key} label={f.label} unit={f.kind === "number" ? f.unit : undefined} value={typeof v === "number" ? v : f.def} onChange={(x) => set(f.key, x)} />;
          case "select":
            return <SelectField key={f.key} label={f.label} value={typeof v === "string" ? v : f.def} options={f.options} onChange={(x) => set(f.key, x)} />;
          case "text":
            return <TextField key={f.key} label={f.label} mono value={typeof v === "string" ? v : f.def} placeholder={f.placeholder} onChange={(x) => set(f.key, x)} />;
        }
      })}
      {error && (
        <div className="mt-2 rounded-md px-2.5 py-2 text-[12px]" role="status" style={{ background: "color-mix(in srgb, var(--err) 12%, transparent)", color: "var(--err)" }}>
          {error}
        </div>
      )}
    </Dialog>
  );
}
