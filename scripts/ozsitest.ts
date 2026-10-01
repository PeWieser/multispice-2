/**
 * Runde 24 (W60): Oszilloskop – Doku-konform im Run, Standbild im Stop/Single.
 *
 * PORTIERUNG.md §10.1/§10.2 wollen `env.probes` im `settingsKey` und eine
 * Neuaufnahme bei geänderten Einstellungen. Am echten Gerät gilt trotzdem:
 * Steht das Bild (Stop bzw. Single nach der Aufnahme), wird nicht neu gemessen.
 * Der Test prüft beides – und dass der R22-Fix (keine 0-V-Linie aus pausierter
 * Simulation) erhalten bleibt.
 */
import { Engine } from "../src/components/oszi2/engine";
import { defaultSettings, type Env, type Settings } from "../src/components/oszi2/types";

let failed = 0;
function check(name: string, ok: boolean, info = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` – ${info}` : ""}`);
  if (!ok) failed++;
}

const sampler = (net: string, t: number) => {
  if (!net) return 0;
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

console.log(failed === 0 ? "\nOszi-Verhalten: alle Prüfungen bestanden." : `\nOszi-Verhalten: ${failed} FEHLER`);
if (failed) process.exit(1);
