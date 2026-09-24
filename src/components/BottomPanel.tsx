"use client";

import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, FlaskConical, ListTree, Table2, Terminal, Waves } from "lucide-react";
import { buildBom, fromSpiceNetlist, toSpiceNetlist } from "@/lib/schematic/model";
import { formatValue } from "@/lib/library/catalog";
import { engine, useEditor } from "@/state/editor";

const TABS = [
  ["console", "Konsole", <Terminal key="c" size={12} />],
  ["netlist", "SPICE-Netzliste", <ListTree key="n" size={12} />],
  ["errors", "Fehler & Prüfung", <AlertTriangle key="e" size={12} />],
  ["scope", "Live-Signale", <Waves key="s" size={12} />],
  ["bom", "Stückliste", <Table2 key="b" size={12} />],
  ["code", "Analyse-Ergebnisse", <FlaskConical key="a" size={12} />],
] as const;

export default function BottomPanel() {
  const st = useEditor();
  const logRef = useRef<HTMLDivElement>(null);
  const netlistText = useMemo(() => toSpiceNetlist(st.doc, ".tran 10u 20m"), [st.doc]);
  const bom = useMemo(() => buildBom(st.doc), [st.doc]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [st.logs.length]);

  return (
    <div className="panel flex flex-col" style={{ borderWidth: "1px 0 0 0", height: st.bottomOpen ? 232 : 34 }}>
      <div className="flex h-[34px] shrink-0 items-center gap-1 px-2">
        {TABS.map(([id, label, icon]) => (
          <button key={id} className="tab" data-active={st.bottomTab === id && st.bottomOpen} onClick={() => st.setBottomTab(id)}>
            <span className="flex items-center gap-1.5">
              {icon}
              {label}
            </span>
          </button>
        ))}
        <div className="flex-1" />
        {!!st.netResult.errors.length && (
          <span className="mono rounded px-1.5 py-0.5 text-[10px]" style={{ background: "color-mix(in srgb, var(--err) 18%, transparent)", color: "var(--err)" }}>
            {st.netResult.errors.length} Fehler
          </span>
        )}
        <button className="btn px-1.5" onClick={st.toggleBottom}>
          {st.bottomOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {st.bottomOpen && (
        <div className="min-h-0 flex-1 overflow-hidden">
          {st.bottomTab === "console" && (
            <div ref={logRef} className="mono h-full overflow-y-auto px-3 py-2 text-[11.5px] leading-[1.6]">
              {st.logs.map((l) => (
                <div key={l.id} className="flex gap-2">
                  <span className="text-mute">{l.time}</span>
                  <span
                    style={{
                      color:
                        l.level === "error" ? "var(--err)" : l.level === "warn" ? "var(--warn)" : l.level === "ok" ? "var(--ok)" : "var(--text-dim)",
                    }}
                  >
                    {l.level === "error" ? "✕" : l.level === "warn" ? "⚠" : l.level === "ok" ? "✓" : "›"}
                  </span>
                  <span className="text-dim">{l.message}</span>
                </div>
              ))}
            </div>
          )}

          {st.bottomTab === "netlist" && (
            <div className="flex h-full flex-col gap-1.5 p-2">
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] text-mute">SPICE3/ngspice-kompatibel — bearbeitbar, Import überschreibt den Schaltplan</span>
                <div className="flex-1" />
                <button
                  className="btn"
                  onClick={() => {
                    navigator.clipboard?.writeText(netlistText);
                    st.log("ok", "Netzliste in die Zwischenablage kopiert");
                  }}
                >
                  Kopieren
                </button>
                <button
                  className="btn"
                  onClick={() => {
                    const text = (document.getElementById("netlist-editor") as HTMLTextAreaElement)?.value ?? "";
                    st.setDoc(fromSpiceNetlist(text));
                    st.log("warn", "Netzliste importiert — Platzierung automatisch generiert");
                  }}
                >
                  Importieren
                </button>
              </div>
              <textarea id="netlist-editor" className="input mono h-full resize-none text-[11px] leading-[1.55]" defaultValue={netlistText} key={netlistText.length} spellCheck={false} />
            </div>
          )}

          {st.bottomTab === "errors" && (
            <div className="h-full overflow-y-auto p-3 text-[12px]">
              {st.netResult.errors.length === 0 && st.netResult.warnings.length === 0 ? (
                <div className="text-[12px]" style={{ color: "var(--ok)" }}>
                  ✓ Design Rule Check bestanden — keine offenen Netze oder unbekannten Bauteile gefunden.
                </div>
              ) : (
                <ul className="space-y-1">
                  {st.netResult.errors.map((e, i) => (
                    <li key={"e" + i} style={{ color: "var(--err)" }}>
                      ✕ {e}
                    </li>
                  ))}
                  {st.netResult.warnings.map((w, i) => (
                    <li key={"w" + i} style={{ color: "var(--warn)" }}>
                      ⚠ {w}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 text-[11px] text-mute">
                Knoten: {st.netResult.nets.length} · Bauteile: {st.netResult.netlist.devices.length} · Matrix:{" "}
                {engine.sim ? `${engine.sim.size}×${engine.sim.size}` : "—"}
              </div>
            </div>
          )}

          {st.bottomTab === "scope" && <LiveStrip />}

          {st.bottomTab === "bom" && (
            <div className="h-full overflow-auto p-2">
              <table className="w-full text-[11.5px]">
                <thead className="text-mute">
                  <tr>
                    {["Referenz", "Bauteil", "Wert", "Footprint", "Montage", "Menge"].map((h) => (
                      <th key={h} className="px-2 py-1 text-left font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="mono">
                  {bom.map((r, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-2 py-1" style={{ color: "var(--accent-2)" }}>
                        {r.ref}
                      </td>
                      <td className="px-2 py-1 text-dim">{r.part}</td>
                      <td className="px-2 py-1">{r.value}</td>
                      <td className="px-2 py-1 text-mute">{r.footprint}</td>
                      <td className="px-2 py-1 text-mute">{r.mount}</td>
                      <td className="px-2 py-1">{r.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {st.bottomTab === "code" && <AnalysisResults />}
        </div>
      )}
    </div>
  );
}

function LiveStrip() {
  const probes = useEditor((s) => s.probes);
  const nets = useEditor((s) => s.netResult.nets.map((n) => n.name).filter((n) => n !== "0"));
  const shown = probes.length ? probes : nets.slice(0, 4);
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = ref.current;
      if (c) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = c.clientWidth;
        const h = c.clientHeight;
        if (c.width !== w * dpr || c.height !== h * dpr) {
          c.width = w * dpr;
          c.height = h * dpr;
        }
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          const rows = Math.max(shown.length, 1);
          const rowH = h / rows;
          shown.forEach((net, i) => {
            const ch = engine.channel(net, 1800);
            const color = ["var(--ch1)", "var(--ch2)", "var(--ch3)", "var(--ch4)"][i % 4];
            ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue(color.slice(4, -1)).trim() || "#38bdf8";
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            if (ch.v.length > 1) {
              const max = Math.max(...ch.v.map(Math.abs), 0.001);
              const t0 = ch.t[0];
              const span = Math.max(ch.t[ch.t.length - 1] - t0, 1e-9);
              ch.v.forEach((v, k) => {
                const x = ((ch.t[k] - t0) / span) * w;
                const y = i * rowH + rowH / 2 - (v / max) * (rowH * 0.42);
                if (k === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              });
            }
            ctx.stroke();
            ctx.fillStyle = "rgba(128,140,165,.9)";
            ctx.font = "9.5px ui-monospace, monospace";
            ctx.fillText(`${net}  ${formatValue(engine.lastState.nets[net] ?? 0, "V")}`, 6, i * rowH + 11);
          });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  return (
    <div className="h-full p-2">
      <canvas ref={ref} className="h-full w-full rounded-lg" style={{ background: "var(--canvas)", border: "1px solid var(--border)" }} />
    </div>
  );
}

function AnalysisResults() {
  const analysis = useEditor((s) => s.analysis);
  if (analysis.running) return <div className="p-4 text-[12px] text-mute">Analyse »{analysis.kind}« läuft …</div>;
  if (analysis.error)
    return (
      <div className="p-4 text-[12px]" style={{ color: "var(--err)" }}>
        ✕ {analysis.error}
      </div>
    );
  if (!analysis.data) return <div className="p-4 text-[12px] text-mute">Noch keine Analyse ausgeführt. Menü »Analysen« oder Bode-Plotter verwenden.</div>;

  const d = analysis.data as Record<string, unknown>;

  if (analysis.kind === "op") {
    const nodes = (d.nodes ?? {}) as Record<string, number>;
    const currents = (d.currents ?? {}) as Record<string, number>;
    return (
      <div className="grid h-full grid-cols-2 gap-3 overflow-auto p-3 text-[11.5px] mono">
        <div>
          <div className="mb-1 text-[10px] uppercase text-mute">Knotenspannungen</div>
          {Object.entries(nodes).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-mute">V({k})</span>
              <span>{formatValue(v, "V")}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 text-[10px] uppercase text-mute">Zweigströme</div>
          {Object.entries(currents).slice(0, 40).map(([k, v]) => (
            <div key={k} className="flex justify-between">
              <span className="text-mute">{k}</span>
              <span>{formatValue(v, "A")}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (analysis.kind === "montecarlo") {
    const hist = (d.histogram ?? []) as Array<{ x: number; count: number }>;
    const max = Math.max(...hist.map((h) => h.count), 1);
    return (
      <div className="flex h-full gap-4 p-3">
        <div className="mono space-y-0.5 text-[11.5px]">
          <div className="text-[10px] uppercase text-mute">Monte-Carlo</div>
          <div>µ = {formatValue(Number(d.mean), "V")}</div>
          <div>σ = {formatValue(Number(d.sigma), "V")}</div>
          <div>min = {formatValue(Number(d.min), "V")}</div>
          <div>max = {formatValue(Number(d.max), "V")}</div>
          <div style={{ color: "var(--ok)" }}>Yield 3σ: {Number(d.yieldPct).toFixed(1)} %</div>
        </div>
        <div className="flex flex-1 items-end gap-1">
          {hist.map((h, i) => (
            <div key={i} className="flex-1 rounded-t" style={{ height: `${(h.count / max) * 100}%`, background: "linear-gradient(180deg,var(--accent),var(--accent-3))" }} title={`${formatValue(h.x, "V")}: ${h.count}`} />
          ))}
        </div>
      </div>
    );
  }

  if (analysis.kind === "thd") {
    const harmonics = (d.harmonics ?? []) as Array<{ n: number; freq: number; mag: number; relative: number }>;
    return (
      <div className="flex h-full gap-4 p-3">
        <div className="mono space-y-0.5 text-[11.5px]">
          <div className="text-[10px] uppercase text-mute">Klirrfaktor</div>
          <div style={{ color: "var(--warn)" }}>THD = {Number(d.thdPercent).toFixed(3)} %</div>
          <div>{Number(d.thdDb).toFixed(1)} dB</div>
        </div>
        <div className="flex flex-1 items-end gap-1.5">
          {harmonics.map((h) => (
            <div key={h.n} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t" style={{ height: `${Math.max(h.relative * 100, 0.5)}%`, background: h.n === 1 ? "var(--accent)" : "var(--accent-3)" }} />
              <span className="mono text-[9px] text-mute">{h.n}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (analysis.kind === "noise") {
    const contributors = (d.contributors ?? []) as Array<{ id: string; contribution: number }>;
    return (
      <div className="flex h-full gap-6 p-3 text-[11.5px] mono">
        <div>
          <div className="text-[10px] uppercase text-mute">Rauschen</div>
          <div>Total RMS: {formatValue(Number(d.totalRms), "V")}</div>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="text-[10px] uppercase text-mute">Hauptverursacher</div>
          {contributors.map((c) => (
            <div key={c.id} className="flex justify-between">
              <span className="text-mute">{c.id}</span>
              <span>{formatValue(Math.sqrt(c.contribution), "V/√Hz")}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (analysis.kind === "worstcase") {
    const sens = (d.sensitivities ?? []) as Array<{ id: string; param: string; sensitivity: number }>;
    return (
      <div className="flex h-full gap-6 p-3 text-[11.5px] mono">
        <div className="space-y-0.5">
          <div className="text-[10px] uppercase text-mute">Worst-Case</div>
          <div>Nominal: {formatValue(Number(d.nominal), "V")}</div>
          <div style={{ color: "var(--err)" }}>Min: {formatValue(Number(d.low), "V")}</div>
          <div style={{ color: "var(--ok)" }}>Max: {formatValue(Number(d.high), "V")}</div>
        </div>
        <div className="flex-1 overflow-auto">
          <div className="text-[10px] uppercase text-mute">Empfindlichkeiten</div>
          {sens.map((s) => (
            <div key={s.id + s.param} className="flex justify-between">
              <span className="text-mute">
                {s.id}.{s.param}
              </span>
              <span>{s.sensitivity.toFixed(3)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (analysis.kind === "temp") {
    const temps = (d.temps ?? []) as number[];
    const values = (d.values ?? []) as number[];
    return (
      <div className="h-full overflow-auto p-3 text-[11.5px] mono">
        <div className="mb-1 text-[10px] uppercase text-mute">Temperatur-Sweep</div>
        {temps.map((t, i) => (
          <div key={t} className="flex w-52 justify-between">
            <span className="text-mute">{t} °C</span>
            <span>{formatValue(values[i], "V")}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <pre className="mono h-full overflow-auto p-3 text-[10.5px] leading-relaxed text-dim">{JSON.stringify(analysis.data, null, 2).slice(0, 8000)}</pre>
  );
}
