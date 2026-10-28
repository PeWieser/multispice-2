/* Blätter Stufe B: mehrere Seiten pro Entwurf — Off-Page-Verbunder global,
 * On-Page/Labels lokal, GND global, Geometrie aktiv-seitig, BOM/Reannotate
 * seitenweit. Store-Logik ohne DOM. Fehlschlag -> Exit 1. */
import {
  buildBom,
  buildNets,
  emptyDoc,
  ensurePages,
  newPageId,
  offpageGroups,
  reannotateLabels,
  type Instance,
  type SchematicDoc,
  type SchematicPage,
} from "../src/lib/schematic/model";
import { PART_MAP } from "../src/lib/library/catalog";
import { nextLabel } from "../src/state/editor/docUtils";
import { useEditor } from "../src/state/editor";

let failed = 0;
function checkTrue(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
}

// Geometrie: Pins fallen zusammen (keine Drähte nötig).
// R(100,100): Pin0=(70,100) Pin1=(130,100); Offpage(100,100): Pin=(70,100); GND(130,120): Pin=(130,100).
const R = (id: string, label: string): Instance =>
  ({ id, partId: "resistor", x: 100, y: 100, rot: 0, label, params: { r: 1000 } }) as Instance;
const OFF = (id: string, name: string): Instance =>
  ({ id, partId: "offpage_connector", x: 100, y: 100, rot: 0, label: "J1", params: { name } }) as Instance;
const GND = (id: string): Instance =>
  ({ id, partId: "gnd", x: 130, y: 120, rot: 0, label: "GND1", params: {} }) as Instance;
const ONP = (id: string, name: string): Instance =>
  ({ id, partId: "onpage_connector", x: 200, y: 100, rot: 0, label: "J2", params: { name } }) as Instance;

function twoPageDoc(): { doc: SchematicDoc; p1: SchematicPage; p2: SchematicPage } {
  const p1: SchematicPage = {
    id: "pg_p1", name: "Seite 1",
    instances: [R("i_r1", "R1"), OFF("i_off1", "VCC"), GND("i_gnd1"), ONP("i_onp1", "LOK")],
    wires: [], labels: [], notes: [], probes: [], junctions: [],
  };
  const p2: SchematicPage = {
    id: "pg_p2", name: "Seite 2",
    instances: [R("i_r2", "R2"), OFF("i_off2", "VCC"), GND("i_gnd2"), ONP("i_onp2", "LOK")],
    wires: [], labels: [], notes: [], probes: [], junctions: [],
  };
  const doc: SchematicDoc = {
    ...emptyDoc("Mehrseitig"),
    instances: p1.instances, wires: [], labels: [], notes: [], probes: [], junctions: [],
    pages: [p1, p2], activePageId: p1.id,
  };
  return { doc, p1, p2 };
}

/* A · Altbestand (eine Seite, flach): keine Qualifizierung, Off-Page unbekannt */
{
  const { p1 } = twoPageDoc();
  const legacy: SchematicDoc = {
    ...emptyDoc("Alt"),
    instances: p1.instances, wires: [], labels: [], notes: [], probes: [], junctions: [],
  };
  const b = buildNets(legacy);
  checkTrue("A1 Legacy: 1 Bauteil", b.netlist.devices.length === 1, `devices=${b.netlist.devices.length}`);
  checkTrue("A2 Legacy: keine S-Qualifizierung", b.nets.every((n) => !/^S\d+:/.test(n.name)));
  checkTrue("A3 Legacy: Off-Page wirkungslos", b.pinNets["i_off1:0"] !== "VCC", b.pinNets["i_off1:0"]);
  checkTrue("A4 Legacy: GND heißt 0", b.pinNets["i_gnd1:0"] === "0");
}

