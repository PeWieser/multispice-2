"use client";
import { useEffect, useState } from "react";
import { useCB, currentRunSet } from "@/lib/cb/store";
import { LIBMAP, CATEGORIES, symbolOf, pinsOf, type PropDef } from "@/lib/cb/library";
import { compBBox, worldPins } from "@/lib/cb/connectivity";
import { Prims } from "./Symbol";
import { fmt, parseValue } from "@/lib/cb/units";
import type { Layout, Component } from "@/lib/cb/types";
import { uid } from "@/lib/cb/types";
import { exportNetlist } from "@/lib/cb/netlist";
import { probeSeries, probeUnit } from "@/lib/cb/probes";
import * as storage from "@/lib/cb/storage";

const TABS = ["Hierarchy", "Visibility", "Project", "Components", "Nets", "Instruments", "Probes"] as const;

export function focusOn(x: number, y: number, sheet?: string) {
  const s = useCB.getState();
  s.set({ focus: { x, y }, ...(sheet ? { sheet } : {}) });
}

export function LeftPanel() {
  const s = useCB();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Components");
  const [store, setStore] = useState<"local" | "remote">(storage.mode);
  useEffect(() => { storage.detectMode().then(setStore); }, []);
  const p = s.project;
  const L = p.layout;
  const setL = (k: keyof Layout, v: unknown) => s.commit(`Toggle ${String(k)}`, (pp) => { (pp.layout as unknown as Record<string, unknown>)[k] = v; });
  return (
    <div className="flex h-full flex-col text-[12px]">
      <div className="flex flex-wrap gap-[2px] border-b p-1" style={{ borderColor: "var(--cb-border)" }}>
        {TABS.map((t) => <button key={t} className={"cb-tab " + (tab === t ? "cb-tab-on" : "")} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        {tab === "Hierarchy" && (
          <div>
            <div className="cb-section">{p.meta.name}</div>
            {p.sheets.map((sh) => (
              <div key={sh.id} className={"cb-row " + (s.sheet === sh.id ? "cb-row-on" : "")} onClick={() => s.set({ sheet: sh.id })} onDoubleClick={() => { const n = window.prompt("Rename sheet", sh.name); if (n) s.commit("Rename sheet", (pp) => { pp.sheets.find((x) => x.id === sh.id)!.name = n; }); }}>
                <span>▤ {sh.name}</span><span className="ml-auto font-mono text-[10px]" style={{ color: "var(--cb-muted)" }}>{p.components.filter((c) => c.sheet === sh.id).length} parts · ports {p.labels.filter((l) => l.sheet === sh.id && l.kind === "port").map((l) => l.name).join(",") || "—"}</span>
              </div>
            ))}
            <div className="mt-1 flex gap-1">
              <button className="cb-btn" onClick={() => { const id = uid("s"); s.commit("Add sheet", (pp) => { pp.sheets.push({ id, name: `Sheet ${pp.sheets.length + 1}` }); }); s.set({ sheet: id }); }}>+ Sheet</button>
              <button className="cb-btn" disabled={p.sheets.length < 2} onClick={() => { const id = s.sheet; s.commit("Delete sheet", (pp) => { pp.sheets = pp.sheets.filter((x) => x.id !== id); pp.components = pp.components.filter((c) => c.sheet !== id); pp.wires = pp.wires.filter((c) => c.sheet !== id); pp.labels = pp.labels.filter((c) => c.sheet !== id); pp.probes = pp.probes.filter((c) => c.sheet !== id); }); s.set({ sheet: p.sheets.find((x) => x.id !== id)!.id }); }}>Delete sheet</button>
            </div>
            <div className="mt-2 text-[11px]" style={{ color: "var(--cb-muted)" }}>Sheets connect through global labels, hierarchical ports and power symbols with equal names.</div>
          </div>
        )}
        {tab === "Visibility" && (
          <div className="flex flex-col gap-[2px]">
            {([["showRefs", "References"], ["showValues", "Values"], ["showPinNames", "Pin Names"], ["showLabels", "Net Labels"], ["showProbes", "Probes"], ["showInstruments", "Instruments"], ["grid", "Grid"], ["rulers", "Rulers"], ["pageBorder", "Page Border"], ["markers", "Simulation Markers"]] as [keyof Layout, string][]).map(([k, lab]) => (
              <label key={k} className="cb-row"><input type="checkbox" checked={!!L[k]} onChange={(e) => setL(k, e.target.checked)} /> {lab}</label>
            ))}
          </div>
        )}
        {tab === "Project" && (
          <div className="flex flex-col gap-1">
            <Field label="Name" value={p.meta.name} onChange={(v) => s.commit("Rename project", (pp) => { pp.meta.name = v; })} />
            <Field label="Author" value={p.meta.author} onChange={(v) => s.commit("Author", (pp) => { pp.meta.author = v; })} />
            <Field label="Description" value={p.meta.description} onChange={(v) => s.commit("Description", (pp) => { pp.meta.description = v; })} />
            <div className="font-mono text-[11px]" style={{ color: "var(--cb-muted)" }}>
              id: {s.projectId ? "#" + s.projectId : "unsaved"} · storage: {store === "local" ? "browser (localStorage)" : "PostgreSQL"}<br />schemaVersion: {p.schemaVersion}<br />created: {new Date(p.meta.created).toLocaleString()}<br />modified: {new Date(p.meta.modified).toLocaleString()}<br />
              {p.components.length} components · {p.wires.length} wires · {s.cn.nets.length} nets · {p.probes.length} probes · {p.runs.length} saved runs
            </div>
            <div className="cb-section">Saved runs</div>
            {p.runs.slice().reverse().map((r) => <div key={r.id} className="cb-row" onClick={() => { s.set({ results: [r], liveRun: null }); s.openWindow("grapher"); }}><span className="truncate">{r.analysis.toUpperCase()} · {r.label}</span><span className="ml-auto text-[10px]" style={{ color: "var(--cb-muted)" }}>{new Date(r.timestamp).toLocaleTimeString()}</span></div>)}
          </div>
        )}
        {tab === "Components" && <PartBrowser compact />}
        {tab === "Nets" && (
          <div>
            {s.cn.nets.map((n) => (
              <details key={n.name} className="mb-[2px]">
                <summary className={"cb-row cursor-pointer " + (s.highlightNet === n.name ? "cb-row-on" : "")} onClick={() => { s.set({ highlightNet: n.name }); const pin = n.pins[0]; if (pin) focusOn(pin.x, pin.y, pin.sheet); }}>
                  <span className="font-mono">{n.name === "0" ? "0 (GND)" : n.name}</span>
                  <span className="ml-auto text-[10px]" style={{ color: "var(--cb-muted)" }}>{n.isGround ? "ground" : n.isPower ? "power" : n.pins.some((pp) => ["GATE", "DFF", "CNT4", "LOGIC_IN"].includes(LIBMAP[p.components.find((c) => c.id === pp.compId)?.type ?? ""]?.model ?? "")) ? "digital" : "analog"} · {n.pins.length} pins</span>
                </summary>
                <div className="pl-4 font-mono text-[11px]">
                  {n.pins.map((pp) => <div key={pp.compId + pp.name} className="cursor-pointer hover:underline" onClick={() => { s.select([pp.compId]); focusOn(pp.x, pp.y, pp.sheet); }}>{pp.ref}.{pp.name}</div>)}
                  {p.probes.filter((q) => s.cn.probeNets[q.id]?.pos === n.name).map((q) => <div key={q.id} style={{ color: q.color }}>probe {q.name}</div>)}
                </div>
              </details>
            ))}
          </div>
        )}
        {tab === "Instruments" && (
          <div>
            {p.components.filter((c) => LIBMAP[c.type]?.instrument).map((c) => <div key={c.id} className="cb-row" onClick={() => { s.select([c.id]); focusOn(c.x, c.y, c.sheet); }} onDoubleClick={() => s.openWindow(c.id)}><span>{c.ref}</span><span style={{ color: "var(--cb-muted)" }}>{LIBMAP[c.type].name}</span><button className="cb-btn ml-auto h-5" onClick={(e) => { e.stopPropagation(); s.openWindow(c.id); }}>Open</button></div>)}
            <div className="mt-2 text-[11px]" style={{ color: "var(--cb-muted)" }}>Place instruments via Place ▸ Instrument or the Components tab (category Instruments).</div>
          </div>
        )}
        {tab === "Probes" && <ProbeManager />}
      </div>
    </div>
  );
}

export function ProbeManager() {
  const s = useCB();
  const p = s.project;
  const runs = currentRunSet(s); const run = runs[runs.length - 1];
  const scopes = p.components.filter((c) => c.type === "SCOPE");
  return (
    <div className="flex flex-col gap-1">
      {!p.probes.length && <div className="text-[11px]" style={{ color: "var(--cb-muted)" }}>No probes. Use Place ▸ Voltage/Current/Differential/Power Probe.</div>}
      {p.probes.map((q) => {
        const y = run ? probeSeries(q, p, s.cn, run) : null;
        const val = y?.length ? y[y.length - 1] : undefined;
        const net = s.cn.probeNets[q.id];
        const target = q.compId ? p.components.find((c) => c.id === q.compId)?.ref : net ? `${net.pos ?? "?"}${q.kind === "diff" ? " − " + (net.neg ?? "?") : ""}` : "";
        return (
          <div key={q.id} className={"rounded border p-1 " + (s.selection.includes(q.id) ? "cb-row-on" : "")} style={{ borderColor: "var(--cb-border)" }}>
            <div className="flex items-center gap-1">
              <input type="color" value={q.color} className="h-4 w-5 border-0 p-0" onChange={(e) => s.commit("Probe color", (pp) => { pp.probes.find((x) => x.id === q.id)!.color = e.target.value; })} />
              <input className="cb-input w-24 font-mono" value={q.name} onChange={(e) => s.commit("Rename probe", (pp) => { pp.probes.find((x) => x.id === q.id)!.name = e.target.value; })} />
              <span className="text-[10px]" style={{ color: "var(--cb-muted)" }}>{q.kind}</span>
              <span className="ml-auto font-mono text-[10px]">{val != null ? fmt(val, probeUnit(q), 4) : ""}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10.5px]">
              <span className="font-mono" style={{ color: "var(--cb-muted)" }}>{target}</span>
              <span className="flex-1" />
              <label className="flex items-center gap-1"><input type="checkbox" checked={q.visible} onChange={(e) => s.commit("Probe visibility", (pp) => { pp.probes.find((x) => x.id === q.id)!.visible = e.target.checked; })} />plot</label>
              <button className="cb-btn h-5" onClick={() => { s.select([q.id]); const c = p.components.find((x) => x.id === q.compId); focusOn(c?.x ?? q.x, c?.y ?? q.y, q.sheet); }}>Go</button>
              <button className="cb-btn h-5" onClick={() => { s.commit("Show probe", (pp) => { pp.probes.find((x) => x.id === q.id)!.visible = true; }); s.openWindow("grapher"); }}>Grapher</button>
              {scopes.length > 0 && (
                <select className="cb-input h-5 text-[10.5px]" value="" onChange={(e) => { const [sid, ch] = e.target.value.split("|"); const st = { ...(p.instrumentState[sid] ?? {}) } as Record<string, unknown>; const src = [...((st.src as string[]) ?? ["pin", "pin", "pin", "pin"])]; const en = [...((st.en as boolean[]) ?? [true, true, false, false])]; src[+ch] = q.name; en[+ch] = true; s.set({ project: { ...p, instrumentState: { ...p.instrumentState, [sid]: { ...st, src, en } } } }); s.openWindow(sid); }}>
                  <option value="">→ Scope</option>
                  {scopes.flatMap((sc) => ["A", "B", "C", "D"].map((ch, i) => <option key={sc.id + ch} value={`${sc.id}|${i}`}>{sc.ref} ch {ch}</option>))}
                </select>
              )}
              <button className="cb-btn h-5" onClick={() => s.commit("Delete probe", (pp) => { pp.probes = pp.probes.filter((x) => x.id !== q.id); })}>Delete</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function PartBrowser({ compact, onPick }: { compact?: boolean; onPick?: () => void }) {
  const s = useCB();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("All");
  const [kind, setKind] = useState("all");
  const [dom, setDom] = useState("all");
  const [sel, setSel] = useState<string>("R");
  const parts = Object.values(LIBMAP).filter((d) =>
    (cat === "All" || (cat === "Favorites" ? s.favorites.includes(d.key) : cat === "Recent" ? s.recentParts.includes(d.key) : cat === "Virtual" ? d.kind === "virtual" : d.category === cat)) &&
    (kind === "all" || d.kind === kind) && (dom === "all" || d.domain === dom) &&
    (!q || (d.name + " " + d.desc + " " + d.key + " " + d.category).toLowerCase().includes(q.toLowerCase())));
  const def = LIBMAP[sel];
  const pick = (k: string) => { s.setTool("place", k); onPick?.(); };
  const fav = (k: string) => { const f = s.favorites.includes(k) ? s.favorites.filter((x) => x !== k) : [...s.favorites, k]; s.set({ favorites: f }); try { localStorage.setItem("cb-fav", JSON.stringify(f)); } catch {} };
  return (
    <div className={compact ? "flex flex-col gap-1" : "flex h-full gap-2"}>
      <div className={compact ? "flex flex-col gap-1" : "flex w-72 flex-col gap-1"}>
        <input className="cb-input" placeholder="Search parts…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!compact} aria-label="Search components" />
        <div className="flex gap-1">
          <select className="cb-input flex-1" value={cat} onChange={(e) => setCat(e.target.value)}><option>All</option><option>Favorites</option><option>Recent</option>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select>
          <select className="cb-input" value={kind} onChange={(e) => setKind(e.target.value)} title="Model kind"><option value="all">any</option><option value="simulated">simulated</option><option value="physical">physical</option><option value="virtual">virtual</option></select>
          <select className="cb-input" value={dom} onChange={(e) => setDom(e.target.value)} title="Domain"><option value="all">all</option><option value="analog">analog</option><option value="digital">digital</option><option value="power">power</option><option value="source">source</option><option value="instrument">instrument</option></select>
        </div>
        <div className={compact ? "" : "min-h-0 flex-1 overflow-auto"}>
          {(cat === "All" && !q ? CATEGORIES.filter((c) => c !== "Virtual") : [null]).map((cg) => {
            const list = cg ? parts.filter((d) => d.category === cg) : parts;
            if (!list.length) return null;
            return (
              <div key={cg ?? "list"}>
                {cg && <div className="cb-section">{cg}</div>}
                {list.map((d) => (
                  <div key={d.key} className={"cb-row " + (sel === d.key ? "cb-row-on" : "")} onClick={() => setSel(d.key)} onDoubleClick={() => pick(d.key)} draggable onDragEnd={() => pick(d.key)} title={d.desc}>
                    <svg width={22} height={16} viewBox="-30 -22 60 44" style={{ color: "var(--cb-sym)" }}><Prims prims={symbolOf(d, {})} sw={2.5} /></svg>
                    <span>{d.name}</span>
                    <button className="ml-auto text-[12px]" style={{ color: s.favorites.includes(d.key) ? "#bf8700" : "var(--cb-muted)" }} onClick={(e) => { e.stopPropagation(); fav(d.key); }} aria-label="Toggle favorite">{s.favorites.includes(d.key) ? "★" : "☆"}</button>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {def && (
        <div className={compact ? "mt-1 rounded border p-1" : "flex-1 rounded border p-2"} style={{ borderColor: "var(--cb-border)" }}>
          <svg width="100%" height={compact ? 70 : 140} viewBox={`${def.box[0] - 12} ${def.box[1] - 10} ${def.box[2] - def.box[0] + 24} ${def.box[3] - def.box[1] + 20}`} style={{ color: "var(--cb-sym)", background: "var(--cb-canvas)" }}>
            <Prims prims={symbolOf(def, Object.fromEntries(def.props.map((pp) => [pp.key, pp.def])))} />
            {pinsOf(def, Object.fromEntries(def.props.map((pp) => [pp.key, pp.def]))).map((pn) => <g key={pn.name}><circle cx={pn.x} cy={pn.y} r={1.3} fill="var(--cb-sel)" /><text x={pn.x + 2} y={pn.y - 2} fontSize={4.5} fill="var(--cb-sel)">{pn.num}:{pn.name}</text></g>)}
          </svg>
          <div className="font-medium">{def.name}</div>
          <div className="text-[11px]" style={{ color: "var(--cb-muted)" }}>{def.desc}</div>
          <div className="mt-1 font-mono text-[10.5px]">Ref prefix: {def.prefix} · Model: {def.model ? <span style={{ color: "var(--cb-ok)" }}>{def.model} ✓</span> : <span style={{ color: "var(--cb-warn)" }}>none (not simulated)</span>} · {def.kind} · {def.domain}{def.footprint ? ` · ${def.footprint}` : ""}</div>
          <div className="font-mono text-[10.5px]">Pins: {pinsOf(def, Object.fromEntries(def.props.map((pp) => [pp.key, pp.def]))).map((pn) => `${pn.num}=${pn.name}`).join(", ")}</div>
          <button className="cb-btn cb-btn-on mt-1" onClick={() => pick(def.key)}>Place {def.name}</button>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, mono, unit, invalid, options }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean; unit?: string; invalid?: boolean; options?: string[] }) {
  const [txt, setTxt] = useState<string | null>(null);
  return (
    <label className="grid grid-cols-[110px_1fr] items-center gap-1 text-[11.5px]">
      <span className="truncate" style={{ color: "var(--cb-muted)" }}>{label}{unit ? ` (${unit})` : ""}</span>
      {options ? (
        <select className="cb-input" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o}>{o}</option>)}</select>
      ) : (
        <input className={"cb-input " + (mono ? "font-mono" : "")} style={invalid ? { borderColor: "var(--cb-err)" } : undefined} value={txt ?? value} onChange={(e) => setTxt(e.target.value)} onBlur={() => { if (txt != null && txt !== value) onChange(txt); setTxt(null); }} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setTxt(null); } }} />
      )}
    </label>
  );
}

export function Inspector() {
  const s = useCB();
  const p = s.project;
  const [sec, setSec] = useState<Record<string, boolean>>({ general: true, sim: true, appearance: false, physical: false, advanced: false });
  const sel = s.selection;
  const Sec = ({ id, title, children }: { id: string; title: string; children: React.ReactNode }) => (
    <div className="border-b" style={{ borderColor: "var(--cb-border)" }}>
      <button className="flex w-full items-center gap-1 px-2 py-1 text-left text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--cb-muted)" }} onClick={() => setSec({ ...sec, [id]: !sec[id] })}>{sec[id] ? "▾" : "▸"} {title}</button>
      {sec[id] && <div className="flex flex-col gap-1 px-2 pb-2">{children}</div>}
    </div>
  );
  if (!sel.length) {
    return (
      <div className="p-2 text-[12px]">
        <div className="cb-section">Sheet</div>
        <div className="font-mono text-[11px]" style={{ color: "var(--cb-muted)" }}>{p.sheets.find((x) => x.id === s.sheet)?.name} · {s.cn.nets.length} nets · {s.diags.filter((d) => d.severity === "error").length} errors · {s.diags.filter((d) => d.severity === "warning").length} warnings</div>
        <div className="cb-section mt-2">Active analysis</div>
        <Field label="Analysis" value={p.sim.analysis} options={["op", "tran", "ac", "dc"]} onChange={(v) => s.commit("Analysis", (pp) => { pp.sim.analysis = v as "tran"; })} />
        {p.sim.analysis === "tran" && <Field label="Stop time" unit="s" mono value={String(p.sim.tran.tstop)} onChange={(v) => { const n = parseValue(v); if (!isNaN(n) && n > 0) s.commit("Stop time", (pp) => { pp.sim.tran.tstop = n; }); }} />}
        <button className="cb-btn mt-1" onClick={() => s.set({ dialog: "analysis" })}>Simulation Settings…</button>
        <div className="mt-3 text-[11px] leading-relaxed" style={{ color: "var(--cb-muted)" }}>Select an object to edit its properties. Double-click an instrument to open its panel.</div>
      </div>
    );
  }
  if (sel.length > 1) return <div className="p-2 text-[12px]">{sel.length} objects selected<div className="mt-1 flex gap-1"><button className="cb-btn" onClick={() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "r" }))}>Rotate</button></div></div>;
  const id = sel[0];
  const c = p.components.find((x) => x.id === id);
  const w = p.wires.find((x) => x.id === id);
  const l = p.labels.find((x) => x.id === id);
  const q = p.probes.find((x) => x.id === id);
  const t = p.texts.find((x) => x.id === id);
  if (c) {
    const def = LIBMAP[c.type];
    const upd = (f: (cc: Component) => void, label = `Edit ${c.ref}`) => s.commit(label, (pp) => { const x = pp.components.find((y) => y.id === id); if (x) f(x); });
    const propField = (pd: PropDef) => <Field key={pd.key} label={pd.label} unit={pd.unit} mono options={pd.options} value={c.props[pd.key] ?? ""} invalid={!!pd.unit && pd.unit !== "%" && !!c.props[pd.key] && isNaN(parseValue(c.props[pd.key], p.variables))} onChange={(v) => upd((x) => { x.props[pd.key] = v; })} />;
    const diags = s.diags.filter((d) => d.compId === id);
    const pins = worldPins(c);
    return (
      <div className="text-[12px]">
        <div className="flex items-center gap-2 border-b px-2 py-1" style={{ borderColor: "var(--cb-border)" }}>
          <b className="font-mono">{c.ref}</b><span style={{ color: "var(--cb-muted)" }}>{def?.name ?? c.type}</span>
          {def?.instrument && <button className="cb-btn ml-auto h-5" onClick={() => s.openWindow(c.id)}>Open panel</button>}
        </div>
        {diags.map((d) => <div key={d.id} className="px-2 py-[2px] text-[11px]" style={{ color: d.severity === "error" ? "var(--cb-err)" : "var(--cb-warn)" }}>● {d.message}</div>)}
        <Sec id="general" title="General">
          <Field label="Reference" mono value={c.ref} onChange={(v) => upd((x) => { x.ref = v; })} />
          {def?.props.filter((pd) => !pd.group || pd.group === "general").map(propField)}
          <Field label="Description" value={c.description ?? ""} onChange={(v) => upd((x) => { x.description = v; })} />
          <Field label="Comment" value={c.comment ?? ""} onChange={(v) => upd((x) => { x.comment = v; })} />
        </Sec>
        {def?.model && (
          <Sec id="sim" title="Simulation">
            <div className="font-mono text-[11px]" style={{ color: "var(--cb-muted)" }}>Model type: {def.model} · {def.kind}</div>
            {def.props.filter((pd) => pd.group === "sim").map(propField)}
            <label className="flex items-center gap-1 text-[11.5px]"><input type="checkbox" checked={c.enabled !== false} onChange={(e) => upd((x) => { x.enabled = e.target.checked; })} /> Enabled in simulation</label>
          </Sec>
        )}
        <Sec id="appearance" title="Appearance">
          <label className="flex items-center gap-1 text-[11.5px]"><input type="checkbox" checked={c.showRef !== false} onChange={(e) => upd((x) => { x.showRef = e.target.checked; })} /> Show reference</label>
          <label className="flex items-center gap-1 text-[11.5px]"><input type="checkbox" checked={c.showValue !== false} onChange={(e) => upd((x) => { x.showValue = e.target.checked; })} /> Show value</label>
          <Field label="Rotation" value={String(c.rot * 90)} options={["0", "90", "180", "270"]} onChange={(v) => upd((x) => { x.rot = (Number(v) / 90) as 0; })} />
          <label className="flex items-center gap-1 text-[11.5px]"><input type="checkbox" checked={c.mirror} onChange={(e) => upd((x) => { x.mirror = e.target.checked; })} /> Mirrored</label>
          <label className="grid grid-cols-[110px_1fr] items-center text-[11.5px]"><span style={{ color: "var(--cb-muted)" }}>Color</span><input type="color" value={c.color ?? "#1f2328"} onChange={(e) => upd((x) => { x.color = e.target.value; })} /></label>
          <Field label="Position X" mono value={String(c.x)} onChange={(v) => { const n = Number(v); if (!isNaN(n)) upd((x) => { x.x = n; }); }} />
          <Field label="Position Y" mono value={String(c.y)} onChange={(v) => { const n = Number(v); if (!isNaN(n)) upd((x) => { x.y = n; }); }} />
        </Sec>
        <Sec id="physical" title="Physical">
          {def?.props.filter((pd) => pd.group === "physical").map(propField)}
          {!def?.props.some((pd) => pd.group === "physical") && <div className="text-[11px]" style={{ color: "var(--cb-muted)" }}>Virtual part — no physical data.</div>}
        </Sec>
        <Sec id="advanced" title="Advanced">
          <div className="font-mono text-[10.5px]">{pins.map((pn) => <div key={pn.name}>{pn.num} {pn.name} → <span className="cursor-pointer underline" onClick={() => s.set({ highlightNet: s.cn.pinNet[c.id + ":" + pn.name] })}>{s.cn.pinNet[c.id + ":" + pn.name] ?? "nc"}</span></div>)}</div>
          <Field label="Net class" value={c.props.netClass ?? ""} onChange={(v) => upd((x) => { x.props.netClass = v; })} />
          <Field label="User properties" mono value={c.props.user ?? ""} onChange={(v) => upd((x) => { x.props.user = v; })} />
        </Sec>
      </div>
    );
  }
  if (w) {
    const net = s.cn.wireNet[w.id];
    return (
      <div className="flex flex-col gap-1 p-2 text-[12px]">
        <div className="cb-section">{w.bus ? "Bus" : "Wire"}</div>
        <div className="font-mono text-[11px]">({w.a.join(", ")}) → ({w.b.join(", ")})</div>
        <Field label="Net name" mono value={net ?? ""} onChange={(v) => { if (v && !w.bus) s.commit("Name net", (pp) => { pp.labels.push({ id: uid("l"), x: w.a[0], y: w.a[1], name: v, kind: "local", sheet: w.sheet }); }); }} />
        <Field label="Net class" value={w.netClass ?? ""} onChange={(v) => s.commit("Net class", (pp) => { pp.wires.filter((x) => s.cn.wireNet[x.id] === net).forEach((x) => (x.netClass = v)); })} />
        <div className="text-[11px]" style={{ color: "var(--cb-muted)" }}>Signal type: {s.cn.netByName[net]?.isGround ? "ground" : s.cn.netByName[net]?.isPower ? "power" : "signal"} · {s.cn.netByName[net]?.pins.length ?? 0} pins</div>
        <label className="grid grid-cols-[110px_1fr] items-center text-[11.5px]"><span style={{ color: "var(--cb-muted)" }}>Color</span><input type="color" value={w.color ?? "#1a5fb4"} onChange={(e) => s.commit("Wire color", (pp) => { pp.wires.find((x) => x.id === id)!.color = e.target.value; })} /></label>
        <button className="cb-btn" onClick={() => s.select(p.wires.filter((x) => s.cn.wireNet[x.id] === net).map((x) => x.id))}>Select whole net</button>
      </div>
    );
  }
  if (l) return (
    <div className="flex flex-col gap-1 p-2 text-[12px]">
      <div className="cb-section">Net label</div>
      <Field label="Name" mono value={l.name} onChange={(v) => s.commit("Rename label", (pp) => { pp.labels.find((x) => x.id === id)!.name = v; })} />
      <Field label="Scope" value={l.kind} options={["local", "global", "port"]} onChange={(v) => s.commit("Label scope", (pp) => { pp.labels.find((x) => x.id === id)!.kind = v as "local"; })} />
    </div>
  );
  if (q) {
    const nets = s.cn.probeNets[q.id];
    return (
      <div className="flex flex-col gap-1 p-2 text-[12px]">
        <div className="cb-section">Probe</div>
        <Field label="Probe type" value={q.kind} options={["voltage", "current", "diff", "power"]} onChange={() => {}} />
        <Field label="Name" mono value={q.name} onChange={(v) => s.commit("Rename probe", (pp) => { pp.probes.find((x) => x.id === id)!.name = v; })} />
        <Field label="Description" value={q.description ?? ""} onChange={(v) => s.commit("Probe desc", (pp) => { pp.probes.find((x) => x.id === id)!.description = v; })} />
        <label className="grid grid-cols-[110px_1fr] items-center text-[11.5px]"><span style={{ color: "var(--cb-muted)" }}>Color</span><input type="color" value={q.color} onChange={(e) => s.commit("Probe color", (pp) => { pp.probes.find((x) => x.id === id)!.color = e.target.value; })} /></label>
        <div className="font-mono text-[11px]">Source net: {q.compId ? p.components.find((x) => x.id === q.compId)?.ref : nets?.pos ?? "unattached"}{q.kind === "diff" ? ` · Reference: ${nets?.neg ?? "unattached"}` : ""}</div>
        <label className="flex items-center gap-1 text-[11.5px]"><input type="checkbox" checked={q.visible} onChange={(e) => s.commit("Probe visible", (pp) => { pp.probes.find((x) => x.id === id)!.visible = e.target.checked; })} /> Plot visibility</label>
        {q.kind === "power" && <PowerStats id={q.id} />}
      </div>
    );
  }
  if (t) return <div className="flex flex-col gap-1 p-2 text-[12px]"><div className="cb-section">{t.shape === "rect" ? "Shape" : "Text"}</div>{t.shape !== "rect" && <Field label="Text" value={t.text} onChange={(v) => s.commit("Edit text", (pp) => { pp.texts.find((x) => x.id === id)!.text = v; })} />}</div>;
  return null;
}

function PowerStats({ id }: { id: string }) {
  const s = useCB(); const runs = currentRunSet(s); const run = runs[runs.length - 1];
  const q = s.project.probes.find((x) => x.id === id)!;
  const y = run ? probeSeries(q, s.project, s.cn, run) : null;
  if (!y || !run || run.x.length < 2) return <div className="text-[11px]" style={{ color: "var(--cb-muted)" }}>Run a transient to compute power statistics.</div>;
  let E = 0, sq = 0; for (let i = 1; i < y.length; i++) { const dt = run.x[i] - run.x[i - 1]; E += ((y[i] + y[i - 1]) / 2) * dt; sq += ((y[i] ** 2 + y[i - 1] ** 2) / 2) * dt; }
  const T = run.x[run.x.length - 1] - run.x[0];
  return <div className="font-mono text-[11px]">P avg {fmt(E / T, "W", 4)} · P rms {fmt(Math.sqrt(sq / T), "W", 4)} · Energy {fmt(E, "J", 4)}</div>;
}

export function BottomPanel() {
  const s = useCB();
  const tabs = [["problems", `Problems (${s.diags.length})`], ["console", "Console"], ["results", "Results"], ["netlist", "Netlist"]] as const;
  const runs = currentRunSet(s);
  return (
    <div className="flex h-full flex-col text-[12px]">
      <div className="flex items-center gap-[2px] border-b px-1" style={{ borderColor: "var(--cb-border)" }}>
        {tabs.map(([k, lab]) => <button key={k} className={"cb-tab " + (s.bottomTab === k ? "cb-tab-on" : "")} onClick={() => s.set({ bottomTab: k })}>{lab}</button>)}
        <span className="flex-1" />
        {s.bottomTab === "console" && <button className="cb-btn h-5" onClick={() => s.set({ log: [] })}>Clear</button>}
      </div>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-[11px]">
        {s.bottomTab === "problems" && (s.diags.length ? s.diags.map((d) => (
          <div key={d.id} className="cb-row" onClick={() => {
            if (d.compId) { const c = s.project.components.find((x) => x.id === d.compId); if (c) { s.select([c.id]); const b = compBBox(c); focusOn((b[0] + b[2]) / 2, (b[1] + b[3]) / 2, c.sheet); } }
            else if (d.at) focusOn(d.at.x, d.at.y, d.at.sheet);
            if (d.net) s.set({ highlightNet: d.net });
          }}>
            <span style={{ color: d.severity === "error" ? "var(--cb-err)" : d.severity === "warning" ? "var(--cb-warn)" : "var(--cb-muted)" }}>{d.severity === "error" ? "✖" : "▲"} {d.code}</span><span>{d.message}</span>
          </div>
        )) : <div className="p-2" style={{ color: "var(--cb-ok)" }}>✓ No ERC problems.</div>)}
        {s.bottomTab === "console" && s.log.map((l, i) => <div key={i} className="px-2" style={{ color: l.level === "error" ? "var(--cb-err)" : l.level === "warn" ? "var(--cb-warn)" : undefined }}>[{new Date(l.t).toLocaleTimeString()}] {l.msg}</div>)}
        {s.bottomTab === "results" && (runs.length ? (
          <div className="p-1">
            {runs.map((r) => (
              <div key={r.id} className="mb-1">
                <div className="font-semibold">{r.analysis.toUpperCase()} · {r.label} · {r.status} · {r.x.length} pts</div>
                <table className="w-full"><tbody>
                  {Object.entries(r.signals).filter(([k]) => /^(V|I)\(/.test(k)).slice(0, 80).map(([k, v]) => <tr key={k}><td className="pr-3">{k}</td><td>{r.analysis === "op" || r.analysis === "tran" ? fmt(v[v.length - 1], k.startsWith("I") ? "A" : "V", 5) : `${fmt(Math.min(...v), "", 4)} … ${fmt(Math.max(...v), "", 4)}`}</td></tr>)}
                </tbody></table>
              </div>
            ))}
          </div>
        ) : <div className="p-2" style={{ color: "var(--cb-muted)" }}>No results.</div>)}
        {s.bottomTab === "netlist" && <pre className="p-2">{exportNetlist(s.project)}</pre>}
      </div>
    </div>
  );
}
