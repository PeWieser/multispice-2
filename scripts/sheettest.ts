/* Blätter Stufe A: Entwurfs-Tabs (Neu/Wechseln/Umbenennen/Duplizieren/Schließen/Sortieren).
 * Store-Logik ohne DOM. Fehlschlag -> Exit 1. */
import { engine, sheets, useEditor } from "../src/state/editor";

let failed = 0;
function checkTrue(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
}

const st = () => useEditor.getState();
const ids = () => sheets.map((s) => s.id);

/* 1 · Ausgangslage: keine Blätter; „+“ behält den offenen Entwurf und legt einen an */
checkTrue("Start ohne Blätter", sheets.length === 0, `sheets=${sheets.length}`);
st().newDocument();
checkTrue("newDocument behält + legt an", sheets.length === 2, `sheets=${sheets.length}`);
const idA = st().doc.id;
checkTrue("neuer Entwurf aktiv", ids()[1] === idA);

/* 2 · Duplizieren: tiefe Kopie direkt hinter dem Original, Duplikat wird aktiv */
st().duplicateSheet(idA);
checkTrue("duplicateSheet legt Blatt an", sheets.length === 3, `sheets=${sheets.length}`);
const idB = st().doc.id;
checkTrue("Duplikat hinter Original + aktiv", ids().join() === [ids()[0], idA, idB].join(), ids().join(","));
checkTrue("Duplikat-ID frisch", idB.startsWith("sch_") && idB !== idA, idB);
checkTrue("Duplikat heißt Kopie", /Kopie/.test(st().doc.name), st().doc.name);
const orig = sheets.find((s) => s.id === idA)!;
const copy = sheets.find((s) => s.id === idB)!;
checkTrue(
  "tiefe Kopie (Objekte+Arrays nicht geteilt)",
  copy.doc !== orig.doc &&
    copy.doc.instances !== orig.doc.instances &&
    copy.doc.wires !== orig.doc.wires &&
    copy.doc.junctions !== orig.doc.junctions,
);

/* 3 · Umbenennen trifft nur das Duplikat */
st().renameSheet(idB, "Stromversorgung");
checkTrue(
  "Rename trifft nur B",
  sheets.find((s) => s.id === idB)?.name === "Stromversorgung" &&
    sheets.find((s) => s.id === idA)?.name !== "Stromversorgung",
);

/* 4 · Wechseln per openSheet */
st().openSheet(idA);
checkTrue("openSheet(A) aktiv", st().doc.id === idA);

/* 5 · Sortieren: B vor A */
st().reorderSheets(idB, idA);
const order = ids();
checkTrue(
  "reorderSheets(B vor A)",
  order.indexOf(idB) === order.indexOf(idA) - 1,
  sheets.map((s) => s.name).join("|"),
);

/* 6 · Aktives Blatt schließen -> Nachbar wird aktiv */
st().openSheet(idB);
st().closeSheet(idB);
checkTrue("closeSheet entfernt B", sheets.length === 2 && !ids().includes(idB));
checkTrue("Nachbar wird aktiv", st().doc.id === ids()[0] || st().doc.id === ids()[1], st().doc.name);

/* 7 · Nicht-aktives Blatt schließen */
const other = ids().find((id) => id !== st().doc.id)!;
st().closeSheet(other);
checkTrue("closeSheet(anderes) übrig 1", sheets.length === 1, `sheets=${sheets.length}`);

/* 8 · Letztes Blatt bleibt offen */
const last = st().doc.id;
st().closeSheet(last);
checkTrue("letztes Blatt geschützt", sheets.length === 1 && st().doc.id === last);

/* 9 · Okt-28: nur eine Simulation gleichzeitig (Lauf-Flag gehört der Datei) */
const idA9 = st().doc.id;
st().startSim();
checkTrue("startSim läuft", st().sim.running && engine.running);
checkTrue("startSim setzt Eigen-Flag", sheets.find((s) => s.id === idA9)?.simRunning === true);
st().newDocument();
const idB9 = st().doc.id;
checkTrue("Wechsel hält Engine an", !engine.running && !st().sim.running);
checkTrue("altes Blatt behält Flag", sheets.find((s) => s.id === idA9)?.simRunning === true);
checkTrue("neues Blatt ohne Flag", sheets.find((s) => s.id === idB9)?.simRunning !== true);
st().startSim();
checkTrue(
  "Start räumt Fremd-Flags ab (ein Eigentümer)",
  sheets.find((s) => s.id === idB9)?.simRunning === true &&
    sheets.find((s) => s.id === idA9)?.simRunning !== true,
);
st().openSheet(idA9);
checkTrue("Rückkehr ohne Flag bleibt stehen", !engine.running && !st().sim.running);
checkTrue("Hintergrund-Blatt behält Flag", sheets.find((s) => s.id === idB9)?.simRunning === true);
// Rebuild-Zähler: Fortsetzung ohne Neuaufbau prüfen.
let rebuilds = 0;
const origRebuild = engine.rebuild.bind(engine);
engine.rebuild = ((...a: Parameters<typeof engine.rebuild>) => {
  rebuilds++;
  return origRebuild(...a);
}) as typeof engine.rebuild;
st().openSheet(idB9);
checkTrue("Rückkehr mit Flag setzt fort", st().sim.running && engine.running);
checkTrue("Fortsetzung ohne Rebuild", rebuilds === 0, `rebuilds=${rebuilds}`);
engine.rebuild = origRebuild;
st().pauseSim();
checkTrue("Pause löscht alle Flags", sheets.every((s) => !s.simRunning));
st().startSim();
st().stopSim();
checkTrue("Stopp löscht alle Flags", sheets.every((s) => !s.simRunning) && !engine.running);

if (failed > 0) {
  console.error(`sheettest: ${failed} FEHLER`);
  process.exit(1);
}
console.log("sheettest: alle Prüfungen bestanden");
