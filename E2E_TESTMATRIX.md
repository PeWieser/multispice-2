# E2E-Testmatrix — MultiSpice im Browser (Playwright)

Stand: 2026-10-11; Ergänzungen F13/F14 und A09/A10: 2026-10-31. Strategie: **echte UI-Interaktionen** (Menüs, Tastatur, Maus auf Canvas),
Assertions über sichtbare UI (Canvas-`aria-label`, Konsole, Sonden-Tabelle, Statusleiste, Dialoge)
plus Lesezugriff auf den Store via `window.__multispice` (Setup/Präzisions-Assertions).
Runner: GitHub Actions (`e2e`-Job, Chromium, statischer Export aus `out/`).

Legende Prio: **P0** = Smoke/kritische Pfade, **P1** = wichtig, **P2** =
Abdeckung/Edge-Cases. Dies ist eine **Zielmatrix**, keine Liste bereits
implementierter Tests: Spec-Namen können Planungen bezeichnen. Die tatsächlich
ausführbaren Fälle zeigt `npx playwright test --list`.

## A — App-Start & Shell

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| A01 | App lädt (leerer Storage) | Menüleiste, Canvas, Statusleiste sichtbar; Canvas-Label „keine Bauteile“; keine Console-Errors | P0 | smoke/boot |
| A02 | Alle 7 Top-Menüs öffnen | Datei/Bearbeiten/Ansicht/Vorlagen/Analysen/Geräte/Hilfe listen Einträge | P0 | smoke/menus |
| A03 | Ansicht-Panel toggeln | Bibliothek, Inspector, Auswertung & Konsole ein/ausblendbar | P1 | shell/panels |
| A04 | Zoom-Steuerung | Vergrößern/Verkleinern/Einpassen ändert Zoom (Store `view.zoom`) | P1 | shell/zoom |
| A05 | Hilfe → Referenz | Referenz-Dialog öffnet/schließt (Esc, X, Klick daneben) | P1 | shell/reference |
| A06 | Tastatur-Hilfe (?) | Shortcut-Übersicht öffnet | P2 | shell/shortcuts |
| A07 | Neuer Schaltplan | Leeres Doc, Summary „keine Bauteile“, Undo-Verlauf zurückgesetzt | P1 | shell/new-doc |
| A08 | Fokusfallen in Dialogen | Tab bleibt im Modal, Esc schließt | P2 | a11y/focus-trap |
| A09 | Mobiler Drawer mit Dialog | Esc schließt zuerst den Dialog, dann das Menü | P1 | steve/s09-responsive: Mobil Esc |
| A10 | Mobile Touchflächen | TopBar-Buttons bleiben bei 390 und 320 px mindestens 36 × 36 px und im Viewport | P1 | steve/s09-responsive: S9.4 |

## B — Vorlagen (alle 8 Presets)

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| B01 | RC-Tiefpass laden | Summary enthält Bauteile + „ERC still“; Labels IN/OUT vorhanden | P0 | presets/load |
| B02 | Einweg-Gleichrichter laden | Lädt, ERC still | P0 | presets/load |
| B03 | 555 Astabiler laden | Lädt, ERC still | P0 | presets/load |
| B04 | Emitterschaltung laden | Lädt, ERC still | P0 | presets/load |
| B05 | Nichtinvertierender OPV laden | Lädt, ERC still | P0 | presets/load |
| B06 | Arduino Blink laden | Lädt (Co-Sim-Hinweis ok) | P1 | presets/load |
| B07 | 4-Bit-Zähler laden | Lädt, ERC still | P1 | presets/load |
| B08 | Buck-Regler laden | Lädt, ERC still | P1 | presets/load |
| B09 | Galerie mit Vorschau | PresetGallery öffnet, Klick lädt Preset | P2 | presets/gallery |

