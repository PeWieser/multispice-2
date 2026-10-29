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
  Sektion 10: 8 Schlüssel-Prüfungen + elektrisch 0 V → 8 V).
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
  ohne Rebuild: `rebuilds=0`).

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

## 5 · e2e-Stand (2026-10-28, auf main verifiziert)

- 17 rote Tests (S3.20/22/23, S7.1/8/9/10, S9.1/S9.9, S13.5,
  16.3/4/5/13/14/17, S17.7), 109 grün — alle 17 vorbestehend und flaky
  (identisch auf `26d3c59`; ältere Commits zeigen teils andere Mixe).
- `verify`/Windows-Build/Pages grün. e2e-Fix ist Folgeschritt, kein
  Teil dieses Branches.
