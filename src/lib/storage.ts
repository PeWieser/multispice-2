/**
 * Lokale Persistenz (localStorage + Windows AppData + echtes Datei-Auto-Save)
 * für Projekte und Bibliotheks-Nutzung.
 *
 * W130:
 * 1. Arbeitskopie wird jederzeit automatisch in localStorage UND unter Windows
 *    in %APPDATA%/MultiSpice/workspace-state.json gesichert.
 * 2. Beim ersten „Datei speichern“ (Strg+S) wählt der Nutzer eine Datei
 *    (.msx.json). Sobald diese Datei einmal gewählt (oder geöffnet) wurde,
 *    speichert MultiSpice bei jeder Änderung automatisch direkt in diese Datei!
 */

import { SchematicDoc, Junction, pointOnSegment } from "./schematic/model";

const PROJECT_KEY = "multispice.project.v1";
const PROJECT_PREV_KEY = "multispice.project.prev.v1";
const LIBRARY_KEY = "multispice.library.v1";

export interface StoredProject {
  name: string;
  doc: SchematicDoc;
  savedAt: string;
  /** Gerätefenster + Configs: ein Projekt ist Schaltung ODER Messplatz. */
  instruments?: unknown[];
  /** Unter Windows ggf. zuletzt gebundener Dateipfad für nahtloses Auto-Save. */
  filePath?: string | null;
  /** S5.11: true, wenn diese Kopie aus der Vorgängergeneration stammt. */
  fromBackup?: boolean;
}

export interface StoredLibrary {
  favorites: string[];
  recent: string[];
}