## C — Bibliothek & Platzieren

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| C01 | Bibliothek öffnen/schließen | ⌘K toggelt; Suche `#lib-search` fokussierbar | P0 | edit/library |
| C02 | Suche „nmos“ + platzieren | Trefferliste, Klick → Platziermodus, Canvas-Klick setzt Instanz (Summary zählt) | P0 | edit/library |
| C03 | Such-Wert „r 10k“ | Platzierter Widerstand hat R=10 kΩ (Inspector/Store) | P1 | edit/value-preset |
| C04 | Schnellleiste (R/C/VDC/GND) | Klick auf „Widerstand“ → Canvas-Klick platziert | P0 | edit/quickplace |
| C05 | Drehen/Spiegeln beim Platzieren | R/M ändern Rotation/Mirror der Vorschau, Instanz übernimmt | P1 | edit/place-rotate |
| C06 | Esc bricht Platzieren ab | Kein Teil gesetzt, Tool zurück auf Auswahl | P1 | edit/place-cancel |
| C07 | Favoriten setzen/entfernen | Stern toggelt, Tab „Favoriten“ listet Teil | P2 | library/favorites |
| C08 | Zuletzt verwendet | Platzierte Teile erscheinen unter „Zuletzt“ | P2 | library/recent |
| C09 | Kategorienavigation | Klick auf Kategorie filtert Liste | P2 | library/categories |
| C10 | Datenblatt-Link | Teil mit PDF-Badge zeigt Link (Badge sichtbar) | P2 | library/datasheet |
| C11 | Drag & Drop aus Bibliothek | Ziehen auf Canvas platziert Teil | P2 | library/dragdrop |
| C12 | Ungültige Suche | „Keine Treffer“-Zustand, kein Absturz | P2 | library/no-results |

## D — Editieren auf Canvas

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| D01 | Teil anklicken = Auswahl | Inspector zeigt Teil, Summary nennt Auswahl | P0 | edit/select |
| D02 | Teil ziehen = Verschieben | Position ändert sich (Store), Undo stellt zurück | P1 | edit/move |
| D03 | R dreht Auswahl | Rotation +90°, Shift+R −90° | P0 | edit/rotate |
| D04 | M spiegelt Auswahl | Mirror-Flag toggelt | P1 | edit/mirror |
| D05 | Entf löscht Auswahl | Teil weg, Undo stellt her, Redo löscht erneut | P0 | edit/delete-undo |
| D06 | ⌘A/C/V/D | Alles wählen, Kopieren, Einfügen, Duplizieren (Zähler +n) | P0 | edit/clipboard |
| D07 | ⌘Z / ⇧⌘Z | Undo/Redo über Menü-Buttons + Shortcuts | P0 | edit/delete-undo |
| D08 | Menü Bearbeiten aktivieren | Einträge enabled/disabled je nach Auswahl | P1 | edit/menu-state |
| D09 | Referenzen neu nummerieren | R1/R2… lückenlos neu vergeben | P2 | edit/reannotate |
| D10 | Ausrichten (Kontextmenü) | Mehrfachauswahl links/rechts/oben/unten bündig | P2 | edit/align |
| D11 | Notiz hinzufügen/bearbeiten/löschen | T-Werkzeug/Kontextmenü, Text im Doc | P2 | edit/notes |
| D12 | Auswahl aufheben (Esc/Klick) | Inspector leer, Summary ohne Auswahl | P1 | edit/deselect |
| D13 | Gummiband-Auswahl | Drag über leere Fläche wählt mehrere Teile | P2 | edit/rubberband |
| D14 | Doppelklick = Eigenschaften | Inspector/Inline-Editor öffnet sich | P2 | edit/dblclick |

