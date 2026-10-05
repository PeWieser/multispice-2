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
import { Simulator } from "../src/lib/sim/engine";
import { runOperatingPoint } from "../src/lib/sim/analyses";
import { isEditorSingleKey, normalizeControlKey, resolveBoundControls } from "../src/lib/sim/controls";
import { inkOn } from "../src/lib/canvas-theme";
import { mainValueParamKey, splitValueQuery } from "../src/lib/library/search";
import { previewFit, symbolBBox } from "../src/lib/library/preview";
import { FOURTEENSEG_ASCII, FOURTEENSEG_FONT, PARTS, PART_MAP } from "../src/lib/library/catalog";
import { WAV_MAX_SAMPLES, WAV_MIN_RATE, WAV_PEAK, curveToWav, encodeWavMono, medianDt, nativeRate, normalizePeak, toUniformGrid } from "../src/lib/wav";
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

// ---------- S5.12: Kontrast-Prüfung gegen die echten CSS-Variablen ----------
type Theme = "light" | "dark";
const TEXT_PAIRS: Array<[string, string, number]> = [
  ["ink", "surface", 4.5],
  ["ink-2", "surface", 4.5],
  ["ink-3", "surface", 4.5],
  ["ink", "surface-2", 4.5],
  ["ink-3", "surface-2", 4.5],
  ["ok", "surface", 4.5],
  ["warn", "surface", 4.5],
  ["err", "surface", 4.5],
  ["accent", "surface", 4.5],
  ["accent-ink", "accent", 4.5],
  ["teal", "surface", 4.5],
  ["violet", "surface", 4.5],
];
const GRAPHIC_PAIRS: Array<[string, string, number]> = [
  ["wire", "canvas", 3.0],
  ["wire-sel", "canvas", 3.0],
  ["ch1", "canvas", 3.0],
  ["ch2", "canvas", 3.0],
  ["ch3", "canvas", 3.0],
  ["ch4", "canvas", 3.0],
];

function themeVars(theme: Theme): Record<string, string> {
  const css = fs.readFileSync(path.join(__dirname, "..", "src", "app", "globals.css"), "utf8");
  const startMarker = theme === "light" ? '[data-theme="light"]' : '[data-theme="dark"]';
  const start = css.indexOf(startMarker);
  assert.ok(start >= 0, `Theme-Block ${theme} gefunden`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("\n}", open);
  const block = css.slice(open, close);
  const vars: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    vars[m[1]] = m[2];
  }
  return vars;
}

