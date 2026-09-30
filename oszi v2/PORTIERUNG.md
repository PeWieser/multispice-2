# Portierung des OTX2074‑Oszilloskops in eine Multisim‑artige Anwendung

> Zielumgebung: **Vite + React + TypeScript + Tailwind v4**
> Zielsystem: eine Schaltungssimulations‑App (Schaltplan‑Editor + Transientensimulation),
> in der das Oszilloskop als **Instrument** an beliebige Netze/Knoten angeklemmt wird.
>
> Diese Datei ist eine Arbeitsanweisung für einen Coding‑Agenten. Sie beschreibt **wie das
> vorhandene Oszilloskop 1:1 ohne Funktionseinbußen übernommen wird** und an welcher **einzigen
> Stelle** die Signalquelle ausgetauscht werden muss.

---

## 0. Kernaussage (TL;DR)

Das gesamte Oszilloskop – Erfassung, Trigger, Messungen, FFT, Cursor, Zoom, Menüs, Rendering,
Bedienpanel – ist **signalquellen‑agnostisch**. Es kennt nur zwei externe Konzepte:

1. **Eine Spannungsfunktion `v(id, t)`** – „welche Spannung liegt an Messpunkt `id` zur Zeit `t`
   (in Sekunden)?" Der Trigger‑Algorithmus, Peak‑Detect, Autoset usw. tasten diese Funktion
   an **beliebigen Zeitpunkten** ab (Sub‑Sample‑Genauigkeit!).
2. **Eine Uhr `t`** (Sekunden), die den „Jetzt"-Zeitpunkt liefert.

Portierung = **diese beiden Dinge durch die Simulation ersetzen**. Alles andere bleibt Byte‑für‑Byte
gleich. Konkret werden nur berührt:

| Datei | Aktion |
|---|---|
| `src/scope/signals.ts` | **ersetzen** (Demo‑Schaltung → Simulator‑Adapter) |
| `src/scope/types.ts` → `interface Env` | **anpassen** (Demo‑State → `SimBridge`) |
| `src/components/Oscilloscope.tsx` → Uhr | **anpassen** (Wall‑Clock → Sim‑Clock, entkoppelt) |
| `src/components/TestBench.tsx` | **entfernen** (durch Schaltplan‑Editor ersetzt) |
| `src/App.tsx` | **ersetzen** (Wiring durch Host‑App) |
| `src/scope/engine.ts`, `render.ts`, `menus.ts` | **unverändert** (bzw. nur Import‑Pfade) |
| `src/components/{Knob,Button}.tsx`, `HelpOverlay.tsx` | **unverändert** |
| `src/index.css` (Skeuomorph‑Klassen) | **übernehmen** (siehe §9) |

---

## 1. Architektur des Oszilloskops (Schichtenmodell)

```
┌──────────────────────────────────────────────────────────────┐
│  UI / Panel  (Oscilloscope.tsx, Knob, Button, HelpOverlay)     │  ← unverändert
│  – Front‑Panel, Drehknöpfe, Tasten, Render‑Loop (rAF)          │
├──────────────────────────────────────────────────────────────┤
│  Menüsystem  (menus.ts)                                         │  ← unverändert
│  Rendering   (render.ts)  Canvas, Graticule, Overlays          │  ← unverändert
├──────────────────────────────────────────────────────────────┤
│  Signalverarbeitung (engine.ts)                                │  ← unverändert*
│  – acquire(), Trigger, Averaging, Peak, Math, FFT, Measure,    │
│    Cursor, Autoset                                             │
│  * einziger Kontakt zur Außenwelt: sourceValue()/lineValue()  │
├──────────────────────────────────────────────────────────────┤
│  Typen/Helfer (types.ts)  Settings, Zahlformatierung          │  ← unverändert
├──────────────────────────────────────────────────────────────┤
│  SIGNALQUELLE (signals.ts)   sourceValue(id, t, env)           │  ◀── HIER PORTIEREN
│  aktuell: astabile Kippstufe + Funktionsgenerator + Probe‑Comp │
└──────────────────────────────────────────────────────────────┘
```

### Abhängigkeiten der Engine nach „außen" (die einzigen Berührungspunkte)

Belegt durch `grep` – jeder Aufruf geht über `signals.ts`:

- `engine.ts:53` `channelRaw()` → `sourceValue(p.target, t, env)`
- `engine.ts:68` `computeAcMeans()` → `sourceValue(...)` (Mittelwert für AC‑Kopplung, Fenster **1,2 s**)
- `engine.ts:150` `trigValue()` → `lineValue(t)` (Netz‑Trigger 50 Hz)
- `engine.ts:504` `analyzeSource()` (Autoset) → `sourceValue(...)` (Fenster bis **4 s**)

