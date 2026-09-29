# Übergabe — Oszilloskop-Port & FG-2500 (Runden 15–18)

> **Zweck dieses Dokuments:** Damit der nächste Agent sofort bescheid weiß —
> was der User gefordert hat (inkl. Originalzitat), was gemacht wurde, welche
> Vorgaben verbindlich bleiben, wo alles liegt und welcher Verifikationsstand gilt.
> Detail-Protokoll je Runde: [`STEVE_JOBS_QUALITY_AUDIT.md`](STEVE_JOBS_QUALITY_AUDIT.md) §15–§18.1.

---

## 0 · Kurzfassung für den nächsten Agenten

- **Produkt:** Multispice — Browser-EDA mit SPICE-Kern, Schaltplan-Editor und virtuellen
  Messgeräten (siehe [README.md](README.md)).
- **Diese Rundenreihe:** Die Oszi-Portierung (aus `oszi v2`) war fehlerhaft und wurde
  repariert/vollendet (R15–R17); danach wurde der alte Funktionsgenerator (XFG) durch den
  FG-2500 (aus `function generator/`) ersetzt — Platzierung/Nutzung wie am Oszi (R18);
  zusätzlich wurde der Cloudflare-Pages-Build repariert.
- **Vor jedem Commit verifizieren** (Abschnitt 7), **keine `eslint-disable`-Lösungen**,
  Antworten/App-UI auf **Deutsch**, **bei Fragen fragen** (v. a. Interaktionsdesign nie
  ungefragt festlegen — Rüge R14).
- Stand: 2026-09-29, alles gemergt, Prüfungen grün (Abschnitt 6).

---

## 1 · Der Originalauftrag (was der User am Anfang geschickt hat)

> „Verschaffe dir einen Überblick über das Repo (doku.md), dann gucke dir die Portierung
> des Oszilloskops an — sie ist fehlerhaft (Störsignale, Single-Trigger, Scrollbalken,
> Fenster nicht weit genug nach oben, weitere unentdeckte Fehler). Oszi-Vorbild unter
> `oszi v2` (main). Bei Fragen fragen."

**Nachtrag (Runde 18, zweite User-Aufgabe):** FG-2500 aus `function generator/` (inkl.
`PORTING.md`) ersetzt den aktuellen Funktionsgenerator — **ohne Ton-Ausgabe**, gleiche Art
der Platzierung und Nutzung wie das Oszi (Symbol aus der Bibliothek, Pins verdrahten,
Doppelklick = gebundenes Gerätefenster). Zusätzlich Cloudflare-Pages-Build reparieren.

> Anmerkung: Die im Auftrag erwähnte „doku.md" war eine Chat-Anlage bzw. Bezeichnung für
> den Repo-Überblick und **nie Teil des Repos**. Ihre Rolle übernimmt
> [README.md](README.md); Auftrag, Entscheidungen und Ergebnisse stehen in diesem Dokument
> und im Audit-Protokoll. Wenn der Originaltext der doku.md ins Repo soll: bitte erneut
> anhängen, dann wird er hier eingefügt.

---

## 2 · Verbindliche Vorgaben des Users (Rügen & Ask-User-Antworten)

| Quelle | Vorgabe |
|---|---|
| R14-Rüge | **Bei Fragen immer fragen.** Annahmen (v. a. Interaktionsdesign) vorab erfragen — nie ungefragt umsetzen. |
| Durchgehend | Antworten und App-UI auf **Deutsch**. Erst Plan ins `STEVE_JOBS_QUALITY_AUDIT.md`, dann Implementierung. |
| R16 | Realismus **komplett** (Klicks, Brummen, Trigger-Rauschen, BW-Filter usw.). |
| R16 | **Messleitung:** Klick auf eine Leitung **oder** einen Pin ersetzt die Kanal-Leitung. |
| R16 | Fenster **frei verschiebbar** + **Rückholhilfe**, wenn es weg ist. |
| R16 | Gerät **1:1** übernehmen (nur herunterskalieren), Fenster **klebt beim Öffnen am Gerät**. |
| R17 | **Nutzungsverhalten (verbindlich):** Simulation an = Signal an; pausiert = tote Schaltung (0 V + Grundrauschen), Bild lebt; **Single** startet die Simulation für eine Aufnahme kurz selbst. |
| R18 | **Ton:** Klick-Geräusche bleiben (wie am Oszi, über Utility→Beep abschaltbar) — **kein** Audio-Monitor/Signal-Ton. |
| R18 | **Pins des FG:** OUT1, OUT2, COM, SYNC (vollständig). |
| R18 | **Altes XFG ersetzen, ohne Migration** (alte Projekte verlieren XFG-Einstellungen); AC-Quelle/Pulsquelle bleiben eigenständig. |

