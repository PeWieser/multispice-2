# Wissen — Gelerntes, das bleiben muss

Persistenter Lernspeicher des Repos (angelegt 2026-10-29 auf Wunsch des
Anwenders). Jede behobene Bug-Klasse und jede Werkzeug-Falle wird hier
festgehalten, damit sie sich nicht wiederholt. **Stehend pflegen:**
beim Beheben eines Fehlers den Eintrag ergänzen, nicht erst am Ende.

Regel für Einträge: *Symptom → Ursache → Fix → Nachweis*.
Kurz, ohne Roman. Neueste Einträge stehen oben in ihrer Rubrik.

## 1 · Steuer-Schlüssel (Controls): Label gewinnt, nie die Instanz-ID

- **Regel:** Der kanonische Steuer-Schlüssel ist `controlKeyOf(inst)`
  (`src/lib/sim/controls.ts`): Geräte-Label, falls vorhanden, sonst die
  Instanz-ID. Alle Schreiber (`engine.setControl`, `controls[...]`,
  `mousePressed`, Poti-Drag, Tastatur) nutzen ihn; alle Leser prüfen ihn
  **zuerst** und fallen nur aus Kompatibilität auf die reine Instanz-ID
  zurück (Legacy-Dokumente).
- **Gelernt 2026-10-28 (Schalter-Bug):** Schalter schrieben ihren Zustand
  pro Instanz-ID, der Solver/Overlay lasen pro Label (Geräte-ID `S1`) —
  die Sim sah den Klick nie, der Poti blieb stehen. Sichtbar nur bei
  Dokumenten mit `id ≠ label`; Tests mit `id == label` waren blind dafür.
- **Tests müssen `id ≠ label` abdecken** (`scripts/switchtest.ts`,
  Sektion 10: 8 Schlüssel-Prüfungen + elektrisch 0 V → 8 V). Browser:
  `e2e/sim-regressions.spec.ts` klickt den Schalter und prüft 0 → 8 → 0 V.
- **Gleiche Bug-Klasse, gleich mitgefixt:** MCU-States sind pro Label
  gekeyt, das Umbenennen räumte pro Instanz-ID auf (toter Code) —
  Cleanup nutzt jetzt beide Schlüssel (`setInstanceText`).

## 2 · Sim-Eigentümerschaft: genau ein Reiter läuft

- **Regel:** Das Lauf-Flag gehört der Datei, nicht dem globalen Store.
  `SheetEntry.simRunning` (optional, `src/state/editor/types.ts`) markiert
  den Eigentümer; `startSim` räumt alle Fremd-Flags ab (Single-Owner),
  Pause/Stopp löschen alle Flags. Höchstens ein Reiter trägt je das Flag.
- **Reiterwechsel (`openSheet`)** hält die Engine an (Zustand bleibt),
  sichert das Flag am alten Entwurf und setzt beim Ziel nur fort, wenn
  dessen Flag gesetzt ist — ohne Rebuild, sofern die Engine noch dessen
  Stand hält (`engine.builtDocId`-Guard in `src/lib/sim/realtime.ts`).
- **Badge:** `SheetTabs` zeigt einen grünen Punkt am Eigentümer
  (`entry.simRunning`, Fallback: aktiver Reiter + `sim.running`);
  Start/Pause/Stopp bumpen `sim.tick`, damit die Leiste neu zeichnet.
- **Falle (beim Fix selbst gefunden):** `closeSheet` ruft `openSheet`
  auf, nachdem der Reiter schon entfernt ist — das Sichern des aktuellen
  Entwurfs hätte ihn zurück in die Liste gelegt. Deshalb
  `openSheet(id, { stashCurrent: false })` für diesen Weg.
- **Nicht anfassen:** Der Bauteile-Editor (`partEditor`) hat einen eigenen
  Testlauf; das Geräte-Verhalten bleibt unverändert.
