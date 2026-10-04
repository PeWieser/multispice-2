"use client";

import { PART_MAP } from "@/lib/library/catalog";
import type { MeasurementProbe, ProbeKind } from "@/lib/schematic/model";
import { useEditor, wireJunctionCandidates } from "@/state/editor";
import { adaptShortcut, useIsApple } from "@/lib/platform";
import type { InlineEdit } from "./InlineEditor";

export type CtxTarget =
  | { kind: "empty"; net: string | null }
  | { kind: "instance"; id: string; net: string | null }
  | { kind: "wire"; id: string; net: string | null }
  | { kind: "probe"; id: string; probe: MeasurementProbe; net: string | null }
  | { kind: "label"; id: string; net: string | null }
  | { kind: "note"; id: string; net: string | null };

export default function ContextMenu({
  menu,
  onClose,
  onEdit,
}: {
  menu: { x: number; y: number; wx: number; wy: number; target: CtxTarget };
  onClose: () => void;
  onEdit?: (item: InlineEdit) => void;
}) {
  const apple = useIsApple();
  const st = useEditor.getState();
  const { target, wx, wy } = menu;
  const netLabel = target.net ? ` – ${target.net}` : "";
  const doc = st.doc;

  const addProbe = (k: ProbeKind) => {
    const id = st.addMeasurementProbe(k, wx, wy);
    if (id && target.net) st.updateMeasurementProbe(id, { net: target.net });
    onClose();
  };

  // Position clamping – keep inside viewport
  const stylePos = (() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 800;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    let x = menu.x;
    let y = menu.y;
    const w = 280;
    const h = 420;
    if (x + w > vw - 12) x = vw - w - 12;
    if (y + h > vh - 12) y = vh - h - 12;
    return { left: x, top: y };
  })();

  return (
    <div className="fixed z-50 min-w-[280px] max-w-[320px] rounded-xl p-1.5 text-xs backdrop-blur-xl" style={{ ...stylePos, background: "color-mix(in srgb, var(--surface) 92%, transparent)", border: "1px solid var(--hairline-strong)", boxShadow: "0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.08)" }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e)=>e.preventDefault()}
      role="menu"
    >
      {target.kind === "instance" && (() => {
        const inst = doc.instances.find((i) => i.id === target.id);
        const part = inst ? PART_MAP[inst.partId] : null;
        const curFault = String(inst?.params.__fault ?? "");
        return (
          <>
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1 bg-surface-2">
              <div className="h-7 w-7 rounded-md grid place-items-center text-2xs font-semibold mono bg-accent-soft border border-hairline">{inst?.label?.slice(0, 3) ?? "B"}</div>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{part?.name ?? "Bauteil"} {inst?.label}</div>
                <div className="text-2xs text-ink-3 truncate">{part?.category ?? ""}{netLabel}</div>
              </div>
              <div className="ml-auto text-2xs px-1.5 py-0.5 rounded bg-black/30 text-ink-3">{inst?.rot}°</div>
            </div>
            <div className="grid grid-cols-3 gap-1 mb-1">
              <button className="row justify-center" onClick={() => { st.rotateSelection(1); onClose(); }} title="Drehen 90° (R)">↻ 90°</button>
              <button className="row justify-center" onClick={() => { st.rotateSelection(-1); onClose(); }} title={adaptShortcut("Drehen -90° (⇧R)", apple)}>↺ -90°</button>
              <button className="row justify-center" onClick={() => { st.mirrorSelection(); onClose(); }} title="Spiegeln (M)">⇆ Spiegel</button>
            </div>
            <button className="row" onClick={() => { st.setSelection([target.id]); useEditor.getState().openInstrument("inspector"); onClose(); }}><span>Eigenschaften…</span><span className="ml-auto text-2xs text-ink-3">Doppelklick</span></button>
            <button className="row" onClick={() => { st.duplicateSelection(); onClose(); }}><span>⎘ Duplizieren</span><span className="ml-auto text-2xs text-ink-3">{adaptShortcut("⌘D", apple)}</span></button>
            <button className="row" onClick={() => { st.copySelection(); onClose(); }}><span>⎙ Kopieren</span><span className="ml-auto text-2xs text-ink-3">{adaptShortcut("⌘C", apple)}</span></button>
            {(() => {
              const selInst = doc.instances.filter((i) => st.selection.includes(i.id));
              if (selInst.length === 0) return null;
              return (
                <button className="row" onClick={() => { st.openExtractDialog(selInst.map((i) => i.id)); onClose(); }} title="Auswahl als wiederverwendbares Bauteil speichern (S3.2)">
                  <span>⬢ Auswahl als Bauteil… ({selInst.length})</span>
                </button>
              );
            })()}
            <div className="sep" />
            {(() => {
              const selInst = doc.instances.filter((i) => st.selection.includes(i.id));
              const n = selInst.length;
              if (n < 2) return null;
              const act = (fn: () => void) => { fn(); onClose(); };
              return (
                <>
                  <div className="px-2 py-1 text-2xs uppercase tracking-wide text-ink-3">Anordnen – {n} Bauteile (W55)</div>
                  <div className="grid grid-cols-3 gap-1 mb-1">
                    <button className="row justify-center text-2xs" onClick={() => act(() => st.alignSelection("left"))} title="Links ausrichten" aria-label="Links ausrichten">⇤ links</button>
                    <button className="row justify-center text-2xs" onClick={() => act(() => st.alignSelection("centerH"))} title="Waagerecht mittig" aria-label="Waagerecht mittig">↔ Mitte</button>
                    <button className="row justify-center text-2xs" onClick={() => act(() => st.alignSelection("right"))} title="Rechts ausrichten" aria-label="Rechts ausrichten">⇥ rechts</button>
                    <button className="row justify-center text-2xs" onClick={() => act(() => st.alignSelection("top"))} title="Oben ausrichten" aria-label="Oben ausrichten">⇧ oben</button>
                    <button className="row justify-center text-2xs" onClick={() => act(() => st.alignSelection("centerV"))} title="Senkrecht mittig" aria-label="Senkrecht mittig">↕ Mitte</button>
                    <button className="row justify-center text-2xs" onClick={() => act(() => st.alignSelection("bottom"))} title="Unten ausrichten" aria-label="Unten ausrichten">⇩ unten</button>
                  </div>
                  {n >= 3 && (
                    <div className="grid grid-cols-2 gap-1 mb-1">
                      <button className="row justify-center text-2xs" onClick={() => act(() => st.distributeSelection("h"))} title="Gleicher Abstand waagerecht" aria-label="Gleicher Abstand waagerecht">⇹ verteilen</button>
                      <button className="row justify-center text-2xs" onClick={() => act(() => st.distributeSelection("v"))} title="Gleicher Abstand senkrecht" aria-label="Gleicher Abstand senkrecht">⇳ verteilen</button>
                    </div>
                  )}
                  <div className="sep" />
                </>
              );
            })()}
            <div className="px-2 py-1 text-2xs uppercase tracking-wide text-ink-3">Fehlersimulation (Faults)</div>
            <div className="grid grid-cols-2 gap-1">
              {[
                ["", "Kein Fehler"],
                ["open", "Open (Unterbruch)"],
                ["short", "Short (Kurzschluss)"],
                ["leaky", "Leaky (Leckstrom)"],
              ].map(([f, label]) => (
                <button
                  key={f || "none"}
                  className="row text-2xs"
                  data-active={curFault === f}
                  onClick={() => {
                    st.setParam(target.id, "__fault", f);
                    onClose();
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="sep" />
            <div className="px-2 py-1 text-2xs uppercase tracking-wide text-ink-3">Messpunkt auf Netz{netLabel}</div>
            <div className="grid grid-cols-2 gap-1">
              {([
                ["voltage","V","#fbbf24"],
                ["current","A","#22d3ee"],
                ["power","W","#a78bfa"],
                ["digital","D","#4ade80"],
              ] as const).map(([k, sym, col]) => (
                <button key={k} className="row" onClick={() => addProbe(k as any)}><span className="badge" style={{ background: col+"20", color: col, borderColor: col+"40" }}>{sym}</span> {k}</button>
              ))}
            </div>
            <div className="sep" />
            <button className="row danger" onClick={() => { st.setSelection([target.id]); st.deleteSelection(); onClose(); }}><span>Löschen</span><span className="ml-auto text-2xs text-ink-3">Entf</span></button>
          </>
        );
      })()}
      {target.kind === "label" && (() => {
        const lbl = doc.labels.find((l) => l.id === target.id);
        return (
          <>
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1 bg-surface-2">
              <div className="h-7 w-7 rounded-md grid place-items-center text-2xs font-semibold mono bg-accent-soft border border-hairline">NET</div>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">Netzlabel „{lbl?.name ?? ""}“</div>
                <div className="text-2xs text-ink-3 truncate">Position ({lbl?.x ?? 0}, {lbl?.y ?? 0})</div>
              </div>
            </div>
            <button
              className="row"
              onClick={() => {
                if (lbl && onEdit) {
                  onEdit({ kind: "label", itemId: lbl.id, x: lbl.x, y: lbl.y, sx: menu.x, sy: menu.y, initial: lbl.name });
                }
                onClose();
              }}
            >
              <span>Netzname ändern…</span>
              <span className="ml-auto text-2xs text-ink-3">Doppelklick</span>
            </button>
            <button className="row" onClick={() => { st.duplicateSelection(); onClose(); }}><span>Duplizieren</span><span className="ml-auto text-2xs text-ink-3">{adaptShortcut("⌘D", apple)}</span></button>
            <div className="sep" />
            <button className="row danger" onClick={() => { st.setSelection([target.id]); st.deleteSelection(); onClose(); }}><span>Label löschen</span><span className="ml-auto text-2xs text-ink-3">Entf</span></button>
          </>
        );
      })()}
      {target.kind === "note" && (() => {
        const note = doc.notes.find((n) => n.id === target.id);
        return (
          <>
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1 bg-surface-2">
              <div className="h-7 w-7 rounded-md grid place-items-center text-2xs font-semibold mono bg-accent-soft border border-hairline">TXT</div>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">Textnotiz</div>
                <div className="text-2xs text-ink-3 truncate">{note?.text ?? ""}</div>
              </div>
            </div>
            <button
              className="row"
              onClick={() => {
                if (note && onEdit) {
                  onEdit({ kind: "text", itemId: note.id, x: note.x, y: note.y, sx: menu.x, sy: menu.y, initial: note.text });
                }
                onClose();
              }}
            >
              <span>Notiz bearbeiten…</span>
              <span className="ml-auto text-2xs text-ink-3">Doppelklick</span>
            </button>
            <button className="row" onClick={() => { st.duplicateSelection(); onClose(); }}><span>Duplizieren</span><span className="ml-auto text-2xs text-ink-3">{adaptShortcut("⌘D", apple)}</span></button>
            <div className="sep" />
            <button className="row danger" onClick={() => { st.setSelection([target.id]); st.deleteSelection(); onClose(); }}><span>Notiz löschen</span><span className="ml-auto text-2xs text-ink-3">Entf</span></button>
          </>
        );
      })()}
      {target.kind === "wire" && (() => {
        const wire = doc.wires.find(w=>w.id===target.id);
        const pts = wire?.points.length ?? 0;
        return (
          <>
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1 bg-surface-2">
              <div className="h-7 w-7 rounded-md grid place-items-center" style={{ background: "#22d3ee20", border: "1px solid #22d3ee40" }}>∿</div>
              <div className="min-w-0">
                <div className="text-xs font-semibold">Leitung {target.id.slice(0,6)}</div>
                <div className="text-2xs text-ink-3">{pts} Punkte • Netz {target.net ?? "?"}</div>
              </div>
              <div className="ml-auto h-2 w-2 rounded-full" style={{ background: "#22d3ee", boxShadow: "0 0 6px #22d3ee" }} />
            </div>
            <div className="px-2 py-1 text-2xs uppercase tracking-wide text-ink-3">Bearbeiten</div>
            {(() => {
              let near = false;
              let verbunden = false;
              for (const c of wireJunctionCandidates(doc)) {
                if (Math.hypot(c.x - wx, c.y - wy) > 14) continue;
                near = true;
                if ((doc.junctions ?? []).some((j) => Math.hypot(j.x - c.x, j.y - c.y) < 0.5)) verbunden = true;
              }
              if (!near) return null;
              return (
                <button className="row" onClick={() => { st.toggleJunction(wx, wy); onClose(); }} data-active={verbunden}>
                  <span>{verbunden ? "Verbindungspunkt entfernen" : "Verbindungspunkt setzen (Kreuzung verbinden)"}</span>
                </button>
              );
            })()}
            <button className="row" onClick={() => {
              st.setSelection([target.id]);
              st.straightenSelection();
              onClose();
            }}><span>Leitung begradigen (Raster + rechte Winkel)</span></button>
            <div className="sep" />
            <div className="px-2 py-1 text-2xs uppercase tracking-wide text-ink-3">Leitungsfarbe</div>
            <button className="row" onClick={() => {
              const w = doc.wires.find(x=>x.id===target.id);
              if (!w) return;
              st.commit((d)=>{
                const ww = d.wires.find(x=>x.id===target.id) as any;
                if (ww) {
                  ww.isBus = !ww.isBus;
                  // S3.1: Bus-Deklaration sofort vervollständigen (Name + Breite).
                  if (ww.isBus) {
                    if (!ww.busName) ww.busName = "D";
                    if (!ww.busWidth) ww.busWidth = 8;
                  }
                }
              });
              onClose();
            }}><span>{ (doc.wires.find(x=>x.id===target.id) as any)?.isBus ? "Bus → normale Leitung" : "Als Bus markieren"}</span></button>
            {target.kind === "wire" && (doc.wires.find(x=>x.id===target.id) as any)?.isBus && (() => {
              const w = doc.wires.find(x=>x.id===target.id) as any;
              return (
                <div className="flex items-center gap-1.5 px-2 py-1" onClick={(e) => e.stopPropagation()}>
                  <span className="text-2xs text-ink-3">Bus</span>
                  <input
                    className="h-6 w-16 rounded border border-hairline bg-surface px-1 text-2xs mono"
                    defaultValue={w.busName ?? "D"}
                    aria-label="Busname"
                    title="Busname (Deklaration für Taps, z. B. D)"
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const v = e.target.value.trim() || "D";
                      st.commit((d) => {
                        const ww = d.wires.find(x=>x.id===target.id) as any;
                        if (ww) ww.busName = v;
                      });
                    }}
                  />
                  <span className="text-2xs text-ink-3">×</span>
                  <input
                    type="number"
                    className="h-6 w-12 rounded border border-hairline bg-surface px-1 text-2xs mono"
                    defaultValue={w.busWidth ?? 8}
                    min={1}
                    max={32}
                    aria-label="Busbreite"
                    title="Busbreite in Bit (Deklaration, 1–32)"
                    onKeyDown={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      const v = Math.min(32, Math.max(1, Math.floor(Number(e.target.value) || 8)));
                      st.commit((d) => {
                        const ww = d.wires.find(x=>x.id===target.id) as any;
                        if (ww) ww.busWidth = v;
                      });
                    }}
                  />
                </div>
              );
            })()}
            <div className="flex gap-1 flex-wrap px-1">
              {[
                [null, "Auto", "var(--wire)"],
                ["#ef4444", "Rot", "#ef4444"],
                ["#22c55e", "Grün", "#22c55e"],
                ["#3b82f6", "Blau", "#3b82f6"],
                ["#fbbf24", "Gelb", "#fbbf24"],
                ["#a78bfa", "Lila", "#a78bfa"],
                ["#ec4899", "Pink", "#ec4899"],
              ].map(([col, label, dot]) => (
                <button key={String(col)} className="h-7 w-7 rounded-full border-2 grid place-items-center text-2xs" style={{ background: (col as string) ?? "var(--surface)", borderColor: ((doc.wires.find(w=>w.id===target.id) as any)?.color ?? null) === col ? "var(--accent)" : "var(--hairline)", boxShadow: ((doc.wires.find(w=>w.id===target.id) as any)?.color ?? null) === col ? "0 0 0 2px var(--accent-soft)" : "none" }} title={label as string} onClick={() => {
                  st.commit((d)=>{
                    const ww = d.wires.find(x=>x.id===target.id);
                    if (ww) {
                      if (col) (ww as any).color = col as string;
                      else delete (ww as any).color;
                    }
                  });
                  onClose();
                }}>
                  <span className="h-3 w-3 rounded-full" style={{ background: dot as string }} />
                </button>
              ))}
            </div>
            <div className="sep" />
            <div className="px-2 py-1 text-2xs uppercase tracking-wide text-ink-3">Messpunkt setzen</div>
            <div className="grid grid-cols-2 gap-1">
              {([
                ["voltage","V – Spannung","#fbbf24"],
                ["current","A – Strom","#22d3ee"],
                ["power","W – Leistung","#a78bfa"],
                ["diff","ΔV – Diff","#f472b6"],
                ["digital","D – Digital","#4ade80"],
              ] as const).map(([k, label, col]) => (
                <button key={k} className="row" onClick={() => addProbe(k as any)}>
                  <span className="badge" style={{ background: col+"20", color: col, borderColor: col+"40" }}>{k==="diff"?"ΔV":k[0].toUpperCase()}</span> {label}
                </button>
              ))}
            </div>
            <div className="sep" />
            <button className="row danger" onClick={() => { st.setSelection([target.id]); st.deleteSelection(); onClose(); }}><span>Leitung löschen</span></button>
          </>
        );
      })()}
      {target.kind === "probe" && (
        <>
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1 bg-surface-2">
            <div className="h-7 w-7 rounded-md grid place-items-center text-xs font-bold" style={{ background: (target.probe.color??"#fbbf24")+"20", color: target.probe.color??"#fbbf24", border: `1px solid ${(target.probe.color??"#fbbf24")}40` }}>{target.probe.kind[0].toUpperCase()}</div>
            <div className="min-w-0">
              <div className="text-xs font-semibold truncate">{target.probe.name ?? target.probe.kind.toUpperCase()} Probe</div>
              <div className="text-2xs text-ink-3 truncate">Netz {target.probe.net ?? target.net ?? "auto"}{netLabel}</div>
            </div>
          </div>
          <button className="row" onClick={() => { st.setSelection([target.id]); useEditor.getState().openInstrument("inspector"); onClose(); }}><span>Eigenschaften…</span><span className="ml-auto text-2xs text-ink-3">Doppelklick</span></button>
          {(target.probe.kind==="current" || target.probe.kind==="voltage_current" || target.probe.kind==="power") && (
            <button className="row" onClick={() => { st.updateMeasurementProbe(target.id, { direction: target.probe.direction?0:1 }); onClose(); }}><span>↺ Richtung umkehren</span><span className="ml-auto text-2xs text-ink-3">{target.probe.direction? "Reverse":"Normal"}</span></button>
          )}
          <div className="sep" />
          <div className="px-2 py-1 text-2xs uppercase tracking-wide text-ink-3">Typ ändern</div>
          <div className="grid grid-cols-1 gap-0.5">
          {([
            ["voltage","V – Spannung (gegen GND/REF)","#fbbf24"],
            ["current","A – Strom","#22d3ee"],
            ["voltage_current","V·A – Kombi","#f59e0b"],
            ["power","W – Leistung V·I","#a78bfa"],
            ["diff","ΔV – Differenzspannung","#f472b6"],
            ["ref","REF – Referenz","#94a3b8"],
            ["digital","D – Digital 0/1","#4ade80"],
          ] as const).map(([k, desc, col]) => (
            <button key={k} className="row" data-active={target.probe.kind===k} onClick={() => { st.updateMeasurementProbe(target.id, { kind: k as any }); onClose(); }}><span className="badge" style={{ background: col+"20", color: col }}>{k[0].toUpperCase()}</span><span className="flex-1 truncate">{desc}</span></button>
          ))}
          </div>
          <div className="sep" />
          <div className="px-2 py-1 text-2xs uppercase tracking-wide text-ink-3">Referenz (für V/Diff/Power)</div>
          <button className="row" data-active={!target.probe.ref || target.probe.ref==="0"} onClick={()=> { st.updateMeasurementProbe(target.id,{ref:"0"}); onClose(); }}>GND (0) – Standard</button>
          {st.doc.probes.filter(pr=> pr.kind==="ref" && pr.id!==target.id).map(pr=> (
            <button key={pr.id} className="row" data-active={target.probe.ref===pr.id} onClick={()=> { st.updateMeasurementProbe(target.id,{ref:pr.id}); onClose(); }}><span className="truncate">REF {pr.name ?? pr.id.slice(0,6)} ({pr.net ?? "auto"})</span></button>
          ))}
          <div className="sep" />
          <div className="px-2 py-1 text-2xs uppercase tracking-wide text-ink-3">Anzeige</div>
          <button className="row" onClick={()=> { st.updateMeasurementProbe(target.id,{periodic:!target.probe.periodic}); onClose(); }}><span>{target.probe.periodic?"☐ Periodic aus – nur DC":"☑ Periodic an – RMS/Vpp/Freq"}</span></button>
          <div className="sep" />
          <button className="row danger" onClick={() => { st.removeMeasurementProbe(target.id); onClose(); }}><span>Probe löschen</span><span className="ml-auto text-2xs text-ink-3">Entf</span></button>
        </>
      )}
      {target.kind === "empty" && (
        <>
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1 bg-surface-2">
            <div className="h-7 w-7 rounded-md grid place-items-center bg-surface border border-hairline">◍</div>
            <div>
              <div className="text-xs font-semibold">Leinwand</div>
              <div className="text-2xs text-ink-3">Netz {target.net ?? "–"} • {doc.instances.length} Bauteile</div>
            </div>
          </div>
          {st.clipboard && <button className="row" onClick={() => { st.pasteClipboard(); onClose(); }}><span>Einfügen</span><span className="ml-auto text-2xs text-ink-3">{adaptShortcut("⌘V", apple)}</span></button>}
          <button className="row" onClick={() => { st.setTool("label" as any); onClose(); }}><span>Netzname hinzufügen</span><span className="ml-auto text-2xs text-ink-3">L</span></button>
          <button className="row" onClick={() => { st.setTool("text" as any); onClose(); }}><span>Notiz hinzufügen</span><span className="ml-auto text-2xs text-ink-3">T</span></button>
          <div className="sep" />
          <div className="px-2 py-1 text-2xs uppercase tracking-wide text-ink-3">Messpunkt setzen</div>
          <div className="grid grid-cols-2 gap-1">
          {([
            ["voltage","V","#fbbf24"],
            ["current","A","#22d3ee"],
            ["power","W","#a78bfa"],
            ["diff","ΔV","#f472b6"],
            ["digital","D","#4ade80"],
          ] as const).map(([k, sym, col]) => (
            <button key={k} className="row" onClick={() => addProbe(k as any)}>
              <span className="badge" style={{ background: col+"20", color: col, borderColor: col+"40" }}>{sym}</span> {k}
            </button>
          ))}
          </div>
          <div className="sep" />
          <div className="grid grid-cols-2 gap-1">
            <button className="row justify-center" onClick={() => { st.fitView(); onClose(); }}><span>⛶ Einpassen</span><span className="ml-auto text-2xs text-ink-3">F</span></button>
            <button className="row justify-center" onClick={() => { st.toggleLibrary(); onClose(); }}><span>Bibliothek</span><span className="ml-auto text-2xs text-ink-3">{adaptShortcut("⌘K", apple)}</span></button>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-1">
            <button className="row justify-center" onClick={() => { useEditor.setState({ showGrid: !st.showGrid }); onClose(); }}><span>{st.showGrid?"☑":"☐"} Grid</span></button>
            <button className="row justify-center" onClick={() => { st.toggleCurrentFlow(); onClose(); }}><span>{st.showCurrentFlow?"☑":"☐"} Strom</span></button>
          </div>
        </>
      )}
      <div className="sep" />
      <button className="row muted justify-center" onClick={onClose}><span>Schließen</span><span className="ml-auto text-2xs text-ink-3">Esc</span></button>

      <style>{`
        .row { display:flex; width:100%; align-items:center; gap:8px; border-radius:8px; padding:7px 10px; text-align:left; transition: all 0.12s ease; }
        .row:hover { background: color-mix(in srgb, var(--ink) 8%, transparent); transform: translateX(1px); }
        .row[data-active=true] { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent); }
        .row.danger { color: var(--err); }
        .row.danger:hover { background: color-mix(in srgb, var(--err) 12%, transparent); }
        .row.muted { color: var(--ink-3); }
        .sep { height:1px; margin:6px 0; background: var(--hairline); }
        .badge { display:grid; place-items:center; width:22px; height:22px; border-radius:6px; border:1px solid var(--hairline); background: var(--surface-2); font-size:10px; font-weight:700; }
      `}</style>
    </div>
  );
}

/**
 * W74 (Runde 27): Vertikal geteiltes Zoom-Menü unten rechts:
 *  · Oben: kompakte Box mit exakt zentrierten [+] / [−] Icons und feiner Trennlinie
 *  · Unten: optisch abgesetzter [FIT]-Button
 */