## E — Verdrahtung, Netze & ERC

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| E01 | Leitung Pin→Pin ziehen | W-Werkzeug, Maus-Drag: Wire im Doc, Netze verbunden | P0 | edit/wiring |
| E02 | Leitung an leerer Stelle | Wire endet offen, ERC-Warnung „offen“ | P1 | edit/wire-open |
| E03 | Knotenpunkt (Junction) | J-Werkzeug setzt Verbindungspunkt | P1 | edit/junction |
| E04 | Netzname setzen/ändern | Label-Dialog, Netze im Netzlisten-Tab umbenannt | P1 | edit/netlabel |
| E05 | Leitung begradigen (⇧L) | Orthogonale Führung, keine Diagonale | P2 | edit/straighten |
| E06 | Leitung löschen | Entf auf Auswahl entfernt Wire, Netze getrennt | P1 | edit/wire-delete |
| E07 | Leitung teilen/Abzweig | T-Abzweig erzeugt Junction automatisch | P2 | edit/branch |
| E08 | ERC-Fehler: Kurzschluss Quelle | VDC-Pole kurzgeschlossen → Prüfung-Tab listet Fehler, Marker | P1 | erc/short |
| E09 | ERC-Fehler: schwebender Pin | Warnung im Prüfung-Tab + Canvas-Label zählt Warnungen | P1 | erc/floating |
| E10 | ERC-Marker toggeln (Ansicht) | Marker ein/aus ohne Sim-Neustart | P2 | erc/markers |

## F — Live-Simulation

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| F01 | Start/Pause/Stop | Leertaste + Buttons; Status „läuft/pausiert“; Sim-Zeit läuft/stoppt | P0 | sim/run-stop |
| F02 | Konsolen-Log beim Start | „Simulation gestartet — N Bauteile, M Knoten“ in Konsole | P0 | sim/run-stop |
| F03 | Spannungsteiler: DC-Werte | Vdc-Spalte/OUT ≈ 2,5 V (Assistent-Default: 5 V, 10 kΩ/10 kΩ) | P0 | sim/divider |
| F04 | Leerer Plan starten | Startet ehrlich mit „0 Bauteile“ im Log, kein Absturz | P0 | sim/empty |
| F05 | Singulärer Plan (V kurz) | Start verweigert mit Fehlermeldung im Log | P1 | sim/singular |
| F06 | Spannungsfarben toggeln | Menü Ansicht → Leitungen färben sich (Canvas rendert, kein Fehler) | P0 | sim/volt-colors |
| F07 | Stromfluss-Animation | Toggle läuft ohne Fehler, Canvas rendert weiter | P1 | sim/current-flow |
| F08 | Live-Messwerte an Knoten | Toggle zeigt/verbigt Werte-Overlay | P2 | sim/live-labels |
| F09 | Sim-Geschwindigkeit | Slider ändert Zeitraffer (Sim-Zeit/Realzeit-Verhältnis) | P2 | sim/speed |
| F10 | Editieren während Sim läuft | Änderung stoppt/pausiert oder startet neu (definiert + geloggt) | P1 | sim/edit-while-run |
| F11 | Preset-Sims laufen | Alle 8 Presets: Start ohne Fehler, Sim-Zeit läuft | P1 | sim/all-presets |
| F12 | 555 blinkt (Oszillation) | OUT-Knoten wechselt Pegel über Zeit (Sonde/Store-Samples) | P1 | sim/oscillation |
| F13 | Schalter mit unterschiedlicher Instanz-ID/Referenz | Echte Canvas-Klicks ändern die Schaltungsspannung 0 V → 8 V → 0 V | P0 | sim-regressions: Schalterklick |
| F14 | Sim-Eigentümerschaft über Entwurfswechsel | Nur ein Entwurf läuft; Wechsel pausiert/fortsetzt, fremder Start übernimmt | P0 | sim-regressions: aktiver Entwurfs-Tab |

