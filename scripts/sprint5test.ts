/**
 * Sprint-5-Akzeptanztests (S5.1–S5.9), je Block ein Abschnitt.
 * Start: npx tsx scripts/sprint5test.ts
 */
import { strict as assert } from "node:assert";
import { formatValue, parseValue } from "../src/lib/format";
import { formatValue as catFormat, parseValue as catParse } from "../src/lib/library/catalog";

let n = 0;
const ok = (name: string) => { n++; console.log(`  ok ${n} ${name}`); };

// ---------- S5.2: lib/format.ts ----------
{
  // M-Fix: großes M = Mega, kleines m = Milli
  assert.equal(parseValue("1M"), 1e6);
  assert.equal(parseValue("1M5"), 1.5e6);
  assert.equal(parseValue("1m"), 1e-3);
  assert.equal(parseValue("1meg"), 1e6);
  assert.equal(parseValue("2MEG"), 2e6);
  ok("S5.2 parse M/m");
  // etablierte Schreibweisen
  assert.equal(parseValue("4k7"), 4700);
  assert.equal(parseValue("2µ2"), 2.2e-6);
  assert.equal(parseValue("2u2"), 2.2e-6);
  assert.equal(parseValue("10n"), 1e-8);
  assert.equal(parseValue("1R5"), 1.5);
  assert.ok(Math.abs(parseValue("10uF") - 1e-5) < 1e-12);
  assert.equal(parseValue(" 4.7k "), 4700);
  assert.equal(parseValue("-5m"), -0.005);
  assert.equal(parseValue(4711), 4711);
  assert.ok(Number.isNaN(parseValue("abc")));
  assert.equal(parseValue("1f"), 1); // legacy: F-Endung = Farad-Einheit
  ok("S5.2 parse etabliert");
  // Anzeige mit SI-Präfix
  assert.equal(formatValue(4700, "Ω"), "4.7 kΩ");
  assert.equal(formatValue(2.2e-6, "F"), "2.2 µF");
  assert.equal(formatValue(1e6, ""), "1 M");
  assert.equal(formatValue(1500, ""), "1.5 k");
  assert.equal(formatValue(0.001, ""), "1 m");
  assert.equal(formatValue(0, "V"), "0 V");
  assert.equal(formatValue(NaN, "V"), "—");
  ok("S5.2 format SI");
  // catalog.ts re-exportiert dieselbe Implementierung
  assert.equal(catParse("1M"), 1e6);
  assert.equal(catParse("4k7"), 4700);
  assert.equal(catFormat(4700, "Ω"), "4.7 kΩ");
  ok("S5.2 catalog-Reexport");
}

console.log(`sprint5test: ${n} checks OK`);
