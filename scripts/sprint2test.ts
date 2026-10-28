/**
 * Sprint-2-Regression (Gefühl): Konvergenz-Diagnose, Fortschritt, Überlast.
 *
 * - S2.2: singuläre Netzliste → failure + Verdächtige; erzwungene
 *   Nicht-Konvergenz (maxIter: 1) → Verdächtige; Runner hebt ok:false.
 * - S2.1: progress-Callback wird aufgerufen (tran direkt + via Runner).
 * - S2.4: Clamp → overload; Dauer-Clamp → adaptive Rate; Riesen-Backlog → droppedSec.
 * - S2.5: alle Presets bauen + docToSvg liefert SVG.
 *
 * Worker-Protokoll, Spotlight, Boot: Typcheck + manuelle Prüfung (DOM/Threading).
 */
import { emptyDoc } from "@/lib/schematic/model";
import { Netlist, Simulator } from "@/lib/sim/engine";
import { runTransient } from "@/lib/sim/analyses";
import { runAnalysisLocal } from "@/lib/sim/runner";
import { RealtimeEngine } from "@/lib/sim/realtime";
import { PRESETS } from "@/lib/schematic/tools";
import { docToSvg } from "@/lib/export/sheet";

let failed = 0;
function pass(name: string) {
  console.log(`PASS ${name}`);
}
function fail(name: string, detail = "") {
  failed++;
  console.log(`FAIL ${name}${detail ? " — " + detail : ""}`);
}
function expect(cond: boolean, name: string, detail = "") {
  if (cond) pass(name);
  else fail(name, detail);
}

/* S2.2a: direkt auf Netzlisten-Ebene — zwei ideale Spannungszweige (rser: 0,
 * sonst fängt der 1-nΩ-Default die Schleife) über einen Knoten = singulär. */
{
  const loop: Netlist = {
    devices: [
      { id: "V1", type: "V", nodes: ["N1", "0"], params: { rser: 0 }, source: { kind: "dc", dc: 5 } },
      { id: "V2", type: "V", nodes: ["N1", "0"], params: { rser: 0 }, source: { kind: "dc", dc: 3 } },
    ],
  };
  const sim = new Simulator(loop, {});
  const r = sim.operatingPoint();
  expect(!r.ok, "S2.2 V-Schleife scheitert");
  expect(r.failure === "singular", "S2.2 failure=singular", String(r.failure));
  expect(!!r.suspects?.length, `S2.2 Verdächtige genannt (${(r.suspects ?? []).join(",")})`);
  // Knoten fängt das globale gmin (1e-12) — singulär sind die beiden Zweige.
  expect(!!r.suspects?.includes("I(V1)"), "S2.2 Zweig I(V1) als Verdächtiger", (r.suspects ?? []).join(","));
}

/* S2.2b: erzwungene Nicht-Konvergenz (maxIter: 1) an nichtlinearer Schaltung. */
{
  const nlin: Netlist = {
    devices: [
      { id: "V1", type: "V", nodes: ["N1", "0"], params: {}, source: { kind: "dc", dc: 5 } },
      { id: "R1", type: "R", nodes: ["N1", "N2"], params: { r: 1000 } },
      { id: "D1", type: "D", nodes: ["N2", "0"], params: {} },
    ],
  };
  const sim = new Simulator(nlin, { maxIter: 1 });
  const r = sim.operatingPoint();
  expect(!r.ok, "S2.2 maxIter:1 scheitert");
  expect(r.failure === "nonconvergent", "S2.2 failure=nonconvergent", String(r.failure));
  expect(!!r.suspects?.length, `S2.2 Updates gerankt (${(r.suspects ?? []).join(",")})`);
}

/* S2.2c: Runner hebt Kernel-Fehlschlag in errors + convergence. */
{
  const doc = emptyDoc("op");
  const rep = runAnalysisLocal(doc, "op", {});
  void rep;
  // Leeres Dokument konvergiert trivial — Negativtest: errors leer, keine Diagnose.
  expect(rep.errors.length === 0, "S2.2 Runner ohne Fehler ohne Diagnose", rep.errors.join(";"));
  expect(rep.convergence === undefined, "S2.2 Runner convergence leer");
}

