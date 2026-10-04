"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown, FlaskConical, ListTree, Radio, Table2, Terminal } from "lucide-react";
import { buildBom, toSpiceNetlist } from "@/lib/schematic/model";
import { fromKicadSch, fromLtspiceAsc, fromSpiceNetlist, isKicadSch, isLtspiceAsc } from "@/lib/schematic/importers";
import { formatValue } from "@/lib/library/catalog";
import { engine, useEditor } from "@/state/editor";
import dynamic from "next/dynamic";
import ProbeTable from "./ProbeTable";

// R17: Der Grapher (Diagramm-Engine) lädt erst, wenn der Tab „Ergebnisse“ öffnet.
const Grapher = dynamic(() => import("./Grapher"), { ssr: false });

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
    const el = logRef.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight });
    else el.scrollTop = el.scrollHeight;
  }, [logs.length]);

  // Runde 11: Höhe per Drag verstellbar (Ref-1-Bottom-Panel)
  const [openH, setOpenH] = useState(248);
  const startResize = (e: React.PointerEvent) => {
    const y0 = e.clientY;
    const h0 = openH;
    const move = (ev: PointerEvent) => setOpenH(Math.max(120, Math.min(720, h0 + (y0 - ev.clientY))));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // W96: Im geschlossenen Zustand überhaupt keine eigene Leiste rendern –
  // das Panel erscheint nur bei Bedarf (Menü Ansicht/Analysen oder Prüfungs-Button).
  if (!bottomOpen) return null;

  return (
    <div className="relative flex flex-col" style={{ background: "var(--surface)", borderTop: "1px solid var(--hairline)", height: openH }}>
      <div onPointerDown={startResize} className="absolute -top-1 left-0 right-0 z-10 h-2 cursor-ns-resize" title="Ziehen: Panel-Höhe" />
      <div className="flex h-[34px] shrink-0 items-center gap-0.5 px-2 border-b border-hairline">
        {TABS.map(([id, label, icon]) => (
          <button key={id} className="tab" data-active={bottomTab === id} onClick={() => setBottomTab(id as TabId)}>
            <span className="flex items-center gap-1.5">
              {icon}
              {label}
            </span>
          </button>
        ))}
        <div className="flex-1" />
        <button className="btn px-1.5" onClick={toggleBottom} title="Panel schließen" aria-label="Panel schließen">
          <ChevronDown size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
          {bottomTab === "console" && (
            <div ref={logRef} className="mono h-full overflow-y-auto px-3 py-2 text-2xs leading-[1.6]" role="log" aria-live="polite" aria-label="Konsolenausgaben – Simulation Logs, live aktualisiert">
              {logs.map((l) => (
                <div key={l.id} className="flex gap-2">
                  <span className="text-ink-3">{l.time}</span>
                  <span
                    style={{
                      color:
                        l.level === "error" ? "var(--err)" : l.level === "warn" ? "var(--warn)" : l.level === "ok" ? "var(--ok)" : "var(--ink-2)",
                    }}
                  >
                    {l.level === "error" ? "✕" : l.level === "warn" ? "⚠" : l.level === "ok" ? "✓" : "›"}
                  </span>
                  <span className="text-ink-2">{l.message}</span>
                </div>
              ))}
            </div>
          )}

          {bottomTab === "results" && <Grapher />}

          {bottomTab === "netlist" && (
            <div className="flex h-full flex-col gap-1.5 p-2">
              <div className="flex items-center gap-2">
                <span className="text-2xs text-ink-3">SPICE3/ngspice-kompatibel — Import überschreibt den Schaltplan</span>
                <div className="flex-1" />
                <button
                  className="btn py-1 text-2xs"
                  onClick={() => {
                    navigator.clipboard?.writeText(netlistText);
                    log("ok", "Netzliste in die Zwischenablage kopiert");
                  }}
                >
                  Kopieren
                </button>
                <button
                  className="btn py-1 text-2xs"
                  onClick={() => {
                    const text = (document.getElementById("netlist-editor") as HTMLTextAreaElement)?.value ?? "";
                    const imported = isLtspiceAsc(text) ? fromLtspiceAsc(text) : fromSpiceNetlist(text);
                    setDoc(imported);
                    log("warn", `Netzliste importiert – ${imported.instances.length} Bauteile, ${imported.wires.length} Leitungen automatisch verdrahtet`);
                  }}
                >
                  Importieren
                </button>
              </div>
              <textarea id="netlist-editor" className="input mono h-full resize-none text-2xs leading-[1.55]" defaultValue={netlistText} key={netlistText.length} spellCheck={false} />
            </div>
          )}

          {bottomTab === "errors" && (
            <div className="h-full overflow-y-auto p-3 text-xs">
              {netResult.errors.length === 0 && netResult.warnings.length === 0 ? (
                <div className="text-xs text-ok">
                  ✓ Prüfung bestanden — keine offenen Netze, keine unbekannten Bauteile.
                </div>
              ) : (
                <ul className="space-y-1">
                  {netResult.errors.map((e, i) => (
                    <li key={"e" + i} className="flex items-center gap-2 text-err">
                      <span className="flex-1">✕ {e}</span>
                      <button className="btn h-6 px-2 text-2xs" onClick={()=>{
                        // Zoom to error – find instance by label in error message
                        const doc = useEditor.getState().doc;
                        for (const inst of doc.instances) {
                          if (e.includes(inst.label)) {
                            useEditor.getState().setView({ x: inst.x - 200, y: inst.y - 150, zoom: 1.2 });
                            useEditor.getState().setSelection([inst.id]);
                            break;
                          }
                        }
                      }}>Zoom to error</button>
                    </li>
                  ))}
                  {netResult.warnings.map((w, i) => (
                    <li key={"w" + i} className="flex items-center gap-2 text-warn">
                      <span className="flex-1">⚠ {w}</span>
                      <button className="btn h-6 px-2 text-2xs" onClick={()=>{
                        const doc = useEditor.getState().doc;
                        for (const inst of doc.instances) {
                          if (w.includes(inst.label)) {
                            useEditor.getState().setView({ x: inst.x - 200, y: inst.y - 150, zoom: 1.2 });
                            useEditor.getState().setSelection([inst.id]);
                            break;
                          }
                        }
                      }}>Zoom</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-3 text-2xs text-ink-3">
                Knoten: {netResult.nets.length} · Bauteile: {netResult.netlist.devices.length} · Matrix:{" "}
                {engine.sim ? `${engine.sim.size}×${engine.sim.size}` : "—"} · ERC-Marker am Bauteil
              </div>
            </div>
          )}

          {bottomTab === "probes" && (
            <div className="flex h-full flex-col md:flex-row">
              <div className="flex-1 min-h-0 overflow-hidden border-r border-hairline">
                <ProbeTable />
              </div>
              <div className="h-[140px] md:h-full md:w-[320px] shrink-0">
                <LiveStrip />
              </div>
            </div>
          )}

          {bottomTab === "bom" && (
            <div className="h-full overflow-auto p-2">
              <table className="w-full text-2xs">
                <thead className="text-ink-3">
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
                    <tr key={i} style={{ borderTop: "1px solid var(--hairline)" }}>
                      <td className="px-2 py-1 text-teal">
                        {r.ref}
                      </td>
                      <td className="px-2 py-1 text-ink-2">{r.part}</td>
                      <td className="px-2 py-1">{r.value}</td>
                      <td className="px-2 py-1 text-ink-3">{r.footprint}</td>
                      <td className="px-2 py-1 text-ink-3">{r.mount}</td>
                      <td className="px-2 py-1">{r.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </div>
  );
}

function LiveStrip() {
  const probes = useEditor((s) => s.probes);
  const docProbes = useEditor((s) => s.doc.probes);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name).filter((n) => n !== "0"), [netResult.nets]);
  // Multisim-like: show measurement probes + legacy probes
  const shownNets = useMemo(()=>{
    const mpNets = docProbes.map(p=> ({ net: p.net ?? "", probe: p })).filter(x=> x.net && x.net!=="0");
    const legacy = probes.map(n=> ({ net: n, probe: null as any }));
    const combined = [...mpNets, ...legacy.filter(l=> !mpNets.some(m=> m.net===l.net))];
    if (combined.length) return combined;
    return nets.slice(0,4).map(n=> ({ net: n, probe: null as any }));
  }, [probes, docProbes, nets]);

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
          const rows = Math.max(shownNets.length, 1);
          const rowH = h / rows;
          shownNets.forEach((item, i) => {
            const net = item.net;
            const ch = engine.channel(net, 1800);
            const col = item.probe?.color ?? (["--ch1", "--ch2", "--ch3", "--ch4"][i % 4]);
            if (col.startsWith("#")) ctx.strokeStyle = col;
            else ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue(col).trim() || "#38bdf8";
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
            const label = item.probe ? `${item.probe.name ?? item.probe.kind.toUpperCase()} (${net}) ${formatValue(engine.lastState.nets[net] ?? 0, "V")}` : `${net}  ${formatValue(engine.lastState.nets[net] ?? 0, "V")}`;
            ctx.fillText(label, 6, i * rowH + 11);
          });
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [shownNets]);

  return (
    <div className="h-full p-2">
      <canvas ref={ref} className="h-full w-full rounded-lg bg-canvas border border-hairline" />
    </div>
  );
}
