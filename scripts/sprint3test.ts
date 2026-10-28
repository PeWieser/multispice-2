/**
 * Sprint-3-Regression (Struktur): Busse, Entwürfe, Re-Annotate, ERC,
 * SPICE/KiCad-Import, abhängige Quellen.
 *
 * - S3.1: Bus berühren ≠ verbinden; Tap/Splitter-Namensbindung D[i];
 *   Breiten-Widerspruch + Bit-Überlauf warnen.
 * - S3.2: Reiter sind unabhängige Entwürfe (wechseln erhält Stände).
 * - S3.3: Re-Annotate nummeriert Schema-Labels leserichtig neu, freie bleiben.
 * - S3.4: ERC-Regeln E1–E4 feuern; geteilter Knick warnt (W61-Lücke sichtbar).
 * - S3.5: SPICE-Abdeckung (R/C/L/D/Q/M/J/V/I/E/F/G/H) + KiCad-Minimalimport.
 * - S3.6: Abhängige Quellen als Bibliotheksteile (Abbildung + E-Verstärkung).
 */
import { PART_MAP } from "@/lib/library/catalog";
import { fromKicadSch, fromSpiceNetlist, isKicadSch } from "@/lib/schematic/importers";
import {
  buildNets, emptyDoc, pinPosition, reannotateLabels,
  type Instance, type SchematicDoc,
} from "@/lib/schematic/model";
import { runOperatingPoint } from "@/lib/sim/analyses";
import { applyDoc, sheets, useEditor } from "@/state/editor";

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

let uidN = 0;
const uid = (p: string) => `${p}_s3${uidN++}`;
function inst(partId: string, label: string, x: number, y: number, params: Record<string, number | string | boolean> = {}, rot: Instance["rot"] = 0): Instance {
  return { id: uid("i"), partId, x, y, rot, label, params };
}

/* ---------------- S3.1: Busse ---------------- */
{
  // Bus berühren ≠ verbinden: Drahtende auf Bus-Segment, genau ein Netz + Warnung.
  const doc = emptyDoc("bus-touch");
  doc.wires.push({ id: uid("w"), points: [{ x: 0, y: 100 }, { x: 200, y: 100 }], isBus: true, busName: "D", busWidth: 8 });
  doc.wires.push({ id: uid("w"), points: [{ x: 100, y: 60 }, { x: 100, y: 100 }] });
  const b = buildNets(doc);
  expect(b.nets.length === 1, "S3.1 Bus-Touch bildet kein Netz", `netze=${b.nets.length}`);
  expect(b.warnings.some((w) => /Bus/.test(w)), "S3.1 Bus-Touch warnt", b.warnings.join(" | "));
}
{
  // Tap-Namensbindung: gleiche D[i] verbunden, andere getrennt.
  const doc = emptyDoc("bus-tap");
  const t0 = inst("bus_tap", "T1", 100, 100, { bus: "D", bit: 0 });
  const t0b = inst("bus_tap", "T2", 300, 100, { bus: "D", bit: 0 });
  const t1 = inst("bus_tap", "T3", 500, 100, { bus: "D", bit: 1 });
  doc.instances.push(t0, t0b, t1);
  const r1 = inst("resistor", "R1", 100, 200);
  const r2 = inst("resistor", "R2", 300, 200);
  const r3 = inst("resistor", "R3", 500, 200);
  doc.instances.push(r1, r2, r3);
  for (const [t, r] of [[t0, r1], [t0b, r2], [t1, r3]] as const) {
    const a = pinPosition(t, 0);
    const p = pinPosition(r, 0);
    doc.wires.push({ id: uid("w"), points: [a, { x: a.x, y: p.y }, p] });
  }
  const b = buildNets(doc);
  const n = (i: Instance, p: number) => b.pinNets[`${i.id}:${p}`];
  expect(n(r1, 0) === "D[0]" && n(r2, 0) === "D[0]", "S3.1 Taps D[0] teilen Netz D[0]", `${n(r1, 0)} vs ${n(r2, 0)}`);
  expect(n(r3, 0) === "D[1]", "S3.1 Tap D[1] getrennt", `${n(r3, 0)}`);
}
{
  // Splitter: Bit-Pin i → BUS[i]; Breiten-Widerspruch + Bit-Überlauf warnen.
  const doc = emptyDoc("bus-split");
  const sp = inst("bus_splitter", "T1", 200, 200, { bus: "A", width: 4 });
  doc.instances.push(sp);
  const tap = inst("bus_tap", "T2", 500, 100, { bus: "A", bit: 7 });
  doc.instances.push(tap);
  doc.wires.push({ id: uid("w"), points: [{ x: 0, y: 0 }, { x: 100, y: 0 }], isBus: true, busName: "A", busWidth: 4 });
  doc.wires.push({ id: uid("w"), points: [{ x: 0, y: 40 }, { x: 100, y: 40 }], isBus: true, busName: "A", busWidth: 8 });
  const b = buildNets(doc);
  const names = [1, 2, 3, 4].map((p) => b.pinNets[`${sp.id}:${p}`]);
  expect(names.join(",") === "A[0],A[1],A[2],A[3]", "S3.1 Splitter bindet A[0..3]", names.join(","));
  expect(b.warnings.some((w) => /widerspr/.test(w)), "S3.1 Breiten-Widerspruch warnt", b.warnings.join(" | "));
  expect(b.warnings.some((w) => /bersteigt/.test(w)), "S3.1 Bit-Überlauf warnt", b.warnings.join(" | "));
}

