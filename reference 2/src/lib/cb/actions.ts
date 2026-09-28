"use client";
import { useCB } from "./store";
import { emptyProject, migrateProject, uid, type Project, type Component, type Wire, type Label, type TextItem, type Probe } from "./types";
import { compBBox, worldPins } from "./connectivity";
import { exportNetlist, importNetlist } from "./netlist";
import { download } from "@/components/cb/Plot";
import * as store from "./storage";

const G = () => useCB.getState();

export function pushRecent(id: number, name: string) {
  try {
    const r = JSON.parse(localStorage.getItem("cb-recent-projects") || "[]") as { id: number; name: string }[];
    localStorage.setItem("cb-recent-projects", JSON.stringify([{ id, name }, ...r.filter((x) => x.id !== id)].slice(0, 8)));
  } catch {}
}
export function recentProjects(): { id: number; name: string }[] {
  try { return JSON.parse(localStorage.getItem("cb-recent-projects") || "[]"); } catch { return []; }
}

export function newProject() {
  if (G().dirty && !window.confirm("Discard unsaved changes?")) return;
  G().loadProject(emptyProject("Untitled"));
  G().logMsg("info", "New project created");
}

export async function saveProject(mode: "save" | "as" | "copy" = "save") {
  const s = G();
  let name = s.project.meta.name;
  if (mode !== "save" || !s.projectId) {
    const n = window.prompt(mode === "copy" ? "Save copy as" : "Project name", mode === "copy" ? name + " (copy)" : name);
    if (!n) return;
    name = n;
    if (mode === "as") s.set({ projectId: null });
  }
  const data: Project = { ...s.project, meta: { ...s.project.meta, name: mode === "copy" ? s.project.meta.name : name, modified: Date.now() } };
  try {
    if (mode === "save" && s.projectId) {
      await store.updateProject(s.projectId, name, data);
      s.set({ dirty: false, project: data });
      pushRecent(s.projectId, name);
    } else {
      const newId = await store.createProject(name, mode === "copy" ? { ...data, meta: { ...data.meta, name } } : data);
      if (mode !== "copy") s.set({ projectId: newId, dirty: false, project: data });
      pushRecent(newId, name);
    }
    localStorage.removeItem("cb-autosave");
    G().logMsg("info", `Project "${name}" saved${mode === "copy" ? " as copy" : ""} (${store.mode === "local" ? "browser storage" : "database"})`);
  } catch (e) { G().logMsg("error", "Save failed: " + (e as Error).message); }
}

export async function openProject(id: number) {
  const row = await store.getProject(id);
  if (!row) { G().logMsg("error", `Could not open project #${id}`); return; }
  G().loadProject(migrateProject(row.data), id);
  pushRecent(id, row.name);
  G().logMsg("info", `Opened "${row.name}"`);
}

export function exportJSON() { const p = G().project; download(`${p.meta.name}.cbproj.json`, JSON.stringify(p, null, 1), "application/json"); }
export function importJSONFile(file: File) { file.text().then((t) => { try { G().loadProject(migrateProject(JSON.parse(t))); G().logMsg("info", `Imported ${file.name}`); } catch (e) { G().logMsg("error", "Invalid project file: " + (e as Error).message); } }); }
export function importNetlistFile(file: File) { file.text().then((t) => { G().loadProject(importNetlist(t, file.name.replace(/\.\w+$/, ""))); G().logMsg("info", `Imported SPICE netlist ${file.name}`); }); }
export function exportNetlistFile() { const p = G().project; download(`${p.meta.name}.cir`, exportNetlist(p)); }

