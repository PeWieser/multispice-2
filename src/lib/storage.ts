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
    Array.isArray(doc.notes)
  );
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