/* ---------------- S3.2: Entwürfe ---------------- */
{
  const before = sheets.length;
  useEditor.getState().newDocument();
  const idA = useEditor.getState().doc.id;
  const docA = { ...useEditor.getState().doc, instances: [inst("resistor", "R1", 100, 100)] };
  useEditor.getState().setDoc(docA, false);
  useEditor.getState().newDocument();
  const idB = useEditor.getState().doc.id;
  expect(idA !== idB, "S3.2 zwei Entwürfe, zwei IDs");
  expect(useEditor.getState().doc.instances.length === 0, "S3.2 neuer Entwurf startet leer");
  useEditor.getState().openSheet(idA);
  const back = useEditor.getState().doc;
  expect(back.instances.length === 1 && back.instances[0].label === "R1", "S3.2 Wechsel erhält Stand A");
  useEditor.getState().openSheet(idB);
  expect(useEditor.getState().doc.instances.length === 0, "S3.2 Entwurf B unberührt von A");
  // aufräumen: Test-Reiter schließen
  for (let i = sheets.length - 1; i >= before; i--) sheets.splice(i, 1);
  applyDoc(emptyDoc("leer"), { pushHistory: false });
}

/* ---------------- S3.3: Re-Annotate ---------------- */
{
  const doc = emptyDoc("reann");
  doc.instances.push(
    inst("resistor", "R5", 0, 100),
    inst("resistor", "R9", 0, 0),
    inst("capacitor", "C3", 200, 0),
    inst("resistor", "R_SENSE", 400, 0),
  );
  const r = reannotateLabels(doc);
  const labels = doc.instances.map((i) => i.label).sort();
  expect(r.renumbered === 3, "S3.3 drei Schema-Labels neu", `renumbered=${r.renumbered}`);
  expect(labels.join(",") === "C1,R1,R2,R_SENSE", "S3.3 leserichtig + frei bleibt", labels.join(","));
  expect(r.kept.includes("R_SENSE"), "S3.3 R_SENSE als behalten gemeldet", r.kept.join(","));
}