`Env` wird nur durchgereicht und in `signals.ts` ausgewertet (`env.circuit`, `env.gen`) bzw. für
das Channel→Target‑Mapping (`env.probes[ch].target`). `env.probes` ist ein **Oszilloskop‑Konzept**
(welcher Kanal hängt an welchem Netz, mit welchem Teiler/Abgleich) und bleibt erhalten.

---

## 2. Die entscheidende Eigenschaft: Abtastung zu beliebiger Zeit

Der aktuelle Code behandelt Signale als **kontinuierliche Funktion `v: (id, t) → Volt`**, die zu
jedem reellen `t` auswertbar ist. Das nutzen mehrere Algorithmen aus und **das muss der Port
erhalten**, sonst verliert man Funktionalität:

| Algorithmus | Datei/Funktion | Warum beliebige `t` nötig |
|---|---|---|
| Trigger‑Interpolation | `findTrigger` (`engine.ts:154`) | Grobscan (4000 Pkt) + **Bisektion (48 Iter.)** → Sub‑Sample‑genauer Triggerzeitpunkt, stehendes Bild |
| Peak‑/Glitch‑Erfassung | `acquire` peak‑Zweig (`engine.ts`) | pro Pixel **6 Unterabtastungen** → Min/Max, Anti‑Aliasing |
| AC‑Kopplung | `computeAcMeans` | Mittelwert über **1,2 s** Historie |
| Autoset | `analyzeSource` | Frequenz/Amplitude über Fenster bis **4 s** |
| Zeitbasis‑Zoom / feine Verzögerung | `acquire(tt, centerT, …)` | Fenster mit beliebigem Start/`dt` (bis 2 ns/div) |
| Filter‑Vorlauf (Tastkopf‑Comp, BW‑Limit) | `acquire` Pre‑Roll | bis **3000 Samples vor** Fensterbeginn |

**Konsequenz für die Simulation:** Der Adapter muss `v(id, t)` für einen ausreichenden Zeitraum in
der Vergangenheit liefern und **zwischen den Simulationsschritten interpolieren**. Siehe §6 (Ringpuffer)
und §7 (zwei Strategien).

**Kausalität ist bereits gewährleistet:** alle Zugriffe liegen in der Vergangenheit relativ zu `now`.
`findTrigger` sucht in `[max(searchStart, now−0.25), now]`; ein getriggertes Fenster wird erst
erfasst, wenn `now ≥ tt + postT` (der komplette Erfassungsbereich liegt links von `now`). Der Adapter
muss also **nie in die Zukunft** extrapolieren – solange `simTime()` = letzter fertig simulierter
Zeitpunkt gesetzt wird.

---

## 3. Was unverändert bleibt (nicht anfassen)

- `src/scope/engine.ts` – komplette Signalverarbeitung. **Nur der Import in Zeile 3 ändert sich**
  (`sourceValue`, `lineValue` kommen künftig aus dem Adapter, siehe §5.2).
- `src/scope/render.ts` – Canvas‑Rendering, Graticule, Cursor, Messwerte, Menü‑Zeichnung.
- `src/scope/menus.ts` – Seitenmenü‑Definitionen und Mehrzweckknopf‑Bindings.
- `src/scope/types.ts` – **außer** `interface Env` (§5.1). `Settings`, `defaultSettings()`,
  Zahl‑/Schrittfunktionen (`step125`, `fmt`, `clamp`, `ceil125`, `SEQ125`) bleiben.
- `src/components/Knob.tsx`, `Button.tsx`, `HelpOverlay.tsx`.
- Die gesamte Bedienlogik in `Oscilloscope.tsx` (Handler für Knöpfe, Menüs, Save/CSV/Setup,
  Kalibrierung, Autoset‑Aufruf) – **außer** der Uhr (§5.3).

> Regel für den Agenten: **Keine Signatur in `engine.ts`/`render.ts`/`menus.ts` ändern.** Wenn eine
> Änderung dort nötig scheint, ist die Abstraktion falsch gelegt – zurück zu §5.

---

## 4. Was ersetzt/entfernt wird

- **`src/scope/signals.ts`** – enthält heute die Demo‑Physik (astabile Kippstufe `astable*`,
  `generator`, `probeComp`) und die statische Messpunkt‑Liste `SOURCES`. → wird zum **Simulator‑Adapter**.
