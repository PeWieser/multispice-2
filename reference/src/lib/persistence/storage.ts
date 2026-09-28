/**
 * CircuitBench persistence layer.
 *
 * The application is fully self-contained: projects are stored in the
 * browser (IndexedDB, with a localStorage fallback) so a deployment needs
 * **no backend and no database**.
 *
 * A remote adapter is kept behind an interface for installations that want
 * a server-side project store again (see DEPLOY.md, "Optional backend").
 */

export interface ProjectRecord {
  id: string;
  name: string;
  description: string | null;
  data: unknown;
  updatedAt: number;
  createdAt: number;
}

export interface VersionSummary {
  id: string;
  label: string | null;
  createdAt: number;
}

export interface StorageAdapter {
  readonly kind: "local" | "remote";
  list(): Promise<ProjectRecord[]>;
  get(id: string): Promise<ProjectRecord | null>;
  save(rec: { id: string; name: string; description: string; data: unknown }, snapshotLabel: string): Promise<ProjectRecord>;
  remove(id: string): Promise<void>;
  versions(id: string): Promise<VersionSummary[]>;
  restore(projectId: string, versionId: string): Promise<ProjectRecord | null>;
}

/* ------------------------------------------------------------------ */
/*  IndexedDB implementation                                           */
/* ------------------------------------------------------------------ */

const DB_NAME = "circuitbench";
const DB_VERSION = 1;
const S_PROJECTS = "projects";
const S_VERSIONS = "versions";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB is not available in this browser context"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(S_PROJECTS)) {
        const store = db.createObjectStore(S_PROJECTS, { keyPath: "id" });
        store.createIndex("updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains(S_VERSIONS)) {
        const store = db.createObjectStore(S_VERSIONS, { keyPath: "id", autoIncrement: true });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = run(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed"));
        t.oncomplete = () => db.close();
      }),
  );
}

const LS_PREFIX = "circuitbench.project.";
const lsList = (): ProjectRecord[] =>
  Object.keys(localStorage)
    .filter((k) => k.startsWith(LS_PREFIX))
    .map((k) => {
      try {
        return JSON.parse(localStorage.getItem(k) ?? "{}") as ProjectRecord;
      } catch {
        return null;
      }
    })
    .filter((v): v is ProjectRecord => !!v && !!v.id);

/**
 * Local adapter. Uses IndexedDB when the browser offers it and falls back to
 * localStorage so private-mode windows still work.
 */
export const localStore: StorageAdapter = {
  kind: "local",

  async list(): Promise<ProjectRecord[]> {
    try {
      const rows = await tx<ProjectRecord[]>(S_PROJECTS, "readonly", (s) => s.getAll());
      if (rows && rows.length >= 0) return rows.sort((a, b) => b.updatedAt - a.updatedAt);
      return [];
    } catch {
      return lsList().sort((a, b) => b.updatedAt - a.updatedAt);
    }
  },

  async get(id: string): Promise<ProjectRecord | null> {
    try {
      const row = await tx<ProjectRecord | undefined>(S_PROJECTS, "readonly", (s) => s.get(id));
      if (row) return row;
    } catch {
      /* fall through to localStorage */
    }
    const raw = localStorage.getItem(LS_PREFIX + id);
    return raw ? (JSON.parse(raw) as ProjectRecord) : null;
  },

  async save(
    rec: { id: string; name: string; description: string; data: unknown },
    snapshotLabel: string,
  ): Promise<ProjectRecord> {
    const now = Date.now();
    let existing: ProjectRecord | null = null;
    try {
      existing = await tx<ProjectRecord | undefined>(S_PROJECTS, "readonly", (s) => s.get(rec.id)) ?? null;
    } catch {
      existing = lsList().find((r) => r.id === rec.id) ?? null;
    }
    const record: ProjectRecord = {
      id: rec.id,
      name: rec.name,
      description: rec.description,
      data: rec.data,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await tx(S_PROJECTS, "readwrite", (s) => s.put(record));
      await tx(S_VERSIONS, "readwrite", (s) =>
        s.add({ projectId: rec.id, label: snapshotLabel, data: rec.data, createdAt: now }),
      );
    } catch {
      localStorage.setItem(LS_PREFIX + rec.id, JSON.stringify(record));
    }
    return record;
  },

  async remove(id) {
    try {
      await tx(S_PROJECTS, "readwrite", (s) => s.delete(id));
      const versions = await tx<IDBValidKey[]>(S_VERSIONS, "readonly", (s) => s.index("projectId").getAllKeys(id));
      const store = await openDb();
      const t = store.transaction(S_VERSIONS, "readwrite");
      versions.forEach((k) => t.objectStore(S_VERSIONS).delete(k));
      t.oncomplete = () => store.close();
    } catch {
      localStorage.removeItem(LS_PREFIX + id);
    }
  },

  async versions(id) {
    try {
      const rows = await tx<{ id: number; label: string | null; createdAt: number }[]>(
        S_VERSIONS,
        "readonly",
        (s) => s.index("projectId").getAll(id),
      );
      return (rows ?? [])
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 50)
        .map((r) => ({ id: String(r.id), label: r.label, createdAt: r.createdAt }));
    } catch {
      return [];
    }
  },

  async restore(projectId, versionId) {
    const rows = await tx<{ id: number; data: unknown }[]>(S_VERSIONS, "readonly", (s) =>
      s.index("projectId").getAll(projectId),
    );
    const hit = (rows ?? []).find((r) => String(r.id) === versionId);
    if (!hit) return null;
    const project = await localStore.get(projectId);
    if (!project) return null;
    const updated: ProjectRecord = { ...project, data: hit.data, updatedAt: Date.now() };
    await tx(S_PROJECTS, "readwrite", (s) => s.put(updated));
    return updated;
  },
};

