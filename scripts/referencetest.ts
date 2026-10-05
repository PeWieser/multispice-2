/**
 * S5.24: E-Reihen/Schritt-Logik, Referenz-Decoder, Suffix-Spiegel + Verdrahtungs-Wächter.
 * Rein + DOM-frei (Logik), UI-Anteile als statische Quell-Checks wie in notetest.ts.
 */
import { E12, E24, E6, nearestEValue, stepEValue, stepPercent } from "../src/lib/values/series";
import {
  RESISTOR_COLORS,
  VALUE_SUFFIX_ROWS,
  decodeCapacitorCode,
  decodeSmdResistor,
} from "../src/lib/reference/tables";
import { parseValue } from "../src/lib/format";
import { readFileSync } from "node:fs";

let failed = 0;
function check(name: string, ok: boolean, info = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` – ${info}` : ""}`);
  if (!ok) failed++;
}
const eq = (a: number, b: number) => Math.abs(a - b) <= Math.abs(b) * 1e-9 + 1e-18;

/* 1 · E-Tabellen exakt */
{
  check("E6 hat 6 Werte", E6.length === 6 && E6[0] === 10 && E6[5] === 68);
  check("E12 hat 12 Werte", E12.length === 12 && E12.join(",") === "10,12,15,18,22,27,33,39,47,56,68,82");
  check("E24 hat 24 Werte", E24.length === 24 && E24[0] === 10 && E24[23] === 91 && E24.includes(43));
}

/* 2 · Reihen-Schritte */
{
  check("E12 hoch ab Reihe", eq(stepEValue(1000, "E12", 1), 1200));
  check("E12 runter ab Reihe", eq(stepEValue(1000, "E12", -1), 820));
  check("E12 hoch zwischen Reihen", eq(stepEValue(1100, "E12", 1), 1200));
  check("E12 runter zwischen Reihen", eq(stepEValue(1100, "E12", -1), 1000));
  check("Dekade hoch", eq(stepEValue(8200, "E12", 1), 10000));
  check("Dekade runter", eq(stepEValue(1000, "E12", -1), 820));
  check("kleine Werte", eq(stepEValue(0.1, "E12", 1), 0.12));
  check("E6-Schritt", eq(stepEValue(1000, "E6", 1), 1500));
  check("E24-Schritt", eq(stepEValue(1000, "E24", 1), 1100));
  check("Null startet bei 10", stepEValue(0, "E12", 1) === 10 && stepEValue(-5, "E12", -1) === 10);
  check("nächster Wert", eq(nearestEValue(1150, "E12"), 1200) && eq(nearestEValue(1050, "E12"), 1000));
}

/* 3 · Prozent-Schritte */
{
  check("5 % hoch", eq(stepPercent(100, 1), 105));
  check("5 % runter", eq(stepPercent(100, -1), 95));
  check("1 % fein", eq(stepPercent(100, 1, 0.01), 101));
  check("Null → ±1", stepPercent(0, 1) === 1 && stepPercent(0, -1) === -1);
  check("negativ wächst Richtung Null", eq(stepPercent(-100, 1), -95) && eq(stepPercent(-100, -1), -105));
}

/* 4 · Decoder */
{
  check("Kerko 104 = 100 nF", eq(decodeCapacitorCode("104")!, 100e-9));
  check("Kerko 22 = 22 pF", eq(decodeCapacitorCode("22")!, 22e-12));
  check("Kerko 106 = 10 µF", eq(decodeCapacitorCode("106")!, 10e-6));
  check("Kerko Unsinn = null", decodeCapacitorCode("abc") === null && decodeCapacitorCode("1") === null);
  check("SMD 103 = 10 kΩ", eq(decodeSmdResistor("103")!, 10000));
  check("SMD 1002 = 10 kΩ", eq(decodeSmdResistor("1002")!, 10000));
  check("SMD 4R7 = 4,7 Ω", eq(decodeSmdResistor("4R7")!, 4.7));
  check("SMD R10 = 0,1 Ω", eq(decodeSmdResistor("R10")!, 0.1));
  check("SMD 0 = Brücke", decodeSmdResistor("000") === 0);
  check("SMD EIA-96 ehrlich null", decodeSmdResistor("01C") === null);
  check("Farbcode 12 Farben", RESISTOR_COLORS.length === 12);
  const braun = RESISTOR_COLORS.find((r) => r.name === "Braun")!;
  check("Braun = 1/±1 %/100 ppm", braun.digit === 1 && braun.tol === "±1 %" && braun.tc === "100");
  const gold = RESISTOR_COLORS.find((r) => r.name === "Gold")!;
  check("Gold = ×0,1/±5 %", gold.mult === "×0,1" && gold.tol === "±5 %");
}

/* 5 · Suffix-Spiegel: Jede Doku-Zeile parst exakt auf ihren Faktor. */
{
  for (const row of VALUE_SUFFIX_ROWS) {
    if (row.suffix === "—") continue;
    for (const s of row.suffix.split("/")) {
      check(`Suffix ${s} = ${row.factor}`, parseValue(`1${s}`) === row.factor);
    }
  }
  check("4k7-Schreibweise", parseValue("4k7") === 4700);
  check("MEG-Schreibweise", parseValue("1meg") === 1e6);
  check("f allein = Farad", parseValue("1f") === 1);
}

/* 6 · Verdrahtungs-Wächter */
{
  const catalog = readFileSync("src/lib/library/catalog.ts", "utf8");
  const check2 = (name: string, ok: boolean, info = "") => check(name, ok, info);
  check2("NTC/LDR unter Sensoren", catalog.includes('id: "ntc"') && /id: "ntc",[\s\S]{0,120}?category: "Sensoren"/.test(catalog) && /id: "ldr",[\s\S]{0,120}?category: "Sensoren"/.test(catalog));
  check2("Regler unter Stromversorgung", catalog.includes('category: "Stromversorgung/Spannungsregler"'));
  check2("GND/VCC unter Bezugspotenziale", catalog.includes('category: "Stromversorgung/Bezugspotenziale"'));
  const icons = readFileSync("src/lib/library/icons.tsx", "utf8");
  check2("Rubrik-Farben + Icon", icons.includes('"Stromversorgung"') && icons.includes("versorgung") && icons.includes('"Sensoren"'));
  const palette = readFileSync("src/components/LibraryPalette.tsx", "utf8");
  check2(
    "Mitte ohne Fülltext + Kategoriezeile",
    !palette.includes("part.mount} · ${part.footprint") && !palette.includes("CategoryIcon category={part.category}")
  );
  check2("Pins einklappbar", palette.includes("<details") && palette.includes("partPins(detailPart).length <= 8"));
  const canvas = readFileSync("src/components/Canvas.tsx", "utf8");
  check2(
    "Wertfenster nach Platzieren",
    canvas.includes("openPlacedValueEditor") && canvas.includes('["resistor", "capacitor", "inductor", "vdc", "idc", "vac"]')
  );
  check2("Serie überlebt Wert-Eingabe", canvas.includes('if (!st.placingPartId) st.setTool("select")'));
  const field = readFileSync("src/components/ui/Field.tsx", "utf8");
  check2("NumberField mit Rad", field.includes("wheel?:") && field.includes('addEventListener("wheel"') && field.includes("passive: false"));
  const inspector = readFileSync("src/components/Inspector.tsx", "utf8");
  check2("Inspector: E-Reihe nur R", inspector.includes("stepEValue(cur, loadESeries(), dir)") && inspector.includes('partId === "resistor"'));
  const inline = readFileSync("src/components/InlineEditor.tsx", "utf8");
  check2("Wertefeld mit Rad", inline.includes('wheelMode?: "e-series" | "percent"'));
  const settings = readFileSync("src/components/SettingsDialog.tsx", "utf8");
  check2("E-Reihen-Einstellung", settings.includes("Bauteilwerte") && settings.includes("ESeriesPref"));
  const menu = readFileSync("src/components/MenuBar.tsx", "utf8");
  check2("Hilfe → Referenz", menu.includes('label="Hilfe"') && menu.includes("onReference"));
  const workbench = readFileSync("src/components/Workbench.tsx", "utf8");
  check2("Referenz-Dialog verdrahtet", workbench.includes("ReferenceDialog") && workbench.includes("setReferenceOpen(true)"));
}

console.log(failed === 0 ? "\nReferenz-Prüfungen: alle bestanden." : `\nReferenz-Prüfungen: ${failed} FEHLER`);
if (failed) process.exit(1);
