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
import { DEFAULT_WIZARD_PARAMS, WIZARDS, buildWizard, calcWizard, nearestE12 } from "../src/lib/wizards";
import { buildNets, emptyDoc } from "../src/lib/schematic/model";
import { PART_MAP } from "../src/lib/library/catalog";
import { resolveLiveText } from "../src/lib/descbox";
import { hashTeacherCode, isTeacherCodeFormat, loadTeacherLock, verifyTeacherCode } from "../src/lib/teacher";
import { curveStats, fMinus3dB } from "../src/lib/measure";
import { combineSeries, envelopeWindow, movingEnvelope, postFFT, resampleUniform } from "../src/lib/postprocess";
import { applyParamToNetlist } from "../src/lib/sim/analyses";
import { runAnalysisLocal } from "../src/lib/sim/runner";
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
  // S5.6b: keine signifikanten Nullen fressen (150 Ω ≠ 15 Ω)
  assert.equal(formatValue(150, "Ω"), "150 Ω");
  assert.equal(formatValue(470, ""), "470");
  assert.equal(formatValue(100, ""), "100");
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
  assert.equal(WIZARDS.length, 14);
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

// ---------- S5.6b: LED-Rechner + Schmitt-Trigger ----------
{
  // E12-Normwerte
  assert.equal(nearestE12(150), 150);
  assert.equal(nearestE12(149), 150);
  assert.equal(nearestE12(1000), 1000);
  assert.equal(nearestE12(5000), 4700);
  assert.equal(nearestE12(0), 0);
  assert.equal(nearestE12(-5), 0);
  ok("S5.6b E12");
  // LED-Dimensionierung (5 V, 2 V, 20 mA → 150 Ω exakt, E12 150 Ω)
  const led = calcWizard("led_resistor", { ...DEFAULT_WIZARD_PARAMS });
  assert.deepEqual(
    led.map(([k, v]) => [k, v]),
    [
      ["Versorgung U_V", "5 V"],
      ["Flussspannung U_F", "2 V"],
      ["Strom I", "20 mA"],
      ["Rechnerisch R", "150Ω"],
      ["Gewählt (E12)", "150Ω"],
      ["Verlustleistung R", "60 mW"],
    ],
  );
  // Schmitt-Hysterese (10k/10k an ±15 V → ±6.5 V)
  const st = calcWizard("schmitt_trigger", { ...DEFAULT_WIZARD_PARAMS });
  assert.deepEqual(
    st.map(([k, v]) => [k, v]),
    [
      ["Versorgung", "±15 V (fest)"],
      ["Eingang", "10 V, 100 Hz (fest)"],
      ["Eingang R1", "10 kΩ"],
      ["Rückkopplung R2", "10 kΩ"],
      ["Schaltschwelle Vth+", "+6.50 V"],
      ["Schaltschwelle Vth−", "−6.50 V"],
      ["Hysterese", "13.00 V"],
    ],
  );
  ok("S5.6b Calc-Snapshots");
}

// ---------- S5.6c: Beschreibungsbox ----------
{
  const live = { nets: { OUT: 3.3, IN: 5 }, currents: { R1: 0.02 }, power: { R1: 0.04 } };
  assert.equal(resolveLiveText("Ausgang: {V(OUT)}", live), "Ausgang: 3.3 V");
  assert.equal(resolveLiveText("{V(IN)} → {I(R1)} / {P(R1)}", live), "5 V → 20 mA / 40 mW");
  assert.equal(resolveLiveText("{V(XX)}", live), "—");
  assert.equal(resolveLiveText("{I(XX)}", live), "—");
  assert.equal(resolveLiveText("{V(OUT)}", null), "—");
  assert.equal(resolveLiveText("kein {Platzhalter} hier {V( offen", live), "kein {Platzhalter} hier {V( offen");
  assert.equal(resolveLiveText("a{V( OUT )}b", live), "a3.3 Vb");
  ok("S5.6c Live-Platzhalter");
  // Bauteil registriert, pinlos, baut fehlerfrei (kein Device)
  const part = PART_MAP["descbox"];
  assert.ok(part, "descbox fehlt im Katalog");
  assert.equal(part.pins.length, 0);
  assert.deepEqual(part.toDevices({} as never, {} as never), []);
  const doc = emptyDoc("box");
  doc.instances.push({ id: "tb1", partId: "descbox", label: "TB1", x: 0, y: 0, rot: 0, params: { text: "U={V(OUT)}" } });
  const built = buildNets(doc);
  assert.deepEqual(built.errors, []);
  assert.equal(built.netlist.devices.length, 0);
  ok("S5.6c Bauteil + Build");
}

