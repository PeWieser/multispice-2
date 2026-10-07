/* S6.1: Schaltplan-Innenschaltung — Compiler (Macro-Expansion), Ports,
 * Schachtelung, GND-Passthrough, Legacy-Migration, Validierung.
 * S6.2 (Phase 2): paramLinks, Pin-Ableitung, Editor-Filter, Store-Roundtrip.
 * Run: tsx scripts/subcircuittest.ts (Teil von npm test). */
import { buildNets, pinPosition, Instance, SchematicDoc, Wire } from "../src/lib/schematic/model";
import {
  CustomPartSpec,
  collectPorts,
  compileSchematicToDevices,
  derivePinsFromPorts,
  findSpecCycle,
  isEditorPlaceable,
  migrateSubcircuitToDoc,
  registerCustomPart,
  validatePartSchematic,
} from "../src/lib/library/customParts";
import { useEditor } from "../src/state/editor";
import { runOperatingPoint } from "../src/lib/sim/analyses";
import { PART_MAP } from "../src/lib/library/catalog";

let failed = 0;
function check(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` – ${extra}` : ""}`);
}
function checkNear(name: string, actual: number, expected: number, tol: number) {
  const ok = Number.isFinite(actual) && Math.abs(actual - expected) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: got ${actual} expected ~${expected}`);
}
const inst = (id: string, partId: string, x: number, y: number, params: Record<string, number | string | boolean> = {}, label = ""): Instance =>
  ({ id, partId, x, y, rot: 0, label, params });
const wire = (id: string, pts: Array<[number, number]>): Wire => ({ id, points: pts.map(([x, y]) => ({ x, y })) });
const doc = (id: string, instances: Instance[], wires: Wire[], labels: SchematicDoc["labels"] = []): SchematicDoc =>
  ({ id, name: id, instances, wires, labels, notes: [], probes: [] });

/* --- Test-Teil A: Spannungsteiler-Modul (R1 1k IN→X, R2 2k X→0, R3 1k X→MID) --- */
function dividerInner(): SchematicDoc {
  return doc("inner_div", [
    inst("r1", "resistor", 0, 0, { r: 1000 }, "R1"),
    inst("r2", "resistor", 120, 0, { r: 2000 }, "R2"),
    inst("r3", "resistor", 60, -100, { r: 1000 }, "R3"),
    inst("port_00", "port_in", -160, 0, { pname: "IN" }, "IN"),
    inst("port_01", "port_io", 190, -100, { pname: "MID" }, "MID"),
  ], [
    wire("w_in", [[-190, 0], [-30, 0]]),
    wire("w_x", [[30, 0], [90, 0]]),
    wire("w_x3", [[30, -100], [30, 0]]),
    wire("w_mid", [[90, -100], [160, -100]]),
  ], [
    { id: "l0", x: 150, y: 0, name: "0" },
  ]);
}
const divSpec: CustomPartSpec = {
  id: "test_divider", name: "Test-Teiler", ref: "U", category: "Test", footprint: "—", mount: "THT",
  modelKind: "subcircuit",
  pins: [
    { name: "IN", side: "left", role: "input" },
    { name: "MID", side: "right", role: "signal" },
  ],
  schematic: dividerInner(),
};
registerCustomPart(divSpec);

// 1. Ende-zu-Ende: Teiler an 10 V → MID = 20/3 V
{
  const u1 = inst("u1", "test_divider", 200, 0, {}, "U1");
  const v1 = inst("v1", "vdc", 0, 0, { dc: 10 }, "V1");
  const p0 = pinPosition(u1, 0);
  const outer = doc("outer1", [v1, u1], [wire("w0", [[0, -30], [p0.x, p0.y]])],
    [{ id: "g0", x: 0, y: 30, name: "0" }]);
  const built = buildNets(outer);
  check("Teiler: keine Build-Fehler", built.errors.length === 0, built.errors.join("; "));
  const op = runOperatingPoint(built.netlist, {});
  checkNear("Teiler: IN = 10 V", op.nodes[built.pinNets["u1:0"]], 10, 1e-3);
  checkNear("Teiler: MID = 6.667 V", op.nodes[built.pinNets["u1:1"]], 20 / 3, 1e-3);
}

