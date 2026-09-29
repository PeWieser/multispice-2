# PORTING.md – Funktionsgenerator „SimTech FG-2500“ in eine Simulationsumgebung (z. B. Multisim) portieren

> Zielgruppe: KI-Agent / Entwickler, der dieses Web-Frontpanel in eine Schaltungssimulation einbinden soll.
> Alle Pfade relativ zum Projektroot. Sprache des Codes: TypeScript. Bezeichner und LCD-Texte sind Englisch, die Umgebung ist Deutsch.

---

## 1. Kurzüberblick

Das Projekt besteht aus **zwei streng getrennten Schichten**:

| Schicht | Ordner | Abhängigkeiten | Portierung |
|---|---|---|---|
| **Kern (Engine)** – Zustand, Tastenlogik, Menüs, Signalmodell, Einheiten-Formatierung, SPICE-Export | `src/generator/` | **keine** (kein React, kein DOM, nur ES2020) | 1:1 wiederverwenden |
| **Oberfläche (Skeuomorphes Frontpanel)** – LCD, Tasten, Drehknopf, BNC-Buchsen, Oszilloskop-Monitor | `src/components/`, `src/index.css`, `src/App.tsx` | React 19, Tailwind (nur für Beiwerk) | in Ziel-UI einbetten oder neu rendern |

**Wichtigste Regel:** Die Oberfläche enthält *keine* Geschäftslogik. Sie sendet nur `Action`-Objekte an den Kern
(`core.dispatch(action)`) und rendert `core.getState()`. Wer die UI ersetzt, muss die Logik nicht anfassen.

```
Tastendruck/Knopf ──► core.dispatch(Action) ──► reduce(state, action) ──► neuer GenState ──► UI rendert
                                                                            │
Simulator (Zeit t) ──► core.voltage(ch, t, loadΩ) ◄─────────────────────────┘  (zustandslos!)
```

---

## 2. Dateikarte

```
src/generator/
  types.ts       Alle Typen: Channel, GenState, Action, FieldId, MenuItem …
  state.ts       defaultChannel(), initialState()  (Werkseinstellung)
  waveforms.ts   Signalmodell: normalized(), rawVoltage(), outputVoltage(), syncVoltage(),
                 ARB_WAVES, MAXF, previewPoints() (LCD-Vorschau)
  fields.ts      FIELDS (Parameter-Definitionen, Grenzen, Setter), setField(), sanitize(),
                 EDIT_UNITS (Einheiten für Ziffern-Eingabe, inkl. Vrms)
  format.ts      formatValue()/formatString()/formatCompact()  (7-stellige Geräte-Anzeige, Einheiten-Autoranging)
  menu.ts        buildMenu()/currentMenu(): Softkey-Menüs F1–F5, Paging, Einheiten-Menü
  reducer.ts     reduce(state, action): komplette Tasten-/Knopflogik + Hilfe-Modus
  core.ts        class GeneratorCore (dispatch/subscribe/voltage/block), installBridge() (postMessage), Re-Exports
  spice.ts       spiceSource(): erzeugt SPICE-Quelle (SIN / PULSE / PWL + 50 Ω Serienwiderstand)
src/components/
  FunctionGenerator.tsx  Montage des Frontpanels, Tastatur-Shortcuts, Skalierung, Kern-Anbindung
  Lcd.tsx                LCD (Kopfzeile, Kurve, Parameterboxen, Softkey-Spalte, Splash, Hilfe)
  Knob.tsx  Key.tsx  Bnc.tsx  Icons.tsx   Bedienelemente
  cables.ts              Patchfeld-Modell (welche Buchse steckt wo) – reine UI-Daten
  CableLayer.tsx         SVG-Ebene: BNC-Messleitungen, Stecker, Durchhang, Ziehen/Stecken
  audio.ts               Prozedurale Tasten-/Rast-/Steckgeräusche (WebAudio, keine Assets)
  Scope.tsx              Oszilloskop-Monitor mit Eingangsbuchsen (nur Prüfhilfe, für die Portierung nicht nötig)
  hooks.ts               Audio-Monitor + Beep (nur Demo)
scripts/                 Node-Selbsttests des Kerns (siehe Abschnitt 9)
```