- **`src/components/TestBench.tsx`** – die grafische Demo‑Schaltung (PCB‑SVG, FG‑Gerät, Tastkopf‑Tray).
  → **entfällt**; in der Multisim‑App übernimmt der Schaltplan‑Editor diese Rolle. Das
  Tastkopf‑Aufnehmen/Anklemmen kann als Instrument‑Verdrahtung erhalten bleiben (§8).
- **`src/App.tsx`** – nur Demo‑Verdrahtung. → durch die Host‑App/Instrument‑Fenster ersetzt.

---

## 5. Zielschnittstellen (verbindliche Definitionen)

### 5.1 `Env` generalisieren (`types.ts`)

Ersetze in `src/scope/types.ts` den Demo‑`Env` durch eine schlanke, simulator‑neutrale Variante.
`ProbeState` bleibt **unverändert** (es ist Oszilloskop‑Zubehör).

```ts
// types.ts
export interface Env {
  /** Kanal → Messpunkt/Netz + Tastkopfeigenschaften. Länge 4. Unverändert. */
  probes: ProbeState[];
  /** Anbindung an den Schaltungssimulator (ersetzt circuit/gen). */
  sim: SimBridge;
}
```

`CircuitState`, `GenState`, `demoSettings()` können entfernt werden (nur Demo). `defaultSettings()`
bleibt und wird zur Standard‑Konfiguration des Instruments.

### 5.2 `SimBridge` + `ProbeSource` (neues `signals.ts`)

Das ist der Vertrag zwischen Oszilloskop und Simulator. **Alle Zeiten in Sekunden, alle Spannungen in Volt.**

```ts
// signals.ts (neu)
import type { Env } from './types';

/** Ein einzelnes messbares Netz/Testpunkt. */
export interface ProbeSource {
  /** Interpolierte Knotenspannung zur absoluten Sim‑Zeit t (s). MUSS für
   *  t ∈ [earliest(), latest()] gültig sein. */
  valueAt(t: number): number;
  /** Jüngste fertig simulierte Zeit (s). */
  latest(): number;
  /** Älteste noch im Puffer vorhandene Zeit (s). */
  earliest(): number;
  /** Optionaler Beschleuniger: echtes Min/Max über [t0,t1] für Peak/Glitch‑Erfassung.
   *  Wenn nicht vorhanden, unterabtastet die Engine selbst. */
  extentOver?(t0: number, t1: number): [number, number];
}

/** Anbindung an den Simulator; wird über Env.sim durchgereicht. */
export interface SimBridge {
  /** Quelle für einen Messpunkt‑/Netz‑Id, oder null (nicht angeklemmt/GND). */
  source(id: string | null): ProbeSource | null;
  /** Für die UI: verfügbare Messpunkte (Netznamen/Testpunkte). */
  targets(): { id: string; label: string; desc: string }[];
  /** Sim‑Uhr in Sekunden: letzter vollständig simulierter Zeitpunkt.
   *  Monoton steigend; darf bei Pause konstant bleiben. */
  simTime(): number;
  /** Optional: Netz‑Trigger (Netzfrequenz) als reine Zeitfunktion. */
  lineValue?(t: number): number;
}

// --- Adapter‑Funktionen mit exakt der bisherigen Signatur (engine.ts erwartet sie) ---
export function sourceValue(id: string | null, t: number, env: Env): number {
  const src = env.sim.source(id);
  return src ? src.valueAt(t) : 0;
}
export function lineValue(t: number): number {
  return Math.sin(2 * Math.PI * 50 * t); // oder env.sim.lineValue – siehe Hinweis unten
}

// UI‑Helfer, bisher statisch – jetzt aus dem Simulator:
export const sourceLabel = (id: string | null, env: Env) =>
  id ? env.sim.targets().find((s) => s.id === id)?.label ?? id : '—';

// Rausch‑Helfer beibehalten (Eigenrauschen des Scopes in acquire()):
export { gauss, hash32 } from './noise'; // gauss/hash32/noiseAt aus dem Original übernehmen
```

**Hinweise:**
- `sourceValue`/`lineValue` behalten **exakt die alten Signaturen**, damit `engine.ts` (Import Zeile 3)
  unverändert bleibt. `engine.ts` nutzt `env` – dort ist jetzt `env.sim` verfügbar.