// 2. Port-Sammlung: Namen + Rollen + Reihenfolge
{
  const ports = collectPorts(dividerInner());
  check("Ports: 2 gefunden", ports.length === 2);
  check("Ports: Namen+Reihenfolge", ports[0]?.name === "IN" && ports[1]?.name === "MID");
  check("Ports: Rollen", ports[0]?.role === "input" && ports[1]?.role === "signal");
}

// 3a. Isolation: zwei Instanzen, 10 V und 5 V → 6.667 V und 3.333 V
{
  const u1 = inst("u1", "test_divider", 200, 0, {}, "U1");
  const u2 = inst("u2", "test_divider", 200, 200, {}, "U2");
  const v1 = inst("v1", "vdc", 0, 0, { dc: 10 }, "V1");
  const v2 = inst("v2", "vdc", 0, 200, { dc: 5 }, "V2");
  const p1 = pinPosition(u1, 0);
  const p2 = pinPosition(u2, 0);
  const outer = doc("outer2", [v1, v2, u1, u2], [
    wire("w1", [[0, -30], [p1.x, p1.y]]),
    wire("w2", [[0, 170], [p2.x, p2.y]]),
  ], [
    { id: "g1", x: 0, y: 30, name: "0" },
    { id: "g2", x: 0, y: 230, name: "0" },
  ]);
  const built = buildNets(outer);
  check("Isolation: keine Build-Fehler", built.errors.length === 0, built.errors.join("; "));
  const op = runOperatingPoint(built.netlist, {});
  checkNear("Isolation: MID1 = 6.667 V", op.nodes[built.pinNets["u1:1"]], 20 / 3, 1e-3);
  checkNear("Isolation: MID2 = 3.333 V", op.nodes[built.pinNets["u2:1"]], 10 / 3, 1e-3);
}

// 3b. Schachtelung: Hülle B enthält Teiler A → 9 V werden 6 V
{
  const n1 = inst("n1", "test_divider", 0, 0, {}, "N1");
  const pa = inst("port_00", "port_in", -260, -40, { pname: "IN" }, "IN");
  const pb = inst("port_01", "port_io", 260, 40, { pname: "MID" }, "MID");
  const q0 = pinPosition(n1, 0);
  const q1 = pinPosition(n1, 1);
  const wrapSpec: CustomPartSpec = {
    id: "test_wrapper", name: "Test-Hülle", ref: "U", category: "Test", footprint: "—", mount: "THT",
    modelKind: "subcircuit",
    pins: [
      { name: "IN", side: "left", role: "input" },
      { name: "MID", side: "right", role: "signal" },
    ],
    schematic: doc("inner_wrap", [n1, pa, pb], [], [
      { id: "la1", x: q0.x, y: q0.y, name: "A" },
      { id: "la2", x: -290, y: -40, name: "A" },
      { id: "lb1", x: q1.x, y: q1.y, name: "B" },
      { id: "lb2", x: 230, y: 40, name: "B" },
    ]),
  };
  registerCustomPart(wrapSpec);
  const u9 = inst("u9", "test_wrapper", 200, 0, {}, "U9");
  const v9 = inst("v9", "vdc", 0, 0, { dc: 9 }, "V9");
  const r0 = pinPosition(u9, 0);
  const outer = doc("outer3", [v9, u9], [wire("w9", [[0, -30], [r0.x, r0.y]])],
    [{ id: "g9", x: 0, y: 30, name: "0" }]);
  const built = buildNets(outer);
  check("Hülle: keine Build-Fehler", built.errors.length === 0, built.errors.join("; "));
  const op = runOperatingPoint(built.netlist, {});
  checkNear("Hülle: MID = 6 V", op.nodes[built.pinNets["u9:1"]], 6, 1e-3);
}

