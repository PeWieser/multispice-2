/**
 * Strom-Animations-Regressions: Richtung pro TEILSTÜCK statt Mittelwert pro Draht.
 * Szenario NE555-Astabil (Entladephase): R1↔R2-Draht (300,200)→(300,260), mittig
 * bei (300,230) zum DIS-Pin angezapft — oben fließt R1→DIS (runter), unten
 * R2→DIS (rauf). Die alte Draht-Mittelung zeigte eine Hälfte rückwärts
 * (Doppel-Einfluss am R2). Läuft ohne DOM.
 */
import { computeFlowLinks, driftSpeedPxPerSec } from "../src/lib/schematic/flowviz";

let failed = 0;
function check(name: string, ok: boolean, info = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` – ${info}` : ""}`);
  if (!ok) failed++;
}
function checkNear(name: string, actual: number, expected: number, tol: number) {
  check(name, Math.abs(actual - expected) <= tol, `got ${actual.toPrecision(6)}, want ~${expected}`);
}

// Entladephase: DIS zieht den Abzweig auf ~0; oben 0,9 mA (R1), unten 0,13 mA (R2).
const wires = [{ id: "w_r1r2" }];
const chains = new Map([
  [
    "w_r1r2",
    [
      { a: "300,200", b: "300,230", len: 30 },
      { a: "300,230", b: "300,260", len: 30 },
    ],
  ],
]);
const phi = new Map([
  ["300,200", 0.0009],
  ["300,230", 0],
  ["300,260", 0.00013],
]);

const { flows, nextPhases } = computeFlowLinks(wires, chains, phi, new Map(), {
  electron: false,
  running: false,
  dtSec: 0,
});
check("zwei Teilstücke → zwei Flows (kein Draht-Mittel)", flows.length === 2, `got ${flows.length}`);
check("oben: Richtung A→B (runter zum Abzweig)", flows[0]?.dir === 1, `got ${flows[0]?.dir}`);
check("unten: Richtung B→A (rauf zum Abzweig)", flows[1]?.dir === -1, `got ${flows[1]?.dir}`);
checkNear("oben: 0,9 mA", flows[0]?.mag ?? NaN, 0.0009, 1e-9);
checkNear("unten: 0,13 mA", flows[1]?.mag ?? NaN, 0.00013, 1e-9);
check("Geometrie oben", flows[0]?.ax === 300 && flows[0]?.ay === 200 && flows[0]?.bx === 300 && flows[0]?.by === 230);
check("Geometrie unten", flows[1]?.ax === 300 && flows[1]?.ay === 230 && flows[1]?.bx === 300 && flows[1]?.by === 260);
check(
  "Phasen-Init: zweites Glied um Kumulativlänge versetzt",
  (nextPhases.get("w_r1r2:1") ?? -1) === 30 % 22,
  `got ${nextPhases.get("w_r1r2:1")}`,
);

// Elektronen-Modus kehrt beide Richtungen um.
const e = computeFlowLinks(wires, chains, phi, new Map(), { electron: true, running: false });
check("Elektronen: oben B→A", e.flows[0]?.dir === -1);
check("Elektronen: unten A→B", e.flows[1]?.dir === 1);

// Unter der Schwelle (10 µA): kein Flow; kurze Stummel (< 6 px): kein Flow.
const tiny = computeFlowLinks(
  wires,
  chains,
  new Map([
    ["300,200", 2e-6],
    ["300,230", 0],
    ["300,260", 1e-6],
  ]),
  new Map(),
  { running: false },
);
check("Leckströme unterdrückt", tiny.flows.length === 0, `got ${tiny.flows.length}`);
const stub = computeFlowLinks(
  [{ id: "w_stub" }],
  new Map([["w_stub", [{ a: "0,0", b: "3,0", len: 3 }]]]),
  new Map([
    ["0,0", 0.01],
    ["3,0", 0],
  ]),
  new Map(),
  { running: false },
);
check("Kurz-Stummel ohne Perlen", stub.flows.length === 0, `got ${stub.flows.length}`);

// Phasen-Integration: Vorzeichen folgt der Richtung, Stillstand friert ein.
const run = computeFlowLinks(wires, chains, phi, new Map([["w_r1r2:0", 5]]), {
  running: true,
  dtSec: 0.1,
});
const speed = driftSpeedPxPerSec(0.0009);
checkNear("Phase läuft vorwärts (dir +1)", run.nextPhases.get("w_r1r2:0") ?? NaN, (5 + speed * 0.1) % 22, 1e-9);
const run2 = computeFlowLinks(wires, chains, phi, new Map([["w_r1r2:1", 5]]), {
  running: true,
  dtSec: 0.1,
});
const speed2 = driftSpeedPxPerSec(0.00013);
checkNear(
  "Phase läuft rückwärts (dir −1)",
  run2.nextPhases.get("w_r1r2:1") ?? NaN,
  (((5 - speed2 * 0.1) % 22) + 22) % 22,
  1e-9,
);
checkNear("Driftgeschwindigkeit 0,9 mA", speed, 20 + Math.log10(0.0009 / 1e-5) * 18, 1e-9);

if (failed > 0) {
  console.error(`${failed} FEHLER in flowtest`);
  process.exit(1);
}
console.log("flowtest: alle Prüfungen bestanden");