- `lineValue`: braucht der Netz‑Trigger `env`? Aktuell nicht (reine 50‑Hz‑Zeitfunktion). Wenn die
  Netzfrequenz aus dem Sim kommen soll, entweder hier `env`‑lose Konstante lassen **oder** in
  `engine.ts:150` `trigValue` auf `env.sim.lineValue?.(t) ?? Math.sin(2π·50·t)` umstellen (einzige
  erlaubte 1‑Zeilen‑Ausnahme in engine.ts; sonst Netz‑Trigger als Feature streichen).
- `gauss`/`hash32`/`noiseAt` (deterministisches Rauschen) werden von `acquire()` für das **Eigenrauschen
  des Oszilloskops** benutzt (Quantisierung/thermisch) – **behalten**. Sie modellieren das Instrument,
  nicht die Schaltung. Optional `sigma` in `acquire()` reduzieren, wenn der Simulator bereits Rauschen liefert.

### 5.3 Uhr entkoppeln (`Oscilloscope.tsx`)

Heute: `const now = () => performance.now() / 1000;` (Zeile 43) und alles hängt an der Wall‑Clock.
Im Simulator läuft die Sim‑Zeit i. d. R. **nicht** synchron zur Echtzeit (schneller/langsamer/pausiert).
Deshalb **zwei Uhren trennen**:

- `wall` = `performance.now()/1000` → **nur** für UI‑Timing: Boot‑Animation, Kalibrier‑Fortschritt,
  Meldungen (`msg().until`, Vergleich `inp.wall`), Trigger‑Level‑Fade (`lastLevelChange`),
  Persistenz‑Abklingen (`dtFrame`).
- `simT` = `env.sim.simTime()` → **ausschließlich** für `engine.step(simT, s, env)` und für die
  Erfassungs‑/Zoom‑Aufrufe (`acquire(eng.lastTT, …)`, Statistik).

Konkrete Änderungen im Render‑Loop von `Oscilloscope.tsx`:

```ts
const loop = () => {
  raf = requestAnimationFrame(loop);
  const wall = performance.now() / 1000;
  const simT = envRef.current.sim.simTime();   // NEU
  const dtFrame = wall - lastWall; lastWall = wall;
  // ... boot/power weiterhin mit wall ...
  const res = engine.current.step(simT, sRef.current, envRef.current); // war: t
  // Zoom/Stats/roll: überall wo bisher `t` als Zeit ins Signal ging → simT
  // inp.wall = wall;  (Meldungen/Fades bleiben Echtzeit)
};
```

`guard()` (Boot‑Sperre) darf weiter `wall` verwenden. Kalibrierung/Info/Messages: `wall`.

> Wichtig: `simTime()` **muss** = letzter vollständig simulierter Zeitpunkt sein (nicht die Zukunft),
> damit die Kausalitätsannahme aus §2 gilt.

---

## 6. Referenz‑Adapter: Ringpuffer pro Netz

Der Simulator liefert diskrete Samples. Der Adapter macht daraus die kontinuierliche `valueAt(t)`.

```ts
// ProbeRingBuffer.ts (Referenzimplementierung eines ProbeSource)
export class ProbeRingBuffer implements ProbeSource {
  private tBuf: Float64Array;
  private vBuf: Float64Array;
  private head = 0;      // nächste Schreibposition
  private count = 0;
  constructor(capacity: number) {
    this.tBuf = new Float64Array(capacity);
    this.vBuf = new Float64Array(capacity);
  }
  /** vom Simulator nach jedem (oder jedem n‑ten) Zeitschritt aufrufen */
  push(t: number, v: number) {
    this.tBuf[this.head] = t; this.vBuf[this.head] = v;
    this.head = (this.head + 1) % this.tBuf.length;
    this.count = Math.min(this.count + 1, this.tBuf.length);
  }
  latest()   { return this.count ? this.tBuf[(this.head - 1 + this.tBuf.length) % this.tBuf.length] : 0; }
  earliest() { return this.count ? this.tBuf[(this.head - this.count + this.tBuf.length) % this.tBuf.length] : 0; }

  valueAt(t: number): number {
    if (this.count === 0) return 0;
    const N = this.tBuf.length;
    const idx = (k: number) => (this.head - this.count + k + N) % N;
    // Binärsuche über logische Reihenfolge [0..count-1]
    let lo = 0, hi = this.count - 1;
    if (t <= this.tBuf[idx(0)]) return this.vBuf[idx(0)];
    if (t >= this.tBuf[idx(hi)]) return this.vBuf[idx(hi)];
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.tBuf[idx(mid)] <= t) lo = mid; else hi = mid;
    }
    const t0 = this.tBuf[idx(lo)], t1 = this.tBuf[idx(hi)];
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 0;
    return this.vBuf[idx(lo)] + f * (this.vBuf[idx(hi)] - this.vBuf[idx(lo)]);
  }

  // optional, verbessert Peak/Glitch massiv:
  extentOver(t0: number, t1: number): [number, number] {
    let mn = Infinity, mx = -Infinity; const N = this.tBuf.length;
    for (let k = 0; k < this.count; k++) {
      const i = (this.head - this.count + k + N) % N;
      const tt = this.tBuf[i];
      if (tt < t0 || tt > t1) continue;
      const v = this.vBuf[i]; if (v < mn) mn = v; if (v > mx) mx = v;
    }
    if (mn === Infinity) { const v = this.valueAt((t0 + t1) / 2); return [v, v]; }
    return [mn, mx];
  }
}
```

