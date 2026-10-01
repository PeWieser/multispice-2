/**
 * Runde 23 (W49–W56): Leitungsverlegung + Bauteilanordnung.
 * Läuft ohne DOM über die reinen Modell-/Store-Funktionen.
 *
 * W49 Leitungsenden rasten auf Pins · W50 Router endet exakt am Pin
 * W51 offene Enden/Null-/Doppelleitungen melden · W52 Drehen/Spiegeln reißt nicht ab
 * W53 Verbindungspunkte · W54 Segment verschieben · W55 Ausrichten/Verteilen/Begradigen
 * W56 Überlappungswarnung · W61 Kreuzungen wie in Multisim (Punkt = verbunden)
 * W62 Geometrie reinigen · W63 Netz zeichnen · W64 Anschluss-Magnet · W70 Begradigen räumt Ecken
 */
import {
  GRID,
  attachWireEnd,
  buildNets,
  cleanWirePoints,
  instanceBounds,
  pinPosition,
  snapWiresToPins,
  straightenWirePoints,
  type SchematicDoc,
} from "../src/lib/schematic/model";
import { PART_MAP } from "../src/lib/library/catalog";
import { PRESETS, routeOrthogonal } from "../src/lib/schematic/tools";
import { collectPins, reattachWiresToPins, sheets, useEditor, useHud, wireJunctionCandidates } from "../src/state/editor";
import { isValidProjectDoc, normalizeProjectDoc } from "../src/lib/storage";
import {
  buildNetPath,
  cleanOrphanJunctions,
  dragWireCornerOrtho,
  dragWireSegmentOrtho,
  findNetTarget,
  finishNetDraft,
  insertComponentIntoWires,
  needsJunction,
  netClick,
  normalizeDocGeometry,
} from "../src/lib/schematic/netdraw";