- **Nachweis:** `scripts/sheettest.ts`, Sektion 9 (u. a. Fortsetzung
  ohne Rebuild: `rebuilds=0`); Browser-Regression in
  `e2e/sim-regressions.spec.ts` prüft echten Tabwechsel und Lauf-Badge.

## 3 · Werkzeug-Fallen (Sandbox)

- **Phantom-Erfolge:** `edit_file` meldete mehrfach „success“, ohne zu
  schreiben (Canvas-Poti-Drag, switchtest-Import, alle drei
  `controlKeyOf`-Importe). **Jeden Edit per grep/sed verifizieren**,
  bei Fehlschlag mit mehr Kontext oder per Python wiederholen.
- **Anker mit Sonderzeichen:** In `sheets.ts` steht `„+"` mit ASCII-`"`,
  nicht deutschem `“` — Copy-Paste-Anker schlugen fehl. Bei
  „Context not found“ die Zeile per `od -c` prüfen.
- **Heredoc-Escaping:** Im quoted Heredoc (`<<'PYEOF'`) Python-Escapes
  **einfach** schreiben (`ß` direkt oder `\u00df`) — `\\u00df` bleibt
  literal und matcht nie.
- **`npx tsc` ohne node_modules** installiert das falsche Paket
  `tsc@2.0.4` (Exit 0 ist BOGUS) — erst `npm ci`, dann echtes `tsc`.
- **`gh run watch --exit-status`** meldete Exit 0 bei `conclusion:
  failure` — Status immer mit `gh run view --json status,conclusion`
  verifizieren.
- **`gh run view --log-failed`** scheitert aus der Sandbox (Netz geblockt)
  — stattdessen `gh api .../commits/<sha>/check-runs` und
  `.../check-runs/<id>/annotations` (api.github.com ist erlaubt).
- **Ref-Grep mit Glob `scripts/*.test.ts`** schlug fehl (kein Treffer im
  Arbeitsverzeichnis) — Pfade/Arbeitsverzeichnis beim Retry prüfen.
- **Browser in restriktiver Sandbox:** Playwright-CDN kann gesperrt sein.
  Temporärer `@sparticuz/chromium`-Browser kam isoliert aus npm, mit
  explizitem `executablePath` und seinen Systembibliotheken. Lokale Version
  kann von Playwright-CI abweichen; der GitHub-CI-Lauf mit dem regulären
  Playwright-Browser bleibt der maßgebliche Nachweis. `package-lock.json`
  und Projektabhängigkeiten dafür nicht verändern.
- **Verwaister E2E-Server:** Ein abgebrochener Playwright-Prozess kann den
  Port 3100 belegen. Vor Build/Start mit `ss -ltnp` und Prozessliste prüfen;
  nur den identifizierten Restprozess beenden, keine parallelen Server starten.
- **Nach Sandbox-Reset:** lokale Historie kann weg sein, aber
  `origin/<branch>` überlebt — vor Re-Commit `git fetch origin <branch>`
  + Tree-Diff prüfen (war schon einmal leer → reset statt Doppel-Commit).

## 4 · Befund-Technik (aus früheren Sitzungen, weiter gültig)

- **Zoom-Fehlalarm:** Striche im Zoom gegen das Export-JSON gegenprüfen
  (Beispiel TL072: Minus-Glyphe des Labelnamens, kein Stutzen-Überlauf).
- **Grid-Align:** gemeinsame Stub-Muster matchen auch als Teilsequenz
  längerer Stutzenreihen (Oszi/Logic) — TXT-verankerte Ersetzungen nutzen.
- **Eliminierte Hypothesen nicht erneut prüfen** (Beispiel Okt-28:
  oszi2-Engine, fg2-uiTick, Doppel-Canvas, Multi-Engine, Analyse-Auto-Run,
  Seiten, Oszilloskop-`startSim()` — echte Tab-Ursache war `applyDoc`).

## 5 · E2E: reale Interaktionen statt überholter Annahmen (2026-10-31)