### Dimensionierung (Puffertiefe & Simulationsrate)

- **Historientiefe** ≥ das längste Fenster, das die Engine benötigt:
  `max(HDIV·tdiv_max + holdoff, AC‑Fenster 1,2 s, Autoset‑Fenster 4 s)`.
  Bei `tdiv_max = 100 s` wären das 1500 s – unrealistisch. → **Zeitbasisbereich für den Port
  begrenzen** (z. B. bis 1 s/div ⇒ 15 s Historie) oder Strategie B (§7) verwenden. Anpassen über
  die `min/max`‑Argumente von `step125` im Handler `hScale` in `Oscilloscope.tsx`.
- **Sim‑Rate (Schrittweite):** Für saubere Darstellung sollte der Simulator‑Zeitschritt **feiner als
  die Pixel‑Auflösung** der schnellsten genutzten Zeitbasis sein:
  `dt_sim ≲ (HDIV·tdiv_min) / NPTS` mit `NPTS = 2000`. Bei 2 ns/div (schnellste) wäre das 15 fs –
  ebenfalls unrealistisch für eine Live‑Sim. → schnellste Zeitbasis begrenzen **oder** Strategie B.
- **Realistische Empfehlung:** Live‑Sim mit fester, hoher Rate (z. B. 1–10 MS/s) + Zeitbasis auf
  `≥ NPTS/simRate` clampen. Für schnelle Signale Strategie B (On‑Demand‑Resim) anbieten.

---

## 7. Zwei Anbindungsstrategien

### Strategie A – Buffer‑Replay (einfach, echtzeitnah, empfohlen für Start)

Der Simulator läuft kontinuierlich (Free‑Running) mit fester Rate und schreibt in `ProbeRingBuffer`.
Das Oszilloskop liest wie bisher aus der „Vergangenheit". Verhalten identisch zum jetzigen Demo‑Modus
(dort ist die „Sim" nur eine Formel). **Minimaler Portieraufwand.** Einschränkung: schnellste nutzbare
Zeitbasis ist durch die Sim‑Rate begrenzt.

`simTime()` = letzter gepushter Zeitstempel. Ideal, wenn Sim‑Zeit ≈ Echtzeit läuft.

### Strategie B – On‑Demand‑Resimulation (volle Bandbreite, wie echtes Multisim)

Wenn ein getriggertes Fenster benötigt wird, fordert das Oszilloskop beim Simulator eine
**`.tran`‑artige Berechnung** exakt für das Fenster `[tt − span/2 − preRoll, tt + span/2]` mit der
gewünschten Schrittweite `dt = span/NPTS` an. Der zurückgegebene Block wird in einen kleinen
`ProbeSource` verpackt, `valueAt` interpoliert darin.

- Erlaubt den **vollen Zeitbasisbereich (2 ns … 100 s/div)** ohne riesige Live‑Puffer.
- Trigger: entweder der Simulator liefert Trigger‑Events, oder man simuliert ein Suchfenster und ruft
  `findTrigger` darauf auf (unverändert nutzbar, da es nur `sourceValue` braucht).
- Umsetzung: `SimBridge.source(id)` gibt einen `ProbeSource` zurück, dessen `valueAt` bei Bedarf
  (Cache‑Miss) eine synchrone/asynchrone Resim des angefragten Bereichs auslöst. Für die synchrone
  rAF‑Schleife empfiehlt sich, pro Frame **einen** Fensterblock vorab zu simulieren und zu cachen.

> Der Agent sollte **beide Strategien hinter demselben `ProbeSource`‑Interface** implementieren können.
> Beginne mit A (schnell lauffähig), rüste B nach, ohne Engine/Render/Menüs anzufassen.

---

## 8. Probe‑Anbindung / Verdrahtung in der Host‑App

Heute: „Tastkopf aufnehmen" → auf Messpunkt‑SVG klicken (`App.tsx` `held`/`onTargetClick`,
`Oscilloscope.tsx` Props `heldProbe`, `onPickProbe`, `onTargetClick`; BNC‑Buchsen unten am Gerät).