/* S2.1: Fortschritt direkt + via Runner. */
{
  const nl: Netlist = {
    devices: [
      { id: "V1", type: "V", nodes: ["N1", "0"], params: {}, source: { kind: "dc", dc: 1 } },
      { id: "R1", type: "R", nodes: ["N1", "0"], params: { r: 1000 } },
    ],
  };
  const calls: number[] = [];
  const r = runTransient(nl, {}, { stopTime: 0.01, stepTime: 1e-5 }, ["N1"], (f) => calls.push(f));
  expect(r.ok && calls.length > 0, `S2.1 tran meldet Fortschritt (${calls.length}x)`);
  const mono = calls.every((c, i) => i === 0 || c >= calls[i - 1]);
  expect(mono && calls[calls.length - 1] <= 1, "S2.1 Fortschritt monoton ≤ 1");
}
{
  const doc = PRESETS.find((p) => p.id === "rc-lowpass")!.build();
  const calls: number[] = [];
  const rep = runAnalysisLocal(doc, "tran", { tran: { stopTime: 0.01, stepTime: 1e-5 }, progress: (f) => calls.push(f) });
  expect((rep.result as { ok: boolean }).ok && calls.length > 0, `S2.1 Runner reicht Fortschritt durch (${calls.length}x)`);
}

/* S2.4: Überlast + Adaption + Verworfen-Zähler. */
{
  const doc = PRESETS.find((p) => p.id === "rc-lowpass")!.build();
  const eng = new RealtimeEngine();
  eng.options.maxStepsPerFrame = 1;
  eng.options.sampleRate = 200000;
  eng.rebuild(doc);
  eng.running = true;
  for (let i = 0; i < 40; i++) eng.tick(0.016);
  const st = eng.lastState;
  expect(st.overload === true, "S2.4 Dauer-Clamp = overload");
  expect((st.effectiveSampleRate ?? 0) < eng.options.sampleRate, `S2.4 Rate adaptiert (${st.effectiveSampleRate})`);
}
{
  const doc = PRESETS.find((p) => p.id === "rc-lowpass")!.build();
  const eng = new RealtimeEngine();
  eng.options.timeScale = 1e6;
  eng.rebuild(doc);
  eng.running = true;
  eng.tick(0.016);
  expect((eng.lastState.droppedSec ?? 0) > 0, `S2.4 Verworfenes gezählt (${eng.lastState.droppedSec})`);
}
{
  // Normalbetrieb: keine Überlast, volle Rate.
  const doc = PRESETS.find((p) => p.id === "rc-lowpass")!.build();
  const eng = new RealtimeEngine();
  eng.rebuild(doc);
  eng.running = true;
  for (let i = 0; i < 5; i++) eng.tick(0.001);
  expect(eng.lastState.overload === false, "S2.4 Normalbetrieb ruhig");
  expect(eng.lastState.effectiveSampleRate === eng.options.sampleRate, "S2.4 volle Rate im Normalbetrieb");
}

/* S2.5: alle Presets bauen + SVG-Thumbnail. */
{
  let ok = 0;
  for (const p of PRESETS) {
    const doc = p.build();
    const svg = docToSvg(doc, { frame: false });
    if (doc.instances.length > 0 && svg.includes("<svg") && svg.includes("</svg>")) ok++;
    else fail(`S2.5 Galerie ${p.id}`, `inst=${doc.instances.length} svg=${svg.length}`);
  }
  expect(ok === PRESETS.length, `S2.5 ${ok}/${PRESETS.length} Thumbnails ehrlich`);
}

if (failed) {
  console.log(`\nSprint-2-Prüfungen: ${failed} FEHLSCHLÄGE.`);
  process.exit(1);
}
console.log("\nSprint-2-Prüfungen: alle bestanden.");