// ---- editing ----
export function rotateSel(dir = 1) {
  const s = G();
  if (s.tool === "place") { s.set({ placeRot: ((s.placeRot + dir + 4) % 4) as 0 }); return; }
  const ids = new Set(s.selection); if (!ids.size) return;
  const comps = s.project.components.filter((c) => ids.has(c.id));
  if (!comps.length) return;
  // rotate each part around its own origin; attached wires keep endpoints (user re-routes)
  s.commit("Rotate", (p) => { for (const c of p.components) if (ids.has(c.id)) c.rot = ((c.rot + dir + 4) % 4) as 0; });
}
export function mirrorSel() {
  const s = G();
  if (s.tool === "place") { s.set({ placeMirror: !s.placeMirror }); return; }
  const ids = new Set(s.selection); if (!ids.size) return;
  s.commit("Mirror", (p) => { for (const c of p.components) if (ids.has(c.id)) c.mirror = !c.mirror; });
}
export function deleteSel() {
  const s = G(); const ids = new Set(s.selection); if (!ids.size) return;
  s.commit(`Delete ${ids.size} object(s)`, (p) => {
    p.components = p.components.filter((c) => !ids.has(c.id));
    p.wires = p.wires.filter((c) => !ids.has(c.id));
    p.labels = p.labels.filter((c) => !ids.has(c.id));
    p.texts = p.texts.filter((c) => !ids.has(c.id));
    p.probes = p.probes.filter((c) => !ids.has(c.id) && !(c.compId && ids.has(c.compId)));
  });
  s.set({ selection: [], windows: s.windows.filter((w) => !ids.has(w)) });
}
interface Clip { components: Component[]; wires: Wire[]; labels: Label[]; texts: TextItem[]; probes: Probe[] }
export function copySel(cut = false) {
  const s = G(); const ids = new Set(s.selection); if (!ids.size) return;
  const p = s.project;
  const clip: Clip = { components: p.components.filter((c) => ids.has(c.id)), wires: p.wires.filter((c) => ids.has(c.id)), labels: p.labels.filter((c) => ids.has(c.id)), texts: p.texts.filter((c) => ids.has(c.id)), probes: p.probes.filter((c) => ids.has(c.id) || (c.compId && ids.has(c.compId))) };
  const txt = JSON.stringify({ circuitbench: 1, ...clip });
  s.set({ clipboard: txt });
  try { navigator.clipboard?.writeText(txt); } catch {}
  if (cut) deleteSel();
}
export function paste(offset = 20) {
  const s = G(); if (!s.clipboard) return;
  const clip = JSON.parse(s.clipboard) as Clip;
  const idMap = new Map<string, string>();
  const newIds: string[] = [];
  const used = new Set(s.project.components.map((c) => c.ref));
  s.commit("Paste", (p) => {
    for (const c of clip.components) {
      const id = uid("c"); idMap.set(c.id, id); newIds.push(id);
      let ref = c.ref;
      if (!ref.startsWith("#")) { const m = ref.match(/^([A-Za-z_#]+)/); const pre = m ? m[1] : "X"; let i = 1; while (used.has(pre + i)) i++; ref = pre + i; used.add(ref); }
      p.components.push({ ...c, id, ref, x: c.x + offset, y: c.y + offset, sheet: s.sheet });
    }
    for (const w of clip.wires) { const id = uid("w"); newIds.push(id); p.wires.push({ ...w, id, a: [w.a[0] + offset, w.a[1] + offset], b: [w.b[0] + offset, w.b[1] + offset], sheet: s.sheet }); }
    for (const l of clip.labels) { const id = uid("l"); newIds.push(id); p.labels.push({ ...l, id, x: l.x + offset, y: l.y + offset, sheet: s.sheet }); }
    for (const t of clip.texts) { const id = uid("t"); newIds.push(id); p.texts.push({ ...t, id, x: t.x + offset, y: t.y + offset, sheet: s.sheet }); }
    for (const q of clip.probes) { const id = uid("p"); newIds.push(id); p.probes.push({ ...q, id, name: q.name + "_1", compId: q.compId ? idMap.get(q.compId) : undefined, x: q.x + offset, y: q.y + offset, x2: q.x2 != null ? q.x2 + offset : undefined, y2: q.y2 != null ? q.y2 + offset : undefined, sheet: s.sheet }); }
  });
  s.set({ selection: newIds });
}
export function duplicateSel() { copySel(); paste(20); }
export function selectAll() {
  const s = G(); const sh = s.sheet; const p = s.project;
  s.set({ selection: [...p.components, ...p.wires, ...p.labels, ...p.texts, ...p.probes].filter((o) => o.sheet === sh).map((o) => o.id) });
}

// ---- view ----
function bboxOf(ids?: Set<string>) {
  const s = G(); const p = s.project;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (a: number, b: number, c: number, d: number) => { x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d); };
  for (const c of p.components) if (c.sheet === s.sheet && (!ids || ids.has(c.id))) add(...compBBox(c));
  for (const w of p.wires) if (w.sheet === s.sheet && (!ids || ids.has(w.id))) add(Math.min(w.a[0], w.b[0]), Math.min(w.a[1], w.b[1]), Math.max(w.a[0], w.b[0]), Math.max(w.a[1], w.b[1]));
  for (const l of p.labels) if (l.sheet === s.sheet && (!ids || ids.has(l.id))) add(l.x, l.y - 10, l.x + 40, l.y);
  return isFinite(x0) ? [x0, y0, x1, y1] : null;
}
export function zoomTo(ids?: Set<string>) {
  const b = bboxOf(ids); const svg = document.querySelector('[data-testid="schematic"]') as SVGSVGElement | null;
  if (!b || !svg) return;
  const w = svg.clientWidth, h = svg.clientHeight;
  const z = Math.min(12, Math.max(0.3, Math.min(w / (b[2] - b[0] + 60), h / (b[3] - b[1] + 60))));
  G().set({ zoom: z, panX: w / 2 - ((b[0] + b[2]) / 2) * z, panY: h / 2 - ((b[1] + b[3]) / 2) * z });
}
export function zoomBy(f: number) {
  const s = G(); const svg = document.querySelector('[data-testid="schematic"]') as SVGSVGElement | null;
  const w = svg?.clientWidth ?? 800, h = svg?.clientHeight ?? 600;
  const nz = Math.min(20, Math.max(0.2, s.zoom * f));
  s.set({ zoom: nz, panX: w / 2 - ((w / 2 - s.panX) / s.zoom) * nz, panY: h / 2 - ((h / 2 - s.panY) / s.zoom) * nz });
}

// ---- reports ----
export function bom() {
  const p = G().project;
  const groups = new Map<string, { refs: string[]; type: string; value: string; footprint: string; mfr: string; pn: string }>();
  for (const c of p.components) {
    if (c.ref.startsWith("#") || c.type === "GND") continue;
    const key = `${c.type}|${c.props.value ?? c.props.dc ?? c.props.modelName ?? ""}|${c.props.footprint ?? ""}`;
    const g = groups.get(key) ?? { refs: [], type: c.type, value: c.props.value ?? c.props.dc ?? c.props.modelName ?? "", footprint: c.props.footprint ?? "", mfr: c.props.manufacturer ?? "", pn: c.props.partNumber ?? "" };
    g.refs.push(c.ref); groups.set(key, g);
  }
  return [...groups.values()];
}
export function pinCount(c: Component) { return worldPins(c).length; }