interface BrowserWritableFileStream {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

export interface BrowserFileHandle {
  name?: string;
  createWritable: () => Promise<BrowserWritableFileStream>;
  getFile?: () => Promise<File>;
}

let activeDesktopFilePath: string | null = null;
let activeBrowserFileHandle: BrowserFileHandle | null = null;

export function getActiveSaveTargetLabel(): string | null {
  if (activeDesktopFilePath) {
    const parts = activeDesktopFilePath.split(/[\\/]/);
    return parts[parts.length - 1] || activeDesktopFilePath;
  }
  if (activeBrowserFileHandle?.name) {
    return activeBrowserFileHandle.name;
  }
  return null;
}

export function getActiveDesktopFilePath(): string | null {
  return activeDesktopFilePath;
}

export function setActiveDesktopFilePath(filePath: string | null): void {
  activeDesktopFilePath = filePath;
  if (typeof window !== "undefined" && window.multispiceDesktop?.saveAppData) {
    window.multispiceDesktop.saveAppData("activeFilePath", filePath);
  }
}

export function setActiveBrowserFileHandle(handle: BrowserFileHandle | null): void {
  activeBrowserFileHandle = handle;
}

export function clearActiveSaveTarget(): void {
  activeDesktopFilePath = null;
  activeBrowserFileHandle = null;
  if (typeof window !== "undefined" && window.multispiceDesktop?.saveAppData) {
    window.multispiceDesktop.saveAppData("activeFilePath", null);
  }
}

export function hasActiveSaveTarget(): boolean {
  return Boolean(activeDesktopFilePath || activeBrowserFileHandle);
}

function safeFileName(name: string): string {
  return (name || "schaltplan").trim().replace(/\s+/g, "_").replace(/[^\wäöüÄÖÜß.-]+/g, "-") || "schaltplan";
}

export function buildProjectEnvelopeJson(doc: SchematicDoc, instruments?: unknown[]): string {
  const envelope = {
    format: "multispice-project",
    version: 2,
    name: doc.name,
    savedAt: new Date().toISOString(),
    doc,
    instruments: instruments ?? [],
  };
  return JSON.stringify(envelope, null, 2);
}

/**
 * W130: Speichert das Projekt in eine echte Datei (Windows-Speicherdialog bzw.
 * Browser File System Access API / Download).
 * - Beim ersten Speichern (`saveAs: false` ohne bisherige Datei) wird der Dialog geöffnet.
 * - Ist bereits eine Datei gebunden (`activeDesktopFilePath` oder `activeBrowserFileHandle`),
 *   wird bei `saveAs: false` direkt und ohne erneute Nachfrage in diese Datei geschrieben.
 */
export async function saveProjectToFile(
  doc: SchematicDoc,
  instruments?: unknown[],
  opts: { saveAs?: boolean } = {},
): Promise<{ ok: boolean; canceled?: boolean; targetName?: string; error?: string; viaDownload?: boolean }> {
  const json = buildProjectEnvelopeJson(doc, instruments);
  const suggestedName = `${safeFileName(doc.name)}.msx.json`;

  // 1. Windows Desktop App (Electron IPC)
  if (typeof window !== "undefined" && window.multispiceDesktop?.saveFile) {
    const usePath = opts.saveAs ? null : activeDesktopFilePath;
    const res = await window.multispiceDesktop.saveFile({
      filePath: usePath,
      defaultName: suggestedName,
      content: json,
      title: opts.saveAs ? "Projekt speichern unter …" : "Projekt speichern",
      filters: [
        { name: "MultiSpice-Projekt (*.msx.json)", extensions: ["msx.json", "json"] },
        { name: "Alle Dateien (*.*)", extensions: ["*"] },
      ],
    });
    if (res.canceled) return { ok: false, canceled: true };
    if (res.ok && res.filePath) {
      setActiveDesktopFilePath(res.filePath);
      const parts = res.filePath.split(/[\\/]/);
      return { ok: true, targetName: parts[parts.length - 1] || res.filePath };
    }
    return { ok: false, error: res.error || "Dateischreibfehler" };
  }

  // 2. Browser mit File System Access API (Chrome / Edge / Opera)
  const winAny = typeof window !== "undefined" ? (window as unknown as Record<string, unknown>) : null;
  if (winAny && typeof winAny.showSaveFilePicker === "function") {
    try {
      let handle = opts.saveAs ? null : activeBrowserFileHandle;
      if (!handle) {
        const showPicker = winAny.showSaveFilePicker as (options: unknown) => Promise<BrowserFileHandle>;
        handle = await showPicker({
          suggestedName,
          types: [
            {
              description: "MultiSpice-Projekt (.msx.json)",
              accept: { "application/json": [".msx.json", ".json"] },
            },
          ],
        });
      }
      if (handle) {
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        activeBrowserFileHandle = handle;
        return { ok: true, targetName: handle.name || suggestedName };
      }
    } catch (err) {
      const e = err as { name?: string; message?: string };
      if (e?.name === "AbortError") {
        return { ok: false, canceled: true };
      }
      // Falls File System Access fehlschlägt (z. B. Iframe-Restriktion), auf Download zurückfallen
    }
  }

  // 3. Browser-Fallback: Direkter Datei-Download (.msx.json)
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    try {
      const blob = new Blob([json], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggestedName;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      // S5.11: Download bindet nicht — Aufrufer werten viaDownload ehrlich aus.
      return { ok: true, targetName: suggestedName, viaDownload: true };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  }

  return { ok: false, error: "Keine Speicher-Umgebung verfügbar" };
}

/**
 * W130: Wird von `scheduleAutosave()` aufgerufen. Sobald der Nutzer eine Datei
 * das erste Mal gespeichert (oder geöffnet) hat, wird jede Änderung automatisch
 * im Hintergrund direkt in diese Datei geschrieben.
 */
export async function autoSaveToBoundFile(doc: SchematicDoc, instruments?: unknown[]): Promise<boolean> {
  if (!hasActiveSaveTarget()) return false;
  const json = buildProjectEnvelopeJson(doc, instruments);

  if (typeof window !== "undefined" && window.multispiceDesktop?.saveFile && activeDesktopFilePath) {
    try {
      const res = await window.multispiceDesktop.saveFile({
        filePath: activeDesktopFilePath,
        content: json,
      });
      return Boolean(res.ok);
    } catch {
      return false;
    }
  }

  if (activeBrowserFileHandle) {
    try {
      const writable = await activeBrowserFileHandle.createWritable();
      await writable.write(json);
      await writable.close();
      return true;
    } catch {
      return false;
    }
  }

  return false;
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
 */
function migrateDoc(doc: SchematicDoc): SchematicDoc {
  if (!Array.isArray((doc as any).probes)) (doc as any).probes = [];
  if (!Array.isArray(doc.junctions)) {
    const existing: Junction[] = [];
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

/** S5.11: Minimaler Storage-Zugriff — window.localStorage oder Test-Fake. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * S5.11: Rohwert (JSON-Text oder AppData-Objekt) → geprüftes, migriertes
 * Projekt. null bei Korruption/Fremdformat — nie werfen.
 */
export function parseStoredProject(value: unknown): StoredProject | null {
  try {
    const parsed = (typeof value === "string" ? JSON.parse(value) : value) as StoredProject;
    if (!parsed || typeof parsed !== "object" || typeof parsed.name !== "string" || !isDoc(parsed.doc)) {
      return null;
    }
    parsed.doc = migrateDoc(parsed.doc);
    return parsed;
  } catch {
    return null;
  }
}

/**
 * S5.11: Aktuelle Kopie oder — wenn sie korrupt ist — die Vorgänger­genera­tion.
 * Aus dem Backup stammende Projekte tragen `fromBackup` (UI meldet das).
 */
export function pickStoredProject(current: unknown, prev: unknown): StoredProject | null {
  const cur = parseStoredProject(current);
  if (cur) return cur;
  const prv = parseStoredProject(prev);
  if (!prv) return null;
  return { ...prv, fromBackup: true };
}

/** S5.11: Aktuelle Kopie → Vorgänger (Best-Effort, nie werfen). */
export function rotateProjectBackup(store: KeyValueStore): void {
  try {
    const cur = store.getItem(PROJECT_KEY);
    if (cur) store.setItem(PROJECT_PREV_KEY, cur);
  } catch {
    /* Speicher klemmt — Hauptkopie bleibt trotzdem schreibbar */
  }
}

/** Speichert das aktuelle Projekt in localStorage UND unter Windows in AppData. */
export function saveProjectLocal(doc: SchematicDoc, instruments?: unknown[]): { ok: boolean; bytes: number } {
  if (!canStore()) return { ok: false, bytes: 0 };
  const stored: StoredProject = {
    name: doc.name,
    doc,
    savedAt: new Date().toISOString(),
    instruments: instruments ?? [],
    filePath: activeDesktopFilePath,
  };
  try {
    const raw = JSON.stringify(stored);
    // S5.11: Erst rotieren, dann schreiben (Crash dazwischen → Vorgänger intakt).
    rotateProjectBackup(window.localStorage);
    window.localStorage.setItem(PROJECT_KEY, raw);
    if (window.multispiceDesktop?.saveAppData) {
      try {
        const old = window.multispiceDesktop.loadAppDataSync?.(PROJECT_KEY) as StoredProject | null;
        if (old && typeof old === "object") window.multispiceDesktop.saveAppData(PROJECT_PREV_KEY, old);
      } catch {}
      window.multispiceDesktop.saveAppData(PROJECT_KEY, stored);
    }
    return { ok: true, bytes: raw.length };
  } catch {
    if (typeof window !== "undefined" && window.multispiceDesktop?.saveAppData) {
      try {
        window.multispiceDesktop.saveAppData(PROJECT_KEY, stored);
        return { ok: true, bytes: 1024 };
      } catch {}
    }
    return { ok: false, bytes: 0 };
  }
}

/** Lädt das gespeicherte Projekt aus localStorage oder (unter Windows) aus AppData. */
export function loadProjectLocal(): StoredProject | null {
  if (!canStore()) return null;
  try {
    let picked: StoredProject | null = null;
    const raw = window.localStorage.getItem(PROJECT_KEY);
    if (raw) {
      let prevRaw: string | null = null;
      try {
        prevRaw = window.localStorage.getItem(PROJECT_PREV_KEY);
      } catch {}
      picked = pickStoredProject(raw, prevRaw);
    }
    // S5.11: Kein else-if mehr — AppData gilt auch, wenn localStorage korrupt
    // ist (bisher: still null = Totalverlust trotz intakter AppData-Kopie).
    if (!picked && window.multispiceDesktop?.loadAppDataSync) {
      try {
        picked = pickStoredProject(
          window.multispiceDesktop.loadAppDataSync(PROJECT_KEY),
          window.multispiceDesktop.loadAppDataSync(PROJECT_PREV_KEY),
        );
      } catch {}
    }
    if (!picked) return null;
    const parsed = picked;
    if (parsed.filePath && typeof parsed.filePath === "string") {
      activeDesktopFilePath = parsed.filePath;
    } else if (window.multispiceDesktop?.loadAppDataSync) {
      // WDA-4: "activeFilePath" wurde bisher nur geschrieben, nie gelesen —
      // Datei-Bindung geht sonst nach Neustart verloren, sobald der Blob
      // keinen Pfad trägt (z. B. altes Format ohne filePath).
      try {
        const bound = window.multispiceDesktop.loadAppDataSync("activeFilePath") as string | null;
        if (bound && typeof bound === "string") activeDesktopFilePath = bound;
      } catch {}
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Speichert Favoriten + Zuletzt-verwendet der Bauteilbibliothek. */
export function saveLibraryLocal(favorites: string[], recent: string[]): void {
  if (!canStore()) return;
  const data: StoredLibrary = { favorites, recent };
  try {
    window.localStorage.setItem(LIBRARY_KEY, JSON.stringify(data));
  } catch {}
  if (window.multispiceDesktop?.saveAppData) {
    try {
      window.multispiceDesktop.saveAppData(LIBRARY_KEY, data);
    } catch {}
  }
}

/** Lädt Favoriten + Zuletzt-verwendet. */
export function loadLibraryLocal(): StoredLibrary | null {
  if (!canStore()) return null;
  try {
    let parsed: StoredLibrary | null = null;
    const raw = window.localStorage.getItem(LIBRARY_KEY);
    if (raw) {
      parsed = JSON.parse(raw) as StoredLibrary;
    } else if (window.multispiceDesktop?.loadAppDataSync) {
      parsed = window.multispiceDesktop.loadAppDataSync(LIBRARY_KEY) as StoredLibrary | null;
    }
    if (!isStringArray(parsed?.favorites) || !isStringArray(parsed?.recent)) return null;
    return { favorites: parsed.favorites, recent: parsed.recent };
  } catch {
    return null;
  }
}

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
    let parsed: ProjectSlot[] | null = null;
    const raw = window.localStorage.getItem(PROJECTS_KEY);
    if (raw) {
      parsed = JSON.parse(raw) as ProjectSlot[];
    } else if (window.multispiceDesktop?.loadAppDataSync) {
      parsed = window.multispiceDesktop.loadAppDataSync(PROJECTS_KEY) as ProjectSlot[] | null;
    }
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
    if (window.multispiceDesktop?.saveAppData) {
      window.multispiceDesktop.saveAppData(PROJECTS_KEY, slots);
    }
    return true;
  } catch {
    return false;
  }
}

export function listProjectSlots(): ProjectSlot[] {
  return readSlots().sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
}

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