// 4. Zyklus: Teil enthält sich selbst → Tiefenwächter statt Hänger
{
  const selfSpec: CustomPartSpec = {
    id: "test_self", name: "Test-Rekursion", ref: "U", category: "Test", footprint: "—", mount: "THT",
    modelKind: "subcircuit",
    pins: [{ name: "X", side: "left", role: "signal" }],
    schematic: doc("inner_self", [
      inst("n1", "test_self", 0, 0, {}, "N1"),
      inst("port_00", "port_io", -200, 0, { pname: "X" }, "X"),
    ], [], [{ id: "lx", x: -230, y: 0, name: "X" }]),
  };
  registerCustomPart(selfSpec);
  check("Zyklus: statisch erkannt", (findSpecCycle(selfSpec) ?? []).join(",") === "test_self,test_self");
  const outer = doc("outer4", [inst("u", "test_self", 0, 0, {}, "U")], [], []);
  const built = buildNets(outer);
  check("Zyklus: Laufzeit-Wächter greift", built.errors.some((e) => e.includes("Verschachtelungstiefe")), built.errors.join("; "));
  const issues = validatePartSchematic(selfSpec);
  check("Zyklus: Validierung meldet Selbst-Einbau", issues.some((i) => i.code === "self-nesting"));
  check("Zyklus: Validierung meldet Kreis", issues.some((i) => i.code === "nest-cycle"));
}

// 5. GND-Passthrough: Innen-„0" bleibt global
{
  const gSpec: CustomPartSpec = {
    id: "test_gndpass", name: "Test-GND", ref: "U", category: "Test", footprint: "—", mount: "THT",
    modelKind: "subcircuit",
    pins: [{ name: "P", side: "left", role: "signal" }],
    schematic: doc("inner_g", [
      inst("r1", "resistor", 0, 0, { r: 100 }, "R1"),
      inst("port_00", "port_io", -160, 0, { pname: "P" }, "P"),
    ], [wire("w", [[-190, 0], [-30, 0]])], [{ id: "lg", x: 30, y: 0, name: "0" }]),
  };
  const devs = compileSchematicToDevices(gSpec, { id: "U9" }, ["EXT"]);
  check("GND: ein Device", devs.length === 1);
  check("GND: Knoten [EXT, 0]", devs[0]?.nodes[0] === "EXT" && devs[0]?.nodes[1] === "0", JSON.stringify(devs[0]?.nodes));
}

// 6. Migration: Tabelle → Dokument → Simulation (Treue)
{
  const tableSpec: CustomPartSpec = {
    id: "test_table", name: "Test-Tabelle", ref: "U", category: "Test", footprint: "—", mount: "THT",
    modelKind: "subcircuit",
    pins: [
      { name: "IN", side: "left", role: "input", internalNode: "IN" },
      { name: "MID", side: "right", role: "signal", internalNode: "MID" },
      { name: "GND", side: "left", role: "gnd", internalNode: "0" },
    ],
    subcircuit: [
      { id: "r1", kind: "resistor", nodes: ["IN", "MID"], value: 1000 },
      { id: "r2", kind: "resistor", nodes: ["MID", "0"], value: 2000 },
    ],
  };
  const mig = migrateSubcircuitToDoc(tableSpec);
  check("Migration: 2 Teile + 3 Ports", mig.instances.length === 5);
  check("Migration: 7 Labels", mig.labels.length === 7);
  const ports = collectPorts(mig);
  check("Migration: Port-Reihenfolge = Pin-Reihenfolge",
    ports.map((p) => p.name).join(",") === "IN,MID,GND");
  const migSpec: CustomPartSpec = { ...tableSpec, id: "test_mig", schematic: mig };
  registerCustomPart(migSpec);
  const u = inst("u", "test_mig", 200, 0, {}, "U");
  const v = inst("v1", "vdc", 0, 0, { dc: 10 }, "V1");
  const pp0 = pinPosition(u, 0);
  const pp2 = pinPosition(u, 2);
  const gpin = PART_MAP["gnd"].pins[0]; // Laufzeit-Pins (Kongruenz-Pass!)
  const g = inst("g", "gnd", pp2.x - gpin.x, pp2.y - gpin.y, {}, "");
  const outer = doc("outer5", [v, u, g],
    [wire("w", [[0, -30], [pp0.x, pp0.y]])], [{ id: "g0", x: 0, y: 30, name: "0" }]);
  const built = buildNets(outer);
  check("Migration: keine Build-Fehler", built.errors.length === 0, built.errors.join("; "));
  const op = runOperatingPoint(built.netlist, {});
  checkNear("Migration: MID = 6.667 V", op.nodes[built.pinNets["u:1"]], 20 / 3, 1e-3);
}

