"use client";

import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, FlaskConical, ListTree, Radio, Table2, Terminal } from "lucide-react";
import { buildBom, fromSpiceNetlist, toSpiceNetlist } from "@/lib/schematic/model";
import { formatValue } from "@/lib/library/catalog";
import { engine, useEditor } from "@/state/editor";
import Grapher from "./Grapher";

const TABS = [
  ["console", "Konsole", <Terminal key="c" size={12} />],
  ["results", "Ergebnisse", <FlaskConical key="a" size={12} />],
  ["netlist", "SPICE-Netzliste", <ListTree key="n" size={12} />],
  ["errors", "Prüfung", <AlertTriangle key="e" size={12} />],
  ["probes", "Sonden", <Radio key="s" size={12} />],
  ["bom", "Stückliste", <Table2 key="b" size={12} />],
] as const;

type TabId = (typeof TABS)[number][0];

export default function BottomPanel() {
  const bottomOpen = useEditor((s) => s.bottomOpen);
  const bottomTab = useEditor((s) => s.bottomTab);
  const setBottomTab = useEditor((s) => s.setBottomTab);
  const toggleBottom = useEditor((s) => s.toggleBottom);
  const logs = useEditor((s) => s.logs);
  const log = useEditor((s) => s.log);
  const doc = useEditor((s) => s.doc);
  const setDoc = useEditor((s) => s.setDoc);
  const netResult = useEditor((s) => s.netResult);
  const logRef = useRef<HTMLDivElement>(null);
  const netlistText = useMemo(() => toSpiceNetlist(doc, ".tran 10u 20m"), [doc]);
  const bom = useMemo(() => buildBom(doc), [doc]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [logs.length]);

  return (
    <div className="flex flex-col" style={{ background: "var(--panel)", borderTop: "1px solid var(--border)", height: bottomOpen ? 248 : 34 }}>
      <div className="flex h-[34px] shrink-0 items-center gap-0.5 px-2">
        {TABS.map(([id, label, icon]) => (
          <button key={id} className="tab" data-active={bottomTab === id && bottomOpen} onClick={() => setBottomTab(id as TabId)}>
            <span className="flex items-center gap-1.5">
              {icon}
              {label}
            </span>
          </button>
        ))}
        <div className="flex-1" />
        <button className="btn px-1.5" onClick={toggleBottom} title={bottomOpen ? "Leiste einklappen" : "Leiste ausklappen"}>
          {bottomOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
      </div>

      {bottomOpen && (
        <div className="min-h-0 flex-1 overflow-hidden">
          {bottomTab === "console" && (
            <div ref={logRef} className="mono h-full overflow-y-auto px-3 py-2 text-[11.5px] leading-[1.6]" role="log" aria-label="Konsolenausgaben">
              {logs.map((l) => (
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

          {bottomTab === "results" && <Grapher />}

          {bottomTab === "netlist" && (
            <div className="flex h-full flex-col gap-1.5 p-2">
              <div className="flex items-center gap-2">
                <span className="text-[10.5px] text-mute">SPICE3/ngspice-kompatibel — Import überschreibt den Schaltplan</span>
                <div className="flex-1" />
                <button
                  className="btn py-1 text-[11.5px]"
                  onClick={() => {
                    navigator.clipboard?.writeText(netlistText);
                    log("ok", "Netzliste in die Zwischenablage kopiert");
                  }}
                >
                  Kopieren
                </button>
                <button
                  className="btn py-1 text-[11.5px]"
                  onClick={() => {
                    const text = (document.getElementById("netlist-editor") as HTMLTextAreaElement)?.value ?? "";
                    setDoc(fromSpiceNetlist(text));
                    log("warn", "Netzliste importiert — Platzierung automatisch generiert");
                  }}
                >
                  Importieren
                </button>
              </div>
              <textarea id="netlist-editor" className="input mono h-full resize-none text-[11px] leading-[1.55]" defaultValue={netlistText} key={netlistText.length} spellCheck={false} />
            </div>
          )}

          {bottomTab === "errors" && (
            <div className="h-full overflow-y-auto p-3 text-[12px]">
              {netResult.errors.length === 0 && netResult.warnings.length === 0 ? (
                <div className="text-[12px]" style={{ color: "var(--ok)" }}>
                  ✓ Prüfung bestanden — keine offenen Netze, keine unbekannten Bauteile.
                </div>
              ) : (
                <ul className="space-y-1">
                  {netResult.errors.map((e, i) => (
                    <li key={"e" + i} style={{ color: "var(--err)" }}>
                      ✕ {e}
                    </li>
                  ))}
                  {netResult.warnings.map((w, i) => (
                    <li key={"w" + i} style={{ color: "var(--warn)" }}>
                      ⚠ {w}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 text-[11px] text-mute">
                Knoten: {netResult.nets.length} · Bauteile: {netResult.netlist.devices.length} · Matrix:{" "}
                {engine.sim ? `${engine.sim.size}×${engine.sim.size}` : "—"}
              </div>
            </div>
          )}

          {bottomTab === "probes" && <LiveStrip />}

          {bottomTab === "bom" && (
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
            const color = ["--ch1", "--ch2", "--ch3", "--ch4"][i % 4];
            ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue(color).trim() || "#38bdf8";
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
