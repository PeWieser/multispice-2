/**
 * Runde 23 (W49–W56): Leitungsverlegung + Bauteilanordnung.
 * Läuft ohne DOM über die reinen Modell-/Store-Funktionen.
 *
 * W49 Leitungsenden rasten auf Pins · W50 Router endet exakt am Pin
 * W51 offene Enden/Null-/Doppelleitungen melden · W52 Drehen/Spiegeln reißt nicht ab
 * W53 Verbindungspunkte · W54 Segment verschieben · W55 Ausrichten/Verteilen/Begradigen
 * W56 Überlappungswarnung
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
import { collectPins, reattachWiresToPins, useEditor } from "../src/state/editor";

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

console.log(failed === 0 ? "\nLeitungs-/Anordnungs-Prüfungen: alle bestanden." : `\nLeitungs-/Anordnungs-Prüfungen: ${failed} FEHLER`);
if (failed) process.exit(1);