// 7. Validierung
{
  const base: CustomPartSpec = {
    id: "test_val", name: "Test-Val", ref: "U", category: "Test", footprint: "—", mount: "THT",
    modelKind: "subcircuit", pins: [],
  };
  const two = (a: string, b: string) => doc("v", [
    inst("port_00", "port_in", -200, -40, { pname: a }, a),
    inst("port_01", "port_out", 200, 40, { pname: b }, b),
  ], [], []);
  check("Validierung: Doppelname", validatePartSchematic({ ...base, schematic: two("X", "X") }).some((i) => i.code === "dup-port"));
  check("Validierung: offener Port", validatePartSchematic({ ...base, schematic: two("A", "B") }).some((i) => i.code === "port-open"));
  check("Validierung: keine Ports", validatePartSchematic({ ...base, schematic: doc("v", [], [], []) }).some((i) => i.code === "no-ports"));
  check("Validierung: Pinzahl weicht ab",
    validatePartSchematic({ ...base, pins: [{ name: "A", side: "left", role: "input" }], schematic: two("A", "B") }).some((i) => i.code === "port-count"));
  check("Validierung: unbekanntes Teil",
    validatePartSchematic({ ...base, schematic: doc("v", [inst("x", "nope_xyz", 0, 0)], [], []) }).some((i) => i.code === "unknown-part"));
  const clean = validatePartSchematic(divSpec);
  check("Validierung: sauberes Teil meldet nichts", clean.length === 0, JSON.stringify(clean));
}

// 8. Regression: Legacy-Tabelle simuliert weiter (alter Pfad)
{
  const legacy: CustomPartSpec = {
    id: "test_legacy", name: "Test-Legacy", ref: "U", category: "Test", footprint: "—", mount: "THT",
    modelKind: "subcircuit",
    pins: [
      { name: "IN", side: "left", role: "input", internalNode: "IN" },
      { name: "MID", side: "right", role: "signal", internalNode: "MID" },
    ],
    subcircuit: [
      { id: "r1", kind: "resistor", nodes: ["IN", "MID"], value: 1000 },
      { id: "r2", kind: "resistor", nodes: ["MID", "0"], value: 1000 },
    ],
  };
  registerCustomPart(legacy);
  const u = inst("u", "test_legacy", 200, 0, {}, "U");
  const v = inst("v1", "vdc", 0, 0, { dc: 10 }, "V1");
  const pp = pinPosition(u, 0);
  const outer = doc("outer6", [v, u], [wire("w", [[0, -30], [pp.x, pp.y]])],
    [{ id: "g0", x: 0, y: 30, name: "0" }]);
  const built = buildNets(outer);
  const op = runOperatingPoint(built.netlist, {});
  checkNear("Legacy: MID = 5 V", op.nodes[built.pinNets["u:1"]], 5, 1e-3);
}

