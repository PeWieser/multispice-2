/* Symbol-QA: exportiert alle Katalog-Symbole (IEC + ANSI wo abweichend) als JSON.
 * Run: npx tsx scripts/symbolsheet-export.ts > /tmp/symbols.json */
import { PARTS, getPartSymbol, partPins } from "../src/lib/library/catalog";
import { switchPreviewPrims } from "../src/lib/interactive/switches";

const out = PARTS.map((p) => {
  const iec = [...getPartSymbol(p, "iec"), ...switchPreviewPrims(p)];
  const ansi = [...getPartSymbol(p, "ansi"), ...switchPreviewPrims(p)];
  let pins: Array<{ name: string; x: number; y: number }> = [];
  try {
    pins = partPins(p).map((q) => ({ name: q.name, x: q.x, y: q.y }));
  } catch {
    pins = p.pins.map((q) => ({ name: q.name, x: q.x, y: q.y }));
  }
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    ref: p.ref,
    pins,
    iec,
    ansi: JSON.stringify(ansi) === JSON.stringify(iec) ? null : ansi,
  };
});
console.log(JSON.stringify(out));