---

## 3. Öffentliche API des Kerns (das, was der Simulator braucht)

```ts
import { GeneratorCore, spiceSource } from './src/generator/core';

const fg = new GeneratorCore(/* optional: Storage-ähnliches Objekt für die 4 Speicherplätze */);

// 1) Bedienung (identisch zu Tasten am Gerät)
fg.dispatch({ type: 'wave', wave: 'square' });      // Wellenform-Taste
fg.dispatch({ type: 'digit', d: '2' });             // Ziffern
fg.dispatch({ type: 'fkey', n: 1 });                // Softkey F2 (0…4) → z. B. Einheit "kHz"
fg.dispatch({ type: 'knob', steps: +1 });           // Drehknopf-Raste
fg.dispatch({ type: 'output', ch: 0 });             // Ausgang CH1 ein/aus
// weitere Actions: sign, knobPress, arrow, chSel, both, mod, save, utility, help, power

// 2) Direktes, programmatisches Setzen (für Host-Anwendungen / Bauteil-Eigenschaften)
fg.dispatch({ type: 'patch', ch: 0, patch: { wave: 'sine', freq: 1e3, amp: 2, offset: 0.5, output: true } });

// 3) Signal abfragen – ZUSTANDSLOS, beliebige Zeitpunkte, beliebige Reihenfolge
const v  = fg.voltage(0, t /*s*/, loadOhms /*Infinity = Leerlauf*/);   // V an OUT1
const vs = fg.sync(0, t);                                               // 0/5 V Sync-Ausgang
const blk = fg.block(0, t0, dt, N, 50);                                 // Float64Array

// 4) Zustand beobachten
fg.getState(); fg.subscribe(() => { /* UI/Host aktualisieren */ });

// 5) SPICE-Netzlisten-Zeilen
spiceSource(fg.getState(), 0, { node: 'OUT1', tStop: 5e-3 });
```

`GenState` ist ein reines JSON-serialisierbares Objekt (`structuredClone`/`JSON.stringify` funktionieren) –
ideal zum Speichern in Projektdateien der Zielanwendung.

---

## 4. Signalmodell (verbindlich – Ergebnisse müssen bei der Portierung identisch bleiben)

Alle Funktionen in `src/generator/waveforms.ts` sind **reine Funktionen von (Kanalparameter, t)**. Es gibt *keinen* internen Phasenakkumulator.
Dadurch ist das Modell unabhängig von Zeitschrittweite und Solver-Rücksetzern (Rollback bei adaptiver Schrittweite).

Normierte Ausgangsgröße `n(t) ∈ [-1, 1]`, Ausgangsspannung (Leerlauf) `v(t) = amp/2 · n(t) + offset`.
Phase `p` wird in **Perioden** gerechnet (`p = f·t + phase/360`).

| Modus | Formel |
|---|---|
| Sinus | `sin(2π p)` |
| Rechteck | `frac(p) < duty/100 ? +1 : −1` |
| Rampe | Symmetrie `s`: `frac(p) < s ? −1+2·frac/s : 1−2(frac−s)/(1−s)` (100 % = steigende Säge) |
| Puls | `frac(p − delay·f) < width·f ? +1 : −1` |
| Rauschen | gleichverteilt, deterministisch: `hash(floor(t·120e6))` (120 MSa/s) |
| Arb | 10 Tabellenfunktionen `ARB_WAVES[i].fn(frac(p))` |
| AM | `carrier(p) · (1 + d·m(fm·t)) / (1 + d)` , `d = depth/100`, `m` = Sinus/Rechteck/Rampe |
| FM | `carrier(p + Δf/fm · M(fm·t))`, `M` = Integral der Modulationsform (analytisch, phasenstetig) |
| PM | `carrier(p + Δφ/360 · m(fm·t))` |
| FSK | phasenstetiger Wechsel zwischen `f` und `hop` mit Rate `rate` (erste Halbperiode = `f`) |
| Sweep | linear: `p = f0·τ + (f1−f0)τ²/(2T)`; log: `p = f0·T/ln(r)·(r^{τ/T} − 1)`, `r=f1/f0`, `τ = t mod T` |
| Burst | `τ = t mod Tb`; aktiv solange `τ·f < N`, sonst `n = 0` (Ruhepegel = Offset) |