/* ---------------- S3.4: ERC ---------------- */
{
  // E1: zwei Spannungsquellen parallel.
  const doc = emptyDoc("erc-e1");
  const v1 = inst("vdc", "V1", 100, 100, { dc: 5 });
  const v2 = inst("vdc", "V2", 220, 100, { dc: 3 });
  doc.instances.push(v1, v2);
  const a = pinPosition(v1, 0);
  const c = pinPosition(v2, 0);
  doc.wires.push({ id: uid("w"), points: [a, c] });
  const b = buildNets(doc);
  expect(b.warnings.some((w) => w.startsWith("ERC E1")), "S3.4 E1 Ausgangs-Kurzschluss", b.warnings.join(" | "));
}
{
  // E2: Netz nur an Eingängen.
  const doc = emptyDoc("erc-e2");
  const u = inst("opamp_ideal", "U1", 100, 100);
  doc.instances.push(u);
  doc.wires.push({ id: uid("w"), points: [pinPosition(u, 0), pinPosition(u, 1)] });
  const b = buildNets(doc);
  expect(b.warnings.some((w) => w.startsWith("ERC E2")), "S3.4 E2 Eingang ohne Treiber", b.warnings.join(" | "));
}
{
  // E3: Versorgung ohne Quelle.
  const doc = emptyDoc("erc-e3");
  const u1 = inst("ne555", "U1", 100, 100);
  const u2 = inst("opamp_ideal", "U2", 400, 100);
  doc.instances.push(u1, u2);
  const a = pinPosition(u1, 7); // VCC
  const c = pinPosition(u2, 3); // V+
  doc.wires.push({ id: uid("w"), points: [a, { x: c.x, y: a.y }, c] });
  const b = buildNets(doc);
  expect(b.warnings.some((w) => w.startsWith("ERC E3")), "S3.4 E3 Versorgung ohne Quelle", b.warnings.join(" | "));
}
{
  // E4: unverbundener Eingang.
  const doc = emptyDoc("erc-e4");
  doc.instances.push(inst("ne555", "U1", 100, 100));
  const b = buildNets(doc);
  expect(b.warnings.some((w) => w.startsWith("ERC E4")), "S3.4 E4 Eingang unverbunden", b.warnings.join(" | "));
}
{
  // S5.9-Nachweis (W61-Fix): geteilter Knick verbindet NICHTS mehr — zwei
  // getrennte Netze, keine Knick-Warnung; mit Dot wieder EIN Netz.
  const doc = emptyDoc("kink");
  doc.wires.push({ id: uid("w"), points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }] });
  doc.wires.push({ id: uid("w"), points: [{ x: 100, y: -50 }, { x: 100, y: 0 }, { x: 200, y: 0 }] });
  const b = buildNets(doc);
  expect(!b.warnings.some((w) => /Knick/.test(w)), "S5.9 keine Knick-Warnung", b.warnings.join(" | "));
  expect(b.pointNets["0,0"] !== b.pointNets["100,-50"], "S5.9 geteilter Knick trennt", JSON.stringify(b.pointNets));
  doc.junctions = [{ id: "j1", x: 100, y: 0 }];
  const bj = buildNets(doc);
  expect(bj.pointNets["0,0"] === bj.pointNets["100,-50"], "S5.9 Dot verbindet Knick", JSON.stringify(bj.pointNets));
}

