/**
 * Sprint-5-Akzeptanztests (S5.1–S5.9), je Block ein Abschnitt.
 * Start: npx tsx scripts/sprint5test.ts
 */
import { strict as assert } from "node:assert";
import { formatValue, parseValue } from "../src/lib/format";
import { formatValue as catFormat, parseValue as catParse } from "../src/lib/library/catalog";
import { PLACE_ARROW_SHIFT_FACTOR, resolveEscape } from "../src/lib/keyboard";
import { analysisLabel, completionNote, simLiveText, summarizeCircuit } from "../src/lib/a11y";
import {
  SHARE_URL_LIMIT,
  b64urlToBytes,
  buildShareUrl,
  bytesToB64url,
  decodeSharePayload,
  encodeSharePayload,
  parseShareHash,
} from "../src/lib/share";
import { DEFAULT_WIZARD_PARAMS, WIZARDS, buildWizard, calcWizard } from "../src/lib/wizards";
import { buildNets } from "../src/lib/schematic/model";
import { runOperatingPoint } from "../src/lib/sim/analyses";

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

// ---------- S5.3: Esc-Kette ----------
{
  const F = false, T = true;
  // Priorität: Overlay > Messleitung > Auswahl > Werkzeug
  assert.equal(resolveEscape({ overlay: T, lead: T, selection: T, tool: T }), "close-overlay");
  assert.equal(resolveEscape({ overlay: F, lead: T, selection: T, tool: T }), "disarm-lead");
  assert.equal(resolveEscape({ overlay: F, lead: F, selection: T, tool: T }), "clear-selection");
  assert.equal(resolveEscape({ overlay: F, lead: F, selection: F, tool: T }), "reset-tool");
  assert.equal(resolveEscape({ overlay: F, lead: F, selection: F, tool: F }), "none");
  // Einzel-Ebenen
  assert.equal(resolveEscape({ overlay: T, lead: F, selection: F, tool: F }), "close-overlay");
  assert.equal(resolveEscape({ overlay: F, lead: T, selection: F, tool: F }), "disarm-lead");
  // Pfeil-Faktor beim Platzieren
  assert.equal(PLACE_ARROW_SHIFT_FACTOR, 5);
  ok("S5.3 Esc-Kette");
}

// ---------- S5.4: Screenreader-Texte ----------
{
  assert.equal(analysisLabel("ac"), "AC-Analyse");
  assert.equal(analysisLabel("tran"), "Transientenanalyse");
  assert.equal(analysisLabel("xyz"), "xyz");
  assert.equal(analysisLabel(""), "Analyse");
  ok("S5.4 Analyse-Labels");
  // Zusammenfassungs-Snapshots
  const I = (partId: string) => ({ partId });
  const N = (name: string) => ({ name });
  assert.equal(
    summarizeCircuit([I("resistor"), I("resistor"), I("resistor"), I("opamp_lm741")], [N("0"), N("OUT")], [], []),
    "3× Widerstand, 1× LM741, 2 Netze, ERC still",
  );
  assert.equal(summarizeCircuit([], [], [], []), "keine Bauteile, 0 Netze, ERC still");
  assert.equal(
    summarizeCircuit([I("resistor")], [N("0")], ["Kurzschluss"], ["offenes Ende", "Pin frei"]),
    "1× Widerstand, 1 Netz, ERC: 1 Fehler, 2 Warnungen",
  );
  assert.equal(
    summarizeCircuit([I("nope")], [N("0")], [], ["w"]),
    "1× nope, 1 Netz, ERC: 1 Warnung",
  );
  ok("S5.4 Zusammenfassung");
  // Sim-Live-Region
  const base = { running: false, liveOk: true, analysisKind: "", analysisRunning: false };
  assert.equal(simLiveText(base), "Simulation bereit");
  assert.equal(simLiveText({ ...base, running: true }), "Simulation läuft");
  assert.equal(simLiveText({ ...base, liveOk: false, liveMessage: "singulär" }), "Simulationsfehler: singulär");
  assert.equal(simLiveText({ ...base, liveOk: false }), "Simulationsfehler: keine Konvergenz");
  assert.equal(
    simLiveText({ ...base, running: true, analysisKind: "ac", analysisRunning: true }),
    "Analyse AC-Analyse läuft …",
  );
  assert.equal(
    simLiveText({ ...base, analysisKind: "tran", analysisError: "boom" }),
    "Analyse Transientenanalyse fehlgeschlagen: boom",
  );
  assert.equal(completionNote(true, false, undefined, "ac"), "Analyse AC-Analyse abgeschlossen");
  assert.equal(completionNote(true, false, "x", "ac"), null);
  assert.equal(completionNote(false, false, undefined, "ac"), null);
  assert.equal(completionNote(true, true, undefined, "ac"), null);
  ok("S5.4 Sim-Texte");
}

