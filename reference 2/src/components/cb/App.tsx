"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCB } from "@/lib/cb/store";
import Canvas from "./Canvas";
import { LeftPanel, Inspector, BottomPanel, ProbeManager } from "./Panels";
import Grapher from "./Grapher";
import { FloatWin } from "./Window";
import { InstrumentBody, INSTR_SIZE } from "./Instruments";
import { Dialogs, type CommandDef } from "./Dialogs";
import { LIBMAP } from "@/lib/cb/library";
import * as A from "@/lib/cb/actions";
import { exportSVG, exportPNG, exportPDF } from "./Plot";
import { exampleRC } from "@/lib/cb/examples";
import { migrateProject } from "@/lib/cb/types";
import * as storage from "@/lib/cb/storage";

const ICONS: Record<string, string> = {
  new: "M4 2h6l3 3v9H4z M10 2v3h3", open: "M2 5h4l1 1h7v7H2z", save: "M3 3h9l2 2v8H3z M5 3v3h5V3 M5 13V9h6v4",
  undo: "M5 6H11a3 3 0 010 6H7 M5 6l3-3 M5 6l3 3", redo: "M11 6H5a3 3 0 000 6h4 M11 6L8 3 M11 6L8 9",
  select: "M4 2l8 6-4 1 2 4-2 1-2-4-2 3z", wire: "M2 12h5V4h7", bus: "M2 12h5V4h7", label: "M2 8l3-4h9v8H5z", gnd: "M8 2v6 M3 8h10 M5 11h6 M7 14h2", vcc: "M8 14V6 M3 6h10",
  part: "M3 8h2l1-3 2 6 2-6 1 3h2", probe: "M3 13l5-5 M8 8l2-6 4 4-6 2", iprobe: "M2 8h10 M9 5l3 3-3 3", run: "M5 3l8 5-8 5z", pause: "M5 3v10 M11 3v10", stop: "M4 4h8v8H4z",
  zin: "M7 3a4 4 0 100 8 4 4 0 000-8 M10 10l4 4 M5 7h4 M7 5v4", zout: "M7 3a4 4 0 100 8 4 4 0 000-8 M10 10l4 4 M5 7h4", fit: "M2 6V2h4 M10 2h4v4 M14 10v4h-4 M6 14H2v-4",
  graph: "M2 13h12 M2 3v10 M3 11l3-4 3 2 4-6", scope: "M2 3h12v10H2z M3 8q2-4 4 0t4 0", rot: "M12 8a4 4 0 11-4-4h3 M9 2l2 2-2 2", mirror: "M8 2v12 M6 4L2 8l4 4 M10 4l4 4-4 4",
};
function Icon({ n }: { n: string }) { return <svg width={15} height={15} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICONS[n]} /></svg>; }