Für Multisim zwei Optionen (Interface bleibt gleich):

1. **Instrument‑Terminals verdrahten (empfohlen):** Das Scope‑Instrument hat 4 BNC‑Terminals; der
   Nutzer zieht im Schaltplan eine Leitung vom Terminal zu einem Netz. Ergebnis: setze
   `probes[ch].target = <netId>`. Die Host‑App verwaltet dieses Mapping und übergibt es als
   `env.probes`. `SimBridge.source(netId)` liefert dann den Ringpuffer/Resim‑Source dieses Netzes.
2. **Bestehendes „Pick & Click" beibehalten:** Nur die Messpunktliste kommt jetzt aus
   `env.sim.targets()` (Netznamen) statt aus der statischen `SOURCES`‑Konstante. `App.tsx` entsprechend
   auf `env.sim.targets()` umstellen.

Der Tastkopf‑Teiler (1X/10X) und der Abgleich‑Trimmer (`ProbeState.atten`, `ProbeState.comp`) sind
**reine Oszilloskop‑/Tastkopf‑Eigenschaften** und funktionieren unverändert weiter (die Skalierung
passiert in `channelRaw`, `engine.ts:53`). Der Abgleich‑Effekt (Über‑/Unterkompensation) bleibt als
Instrumenten‑Realismus erhalten.

---

## 9. Styling, Assets, Build

- **CSS:** Die skeuomorphen Klassen (`.case`, `.bezel`, `.panel`, `.panel-dark`, `.knob*`, `.sk-btn*`,
  `.bezel-btn`, `.bnc`, `.power-btn`, `.usb`, `.lcd7`, `.silk*`) stehen in `src/index.css` unter
  `@import "tailwindcss";`. **Alle in die Zielanwendung übernehmen.** Empfehlung: in ein eigenes
  `oscilloscope.css` (oder CSS‑Module) auslagern und mit einem Präfix/Scope versehen
  (z. B. `.otx-scope .sk-btn`), um Kollisionen im Multisim‑UI zu vermeiden. Die `body`‑Regeln
  (Hintergrund, `user-select`) **nicht** global übernehmen, sondern auf den Instrument‑Container legen.
- **Tailwind v4** wird über `@tailwindcss/vite` eingebunden. In der Zielapp identisch konfigurieren;
  die genutzten Utility‑Klassen sind Standard.
- **Kein `vite-plugin-singlefile` nötig.** Das war nur für die Demo‑Auslieferung als eine HTML‑Datei.
  In der Multisim‑App normal bündeln. `vite.config.ts` in der Zielapp entsprechend ohne
  `viteSingleFile`.
- **Canvas/DPR:** `Oscilloscope.tsx` setzt `canvas.width/height = W*dpr`. Der feste Anzeigebereich ist
  `W=800 × H=480` (Konstanten in `render.ts`). Beibehalten; der Rahmen skaliert per CSS
  (`Fit`‑Wrapper in `App.tsx`). In einem Instrument‑Fenster ggf. eigenen Skalier‑Wrapper verwenden.
- **Keine externen Assets/Fonts/Bibliotheken.** Nur `react`, `react-dom` (und optional `clsx`,
  `tailwind-merge`, die aktuell nicht zwingend genutzt werden). Kein Netzwerkzugriff.

---

## 10. Sonderfälle & Fallstricke (Checkliste für den Agenten)

1. **`settingsKey` (`engine.ts:205`)** serialisiert `env.probes`. Das ist Absicht: Ändert sich die
   Verkabelung/Skalierung, wird gemittelt/neu erfasst. **Simulationszustand darf NICHT in diesen Key.**
   Im Port ist das erfüllt (nur `probes`, nicht `sim`). Beibehalten.
   **Multispice-Anpassung Runde 24 (W60, umgesetzt):** `env.probes` ist wieder im Key — im **Run**
   löst eine umgesteckte Messleitung sofort eine neue Aufnahme aus (Mittelung wird verworfen), im
   **Stop/Single** nicht: dort steht das Bild (wie am echten Gerät), die Änderung wird nur vorgemerkt
   und beim nächsten Run eingelöst. Grund: Bei pausierter Simulation würde eine Neuaufnahme aus einem
   Signal eine 0‑V‑Linie machen (Runde 22).