// ---------- S5.6d: Lehrer-Modus ----------
{
  assert.ok(isTeacherCodeFormat("1234"));
  assert.ok(isTeacherCodeFormat("0000"));
  assert.ok(!isTeacherCodeFormat("123"));
  assert.ok(!isTeacherCodeFormat("12345"));
  assert.ok(!isTeacherCodeFormat("12a4"));
  assert.ok(!isTeacherCodeFormat(""));
  // Hash stabil + codespezifisch, kein Klartext
  const h1 = hashTeacherCode("1234");
  assert.equal(h1, hashTeacherCode("1234"));
  assert.notEqual(h1, hashTeacherCode("4321"));
  assert.ok(!h1.includes("1234"));
  assert.match(h1, /^[0-9a-f]{8}$/);
  assert.ok(verifyTeacherCode("1234", h1));
  assert.ok(!verifyTeacherCode("4321", h1));
  assert.ok(!verifyTeacherCode("12", h1));
  // Node (kein window): Standard = entsperrt ohne Code
  assert.deepEqual(loadTeacherLock(), { locked: false, codeHash: null });
  ok("S5.6d Code + Hash");
}

// ---------- S5.7: Mess-Panel + Postprozessor ----------
{
  const st = curveStats([1, 2, 3, 4]);
  assert.equal(st.min, 1);
  assert.equal(st.max, 4);
  assert.equal(st.mean, 2.5);
  assert.ok(Math.abs(st.rms - Math.sqrt(7.5)) < 1e-12);
  const nan = curveStats([]);
  assert.ok(Number.isNaN(nan.min) && Number.isNaN(nan.rms));
  assert.equal(curveStats([2, NaN, 4]).mean, 3);
  // Tiefpass 1 kHz: f−3dB ≈ 1000 Hz
  const freq: number[] = [];
  for (let f = 10; f <= 100000; f *= 1.05) freq.push(f);
  const mag = freq.map((f) => -10 * Math.log10(1 + (f / 1000) ** 2));
  const f3 = fMinus3dB(freq, mag);
  assert.ok(f3 !== null && Math.abs(f3 - 1000) < 50, `f3=${f3}`);
  assert.equal(fMinus3dB(freq, freq.map(() => 0)), null);
  assert.equal(fMinus3dB([1], [0]), null);
  ok("S5.7 Messwerte");
  // Verknüpfungen
  assert.deepEqual(combineSeries([1, 2], [10, 20], "add"), [11, 22]);
  assert.deepEqual(combineSeries([1, 2], [10, 20], "sub"), [-9, -18]);
  assert.deepEqual(combineSeries([2, 3], [4, 5], "mul"), [8, 15]);
  assert.deepEqual(combineSeries([1, 2, 3], [1, 1], "add"), [2, 3]);
  const db = combineSeries([2, 1], [1, 0], "divDb");
  assert.ok(Math.abs(db[0] - 6.0206) < 1e-3);
  assert.ok(Number.isNaN(db[1]));
  // Hüllkurven
  assert.deepEqual(movingEnvelope([2, 2, 2, 2], 2, "rms"), [2, 2, 2, 2]);
  assert.deepEqual(movingEnvelope([0, 0, 4, 4], 2, "avg"), [0, 0, 2, 4]);
  assert.equal(envelopeWindow(1000), 10);
  assert.equal(envelopeWindow(10), 4);
  // Umtasten
  const rs = resampleUniform([0, 1], [0, 10], 3);
  assert.deepEqual(rs.t, [0, 0.5, 1]);
  assert.deepEqual(rs.y, [0, 5, 10]);
  // FFT: 50-Hz-Sinus → Peak bei 50 Hz
  const t: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 1000; i++) { t.push(i / 1000); y.push(Math.sin(2 * Math.PI * 50 * (i / 1000))); }
  const fft = postFFT(t, y);
  let peak = 1;
  for (let i = 2; i < fft.magDb.length; i++) if (fft.magDb[i] > fft.magDb[peak]) peak = i;
  assert.ok(Math.abs(fft.freq[peak] - 50) < 2, `peak=${fft.freq[peak]}`);
  assert.ok(fft.sampleRate > 900 && fft.sampleRate < 1100);
  ok("S5.7 Postprozessor");
}