## G — Sonden & Messwerte

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| G01 | V-Sonde platzieren | Klick auf Netz → Sonde im Doc + Sonden-Tab-Zeile | P0 | probes/place |
| G02 | Vdc-Ablesung Teiler | Sonden-Tab Vdc ≈ 2,5 V nach Start (Assistent-Default) | P0 | sim/divider |
| G03 | Strom-Sonde (A) | Zweigstrom ≈ 3,333 mA bei 10 V und 1 kΩ/2 kΩ | P1 | probes/current |
| G04 | Leistungs-Sonde (W) | P ≈ 22,22 mW an R2 bei 10 V und 1 kΩ/2 kΩ | P2 | probes/power |
| G05 | Differenz-Sonde ΔV | V(R1) ≈ 3,333 V bei 10 V und 1 kΩ/2 kΩ | P2 | probes/diff |
| G06 | REF-Sonde | Referenzknoten setzt Messbezug, Werte relativ | P2 | probes/ref |
| G07 | Digital-Sonde (D) | Pegel H/L am 555-OUT/Zähler | P1 | probes/digital |
| G08 | Sonde löschen/umbenennen | Kontextmenü/Inspector, Tabelle aktualisiert | P1 | probes/manage |

## H — Instrumente (alle 13)

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| H01 | Alle öffnen ohne Absturz | dmm/scope/funcgen/counter/bode/logic/logicconv/watt/iv/spectrum/pattern/distortion/network rendern + schließen | P0 | instruments/open-all |
| H02 | DMM misst Teiler-OUT | ≈ 2,5 V DC (Assistent-Default, nach Start) | P0 | instruments/dmm |
| H03 | Oszi als Bauteil platzieren | Geräte→Oszilloskop startet Platziermodus, Instanz „oscilloscope“ | P1 | instruments/scope-place |
| H04 | FuncGen als Bauteil | Platziermodus + Instanz „funcgen“ | P1 | instruments/funcgen |
| H05 | Frequenzzähler am 555 | ≈ erwartete Blinkfrequenz (± Toleranz) | P2 | instruments/counter |
| H06 | Bode-Plotter am Tiefpass | Kurve rendert, −3 dB-Punkt plausibel | P2 | instruments/bode |
| H07 | Logikanalysator am Zähler | Kanäle zeigen Zählfolge | P2 | instruments/logic |
| H08 | Wattmeter an Last | P ≈ 22,22 mW an R2 bei 10 V und 1 kΩ/2 kΩ | P2 | instruments/watt |
| H09 | IV-Analyzer (Diode) | Kennlinie rendert | P2 | instruments/iv |
| H10 | Spektrumanalysator | Linie bei Grundfrequenz | P2 | instruments/spectrum |
| H11 | Mustergenerator | Muster takten sichtbar | P2 | instruments/pattern |
| H12 | Distortion Analyzer | THD-Wert am OPV plausibel | P2 | instruments/thd |
| H13 | Network Analyzer | S11/S21-Kurven rendern | P2 | instruments/network |
| H14 | Logic Converter | Wahrheitstabelle aus Schaltung | P2 | instruments/logicconv |