**Ausgang / Last (wichtig für Schaltungssimulation):**
* Innenwiderstand des Generators: **50 Ω** (Thévenin: ideale Quelle + 50 Ω in Reihe).
* Einstellung `load = 'highz'`: Anzeige gilt für Leerlauf → Quellenspannung = `v(t)`.
* Einstellung `load = '50'`: Anzeige gilt für 50 Ω Last → Quellenspannung = `2·v(t)`.
* Reale Last `R`: `v_out = v_quelle · R/(R+50)` (in `outputVoltage()` mit Parameter `loadOhms`).
* Ausgang aus (`output=false`) oder Gerät aus (`sys.power=false`) → 0 V.

Grenzen (siehe `fields.ts` / `waveforms.ts`): max. Frequenz Sinus 25 MHz, Rechteck 10 MHz, Rampe 300 kHz, Puls 5 MHz, Arb 5 MHz;
Amplitude 1 mVpp … 20 Vpp (High‑Z) bzw. 10 Vpp (50 Ω); `|offset| + amp/2 ≤ 10 V` (bzw. 5 V bei 50 Ω).

---

## 5. Bedienkonzept (so verhält sich das Gerät – nicht ändern, Nutzer erwarten es so)

* **Wellenform-Taste** (Sine, Square, Ramp, Pulse, Noise, Arb) → Hauptmenü der Welle.
* **Softkeys F1–F5** wählen den Parameter. Paare (`Freq/Period`, `Ampl/Hi_Level`, `Offset/Lo_Level`) werden durch erneutes Drücken umgeschaltet.
* **Werte ändern:**
  * *Ziffernblock* tippen → Softkey-Menü zeigt Einheiten (MHz/kHz/Hz/mHz, Vpp/mVpp/Vrms/mVrms, V/mV, s/ms/µs/ns …) → Einheit wählen.
    Knopfdruck bestätigt mit der Basiseinheit. `◀` löscht das letzte Zeichen. `+/-` nur bei Spannungen mit Vorzeichen.
  * *Drehknopf* ändert die Ziffer unter dem magentafarbenen Cursor; `◀ ▶` verschieben den Cursor (`ui.cursorExp` = Dekade).
* **Mod**: AM/FM/PM/FSK/Sweep/Burst; erneut drücken = aus. **CH1/2** wechselt den bearbeiteten Kanal, **CH1/CH2-Tasten** (rot/blau) schalten die Ausgänge, **Both** zeigt beide Kanäle.
* **Utility**: Last (High‑Z/50 Ω), Sync, Beep, Helligkeit, Frequenz-/Amplituden-Kopplung, Kanal kopieren, Audio-Monitor, Werkseinstellung.
* **Save**: 4 Speicherplätze (localStorage-Schlüssel `simtech-fg2500.memory.v1`). **Help**: nächste Taste erklärt sich selbst.

---

## 6. Integrationsstrategien für Multisim (oder ähnliche Simulatoren)

> Hinweis für den Agenten: Die genauen Erweiterungsmöglichkeiten unterscheiden sich je nach Multisim-Version und Lizenz.
> **Prüfe vor der Umsetzung in der Dokumentation der Zielversion**, welche der folgenden Wege verfügbar sind. Der Kern ist für alle gleich.

### Weg A – SPICE-Modell aus dem Kern erzeugen (robusteste Variante, kein Laufzeit-Bridge)
1. Frontpanel (Web-UI) läuft in einer eingebetteten WebView / separatem Fenster.
2. Bei jeder Zustandsänderung (`subscribe`) wird `spiceSource(state, ch, { node })` aufgerufen und die Quelle im Simulator ersetzt
   (z. B. als Subcircuit/Teil-Netzliste eines benutzerdefinierten Bauteils, das mit dem Component Wizard angelegt wurde,
   oder als PWL-Datei, auf die ein `PWL_VOLTAGE_SOURCE`-/Datei-Quelle zeigt).