// 9. S6.2: paramLinks — Außenwert steuert Innen-Teiler (R1=R, R2=1k fix)
function linkInner(): SchematicDoc {
  return doc("inner_link", [
    inst("r1", "resistor", 0, 0, { r: 1000 }, "R1"),
    inst("r2", "resistor", 120, 0, { r: 1000 }, "R2"),
    inst("port_00", "port_in", -160, 0, { pname: "IN" }, "IN"),
    inst("port_01", "port_io", 120, -100, { pname: "MID" }, "MID"),
  ], [
    wire("w_in", [[-190, 0], [-30, 0]]),
    wire("w_x", [[30, 0], [90, 0]]),
    wire("w_mid", [[90, 0], [90, -100]]),
  ], [
    { id: "l0", x: 150, y: 0, name: "0" },
  ]);
}
const linkSpec: CustomPartSpec = {
  id: "test_linkdiv", name: "Test-LinkTeiler", ref: "U", category: "Test", footprint: "—", mount: "THT",
  modelKind: "ic",
  pins: [
    { name: "IN", side: "left", role: "input" },
    { name: "MID", side: "right", role: "signal" },
  ],
  schematic: linkInner(),
  paramLinks: [{ name: "R", label: "Teiler oben", unit: "Ω", def: 1000, targets: [{ instanceId: "r1", key: "r" }] }],
};
registerCustomPart(linkSpec);
{
  const probe = (rParam?: number) => {
    const u = inst("u", "test_linkdiv", 200, 0, rParam === undefined ? {} : { R: rParam }, "U");
    const v = inst("v1", "vdc", 0, 0, { dc: 10 }, "V1");
    const pp = pinPosition(u, 0);
    const outer = doc("outerL", [v, u], [wire("w", [[0, -30], [pp.x, pp.y]])], [{ id: "g0", x: 0, y: 30, name: "0" }]);
    const built = buildNets(outer);
    if (built.errors.length > 0) return { built, v: NaN };
    const op = runOperatingPoint(built.netlist, {});
    return { built, v: op.nodes[built.pinNets["u:1"]] };
  };
  const dflt = probe();
  check("Links: keine Build-Fehler", dflt.built.errors.length === 0, dflt.built.errors.join("; "));
  checkNear("Links: Default R=1k → MID=5 V", dflt.v, 5, 1e-3);
  checkNear("Links: R=3k → MID=2.5 V", probe(3000).v, 2.5, 1e-3);
  check("Links: PartDef exponiert R",
    (PART_MAP["test_linkdiv"]?.params ?? []).some((p) => p.key === "R" && p.def === 1000 && p.unit === "Ω"));
  const u1 = inst("u1", "test_linkdiv", 200, 0, { R: 1000 }, "U1");
  const u2 = inst("u2", "test_linkdiv", 200, 200, { R: 3000 }, "U2");
  const v1 = inst("v1", "vdc", 0, 0, { dc: 10 }, "V1");
  const v2 = inst("v2", "vdc", 0, 200, { dc: 10 }, "V2");
  const p1 = pinPosition(u1, 0);
  const p2 = pinPosition(u2, 0);
  const outer = doc("outerL2", [v1, v2, u1, u2], [
    wire("w1", [[0, -30], [p1.x, p1.y]]),
    wire("w2", [[0, 170], [p2.x, p2.y]]),
  ], [{ id: "g1", x: 0, y: 30, name: "0" }, { id: "g2", x: 0, y: 230, name: "0" }]);
  const built = buildNets(outer);
  const op = runOperatingPoint(built.netlist, {});
  checkNear("Links: Isolation U1=5 V", op.nodes[built.pinNets["u1:1"]], 5, 1e-3);
  checkNear("Links: Isolation U2=2.5 V", op.nodes[built.pinNets["u2:1"]], 2.5, 1e-3);
  const linkIssues = validatePartSchematic(linkSpec);
  check("Links: sauberes Link-Teil meldet nichts", linkIssues.length === 0, JSON.stringify(linkIssues));
}

// 10. S6.2: Validierung — Link-Fehler + Deny-Liste
{
  const base: CustomPartSpec = {
    id: "test_linkval", name: "Test-LinkVal", ref: "U", category: "Test", footprint: "—", mount: "THT",
    modelKind: "ic",
    pins: [
      { name: "IN", side: "left", role: "input" },
      { name: "MID", side: "right", role: "signal" },
    ],
  };
  const withLinks = (paramLinks: CustomPartSpec["paramLinks"]) =>
    validatePartSchematic({ ...base, schematic: linkInner(), paramLinks });
  check("LinkVal: verwaistes Ziel", withLinks([{ name: "R", def: 1, targets: [{ instanceId: "nope", key: "r" }] }]).some((i) => i.code === "link-dangling"));
  check("LinkVal: falscher Key", withLinks([{ name: "R", def: 1, targets: [{ instanceId: "r1", key: "nope" }] }]).some((i) => i.code === "link-badkey"));
  check("LinkVal: Doppelname", withLinks([
    { name: "R", def: 1, targets: [{ instanceId: "r1", key: "r" }] },
    { name: "r", def: 2, targets: [{ instanceId: "r2", key: "r" }] },
  ]).some((i) => i.code === "link-dup"));
  check("LinkVal: ohne Namen", withLinks([{ name: "  ", def: 1, targets: [{ instanceId: "r1", key: "r" }] }]).some((i) => i.code === "link-noname"));
  check("LinkVal: ohne Ziel (Warnung)", withLinks([{ name: "R", def: 1, targets: [] }]).some((i) => i.code === "link-orphan" && i.severity === "warning"));
  const denied = validatePartSchematic({
    ...base,
    schematic: doc("v_deny", [...linkInner().instances, inst("sc", "oscilloscope", 0, 200, {}, "SC")], [...linkInner().wires], [...linkInner().labels]),
  });
  check("LinkVal: Deny-Teil", denied.some((i) => i.code === "denied-part"));
}