## I — Analysen (alle 19)

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| I01 | Dialog öffnet je Analyse | Titel + Felder + Abbrechen/Start-Buttons vorhanden (alle 19) | P1 | analysis/dialogs |
| I02 | Validierung schlägt an | Leerer Ausgangsknoten → Fehlermeldung, kein Start | P0 | analysis/validation |
| I03 | OP (DC-Arbeitspunkt) | Teiler OUT = 2,5 V (Assistent-Default); Konsole meldet Abschluss | P0 | analysis/op |
| I04 | TRAN am Tiefpass | Ergebnisse-Tab zeigt Kurven (OUT e-Funktion), Punkte > 0 | P0 | analysis/tran |
| I05 | AC am Tiefpass | Bode-Kurve, −3 dB ≈ 1/(2πRC) | P0 | analysis/ac |
| I06 | DC-Sweep V1 0→12 V | OUT Gerade 0→8 V, linear | P1 | analysis/dc |
| I07 | Rauschen am OPV | Rauschdichte-Kurve vorhanden | P2 | analysis/noise |
| I08 | THD am 555/OPV | THD-% plausibel | P2 | analysis/thd |
| I09 | Monte-Carlo (klein) | 5 Runs, Histogramm/Statistik, Seed-Repro | P2 | analysis/montecarlo |
| I10 | Worst-Case | Min/Max-Hüllkurve | P2 | analysis/worstcase |
| I11 | Temperatur-Sweep | Kurven je Temperaturpunkt | P2 | analysis/temp |
| I12 | Parameter-Sweep R1 | Kennlinien-Schar, 5 Punkte | P2 | analysis/param |
| I13 | Fourier | Harmonische-Tabelle/Balken | P2 | analysis/fourier |
| I14 | Sensitivität | Tabelle dV/dP je Bauteil | P2 | analysis/sensitivity |
| I15 | Transferfunktion | Gain/Phase bei f | P2 | analysis/tf |
| I16 | Pol-Nullstellen | P/N-Diagramm am Tiefpass (1 Pol) | P2 | analysis/pz |
| I17 | S-Parameter | S11/S21 über f | P2 | analysis/sparams |
| I18 | Rauschzahl | NF-Kurve | P2 | analysis/nf |
| I19 | Geschachtelter Sweep | 3×3-Kennfeld rendert | P2 | analysis/nested |
| I20 | Gebündelt DC+AC+TRAN | Drei Ergebnis-Blöcke | P2 | analysis/batched |
| I21 | THD-Sweep | Klirr-vs-Pegel-Kurve | P2 | analysis/thdsweep |
| I22 | Abbrechen | Lange Analyse (MC 500) abbrechbar, UI lebt | P2 | analysis/cancel |

## J — Bottom-Panel (alle 6 Tabs)

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| J01 | Konsole zeigt Logs | Start/Fehler erscheinen mit Zeitstempel, Autoscroll | P0 | bottom/console |
| J02 | Ergebnisse nach TRAN | Grapher-Canvas + Kurvenlegende sichtbar | P0 | analysis/tran |
| J03 | SPICE-Netzliste | Enthält R1/R2/V1-Zeilen + `.op`-Äquivalent des Docs | P1 | bottom/netlist |
| J04 | Prüfung listet ERC | Fehler/Warnungen mit Zähler, Klick springt zum Objekt | P1 | bottom/erc-tab |
| J05 | Sonden-Tabelle | Spalten Name/Typ/Netz/Vdc/Vrms/Vpp/Vavg/Freq, Live-Update | P0 | probes/place |
| J06 | Stückliste (BOM) | Zeilen je Referenz mit Wert, Export? (falls vorhanden) | P1 | bottom/bom |
| J07 | Panel ein/aus + Tab-Wechsel | Toggle über Menü/Statusleiste, Auswahl bleibt | P1 | shell/panels |

## K — Inspector

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| K01 | Param ändern (R 1k→2k) | Zahleneingabe, Sim-Wert folgt (OUT 5 V statt 6,667 V) | P0 | inspector/param |
| K02 | Referenz ändern | R1→R9 umbenannt, Netzliste folgt | P1 | inspector/ref |
| K03 | Sonde editieren | Name/Typ/Netz änderbar, Tabelle folgt | P1 | probes/manage |
| K04 | Auswahl-Param (Modell) | Dropdown (z. B. Diodenmodell) setzt Wert | P2 | inspector/select |
| K05 | Checkbox-Param | Toggle übernimmt (z. B. Richtungsumkehr Sonde) | P2 | inspector/checkbox |
| K06 | Mehrfachauswahl | Inspector zeigt Zähler/gemeinsame Aktionen | P2 | inspector/multi |