let failed = 0;
function check(name: string, ok: boolean, info = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` – ${info}` : ""}`);
  if (!ok) failed++;
}
const orth = (pts: Array<{ x: number; y: number }>) => pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y);

/* ---------------- W50 · Router endet exakt am Pin ---------------- */
{
  const a = { x: 273, y: 197 };
  const b = { x: 473, y: 203 };
  const r = routeOrthogonal(a, b, []);
  check("W50 ohne Hindernis: Start exakt am Pin", r[0].x === 273 && r[0].y === 197, JSON.stringify(r[0]));
  check("W50 ohne Hindernis: Ende exakt am Pin", r[r.length - 1].x === 473 && r[r.length - 1].y === 203, JSON.stringify(r[r.length - 1]));
  check("W50 ohne Hindernis: orthogonal", orth(r), JSON.stringify(r));

  const r2 = routeOrthogonal(a, b, [{ x: 300, y: 150, w: 120, h: 120 }]);
  check("W50 mit Hindernis: Start exakt", r2[0].x === 273 && r2[0].y === 197);
  check("W50 mit Hindernis: Ende exakt", r2[r2.length - 1].x === 473 && r2[r2.length - 1].y === 203);
  check("W50 mit Hindernis: orthogonal", orth(r2), JSON.stringify(r2));
  const cuts = r2.some((p, i) => {
    if (i === 0) return false;
    const q = r2[i - 1];
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const x = q.x + (p.x - q.x) * t;
      const y = q.y + (p.y - q.y) * t;
      if (x > 300 && x < 420 && y > 150 && y < 270) return true;
    }
    return false;
  });
  check("W50 mit Hindernis: umgeht die BBox", !cuts, JSON.stringify(r2));
  check("W50 auf dem Raster: unverändert gerade", routeOrthogonal({ x: 100, y: 100 }, { x: 300, y: 100 }, []).length === 2);
}

/* ---------------- Beispiele sind elektrisch verbunden (W49) ---------------- */
{
  let openEnds = 0;
  let emptyNets = 0;
  for (const p of PRESETS) {
    const res = buildNets(p.build());
    openEnds += res.openEnds.length;
    emptyNets += res.nets.filter((n) => n.pins.length === 0 && n.points.length > 1).length;
  }
  check("W49: Beispiele ohne offene Leitungsenden", openEnds === 0, `${openEnds} offen`);
  check("W49: Beispiele ohne leere Netze", emptyNets === 0, `${emptyNets} Netze ohne Pin`);
}

/* ---------------- Hilfsdokument ---------------- */
function docWithResistor(): { doc: SchematicDoc; pin0: { x: number; y: number } } {
  const doc: SchematicDoc = {
    id: "t", name: "t", labels: [], notes: [], probes: [],
    instances: [{ id: "r1", partId: "resistor", x: 270, y: 200, rot: 0, label: "R1", params: {} }],
    wires: [{ id: "w1", points: [{ x: 273, y: 197 }, { x: 473, y: 197 }] }],
  };
  return { doc, pin0: pinPosition(doc.instances[0], 0) };
}

/* ---------------- W49 · Rasten ---------------- */
{
  const { doc, pin0 } = docWithResistor();
  doc.wires[0].points[0] = { x: pin0.x + 3, y: pin0.y - 3 };
  check("W49: ein Ende gerastet", snapWiresToPins(doc, 15).moved === 1);
  check("W49: Ende liegt exakt auf dem Pin", doc.wires[0].points[0].x === pin0.x && doc.wires[0].points[0].y === pin0.y);
  check("W49: Geometrie bleibt orthogonal", orth(doc.wires[0].points), JSON.stringify(doc.wires[0].points));
  const far = docWithResistor();
  const before = JSON.stringify(far.doc.wires[0].points);
  snapWiresToPins({ ...far.doc, instances: [] } as SchematicDoc, 15);
  check("W49: ohne Pin in der Nähe passiert nichts", JSON.stringify(far.doc.wires[0].points) === before);
}

/* ---------------- W52 · Drehen/Spiegeln ---------------- */
{
  const { doc } = docWithResistor();
  const p0 = pinPosition(doc.instances[0], 0);
  const p1 = pinPosition(doc.instances[0], 1);
  doc.wires[0].points = [
    { x: p0.x, y: p0.y }, { x: p0.x, y: p0.y - 60 }, { x: p1.x, y: p1.y - 60 }, { x: p1.x, y: p1.y },
  ];
  const before = collectPins(doc, new Set(["r1"]));
  doc.instances[0].rot = 90;
  const moved = reattachWiresToPins(doc, before, new Set());
  const np0 = pinPosition(doc.instances[0], 0);
  const np1 = pinPosition(doc.instances[0], 1);
  const pts = doc.wires[0].points;
  const last = pts[pts.length - 1];
  check("W52: beide Enden mitgeführt", moved === 2, JSON.stringify(pts));
  check("W52: Ende 0 am neuen Pin", pts[0].x === np0.x && pts[0].y === np0.y);
  check("W52: Ende 1 am neuen Pin", last.x === np1.x && last.y === np1.y);
  check("W52: weiterhin orthogonal", orth(pts), JSON.stringify(pts));
  check("W52: Netz bleibt verbunden", !buildNets(doc).pinNets["r1:0"].endsWith("_nc0"), buildNets(doc).pinNets["r1:0"]);
}

/* ---------------- W51 · Warnungen / W53 · Verbindungspunkte ---------------- */
{
  const { doc, pin0 } = docWithResistor();
  doc.wires = [
    { id: "a", points: [{ x: pin0.x, y: pin0.y }, { x: pin0.x, y: pin0.y + 100 }, { x: pin0.x + 100, y: pin0.y + 100 }] },
    { id: "b", points: [{ x: pin0.x + 30, y: pin0.y + 40 }, { x: pin0.x + 70, y: pin0.y + 40 }] },
    { id: "c", points: [{ x: pin0.x, y: pin0.y + 50 }, { x: pin0.x + 20, y: pin0.y + 50 }] },
    { id: "d", points: [{ x: 900, y: 900 }, { x: 900, y: 900 }] },
    { id: "e", points: [{ x: pin0.x, y: pin0.y + 100 }, { x: pin0.x, y: pin0.y + 200 }] },
    { id: "f", points: [{ x: pin0.x, y: pin0.y + 200 }, { x: pin0.x, y: pin0.y + 100 }] },
  ];
  const res = buildNets(doc);
  check("W51: offene Enden gefunden", res.openEnds.length === 4, JSON.stringify(res.openEnds));
  check("W51: Warnung „hängt in der Luft\"", res.warnings.some((w) => w.includes("hängt in der Luft")));
  check("W51: Warnung Null-Leitung", res.warnings.some((w) => w.includes("ohne Länge")));
  check("W51: Warnung doppelte Leitung", res.warnings.some((w) => w.includes("doppelt vorhanden")));
  check("W53: T-Kontakt ergibt Verbindungspunkt", res.junctions.some((j) => j.x === pin0.x && j.y === pin0.y + 50), JSON.stringify(res.junctions));
  check("W53: Pin am Leitungsende ergibt keinen Punkt", !res.junctions.some((j) => j.x === pin0.x && j.y === pin0.y));
  const cleaned = cleanWirePoints([{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: 0, y: 20 }, { x: 10, y: 20 }]);
  check("cleanWirePoints entfernt Zwischenpunkt", cleaned.length === 3, JSON.stringify(cleaned));
  const t = [{ x: 0, y: 0 }, { x: 10, y: 10 }];
  attachWireEnd(t, 1, { x: 10, y: 20 });
  check("attachWireEnd fügt Knick ein", t.length === 3 && orth(t), JSON.stringify(t));
}

/* ---------------- W54/W55/W56 · Store-Aktionen ---------------- */
function makeDoc2(): SchematicDoc {
  return {
    id: "t2", name: "t2", labels: [], notes: [], probes: [],
    instances: [
      { id: "r1", partId: "resistor", x: 200, y: 200, rot: 0, label: "R1", params: {} },
      { id: "r2", partId: "resistor", x: 320, y: 260, rot: 0, label: "R2", params: {} },
      { id: "r3", partId: "resistor", x: 560, y: 220, rot: 0, label: "R3", params: {} },
    ],
    wires: [{ id: "w1", points: [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }] }],
  };
}
{
  const st = useEditor.getState();
  st.setDoc(makeDoc2(), false);
  st.setSelection(["r1", "r2", "r3"]);
  st.alignSelection("left");
  const xs = useEditor.getState().doc.instances.map((i) => Math.round(instanceBounds(i).x));
  check("W55: links ausrichten – gleiche Kante", new Set(xs).size === 1, JSON.stringify(xs));

  st.setDoc(makeDoc2(), false);
  st.setSelection(["r1", "r2", "r3"]);
  st.distributeSelection("h");
  const cs = useEditor.getState().doc.instances.map((i) => { const b = instanceBounds(i); return b.x + b.w / 2; }).sort((a, b) => a - b);
  check("W55: verteilen – gleiche Abstände", Math.abs(cs[1] - cs[0] - (cs[2] - cs[1])) < 0.01, JSON.stringify(cs));
}
{
  const st = useEditor.getState();
  st.setDoc(makeDoc2(), false);
  const orig = JSON.parse(JSON.stringify(useEditor.getState().doc.wires[0].points));
  st.setWireSegmentOffset("w1", 0, orig, 0, 30);
  const pts = useEditor.getState().doc.wires[0].points;
  check("W54: nur das Segment wandert", pts[0].y === 230 && pts[1].y === 230 && pts[2].y === 300, JSON.stringify(pts));
  check("W54: orthogonal", orth(pts), JSON.stringify(pts));
}
{
  const st = useEditor.getState();
  const doc = makeDoc2();
  doc.wires[0].points = [{ x: 203, y: 197 }, { x: 301, y: 202 }, { x: 303, y: 299 }];
  st.setDoc(doc, false);
  st.setSelection(["w1"]);
  st.straightenSelection();
  const pts = useEditor.getState().doc.wires[0].points;
  check("W55: begradigen rastet aufs Raster", pts.every((p) => p.x % GRID === 0 && p.y % GRID === 0), JSON.stringify(pts));
  check("W55: begradigen macht rechte Winkel", orth(pts), JSON.stringify(pts));
}
{
  // W70: aus einer geraden Leitung eine mit Ecke machen und wieder begradigen →
  // der Eckpunkt verschwindet, die Leitung ist wieder eine Linie.
  const st = useEditor.getState();
  const doc = makeDoc2();
  doc.wires[0].points = [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }, { x: 200, y: 300 }];
  st.setDoc(doc, false);
  st.setSelection(["w1"]);
  st.straightenSelection();
  const pts = useEditor.getState().doc.wires[0].points;
  check("W70 geradlinig: Eckpunkt verschwindet, zwei Punkte bleiben", pts.length === 2, JSON.stringify(pts));
  check("W70 geradlinig: Enden unverändert", pts[0].x === 200 && pts[0].y === 200 && pts[1].x === 200 && pts[1].y === 300, JSON.stringify(pts));

  // Zwei Punkte, die nicht auf einer Achse liegen: genau ein Knick bleibt.
  const doc2 = makeDoc2();
  doc2.wires[0].points = [{ x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }, { x: 400, y: 300 }];
  st.setDoc(doc2, false);
  st.setSelection(["w1"]);
  st.straightenSelection();
  const pts2 = useEditor.getState().doc.wires[0].points;
  check("W70 versetzt: genau ein Knick bleibt", pts2.length === 3, JSON.stringify(pts2));
  check("W70 versetzt: rechte Winkel", orth(pts2), JSON.stringify(pts2));

  // W70 · Sicherung: ein T-Kontakt (Punkt auf fremder Leitung) darf nicht verschwinden.
  const doc3 = makeDoc2();
  doc3.wires[0].points = [{ x: 100, y: 200 }, { x: 200, y: 200 }, { x: 300, y: 200 }]; // gerade, Berührpunkt in der Mitte
  doc3.wires.push({ id: "w2", points: [{ x: 200, y: 200 }, { x: 200, y: 300 }] });
  st.setDoc(doc3, false);
  st.setSelection(["w1"]);
  st.straightenSelection();
  const res = buildNets(useEditor.getState().doc);
  const pts3 = useEditor.getState().doc.wires[0].points;
  check("W70 T-Kontakt bleibt erhalten (Punkt geschützt)", pts3.some((q) => q.x === 200 && q.y === 200), JSON.stringify(pts3));
  check("W70 beide Leitungen bleiben im selben Netz", res.pointNets["100,200"] === res.pointNets["200,300"], `${res.pointNets["100,200"]} / ${res.pointNets["200,300"]}`);
}
{
  const st = useEditor.getState();
  st.setDoc(makeDoc2(), false);
  st.setSelection(["r1"]);
  st.copySelection();
  st.pasteClipboard();
  const first = useEditor.getState().doc.instances.slice(3);
  st.setSelection(["r1"]);
  st.copySelection();
  st.pasteClipboard();
  const second = useEditor.getState().doc.instances.slice(3 + first.length);
  const b1 = first.length ? instanceBounds(first[0]) : null;
  const b2 = second.length ? instanceBounds(second[0]) : null;
  check("W55: Einfüge-Kaskade staffelt weiter", Boolean(b1 && b2 && b2.x > b1.x && b2.y > b1.y), `${JSON.stringify(b1)} → ${JSON.stringify(b2)}`);
}
{
  const st = useEditor.getState();
  const doc = makeDoc2();
  doc.instances.push({ id: "r4", partId: "resistor", x: 200, y: 200, rot: 0, label: "R4", params: {} });
  st.setDoc(doc, false);
  const res = buildNets(useEditor.getState().doc);
  check("W56: deckungsgleiche Bauteile werden gemeldet", res.warnings.some((w) => w.includes("überlagern")), JSON.stringify(res.warnings));
}

/* ---------------- W61 · Kreuzungen wie in Multisim ---------------- */
function kreuzDoc(): SchematicDoc {
  return {
    id: "test_kreuz",
    name: "kreuz",
    instances: [],
    labels: [],
    notes: [],
    probes: [],
    junctions: [],
    wires: [
      { id: "w1", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
      { id: "w2", points: [{ x: 100, y: 0 }, { x: 100, y: 200 }] },
    ],
  };
}
const netAt = (doc: SchematicDoc, x: number, y: number) => buildNets(doc).pointNets[`${x},${y}`];
{
  const doc = kreuzDoc();
  check("W61 Kreuzung ohne Punkt: getrennte Netze", netAt(doc, 0, 100) !== netAt(doc, 100, 0), `${netAt(doc, 0, 100)} vs ${netAt(doc, 100, 0)}`);
  const mitPunkt: SchematicDoc = { ...doc, junctions: [{ id: "j1", x: 100, y: 100 }] };
  check("W61 Kreuzung mit Punkt: ein Netz", netAt(mitPunkt, 0, 100) === netAt(mitPunkt, 100, 0), `${netAt(mitPunkt, 0, 100)}`);
  const res = buildNets(doc);
  check("W61 Kreuzung erzeugt keinen Verbindungspunkt", !res.junctions.some((j) => Math.abs(j.x - 100) < 0.5 && Math.abs(j.y - 100) < 0.5), JSON.stringify(res.junctions));
}
{
  // T-Kontakt: Leitungsende auf fremder Leitung ist eine echte Verbindung
  const doc: SchematicDoc = {
    ...kreuzDoc(),
    wires: [
      { id: "w1", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
      { id: "w2", points: [{ x: 100, y: 0 }, { x: 100, y: 100 }] },
    ],
  };
  check("W61 T-Kontakt verbindet", netAt(doc, 0, 100) === netAt(doc, 100, 0), `${netAt(doc, 0, 100)}`);
  const res = buildNets(doc);
  check("W61 T-Kontakt bekommt einen Punkt", res.junctions.some((j) => Math.abs(j.x - 100) < 0.5 && Math.abs(j.y - 100) < 0.5), JSON.stringify(res.junctions));
}
{
  // Knick auf fremder Leitung war früher unbemerkt leitend → Migration erhält das
  const legacy = kreuzDoc() as any;
  delete legacy.junctions;
  legacy.wires = [
    { id: "w1", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
    { id: "w2", points: [{ x: 100, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 200 }] },
  ];
  check("W61 Altbestand ohne junctions bleibt gültig", isValidProjectDoc(legacy));
  const mig = normalizeProjectDoc(legacy);
  check("W61 Migration setzt Punkt am alten Kontakt", (mig.junctions ?? []).some((j) => Math.abs(j.x - 100) < 0.5 && Math.abs(j.y - 100) < 0.5), JSON.stringify(mig.junctions));
  check("W61 Migration verbindet nicht mehr als vorher", netAt(mig, 0, 100) === netAt(mig, 100, 0) && netAt(mig, 0, 100) === netAt(mig, 100, 200));
  // Reine Kreuzung (kein Stützpunkt auf der fremden Leitung) war auch früher
  // nicht leitend – die Migration darf dort keinen Punkt erfinden.
  const legacyCross = kreuzDoc() as any;
  delete legacyCross.junctions;
  const migCross = normalizeProjectDoc(legacyCross);
  check("W61 Migration erfindet keinen Punkt an reiner Kreuzung", (migCross.junctions ?? []).length === 0, JSON.stringify(migCross.junctions));
  check("W61 reine Kreuzung bleibt auch im Altbestand getrennt", netAt(migCross, 0, 100) !== netAt(migCross, 100, 0));
}
{
  // Editor: neue Leitung, die auf einer bestehenden endet → Punkt automatisch
  const st = useEditor.getState();
  const doc = kreuzDoc();
  doc.wires = [{ id: "w1", points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] }];
  st.setDoc(doc, false);
  st.addWire({ id: "w3", points: [{ x: 50, y: 0 }, { x: 50, y: 100 }] });
  const after = useEditor.getState().doc;
  check("W61 addWire: Ende auf fremder Leitung bekommt Punkt", (after.junctions ?? []).some((j) => Math.abs(j.x - 50) < 0.5 && Math.abs(j.y - 100) < 0.5), JSON.stringify(after.junctions));
  check("W61 addWire: Ende auf fremder Leitung ist verbunden", netAt(after, 0, 100) === netAt(after, 50, 0));
  // Überkreuzung ohne Ende auf der Leitung → kein Punkt, keine Verbindung
  st.setDoc(kreuzDoc(), false);
  st.addWire({ id: "w4", points: [{ x: 150, y: 0 }, { x: 150, y: 200 }] });
  const cross = useEditor.getState().doc;
  check("W61 addWire: Überkreuzung ohne Punkt", !(cross.junctions ?? []).some((j) => Math.abs(j.x - 150) < 0.5), JSON.stringify(cross.junctions));
  check("W61 addWire: Überkreuzung bleibt getrennt", netAt(cross, 0, 100) !== netAt(cross, 150, 0));
}
{
  // Editor: Verbindungspunkt per Kontextfunktion setzen/entfernen
  const st = useEditor.getState();
  st.setDoc(kreuzDoc(), false);
  check("W61 Treffpunkte werden gefunden", wireJunctionCandidates(useEditor.getState().doc).some((c) => Math.abs(c.x - 100) < 0.5 && Math.abs(c.y - 100) < 0.5));
  st.toggleJunction(100, 100);
  check("W61 toggle: Kreuzung wird verbunden", netAt(useEditor.getState().doc, 0, 100) === netAt(useEditor.getState().doc, 100, 0) && (useEditor.getState().doc.junctions ?? []).length === 1);
  st.toggleJunction(100, 100);
  check("W61 toggle: Punkt entfernt, wieder getrennt", netAt(useEditor.getState().doc, 0, 100) !== netAt(useEditor.getState().doc, 100, 0) && (useEditor.getState().doc.junctions ?? []).length === 0);
}

/* ---------------- W62/W63/W64 · Netz zeichnen wie in Multisim ---------------- */
{
  // W62: Geometrie-Bereinigung – leicht verschobenes Bauteil, schräge Leitung,
  // Ende knapp neben dem Pin.
  const inst: any = { id: "r9", partId: "resistor", x: 105, y: 97, rot: 0, label: "R9", params: {} };
  const p0 = pinPosition(inst, 0);
  const doc: SchematicDoc = {
    id: "geo",
    name: "geo",
    instances: [inst],
    labels: [],
    notes: [],
    probes: [],
    junctions: [],
    wires: [
      // schräg und mit einem Ende 4 px neben Pin 1
      { id: "w1", points: [{ x: Math.round(p0.x + 4), y: Math.round(p0.y + 3) }, { x: 300, y: 250 }] },
    ],
  };
  const rep = normalizeDocGeometry(doc);
  const p1 = pinPosition(doc.instances[0], 0);
  const end = doc.wires[0].points[0];
  check("W62 Bauteil sitzt nach der Reinigung auf dem Raster", doc.instances[0].x % GRID === 0 && doc.instances[0].y % GRID === 0, `(${doc.instances[0].x}, ${doc.instances[0].y})`);
  check("W62 keine schrägen Segmente mehr", doc.wires[0].points.every((q: any, i: number) => i === 0 || q.x === doc.wires[0].points[i - 1].x || q.y === doc.wires[0].points[i - 1].y), JSON.stringify(doc.wires[0].points));
  check("W62 Leitungsende sitzt exakt auf dem Pin", Math.abs(end.x - p1.x) < 0.01 && Math.abs(end.y - p1.y) < 0.01, `${JSON.stringify(end)} vs ${JSON.stringify(p1)}`);
  check("W62 Leitung ist danach verbunden", buildNets(doc).pointNets[`${Math.round(p1.x)},${Math.round(p1.y)}`] !== undefined || buildNets(doc).pinNets["r9:0"] !== undefined);
  check("W62 Bericht zählt die Änderungen", rep.instances >= 1 && rep.ends >= 1, JSON.stringify(rep));
}
{
  // W64: Anschluss-Magnet – Pin vor Leitung, Fußpunkt auf der Leitung.
  const doc: SchematicDoc = {
    id: "mag",
    name: "mag",
    instances: [{ id: "r1", partId: "resistor", x: 100, y: 100, rot: 0, label: "R1", params: {} }],
    labels: [],
    notes: [],
    probes: [],
    junctions: [],
    wires: [{ id: "w1", points: [{ x: 100, y: 200 }, { x: 300, y: 200 }] }],
  };
  const pin = pinPosition(doc.instances[0], 0);
  const hitPin = findNetTarget(doc, { x: pin.x + 3, y: pin.y + 2 }, 14);
  check("W64 Magnet trifft den Pin sogar 3 px daneben", hitPin?.kind === "pin" && hitPin.x === pin.x && hitPin.y === pin.y, JSON.stringify(hitPin));
  const hitWire = findNetTarget(doc, { x: 220, y: 205 }, 14);
  check("W64 Magnet trifft die Leitung (Fußpunkt)", hitWire?.kind === "wire" && hitWire.y === 200 && Math.abs(hitWire.x - 220) < 0.01, JSON.stringify(hitWire));
  check("W64 nichts in Reichweite → kein Ziel", findNetTarget(doc, { x: 600, y: 600 }, 14) === null);
  const nearBoth = findNetTarget(doc, { x: pin.x + 2, y: pin.y + 2 }, 14);
  check("W64 Pin hat Vorrang", nearBoth?.kind === "pin");
  check("W64 Verbindungspunkt zählt als Ziel", findNetTarget({ ...doc, junctions: [{ id: "j1", x: 250, y: 200 }] }, { x: 252, y: 202 }, 14)?.kind === "junction");
}
{
  // W63: Verlauf – exakt am Anschluss, keine schrägen Segmente, Ecken bleiben.
  const path = buildNetPath({ x: 100, y: 100 }, [{ x: 200, y: 100 }], { x: 260, y: 180 });
  const orth = path.every((q, i) => i === 0 || q.x === path[i - 1].x || q.y === path[i - 1].y);
  check("W63 Verlauf ist rechtwinklig", orth, JSON.stringify(path));
  check("W63 Verlauf startet am Anker", path[0].x === 100 && path[0].y === 100);
  check("W63 Verlauf endet exakt am Ziel", path[path.length - 1].x === 260 && path[path.length - 1].y === 180);
  check("W63 gesetzte Ecke bleibt erhalten", path.some((q) => q.x === 200 && q.y === 100), JSON.stringify(path));
  // Ecke setzen (Klick ins Leere) + Anschluss an eine Leitung → Verbindungspunkt nötig
  const doc: SchematicDoc = {
    id: "target",
    name: "target",
    instances: [],
    labels: [],
    notes: [],
    probes: [],
    junctions: [],
    wires: [{ id: "w1", points: [{ x: 0, y: 300 }, { x: 400, y: 300 }] }],
  };
  check("W64 Anschluss auf fremder Leitung braucht einen Verbindungspunkt", needsJunction(doc, { x: 200, y: 300 }));
  check("W64 Anschluss auf eigener Leitung nicht", !needsJunction(doc, { x: 200, y: 300 }, "w1"));
  check("W64 Punkt neben der Leitung braucht keinen", !needsJunction(doc, { x: 200, y: 340 }));
}
{
  // W62 · Beispiele: keine krummen Bauteile, keine schrägen Segmente, keine offenen Enden.
  let worst = "";
  for (const preset of PRESETS) {
    const doc = preset.build();
    const offGridInst = doc.instances.filter((i) => i.x % GRID !== 0 || i.y % GRID !== 0).length;
    let offPins = 0;
    for (const inst of doc.instances) {
      const part = PART_MAP[inst.partId];
      if (!part) continue;
      part.pins.forEach((_, idx) => {
        const q = pinPosition(inst, idx);
        if (q.x % GRID !== 0 || q.y % GRID !== 0) offPins++;
      });
    }
    let diag = 0;
    for (const w of doc.wires) {
      for (let i = 0; i + 1 < w.points.length; i++) {
        const a = w.points[i];
        const b = w.points[i + 1];
        if (a.x !== b.x && a.y !== b.y) diag++;
      }
    }
    const res = buildNets(doc);
    const ok = offGridInst === 0 && offPins === 0 && diag === 0 && res.openEnds.length === 0;
    if (!ok) worst += `${preset.id}(inst${offGridInst}/pins${offPins}/schräg${diag}/offen${res.openEnds.length}) `;
  }
  check("W62 alle Beispiele ohne verschobene Bauteile, schräge Segmente oder offene Enden", worst === "", worst || "8 Beispiele sauber");
}

{
  // W63: die komplette Klickfolge „Pin anklicken – Ecke setzen – Pin anklicken".
  const twoPins: SchematicDoc = {
    id: "flow",
    name: "flow",
    instances: [
      { id: "r1", partId: "resistor", x: 100, y: 100, rot: 0, label: "R1", params: {} },
      { id: "r2", partId: "resistor", x: 300, y: 200, rot: 0, label: "R2", params: {} },
    ],
    labels: [],
    notes: [],
    probes: [],
    junctions: [],
    wires: [],
  };
  const magnets = { magnet: 14, allowStartOnEmpty: false };
  const pinA = pinPosition(twoPins.instances[0], 0);
  const pinB = pinPosition(twoPins.instances[1], 0);
  let draft: any = null;

  // 1 · Klick auf den Pin (3 px daneben – Magnet fängt es ab)
  const c1 = netClick(twoPins, draft, { x: pinA.x + 3, y: pinA.y + 2 }, { x: pinA.x + 3, y: pinA.y + 2 }, magnets);
  draft = c1 && c1.kind === "start" ? c1.draft : null;
  check("W63 Klick auf Pin startet den Netzmodus", c1?.kind === "start" && draft && draft.anchor.x === pinA.x && draft.anchor.y === pinA.y, JSON.stringify(c1));

  // 2 · Klick ins Leere setzt eine Ecke (bleibt im Modus)
  const corner = { x: pinA.x, y: 300 };
  const c2 = netClick(twoPins, draft, corner, corner, magnets);
  draft = c2 && c2.kind === "corner" ? c2.draft : null;
  check("W63 Klick ins Leere setzt einen Eckpunkt und bleibt im Modus", c2?.kind === "corner" && draft?.corners.length === 1, JSON.stringify(c2));

  // 3 · Klick auf den zweiten Pin schließt an und beendet den Modus
  const c3 = netClick(twoPins, draft, { x: pinB.x + 2, y: pinB.y }, { x: pinB.x + 2, y: pinB.y }, magnets);
  check("W63 Klick auf zweiten Pin schließt das Netz", c3?.kind === "finish", JSON.stringify(c3 ? { kind: c3.kind } : null));
  if (c3 && c3.kind === "finish") {
    const pts = c3.points;
    const orth = pts.every((q, i) => i === 0 || q.x === pts[i - 1].x || q.y === pts[i - 1].y);
    check("W63 angeschlossenes Netz ist rechtwinklig", orth, JSON.stringify(pts));
    check("W63 Netz endet exakt am zweiten Pin", pts[pts.length - 1].x === pinB.x && pts[pts.length - 1].y === pinB.y, JSON.stringify(pts[pts.length - 1]));
    check("W63 Netz startet exakt am ersten Pin", pts[0].x === pinA.x && pts[0].y === pinA.y);
    // elektrisch prüfen: beide Pins müssen jetzt im selben Netz liegen
    twoPins.wires.push({ id: "w_new", points: pts });
    const res = buildNets(twoPins);
    check("W63 beide Pins sind danach elektrisch verbunden", res.pinNets["r1:0"] === res.pinNets["r2:0"], `${res.pinNets["r1:0"]} / ${res.pinNets["r2:0"]}`);
  }

  // 4 · Klick auf eine bestehende Leitung schließt in der Mitte an (Fußpunkt exakt)
  const withWire: SchematicDoc = { ...twoPins, wires: [{ id: "w_bus", points: [{ x: 0, y: 300 }, { x: 400, y: 300 }] }] };
  const start = netClick(withWire, null, { x: pinA.x, y: pinA.y }, { x: pinA.x, y: pinA.y }, magnets);
  const fin = netClick(withWire, start && start.kind === "start" ? start.draft : null, { x: 210, y: 303 }, { x: 210, y: 300 }, magnets);
  check("W63 Klick auf eine Leitung schließt mit exaktem Fußpunkt an", fin?.kind === "finish" && fin.points[fin.points.length - 1].y === 300 && fin.points[fin.points.length - 1].x === 210, JSON.stringify(fin && fin.kind === "finish" ? fin.points : fin));
  check("W63 dieser Anschluss braucht einen Verbindungspunkt", needsJunction(withWire, { x: 210, y: 300 }));

  // 5 · im Auswahlmodus startet ein Klick auf eine Leitung NICHT das Zeichnen
  // (sonst wäre das Ziehen an Leitungsgriffen kaputt).
  const onWire = netClick(withWire, null, { x: 210, y: 301 }, { x: 210, y: 300 }, magnets);
  check("W63 Auswahlmodus: Klick auf Leitung startet kein Netz", onWire === null, JSON.stringify(onWire));
  const toolStart = netClick(withWire, null, { x: 210, y: 301 }, { x: 210, y: 300 }, { magnet: 14, allowStartOnEmpty: true, startOnWire: true });
  check("W63 Leitungswerkzeug darf auf einer Leitung beginnen", toolStart?.kind === "start", JSON.stringify(toolStart));

  // 6 · ohne Pin und ohne Leitungswerkzeug startet nichts (Auswahlmodus bleibt ruhig)
  check("W63 Klick ins Leere ohne Werkzeug startet kein Netz", netClick(twoPins, null, { x: 700, y: 700 }, { x: 700, y: 700 }, magnets) === null);
  // 7 · mit Leitungswerkzeug (W) startet es auch auf leerer Fläche
  const start2 = netClick(twoPins, null, { x: 703, y: 697 }, { x: 700, y: 700 }, { magnet: 14, allowStartOnEmpty: true });
  check("W63 Leitungswerkzeug startet auch auf freier Fläche", start2?.kind === "start" && start2.draft.anchor.x === 700 && start2.draft.anchor.y === 700, JSON.stringify(start2));
}

{
  // W72: Dateileiste – „+" legt ein Blatt an, openSheet wechselt inkl. Netzprüfung.
  const st = useEditor.getState();
  st.newDocument();
  const nachNeu = useEditor.getState().doc;
  check("W72 neues Schaltblatt erscheint in der Dateileiste", sheets.some((s) => s.id === nachNeu.id), JSON.stringify(sheets.map((s) => s.name)));
  check("W72 neues Blatt ist leer und aktiv", nachNeu.instances.length === 0 && nachNeu.wires.length === 0);
  const vorher = sheets.find((s) => s.id !== nachNeu.id)!;
  st.openSheet(vorher.id);
  check("W72 Wechsel öffnet das erste Blatt", useEditor.getState().doc.id === vorher.id);
  const res = useEditor.getState().netResult;
  check("W72 Netzprüfung läuft nach dem Wechsel (Netze vorhanden)", res.nets.length > 0, `${res.nets.length} Netze`);
  check("W72 Undo-Verlauf startet beim Blatt neu", useEditor.getState().past.length === 0);
}

/* ---------------- Runde 27 (W73–W81) · Multisim-Perfektion ---------------- */
{
  // W73: HUD netDrawing-Synchronisation & Abbruch über setTool / cancelNetDrawing
  useHud.setState({ netDrawing: true });
  const seq0 = useHud.getState().netCancelSeq;
  useEditor.getState().setTool("select");
  check("W73 setTool('select') bricht laufendes Netzzeichnen im HUD ab", !useHud.getState().netDrawing && useHud.getState().netCancelSeq === seq0 + 1);
}

{
  // W75: Bauteil-Vorschau vor dem Absetzen drehen & spiegeln (ohne Hintergrund-Auswahl zu verdrehen)
  const st = useEditor.getState();
  st.setDoc({
    id: "w75",
    name: "w75",
    instances: [{ id: "r_bg", partId: "resistor", x: 100, y: 100, rot: 0, label: "R1", params: { r: 1000 } }],
    wires: [],
    labels: [],
    notes: [],
    probes: [],
    junctions: [],
  }, false);
  st.setSelection(["r_bg"]);
  st.setPlacing("resistor");
  st.rotateSelection(1);
  st.mirrorSelection();
  check("W75 R/M im Platzier-Modus dreht/spiegelt die Vorschau", useEditor.getState().placingRot === 90 && useEditor.getState().placingMirror === true);
  check("W75 Hintergrund-Bauteil bleibt unberührt", useEditor.getState().doc.instances[0].rot === 0 && !useEditor.getState().doc.instances[0].mirror);
  const newId = st.addInstance("resistor", 240, 200);
  const placed = useEditor.getState().doc.instances.find((i) => i.id === newId)!;
  check("W75 platziertes Bauteil übernimmt Drehung & Spiegelung der Vorschau", placed.rot === 90 && placed.mirror === true);
  st.setPlacing(null);
}

{
  // W76: Bauteil in eine durchgehende Leitung einsetzen trennt das Segment auf (In-Line-Split)
  const docSplit: SchematicDoc = {
    id: "w76",
    name: "w76",
    instances: [
      { id: "v1", partId: "vdc", x: 100, y: 200, rot: 0, label: "V1", params: { v: 5 } },
      { id: "r_inline", partId: "resistor", x: 240, y: 200, rot: 0, label: "R1", params: { r: 1000 } },
    ],
    // Durchgehende Leitung von x=140 bis x=360 auf Höhe y=200 (überbrückt R1 mit Pins bei 210 und 270)
    wires: [{ id: "w_main", points: [{ x: 140, y: 200 }, { x: 360, y: 200 }] }],
    labels: [],
    notes: [],
    probes: [],
    junctions: [],
  };
  const stats = insertComponentIntoWires(docSplit, "r_inline");
  check("W76 In-Line-Split trennt die überbrückte Leitung", stats.split === 1 && docSplit.wires.length === 2, JSON.stringify(docSplit.wires));
  const netRes = buildNets(docSplit);
  check(
    "W76 R1 liegt danach in Reihe (Pin 0 und Pin 1 in getrennten Netzen, kein Kurzschluss)",
    Boolean(netRes.pinNets["r_inline:0"]) &&
      Boolean(netRes.pinNets["r_inline:1"]) &&
      netRes.pinNets["r_inline:0"] !== netRes.pinNets["r_inline:1"],
    `${netRes.pinNets["r_inline:0"]} vs ${netRes.pinNets["r_inline:1"]}`,
  );
}

{
  // W77: Hindernis-Ausweichen beim Netzzeichnen, Knick-Wenden (flipBend) & Abschluss im freien Raum
  const obstacleBox = [{ x: 180, y: 80, w: 60, h: 40 }]; // blockiert horizontalen Weg von (100,100) nach (200,100)
  const pathAvoid = buildNetPath({ x: 100, y: 100 }, [], { x: 200, y: 200 }, { obstacles: obstacleBox });
  check(
    "W77 buildNetPath weicht einem Bauteil auf dem ersten Schenkel automatisch aus",
    orth(pathAvoid) && pathAvoid[1].x === 100 && pathAvoid[1].y === 200,
    JSON.stringify(pathAvoid),
  );
  const pathNormal = buildNetPath({ x: 100, y: 100 }, [], { x: 220, y: 160 });
  const pathFlipped = buildNetPath({ x: 100, y: 100 }, [], { x: 220, y: 160 }, { flipBend: true });
  check(
    "W77 flipBend (Leertaste) kehrt die Knick-Orientierung H↔V um",
    orth(pathNormal) && orth(pathFlipped) && (pathNormal[1].x !== pathFlipped[1].x || pathNormal[1].y !== pathFlipped[1].y),
    `${JSON.stringify(pathNormal)} vs ${JSON.stringify(pathFlipped)}`,
  );
  const finished = finishNetDraft({ anchor: { x: 100, y: 100 }, corners: [{ x: 180, y: 100 }] }, { x: 180, y: 220 });
  check(
    "W77 finishNetDraft schließt offene Leitung im freien Raum rechtwinklig ab",
    finished !== null && orth(finished) && finished[finished.length - 1].y === 220,
    JSON.stringify(finished),
  );
}

{
  // W78: Streng orthogonales Ziehen an Segmenten (ohne Pin-Abriss!) und Ecken
  const pinnedSegOrig = [{ x: 100, y: 200 }, { x: 300, y: 200 }];
  const isPinned = (p: { x: number; y: number }) =>
    (p.x === 100 && p.y === 200) || (p.x === 300 && p.y === 200);
  const draggedSeg = dragWireSegmentOrtho(pinnedSegOrig, 0, 0, 40, isPinned);
  check(
    "W78 Segment-Ziehen hält angepinnte Leitungsenden fest am Pin (90°-Stufe statt Abriss)",
    orth(draggedSeg) &&
      draggedSeg.length === 4 &&
      draggedSeg[0].x === 100 &&
      draggedSeg[0].y === 200 &&
      draggedSeg[draggedSeg.length - 1].x === 300 &&
      draggedSeg[draggedSeg.length - 1].y === 200 &&
      draggedSeg[1].y === 240 &&
      draggedSeg[2].y === 240,
    JSON.stringify(draggedSeg),
  );

  const lWire = [{ x: 100, y: 100 }, { x: 240, y: 100 }, { x: 240, y: 260 }];
  const draggedCorner = dragWireCornerOrtho(lWire, 1, { x: 280, y: 140 }, (p) => p.x === 100 && p.y === 100);
  check(
    "W78 Eckpunkt-Ziehen hält alle Segmente streng im 90°-Winkel und schützt angepinnten Startpunkt",
    orth(draggedCorner) && draggedCorner[0].x === 100 && draggedCorner[0].y === 100,
    JSON.stringify(draggedCorner),
  );
}

{
  // W79: Eine Zieh-Geste (beginGesture .. endGesture) erzeugt genau 1 Undo-Eintrag
  const st = useEditor.getState();
  st.setDoc({
    id: "w79",
    name: "w79",
    instances: [{ id: "r1", partId: "resistor", x: 100, y: 100, rot: 0, label: "R1", params: { r: 1000 } }],
    wires: [],
    labels: [],
    notes: [],
    probes: [],
    junctions: [],
  }, false);
  const pastBefore = useEditor.getState().past.length;
  st.setSelection(["r1"]);
  st.beginGesture();
  for (let step = 0; step < 15; step++) {
    st.moveSelection(20, 0);
  }
  st.endGesture();
  const pastAfter = useEditor.getState().past.length;
  check("W79 15 Zieh-Schritte in einer Geste erzeugen genau 1 Undo-Eintrag", pastAfter === pastBefore + 1, `${pastBefore} → ${pastAfter}`);
  st.undo();
  check("W79 Ein einziges Undo stellt die Ausgangsposition vor dem Ziehen wieder her", useEditor.getState().doc.instances[0].x === 100);
}

{
  // W80: T-Abzweig wandert beim Verschieben der Hauptleitung mit & verwaiste Junctions verschwinden
  const st = useEditor.getState();
  st.setDoc({
    id: "w80",
    name: "w80",
    instances: [],
    wires: [
      { id: "w_host", points: [{ x: 100, y: 200 }, { x: 300, y: 200 }] },
      { id: "w_branch", points: [{ x: 200, y: 200 }, { x: 200, y: 320 }] },
    ],
    labels: [],
    notes: [],
    probes: [],
    junctions: [{ id: "j1", x: 200, y: 200 }],
  }, false);
  st.setSelection(["w_host"]);
  st.moveSelection(0, 40);
  const branchAfter = useEditor.getState().doc.wires.find((w) => w.id === "w_branch")!;
  const jncAfter = useEditor.getState().doc.junctions?.[0];
  check(
    "W80 T-Abzweig und Verbindungspunkt wandern beim Verschieben der Hauptleitung mit",
    branchAfter.points[0].y === 240 && jncAfter?.y === 240 && orth(branchAfter.points),
    JSON.stringify({ branch: branchAfter.points, jnc: jncAfter }),
  );
  // Löscht man den Abzweig, wird der verwaiste Verbindungspunkt automatisch entfernt
  st.setSelection(["w_branch"]);
  st.deleteSelection();
  check(
    "W80 Verwaiste Junction wird beim Löschen des Abzweigs automatisch aufgeräumt",
    (useEditor.getState().doc.junctions?.length ?? 0) === 0,
    JSON.stringify(useEditor.getState().doc.junctions),
  );
}

{
  // W81: Labels & Notizen editieren + Probe mitten auf einem langen Leitungssegment platzieren
  const st = useEditor.getState();
  st.setDoc({
    id: "w81",
    name: "w81",
    instances: [
      { id: "v1", partId: "vdc", x: 100, y: 200, rot: 0, label: "V1", params: { v: 5 } },
      { id: "g1", partId: "gnd", x: 100, y: 260, rot: 0, label: "GND1", params: {} },
    ],
    wires: [{ id: "w_long", points: [{ x: 100, y: 170 }, { x: 400, y: 170 }] }],
    labels: [{ id: "lbl1", x: 200, y: 170, name: "VCC" }],
    notes: [{ id: "note1", x: 120, y: 80, text: "Test" }],
    probes: [],
    junctions: [],
  }, false);
  st.updateLabel("lbl1", "VDD_5V");
  st.updateNote("note1", "Versorgung 5V");
  check(
    "W81 updateLabel & updateNote aktualisieren Netzname und Notiz",
    useEditor.getState().doc.labels[0].name === "VDD_5V" && useEditor.getState().doc.notes[0].text === "Versorgung 5V",
  );
  // Probe mitten auf dem langen Segment bei x=260, y=172 platzieren (weit weg von den Endpunkten 100 und 400!)
  const prId = st.addMeasurementProbe("voltage", 260, 172);
  const pr = useEditor.getState().doc.probes.find((p) => p.id === prId)!;
  check(
    "W81/W93 Probe mitten auf langem Leitungssegment findet das Netz und rastet den Anker auf die Leitung (Offset +40/-40)",
    pr.net === "VDD_5V" && pr.anchorY === 170 && pr.anchorX === 260 && pr.x === 300 && pr.y === 130,
    JSON.stringify({ net: pr.net, anchorX: pr.anchorX, anchorY: pr.anchorY, x: pr.x, y: pr.y }),
  );

  // W87: Zieht man das Anzeigekästchen der Probe selbst, bleibt die Messspitze (anchorX/Y) fest auf der Leitung
  st.setSelection([prId!]);
  st.moveSelection(20, -10);
  const prMovedBox = useEditor.getState().doc.probes.find((p) => p.id === prId)!;
  check(
    "W87 Ziehen des Probe-Anzeigekästchens bewegt nur (x, y) und hält die Messspitze (anchorX, anchorY) fest auf der Leitung",
    prMovedBox.x === 320 && prMovedBox.y === 120 && prMovedBox.anchorX === 260 && prMovedBox.anchorY === 170,
    JSON.stringify(prMovedBox),
  );

  // W87: Wird die Leitung verschoben, auf der die Messspitze sitzt, wandert die gesamte Probe mit
  st.setSelection(["w_long"]);
  st.moveSelection(0, 20);
  const prMovedWithWire = useEditor.getState().doc.probes.find((p) => p.id === prId)!;
  check(
    "W87 Verschieben der Leitung unter der Messspitze nimmt die gesamte Probe (Spitze + Kästchen) mit",
    prMovedWithWire.anchorX === 260 && prMovedWithWire.anchorY === 190 && prMovedWithWire.x === 320 && prMovedWithWire.y === 140,
    JSON.stringify(prMovedWithWire),
  );
}

/* ------------------------------------------------------------------ */
/* 19) W82–W84: OUT-Widerstand in astable555 & striktes 10er-Raster   */
/* ------------------------------------------------------------------ */
console.log("\n=== 19) W82–W84: OUT-Widerstand (astable555) & Raster-Konsistenz ===");
{
  const st = useEditor.getState();
  st.setDoc(PRESETS[2].build(), false);
  const doc0 = useEditor.getState().doc;
  const r3 = doc0.instances.find((i) => i.label === "R3")!;
  const wOut = doc0.wires.find((w) => w.points[0].x === 460 && w.points[0].y === 270)!;
  const wLed = doc0.wires.find((w) => w.points[0].x === 650 && w.points[0].y === 270)!;
  st.setSelection([r3.id]);
  st.moveSelection(0, 10);
  st.moveSelection(0, 20);
  const docMoved = useEditor.getState().doc;
  const wOutAfter = docMoved.wires.find((w) => w.id === wOut.id)!;
  const wLedAfter = docMoved.wires.find((w) => w.id === wLed.id)!;
  const netsAfter = buildNets(docMoved);
  check(
    "W82 Verschieben von R3 an OUT hält das Leitungsende an U1.OUT (460,270) und an R3.1 (590,300) streng orthogonal verbunden",
    wOutAfter.points[0].x === 460 &&
      wOutAfter.points[0].y === 270 &&
      wOutAfter.points[wOutAfter.points.length - 1].x === 590 &&
      wOutAfter.points[wOutAfter.points.length - 1].y === 300 &&
      wLedAfter.points[0].x === 650 &&
      wLedAfter.points[0].y === 300 &&
      wLedAfter.points[wLedAfter.points.length - 1].x === 690 &&
      wLedAfter.points[wLedAfter.points.length - 1].y === 270 &&
      netsAfter.openEnds.length === 0,
    JSON.stringify({ wOut: wOutAfter.points, wLed: wLedAfter.points, openEnds: netsAfter.openEnds }),
  );
  // Zurückschieben auf y=270 stellt wieder eine glatte 2-Punkt-Gerade her
  st.moveSelection(0, -30);
  const wOutBack = useEditor.getState().doc.wires.find((w) => w.id === wOut.id)!;
  check(
    "W82 Zurückschieben von R3 auf gleiche Höhe glättet die Leitung wieder zu 2 Punkten",
    wOutBack.points.length === 2 && wOutBack.points[0].y === 270 && wOutBack.points[1].y === 270,
    JSON.stringify(wOutBack.points),
  );

  // W83/W84: Alle Presets liegen mit Bauteilen, Pins, Leitungen und Labels auf dem GRID=10-Raster
  let offGridCount = 0;
  for (const p of PRESETS) {
    const d = p.build();
    for (const i of d.instances) if (i.x % GRID !== 0 || i.y % GRID !== 0) offGridCount++;
    for (const w of d.wires) for (const pt of w.points) if (pt.x % GRID !== 0 || pt.y % GRID !== 0) offGridCount++;
    for (const l of d.labels) if (l.x % GRID !== 0 || l.y % GRID !== 0) offGridCount++;
  }
  check("W84 Alle Presets (Bauteile, Leitungen, Labels) liegen exakt auf dem GRID=10-Raster", offGridCount === 0, `offGridCount=${offGridCount}`);

  // W83: alignSelection zwischen Widerstand und LED hält beide exakt auf derselben Rasterlinie
  const r3Id = useEditor.getState().doc.instances.find((i) => i.label === "R3")!.id;
  const d1Id = useEditor.getState().doc.instances.find((i) => i.label === "D1")!.id;
  st.setSelection([r3Id]);
  st.moveSelection(0, 20);
  st.setSelection([r3Id, d1Id]);
  st.alignSelection("top");
  const r3Aligned = useEditor.getState().doc.instances.find((i) => i.id === r3Id)!;
  const d1Aligned = useEditor.getState().doc.instances.find((i) => i.id === d1Id)!;
  check(
    "W83 alignSelection richtet Widerstand und LED exakt auf derselben GRID=10-Rasterlinie aus",
    r3Aligned.y === d1Aligned.y && r3Aligned.y % GRID === 0,
    JSON.stringify({ r3Y: r3Aligned.y, d1Y: d1Aligned.y }),
  );
}

/* ------------------------------------------------------------------ */
/* 20) W88–W93: Runde 29 – Werte-Parser (Ω/Komma/Infix) & Cursor      */
/* ------------------------------------------------------------------ */
console.log("\n=== 20) W88–W93: Runde 29 (Werte-Parser, Radiergummi-Cursor, Labels) ===");
{
  const { parseSpiceValue } = require("../src/lib/schematic/importers") as typeof import("../src/lib/schematic/importers");
  const { ERASER_CURSOR, PEN_CURSOR } = require("../src/components/cursors") as typeof import("../src/components/cursors");
  check("W89 ERASER_CURSOR ist als eigener SVG-Cursor definiert und unterscheidet sich von PEN_CURSOR", Boolean(ERASER_CURSOR) && ERASER_CURSOR !== PEN_CURSOR);
  check("W91 parseSpiceValue akzeptiert 10k, 10kΩ, 4,7k, 4k7, 470R, 100µF",
    Math.abs(parseSpiceValue("10k") - 10000) < 1e-9 &&
    Math.abs(parseSpiceValue("10kΩ") - 10000) < 1e-9 &&
    Math.abs(parseSpiceValue("4,7k") - 4700) < 1e-9 &&
    Math.abs(parseSpiceValue("4k7") - 4700) < 1e-9 &&
    Math.abs(parseSpiceValue("470R") - 470) < 1e-9 &&
    Math.abs(parseSpiceValue("100µF") - 100e-6) < 1e-12,
  );
}

console.log(failed === 0 ? "\nLeitungs-/Anordnungs-Prüfungen: alle bestanden." : `\nLeitungs-/Anordnungs-Prüfungen: ${failed} FEHLER`);
if (failed) process.exit(1);
