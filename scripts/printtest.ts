/* Druckbögen Phase 1: Schriftfeld-Auflösung, Querverweise je Blatt,
 * Seitendokumente, Druckauftrag im Store. Fehlschlag -> Exit 1. */
import {
  emptyDoc,
  offpageGroups,
  resolveTitleBlock,
  sheetCrossRefs,
  type Instance,
  type SchematicDoc,
  type SchematicPage,
} from "../src/lib/schematic/model";
import { buildPrintPlan, chunkRows, docToSvg, pageDocs, zoneAt } from "../src/lib/export/sheet";
import { formatDeDate } from "../src/lib/format";
import { loadPrintSetup } from "../src/lib/settings";
import { useEditor } from "../src/state/editor";

let failed = 0;
function checkTrue(name: string, cond: boolean, extra = "") {
  if (!cond) failed++;
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` — ${extra}` : ""}`);
}

const R = (id: string, label: string): Instance =>
  ({ id, partId: "resistor", x: 100, y: 100, rot: 0, label, params: { r: 1000 } }) as Instance;
const OFF = (id: string, name: string): Instance =>
  ({ id, partId: "offpage_connector", x: 100, y: 100, rot: 0, label: "J1", params: { name } }) as Instance;

// Drei Seiten: VCC auf 1+2, Takt auf 2+3, SOLO nur auf 3 (hängend).
function threePageDoc(): SchematicDoc {
  const p1: SchematicPage = {
    id: "pg_p1", name: "Netzteil",
    instances: [R("i_r1", "R1"), OFF("i_off1", "VCC")],
    wires: [], labels: [], notes: [], probes: [], junctions: [],
  };
  const p2: SchematicPage = {
    id: "pg_p2", name: "Verstärker",
    instances: [R("i_r2", "R2"), OFF("i_off2a", "VCC"), OFF("i_off2b", "Takt")],
    wires: [], labels: [], notes: [], probes: [], junctions: [],
  };
  const p3: SchematicPage = {
    id: "pg_p3", name: "Ausgang",
    instances: [R("i_r3", "R3"), OFF("i_off3a", "Takt"), OFF("i_off3b", "SOLO")],
    wires: [], labels: [], notes: [], probes: [], junctions: [],
  };
  return {
    ...emptyDoc("Drucktest"),
    // Flache Arrays spiegeln IMMER die aktive Seite (hier p2).
    instances: p2.instances, wires: [], labels: [], notes: [], probes: [], junctions: [],
    pages: [p1, p2, p3], activePageId: p2.id,
  };
}

/* A · Schriftfeld-Auflösung: Entwurf schlägt Vorgaben, Reste sinnvoll */
{
  const doc = threePageDoc();
  const tb = resolveTitleBlock(doc, { owner: "Fa. Test", drawnBy: "P. Muster", docType: "Stromlaufplan" });
  checkTrue("A1 Titel fällt auf Entwurfsname zurück", tb.title === "Drucktest", tb.title);
  checkTrue("A2 Vorgaben greifen", tb.owner === "Fa. Test" && tb.drawnBy === "P. Muster");
  checkTrue("A3 Erstelldatum ist heute", tb.drawnDate === new Date().toISOString().slice(0, 10), tb.drawnDate);
  checkTrue("A4 Leeres bleibt leer", tb.docNo === "" && tb.approvedBy === "" && tb.approvedDate === "");
  const withTb: SchematicDoc = {
    ...doc,
    titleBlock: { title: "Netzteil 5V", docNo: "MS-001", owner: "", drawnBy: "", drawnDate: "", approvedBy: "", approvedDate: "", docType: "" },
  };
  const tb2 = resolveTitleBlock(withTb, { owner: "Fa. Test", drawnBy: "P. Muster", docType: "Stromlaufplan" });
  checkTrue("A5 Entwurf schlägt Vorgaben", tb2.title === "Netzteil 5V" && tb2.docNo === "MS-001");
  checkTrue("A6 Leere Entwurfsfelder fallen zurück", tb2.owner === "Fa. Test" && tb2.docType === "Stromlaufplan");
}

/* B · Querverweise je Blatt (nur Netze MIT Partnerseiten) */
{
  const doc = threePageDoc();
  const r1 = sheetCrossRefs(doc, "pg_p1");
  checkTrue("B1 Blatt 1 sieht nur VCC", r1.length === 1 && r1[0].net === "VCC", JSON.stringify(r1));
  checkTrue("B2 VCC-Partnerseite ist Blatt 2", r1[0]?.pages.join() === "Verstärker");
  const r2 = sheetCrossRefs(doc, "pg_p2");
  const nets2 = r2.map((r) => r.net).sort().join(",");
  checkTrue("B3 Blatt 2 sieht VCC+Takt", nets2 === "Takt,VCC", nets2);
  checkTrue(
    "B4 Partner stimmen",
    r2.find((r) => r.net === "VCC")?.pages.join() === "Netzteil" &&
      r2.find((r) => r.net === "Takt")?.pages.join() === "Ausgang",
  );
  const r3 = sheetCrossRefs(doc, "pg_p3");
  checkTrue("B5 Hängendes Netz (SOLO) entfällt", r3.length === 1 && r3[0].net === "Takt", JSON.stringify(r3));
  checkTrue("B6 Selbstverweis entfällt", !r3[0]?.pages.includes("Ausgang"));
  const groups = offpageGroups(doc);
  const solo = groups.find((g) => g.display === "SOLO");
  checkTrue("B7 Verzeichnis kennt Hängendes", solo !== undefined && solo.hits.length === 1);
}

/* C · Seitendokumente (aktive Seite aus den flachen Arrays) */
{
  const doc = threePageDoc();
  const all = pageDocs(doc);
  checkTrue("C1 Drei Seiten → drei Dokumente", all.length === 3);
  checkTrue("C2 Namen tragen Seite", all[1].name.includes("Verstärker"), all[1].name);
  checkTrue("C3 IDs bleiben Seiten-IDs", all.map((d) => d.id).join(",") === "pg_p1,pg_p2,pg_p3");
  checkTrue("C4 Aktive Seite (2) aus flach", all[1].instances.length === doc.instances.length);
  const svg = docToSvg(all[0], { frame: false, paperColor: "#ffffff" });
  checkTrue("C5 Blatt-SVG ist Vektor", svg.startsWith("<svg") && svg.includes("<rect"), svg.slice(0, 40));
}

const EMPTY_TB_LOCAL = {
  title: "", docNo: "", owner: "", drawnBy: "", drawnDate: "", approvedBy: "", approvedDate: "", docType: "",
};

/* D · Store: Druckauftrag + Schriftfeld (Undo-fähig, Netzprüfung läuft) */
{
  const st = useEditor.getState();
  checkTrue("D1 Standardauftrag A4-quer/alle/mit Verzeichnis+Stückliste",
    st.printTicket.format === "a4l" && st.printTicket.scope === "all" && st.printTicket.toc === true && st.printTicket.bom === true,
    JSON.stringify(st.printTicket));
  st.setDoc(threePageDoc(), false);
  const pastBefore = useEditor.getState().past.length;
  useEditor.getState().commit((next) => {
    next.titleBlock = { ...EMPTY_TB_LOCAL, title: "Gedruckt", docNo: "MS-007" };
  });
  const after = useEditor.getState();
  checkTrue("D2 Schriftfeld landet im Entwurf", after.doc.titleBlock?.docNo === "MS-007");
  checkTrue("D3 Verlauf wächst (Undo-fähig)", after.past.length === pastBefore + 1);
  checkTrue("D4 Netzprüfung lief", Array.isArray(after.netResult.nets));
  after.setPrintTicket({ format: "a3l", scope: "active", toc: false, bom: false });
  const t = useEditor.getState().printTicket;
  checkTrue("D5 Auftrag umstellbar", t.format === "a3l" && t.scope === "active" && t.toc === false && t.bom === false);
}

/* E · Export-Rahmen Phase ②: echte Schriftfeld-Daten + Blatt n/N */
{
  const doc = threePageDoc();
  doc.titleBlock = { ...EMPTY_TB_LOCAL, title: "Netzteil 5V", docNo: "MS-001" };
  const all = pageDocs(doc);
  const tb = resolveTitleBlock(doc, { owner: "", drawnBy: "", docType: "Stromlaufplan" });
  const svg2 = docToSvg(all[1], {
    frameInfo: { title: tb.title, docNo: tb.docNo, date: formatDeDate(tb.drawnDate), sheet: 2, of: 3 },
  });
  checkTrue("E1 Stempel trägt Benennung", svg2.includes("Netzteil 5V"));
  checkTrue("E2 Stempel trägt Sachnummer + Blatt", svg2.includes("MS-001") && svg2.includes("Blatt 2/3"));
  checkTrue("E3 Stempel trägt deutsches Datum", svg2.includes(formatDeDate(tb.drawnDate)), formatDeDate(tb.drawnDate));
  const legacy = docToSvg(all[0]);
  checkTrue("E4 Ohne Info: Entwurfsname + Blatt 1/1",
    legacy.includes("Drucktest") && legacy.includes("Blatt 1/1"));
  checkTrue("E5 formatDeDate",
    formatDeDate("2026-10-13") === "13.10.2026" && formatDeDate("") === "\u2014" && formatDeDate("frei") === "frei");
}

/* F · Phase ③: Zonen, Fundstellen, Druckplan */
{
  const b = { minX: 0, minY: 0, maxX: 400, maxY: 400 };
  checkTrue("F1 Zonen-Ecken", zoneAt(b, 0, 0) === "A1" && zoneAt(b, 399, 399) === "D4");
  checkTrue("F2 Zonen-Mitte", zoneAt(b, 200, 200) === "C3" && zoneAt(b, 50, 350) === "D1");
  checkTrue("F3 Zonen klemmen am Rand", zoneAt(b, -50, 999) === "D1");
  const doc = threePageDoc();
  const zsvg = docToSvg(pageDocs(doc)[0], { frame: false, zones: true });
  checkTrue("F4 Raster-Linien + Labels",
    zsvg.includes('stroke-dasharray="4 3"') && zsvg.includes(">D<") && zsvg.includes(">4<"));
  const plan = buildPrintPlan(doc, { scope: "all", toc: true, bom: true, format: "a4l" });
  checkTrue("F5 Plan: 3 Blätter + Verzeichnis",
    plan.sheets.length === 3 && plan.showToc && plan.sheets.map((s) => s.blatt).join() === "2,3,4");
  const flat = plan.bom.flat();
  checkTrue("F6 BOM: eine Gruppe (3× 1k)",
    flat.length === 1 && flat[0].qty === 3 && flat[0].ref === "R1, R2, R3", JSON.stringify(flat));
  checkTrue("F7 Fundstellen je Blatt",
    flat[0].locations.split(", ").length === 3 &&
      flat[0].locations.includes("2·") && flat[0].locations.includes("3·") && flat[0].locations.includes("4·"),
    flat[0].locations);
  checkTrue("F8 Total mit Stückliste", plan.total === 5 && plan.bomStart === 5);
  const active = buildPrintPlan(doc, { scope: "active", toc: true, bom: true, format: "a4l" });
  checkTrue("F9 Aktive Seite: 1 Blatt + Stückliste",
    active.sheets.length === 1 && !active.showToc && active.total === 2 && active.bom.flat().length === 1);
  checkTrue("F10 Paginierung", chunkRows(new Array(50).fill(0), 24).length === 3);
  checkTrue("F11 Vorgaben-Standard Stückliste an", loadPrintSetup().bom === true);
}

console.log(failed ? `\n${failed} FEHLSCHLAG` : "\nAlle Druckbögen-Checks bestanden");
process.exit(failed ? 1 : 0);