// ---------- S5.8: Nested Sweep, Batched, THD-Sweep ----------
{
  // Param-Schreiber (Alias + Robustheit)
  const nl = { devices: [{ id: "R1", type: "R", nodes: ["a", "b"], params: { r: 1000 } }] } as never;
  applyParamToNetlist(nl, "R1.resistance", 2200);
  assert.equal((nl.devices[0] as { params: { r: number } }).params.r, 2200);
  applyParamToNetlist(nl, "R1.r", 3300);
  assert.equal((nl.devices[0] as { params: { r: number } }).params.r, 3300);
  applyParamToNetlist(nl, "??", 1);
  applyParamToNetlist(nl, "", 1);
  ok("S5.8 Param-Schreiber");
  // Nested 2×2 am Spannungsteiler (Wizard-Fixture)
  const div = buildWizard("voltage_divider", { ...DEFAULT_WIZARD_PARAMS });
  const n = runAnalysisLocal(div, "nested", {
    param: "R1.r",
    sweep: { start: 1000, stop: 10000, points: 2, type: "lin" },
    param2: "R2.r",
    sweep2: { start: 1000, stop: 10000, points: 2, type: "lin" },
    outputs: ["OUT"],
    tran: { stopTime: 0.005, stepTime: 1e-5 },
  });
  const nc = n.result as { curves: Array<{ param1: number; param2: number; signals: Record<string, number[]> }>; values1: number[]; values2: number[] };
  assert.equal(nc.curves.length, 4);
  assert.deepEqual(nc.values1, [1000, 10000]);
  assert.deepEqual(nc.values2, [1000, 10000]);
  const outs = nc.curves.map((c) => c.signals["OUT"][0]);
  // (1k,1k)→2.5 V … (10k,1k)→0.45 V: Sweep wirkt
  assert.ok(Math.abs(outs[0] - 2.5) < 0.01, `outs=${outs}`);
  assert.ok(Math.abs(outs[2] - 5 / 11) < 0.01, `outs=${outs}`);
  ok("S5.8 Nested Sweep");
  // Batched: DC+AC+TRAN in einem Report
  const b = runAnalysisLocal(div, "batched", {
    sourceId: "V1",
    sweep: { start: 0, stop: 5, points: 5, type: "lin" },
    outputs: ["OUT"],
    tran: { stopTime: 0.005, stepTime: 1e-5 },
  });
  const br = b.result as { dc: { values: number[] }; ac: { freq: number[] }; tran: { time: number[] }; ok: boolean };
  assert.ok(br.ok && b.errors.length === 0);
  assert.equal(br.dc.values.length, 5);
  assert.ok(br.ac.freq.length > 5);
  assert.ok(br.tran.time.length > 5);
  ok("S5.8 Batched");
  // THD-Sweep am Gleichrichter (nichtlinear → THD hoch)
  const hw = buildWizard("halfwave", { ...DEFAULT_WIZARD_PARAMS });
  const t = runAnalysisLocal(hw, "thdsweep", { fundamental: 1000, outNode: "VOUT", param: "V1.amplitude", levels: [1, 5] });
  const tr = t.result as { levels: number[]; thdPercent: number[] };
  assert.deepEqual(tr.levels, [1, 5]);
  assert.ok(tr.thdPercent.every((v) => v > 50), `thd=${tr.thdPercent}`);
  ok("S5.8 THD-Sweep");
}

console.log(`sprint5test: ${n} checks OK`);
