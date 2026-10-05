/**
 * Sprint 5 Rest (§50): Vertrags-Tests S5.11 (Datensicherheit).
 * - migrateDoc: Junction-Ableitung, Idempotenz, Probe-Defaults
 * - Backup-Generation: Rotation + Fallback mit fromBackup-Kennzeichen
 * - desktop/atomic.cjs: atomare Writes, .bak-Rotation, Backup-Read
 * Läuft in node (tsx), localStorage/AppData als Fakes — kein Browser nötig.
 */
import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { emptyDoc } from "../src/lib/schematic/model";
import {
  loadProjectLocal,
  normalizeProjectDoc,
  parseStoredProject,
  pickStoredProject,
  rotateProjectBackup,
  saveProjectLocal,
} from "../src/lib/storage";

let n = 0;
const ok = (name: string) => {
  n += 1;
  console.log(`  ok ${n} ${name}`);
};

function mapStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  } as Storage;
}

async function main() {
  // ---------- S5.11a: migrateDoc leitet Junctions aus T-Kreuzungen ab ----------
  {
    const doc = emptyDoc("mig");
    (doc as unknown as Record<string, unknown>).junctions = undefined;
    doc.wires = [
      { id: "w1", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] },
      { id: "w2", points: [{ x: 50, y: -60 }, { x: 50, y: 0 }] },
    ];
    const out = normalizeProjectDoc(doc);
    assert.equal(out.junctions!.length, 1, "genau ein Dot am T");
    assert.ok(Math.abs(out.junctions![0].x - 50) < 0.01 && Math.abs(out.junctions![0].y) < 0.01);
    ok("S5.11a T-Kreuzung → Junction");
  }

  // ---------- S5.11b: migrateDoc ist idempotent ----------
  {
    const doc = emptyDoc("mig2");
    (doc as unknown as Record<string, unknown>).junctions = undefined;
    doc.wires = [{ id: "w1", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
    const once = normalizeProjectDoc(doc);
    const count = once.junctions!.length;
    const twice = normalizeProjectDoc(once);
    assert.equal(twice.junctions!.length, count, "zweiter Lauf fügt nichts hinzu");
    ok("S5.11b migrate idempotent");
  }

  // ---------- S5.11c: vorhandene Junctions bleiben unangetastet ----------
  {
    const doc = emptyDoc("mig3");
    doc.junctions = [{ id: "j1", x: 10, y: 20 }];
    doc.wires = [{ id: "w1", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }];
    const out = normalizeProjectDoc(doc);
    assert.equal(out.junctions!.length, 1);
    assert.equal(out.junctions![0].id, "j1");
    ok("S5.11c Junctions unangetastet");
  }

  // ---------- S5.11d: Probe-Defaults werden nachgetragen ----------
  {
    const doc = emptyDoc("mig4");
    (doc.probes as unknown[]).push({ id: "p1" });
    const out = normalizeProjectDoc(doc);
    const pr = out.probes[0] as unknown as Record<string, unknown>;
    assert.equal(pr.direction, 0);
    assert.equal(pr.rotation, 0);
    assert.equal(pr.periodic, false);
    assert.deepEqual(pr.show, { vdc: true });
    assert.deepEqual(pr.thresholds, { low: 0.8, high: 2.0 });
    ok("S5.11d Probe-Defaults");
  }

  // ---------- S5.11e: parseStoredProject (gültig/korrupt/fremd) ----------
  {
    const doc = emptyDoc("parse");
    const raw = JSON.stringify({ name: doc.name, doc, savedAt: new Date().toISOString() });
    assert.ok(parseStoredProject(raw), "gültig parst");
    assert.equal(parseStoredProject('{"name": "x", "doc": {"unvoll'), null, "korrupt → null");
    assert.equal(parseStoredProject('{"hello":"world"}'), null, "fremd → null");
    assert.equal(parseStoredProject(null), null, "leer → null");
    ok("S5.11e parseStoredProject");
  }

  // ---------- S5.11f: pickStoredProject fällt aufs Backup zurück ----------
  {
    const good = JSON.stringify({
      name: "g",
      doc: emptyDoc("g"),
      savedAt: new Date().toISOString(),
    });
    const bad = '{"name": "g", "doc": {';
    const fromPrev = pickStoredProject(bad, good);
    assert.ok(fromPrev, "Backup greift");
    assert.equal(fromPrev!.fromBackup, true, "fromBackup-Kennzeichen");
    assert.equal(pickStoredProject(bad, bad), null, "beide korrupt → null");
    const fromCur = pickStoredProject(good, bad);
    assert.ok(fromCur && fromCur.fromBackup !== true, "intakte Hauptdatei gewinnt");
    ok("S5.11f pickStoredProject");
  }

  // ---------- S5.11g: rotateProjectBackup (Fake-Storage) ----------
  {
    const store = mapStorage();
    rotateProjectBackup(store);
    assert.equal(store.getItem("multispice.project.prev.v1"), null, "leer → No-Op");
    store.setItem("multispice.project.v1", "A");
    rotateProjectBackup(store);
    assert.equal(store.getItem("multispice.project.prev.v1"), "A");
    ok("S5.11g rotateProjectBackup");
  }

  // ---------- S5.11h: save/load-Roundtrip mit Fallback (echte Funktionen) ----------
  {
    const ls = mapStorage();
    (globalThis as Record<string, unknown>).window = { localStorage: ls };
    try {
      const a = emptyDoc("Stand A");
      const b = emptyDoc("Stand B");
      assert.ok(saveProjectLocal(a).ok);
      assert.ok(saveProjectLocal(b).ok);
      const loaded = loadProjectLocal();
      assert.ok(loaded && loaded.doc.name === "Stand B", "aktueller Stand lädt");
      assert.equal(loaded!.fromBackup, undefined, "kein Backup-Kennzeichen");
      // Crash-Simulation: Hauptkopie halb geschrieben.
      ls.setItem("multispice.project.v1", '{"name": "Stand B", "doc": {"instanc');
      const rescued = loadProjectLocal();
      assert.ok(rescued, "Backup rettet");
      assert.equal(rescued!.doc.name, "Stand A", "Vorgänger-Stand");
      assert.equal(rescued!.fromBackup, true, "Kennzeichen gesetzt");
    } finally {
      delete (globalThis as Record<string, unknown>).window;
    }
    ok("S5.11h Roundtrip + Crash-Fallback");
  }

  // ---------- S5.11i: desktop/atomic.cjs ----------
  {
    const require = createRequire(import.meta.url);
    const atomic = require("../desktop/atomic.cjs") as {
      atomicWriteFileSync: (p: string, d: string | Buffer, e?: string) => void;
      rotateBackupSync: (p: string) => void;
      readJsonWithBackupSync: (p: string) => unknown;
    };
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ms-atomic-"));
    try {
      const f = path.join(dir, "state.json");
      atomic.atomicWriteFileSync(f, '{"a":1}', "utf8");
      assert.equal(fs.readFileSync(f, "utf8"), '{"a":1}');
      assert.ok(!fs.existsSync(`${f}.tmp`), "kein .tmp-Müll");
      atomic.atomicWriteFileSync(f, '{"a":2}', "utf8");
      assert.equal(fs.readFileSync(f, "utf8"), '{"a":2}', "überschreibt");
      atomic.rotateBackupSync(f);
      assert.equal(fs.readFileSync(`${f}.bak`, "utf8"), '{"a":2}', ".bak-Rotation");
      fs.writeFileSync(f, '{"a":', "utf8"); // korrupt (Altbestand)
      assert.deepEqual(atomic.readJsonWithBackupSync(f), { a: 2 }, "Backup-Read");
      atomic.rotateBackupSync(path.join(dir, "fehlt.json")); // No-Op, kein Wurf
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    ok("S5.11i atomic.cjs");
  }

  console.log("sprint5resttest: 9 checks OK");
}

main().catch((e) => {
  console.error("sprint5resttest FAILED:", e);
  process.exit(1);
});
