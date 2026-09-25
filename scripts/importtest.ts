/* Developer smoke test für die Importer (Run: npx tsx scripts/importtest.ts). */
import { fromSpiceNetlist, fromLtspiceAsc, isLtspiceAsc, parseSpiceValue } from "../src/lib/schematic/importers";
import { buildNets, pinPosition } from "../src/lib/schematic/model";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` – ${detail}` : ""}`);
}

/* Werte mit Suffixen */
const close = (a: number, b: number) => Math.abs(a / b - 1) < 1e-12;
check("value 10k", parseSpiceValue("10k") === 1e4);
check("value 4u7", close(parseSpiceValue("4u7"), 4.7e-6));
check("value meg", parseSpiceValue("1meg") === 1e6);
check("value 100n", close(parseSpiceValue("100n"), 1e-7));

/* SPICE-Netzliste: RC-Teiler mit Transistor */
const cir = [
  "* Testnetzliste",
  "V1 in 0 DC 5",
  "R1 in mid 10k",
  "R2 mid out 100k",
  "C1 out 0 1u",
  "Q1 out base mid npn",
  ".tran 1m 10m",
].join("\n");
const doc = fromSpiceNetlist(cir);
check("cir: 5 Bauteile + GND", doc.instances.length === 6, `${doc.instances.length}`);
check("cir: GND-Symbol vorhanden", doc.instances.some((i) => i.partId === "gnd"));
check("cir: R1 Wert 10k", doc.instances.find((i) => i.label === "R1")?.params.r === 1e4);
check("cir: Q als npn", doc.instances.find((i) => i.label === "Q1")?.partId === "npn_2n3904");
check("cir: Leitungen erzeugt", doc.wires.length >= 4, `${doc.wires.length}`);
check("cir: Labels für benannte Netze", doc.labels.some((l) => l.name === "mid") && doc.labels.some((l) => l.name === "in"));

// Elektrische Verbindung: V1(+) und R1(1) müssen im selben Netz liegen.
const nets = buildNets(doc);
const v1 = doc.instances.find((i) => i.label === "V1")!;
const r1 = doc.instances.find((i) => i.label === "R1")!;
const pv = pinPosition(v1, 0);
const pr = pinPosition(r1, 0);
const sameNet = nets.nets.some((n) => {
  const on = (p: { x: number; y: number }) => n.points.some((q) => Math.abs(q.x - p.x) < 1 && Math.abs(q.y - p.y) < 1);
  return on(pv) && on(pr);
});
check("cir: V1+ und R1 elektrisch verbunden", sameNet);
check("cir: keine Build-Fehler", nets.errors.length === 0, nets.errors.join("; "));

/* LTspice .asc */
const asc = [
  "Version 4",
  "SHEET 1 880 680",
  "WIRE 176 128 96 128",
  "WIRE 256 128 232 128",
  "FLAG 96 128 VCC",
  "SYMBOL voltage 96 160 R0",
  "SYMATTR InstName V1",
  "SYMATTR Value 5",
  "SYMBOL res@2 208 128 R90",
  "SYMATTR InstName R1",
  "SYMATTR Value 10k",
  "SYMBOL weirdthing 400 400 R0",
].join("\n");
check("asc: Erkennung", isLtspiceAsc(asc));
const adoc = fromLtspiceAsc(asc);
check("asc: 2 bekannte Bauteile", adoc.instances.length === 2, `${adoc.instances.length}`);
check("asc: InstName + Wert", adoc.instances.find((i) => i.label === "R1")?.params.r === 1e4);
check("asc: Rotation R90", adoc.instances.find((i) => i.label === "R1")?.rot === 90);
check("asc: Drähte übernommen", adoc.wires.length === 2, `${adoc.wires.length}`);
check("asc: Flag als Label", adoc.labels.some((l) => l.name === "VCC"));
check("asc: unbekanntes Symbol als Notiz", adoc.notes.some((n) => n.text.includes("unbekannte Symbole")));

console.log(failed === 0 ? "\nAlle Import-Checks bestanden." : `\n${failed} Checks fehlgeschlagen.`);
process.exit(failed === 0 ? 0 : 1);
