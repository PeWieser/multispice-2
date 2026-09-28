"use client";
// Storage adapter: the schematic editor, engine, instruments and grapher are pure client code.
// Only project persistence needs a backend. Two interchangeable backends:
//   remote — the Next.js REST routes + PostgreSQL (used in the full-stack deployment)
//   local  — browser localStorage, used for static hosting (e.g. Cloudflare Pages) or file:// use
// The mode is chosen at build time via NEXT_PUBLIC_STORAGE_MODE=local and verified at runtime by
// probing /api/projects (a static host answers 404/HTML, not JSON).
import { migrateProject, type Project } from "./types";

export type StorageMode = "local" | "remote";
export interface ProjectMeta { id: number; name: string; updatedAt: string }
export interface VersionMeta { id: number; note: string; createdAt: string }
export interface VersionEntry extends VersionMeta { data: Project }

const K_PROJECTS = "cb-local-projects";
const K_VER = (id: number) => `cb-local-versions-${id}`;
const MAX_VERSIONS = 20;

interface LocalRecord { name: string; updatedAt: string; data: Project }
type LocalDB = Record<string, LocalRecord>;

const buildMode: StorageMode = process.env.NEXT_PUBLIC_STORAGE_MODE === "local" ? "local" : "remote";
let probed: "unknown" | "remote" | "local" = "unknown";
export let mode: StorageMode = buildMode;

function store(): Storage {
  const s = typeof globalThis !== "undefined" ? globalThis.localStorage : undefined;
  if (!s) throw new Error("Browser storage is not available in this context.");
  return s;
}
function readDB(): LocalDB {
  try { return JSON.parse(store().getItem(K_PROJECTS) || "{}") as LocalDB; } catch { return {}; }
}
function writeDB(db: LocalDB) {
  try { store().setItem(K_PROJECTS, JSON.stringify(db)); }
  catch { throw new Error("Browser storage is full. Delete old projects or use File ▸ Export Project File (.json)."); }
}
const j = async (r: Response) => { if (!r.ok) throw new Error(`${r.status} ${r.statusText}`); return r.json(); };

/** Detect (once) whether a project API exists; falls back to browser storage. */
export async function detectMode(): Promise<StorageMode> {
  if (buildMode === "local") { mode = "local"; return "local"; }
  if (probed !== "unknown") { mode = probed; return probed; }
  if (typeof window === "undefined") { mode = "remote"; return "remote"; }
  try {
    const r = await fetch("/api/projects", { headers: { accept: "application/json" } });
    probed = r.ok && (r.headers.get("content-type") || "").includes("json") ? "remote" : "local";
  } catch { probed = "local"; }
  mode = probed;
  return probed;
}

export async function listProjects(): Promise<ProjectMeta[]> {
  if ((await detectMode()) === "local") {
    const db = readDB();
    return Object.entries(db)
      .map(([id, r]) => ({ id: Number(id), name: r.name, updatedAt: r.updatedAt }))
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }
  return fetch("/api/projects", { headers: { accept: "application/json" } }).then(j);
}

export async function createProject(name: string, data: Project): Promise<number> {
  if ((await detectMode()) === "local") {
    const db = readDB();
    const id = Date.now();
    db[id] = { name, updatedAt: new Date().toISOString(), data };
    writeDB(db);
    return id;
  }
  const row = await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, data }) }).then(j);
  return row.id as number;
}

export async function updateProject(id: number, name: string, data: Project): Promise<void> {
  if ((await detectMode()) === "local") {
    const db = readDB();
    const prev = db[id];
    if (!prev) throw new Error(`Project #${id} not found in browser storage.`);
    const vers = readVersions(id);
    vers.unshift({ id: Date.now(), note: "save", createdAt: new Date().toISOString(), data: prev.data });
    store().setItem(K_VER(id), JSON.stringify(vers.slice(0, MAX_VERSIONS)));
    db[id] = { name, updatedAt: new Date().toISOString(), data };
    writeDB(db);
    return;
  }
  await fetch(`/api/projects/${id}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, data }) }).then(j);
}

export async function getProject(id: number): Promise<{ name: string; data: Project; versions: VersionMeta[] } | null> {
  if ((await detectMode()) === "local") {
    const rec = readDB()[id];
    if (!rec) return null;
    return { name: rec.name, data: migrateProject(rec.data), versions: readVersions(id).map(({ id: vid, note, createdAt }) => ({ id: vid, note, createdAt })) };
  }
  const row = await fetch(`/api/projects/${id}`, { headers: { accept: "application/json" } }).then(j);
  return { name: row.name, data: row.data, versions: row.versions ?? [] };
}

export async function deleteProject(id: number): Promise<void> {
  if ((await detectMode()) === "local") {
    const db = readDB();
    delete db[id];
    writeDB(db);
    store().removeItem(K_VER(id));
    return;
  }
  await fetch(`/api/projects/${id}`, { method: "DELETE" }).then(j);
}

function readVersions(id: number): VersionEntry[] {
  try { return JSON.parse(store().getItem(K_VER(id)) || "[]") as VersionEntry[]; } catch { return []; }
}

export async function getVersion(projectId: number, versionId: number): Promise<Project | null> {
  if ((await detectMode()) === "local") return readVersions(projectId).find((v) => v.id === versionId)?.data ?? null;
  const row = await fetch(`/api/versions/${versionId}`, { headers: { accept: "application/json" } }).then(j);
  return (row?.data as Project) ?? null;
}

/** Approximate storage usage of the local backend (bytes), for the UI. */
export function localUsage(): { used: number; quota: number } | null {
  if (typeof window === "undefined") return null;
  try {
    const used = new Blob([store().getItem(K_PROJECTS) || ""]).size;
    return { used, quota: 5 * 1024 * 1024 }; // typical localStorage quota hint
  } catch { return null; }
}