/* ---------------- S3.5: SPICE ---------------- */
{
  const doc = fromSpiceNetlist(`* sprint3-abdeckung
V1 VIN 0 DC 5
R1 VIN MID 10k
R2 MID 0 10k
C1 MID 0 100n
L1 VIN N1 10u
D1 N1 0 1N4148
Q1 N1 MID 0 2N3904
M1 OUT MID 0 0 NMOS
J1 OJ MID 0 J112
I1 0 N2 DC 1m
E1 EO 0 MID 0 2
F1 0 FO V1 1
G1 0 GO MID 0 0.01
H1 HO 0 V1 1
`);
  const byLabel = (l: string) => doc.instances.find((i) => i.label === l);
  expect(doc.instances.length === 15, "S3.5 SPICE 14 Bauteile + GND", `n=${doc.instances.length}`);
  expect(byLabel("GND")?.partId === "gnd", "S3.5 SPICE GND ergänzt");
  expect(byLabel("R1")?.partId === "resistor" && byLabel("R1")?.params.r === 10000, "S3.5 SPICE R1 10k");
  expect(byLabel("M1")?.partId === "nmos", "S3.5 SPICE M→nmos", `${byLabel("M1")?.partId}`);
  expect(byLabel("J1")?.partId === "jfet_2n3819", "S3.5 SPICE J→jfet", `${byLabel("J1")?.partId}`);
  expect(byLabel("E1")?.partId === "vcvs" && byLabel("E1")?.params.gain === 2, "S3.5 SPICE E→vcvs gain 2");
  expect(byLabel("F1")?.partId === "cccs", "S3.5 SPICE F→cccs", `${byLabel("F1")?.partId}`);
  expect(byLabel("G1")?.partId === "vccs", "S3.5 SPICE G→vccs", `${byLabel("G1")?.partId}`);
  expect(byLabel("H1")?.partId === "ccvs", "S3.5 SPICE H→ccvs", `${byLabel("H1")?.partId}`);
  const b = buildNets(doc);
  const n = (l: string, p: number) => b.pinNets[`${byLabel(l)!.id}:${p}`];
  expect(n("R1", 1) === "MID" && n("R2", 0) === "MID", "S3.5 SPICE MID-Netz", `${n("R1", 1)}/${n("R2", 0)}`);
  expect(n("R2", 1) === "0" && n("C1", 1) === "0", "S3.5 SPICE Masse-Pins", `${n("R2", 1)}/${n("C1", 1)}`);
  expect(!b.warnings.some((w) => /Knick/.test(w)), "S3.5 SPICE-Import ohne geteilte Knicke", b.warnings.join(" | "));
}

/* ---------------- S3.5: KiCad ---------------- */
{
  const kicad = `(kicad_sch (version 20230121) (generator eeschema)
  (lib_symbols
    (symbol "Battery" (symbol "Battery_1_1"
      (pin passive line (at 0 -2.54 90) (length 1.27) (name "+") (number "1"))
      (pin passive line (at 0 2.54 270) (length 1.27) (name "-") (number "2"))))
    (symbol "R" (symbol "R_1_1"
      (pin passive line (at 0 -2.54 90) (length 2.54) (name "1") (number "1"))
      (pin passive line (at 0 2.54 270) (length 2.54) (name "2") (number "2"))))
    (symbol "GND" (power) (symbol "GND_1_1"
      (pin power_in invisible (at 0 0 270) (length 0) (name "GND") (number "1")))))
  (symbol (lib_id "Device:Battery") (at 100 60 0) (unit 1)
    (property "Reference" "V1") (property "Value" "9V"))
  (symbol (lib_id "Device:R") (at 100 80 0) (unit 1)
    (property "Reference" "R1") (property "Value" "10k"))
  (symbol (lib_id "Device:R") (at 100 100 0) (unit 1)
    (property "Reference" "R2") (property "Value" "10k"))
  (symbol (lib_id "power:GND") (at 100 102.54 0) (unit 1)
    (property "Reference" "#PWR01") (property "Value" "GND"))
  (wire (pts (xy 100 57.46) (xy 120 57.46) (xy 120 77.46) (xy 100 77.46)))
  (wire (pts (xy 100 62.54) (xy 80 62.54) (xy 80 102.54) (xy 100 102.54)))
  (wire (pts (xy 100 82.54) (xy 100 97.46)))
  (label "MID" (at 100 90 0)) (label "VPLUS" (at 120 67 0))
)`;
  expect(isKicadSch(kicad), "S3.5 KiCad erkannt");
  const doc = fromKicadSch(kicad);
  const byLabel = (l: string) => doc.instances.find((i) => i.label === l);
  expect(doc.instances.length === 4, "S3.5 KiCad 4 Bauteile", `n=${doc.instances.length}`);
  expect(byLabel("R1")?.rot === 90, "S3.5 KiCad R-Drehung 90", `rot=${byLabel("R1")?.rot}`);
  expect(byLabel("V1")?.params.dc === 9, "S3.5 KiCad V1 9V", `dc=${byLabel("V1")?.params.dc}`);
  const b = buildNets(doc);
  const n = (l: string, p: number) => b.pinNets[`${byLabel(l)!.id}:${p}`];
  const ok = n("V1", 0) === "VPLUS" && n("V1", 1) === "0" && n("R1", 0) === "VPLUS" &&
    n("R1", 1) === "MID" && n("R2", 0) === "MID" && n("R2", 1) === "0" && n("GND", 0) === "0";
  expect(ok, "S3.5 KiCad alle Pin-Netze", `V1:${n("V1", 0)}/${n("V1", 1)} R1:${n("R1", 0)}/${n("R1", 1)} R2:${n("R2", 0)}/${n("R2", 1)}`);
  expect(!b.warnings.some((w) => w.startsWith("ERC E1")), "S3.5 KiCad kein Kurzschluss", b.warnings.join(" | "));
}

