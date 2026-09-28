"use client";
import { create } from "zustand";
import type { Project, SavedRun, Component } from "./types";
import { emptyProject, migrateProject, uid } from "./types";
import { resolve, runERC, type Connectivity, type Diagnostic } from "./connectivity";
import { transient, runAC, runDC, operatingPoint, runParamSweep, runTempSweep, runMonteCarlo, SimError, type TranProgress } from "./analyses";
import { LIBMAP, defaultProps } from "./library";

export type Tool =
  | "select" | "wire" | "bus" | "busentry" | "place" | "label" | "glabel" | "port"
  | "probe-voltage" | "probe-current" | "probe-diff" | "probe-power" | "text" | "rect";
export type SimStatus = "Ready" | "Preparing" | "Running" | "Paused" | "Completed" | "Stopped" | "Error" | "Convergence Warning";

interface Cmd { label: string; before: Project }

export interface LogLine { t: number; level: "info" | "warn" | "error"; msg: string }

interface State {
  project: Project;
  projectId: number | null;
  dirty: boolean;
  past: Cmd[];
  future: Cmd[];
  selection: string[];
  tool: Tool;
  placeType: string | null;
  placeRot: 0 | 1 | 2 | 3;
  placeMirror: boolean;
  zoom: number;
  panX: number;
  panY: number;
  sheet: string;
  highlightNet: string | null;
  cn: Connectivity;
  diags: Diagnostic[];
  status: SimStatus;
  progress: number;
  results: SavedRun[];
  liveRun: SavedRun | null;
  log: LogLine[];
  bottomTab: "problems" | "console" | "results" | "netlist";
  dialog: string | null;
  dialogArg: string | null;
  windows: string[]; // open floating windows: compId for instruments, "grapher", "probes"
  clipboard: string | null;
  favorites: string[];
  recentParts: string[];
  interactive: boolean;
  focus: { x: number; y: number } | null;
  // actions
  set: (p: Partial<State>) => void;
  commit: (label: string, fn: (p: Project) => void) => void;
  loadProject: (p: Project, id?: number | null) => void;
  undo: () => void;
  redo: () => void;
  select: (ids: string[], add?: boolean) => void;
  setTool: (t: Tool, placeType?: string | null) => void;
  logMsg: (level: LogLine["level"], msg: string) => void;
  openWindow: (id: string) => void;
  closeWindow: (id: string) => void;
  runSim: (kind?: "default" | "op" | "tran" | "ac" | "dc" | "param" | "temp" | "mc") => Promise<void>;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  clearResults: () => void;
  addPart: (type: string, x: number, y: number) => Component;
  nextRef: (prefix: string) => string;
}

let simCtl = { paused: false, stopped: false };
const MAX_HISTORY = 200;

