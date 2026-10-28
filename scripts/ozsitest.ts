/**
 * Runde 24 (W60): Oszilloskop – Doku-konform im Run, Standbild im Stop/Single.
 *
 * PORTIERUNG.md §10.1/§10.2 wollen `env.probes` im `settingsKey` und eine
 * Neuaufnahme bei geänderten Einstellungen. Am echten Gerät gilt trotzdem:
 * Steht das Bild (Stop bzw. Single nach der Aufnahme), wird nicht neu gemessen.
 * Der Test prüft beides – und dass der R22-Fix (keine 0-V-Linie aus pausierter
 * Simulation) erhalten bleibt.
 */
import { BW_NOISE_GAIN, Engine, FRONTEND_NOISE, HDIV, NPTS, acquire, adcLSB, findTrigger } from "../src/components/oszi2/engine";
import { TDIV_MAX, defaultSettings, type Env, type Settings } from "../src/components/oszi2/types";
import { applyKnob } from "../src/components/oszi2/menus";
import { ARCH_CAP, ARCH_DT } from "../src/lib/sim/realtime";

let failed = 0;
function check(name: string, ok: boolean, info = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` – ${info}` : ""}`);
  if (!ok) failed++;
}

// S5.20: Netz "0" (Masse/Referenz) liefert 0 V wie der echte Sampler —
// sonst löscht die Differenzmessung (gndRef) das Signal fälschlich aus.
const sampler = (net: string, t: number) => {
  if (!net || net === "0") return 0;
  return Math.sin(2 * Math.PI * 1000 * t) * 2;
};

function makeEnv(target = "N001"): Env {
  return {
    probes: [
      { target, atten: 1, comp: 0 },
      { target: null, atten: 1, comp: 0 },
      { target: null, atten: 1, comp: 0 },
      { target: null, atten: 1, comp: 0 },
    ],
    gndRef: "0",
    sampler,
  };
}

const settings = (over: Partial<Settings> = {}): Settings => ({ ...defaultSettings(), ...over });

/* 1 · Schlüssel enthält jetzt die Verdrahtung (Doku §10.1) */
{
  const eng = new Engine();
  const s = settings();
  const a = makeEnv("N001");
  const b = makeEnv("N002");
  check("settingsKey ändert sich mit anderer Messleitung", eng.settingsKey(s, a) !== eng.settingsKey(s, b));
  check("settingsKey bleibt bei gleicher Verdrahtung gleich", eng.settingsKey(s, a) === eng.settingsKey(s, makeEnv("N001")));
  const eng2 = new Engine();
  check("settingsKey ändert sich mit V/div", eng2.settingsKey(s, a) !== eng2.settingsKey({ ...s, ch: s.ch.map((c, i) => (i === 0 ? { ...c, vdiv: c.vdiv * 2 } : c)) }, a));
}

/* 2 · Im Run wird bei geänderter Messleitung neu erfasst */
{
  const eng = new Engine();
  const s = settings({ trig: { ...settings().trig, mode: "auto" } });
  const env = makeEnv("N001");
  let now = 0;
  let acquired = 0;
  for (let i = 0; i < 20; i++) {
    now += 0.02;
    if (eng.step(now, s, env).newAcq) acquired++;
  }
  check("Run: es wird überhaupt erfasst", acquired > 0, `${acquired} Aufnahmen`);
  const before = eng.acqCount;
  // Messleitung umstecken → Doku: Neuaufnahme (und Mittelung verwerfen)
  const env2 = makeEnv("N002");
  let reagiert = 0;
  for (let i = 0; i < 20; i++) {
    now += 0.02;
    if (eng.step(now, s, env2).newAcq) reagiert++;
  }
  check("Run: Umstecken der Messleitung löst Neuaufnahme aus", reagiert > 0 && eng.acqCount > before, `${reagiert} Aufnahmen`);
}

/* 3 · Im Stop bleibt das Bild stehen (R22-Fix bleibt erhalten) */
{
  const eng = new Engine();
  const s = settings({ trig: { ...settings().trig, mode: "auto" } });
  const env = makeEnv("N001");
  let now = 0;
  for (let i = 0; i < 20; i++) {
    now += 0.02;
    eng.step(now, s, env);
  }
  const frozen = eng.display;
  const frozenCount = eng.acqCount;
  check("Standbild vorhanden", frozen !== null && frozen.tt !== undefined);

  const stop = settings({ run: "stop", trig: { ...settings().trig, mode: "auto" } });
  const env2 = makeEnv("N002"); // umgesteckte Leitung
  const stop2: Settings = { ...stop, ch: stop.ch.map((c, i) => (i === 0 ? { ...c, vdiv: c.vdiv * 4 } : c)) };
  let newAcqs = 0;
  for (let i = 0; i < 20; i++) {
    now += 0.02;
    if (eng.step(now, stop2, env2).newAcq) newAcqs++;
  }
  check("Stop: keine Neuaufnahme trotz geänderter Einstellungen", newAcqs === 0, `${newAcqs}`);
  check("Stop: Datensatz unverändert (kein 0-V-Bild)", eng.display === frozen && eng.acqCount === frozenCount);
  check("Stop: Änderung ist für den nächsten Run vorgemerkt", eng.pendingKeyChange === true);

  // Zurück auf Run: die vorgemerkte Änderung greift jetzt
  const run = settings({ run: "run", trig: { ...settings().trig, mode: "auto" } });
  let wieder = 0;
  for (let i = 0; i < 20; i++) {
    now += 0.02;
    if (eng.step(now, run, env2).newAcq) wieder++;
  }
  check("Run nach Stop: Neuaufnahme mit den neuen Einstellungen", wieder > 0 && eng.acqCount > frozenCount, `${wieder} Aufnahmen`);
  check("Vormerkung ist eingelöst", eng.pendingKeyChange === false);
}

/* 4 · Single hält ebenfalls (Bild steht nach der Aufnahme) */
{
  const eng = new Engine();
  const s = settings({ run: "single", trig: { ...settings().trig, mode: "auto" } });
  const env = makeEnv("N001");
  let now = 0;
  let done = false;
  for (let i = 0; i < 40 && !done; i++) {
    now += 0.02;
    const r = eng.step(now, s, env);
    if (r.singleDone) done = true;
  }
  check("Single: eine Aufnahme läuft durch", done && eng.acqCount > 0, `${eng.acqCount} Aufnahmen`);
  // Die Anzeige schaltet nach Single auf 'stop' (so macht es die Oberfläche)
  const stop = settings({ run: "stop", trig: { ...settings().trig, mode: "auto" } });
  const frozen = eng.display;
  const frozenCount = eng.acqCount;
  let newAcqs = 0;
  for (let i = 0; i < 20; i++) {
    now += 0.02;
    if (eng.step(now, stop, env).newAcq) newAcqs++;
  }
  check("Single→Stop: Bild bleibt stehen", newAcqs === 0 && eng.display === frozen && eng.acqCount === frozenCount);
}

/* 5 · S5.20: Historie deckt jede Zeitbasis ab (kein „halbes Signal“) */
{
  const coverage = ARCH_CAP * ARCH_DT; // Sekunden, ratenunabhängig garantiert
  const need = 1.5 * HDIV * TDIV_MAX; // Spanne + max. H-Verzögerung
  check("Archiv deckt Max-Spanne + H-Verzögerung ab", coverage >= need, `${coverage.toFixed(0)} s ≥ ${need} s`);
  check("tdiv-Max ist 10 s/div", TDIV_MAX === 10);
}

/* 6 · S5.20: Horizontal-Geometrie über alle 1-2-5-Schritte (2 ns … 10 s) */
{
  const steps: number[] = [];
  for (let e = -9; e <= 1; e++) for (const m of [1, 2, 5]) { const v = m * 10 ** e; if (v >= 2e-9 && v <= 10) steps.push(v); }
  const s = settings({ ch: settings().ch.map((c, i) => (i === 0 ? { ...c, probe: 1 } : c)) });
  const env = makeEnv("N001");
  let ok = true, n = 0;
  for (const tdiv of steps) {
    const span = HDIV * tdiv;
    const a = acquire(1.0, 0, tdiv, { ...s, tdiv }, env, [0, 0, 0, 0], true);
    n++;
    if (a.dt !== span / NPTS || a.t0 !== -span / 2) { ok = false; break; }
    // Trigger-Sample exakt Bildmitte, Signal dort ≈ 0 (Sinus-Nulldurchgang bei t = 1 s)
    if (Math.abs(a.data[0][NPTS / 2]) > 0.15) { ok = false; break; }
  }
  check("t0/dt/Trigger-Sample auf allen Schritten korrekt", ok, `${n} Schritte`);
}

/* 7 · S5.20: H-Verzögerung ist gesichert (kein scheinbares Einfrieren) */
for (const hd of [1e9, -1e9]) {
  const eng = new Engine();
  const base = settings({ run: "single", tdiv: 1, hDelay: hd, trig: { ...settings().trig, mode: "auto" } });
  const env = makeEnv("N001");
  let now = 0, done = false;
  for (let i = 0; i < 40 && !done; i++) { now += 1; if (eng.step(now, base, env).singleDone) done = true; }
  const d = eng.display!;
  const span = HDIV * 1;
  const t0want = (hd > 0 ? span : -span) - span / 2;
  check(`hDelay ${hd > 0 ? "+" : "−"}∞: Aufnahme vollendet sich begrenzt`, done && d !== null, `tt=${d?.tt.toFixed(1)}`);
  check(`hDelay ${hd > 0 ? "+" : "−"}∞: Fenster geklemmt (t0=${t0want})`, d !== null && Math.abs(d.t0 - t0want) < 1e-9);
  check(`hDelay ${hd > 0 ? "+" : "−"}∞: Trigger in Reichweite`, d !== null && d.tt >= now - 1.5 * span - 1);
}

/* 8 · S5.20: Trigger trifft echte Flanken, schweigt ohne Pegel */
{
  const s = settings({ ch: settings().ch.map((c, i) => (i === 0 ? { ...c, probe: 1 } : c)) });
  const env = makeEnv("N001");
  const f = findTrigger(0, 0.016, s, env, [0, 0, 0, 0]);
  // 1-kHz-Sinus: Nulldurchgänge bei ganzen ms — gefunden muss einer sein (±50 µs)
  const k = f === null ? NaN : f * 1000;
  check("Trigger findet echten Nulldurchgang", f !== null && Math.abs(k - Math.round(k)) < 0.05, f === null ? "keiner" : `${(f * 1000).toFixed(3)} ms`);
  const dcEnv: Env = { ...env, sampler: () => 5 };
  check("Trigger schweigt bei DC ohne Pegelkreuzung", findTrigger(0, 0.016, { ...s, trig: { ...s.trig, level: 10 } }, dcEnv, [0, 0, 0, 0]) === null);
  check("Trigger schweigt bei Pegel über dem Signal", findTrigger(0, 0.016, { ...s, trig: { ...s.trig, level: 10 } }, env, [0, 0, 0, 0]) === null);
}

/* 9 · S5.20: Vertikal — Clamp, Pos-Darv, Invert über alle V/div */
{
  const mk = (vdiv: number, extra = {}) => settings({ ch: settings().ch.map((c, i) => (i === 0 ? { ...c, probe: 1, vdiv, ...extra } : c)) });
  const env2: Env = { ...makeEnv("N001"), sampler: (net, t) => (!net || net === "0" ? 0 : Math.sin(2 * Math.PI * 1000 * t) * 5) };
  const env = makeEnv("N001");
  // V/div-Schritte 1-2-5 von 1 mV bis 10 V: kein Clamp bei 2-V-Sinus auf ≥1 V/div
  let ok = true;
  for (let e = -3; e <= 1; e++) for (const m of [1, 2, 5]) {
    const vdiv = m * 10 ** e;
    if (vdiv > 10) continue;
    const a = acquire(0.00025, 0, 500e-6, mk(vdiv), env, [0, 0, 0, 0], true);
    const d = a.data[0];
    let mx = -Infinity, mn = Infinity;
    for (let i = 0; i < d.length; i++) { if (d[i] > mx) mx = d[i]; if (d[i] < mn) mn = d[i]; }
    const lim = 5.2 * vdiv;
    // S5.21: Toleranz folgt dem physikalischen Rauschen (fest + Quantisierung).
    const sig = Math.sqrt(FRONTEND_NOISE ** 2 + (adcLSB(vdiv) / Math.sqrt(12)) ** 2);
    const tol = 0.05 + 5 * sig;
    const clips = lim < 1.9; // 2-V-Sinus erreicht die Klemme nur unterhalb
    if (!clips) { if (!(mx > 2 - tol && mx < 2 + tol && mn < -2 + tol && mn > -2 - tol)) ok = false; }
    else if (!(mx <= lim + 1e-6 && mn >= -lim - 1e-6 && mx > lim * 0.95)) ok = false; // muss sauber klemmen
  }
  check("Amplitude/Clamp über alle V/div-Schritte", ok);
  const a0 = acquire(0.00025, 0, 500e-6, mk(1), env, [0, 0, 0, 0], true);
  const ap = acquire(0.00025, 0, 500e-6, mk(1, { pos: 2 }), env, [0, 0, 0, 0], true);
  let same = true;
  for (let i = 0; i < NPTS; i += 100) if (a0.data[0][i] !== ap.data[0][i]) same = false;
  check("Position ändert nur die Darstellung (Daten identisch)", same);
  const ai = acquire(0.00025, 0, 500e-6, mk(1, { invert: true }), env, [0, 0, 0, 0], true);
  let flip = true;
  for (let i = 0; i < NPTS; i += 100) if (ai.data[0][i] + a0.data[0][i] !== 0) flip = false;
  check("Invert spiegelt exakt", flip);
  const ac = acquire(0.00025, 0, 500e-6, mk(0.5), env2, [0, 0, 0, 0], true);
  let cmx = -Infinity;
  for (let i = 0; i < ac.data[0].length; i++) if (ac.data[0][i] > cmx) cmx = ac.data[0][i];
  check("5-V-Sinus klemmt bei 0,5 V/div auf ±2,6 V", cmx <= 2.6 + 1e-6 && cmx > 2.5, cmx.toFixed(2));
}

/* 10 · S5.20: Knöpfe klemmen (Pegel ±8 Divs, Verzögerung ±1 Spanne, Netz = 0 V) */
{
  const s = settings({ tdiv: 1 });
  const hd = applyKnob("hDelay", 100000, s);
  check("H-Verzögerung klemmt auf ±1 Spanne", Math.abs(hd.hDelay) <= HDIV * 1 + 1e-9, `${hd.hDelay} s`);
  const lv = applyKnob("trigLevel", 100000, s);
  check("Triggerpegel klemmt auf ±8 Divs", Math.abs(lv.trig.level) <= 8 * s.ch[0].vdiv + 1e-9, `${lv.trig.level} V`);
  const line = applyKnob("trigLevel", 5, { ...s, trig: { ...s.trig, source: 4, level: 3 } });
  check("Netz-Trigger liegt fest auf 0 V", line.trig.level === 0);
}

/* 11 · S5.21: Rauschen ist fest in Volt (GND-Kopplung = reines Rauschen) */
{
  const stdOf = (vdiv: number, probe: 1 | 10, bw = false): number => {
    const s = settings({ tdiv: 1e-3, ch: settings().ch.map((c, i) => (i === 0 ? { ...c, probe, vdiv, coupling: "GND" as const, bwLimit: bw } : c)) });
    const d = acquire(0.5, 0, 1e-3, s, makeEnv("N001"), [0, 0, 0, 0], true).data[0];
    let mean = 0;
    for (let i = 0; i < d.length; i++) mean += d[i];
    mean /= d.length;
    let va = 0;
    for (let i = 0; i < d.length; i++) va += (d[i] - mean) ** 2;
    return Math.sqrt(va / d.length);
  };
  const model = (vdiv: number, probe: number, bw = false) => {
    const fe = FRONTEND_NOISE * probe * (bw ? BW_NOISE_GAIN : 1);
    return Math.sqrt(fe ** 2 + (adcLSB(vdiv) / Math.sqrt(12)) ** 2);
  };
  let ok = true, divOk = true;
  for (const vdiv of [1e-3, 10e-3, 100e-3, 1, 10]) {
    const got = stdOf(vdiv, 1);
    const want = model(vdiv, 1);
    if (Math.abs(got - want) / want > 0.4) ok = false;
    const divs = got / vdiv; // altes Modell: 0,4 Divs auf feiner Stufe
    if (divs < 0.005 || divs > 0.15) divOk = false;
  }
  check("Rauschspannung folgt dem physikalischen Modell (±40 %)", ok);
  check("Rauschen bleibt unter 0,15 Divs (kein Skalen-Fuzz)", divOk);
  const p10 = stdOf(10e-3, 10);
  check("10×-Tastkopf: ≈1 mVrms Eingangsrauschen", Math.abs(p10 - model(10e-3, 10)) / model(10e-3, 10) < 0.4, `${(p10 * 1e3).toFixed(2)} mV`);
  const off = stdOf(1e-3, 1, false), on = stdOf(1e-3, 1, true);
  check("BW-Limit dämpft ≈ √(20/70)", Math.abs(on / off - BW_NOISE_GAIN) < 0.15, `${(on / off).toFixed(2)}`);
}

/* 12 · S5.31: Trigger-Hysterese — schweigt auf Rauschen, steht auf Signal */
{
  const s = settings({ ch: settings().ch.map((c, i) => (i === 0 ? { ...c, probe: 1 } : c)) });
  const env = makeEnv("N001");
  // Sim steht (0 V + Komparator-Rauschen): kein Fehltrigger (war 120/120).
  const flat: Env = { ...env, sampler: () => 0 };
  check("Trigger schweigt auf Rauschen bei stehendem Signal",
    findTrigger(0, 0.05, s, flat, [0, 0, 0, 0]) === null);
  // Kleinsignal (±0,1 V) innerhalb des Bands (±0,3 Divs) löst nicht aus.
  const small: Env = { ...env, sampler: (net, t) => (!net || net === "0" ? 0 : Math.sin(2 * Math.PI * 1000 * t) * 0.1) };
  check("Trigger schluckt Kleinsignal im Hysterese-Band",
    findTrigger(0, 0.05, s, small, [0, 0, 0, 0]) === null);
  // DC-Ruhelage im Band löst nicht aus (kein Scharfschalten ohne Durchgang).
  const rest: Env = { ...env, sampler: (net) => (!net || net === "0" ? 0 : 0.1) };
  check("Trigger schweigt bei DC-Ruhelage im Band",
    findTrigger(0, 0.05, s, rest, [0, 0, 0, 0]) === null);
  // Fallende Flanke trifft weiter (erstes fallendes Band-Null bei ~0,5 ms).
  const ff = findTrigger(0, 0.016, { ...s, trig: { ...s.trig, slope: "fall" } }, env, [0, 0, 0, 0]);
  const kf = ff === null ? NaN : ff * 1000;
  check("Fallende Flanke trifft", ff !== null && Math.abs(kf - 0.5) < 0.05, ff === null ? "keiner" : `${kf.toFixed(3)} ms`);
  // Echtes Signal: jeder Frame getriggert, Phase stabil (stehendes Bild).
  const eng = new Engine();
  const tts: number[] = [];
  for (let k = 1; k <= 60; k++) { // ab Frame 1 (Frame 0 hat leeres Suchfenster)
    const res = eng.step(k / 60, s, env);
    if (res.newAcq && eng.display?.triggered) tts.push(eng.display.tt);
  }
  const dev = tts.slice(1).map((t, i) => { const g = ((t - tts[i]) * 1000) % 1; return Math.min(g, 1 - g); });
  const maxDev = dev.length ? Math.max(...dev) : NaN;
  check("1-kHz-Signal: 60/60 getriggert, Phase < 50 µs",
    tts.length === 60 && maxDev < 0.05, `${tts.length}/60, max ${(maxDev * 1000).toFixed(1)} µs`);
  // Netz-Trigger: 50-Hz-Nulldurchgänge im 10-ms-Raster (Band-Austritt +0,8 ms).
  const sn = settings({ trig: { ...settings().trig, source: 4 } });
  const f = findTrigger(0, 0.05, sn, env, [0, 0, 0, 0]);
  const grid = f === null ? NaN : (f * 1000) % 10;
  check("Netz-Trigger trifft 50-Hz-Raster", f !== null && grid < 1, f === null ? "keiner" : `${(f * 1000).toFixed(3)} ms`);
}

console.log(failed === 0 ? "\nOszi-Verhalten: alle Prüfungen bestanden." : `\nOszi-Verhalten: ${failed} FEHLER`);
if (failed) process.exit(1);