export default function App() {
  const s = useCB();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [docked, setDocked] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<{ project: unknown; projectId: number | null; t: number } | null>(null);
  const [recent, setRecent] = useState<{ id: number; name: string }[]>([]);
  const [store, setStore] = useState<"local" | "remote">(storage.mode);
  const fileNet = useRef<HTMLInputElement>(null);
  const L = s.project.layout;
  const running = s.status === "Running" || s.status === "Paused";

  // boot: recovery / default project
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cb-autosave");
      if (raw) { const r = JSON.parse(raw); setRecovery(r); }
    } catch {}
    useCB.getState().loadProject(exampleRC());
    setRecent(A.recentProjects());
    storage.detectMode().then(setStore);
    setTimeout(() => A.zoomTo(), 60);
  }, []);
  // autosave
  useEffect(() => {
    if (!s.dirty) return;
    const t = setTimeout(() => { try { localStorage.setItem("cb-autosave", JSON.stringify({ project: s.project, projectId: s.projectId, t: Date.now() })); } catch {} }, 2500);
    return () => clearTimeout(t);
  }, [s.project, s.dirty, s.projectId]);
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (useCB.getState().dirty) { e.preventDefault(); } }; window.addEventListener("beforeunload", h); return () => window.removeEventListener("beforeunload", h); }, []);

  const dlg = (d: string) => () => s.set({ dialog: d });
  const setL = (k: string, v: unknown) => s.commit(`View ${k}`, (p) => { (p.layout as unknown as Record<string, unknown>)[k] = v; });
  const place = (t: string) => () => s.setTool("place", t);
  const svgExport = (kind: "svg" | "png" | "pdf") => () => { const el = svgRef.current; if (!el) return; const n = s.project.meta.name; if (kind === "svg") exportSVG(el, n); else if (kind === "png") exportPNG(el, n); else exportPDF(el, n); };
  const firstInstr = (t: string) => s.project.components.find((c) => c.type === t);

  const commands: CommandDef[] = useMemo(() => [
    { id: "new", group: "File", label: "New Project", key: "", run: A.newProject },
    { id: "open", group: "File", label: "Open…", key: "Ctrl+O", run: dlg("open") },
    { id: "save", group: "File", label: "Save", key: "Ctrl+S", run: () => A.saveProject("save") },
    { id: "saveas", group: "File", label: "Save As…", run: () => A.saveProject("as") },
    { id: "savecopy", group: "File", label: "Save Copy…", run: () => A.saveProject("copy") },
    { id: "expjson", group: "File", label: "Export Project File (.json)", run: A.exportJSON },
    { id: "impnet", group: "File", label: "Import SPICE Netlist…", run: () => fileNet.current?.click() },
    { id: "expnet", group: "File", label: "Export SPICE Netlist", run: A.exportNetlistFile },
    { id: "expsvg", group: "File", label: "Export SVG", run: svgExport("svg") },
    { id: "exppng", group: "File", label: "Export PNG", run: svgExport("png") },
    { id: "exppdf", group: "File", label: "Export PDF", run: svgExport("pdf") },
    { id: "exit", group: "File", label: "Exit (close project)", run: A.newProject },
    { id: "undo", group: "Edit", label: "Undo", key: "Ctrl+Z", run: s.undo, disabled: !s.past.length },
    { id: "redo", group: "Edit", label: "Redo", key: "Ctrl+Y", run: s.redo, disabled: !s.future.length },
    { id: "cut", group: "Edit", label: "Cut", key: "Ctrl+X", run: () => A.copySel(true), disabled: !s.selection.length },
    { id: "copy", group: "Edit", label: "Copy", key: "Ctrl+C", run: () => A.copySel(), disabled: !s.selection.length },
    { id: "paste", group: "Edit", label: "Paste", key: "Ctrl+V", run: () => A.paste(), disabled: !s.clipboard },
    { id: "dup", group: "Edit", label: "Duplicate", key: "Ctrl+D", run: A.duplicateSel, disabled: !s.selection.length },
    { id: "del", group: "Edit", label: "Delete", key: "Del", run: A.deleteSel, disabled: !s.selection.length },
    { id: "selall", group: "Edit", label: "Select All", key: "Ctrl+A", run: A.selectAll },
    { id: "find", group: "Edit", label: "Find…", key: "Ctrl+F", run: dlg("find") },
    { id: "rot", group: "Edit", label: "Rotate 90°", key: "R", run: () => A.rotateSel(1) },
    { id: "mir", group: "Edit", label: "Mirror", key: "M", run: A.mirrorSel },
    { id: "zin", group: "View", label: "Zoom In", key: "+", run: () => A.zoomBy(1.25) },
    { id: "zout", group: "View", label: "Zoom Out", key: "−", run: () => A.zoomBy(0.8) },
    { id: "zfit", group: "View", label: "Fit to Content", key: "F", run: () => A.zoomTo() },
    { id: "zsel", group: "View", label: "Zoom to Selection", run: () => A.zoomTo(new Set(s.selection)), disabled: !s.selection.length },
    { id: "grid", group: "View", label: (L.grid ? "✓ " : "") + "Grid", run: () => setL("grid", !L.grid) },
    { id: "snap10", group: "View", label: (L.snap === 1 ? "✓ " : "") + "Snap 10 mil", run: () => setL("snap", 1) },
    { id: "snap50", group: "View", label: (L.snap === 5 ? "✓ " : "") + "Snap 50 mil", run: () => setL("snap", 5) },
    { id: "snap100", group: "View", label: (L.snap === 10 ? "✓ " : "") + "Snap 100 mil", run: () => setL("snap", 10) },
    { id: "rulers", group: "View", label: (L.rulers ? "✓ " : "") + "Rulers", run: () => setL("rulers", !L.rulers) },
    { id: "border", group: "View", label: (L.pageBorder ? "✓ " : "") + "Page Border", run: () => setL("pageBorder", !L.pageBorder) },
    { id: "pleft", group: "View", label: (L.left ? "✓ " : "") + "Design Browser Panel", run: () => setL("left", !L.left) },
    { id: "pright", group: "View", label: (L.right ? "✓ " : "") + "Inspector Panel", run: () => setL("right", !L.right) },
    { id: "pbottom", group: "View", label: (L.bottom ? "✓ " : "") + "Bottom Panel", run: () => setL("bottom", !L.bottom) },
    { id: "dark", group: "View", label: (L.dark ? "✓ " : "") + "Dark Mode", run: () => setL("dark", !L.dark) },
    { id: "markers", group: "View", label: (L.markers ? "✓ " : "") + "Simulation Markers", run: () => setL("markers", !L.markers) },
    { id: "pcomp", group: "Place", label: "Component…", key: "P", run: dlg("components") },
    { id: "pwire", group: "Place", label: "Wire", key: "W", run: () => s.setTool("wire") },
    { id: "plabel", group: "Place", label: "Net Label", key: "L", run: () => s.setTool("label") },
    { id: "pglabel", group: "Place", label: "Global Net Label", run: () => s.setTool("glabel") },
    { id: "ppwr", group: "Place", label: "Power Symbol (VCC)", run: place("VCC") },
    { id: "pvdd", group: "Place", label: "Power Symbol (VDD)", run: place("VDD") },
    { id: "pgnd", group: "Place", label: "Ground", key: "G", run: place("GND") },
    { id: "pbus", group: "Place", label: "Bus", key: "B", run: () => s.setTool("bus") },
    { id: "pbusentry", group: "Place", label: "Bus Entry", run: () => s.setTool("busentry") },
    { id: "pport", group: "Place", label: "Hierarchical Port", run: () => s.setTool("port") },
    { id: "pvp", group: "Place", label: "Voltage Probe", run: () => s.setTool("probe-voltage") },
    { id: "pip", group: "Place", label: "Current Probe", run: () => s.setTool("probe-current") },
    { id: "pdp", group: "Place", label: "Differential Probe", run: () => s.setTool("probe-diff") },
    { id: "ppp", group: "Place", label: "Power Probe", run: () => s.setTool("probe-power") },
    ...["SCOPE", "FGEN", "DMM", "BODE", "LA", "FCNT", "WGEN", "SPEC", "WATT", "IV"].map((k) => ({ id: "pi" + k, group: "Place", label: `Instrument ▸ ${LIBMAP[k].name}`, run: place(k) })),
    { id: "ptext", group: "Place", label: "Text", run: () => s.setTool("text") },
    { id: "prect", group: "Place", label: "Graphic Shape (Rectangle)", run: () => s.setTool("rect") },
    { id: "run", group: "Simulate", label: s.status === "Paused" ? "Resume" : "Run", key: "F5", run: () => (s.status === "Paused" ? s.resume() : s.runSim()), disabled: s.status === "Running" },
    { id: "pause", group: "Simulate", label: "Pause", key: "F6", run: s.pause, disabled: s.status !== "Running" },
    { id: "stop", group: "Simulate", label: "Stop", key: "Shift+F5", run: s.stop, disabled: !running },
    { id: "restart", group: "Simulate", label: "Restart", run: () => { s.stop(); setTimeout(() => useCB.getState().runSim(), 150); } },
    { id: "simset", group: "Simulate", label: "Simulation Settings…", run: dlg("analysis") },
    { id: "inter", group: "Simulate", label: (s.interactive ? "✓ " : "") + "Interactive Simulation (continuous)", run: () => s.set({ interactive: !s.interactive }) },
    { id: "openan", group: "Simulate", label: "Open Analysis…", run: dlg("analysis") },
    { id: "grapher", group: "Simulate", label: "Open Grapher", run: () => s.openWindow("grapher") },
    { id: "clear", group: "Simulate", label: "Clear Results", run: s.clearResults },
    { id: "aop", group: "Analyze", label: "Operating Point", run: () => { s.commit("Analysis", (p) => { p.sim.analysis = "op"; }); s.runSim("op"); } },
    { id: "atran", group: "Analyze", label: "Transient Analysis…", run: () => { s.commit("Analysis", (p) => { p.sim.analysis = "tran"; }); s.set({ dialog: "analysis" }); } },
    { id: "aac", group: "Analyze", label: "AC Analysis…", run: () => { s.commit("Analysis", (p) => { p.sim.analysis = "ac"; }); s.set({ dialog: "analysis" }); } },
    { id: "adc", group: "Analyze", label: "DC Sweep…", run: () => { s.commit("Analysis", (p) => { p.sim.analysis = "dc"; }); s.set({ dialog: "analysis" }); } },
    { id: "aparam", group: "Analyze", label: "Parameter Sweep…", run: dlg("param") },
    { id: "atemp", group: "Analyze", label: "Temperature Sweep…", run: dlg("temp") },
    { id: "afour", group: "Analyze", label: "Fourier Analysis…", run: dlg("fourier") },
    { id: "anoise", group: "Analyze", label: "Noise Analysis (not available in this engine)", run: () => {}, disabled: true },
    { id: "amc", group: "Analyze", label: "Monte Carlo…", run: dlg("mc") },
    { id: "asens", group: "Analyze", label: "Sensitivity…", run: dlg("sens") },
    { id: "tcomp", group: "Tools", label: "Component Browser", run: dlg("components") },
    { id: "tmodel", group: "Tools", label: "Model Manager", run: dlg("models") },
    { id: "tnet", group: "Tools", label: "Netlist Viewer", run: dlg("netlist") },
    { id: "terc", group: "Tools", label: "ERC", run: dlg("erc") },
    { id: "tann", group: "Tools", label: "Annotation (renumber references)", run: () => s.commit("Annotate", (p) => { const cnt: Record<string, number> = {}; const sorted = [...p.components].sort((a, b) => a.y - b.y || a.x - b.x); for (const c of sorted) { const pre = LIBMAP[c.type]?.prefix; if (!pre || pre.startsWith("#")) continue; cnt[pre] = (cnt[pre] ?? 0) + 1; const old = c.ref; c.ref = pre + cnt[pre]; if (old !== c.ref) for (const q of p.probes) if (q.compId === c.id) q.name = q.name.replace(old, c.ref); } }) },
    { id: "tvars", group: "Tools", label: "Design Variables", run: dlg("vars") },
    { id: "tprefs", group: "Tools", label: "Preferences", run: dlg("prefs") },
    { id: "tkeys", group: "Tools", label: "Keyboard Shortcuts", run: dlg("shortcuts") },
    { id: "ttests", group: "Tools", label: "Run Self-Tests", run: dlg("tests") },
    { id: "rbom", group: "Reports", label: "Bill of Materials", run: dlg("bom") },
    { id: "rcomp", group: "Reports", label: "Component List", run: dlg("complist") },
    { id: "rnet", group: "Reports", label: "Net List", run: dlg("netrep") },
    { id: "rsim", group: "Reports", label: "Simulation Report", run: dlg("simrep") },
    { id: "rmeas", group: "Reports", label: "Measurement Report", run: dlg("measrep") },
    { id: "wpanels", group: "Window", label: "Show All Panels", run: () => s.commit("Panels", (p) => { p.layout.left = p.layout.right = p.layout.bottom = true; }) },
    { id: "wprobes", group: "Window", label: "Probe Manager", run: () => s.openWindow("probes") },
    { id: "wgrapher", group: "Window", label: "Grapher", run: () => s.openWindow("grapher") },
    ...s.project.components.filter((c) => LIBMAP[c.type]?.instrument).map((c) => ({ id: "win" + c.id, group: "Window", label: `Instrument ${c.ref}`, run: () => s.openWindow(c.id) })),
    { id: "warrange", group: "Window", label: "Arrange Windows (cascade)", run: () => { const p = s.project; const w = { ...p.layout.windows }; s.windows.forEach((id, i) => { const [ww, hh] = LIBMAP[p.components.find((c) => c.id === id)?.type ?? ""] ? INSTR_SIZE[p.components.find((c) => c.id === id)!.type] ?? [520, 380] : [760, 520]; w[id] = { x: 300 + i * 32, y: 90 + i * 32, w: ww, h: hh, open: true }; }); s.set({ project: { ...p, layout: { ...p.layout, windows: w } } }); } },
    { id: "hdocs", group: "Help", label: "Documentation", run: dlg("docs") },
    { id: "hkeys", group: "Help", label: "Keyboard Shortcuts", run: dlg("shortcuts") },
    { id: "habout", group: "Help", label: "About CircuitBench", run: dlg("about") },
    { id: "palette", group: "Help", label: "Command Palette", key: "Ctrl+K", run: dlg("palette") },
  ], [s, L, running]); // eslint-disable-line react-hooks/exhaustive-deps

  // keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const st = useCB.getState();
      if ((e.target as HTMLElement)?.closest?.("input,textarea,select") || st.dialog) return;
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod) {
        const map: Record<string, () => void> = { s: () => A.saveProject(e.shiftKey ? "as" : "save"), z: () => (e.shiftKey ? st.redo() : st.undo()), y: st.redo, c: () => A.copySel(), x: () => A.copySel(true), v: () => A.paste(), d: A.duplicateSel, a: A.selectAll, f: () => st.set({ dialog: "find" }), k: () => st.set({ dialog: "palette" }), o: () => st.set({ dialog: "open" }) };
        if (map[k]) { e.preventDefault(); map[k](); }
        return;
      }
      if (e.key === "F5") { e.preventDefault(); if (e.shiftKey) st.stop(); else if (st.status === "Paused") st.resume(); else st.runSim(); return; }
      if (e.key === "F6") { e.preventDefault(); st.pause(); return; }
      const single: Record<string, () => void> = {
        w: () => st.setTool("wire"), b: () => st.setTool("bus"), l: () => st.setTool("label"), g: () => st.setTool("place", "GND"), p: () => st.set({ dialog: "components" }),
        r: () => A.rotateSel(e.shiftKey ? -1 : 1), m: A.mirrorSel, e: () => st.commit("Show inspector", (pp) => { pp.layout.right = true; }), f: () => A.zoomTo(), "+": () => A.zoomBy(1.25), "=": () => A.zoomBy(1.25), "-": () => A.zoomBy(0.8),
        delete: A.deleteSel, backspace: A.deleteSel, escape: () => { st.setTool("select"); st.set({ highlightNet: null }); },
      };
      if (single[k]) { e.preventDefault(); single[k](); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  const groups = ["File", "Edit", "View", "Place", "Simulate", "Analyze", "Tools", "Reports", "Window", "Help"];
  const statusColor = { Ready: "var(--cb-muted)", Preparing: "var(--cb-warn)", Running: "var(--cb-ok)", Paused: "var(--cb-warn)", Completed: "var(--cb-ok)", Stopped: "var(--cb-muted)", Error: "var(--cb-err)", "Convergence Warning": "var(--cb-warn)" }[s.status];
  const TB = ({ icon, title, on, onClick, disabled }: { icon: string; title: string; on?: boolean; onClick: () => void; disabled?: boolean }) => (
    <button className={"cb-tool " + (on ? "cb-tool-on" : "")} title={title} aria-label={title} onClick={onClick} disabled={disabled}><Icon n={icon} /></button>
  );
  const sep = <span className="mx-1 h-5 w-px" style={{ background: "var(--cb-border)" }} />;
  const errCount = s.diags.filter((d) => d.severity === "error").length, warnCount = s.diags.filter((d) => d.severity === "warning").length;

  return (
    <div className={"cb-root flex h-screen flex-col overflow-hidden " + (L.dark ? "dark" : "")} onMouseDown={() => menu && setMenu(null)}>
      <input ref={fileNet} type="file" accept=".cir,.net,.sp,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) A.importNetlistFile(f); e.target.value = ""; }} />
      {/* title bar */}
      <div className="flex h-7 shrink-0 items-center gap-2 border-b px-3 text-[12px]" style={{ background: "var(--cb-toolbar)", borderColor: "var(--cb-border)" }}>
        <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden><rect x="1" y="1" width="14" height="14" rx="3" fill="#1f6feb" /><path d="M3 9h3l1-3 2 5 1-2h3" stroke="#fff" strokeWidth="1.4" fill="none" /></svg>
        <b>CircuitBench</b>
        <span style={{ color: "var(--cb-muted)" }}>— {s.project.meta.name}{s.dirty ? " •" : ""}{s.projectId ? ` (#${s.projectId})` : " (unsaved)"} · {store === "local" ? "browser storage" : "database"}</span>
        <span className="flex-1" />
        <span className="font-mono text-[11px]" style={{ color: statusColor }}>● {s.status}{s.status === "Running" && s.progress ? ` ${Math.round(s.progress * 100)}%` : ""}</span>
      </div>
      {/* menu bar */}
      <div className="relative z-50 flex h-6 shrink-0 items-center border-b px-1 text-[12px]" style={{ background: "var(--cb-panel)", borderColor: "var(--cb-border)" }} onMouseDown={(e) => e.stopPropagation()}>
        {groups.map((g) => (
          <div key={g} className="relative">
            <button className={"rounded px-2 py-[1px] " + (menu === g ? "bg-[var(--cb-selbg)]" : "hover:bg-[var(--cb-hover)]")} onClick={() => setMenu(menu === g ? null : g)} onMouseEnter={() => menu && setMenu(g)}>{g}</button>
            {menu === g && (
              <div className="absolute left-0 top-6 min-w-[250px] rounded-md border py-1 shadow-lg" style={{ background: "var(--cb-panel)", borderColor: "var(--cb-border)" }}>
                {commands.filter((c) => c.group === g).map((c) => (
                  <button key={c.id} disabled={c.disabled} className="flex w-full items-center px-3 py-[3px] text-left hover:bg-[var(--cb-selbg)] disabled:opacity-40 disabled:hover:bg-transparent" onClick={() => { setMenu(null); c.run(); }}>
                    <span>{c.label}</span><span className="ml-auto pl-6 font-mono text-[10.5px]" style={{ color: "var(--cb-muted)" }}>{c.key}</span>
                  </button>
                ))}
                {g === "File" && recent.length > 0 && <><div className="my-1 border-t" style={{ borderColor: "var(--cb-border)" }} /><div className="px-3 text-[10.5px]" style={{ color: "var(--cb-muted)" }}>Recent Projects</div>{recent.map((r) => <button key={r.id} className="flex w-full px-3 py-[3px] text-left hover:bg-[var(--cb-selbg)]" onClick={() => { setMenu(null); A.openProject(r.id); }}>{r.name} <span className="ml-auto font-mono text-[10px]" style={{ color: "var(--cb-muted)" }}>#{r.id}</span></button>)}</>}
              </div>
            )}
          </div>
        ))}
      </div>
      {/* toolbar */}
      <div className="flex h-8 shrink-0 items-center gap-[2px] border-b px-2" style={{ background: "var(--cb-toolbar)", borderColor: "var(--cb-border)" }}>
        <TB icon="new" title="New Project" onClick={A.newProject} /><TB icon="open" title="Open (Ctrl+O)" onClick={dlg("open")} /><TB icon="save" title="Save (Ctrl+S)" onClick={() => A.saveProject("save")} />
        {sep}<TB icon="undo" title="Undo (Ctrl+Z)" onClick={s.undo} disabled={!s.past.length} /><TB icon="redo" title="Redo (Ctrl+Y)" onClick={s.redo} disabled={!s.future.length} />
        {sep}<TB icon="select" title="Select (Esc)" on={s.tool === "select"} onClick={() => s.setTool("select")} /><TB icon="wire" title="Wire (W)" on={s.tool === "wire"} onClick={() => s.setTool("wire")} />
        <TB icon="label" title="Net Label (L)" on={s.tool === "label"} onClick={() => s.setTool("label")} /><TB icon="gnd" title="Ground (G)" on={s.tool === "place" && s.placeType === "GND"} onClick={place("GND")} /><TB icon="vcc" title="VCC" on={s.tool === "place" && s.placeType === "VCC"} onClick={place("VCC")} />
        <TB icon="part" title="Component Browser (P)" onClick={dlg("components")} />
        <TB icon="rot" title="Rotate (R)" onClick={() => A.rotateSel(1)} /><TB icon="mirror" title="Mirror (M)" onClick={A.mirrorSel} />
        {sep}<TB icon="probe" title="Voltage Probe" on={s.tool === "probe-voltage"} onClick={() => s.setTool("probe-voltage")} /><TB icon="iprobe" title="Current Probe" on={s.tool === "probe-current"} onClick={() => s.setTool("probe-current")} />
        {sep}
        <select className="cb-input h-6" value={s.project.sim.analysis} onChange={(e) => s.commit("Analysis", (p) => { p.sim.analysis = e.target.value as "tran"; })} aria-label="Active analysis"><option value="op">Operating Point</option><option value="tran">Transient</option><option value="ac">AC Sweep</option><option value="dc">DC Sweep</option></select>
        <TB icon="run" title={s.status === "Paused" ? "Resume (F5)" : "Run (F5)"} onClick={() => (s.status === "Paused" ? s.resume() : s.runSim())} disabled={s.status === "Running"} />
        <TB icon="pause" title="Pause (F6)" onClick={s.pause} disabled={s.status !== "Running"} /><TB icon="stop" title="Stop (Shift+F5)" onClick={s.stop} disabled={!running} />
        <button className="cb-btn h-6" onClick={dlg("param")}>Sweep…</button>
        {sep}<TB icon="graph" title="Grapher" onClick={() => s.openWindow("grapher")} /><TB icon="scope" title="Open first oscilloscope" onClick={() => { const c = firstInstr("SCOPE"); if (c) s.openWindow(c.id); else s.setTool("place", "SCOPE"); }} />
        {sep}<TB icon="zin" title="Zoom In" onClick={() => A.zoomBy(1.25)} /><TB icon="zout" title="Zoom Out" onClick={() => A.zoomBy(0.8)} /><TB icon="fit" title="Fit (F)" onClick={() => A.zoomTo()} />
        <span className="flex-1" />
        <span className="font-mono text-[11px]" style={{ color: "var(--cb-muted)" }}>{s.tool === "place" ? `Placing ${LIBMAP[s.placeType ?? ""]?.name ?? ""} — R rotate, M mirror, Esc done` : s.tool !== "select" ? `${s.tool} — Esc to finish` : ""}</span>
      </div>
      {recovery && (
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-1 text-[12px]" style={{ background: "var(--cb-warnbg)", borderColor: "var(--cb-border)" }}>
          Unsaved work from {new Date(recovery.t).toLocaleString()} was found (crash recovery).
          <button className="cb-btn h-5" onClick={() => { s.loadProject(migrateProject(recovery.project), recovery.projectId); s.set({ dirty: true }); setRecovery(null); setTimeout(() => A.zoomTo(), 50); }}>Restore</button>
          <button className="cb-btn h-5" onClick={() => { localStorage.removeItem("cb-autosave"); setRecovery(null); }}>Discard</button>
        </div>
      )}
      {/* main */}
      <div className="flex min-h-0 flex-1">
        {L.left && <aside className="shrink-0 border-r" style={{ width: L.leftW, background: "var(--cb-panel)", borderColor: "var(--cb-border)" }}><LeftPanel /></aside>}
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-6 shrink-0 items-center gap-[2px] border-b px-1 text-[11.5px]" style={{ background: "var(--cb-panel)", borderColor: "var(--cb-border)" }}>
            {s.project.sheets.map((sh) => <button key={sh.id} className={"cb-tab " + (s.sheet === sh.id ? "cb-tab-on" : "")} onClick={() => s.set({ sheet: sh.id })}>{sh.name}</button>)}
          </div>
          <div className="min-h-0 flex-1"><Canvas svgRef={svgRef} /></div>
          {L.bottom && (
            <div className="shrink-0 border-t" style={{ height: docked ? Math.max(L.bottomH, 330) : L.bottomH, background: "var(--cb-panel)", borderColor: "var(--cb-border)" }}>
              {docked ? (
                <div className="flex h-full flex-col">
                  <div className="flex h-6 items-center gap-2 border-b px-2 text-[12px]" style={{ borderColor: "var(--cb-border)" }}><b>Docked: {docked === "grapher" ? "Grapher" : s.project.components.find((c) => c.id === docked)?.ref}</b><span className="flex-1" /><button className="cb-btn h-5" onClick={() => { s.openWindow(docked); setDocked(null); }}>Undock</button><button className="cb-btn h-5" onClick={() => setDocked(null)}>Close</button></div>
                  <div className="min-h-0 flex-1 overflow-auto">{docked === "grapher" ? <Grapher /> : (() => { const c = s.project.components.find((x) => x.id === docked); return c ? <InstrumentBody c={c} /> : null; })()}</div>
                </div>
              ) : <BottomPanel />}
            </div>
          )}
        </div>
        {L.right && <aside className="shrink-0 overflow-auto border-l" style={{ width: L.rightW, background: "var(--cb-panel)", borderColor: "var(--cb-border)" }}><Inspector /></aside>}
      </div>
      {/* status bar */}
      <div className="flex h-5 shrink-0 items-center gap-3 border-t px-2 font-mono text-[10.5px]" style={{ background: "var(--cb-toolbar)", borderColor: "var(--cb-border)", color: "var(--cb-muted)" }}>
        <span style={{ color: statusColor }}>{s.status}</span>
        <button onClick={() => s.set({ bottomTab: "problems" })} style={{ color: errCount ? "var(--cb-err)" : undefined }}>✖ {errCount}</button>
        <button onClick={() => s.set({ bottomTab: "problems" })} style={{ color: warnCount ? "var(--cb-warn)" : undefined }}>▲ {warnCount}</button>
        <span>{s.selection.length} selected</span>
        {s.highlightNet && <span>net: {s.highlightNet}</span>}
        <span className="flex-1" />
        <span>{s.project.sim.analysis.toUpperCase()} · T={s.project.sim.temp}°C</span>
        <button onClick={() => setL("left", !L.left)}>◧</button><button onClick={() => setL("bottom", !L.bottom)}>⬓</button><button onClick={() => setL("right", !L.right)}>◨</button>
      </div>
      {/* floating windows */}
      {s.windows.filter((id) => id !== docked).map((id) => {
        if (id === "grapher") return <FloatWin key={id} id={id} title="Grapher" w={900} h={560} onDock={() => { setDocked(id); s.closeWindow(id); }}><Grapher /></FloatWin>;
        if (id === "probes") return <FloatWin key={id} id={id} title="Probe Manager" w={420} h={420}><div className="p-2"><ProbeManager /></div></FloatWin>;
        const c = s.project.components.find((x) => x.id === id);
        if (!c) return null;
        const [w, h] = INSTR_SIZE[c.type] ?? [520, 380];
        return <FloatWin key={id} id={id} title={`${c.ref} — ${LIBMAP[c.type]?.name}`} w={w} h={h} onDock={() => { setDocked(id); s.closeWindow(id); }}><InstrumentBody c={c} /></FloatWin>;
      })}
      <Dialogs commands={commands} />
    </div>
  );
}