/* B · Mehrseitig: Off-Page + GND global */
{
  const { doc } = twoPageDoc();
  const b = buildNets(doc);
  const r1 = b.netlist.devices.find((d) => d.id === "R1");
  const r2 = b.netlist.devices.find((d) => d.id === "R2");
  checkTrue("B1 zwei Bauteile", b.netlist.devices.length === 2);
  checkTrue("B2 R1 hängt an VCC+0", !!r1 && r1.nodes.includes("VCC") && r1.nodes.includes("0"), r1?.nodes.join(","));
  checkTrue("B3 R2 hängt an VCC+0", !!r2 && r2.nodes.includes("VCC") && r2.nodes.includes("0"), r2?.nodes.join(","));
  checkTrue("B4 Off-Page-Pin global", b.pinNets["i_off2:0"] === "VCC", b.pinNets["i_off2:0"]);
  const vcc = b.nets.filter((n) => n.name === "VCC");
  checkTrue("B5 VCC-Eintrag pro Seite", vcc.length === 2 && new Set(vcc.map((n) => n.page)).size === 2);
  checkTrue(
    "B6 VCC-Pins beider Seiten",
    vcc.flatMap((n) => n.pins.map((p) => p.instanceId)).sort().join() === "i_off1,i_off2,i_r1,i_r2",
  );
  checkTrue("B7 GND-Pins beider Seiten", b.nets.find((n) => n.name === "0" && n.page === "pg_p2")?.pins.length === 2);
  checkTrue("B8 kein Masse-Mangel", !b.warnings.some((w) => w.startsWith("Kein Massebezug")), b.warnings.join(" | "));
}

/* C · On-Page bleibt seitenlokal */
{
  const { doc } = twoPageDoc();
  const names = buildNets(doc).nets.map((n) => n.name);
  checkTrue("C1 S1:LOK + S2:LOK", names.includes("S1:LOK") && names.includes("S2:LOK"), names.join(","));
  checkTrue("C2 kein globales LOK", !names.includes("LOK"));
}

/* D · Doppelte Kürzel: Warnung + kollisionsfreie Geräte-IDs */
{
  const { doc } = twoPageDoc();
  doc.pages![1].instances.find((i) => i.id === "i_r2")!.label = "R1";
  const b = buildNets(doc);
  checkTrue("D1 Doppel-Warnung", b.warnings.some((w) => w.includes("Doppeltes Kürzel") && w.includes("R1")), b.warnings.join(" | "));
  const ids = b.netlist.devices.map((d) => d.id).sort();
  checkTrue("D2 IDs eindeutig", new Set(ids).size === ids.length, ids.join(","));
  checkTrue("D3 Folge-ID trägt Seite", ids.some((id) => id === "R1~S2"), ids.join(","));
}

/* E · Warnungen entwurfsweit (einmal statt pro Seite) */
{
  const mk = (): SchematicDoc => {
    const d = emptyDoc("Leer");
    const a: SchematicPage = { id: "pg_a", name: "Seite 1", instances: [], wires: [], labels: [], notes: [], probes: [], junctions: [] };
    const b: SchematicPage = { id: "pg_b", name: "Seite 2", instances: [], wires: [], labels: [], notes: [], probes: [], junctions: [] };
    d.pages = [a, b];
    d.activePageId = a.id;
    return d;
  };
  const w = buildNets(mk()).warnings;
  checkTrue("E1 GND-Warnung genau einmal", w.filter((x) => x.startsWith("Kein Massebezug")).length === 1, w.join(" | "));
  checkTrue("E2 Bauteil-Warnung genau einmal", w.filter((x) => x.startsWith("Keine simulierbaren Bauteile")).length === 1);
}

/* F · Geometrie gehört der aktiven Seite; Fremdseiten werden als Text gemeldet */
{
  const { doc } = twoPageDoc();
  doc.pages![1].wires.push({ id: "w_offen", points: [{ x: 10, y: 10 }, { x: 50, y: 10 }] });
  const b = buildNets(doc);
  checkTrue("F1 openEnds nur aktiv", b.openEnds.length === 0, `openEnds=${b.openEnds.length}`);
  checkTrue(
    "F2 Fremdseite als Warnung",
    b.warnings.some((w) => w.includes("[Seite 2]") && w.includes("offene Leitungsenden")),
    b.warnings.join(" | "),
  );
  checkTrue("F3 pointNets aktiv-seitig", Object.keys(b.pointNets).length > 0 && b.pointNets["70,100"] === "VCC");
}

/* G · Migration: Altbestand → Seite 1 per Referenz */
{
  const legacy = emptyDoc("Alt");
  legacy.instances.push(R("i_x", "R1"));
  const pages = ensurePages(legacy);
  checkTrue("G1 eine Seite", pages.length === 1 && pages[0].name === "Seite 1");
  checkTrue("G2 aktiv gesetzt", legacy.activePageId === pages[0].id);
  checkTrue("G3 Referenz (kein Klon)", pages[0].instances === legacy.instances);
  const b = buildNets(legacy);
  checkTrue("G4 eine Seite = Legacy-Pfad", b.nets.every((n) => n.page === undefined && !/^S\d+:/.test(n.name)));
}