3. `spiceSource` liefert: `V_FGn FGn_INT 0 SIN(...)|PULSE(...)|PWL(...)` plus `R_FGn_OUT FGn_INT OUTn 50`.
   Sinus und Rechteck/Puls ohne Modulation bleiben analytisch (SIN/PULSE); alles andere wird als PWL-Tabelle abgetastet.
4. **PWL-Regeln:** `tStop` mindestens so lang wie die Transientenanalyse wählen (`{ tStop }`), Zeitschritt ≥ 20 Punkte pro Periode,
   maximale Simulationsschrittweite des Simulators `≤ dt`. Bei sehr langen Läufen `dt`/`tStop` erhöhen (Grenze: 200 000 Punkte).
5. Ausgangsknoten: `OUT1`, `OUT2`, Masse `0`/COM. Sync-Ausgang optional als zusätzliche Quelle mit `fg.sync()`.

### Weg B – Verhaltensquelle (ABM/B-Source) mit Callback
Wenn die Umgebung einen Callback „Spannung zum Zeitpunkt t“ erlaubt (z. B. über ein API/Co-Simulation-Plugin, DLL, Python-/LabVIEW-Anbindung):
* Bei jedem Solver-Schritt `fg.voltage(ch, t, loadOhms)` bzw. – falls der Simulator die Last selbst rechnet – die **Quellenspannung**
  `fg.voltage(ch, t)` (Leerlauf) verwenden und den 50-Ω-Serienwiderstand in der Schaltung modellieren.
* **Nicht** zusätzlich `loadOhms` anwenden, wenn der Simulator die 50 Ω selbst bildet (sonst doppelte Spannungsteilung).
* Funktion ist zustandslos → Solver-Rollbacks sind unkritisch.

### Weg C – iframe/WebView mit postMessage
`installBridge(core)` (in `core.ts`) stellt `window.functionGenerator` und ein postMessage-Protokoll bereit:

```
Host → Generator:  { fg:'voltage', id, ch:0|1, t, load? }   → { fg:'reply', id, value }
                   { fg:'block',   id, ch, t0, dt, n, load? }
                   { fg:'state',   id }       { fg:'dispatch', action }
Generator → Host:  { fg:'change', state }     (bei jeder Bedienung)
```
Für schrittweise Simulationen ist `block` (Batch) wesentlich schneller als Einzelabfragen. Vor der Simulation einen Block vorab abrufen.

### Frontpanel-Realismus (nur Oberfläche)
Diese Details gehören zur Zielanwendung, nicht zur Simulation – aber sie machen das Gerät glaubwürdig:

* **Geräusche** (`audio.ts`): Jede Tastenfamilie hat einen eigenen Klick (Ziffernblock, Softkeys, Wellenform,
  Netzschalter, Umschalter, Pfeiltasten), der Drehknopf rastet hörbar, Stecken/Abziehen der BNC-Leitung spielt
  einen mechanischen Doppelklick mit Metallring und Kabelschutter. Alles prozedural per WebAudio, keine Audiodateien.
  Schalter: Utility → **Beep** (`sys.beep`, werkseitig `true`); bei `false` bleiben alle Geräusche stumm.
* **Drehknopf**: Nur Rändelung und Markierungspunkt drehen mit (`.fg-knob-rotor`). Kappe, Licht/Schatten und der
  abwurfene Koranschatten stehen still – wenn ein Rotator mit den Schatten dreht, wirkt es sofort unnatürlich.
* **Boot**: Der Einschalt-Splash wird während des Renderns aktiviert (`Lcd.tsx`, `prevPower`), damit nie ein Frame
  des echten Displays vor dem Bootscreen durchblitzt; danach blendet `.lcd-fade` kurz ein.
* **Text**: `user-select: none` global, nur `.lcd-select` (LCD-Rahmen) ist markierbar – Bedienelemente lassen sich
  nicht mit der Maus markieren. Wer die Markierung anderswo braucht, setzt die Klasse gezielt.

