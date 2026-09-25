/**
 * Lokale Persistenz (localStorage) für Projekte und Bibliotheks-Nutzung.
 *
 * Die App ist ein statischer Export ohne Server — alles, was früher in
 * Postgres lag, liegt jetzt versioniert im Browser des Nutzers. Jede Funktion
 * ist SSR-sicher (`typeof window`-Guard) und Quota-sicher (try/catch):
 * Scheitert das Schreiben, meldet der Aufrufer ehrlich einen Fehler statt
 * still Daten zu verlieren.
 */

import { SchematicDoc } from "./schematic/model";

const PROJECT_KEY = "multispice.project.v1";
const LIBRARY_KEY = "multispice.library.v1";

export interface StoredProject {
  name: string;
  doc: SchematicDoc;
  savedAt: string;
}

export interface StoredLibrary {
  favorites: string[];
  recent: string[];
}

function canStore(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function isDoc(value: unknown): value is SchematicDoc {
  if (typeof value !== "object" || value === null) return false;
  const doc = value as Record<string, unknown>;
  return (
    typeof doc.name === "string" &&
    Array.isArray(doc.instances) &&
    Array.isArray(doc.wires) &&
    Array.isArray(doc.labels) &&
    Array.isArray(doc.notes) &&
    (doc.probes === undefined || Array.isArray(doc.probes))
  );
}

function migrateDoc(doc: SchematicDoc): SchematicDoc {
  if (!Array.isArray((doc as any).probes)) (doc as any).probes = [];
  // Migrate each probe to new professional format
  for (const pr of (doc as any).probes as any[]) {
    if (pr.direction === undefined) pr.direction = 0;
    if (pr.rotation === undefined) pr.rotation = 0;
    if (pr.periodic === undefined) pr.periodic = false;
    if (pr.show === undefined) pr.show = { vdc: true };
    if (pr.thresholds === undefined) pr.thresholds = { low: 0.8, high: 2.0 };
  }
  return doc;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

/** Speichert das aktuelle Projekt. Gibt `false` zurück, wenn der Browser es ablehnt (z. B. Quota, Privatmodus). */
export function saveProjectLocal(doc: SchematicDoc): { ok: boolean; bytes: number } {
  if (!canStore()) return { ok: false, bytes: 0 };
  const stored: StoredProject = {
    name: doc.name,
    doc,
    savedAt: new Date().toISOString(),
  };
  try {
    const raw = JSON.stringify(stored);
    window.localStorage.setItem(PROJECT_KEY, raw);
    return { ok: true, bytes: raw.length };
  } catch {
    return { ok: false, bytes: 0 };
  }
}

/** Lädt das gespeicherte Projekt oder `null` (nichts da, defekt oder kein Browser). */
export function loadProjectLocal(): StoredProject | null {
  if (!canStore()) return null;
  try {
    const raw = window.localStorage.getItem(PROJECT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredProject;
    if (typeof parsed?.name !== "string" || !isDoc(parsed?.doc)) return null;
    parsed.doc = migrateDoc(parsed.doc);
    return parsed;
  } catch {
    return null;
  }
}

/** Speichert Favoriten + Zuletzt-verwendet der Bauteilbibliothek (best effort, still). */
export function saveLibraryLocal(favorites: string[], recent: string[]): void {
  if (!canStore()) return;
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify({ favorites, recent } satisfies StoredLibrary));
  } catch {
    // Bibliotheks-Nutzung ist Komfort, kein Nutzerergebnis — still ignorieren.
  }
}

/** Lädt Favoriten + Zuletzt-verwendet oder `null` (nichts da, defekt oder kein Browser). */
export function loadLibraryLocal(): StoredLibrary | null {
  if (!canStore()) return null;
  try {
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLibrary;
    if (!isStringArray(parsed?.favorites) || !isStringArray(parsed?.recent)) return null;
    return { favorites: parsed.favorites, recent: parsed.recent };
  } catch {
    return null;
  }
}

/* Für Import-Pfade (Datei-Dialog): dieselbe Ehrlichkeit wie beim Laden —
   erst prüfen und normalisieren, dann in den Editor lassen. */
export { isDoc as isValidProjectDoc, migrateDoc as normalizeProjectDoc };

/* ------------------------------------------------------------------ */
/* Projekt-Slots: benannte Snapshots neben der Auto-Save-Arbeitskopie  */
/* ------------------------------------------------------------------ */

const PROJECTS_KEY = "multispice.projects.v1";

export interface ProjectSlot extends StoredProject {
  id: string;
}

function readSlots(): ProjectSlot[] {
  if (!canStore()) return [];
  try {
    const raw = window.localStorage.getItem(PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ProjectSlot[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => s && typeof s.id === "string" && isDoc(s.doc));
  } catch {
    return [];
  }
}

function writeSlots(slots: ProjectSlot[]): boolean {
  if (!canStore()) return false;
  try {
    window.localStorage.setItem(PROJECTS_KEY, JSON.stringify(slots));
    return true;
  } catch {
    return false;
  }
}

/** Alle gespeicherten Projekte, neueste zuerst. */
export function listProjectSlots(): ProjectSlot[] {
  return readSlots().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

/** Aktuellen Stand als benanntes Projekt speichern (id = überschreiben). */
export function saveProjectSlot(name: string, doc: SchematicDoc, id?: string): { ok: boolean; id: string } {
  const slots = readSlots();
  const slotId = id ?? "p_" + Math.random().toString(36).slice(2, 9);
  const slot: ProjectSlot = { id: slotId, name, doc: JSON.parse(JSON.stringify(doc)) as SchematicDoc, savedAt: new Date().toISOString() };
  const i = slots.findIndex((s) => s.id === slotId);
  if (i >= 0) slots[i] = slot;
  else slots.push(slot);
  return { ok: writeSlots(slots), id: slotId };
}

export function deleteProjectSlot(id: string): void {
  writeSlots(readSlots().filter((s) => s.id !== id));
}

export function renameProjectSlot(id: string, name: string): void {
  const slots = readSlots();
  const s = slots.find((x) => x.id === id);
  if (s) {
    s.name = name;
    writeSlots(slots);
  }
}