function recompute(p: Project) {
  const cn = resolve(p);
  return { cn, diags: runERC(p, cn) };
}
function decimate(r: SavedRun, max = 2500): SavedRun {
  if (r.x.length <= max) return r;
  const step = r.x.length / max;
  const idx = Array.from({ length: max }, (_, i) => Math.floor(i * step));
  return { ...r, x: idx.map((i) => r.x[i]), signals: Object.fromEntries(Object.entries(r.signals).map(([k, v]) => [k, idx.map((i) => v[i])])) };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

const init = emptyProject();
const ls = (k: string, d: string[]) => { if (typeof window === "undefined") return d; try { return JSON.parse(localStorage.getItem(k) || "null") ?? d; } catch { return d; } };

export const useCB = create<State>((set, get) => ({
  project: init,
  projectId: null,
  dirty: false,
  past: [],
  future: [],
  selection: [],
  tool: "select",
  placeType: null,
  placeRot: 0,
  placeMirror: false,
  zoom: 2,
  panX: 0,
  panY: 0,
  sheet: "s1",
  highlightNet: null,
  ...recompute(init),
  status: "Ready",
  progress: 0,
  results: [],
  liveRun: null,
  log: [],
  bottomTab: "problems",
  dialog: null,
  dialogArg: null,
  windows: [],
  clipboard: null,
  favorites: ls("cb-fav", ["R", "C", "VSIN", "GND"]),
  recentParts: ls("cb-recent", []),
  interactive: false,
  focus: null,

  set: (p) => set(p as State),
  commit: (label, fn) => {
    const before = get().project;
    const next = structuredClone(before);
    fn(next);
    next.meta.modified = Date.now();
    set({ project: next, dirty: true, past: [...get().past.slice(-MAX_HISTORY), { label, before }], future: [], ...recompute(next) });
  },
  loadProject: (p, id = null) => {
    const proj = migrateProject(p);
    set({ project: proj, projectId: id, dirty: false, past: [], future: [], selection: [], sheet: proj.sheets[0]?.id ?? "s1", results: proj.runs.slice(-1), liveRun: null, status: "Ready", windows: [], ...recompute(proj) });
  },
  undo: () => {
    const { past, project, future } = get();
    const c = past[past.length - 1]; if (!c) return;
    set({ project: c.before, past: past.slice(0, -1), future: [...future, { label: c.label, before: project }], dirty: true, ...recompute(c.before) });
    get().logMsg("info", `Undo: ${c.label}`);
  },
  redo: () => {
    const { past, project, future } = get();
    const c = future[future.length - 1]; if (!c) return;
    set({ project: c.before, future: future.slice(0, -1), past: [...past, { label: c.label, before: project }], dirty: true, ...recompute(c.before) });
  },
  select: (ids, add) => set({ selection: add ? [...new Set([...get().selection, ...ids])] : ids }),
  setTool: (t, placeType = null) => set({ tool: t, placeType, placeRot: 0, placeMirror: false }),
  logMsg: (level, msg) => set({ log: [...get().log.slice(-300), { t: Date.now(), level, msg }] }),
  openWindow: (id) => { if (!get().windows.includes(id)) set({ windows: [...get().windows, id] }); else set({ windows: [...get().windows.filter((w) => w !== id), id] }); },
  closeWindow: (id) => set({ windows: get().windows.filter((w) => w !== id) }),
  nextRef: (prefix) => {
    const used = new Set(get().project.components.map((c) => c.ref));
    let i = 1; while (used.has(prefix + i)) i++;
    return prefix + i;
  },
  addPart: (type, x, y) => {
    const def = LIBMAP[type];
    const c: Component = { id: uid("c"), type, ref: get().nextRef(def.prefix), x, y, rot: get().placeRot, mirror: get().placeMirror, sheet: get().sheet, props: defaultProps(def), showRef: true, showValue: true, enabled: true };
    get().commit(`Place ${c.ref}`, (p) => { p.components.push(c); });
    const recent = [type, ...get().recentParts.filter((t) => t !== type)].slice(0, 12);
    set({ recentParts: recent });
    try { localStorage.setItem("cb-recent", JSON.stringify(recent)); } catch {}
    return c;
  },

  runSim: async (kind = "default") => {
    const st = get();
    if (st.status === "Running" || st.status === "Paused") return;
    const p = st.project;
    const analysis = kind === "default" ? p.sim.analysis : kind;
    simCtl = { paused: false, stopped: false };
    set({ status: "Preparing", progress: 0, bottomTab: "console" });
    get().logMsg("info", `Preparing ${analysis.toUpperCase()} analysis — resolving connectivity and running ERC`);
    await tick();
    const { cn, diags } = recompute(p);
    set({ cn, diags });
    const errs = diags.filter((d) => d.severity === "error");
    if (errs.length) {
      set({ status: "Error", bottomTab: "problems" });
      get().logMsg("error", `Simulation aborted: ${errs.length} ERC error(s). See Problems.`);
      return;
    }
    const t0 = performance.now();
    const finish = (runs: SavedRun[], status?: SimStatus) => {
      const warn = runs.some((r) => r.status.includes("warning"));
      const fin: SimStatus = status ?? (warn ? "Convergence Warning" : "Completed");
      set({ results: runs, liveRun: null, status: fin, progress: 1 });
      get().commit("Store simulation run", (pp) => { pp.runs = [...pp.runs, ...runs.map((r) => decimate(r))].slice(-24); });
      get().logMsg(warn ? "warn" : "info", `${analysis.toUpperCase()} ${fin.toLowerCase()} — ${runs.length} run(s), ${runs.reduce((a, r) => a + r.x.length, 0)} points, ${(performance.now() - t0).toFixed(0)} ms`);
    };
    try {
      set({ status: "Running" });
      if (analysis === "tran") {
        const gen = transient(p, p.sim.tran, { infinite: get().interactive });
        for (;;) {
          while (simCtl.paused && !simCtl.stopped) await new Promise((r) => setTimeout(r, 80));
          if (simCtl.stopped) {
            const live = get().liveRun;
            if (live) { live.status = "stopped"; finish([{ ...live, x: [...live.x], signals: { ...live.signals } }], "Stopped"); } else set({ status: "Stopped" });
            return;
          }
          const r = gen.next();
          if (r.done) { finish([r.value]); return; }
          const pr = r.value as TranProgress;
          set({ liveRun: { ...pr.run, x: pr.run.x, signals: pr.run.signals, id: pr.run.id + "_" + pr.run.x.length }, progress: pr.progress, results: [pr.run] });
          await tick();
        }
      }
      await tick();
      let runs: SavedRun[] = [];
      if (analysis === "op") runs = [operatingPoint(p)];
      else if (analysis === "ac") runs = [runAC(p, p.sim.ac)];
      else if (analysis === "dc") runs = runDC(p, p.sim.dc);
      else if (analysis === "param") runs = runParamSweep(p);
      else if (analysis === "temp") runs = runTempSweep(p);
      else if (analysis === "mc") runs = runMonteCarlo(p, 10, p.sim.param.analysis);
      if (analysis === "op") {
        const r = runs[0];
        get().logMsg("info", "Operating point: " + Object.entries(r.signals).filter(([k]) => k.startsWith("V(")).map(([k, v]) => `${k}=${v[0].toPrecision(4)}`).join("  "));
      }
      finish(runs);
      set({ bottomTab: "results" });
    } catch (e) {
      const msg = (e as Error).message;
      if (e instanceof SimError && e.diags.length) set({ diags: e.diags, bottomTab: "problems" });
      set({ status: "Error" });
      get().logMsg("error", msg);
    }
  },
  pause: () => { if (get().status === "Running") { simCtl.paused = true; set({ status: "Paused" }); get().logMsg("info", "Simulation paused"); } },
  resume: () => { if (get().status === "Paused") { simCtl.paused = false; set({ status: "Running" }); get().logMsg("info", "Simulation resumed"); } },
  stop: () => { simCtl.stopped = true; simCtl.paused = false; },
  clearResults: () => { set({ results: [], liveRun: null, status: "Ready" }); get().commit("Clear results", (p) => { p.runs = []; }); },
}));

export function currentRunSet(s: Pick<State, "results" | "liveRun">): SavedRun[] {
  return s.liveRun ? [s.liveRun] : s.results;
}