### Patchfeld / Messleitungen (nur Oberfläche)
Die steckbaren BNC-Leitungen (`cables.ts`, `CableLayer.tsx`) sind **reine Darstellung** und gehören *nicht* zum Kern.
Sie bestimmen in dieser Demo lediglich, welcher Generatorkanal auf welchem Oszilloskop-Eingang landet und mit welcher
Eingangsimpedanz (`1 MΩ` / `50 Ω`) `core.voltage(ch, t, loadOhms)` aufgerufen wird.

In der Zielanwendung übernimmt **die Verdrahtung im Schaltplan** diese Rolle:
* Kein Kabel/Draht am Pin → Ausgang unbelastet (`loadOhms = Infinity`), bzw. der Simulator rechnet die Last selbst.
* Der Kabelzustand muss also **nicht** portiert werden. Wer die Leitungen trotzdem im Panel zeigen will
  (z. B. als Hinweis „verbunden mit Netz X“), leitet `CableLink[]` aus der Netzliste ab und rendert `CableLayer` unverändert.
* Bedienung der Demo: Buchse anklicken = auf-/abstecken, von Buchse zu Buchse ziehen = gezielt verbinden.

### Anschlussbelegung (Frontpanel ↔ Schaltplansymbol)
| Frontpanel | Symbolpin | Bemerkung |
|---|---|---|
| BNC OUT1 (Seele) | `OUT1` | 50 Ω Innenwiderstand |
| BNC OUT2 (Seele) | `OUT2` | 50 Ω Innenwiderstand |
| BNC-Schirm | `COM` / GND | gemeinsame Masse beider Kanäle |
| (optional) Sync | `SYNC` | 0/5 V TTL |

---

## 7. Schritt-für-Schritt-Checkliste für den Agenten

1. **Kern kopieren:** `src/generator/*` unverändert übernehmen (Tests aus Abschnitt 9 laufen lassen).
2. **Host-Adapter schreiben** (~50 Zeilen), der `GeneratorCore` besitzt und eine der Strategien A/B/C implementiert.
3. **Bauteil-Eigenschaften abbilden:** Bei „Bauteil-Properties“ der Zielumgebung `dispatch({type:'patch', …})` verwenden, nicht den State direkt ändern
   (`patch` ruft `sanitize()` auf und hält alle Grenzwerte ein).
4. **UI einbetten:** entweder `FunctionGenerator.tsx` in einer WebView hosten (Vite-Build erzeugt eine einzige `dist/index.html`, siehe `vite-plugin-singlefile`)
   oder die Komponenten gegen native Widgets ersetzen. Die Geometrie des Panels ist in `FunctionGenerator.tsx` fest (Stage 1160×545 px, wird per CSS-`transform: scale` skaliert).
5. **Persistenz:** `new GeneratorCore(storage)` mit Adapter der Zielumgebung (Interface `StorageLike { getItem, setItem }`) → Speicherplätze M1–M4. Kompletten `GenState` zusätzlich in der Projektdatei sichern.
6. **Simulationsstart:** Zustand einfrieren (Snapshot von `getState()`), Quelle erzeugen/registrieren; während der Simulation ist Live-Bedienung optional
   (Änderungen wirken erst ab dem nächsten Lauf, außer der Host unterstützt Live-Parameter).
7. **Abnahmetests** (Abschnitt 8) durchführen und Ergebnisse gegen das Original vergleichen.

---

## 8. Referenz-Testwerte (Werkseinstellung: CH1 Sinus 1 kHz, 1 Vpp, Offset 0, High‑Z, CH1 Ausgang EIN, CH2 AUS)

