/* W4-Regressionstest (S5.33): Jedes GATE/DIGITAL-Device jedes Katalogteils muss
 * auf ein bekanntes Modell zeigen, exakt dessen Pinzahl liefern und jeder
 * Pin muss in mindestens einem Device vorkommen (keine toten/halb simulierten
 * ICs mehr). Fängt Fehl-Mappings Modell↔Name/Pinout für immer ab.
 * Run: tsx scripts/check-ic-models.ts (Teil von npm test). */
import { PARTS, partPins } from "../src/lib/library/catalog";
import { DIGITAL_MODEL_PINS } from "../src/lib/sim/digital";

const fails: string[] = [];
let checked = 0;
for (const part of PARTS) {
  const defs: Record<string, number | string | boolean> = {};
  for (const p of part.params) defs[p.key] = p.def;
  const pins = partPins(part, defs);
  const nets = pins.map((_, i) => `n${i}`);
  let devs;
  try {
    devs = part.toDevices({ id: "T", partId: part.id, params: defs }, nets);
  } catch {
    fails.push(`${part.id}: toDevices wirft`);
    continue;
  }
  const dig = devs.filter((d) => d.type === "GATE" || d.type === "DIGITAL");
  if (!dig.length) continue; // keine Digital-Devices (Verbinder, Diskrete, …)
  checked++;
  for (const d of dig) {
    const model = (d.model ?? "").toLowerCase();
    const want = DIGITAL_MODEL_PINS[model];
    if (want === undefined) {
      fails.push(`${part.id}: unbekanntes Modell "${d.model}"`);
      continue;
    }
    if (d.nodes.length !== want) fails.push(`${part.id}: Modell ${model} hat ${d.nodes.length} Knoten, braucht ${want}`);
  }
  const covered = new Set(devs.flatMap((d) => d.nodes));
  pins.forEach((pin, i) => {
    if (!covered.has(`n${i}`)) fails.push(`${part.id}: Pin ${pin.name} hängt in keinem Device`);
  });
}

if (!fails.length) console.log(`\nIC-Modell-Konsistenz: alle ${checked} Digital-Teile sauber.`);
else {
  for (const f of fails) console.log(`FAIL ${f}`);
  console.log(`\nIC-Modell-Konsistenz: ${fails.length} FEHLER`);
  process.exit(1);
}