---

## 3 · Was gemacht wurde (Runden 15–18, diese Branch)

- **Runde 15** ([§15](STEVE_JOBS_QUALITY_AUDIT.md)): `oszi v2` (OTX2074) komplett übernommen —
  4-Kanal-Vollgerät (Menüs, FFT, Cursor, Math, Zoom, Suche); USB-Port entfernt; Anschlüsse
  sind Verdrahtungs-Pins (offen = kein Kabel, 0-V-Kurve); Testbench entfällt.
- **Runde 16** ([§16](STEVE_JOBS_QUALITY_AUDIT.md), Reaktion auf „fehlerhafte Portierung"):
  lebendes Bild (Oszi-Clock; pausierte Simulation = tote Schaltung), Single-Trigger mit
  Auto-Start + Auto-Fallback, 2-Stufen-Signalpfad gegen Garbage-Kurven, Fenster
  1500×980 viewport-geclampt ohne Scrollbalken, Drag unter die Leisten.
- **Runde 17** ([§17](STEVE_JOBS_QUALITY_AUDIT.md)): Realismus (Klick-/Trigger-/Ausschalt-
  Geräusche, Netzbrummen, Trigger-Rauschen, Bandbreiten-Filter, Messwert-3-Hz-Glättung,
  Kanal-Abgleich, sanftes Ein/Aus), Messleitung per Klick auf Leitung/Pin,
  Fenster-Transform-Drag + Rückholhilfe, Auto-Size am Gerät, Library-Drag-Fix.
- **Runde 18** ([§18/§18.1](STEVE_JOBS_QUALITY_AUDIT.md)): FG-2500 ersetzt XFG (Abschnitt 4/5)
  + Cloudflare-Fix: `"function generator"` (Leerzeichen) aus `tsconfig.json`-`include`
  ausgeschlossen.

---

## 4 · Repo-Lagekarte (wo lebt was)

| Pfad | Inhalt |
|---|---|
| `oszi v2/` (main) | **Vorbild** des Oszilloskops (OTX2074) — nur Referenz, nicht Teil des Builds. |
| `function generator/` (main) | **Vorbild** FG-2500 + `PORTING.md` (verbindliche Portieranleitung) + `scripts/` (Kern-Selbsttests). Nicht Teil des Builds (`tsconfig`-Exclude!). |
| `src/components/oszi2/` | Oszi-Frontpanel-Port (UI). |
| `src/components/OsziScope.tsx` | Oszi-Adapter: Kanal-Brücken, Messleitung, Fenster-Handling. |
| `src/lib/fg/` | FG-2500-Kernkopie **1:1** (unverändert lassen!). |
| `src/components/fg2/` | FG-Frontpanel-Port (FunctionGenerator.tsx, Lcd, Knob, Key, Bnc, Icons, CSS). |
| `src/components/FgScope.tsx` | FG-Adapter: GeneratorCore pro Fenster, `params.fgstate`-Spiegel (debounced 300 ms). |
| `src/lib/sim/engine.ts` | Quellkern: `SourceKind 'fg'/'fgsync'`, `sourceValue`, Transient-Engine. |
| `src/lib/library/catalog.ts` | Bauteil `funcgen` (XFG): Pins OUT1/OUT2/COM/SYNC, `toDevices` = 3 V-Quellen. |
| `src/components/Instruments.tsx` | Geräte-Fenster (`FgScopeLazy`, `OsziScopeLazy`), DeviceBar-Platzierung. |
| `src/components/Canvas.tsx` | Doppelklick auf Symbol = gebundenes Gerät. |
| `src/state/editor.ts` | `openInstrument` (gebundene Fenster), `fgDefaultSize`. |
| `STEVE_JOBS_QUALITY_AUDIT.md` | Vollständiges Runden-Protokoll (§3–§18.1) inkl. aller User-Rügen/-Antworten. |

---

## 5 · Architekturentscheidungen (nicht neu aufmachen — begründet)

- **Oszi-Port 1:1** aus `oszi v2`; Abweichungen nur wo vom User genehmigt. Anschlüsse =
  Schaltsymbol-Pins (Messleitungen werden verdrahtet, nicht per Kabel-Layer).
- **FG-Kern bleibt unverändert:** `GeneratorCore` hat privaten State → Seed per typisiertem
  Cast im Adapter; `hooks.ts`/`beep()` der Demo = toter Code, wird nicht angeschlossen.
- **Signalpfad FG (PORTING.md „Weg B"):** `toDevices` erzeugt drei Zeit-Spannungen gegen COM
  mit `params.rser: 50` (SYNC `rser: 0`) — die **offene** Thévenin-Spannung
  (`outputVoltage(state, idx, t, ∞)`); die Lastteilung macht die Engine intern.
  `sourceValue('fgsync')` = `syncVoltage` (0/5-V-TTL, folgt `state.active`).
- **Zustandsspeicherung FG:** `params.fgstate` (JSON von `GenState`), Spiegelung aus dem
  Gerät heraus debounced (Undo/engine.rebuild), `fgStateOf()` mit Fallback `initialState()`.
- **Fenster:** gebunden an die Bauteil-Instanz (Doppelklick/DeviceBar-Recall), kleben am
  Gerät beim Öffnen, skaliert nur herunter (FG `min(1, w/1160)`, Auto-Size ≈1190×593).
- **Keyboard-FG:** Window-Capture mit Fokus-Guard + `stopImmediatePropagation` (nur wenn das
  FG-Fenster Fokus hat; nicht während Texteingabe).
- **Lint-RC-Regeln** (React-Compiler): keine `eslint-disable`! refs-during-render und
  set-state-in-effect werden umstrukturiert (Beispiel: FG-LCD `bootTick`/`msgHidden`-Pattern
  in `fg2/Lcd.tsx`).

---

## 6 · Verifikationsstand (2026-09-29, vor dem Merge)

| Prüfung | Ergebnis |
|---|---|
| `./node_modules/.bin/tsc --noEmit` | sauber |
| `npx --no-install eslint src` | sauber (ohne eslint-disable) |
| `npm test` | 26× PASS (410 Teile, 2098 Pins deckungsgleich) |
| `npx --no-install next build` | ✅ (Cloudflare-Exclude wirkt) |
| Kern-Selbsttests FG (`function generator/scripts/selftest*.ts`) | wie dokumentiert („burst active" = Soll-Fail, PORTING §9) |
| PORTING §8-Referenzwerte gegen `src/lib/fg` | 15/15 |
| End-to-End (FG-Bauteil → toDevices → Engine-Transient) | 7/7 (RC-Last: Source 0,953 Vpp = Theorie, RC-Mitte 0,150 Vpp, SYNC 5,000 V) |

---

## 7 · Verifikationskommandos (Pflicht vor jedem Commit)

```bash
./node_modules/.bin/tsc --noEmit            # NICHT npx tsc
npx --no-install eslint src
npm test                                    # VOLLausgabe
npx --no-install next build
```

Kern-Selbsttests (bei Änderungen am FG-Kern — nur im Vorbild, Pflicht: Kernkopie bleibt
unverändert):

```bash
cd "function generator" && npx tsx scripts/selftest.ts && npx tsx scripts/selftest2.ts
```

---

## 8 · Arbeitsregeln dieser Session (beibehalten)

- **Ein** PR je Arena-Branch (hier: `arena/01a0ecd0-multispice-2` → `main`, PR #3);
  Runden-Kommentare als PR-Kommentar; nach jeder User-Nachricht `git fetch origin main`.
- Erst Plan ins Audit (`STEVE_JOBS_QUALITY_AUDIT.md`), dann implementieren.
- Antworten auf Deutsch; bei Fragen **fragen**, nicht raten.
- Große Referenz-Ordner (`oszi v2/`, `function generator/`) gehören nicht in den Build —
  `tsconfig.json`-Exclude beibehalten.