2. **Stop‑Modus + Live‑Puffer:** Bei `run:'stop'` re‑erfasst die Engine aus `eng.lastTT`, wenn sich
   Settings ändern (`keyChanged`). Der Zeitpunkt kann aus einem kleinen Ringpuffer herausgescrollt
   sein → Puffer groß genug wählen oder in Strategie B den letzten Fensterblock cachen.
   **Port-Anpassung (W60):** Diesen Punkt bewusst *nicht* übernommen. Der Nutzer will Stop/Single wie
   am echten Oszilloskop: Bild friert ein, Skalieren wirkt nur auf den gespeicherten Datensatz;
   Neuakquise erst beim nächsten Run (`Engine.pendingKeyChange`).
3. **Roll‑Modus** (`tdiv ≥ 0.1`, Auto‑Trigger): setzt Samples an `now − postT` fortlaufend. Benötigt
   kontinuierliche Historie in Strategie A. In Strategie B: Roll‑Fenster gleitend resimulieren.
4. **Peak‑Detect ohne `extentOver`:** funktioniert, aber nur so gut wie die Sim‑Auflösung. Für echte
   Glitch‑Erfassung `extentOver` implementieren (§6).
5. **Netz‑Trigger** (`s.trig.source === 4`): nur behalten, wenn sinnvoll (`SimBridge.lineValue`), sonst
   die Quelle „Netz" im Trigger‑Menü (`menus.ts` `trigger`) und in `render.ts` (Bottom‑Bar „Netz")
   ausblenden. Optional.
6. **Astable‑Cache** (`astableParams`, Objekt‑Identity‑Cache in `signals.ts`) entfällt mit der Demo.
7. **Einheiten strikt SI:** Simulator muss **Volt** und **Sekunden** liefern. Ströme/andere Größen
   ggf. vorher skalieren. `probe`/`atten` werden im Scope verrechnet – Simulator liefert die **rohe
   Knotenspannung**.
8. **`now()`‑Duplikate:** `Oscilloscope.tsx` verwendet `now()` an vielen Stellen (Handler wie
   `screenshot`, `msg`, `level50`, `guard`). Diese sollen **Wall‑Clock** bleiben. Nur der Render‑Loop
   und `engine.step`/`acquire` bekommen `simT`. Sauber trennen (§5.3).
9. **`TestBench.tsx`‑Referenzen** (`performance.now` Z. 116/218) verschwinden mit der Datei. LED‑Blinken
   etc. übernimmt der Schaltplan‑Renderer der Host‑App.
10. **`sourceLabel`‑Signatur** bekommt `env` (braucht `targets()`). Aufrufer anpassen
    (`Oscilloscope.tsx` BNC‑Beschriftung, `TestBench` entfällt, `App.tsx`).
11. **Zeitbasis‑/Sample‑Rate‑Anzeige:** `render.ts` zeigt `NPTS/(HDIV·tdiv)` als „S/s" und „2000
    Punkte". In Strategie A stimmt das nur bis zur Sim‑Rate; optional die effektive Rate aus der
    `SimBridge` anzeigen (kosmetisch, kein Muss).
12. **Determinismus/Tests:** `gauss`/`hash32` sind deterministisch – für Snapshot‑Tests der Engine
    beibehalten.

---

## 11. Schritt‑für‑Schritt‑Portierung

1. **Projekt anlegen** (falls nicht vorhanden): Vite + React‑TS, Tailwind v4 (`@tailwindcss/vite`).
2. **Ordner kopieren:** `src/scope/{engine.ts, render.ts, menus.ts, types.ts}` und
   `src/components/{Knob.tsx, Button.tsx, HelpOverlay.tsx}` **unverändert** übernehmen.
3. **`types.ts`:** `Env` gemäß §5.1 auf `{ probes, sim: SimBridge }` umstellen; `CircuitState`,
   `GenState`, `demoSettings` entfernen (oder als Test‑Fixture behalten).
4. **`signals.ts` neu schreiben** gemäß §5.2: `SimBridge`, `ProbeSource`, `sourceValue`, `lineValue`,
   `sourceLabel`, Re‑Export von `gauss/hash32/noiseAt` (Rausch‑Helfer aus dem Original auslagern nach
   `noise.ts`). **Signaturen von `sourceValue`/`lineValue` exakt beibehalten.**
5. **`engine.ts` Import (Zeile 3)** auf den neuen Adapter zeigen lassen – sonst nichts ändern.
   (Einzige erlaubte Ausnahme: optionaler `env.sim.lineValue`‑Hook in `trigValue`, §5.2.)