function luminance(hex: string): number {
  assert.ok(/^#[0-9a-fA-F]{6}$/.test(hex), `6-stelliges Hex erwartet: ${hex}`);
  const ch = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function ratio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
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

  // ---------- S5.12a: WCAG-Kontraste (hell) aus globals.css ----------
  {
    const vars = themeVars("light");
    for (const [fg, bg, min] of TEXT_PAIRS) {
      const r = ratio(vars[fg], vars[bg]);
      assert.ok(r >= min, `${fg}/${bg} hell = ${r.toFixed(2)} (min ${min})`);
    }
    for (const [fg, bg, min] of GRAPHIC_PAIRS) {
      const r = ratio(vars[fg], vars[bg]);
      assert.ok(r >= min, `${fg}/${bg} hell = ${r.toFixed(2)} (min ${min})`);
    }
    ok("S5.12a Kontraste hell");
  }

  // ---------- S5.12b: WCAG-Kontraste (dunkel) aus globals.css ----------
  {
    const vars = themeVars("dark");
    for (const [fg, bg, min] of TEXT_PAIRS) {
      const r = ratio(vars[fg], vars[bg]);
      assert.ok(r >= min, `${fg}/${bg} dunkel = ${r.toFixed(2)} (min ${min})`);
    }
    for (const [fg, bg, min] of GRAPHIC_PAIRS) {
      const r = ratio(vars[fg], vars[bg]);
      assert.ok(r >= min, `${fg}/${bg} dunkel = ${r.toFixed(2)} (min ${min})`);
    }
    ok("S5.12b Kontraste dunkel");
  }

  // ---------- S5.13a: WAV-Codec (Header, Skalierung, Clipping) ----------
  {
    const bytes = encodeWavMono([0, 1, -1, 2, -2], 48000);
    assert.equal(bytes.length, 44 + 5 * 2, "Header + Daten");
    const ascii = (off: number, len: number) => String.fromCharCode(...bytes.slice(off, off + len));
    assert.equal(ascii(0, 4), "RIFF");
    assert.equal(ascii(8, 4), "WAVE");
    assert.equal(ascii(12, 4), "fmt ");
    assert.equal(ascii(36, 4), "data");
    const v = new DataView(bytes.buffer);
    assert.equal(v.getUint32(24, true), 48000, "Samplerate");
    assert.equal(v.getUint16(34, true), 16, "16-bit");
    assert.equal(v.getInt16(44, true), 0);
    assert.equal(v.getInt16(46, true), 32767);
    assert.equal(v.getInt16(48, true), -32767);
    assert.equal(v.getInt16(50, true), 32767, "Clip +");
    assert.equal(v.getInt16(52, true), -32767, "Clip −");
    ok("S5.13a WAV-Codec");
  }

  // ---------- S5.13b: Rate + Gitter + Normierung ----------
  {
    const t48: number[] = [];
    for (let i = 0; i < 100; i++) t48.push(i / 48000);
    assert.equal(nativeRate(t48), 48000, "48 kHz nativ");
    assert.equal(nativeRate([0, 0.01, 0.02]), WAV_MIN_RATE, "10-ms-Achse → Minimum");
    assert.equal(nativeRate([0, 1e-6, 2e-6]), 192000, "MHz-Achse → Maximum");
    assert.equal(nativeRate([5]), 0, "Einzelpunkt → 0");
    assert.equal(medianDt([0, 0.002, 0.004]), 0.002);
    const grid = toUniformGrid([0, 0.002], [10, 20], 1000)!;
    assert.equal(grid.length, 3, "0/1/2 ms");
    assert.ok(Math.abs(grid[1] - 15) < 1e-9, "linear interpoliert");
    assert.equal(toUniformGrid([0, 1], [1], 1000), null, "Längen-Mismatch");
    assert.equal(toUniformGrid([0, 1000], [0, 0], 48000), null, "Längenbremse");
    assert.deepEqual(normalizePeak([0, 0]), [0, 0], "Stille bleibt");
    const norm = normalizePeak([-2, 1]);
    assert.ok(Math.abs(Math.max(...norm.map(Math.abs)) - WAV_PEAK) < 1e-9, "Spitze auf −1 dBFS");
    assert.ok(WAV_MAX_SAMPLES >= 1_000_000, "Bremse dokumentiert");
    ok("S5.13b Rate/Gitter/Norm");
  }

  // ---------- S5.13c: Pipeline Zeitachse → Bytes ----------
  {
    const t: number[] = [];
    const y: number[] = [];
    for (let i = 0; i <= 48; i++) {
      t.push(i / 48000);
      y.push(Math.sin((2 * Math.PI * 1000 * i) / 48000));
    }
    const wav = curveToWav(t, y)!;
    assert.equal(wav.rate, 48000);
    assert.equal(wav.bytes.length, 44 + 49 * 2);
    const v = new DataView(wav.bytes.buffer);
    assert.ok(Math.abs(v.getInt16(44, true)) < 2000, "Sinus startet bei ~0");
    assert.equal(curveToWav([0], [1]), null, "unbrauchbar → null");
    ok("S5.13c WAV-Pipeline");
  }

  // ---------- S5.13d: Symbol-Stilführer-Lint (Raster, Typo, Strich) ----------
  {
    const sizes = new Set([7, 8, 9, 10, 11, 12, 13]);
    let pins = 0;
    const bad: string[] = [];
    for (const p of PARTS) {
      for (const pin of p.pins ?? []) {
        pins++;
        if (pin.x % 10 !== 0 || pin.y % 10 !== 0) bad.push(`${p.id}: Pin ${pin.name} abseits Raster`);
      }
      for (const prim of p.symbol ?? []) {
        if (prim.t === "text" && !sizes.has(prim.size ?? 9)) {
          bad.push(`${p.id}: Textgröße ${prim.size} außerhalb 7–13`);
        }
        if (prim.t === "line" && prim.w !== undefined) {
          bad.push(`${p.id}: Linienbreite wird ignoriert (w setzen verboten)`);
        }
      }
    }
    assert.ok(pins > 2000, `Katalog gelesen (${pins} Pins)`);
    assert.deepEqual(bad.slice(0, 8), [], `Stil-Verstöße: ${bad.slice(0, 8).join("; ")}`);
    ok("S5.13d Symbol-Lint");
  }

  // ---------- S5.13e: 14-Segment (Font + LED-Verdrahtung) ----------
  {
    assert.equal(FOURTEENSEG_FONT.length, 16, "16 Hex-Glyphen");
    for (const g of FOURTEENSEG_FONT) {
      assert.equal(g.length, 14, "14 Segmente");
      assert.ok(g.every((b) => b === 0 || b === 1), "nur Bits");
    }
    const codes = [32, 45, ...Array.from({ length: 10 }, (_, i) => 48 + i), ...Array.from({ length: 26 }, (_, i) => 65 + i)];
    for (const c of codes) {
      const g = FOURTEENSEG_ASCII[c];
      assert.ok(g && g.length === 14 && g.every((b) => b === 0 || b === 1), `ASCII ${c} vollständig`);
    }
    assert.deepEqual(FOURTEENSEG_ASCII[32], new Array(14).fill(0), "Leerzeichen dunkel");
    // Jede Segment-Position leuchtet in mind. einer Glyphe (kein totes Bit).
    const all = [...FOURTEENSEG_FONT, ...Object.values(FOURTEENSEG_ASCII)];
    for (let i = 0; i < 14; i++) {
      assert.ok(all.some((g) => g[i] === 1), `Segment ${i} lebt`);
    }
    const part = PART_MAP["fourteenseg"];
    assert.ok(part, "Bauteil registriert");
    assert.equal(part.pins.length, 16, "14 + DP + COM");
    const nets = Array.from({ length: 16 }, (_, i) => `N${i}`);
    const mk = (common: string) => ({ id: "DS1", partId: "fourteenseg", params: { common, vf: 2 } });
    const cath = part.toDevices(mk("cathode") as never, nets);
    assert.equal(cath.length, 15, "15 LEDs");
    assert.ok(cath.every((d) => d.type === "LED"), "alle LED");
    assert.deepEqual(cath[0].nodes, ["N0", "N15"], "Kathode: Segment→COM");
    const an = part.toDevices(mk("anode") as never, nets);
    assert.deepEqual(an[0].nodes, ["N15", "N0"], "Anode: COM→Segment");
    assert.deepEqual(an[14].nodes, ["N15", "N14"], "DP (Index 14) verdrahtet");
    ok("S5.13e 14-Segment");
  }

  // ---------- S5.13f: NTC (Beta-Gleichung, handgerechnet) ----------
  {
    const div = (temp: number) => runOperatingPoint({
      devices: [
        { id: "V1", type: "V", nodes: ["TOP", "0"], params: { dc: 5 }, source: { kind: "dc", dc: 5 } },
        { id: "R1", type: "R", nodes: ["TOP", "M"], params: { r: 10000 } },
        { id: "NTC1", type: "NTC", nodes: ["M", "0"], params: { r25: 10000, b: 3950, tnom: 25 } },
      ],
    }, { temperature: temp }).nodes["M"];
    const v25 = div(25);
    assert.ok(Math.abs(v25 - 2.5) < 0.001, `25 °C ≈ 2.5 V (ist ${v25})`);
    // Handrechnung: R(85 °C) = 10k·exp(3950·(1/358.15−1/298.15)) ≈ 1088 Ω → M ≈ 0.4905 V.
    const v85 = div(85);
    assert.ok(Math.abs(v85 - 0.4905) < 0.01, `85 °C ≈ 0.49 V (ist ${v85})`);
    ok("S5.13f NTC");
  }

  // ---------- S5.13g: LDR (Potenzgesetz, Klemmen) ----------
  {
    const ldr = PART_MAP["ldr"];
    assert.ok(ldr, "Bauteil registriert");
    const r = (lux: number) => {
      const d = ldr.toDevices({ id: "LDR1", partId: "ldr", params: { r10: 10000, gamma: 0.7, lux } } as never, ["A", "B"]);
      assert.equal(d.length, 1, "ein Device");
      assert.equal(d[0].type, "R", "linearer Widerstand");
      return d[0].params.r;
    };
    // Handrechnung: 10k·(10/100)^0.7 ≈ 1995 Ω.
    assert.ok(Math.abs(r(100) - 1995) < 20, `100 lx ≈ 1995 Ω (ist ${r(100)})`);
    assert.ok(Math.abs(r(10) - 10000) < 1, "10 lx = R10");
    assert.ok(r(0) <= 1e8, "Dunkelheit geklemmt (≤ 100 MΩ)");
    assert.ok(r(1e6) >= 1, "Flutlicht geklemmt (≥ 1 Ω)");
    ok("S5.13g LDR");
  }

  // ---------- S5.14a: Tasten-Normalisierung + Belegungs-Auflösung ----------
  {
    assert.equal(normalizeControlKey("A"), "a", "Groß→klein");
    assert.equal(normalizeControlKey(" 5 "), "5", "Whitespace egal");
    assert.equal(normalizeControlKey(""), null, "leer = unbelegt");
    assert.equal(normalizeControlKey("ab"), null, "nur Einzelzeichen");
    assert.equal(normalizeControlKey(" "), null, "Leertaste reserviert");
    assert.equal(normalizeControlKey("?"), null, "Hilfe reserviert");
    assert.equal(normalizeControlKey(7), null, "kein String");
    const insts = [
      { id: "i1", params: { key: "A" } },
      { id: "i2", params: { key: "" } },
      { id: "i3", params: {} },
      { id: "i4", params: { key: "a" } },
    ];
    assert.deepEqual(resolveBoundControls(insts, "a"), ["i1", "i4"], "Groß/Klein egal, Mehrfachbelegung");
    assert.deepEqual(resolveBoundControls(insts, "b"), [], "nichts belegt");
    assert.deepEqual(resolveBoundControls(insts, " "), [], "Leertaste nie");
    assert.ok(isEditorSingleKey("r") && !isEditorSingleKey("q"), "Konflikt-Erkennung");
    ok("S5.14a Tastenbelegung");
  }

  // ---------- S5.14b: Schalter/Taster folgen controls[Geräte-ID] ----------
  {
    const div = (type: string, ctrl: Record<string, number>) => {
      const sim = new Simulator({
        devices: [
          { id: "V1", type: "V", nodes: ["TOP", "0"], params: { dc: 5 }, source: { kind: "dc", dc: 5 } },
          { id: "R1", type: "R", nodes: ["TOP", "M"], params: { r: 10000 } },
          { id: "S1dev", type, nodes: ["M", "0"], params: { closed: 0, ron: 0.01, roff: 1e9 } },
        ],
      }, { temperature: 27 });
      sim.controls = ctrl;
      sim.operatingPoint();
      return sim.nodeVoltage("M");
    };
    for (const type of ["SWITCH", "PUSHBUTTON"]) {
      const open = div(type, { S1dev: 0 });
      const shut = div(type, { S1dev: 1 });
      assert.ok(Math.abs(open - 5) < 0.01, `${type} offen ≈ 5 V (ist ${open})`);
      assert.ok(shut < 0.01, `${type} geschlossen ≈ 0 V (ist ${shut})`);
    }
    // Label-Schlüssel (alter UI-Pfad) bleibt wirkungslos — Doku des S5.14-Fix.
    const mislabeled = div("SWITCH", { S1: 1 });
    assert.ok(Math.abs(mislabeled - 5) < 0.01, "Label statt ID = wirkungslos (S5.14-Fix nötig)");
    ok("S5.14b Schalter-Control");
  }

  // ---------- S5.14c: Poti folgt controls[Geräte-ID] ----------
  {
    const wiper = (pos: number) => {
      const sim = new Simulator({
        devices: [
          { id: "V1", type: "V", nodes: ["TOP", "0"], params: { dc: 10 }, source: { kind: "dc", dc: 10 } },
          { id: "RV1dev", type: "POT", nodes: ["TOP", "M", "0"], params: { r: 10000, pos: 0.5 } },
        ],
      }, { temperature: 27 });
      sim.controls = { RV1dev: pos };
      sim.operatingPoint();
      return sim.nodeVoltage("M");
    };
    // Konvention (Engine ≡ Renderer-Markierung): pos = Abstand von A,
    // pos 0 = Schleifer an A (volle 10 V), pos 1 = an B (0 V).
    assert.ok(Math.abs(wiper(0.25) - 7.5) < 0.05, `25 % ≈ 7.5 V (ist ${wiper(0.25)})`);
    assert.ok(Math.abs(wiper(0.75) - 2.5) < 0.05, `75 % ≈ 2.5 V (ist ${wiper(0.75)})`);
    ok("S5.14c Poti-Control");
  }

  // ---------- S5.14d: key-Param auf allen interaktiven Schalter/Taster/Poti ----------
  {
    const actives = PARTS.filter((p) => p.interactive === "switch" || p.interactive === "button" || p.interactive === "pot");
    assert.ok(actives.length >= 12, `alle da (sind ${actives.length})`);
    for (const p of actives) {
      const k = p.params.find((d) => d.key === "key");
      assert.ok(k, `${p.id} hat key-Param`);
      assert.equal(k!.type, "text", `${p.id}: Typ text`);
      assert.equal(k!.def, "", `${p.id}: Default unbelegt`);
    }
    ok("S5.14d key-Parameter");
  }

  // ---------- S5.15a: Canvas-Hex-Lint (nur dokumentierte Hardware-Ausnahmen) ----------
  {
    const render = fs.readFileSync("src/components/Canvas/render.ts", "utf8");
    const canvas = fs.readFileSync("src/components/Canvas.tsx", "utf8");
    // Hardware-Emission (LED-Gehäusefarben, Segment-Rot) bleibt Fix-Hex —
    // eine grüne LED bleibt grün, unabhängig vom Theme (S5.12-Prinzip).
    const HW = new Set(["#ff4d4f", "#4ade80", "#60a5fa", "#fde047", "#f8fafc"]);
    const HWCTX = ["colorMap", "??", "segOn", "on ?", "dp ?", "shadowColor"]; // Glow = Hardware-Emission
    for (const [name, src] of [["render.ts", render]] as Array<[string, string]>) {
      const lines = src.split("\n");
      lines.forEach((line, i) => {
        for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}/g)) {
          assert.ok(HW.has(m[0]), `${name}:${i + 1} unerlaubtes Hex ${m[0]}`);
          assert.ok(HWCTX.some((t) => line.includes(t)), `${name}:${i + 1} Hex ohne Hardware-Kontext`);
        }
      });
    }
    // Canvas.tsx: einziges Fix-Hex = Elektronen-Amber (Signal, dunkle Outline trägt).
    canvas.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}/g)) {
        assert.ok(m[0] === "#f59e0b" && line.includes("isElectron"), `Canvas.tsx:${i + 1} unerlaubtes Hex ${m[0]}`);
      }
    });
    ok("S5.15a Canvas-Hex-Lint");
  }

  // ---------- S5.15b: Reduced-Motion- + Focus-CSS vorhanden (Guards) ----------
  {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"), "Reduced-Motion-Block");
    assert.ok(css.includes("[data-current-flow]"), "Stromfluss abschaltbar");
    assert.ok(css.includes(":focus-visible"), ":focus-visible-Regel");
    assert.ok(css.includes("outline-offset: 2px"), "Focus-Offset 2px");
    ok("S5.15b Motion/Focus-CSS");
  }

  // ---------- S5.15c: inkOn (Kontrast-Tinte) ----------
  {
    assert.equal(inkOn("#ffffff"), "#101014", "Weiß → dunkel");
    assert.equal(inkOn("#000000"), "#ffffff", "Schwarz → weiß");
    assert.equal(inkOn("#fff"), "#101014", "Kurz-Hex geht");
    assert.equal(inkOn("#b0362b"), "#ffffff", "err hell-Theme → weiß");
    assert.equal(inkOn("#ff7a6b"), "#101014", "err dunkel-Theme → dunkel (S5.15-Fix)");
    assert.equal(inkOn("#e0ab47"), "#101014", "warn dunkel-Theme → dunkel");
    assert.equal(inkOn("var(--accent)"), "#ffffff", "Nicht-Hex → Weiß-Fallback");
    ok("S5.15c inkOn");
  }

  // ---------- S5.16a: TSX-Farb-Guards (Palette = einzige Ausnahme) ----------
  {
    const ctx = fs.readFileSync("src/components/CanvasContextMenu.tsx", "utf8");
    // Einziges Fix-Hex: die Draht-Farbpalette (der Inhalt selbst).
    const PALETTE = new Set(["#ef4444", "#22c55e", "#3b82f6", "#fbbf24", "#a78bfa", "#ec4899"]);
    for (const m of ctx.matchAll(/#[0-9a-fA-F]{6}/g)) {
      assert.ok(PALETTE.has(m[0]), `Kontextmenü: Hex außerhalb der Palette: ${m[0]}`);
    }
    const pe = fs.readFileSync("src/components/PartEditorDialog.tsx", "utf8");
    const vcc = pe.split("\n").filter((l) => l.includes("#f87171"));
    assert.equal(vcc.length, 1, "nur noch VCC-Canvas-Farbe");
    assert.ok(vcc[0].includes("vcc:"), "VCC-Zeile");
    const src = fs.readFileSync("src/components/Instruments/sources.tsx", "utf8");
    assert.ok(!src.includes('"#fff"'), "kein Fix-Weiß auf --ok");
    ok("S5.16a TSX-Farb-Guards");
  }

  // ---------- S5.16b: Dialog-Einheitlichkeit (alle aus einer Quelle) ----------
  {
    const SHELLED = [
      "src/components/AnalysisDialog.tsx",
      "src/components/ExtractPartDialog.tsx",
      "src/components/PartEditorDialog.tsx",
      "src/components/ProjectsDialog.tsx",
      "src/components/SettingsDialog.tsx",
      "src/components/WizardsDialog.tsx",
      "src/components/ShortcutSheet.tsx",
      "src/components/oszi2/HelpOverlay.tsx",
      "src/components/Instruments/Window.tsx",
      "src/components/LibraryPalette.tsx",
    ];
    for (const f of SHELLED) {
      const c = fs.readFileSync(f, "utf8");
      const usesUi = c.includes('"./ui"') || c.includes('"../ui"') || c.includes("@/components/ui")
        || c.includes("ui/Dialog") || c.includes("ui/WindowChrome");
      assert.ok(usesUi, `${f} nutzt keine ui-Schale`);
    }
    ok("S5.16b Dialog-Einheitlichkeit");
  }

  // ---------- S5.16c: Bedien-Guards (Esc, Rollen, kein globaler .row-Leak) ----------
  {
    const dlg = fs.readFileSync("src/components/ui/Dialog.tsx", "utf8");
    assert.ok(dlg.includes('role="dialog"'), "ModalShell: role");
    assert.ok(dlg.includes('"Escape"') || dlg.includes("'Escape'"), "ModalShell: Esc");
    assert.ok(dlg.includes("useFocusTrap") || dlg.includes("FOCUSABLE"), "ModalShell: Fokus-Falle");
    const wb = fs.readFileSync("src/components/Workbench.tsx", "utf8");
    assert.ok(wb.includes("BottomSheet") && wb.includes("onClose"), "BottomSheet existiert");
    const ctx = fs.readFileSync("src/components/CanvasContextMenu.tsx", "utf8");
    assert.ok(!ctx.includes(".row {") && !ctx.includes('className="row"') && !ctx.includes('className="row '), "kein globaler .row-Leak");
    assert.ok(ctx.includes(".ctx-row {"), "ctx-Scope vorhanden");
    ok("S5.16c Bedien-Guards");
  }

  // ---------- S5.17a: Such-Wert („r 10k") ----------
  {
    const close = (got: number | undefined, want: number) => got !== undefined && Math.abs(got - want) <= Math.abs(want) * 1e-9;
    const q1 = splitValueQuery("r 10k");
    assert.deepEqual(q1.terms, ["r"], "r 10k: Begriff");
    assert.ok(close(q1.value, 10000), "r 10k: Wert");
    const q2 = splitValueQuery("c 100n");
    assert.deepEqual(q2.terms, ["c"], "c 100n: Begriff");
    assert.ok(close(q2.value, 1e-7), "c 100n: Wert");
    const q3 = splitValueQuery("l 4k7");
    assert.deepEqual(q3.terms, ["l"], "4k7: Begriff");
    assert.ok(close(q3.value, 4700), "4k7: Wert");
    const q4 = splitValueQuery("R 2R2");
    assert.deepEqual(q4.terms, ["r"], "Groß/Klein: Begriff");
    assert.ok(close(q4.value, 2.2), "2R2: Wert");
    const noVal = splitValueQuery("555");
    assert.deepEqual(noVal.terms, ["555"], "reine Zahl bleibt Begriff");
    assert.equal(noVal.value, undefined, "555 kein Wert");
    assert.equal(splitValueQuery("nmos").value, undefined, "Wort kein Wert");
    assert.deepEqual(splitValueQuery(""), { terms: [] }, "leer");
    assert.equal(mainValueParamKey(PART_MAP["resistor"]), "r", "Ziel r");
    assert.equal(mainValueParamKey(PART_MAP["capacitor"]), "c", "Ziel c");
    assert.equal(mainValueParamKey(PART_MAP["switch_spst"]), null, "Schalter ignoriert Werte");
    ok("S5.17a Such-Wert");
  }

  // ---------- S5.17b: Detail-Guards (⌘, Standard, Griffe) ----------
  {
    const lib = fs.readFileSync("src/components/LibraryPalette.tsx", "utf8");
    const cmdUses = lib.split("<Command").length - 1;
    assert.equal(cmdUses, 1, "genau ein Command-Icon (nur Apple-Zweig)");
    assert.ok(lib.includes("Strg+K"), "Strg+K-Badge vorhanden");
    assert.ok(lib.includes("useIsApple"), "Plattform-Abfrage vorhanden");
    assert.ok(!lib.includes("useState(depth < 1)"), "Kategorien nicht mehr offen by default");
    const win = fs.readFileSync("src/components/Instruments/Window.tsx", "utf8");
    assert.ok(!win.includes("M15 7 L7 15"), "kein Eck-Griff-SVG (unsichtbar wie Bibliothek)");
    const place = fs.readFileSync("src/state/editor/slices/placement.ts", "utf8");
    assert.ok(place.includes("placingPreset"), "Vorbelegung im Placement-Slice");
    const ctx = fs.readFileSync("src/components/CanvasContextMenu.tsx", "utf8");
    assert.ok(!ctx.includes("⇧ oben"), "kein ⇧-Label (plattformsensibel)");
    ok("S5.17b Detail-Guards");
  }

  // ---------- S5.18a: Vorschau-Fit (ICs ganz sichtbar) ----------
  {
    const ic = symbolBBox(PART_MAP["ne555"].symbol);
    assert.ok(ic.maxX - ic.minX >= 70, `555-Breite ≥ 70 (ist ${ic.maxX - ic.minX})`);
    assert.ok(ic.maxY - ic.minY >= 96, `555-Höhe ≥ 96 (ist ${ic.maxY - ic.minY})`);
    const fit = previewFit(PART_MAP["ne555"].symbol, 96);
    // Passt ganz in die Box (vorher: starrer 48er-Ausschnitt = leer wirkend).
    assert.ok((ic.maxX - ic.minX) * fit.scale <= 96, "Breite passt");
    assert.ok((ic.maxY - ic.minY) * fit.scale <= 96, "Höhe passt");
    assert.ok(fit.lineWidth > 1.5, "Strich kompensiert");
    const r = previewFit(PART_MAP["resistor"].symbol, 40);
    assert.ok(Math.abs(r.cx) < 5 && Math.abs(r.cy) < 5, "Widerstand zentriert");
    assert.ok(r.scale > fit.scale * 0.5, "kleine Symbole nicht winzig");
    ok("S5.18a Vorschau-Fit");
  }

  // ---------- S5.18b: Auswahl-Sperre im CSS ----------
  {
    const css = fs.readFileSync("src/app/globals.css", "utf8");
    assert.ok(css.includes("user-select: none"), "Chrom nicht selektierbar");
    assert.ok(css.includes('input, textarea, select, [contenteditable="true"], .selectable'), "Opt-out-Regel");
    const bp = fs.readFileSync("src/components/BottomPanel.tsx", "utf8");
    assert.ok(bp.includes("mono selectable"), "Log-Konsole kopierbar");
    ok("S5.18b Auswahl-Sperre");
  }

  // ---------- S5.18c: Platzieren-Button sofort sichtbar ----------
  {
    const lib = fs.readFileSync("src/components/LibraryPalette.tsx", "utf8");
    const btn = lib.indexOf("Als ${");
    const params = lib.indexOf(">Parameter<");
    assert.ok(btn > 0 && params > 0 && btn < params, "Button vor Parameter-Block");
    assert.ok(lib.includes("wird als"), "Vorbelegungs-Chip vorhanden");
    ok("S5.18c Aktionszone");
  }

  // ---------- S5.19a: keine Hinweis-Box, Affordanz sichtbar ----------
  {
    const lib = fs.readFileSync("src/components/LibraryPalette.tsx", "utf8");
    assert.ok(!lib.includes(">Hinweis<"), "Hinweis-Box entfernt");
    assert.ok(lib.includes("r 10k"), "Suchsyntax im Platzhalter");
    assert.ok(lib.includes("cursor-grab"), "Zieh-Affordanz an Zeilen");
    ok("S5.19a Selbst-Erklärung");
  }

  // ---------- S5.19b: mobiler Füll-Modus ----------
  {
    const lib = fs.readFileSync("src/components/LibraryPalette.tsx", "utf8");
    assert.ok(lib.includes("standalone || fill"), "Füll-Layout");
    assert.ok(lib.includes("{fill && selected && ("), "mobile Aktionsleiste");
    assert.ok(lib.includes("Alle Kategorien"), "Kategorie-Select");
    assert.ok(lib.includes('role="tablist"'), "Bereichs-Tabs");
    const wb = fs.readFileSync("src/components/Workbench.tsx", "utf8");
    assert.ok(wb.includes("<LibraryPalette fill"), "Sheet nutzt Füll-Modus");
    ok("S5.19b Füll-Modus");
  }

  // ---------- S5.19c: Aktion statt Tipp, Icons statt Glyphen ----------
  {
    const g = fs.readFileSync("src/components/Grapher.tsx", "utf8");
    assert.ok(g.includes("DC-Arbeitspunkt berechnen"), "Grapher-Aktionsbutton");
    assert.ok(g.includes('runAnalysis("op"'), "führt OP-Analyse aus");
    const c = fs.readFileSync("src/components/Canvas.tsx", "utf8");
    assert.ok(c.includes("<RotateCw"), "Lucide statt ↻");
    for (const g of ["↻", "↺", "⇆", "✕"]) assert.ok(!c.includes(g), `kein ${g} in Canvas`);
    ok("S5.19c Aktion+Icons");
  }

  console.log("sprint5resttest: 36 checks OK");
}

main().catch((e) => {
  console.error("sprint5resttest FAILED:", e);
  process.exit(1);
});