// ---------- S5.5: Link-Teilen ----------
{
  // base64url-Roundtrip (alle Restlängen 0..2)
  for (const len of [0, 1, 2, 3, 4, 5, 100, 1000]) {
    const bytes = Uint8Array.from({ length: len }, (_, i) => (i * 37 + 11) % 256);
    assert.deepEqual(b64urlToBytes(bytesToB64url(bytes)), bytes);
  }
  assert.match(bytesToB64url(Uint8Array.from([255, 254, 253])), /^[A-Za-z0-9\-_]+$/);
  assert.throws(() => b64urlToBytes("!"), /beschädigt/);
  assert.throws(() => b64urlToBytes("abcde"), /Länge/);
  ok("S5.5 base64url");
  // Codec-Roundtrip inkl. Umlaute/Ω/µ
  const docs = [
    '{"format":"multispice-project","doc":{"name":"Grüße Ωµ","instances":[]}}',
    JSON.stringify({ big: "x".repeat(50000) }),
  ];
  for (const d of docs) assert.equal(decodeSharePayload(encodeSharePayload(d)), d);
  // Kompression greift (wiederholtes Muster schrumpft massiv)
  assert.ok(encodeSharePayload(docs[1]).length < docs[1].length / 10);
  assert.throws(() => decodeSharePayload("!!!"), /beschädigt/);
  assert.throws(() => decodeSharePayload(bytesToB64url(Uint8Array.from([1, 2, 3]))), /.+/);
  ok("S5.5 Codec-Roundtrip");
  // Hash-Format + Limit
  assert.equal(parseShareHash("#s=abc"), "abc");
  assert.equal(parseShareHash("s=abc"), "abc");
  assert.equal(parseShareHash("#x=abc"), null);
  assert.equal(parseShareHash("#s="), null);
  assert.equal(parseShareHash(""), null);
  assert.equal(buildShareUrl("https://x.test/app", "abc"), "https://x.test/app#s=abc");
  assert.equal(SHARE_URL_LIMIT, 100_000);
  ok("S5.5 Hash + Limit");
}

// ---------- S5.6a: Wizard-Builder (extrahiert) bauen + OP-konvergieren ----------
{
  assert.equal(WIZARDS.length, 12);
  for (const wiz of WIZARDS) {
    const doc = buildWizard(wiz.id, { ...DEFAULT_WIZARD_PARAMS });
    assert.ok(doc.instances.length > 0, `${wiz.id}: keine Bauteile`);
    const built = buildNets(doc);
    assert.ok(built.netlist.devices.length > 0, `${wiz.id}: keine Devices`);
    const op = runOperatingPoint(built.netlist, {});
    assert.ok(op.ok, `${wiz.id}: OP divergiert (${op.message ?? "?"})`);
    assert.ok(calcWizard(wiz.id, { ...DEFAULT_WIZARD_PARAMS }).length > 0, `${wiz.id}: keine Calc-Zeilen`);
  }
  ok("S5.6a 12 Wizards bauen + OP-ok");
}

console.log(`sprint5test: ${n} checks OK`);