| Prüfung | Erwartung |
|---|---|
| `voltage(0, 0.25e-3)` | `0.5` V |
| `voltage(0, 0.25e-3, 50)` (High‑Z-Einstellung, 50 Ω Last) | `0.25` V |
| `voltage(1, t)` | `0` (Ausgang CH2 aus) |
| Load = 50 Ω, `voltage(0, 0.25e-3)` (Leerlauf) / `…, 50)` | `1.0` V / `0.5` V |
| Ziffernfolge `2 . 5` + F2 („kHz“) | `freq = 2500` |
| Ziffernfolge `1` + F3 im Amplitudenmenü („Vrms“, Sinus) | `amp ≈ 2.828427 Vpp` |
| Burst 3 Zyklen, 1 kHz, Periode 10 ms | aktiv bei `t=0.25 ms`, Ruhepegel = Offset bei `t=5 ms` |
| `formatString(1000,'freq',true)` | `1.000,000kHz` |
| Amplitude 99 Vpp eingeben (Offset −0.5 V) | wird auf 19 Vpp begrenzt, LCD-Meldung „Amplitude limited to 19.000Vpp“ |

---

## 9. Selbsttests des Kerns

```bash
npx tsx scripts/selftest.ts    # Tastenfolgen, Einheiten, Knopf/Cursor, Grenzen
npx tsx scripts/selftest2.ts   # Signalwerte, Last, Modulationsarten, Vorschau
npx tsx scripts/spice.ts       # Beispielausgabe des SPICE-Exports
```
(`tsx` wird per `npx` geladen; alle Zeilen sollten `PASS` liefern – *„burst active“ in selftest2 schlägt absichtlich an, weil dort zuvor Load = 50 Ω gesetzt wurde und die Leerlaufspannung dadurch 2 × beträgt.*)

---

## 10. Typische Fallstricke

* **Kein Phasenakkumulator einführen.** Wer Zustand im Signalpfad hält, bekommt bei adaptiven Solvern falsche Phasen. Das Modell ist absichtlich analytisch.
* **Rauschen** ist deterministisch (Hash des Zeitindex). Für andere Verteilungen (Gauß) `noiseAt()` ersetzen, Test in `selftest2` anpassen.
* **Numerische Präzision:** `t` als `double`; bei `t > 1e6 s` und `f > 1 MHz` nimmt die Phasenauflösung ab.
* **Einheiten-Umrechnung** (`EDIT_UNITS`) und Anzeige (`format.ts`) sind getrennt; `Vrms` nutzt den Crest-Faktor der aktuellen Welle (`ppPerRms`).
* **Last doppelt anwenden** ist der häufigste Fehler (siehe Weg B).
* **Modulation & Rauschen:** Modulation ist für Rauschen gesperrt (wie am Gerät).
* **Tastatur-Shortcuts** (0–9 . − ← → ↑ ↓ Enter F1–F5) sind nur in `FunctionGenerator.tsx` implementiert; in einer Ziel-UI ggf. entfernen, wenn sie mit Host-Shortcuts kollidieren.
* **Audio-Monitor** (`hooks.ts`) und die Klickgeräusche (`audio.ts`) sind reine Demo-Funktionen und für die Simulation irrelevant.
* **`sys.beep`** ist der Schalter für die Frontpanel-Geräusche (nicht für die Signalberechnung) und darf daher im Simulator ignoriert werden.

---

## 11. Erweiterungspunkte

| Wunsch | Stelle |
|---|---|
| Neue Wellenform | `WaveId` in `types.ts`, `carrierAt()` + `MAXF` + `WAVE_NAMES` in `waveforms.ts`, `mainFields()`/`mainMenu()` in `menu.ts`, Icon in `Icons.tsx`, Taste in `FunctionGenerator.tsx` |
| Eigene Arb-Kurven / Import (CSV) | `ARB_WAVES` erweitern (Funktion `x∈[0,1) → [−1,1]`) oder Tabellenlookup mit linearer Interpolation ergänzen |
| Weitere Parameter | Eintrag in `FIELDS` (`fields.ts`), Einheit in `KINDS`/`EDIT_UNITS`, Menüpunkt in `menu.ts` |
| Trigger / externes Modulationssignal | `Channel` erweitern; `normalized()` bekommt ein externes Signal als Argument (z. B. Netz-Spannung aus der Simulation) |
| Geräte-Look ändern | ausschließlich `src/index.css` + `src/components/*` |