6. **Adapter implementieren:** `ProbeRingBuffer` (§6) + eine `SimBridge`‑Implementierung, die den
   Simulator kapselt (Strategie A). Netzliste über `targets()`, Uhr über `simTime()`.
7. **Simulator‑Kopplung:** Nach jedem Sim‑Schritt für jedes **beprobte** Netz `push(t, v)` aufrufen
   (nur beprobte Netze puffern spart Speicher; Mapping aus `env.probes[*].target`).
8. **`Oscilloscope.tsx`:** Uhr entkoppeln (§5.3). Props‑Interface bleibt (`envRef`, `probes`,
   `heldProbe`, `onTargetClick`, `onPickProbe`, `onHelp`). BNC‑Beschriftung `sourceLabel(id, env)`.
9. **Host‑Einbindung (statt `App.tsx`/`TestBench.tsx`):** Instrument‑Fenster rendert `<Oscilloscope … />`,
   verwaltet `probes`‑Mapping über die Schaltplan‑Verdrahtung (§8) und stellt die `SimBridge` bereit.
10. **CSS** gemäß §9 übernehmen (gescoped).
11. **Build & Smoke‑Test** gemäß §12.

---

## 12. Abnahmekriterien – „ohne Funktionseinbußen"

Der Port gilt als vollständig, wenn (mit einem Testnetz, z. B. 1‑kHz‑Sinus + Rechteck):

- [ ] `npm run build` und `tsc --noEmit` fehlerfrei.
- [ ] **Alle 4 Kanäle** an‑/abschaltbar; V/div, Position, Kopplung DC/AC/GND, Invert, 20‑MHz‑BW,
      Tastkopf 1X/10X wirken sichtbar.
- [ ] **Zeitbasis** (Scale/Position, fein), **Zoom** (geteilter Bildschirm) funktionieren im
      unterstützten Bereich (§6/§7).
- [ ] **Trigger** stehendes Bild (steigend/fallend/beide), Auto vs. Normal, Level, Holdoff,
      50 %‑Taste, Force Trig, Single/Run‑Stop.
- [ ] **Erfassung:** Sample, Peak (Glitch sichtbar), Average (rauschärmer), HiRes, XY‑Modus.
- [ ] **Messungen** (Freq/Periode/Ss/Amplitude/Anstieg/Tastgrad …) plausibel; Statistik zählt hoch.
- [ ] **Cursor** (Zeit/Amplitude/Bildschirm), Verschieben per Mehrzweckknopf, a/b‑Umschaltung, Fine.
- [ ] **Math** (+/−/×), **FFT** (4 Fenster), **Ref** (R1/R2 speichern/anzeigen).
- [ ] **Search & Mark**, Save (PNG/CSV/Setup), Default/Autoset, Selbstkalibrierung, Anzeige‑Menüs.
- [ ] **Autoset** findet ein angeklemmtes Signal und stellt V/div, s/div, Trigger sinnvoll ein.
- [ ] Bei **Sim‑Pause** friert das Bild ein, UI (Meldungen/Knöpfe) bleibt bedienbar (Uhr‑Trennung §5.3).
- [ ] Keine Konsolen‑/Laufzeitfehler bei Durchklicken aller Tasten/Knöpfe/Menüs.

---

## 13. Migrations‑Checkliste (kurz)

- [ ] `engine.ts`, `render.ts`, `menus.ts`, `Knob.tsx`, `Button.tsx`, `HelpOverlay.tsx` kopiert, **unverändert**
- [ ] `types.ts`: `Env` = `{ probes, sim }`, Demo‑Typen entfernt
- [ ] `signals.ts` neu: `SimBridge`/`ProbeSource`/`sourceValue`/`lineValue`/`sourceLabel` (+ `noise.ts`)
- [ ] `ProbeRingBuffer` + `SimBridge`‑Impl (Strategie A) implementiert
- [ ] Simulator pusht `(t, v)` für beprobte Netze
- [ ] `Oscilloscope.tsx`: Sim‑/Wall‑Uhr getrennt; `sourceLabel(id, env)`
- [ ] Host stellt `env` + `probes`‑Verdrahtung bereit (`TestBench`/`App` ersetzt)
- [ ] CSS gescoped übernommen; kein `viteSingleFile`
- [ ] Abnahme (§12) grün
- [ ] optional: Strategie B (On‑Demand‑Resim) für vollen Zeitbasisbereich
```
