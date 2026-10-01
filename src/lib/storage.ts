/**
 * Lokale Persistenz (localStorage) für Projekte und Bibliotheks-Nutzung.
 *
 * Die App ist ein statischer Export ohne Server — alles, was früher in
 * Postgres lag, liegt jetzt versioniert im Browser des Nutzers. Jede Funktion
 * ist SSR-sicher (`typeof window`-Guard) und Quota-sicher (try/catch):
 * Scheitert das Schreiben, meldet der Aufrufer ehrlich einen Fehler statt
 * still Daten zu verlieren.
 */

import { SchematicDoc, Junction, pointOnSegment } from "./schematic/model";

const PROJECT_KEY = "multispice.project.v1";
const LIBRARY_KEY = "multispice.library.v1";

export interface StoredProject {
  name: string;
  doc: SchematicDoc;
  savedAt: string;
  /** Gerätefenster + Configs: ein Projekt ist Schaltung ODER Messplatz. */
  instruments?: unknown[];
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
    (doc.probes === undefined || Array.isArray(doc.probes)) &&
    ((doc as Record<string, unknown>).junctions === undefined ||
      Array.isArray((doc as Record<string, unknown>).junctions))
  );
}

/**
 * Runde 24 (W61): Altbestand übernehmen, ohne Verbindungen zu verlieren.
 *
 * Vorher galt: ein Leitungs-*Stützpunkt* (Knick oder Ende), der auf einer
 * fremden Leitung liegt, war leitend – ohne dass man das im Bild sehen konnte.
 * Dafür wird beim Laden genau an diesen Stellen ein Verbindungspunkt
 * nachgetragen, damit sich gespeicherte Schaltungen nicht ändern: sie sehen
 * jetzt wie in Multisim aus (Punkt an jeder Verbindung). Eine reine Kreuzung
 * mitten auf zwei Leitungen war auch vorher nicht leitend und bekommt deshalb
 * auch keinen Punkt.
 */
function migrateDoc(doc: SchematicDoc): SchematicDoc {
  if (!Array.isArray((doc as any).probes)) (doc as any).probes = [];
  if (!Array.isArray(doc.junctions)) {
    const existing: Junction[] = [];
    // Segmente je Leitung, damit „fremde" Leitung erkannt werden kann.
    const byWire: Array<{ id: string; segs: Array<[number, number, number, number]> }> = [];
    for (const w of doc.wires ?? []) {
      const segs: Array<[number, number, number, number]> = [];
      for (let i = 0; i + 1 < w.points.length; i++) {
        const a = w.points[i];
        const b = w.points[i + 1];
        if (Math.hypot(b.x - a.x, b.y - a.y) > 0.01) segs.push([a.x, a.y, b.x, b.y]);
      }
      byWire.push({ id: w.id, segs });
    }
    for (const w of byWire) {
      for (const p of doc.wires.find((x) => x.id === w.id)?.points ?? []) {
        let foreign = false;
        for (const other of byWire) {
          if (other.id === w.id) continue;
          for (const [ax, ay, bx, by] of other.segs) {
            if (pointOnSegment(p.x, p.y, ax, ay, bx, by)) { foreign = true; break; }
          }
          if (foreign) break;
        }
        if (!foreign) continue;
        if (existing.some((j) => Math.hypot(j.x - p.x, j.y - p.y) < 0.5)) continue;
        existing.push({ id: "jnc_" + Math.random().toString(36).slice(2, 9), x: p.x, y: p.y });
      }
    }
    doc.junctions = existing;
  }
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
export function saveProjectLocal(doc: SchematicDoc, instruments?: unknown[]): { ok: boolean; bytes: number } {
  if (!canStore()) return { ok: false, bytes: 0 };
  const stored: StoredProject = {
    name: doc.name,
    doc,
    savedAt: new Date().toISOString(),
    instruments: instruments ?? [],
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
export function saveProjectSlot(name: string, doc: SchematicDoc, id?: string, instruments?: unknown[]): { ok: boolean; id: string } {
  const slots = readSlots();
  const slotId = id ?? "p_" + Math.random().toString(36).slice(2, 9);
  const slot: ProjectSlot = {
    id: slotId,
    name,
    doc: JSON.parse(JSON.stringify(doc)) as SchematicDoc,
    savedAt: new Date().toISOString(),
    instruments: JSON.parse(JSON.stringify(instruments ?? [])) as unknown[],
  };
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