/* ---------------- S3.6: Abhängige Quellen ---------------- */
{
  expect(Boolean(PART_MAP["vcvs"] && PART_MAP["vccs"] && PART_MAP["ccvs"] && PART_MAP["cccs"]), "S3.6 E/G/H/F im Katalog");
  const doc: SchematicDoc = emptyDoc("dep");
  const v1 = inst("vdc", "V1", 100, 100, { dc: 1 });
  const e1 = inst("vcvs", "E1", 300, 100, { gain: 2 });
  const r1 = inst("resistor", "R1", 500, 100, { r: 1000 });
  const gnd = inst("gnd", "GND", 500, 200);
  doc.instances.push(v1, e1, r1, gnd);
  const W = (a: { x: number; y: number }, c: { x: number; y: number }) =>
    doc.wires.push({ id: uid("w"), points: [a, { x: c.x, y: a.y }, c] });
  W(pinPosition(v1, 0), pinPosition(e1, 2)); // IN → CTRL+
  W(pinPosition(v1, 1), pinPosition(e1, 3)); // 0 → CTRL-
  W(pinPosition(e1, 0), pinPosition(r1, 0)); // OUT+ → Last
  W(pinPosition(e1, 1), pinPosition(gnd, 0)); // OUT- → GND
  W(pinPosition(r1, 1), pinPosition(gnd, 0)); // Last → GND
  const b = buildNets(doc);
  const dev = b.netlist.devices.find((d) => d.id === "E1");
  expect(dev?.type === "E" && dev.params.gain === 2, "S3.6 vcvs→Device E gain 2", JSON.stringify(dev));
  const op = runOperatingPoint(b.netlist, {});
  const outNet = b.pinNets[`${r1.id}:0`];
  const vout = op.nodes[outNet] ?? NaN;
  expect(op.ok && Math.abs(vout - 2) < 1e-6, "S3.6 E-Folger 1V→2V", `ok=${op.ok} out=${vout}`);
  // G/H/F bilden ab (reine Abbildung, ohne Quelle kein Betrieb).
  const doc2 = emptyDoc("dep-map");
  doc2.instances.push(inst("vccs", "G1", 0, 0, { gain: 0.01 }), inst("ccvs", "H1", 0, 100, { gain: 5 }), inst("cccs", "F1", 0, 200, { gain: 50 }));
  const types = buildNets(doc2).netlist.devices.map((d) => `${d.type}:${d.params.gain}`).sort().join(",");
  expect(types === "F:50,G:0.01,H:5", "S3.6 G/H/F-Abbildung", types);
}

if (failed) {
  console.log(`\nSprint-3-Prüfungen: ${failed} FEHLSCHLÄGE.`);
  process.exit(1);
}
console.log("\nSprint-3-Prüfungen: alle bestanden.");