## L — Projekte, Persistenz, Im-/Export

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| L01 | Auto-Save → Reload | Nach Reload identisches Doc (Instanzen/Drähte/Sonden) | P0 | projects/autosave |
| L02 | Neuer Schaltplan + Reload | Leerer Plan bleibt leer, kein Geister-Restore | P1 | projects/new-reload |
| L03 | Projekte-Dialog: Speichern | Slot anlegen, Liste zeigt Eintrag mit Datum | P1 | projects/slots |
| L04 | Slot laden/umbenennen/löschen | Roundtrip funktioniert, Toasts erscheinen | P1 | projects/slots |
| L05 | Export JSON (Download) | `.msx.json` enthält doc + customParts (falls Custom verbaut) | P0 | projects/export |
| L06 | Import `.msx.json` | Datei-Upload stellt Schaltung her | P0 | projects/import |
| L07 | Import SPICE (.cir) | Netzliste → Schaltung (R/C/V-Import aus Matrix sichtbar) | P1 | projects/import-spice |
| L08 | Import ungültig | Kaputte Datei → Toast + Log-Fehler, Doc unverändert | P0 | projects/import-bad |
| L09 | Export SPICE/SVG/PNG | Downloads entstehen, SVG enthält `<svg`, PNG > 0 Byte | P1 | projects/exports |
| L10 | Link teilen | URL mit Payload in Zwischenablage (Clipboard-Permission) | P2 | projects/share |
| L11 | Link öffnen | Payload-URL stellt Schaltung her | P2 | projects/share-open |
| L12 | Korrupter Storage | Backup-Generation greift, Warn-Toast „Sicherungskopie“ | P1 | projects/corrupt |
| L13 | Speichern-Status-Chip | Statusleiste zeigt „gespeichert/ungespeichert“ korrekt | P2 | projects/save-chip |
| L14 | Custom reist mit | Export enthält Spec; Reload ohne Bibliothek löst Teil per Einbettung auf (Name statt Roh-ID) | P0 | projects/custom-carry |

## M — Bauteile-Editor 2.0

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| M01 | Öffnen/schließen | Datei→Bauteile-Editor: Shell mit Tabs, Zurück ohne Speichern fragt bei dirty | P0 | parteditor/open |
| M02 | Schaltung bauen | R + 2 Ports setzen, verdrahten, Summary zählt | P0 | parteditor/build |
| M03 | Live-Testlauf | Start → „konvergiert“, Spannungsfarben an; Stop stellt zurück | P0 | parteditor/testrun |
| M04 | Meta + Speichern | Name/Kategorie setzen, Speichern registriert Teil (Bibliothek listet) | P0 | parteditor/save |
| M05 | Custom platzieren + simulieren | Teil aus Bibliothek in Teiler-Schaltung, Sim-Werte stimmen | P0 | parteditor/use |
| M06 | Pins-Reiter | Seite/Rolle/Marker setzen, Symbol folgt | P1 | parteditor/pins |
| M07 | Parameter-Reiter/Links | Link-Schalter exponiert Innen-Param, Inspector zeigt außen | P1 | parteditor/params |
| M08 | Symbol-Reiter | Primitive zeichnen, Vorschau + Platzierung nutzt Symbol | P2 | parteditor/symbol |
| M09 | Validierung | Offener Port/Doppelname → Fehlerliste, Speichern blockiert | P1 | parteditor/validate |
| M10 | Bestehendes bearbeiten | Inspector „Im Editor bearbeiten“, Änderung wirkt nach Re-Save | P1 | parteditor/reedit |
| M11 | Bibliotheks-Kontextmenü | Duplizieren/Umbenennen/Export .mspart/Löschen (Schutz bei Verwendung) | P1 | parteditor/manage |
| M12 | .mspart-Import | Datei-Upload registriert Teil; Duplikat → Konflikt-Dialog | P1 | parteditor/import |
| M13 | Konflikt-Dialog | Projekt/Import vs. Bibliothek: beide Entscheidungen wirken | P1 | parteditor/conflict |
| M14 | Guards im Editor | Keine Sim/Analysen/Sonden/Instrumente/Extrakt (Buttons fehlen/deaktiviert) | P1 | parteditor/guards |