// 11. S6.2: Pin-Ableitung aus Ports (+ Overrides)
{
  const pins = derivePinsFromPorts(dividerInner());
  check("Pins: Namen+Reihenfolge", pins.map((p) => p.name).join(",") === "IN,MID");
  check("Pins: Seite nach Konvention (IN links, IO links)", pins[0]?.side === "left" && pins[1]?.side === "left");
  check("Pins: Rollen", pins[0]?.role === "input" && pins[1]?.role === "signal");
  check("Pins: internalNode", pins[0]?.internalNode === "IN" && pins[1]?.internalNode === "MID");
  const ov = derivePinsFromPorts(dividerInner(), { MID: { side: "right", marker: "invert" } });
  check("Pins: Override greift, Rest bleibt", ov[1]?.side === "right" && ov[1]?.marker === "invert" && ov[0]?.side === "left");
}

// 12. S6.2: Strenger Editor-Filter
{
  registerCustomPart({
    id: "test_bare", name: "Test-Hülle", ref: "U", category: "Test", footprint: "—", mount: "THT",
    modelKind: "ic", pins: [{ name: "X", side: "left", role: "signal" }],
  });
  check("Filter: Widerstand ok", isEditorPlaceable("resistor", null));
  check("Filter: Port ok", isEditorPlaceable("port_in", null));
  check("Filter: Makro mit Innenschaltung ok", isEditorPlaceable("test_divider", null));
  check("Filter: Oszi raus", !isEditorPlaceable("oscilloscope", null));
  check("Filter: Selbst-Einbau raus", !isEditorPlaceable("test_divider", "test_divider"));
  check("Filter: Hülle ohne Modell raus", !isEditorPlaceable("test_bare", null));
  check("Filter: unbekannt raus", !isEditorPlaceable("nope_xyz", null));
}

// 13. S6.2: Store-Roundtrip — Parken, Guards, Wiederherstellen
{
  const st = useEditor.getState();
  const before = st.doc;
  st.openPartEditor(null);
  const opened = useEditor.getState();
  check("Editor: offen + Swap-Doc", opened.partEditor.open && opened.doc.id !== before.id && opened.doc.probes.length === 0);
  check("Editor: Haupt-Plan geparkt", opened.partEditor.parked?.doc.id === before.id);
  check("Editor: History frisch", opened.past.length === 0 && opened.future.length === 0);
  opened.startSim();
  check("Editor: Simulation gesperrt", useEditor.getState().sim.running === false);
  useEditor.getState().setPartEditorMeta({ name: "Store-Teil" });
  check("Editor: Meta macht dirty", useEditor.getState().partEditor.dirty === true);
  check("Editor: Speichern ohne Ports scheitert", useEditor.getState().savePartEditor(false) === false);
  check("Editor: Sonde blockiert", useEditor.getState().addMeasurementProbe("voltage", 0, 0) === null);
  useEditor.getState().setPlacing("oscilloscope");
  check("Editor: Deny-Platzierung blockiert", useEditor.getState().placingPartId !== "oscilloscope");
  useEditor.getState().setPlacing("resistor");
  check("Editor: erlaubte Platzierung geht", useEditor.getState().placingPartId === "resistor");
  useEditor.getState().closePartEditor();
  const after = useEditor.getState();
  check("Editor: zu + Doc zurück", !after.partEditor.open && after.doc.id === before.id);
  check("Editor: History zurück", after.past.length === 0 && after.future.length === 0);
}

if (failed > 0) {
  console.log(`\nSubcircuit-Prüfungen: ${failed} FEHLER`);
  process.exit(1);
} else {
  console.log("\nSubcircuit-Prüfungen: alle bestanden.");
}