/* I · BOM über alle Seiten */
{
  const { doc } = twoPageDoc();
  const bom = buildBom(doc);
  checkTrue("I1 ein Eintrag, Menge 2", bom.length === 1 && bom[0].qty === 2, JSON.stringify(bom));
  checkTrue("I2 Referenzen beider Seiten", bom[0].ref.includes("R1") && bom[0].ref.includes("R2"), bom[0].ref);
}

/* J · Reannotate seitenübergreifend (Seite 1 zuerst) */
{
  const { doc } = twoPageDoc();
  doc.instances.find((i) => i.id === "i_r1")!.label = "R5";
  doc.pages![1].instances.find((i) => i.id === "i_r2")!.label = "R9";
  const st = reannotateLabels(doc);
  // (J1/J2/GND1 stehen auf beiden Seiten und werden mitgezählt.)
  checkTrue("J1 umnummeriert", st.renumbered >= 2, `n=${st.renumbered}`);
  checkTrue("J2 Seite 1 → R1", doc.instances.find((i) => i.id === "i_r1")!.label === "R1");
  checkTrue("J3 Seite 2 → R2", doc.pages![1].instances.find((i) => i.id === "i_r2")!.label === "R2");
}

/* K · Kürzel-Vergabe zählt entwurfsweit */
{
  const { doc } = twoPageDoc();
  checkTrue("K1 nächstes Kürzel R3", nextLabel(doc, PART_MAP["resistor"]) === "R3");
}

/* L · Navigator-Gruppen */
{
  const { doc } = twoPageDoc();
  const g = offpageGroups(doc);
  checkTrue("L1 eine Gruppe VCC", g.length === 1 && g[0].display === "VCC");
  checkTrue("L2 Treffer auf beiden Seiten", g[0]?.hits.length === 2, JSON.stringify(g[0]?.hits));
}

/* M · Store: anlegen/wechseln/umbenennen/löschen */
{
  const st = () => useEditor.getState();
  st().newDocument();
  st().addPage();
  const pages = st().doc.pages!;
  checkTrue("M1 zwei Seiten", pages.length === 2, `pages=${pages.length}`);
  const firstId = pages[0].id;
  const secondId = pages[1].id;
  checkTrue("M2 neue Seite aktiv + leer", st().doc.activePageId === secondId && st().doc.instances.length === 0);
  checkTrue("M3 Seiten-IDs frisch", secondId.startsWith("pg_") && secondId !== firstId, secondId);
  st().commit((d) => {
    d.instances.push(R("i_t1", "R1"));
  });
  st().openPage(firstId);
  checkTrue("M4 Wechsel leert flach", st().doc.instances.length === 0);
  st().openPage(secondId);
  checkTrue("M5 zurück: Inhalt da", st().doc.instances.length === 1 && st().doc.instances[0].label === "R1");
  const devs = st().netResult.netlist.devices;
  checkTrue(
    "M6 Store-Netzliste mergt",
    devs.length === 1 && devs[0].nodes.some((n) => n.startsWith("S2:")),
    JSON.stringify(devs[0]?.nodes),
  );
  st().renamePage(secondId, "Endstufe");
  checkTrue("M7 umbenannt", st().doc.pages!.find((p) => p.id === secondId)?.name === "Endstufe");
  st().deletePage(secondId);
  checkTrue("M8 gelöscht", st().doc.pages!.length === 1);
  st().deletePage(firstId);
  checkTrue("M9 letzte Seite bleibt", st().doc.pages!.length === 1, `pages=${st().doc.pages!.length}`);
}

/* N · Proben inaktiver Seiten werden namenbasiert repariert */
{
  const st = () => useEditor.getState();
  const firstId = st().doc.pages![0].id;
  st().addPage(); // aktiv = neue Seite, firstId inaktiv
  st().commit((d) => {
    const slot = d.pages!.find((p) => p.id === firstId)!;
    slot.instances.push(GND("i_gndN"));
    slot.probes.push({ id: "pr_t", kind: "voltage", x: 0, y: 0, net: "S1:0" });
  });
  const probe = st().doc.pages!.find((p) => p.id === firstId)!.probes!.find((p) => p.id === "pr_t")!;
  checkTrue("N1 globaler Name repariert", probe.net === "0", `net=${probe.net}`);
}

void newPageId;

if (failed > 0) {
  console.error(`pagetest: ${failed} FEHLER`);
  process.exit(1);
}
console.log("pagetest: alle Prüfungen bestanden");