## N — Extrakt (Auswahl → Bauteil)

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| N01 | Review-Dialog | Auswahl → Kontextmenü: Tabellen Übernahme/Ports/Innen + Warnungen | P0 | extract/review |
| N02 | Im Editor öffnen | Extrakt landet als Innenschaltung (1:1-Kopie) | P0 | extract/open |
| N03 | Speichern & Ersetzen | Instanz ersetzt Auswahl, ein Undo-Schritt, Sim startet sauber (Sim-Treue in Unit-Tests) | P0 | extract/replace |
| N04 | Undo nach Ersetzen | Original-Schaltung vollständig zurück | P0 | extract/replace |
| N05 | Insel-Extrakt | 0 Ports: ok + Warnung, Teil speicherbar | P2 | extract/island |
| N06 | Unzulässige Auswahl | Messgerät/Sonde drin → Dialog verweigert mit Grund | P1 | extract/deny |

## O — Schaltungs-Assistenten

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| O01 | Dialog + Liste | Alle 10 Assistenten gelistet, Formel sichtbar | P1 | wizards/list |
| O02 | Spannungsteiler erzeugen | Default-Params → „Erzeugen“ baut Doc (R1/R2/V1 + Labels) | P0 | wizards/divider |
| O03 | RC-Tiefpass erzeugen | Doc enthält R/C mit berechneten Werten | P1 | wizards/rc |
| O04 | NE555 erzeugen | Taktgeber-Doc, Sim startet | P2 | wizards/555 |
| O05 | Param ändern → Neuberechnung | Ergebniswerte folgen live | P2 | wizards/recalc |

## P — Einstellungen, Referenz, Hilfe

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| P01 | Einstellungen öffnen | Dialog mit allen Sektionen rendert | P1 | settings/open |
| P02 | Toggle persistiert | z. B. Raster aus → Reload → bleibt aus (localStorage) | P1 | settings/persist |
| P03 | Symbolstil ISO/ANSI | Umschalten ändert R-Symbol (Canvas) | P2 | settings/symbols |
| P04 | E-Reihe | E6/E12/E24 wirkt auf Param-Vorschläge | P2 | settings/eseries |
| P05 | Lehrer-Modus sperrt/entsperrt | Code setzen → Editieren blockiert (Toast), Entsperren hebt auf | P2 | settings/teacher |
| P06 | Referenz-Inhalt | Suche/Baum zeigt Bauteil-Doku | P2 | shell/reference |
| P07 | Drucken-Dialog | Datei→Drucken öffnet Druckansicht (Dialog/Preview) | P2 | shell/print |
| P08 | Über/Version | Versionshinweis vorhanden | P2 | shell/about |

## Q — Ansicht & Darstellung

| ID | Szenario | Erwartung | Prio | Spec |
|----|----------|-----------|------|------|
| Q01 | Zoom ±/Fit | Buttons + F: Zoom ändert, Fit rahmt Schaltung | P1 | shell/zoom |
| Q02 | Raster-Toggle | Canvas zeigt/verbirgt Punktraster | P2 | view/grid |
| Q03 | Lineale | Ein-/ausblendbar | P2 | view/rulers |
| Q04 | Blattrand/Schriftfeld | Rahmen mit Feldern sichtbar | P2 | view/frame |
| Q05 | Theme dunkel/hell | Umschalten ohne Reload, persistiert | P2 | view/theme |
| Q06 | Leitungsfarben manuell | Kontextmenü setzt Farbe, bleibt nach Reload | P2 | view/wirecolor |
| Q07 | Schriftgrößen/UI-Skala | Einstellung wirkt auf UI | P2 | view/uiscale |
| Q08 | Vollbild-Modus | Falls vorhanden: toggelt | P2 | — |
| Q09 | Statusleisten-Werte | Die ursprüngliche Erwartung ist unvollständig und muss neu festgelegt werden | P2 | — |

> Der Schluss der ursprünglichen Matrix enthielt bereits einen Trunkierungsmarker;
> fehlende Inhalte sind aus der vorhandenen Repository-Historie nicht rekonstruierbar.