/* ------------------------------------------------------------------ */
/*  adapter selection                                                  */
/* ------------------------------------------------------------------ */

class HttpStore implements StorageAdapter {
  readonly kind = "remote" as const;
  constructor(private base = "/api/projects") {}

  async list(): Promise<ProjectRecord[]> {
    const r = await fetch(this.base);
    const d = await r.json();
    if (!d.ok) throw new Error(d.error ?? "list failed");
    return (d.projects as ProjectRecord[]).map((p) => ({ ...p, id: String(p.id) }));
  }

  async get(id: string): Promise<ProjectRecord | null> {
    const r = await fetch(`${this.base}/${id}`);
    const d = await r.json();
    if (!d.ok) throw new Error(d.error ?? "not found");
    return { ...d.project, id: String(d.project.id) } as ProjectRecord;
  }

  async save(
    rec: { id: string; name: string; description: string; data: unknown },
    snapshotLabel: string,
  ): Promise<ProjectRecord> {
    const r = await fetch(`${this.base}/${rec.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...rec, snapshotLabel }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error ?? "save failed");
    return { ...d.project, id: String(d.project.id) } as ProjectRecord;
  }

  async remove(id: string): Promise<void> {
    await fetch(`${this.base}/${id}`, { method: "DELETE" });
  }

  async versions(): Promise<VersionSummary[]> {
    return [];
  }

  async restore(): Promise<ProjectRecord | null> {
    return null;
  }
}

/**
 * `NEXT_PUBLIC_CIRCUITBENCH_BACKEND=remote` opts into a server-side store;
 * every other value (and every Cloudflare Pages deployment) stays local.
 */
export const storage: StorageAdapter =
  process.env.NEXT_PUBLIC_CIRCUITBENCH_BACKEND === "remote" ? new HttpStore() : localStore;

/* ------------------------------------------------------------------ */
/*  crash-recovery autosave                                            */
/* ------------------------------------------------------------------ */

const AUTOSAVE_KEY = "circuitbench.autosave";
const AUTOSAVE_AT = "circuitbench.autosave.at";

export function writeAutosave(doc: unknown): boolean {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(doc));
    localStorage.setItem(AUTOSAVE_AT, new Date().toISOString());
    return true;
  } catch {
    return false;
  }
}

export function readAutosave(): { doc: unknown; at: string } | null {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return null;
    return { doc: JSON.parse(raw), at: localStorage.getItem(AUTOSAVE_AT) ?? "" };
  } catch {
    return null;
  }
}

export function clearAutosave() {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
    localStorage.removeItem(AUTOSAVE_AT);
  } catch {
    /* ignore */
  }
}