- **Ausgangslage:** CI hatte 17 rote und 109 grüne Tests. Alle 17 wurden
  lokal einzeln reproduziert und auf Ursache geprüft; nicht pauschal als
  „flaky“ behandeln oder Assertions entfernen.
- **Anwendungsfehler:** Der Seiten-Navigator lag durch den Sticky-Stapelkontext
  hinter dem Canvas → Menü/Backdrop als Body-Portal. Der mobile Drawer
  reagierte nicht auf Escape → Capture-Handler; ein darüberliegender modaler
  Dialog bzw. Bauteile-Editor erhält Escape zuerst. Außerdem schrumpfte die
  mobile Toolbar bei breiter Fallbackschrift die 36-px-Buttons auf 35,25 px:
  Buttons bleiben ungeschrumpft, der Markenname darf bei Bedarf kürzen.
  Browserregressionen prüfen Seitenwechsel, Schließreihenfolge Dialog → Drawer
  und reale Touchflächen innerhalb des Viewports bei 390 und 320 px.
- **Tests auf echte Abläufe aktualisiert:** `newDocument` behält existierende
  Entwurfstabs; aktive Tabs per ID statt `.first()` ansprechen. Der Assistent
  zoomt die Schaltung automatisch; für spätere Platzierung wird der Canvas
  neu zentriert. Ein freies Leitungsende verlangt Doppelklick, und das zum
  Prüfen geöffnete Log darf den noch zu zeichnenden Endpunkt nicht verdecken.
- **Oszilloskop:** CH1 ist Pin 0, Masse Pin 4; Tests prüfen `OUT` und `0`
  als reale Netze. Softkey-Menüs werden auf Canvas gezeichnet, nicht als
  DOM-Text; tatsächlich Menütaste 3 für XY und die FFT-Taste klicken und
  die gespeicherten Geräteeinstellungen prüfen. Das breite Gerätefenster
  kann anfangs rechts über den Viewport ragen: Tests ziehen es wie ein
  Nutzer an der Titelzeile ins Bild (keine erzwungenen Klicks, keine
  Änderung am Geräteverhalten). Der anfängliche Überhang bleibt als
  mögliche separate UI-Verbesserung dokumentiert.
- **Tests präzisieren:** Stromrichtung nur bei Strom-/Leistungssonden,
  Einfügen nur nach Kopieren; CSV-Test erzeugt eine echte Sonde und prüft
  ihre Datenzeile. Browser-`eval`-Strings enthalten JavaScript, keine
  TypeScript-Casts; Next-Metadaten können vor dem App-Root liegen. Externe
  Datenblatt-Links per Context-Route isolieren und tatsächliche Popup-Ziel-URL
  prüfen, statt Internet-Zugriff oder Fremdserver-Verfügbarkeit vorauszusetzen.
- **CI-Bedingungen:** 1 Worker, 60 s Timeout, 1 Retry. Neben der Gesamtzahl
  auch Fehlversuche/„flaky“-Status prüfen; ein grüner Retry allein ist kein
  Beweis für einen stabilen Erstlauf. Testmatrix enthält die zusätzlichen
  Regressionen (A09/A10, F13/F14) und ist ein Zielplan, keine Liste
  implementierter Specs. Ihre ursprüngliche Datei endete bereits mitten in
  Q09 mit Trunkierungsmarker; den fehlenden Teil nicht erfinden. Bei
  Teiler-Fixtures Quelle/Widerstände explizit benennen: Assistent-Default
  5 V/10 kΩ/10 kΩ → 2,5 V; 10 V/1 kΩ/2 kΩ → 22,22 mW an R2.
- **Lokaler Nachweis 2026-10-31:** gesamter statischer Chromium-E2E-Lauf
  129/129 im ersten Versuch, 0 flaky/übersprungen (CI-Einstellungen;
  Sandbox-Chromium 153). Die anschließend geschärften Sim-/Scope-Assertions
  bestanden zusätzlich ohne Retry. GitHub-CI verwendet den regulären
  Playwright-Chromium und muss nach Push separat geprüft werden.
