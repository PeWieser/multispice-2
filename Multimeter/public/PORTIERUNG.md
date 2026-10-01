# Voltwerk VM-114: Portierung fuer einen AI-Agent

## Ziel und Grenzen

Die bedienbare 2D-Oberflaeche an einen Schaltungssimulator anbinden, ohne
Darstellung, Messlogik und Solver zu vermischen. Die aktuelle Anwendung ist
eine funktionierende, deterministische Demo mit idealisierten Testschaltungen,
kein SPICE-Solver und keine Verbindung zu realer Hardware.

Die reduzierte Front folgt der Bildvorlage: COM und +, Auto-V/LoZ, OFF, V AC,
V DC, mV AC/DC, Widerstand und Durchgang. Es gibt bewusst keine Strombuchsen,
Strom-, Dioden-, Kapazitaets-, Frequenz- oder Temperaturmessung.

## Relevante Dateien

- `src/App.tsx`: Geraetezustand, HOLD, MIN/MAX/AVG, CSV, Host-Anbindung und Geraeuschausloeser.
- `src/lib/multimeter.ts`: Typen, Schutzpruefungen, SI-Messwerte und Bereichsformatierung.
- `src/lib/sound.ts`: prozedurale Geraeusche, Lautstaerke und Piepser.
- `src/components/Multimeter.tsx`: 2D-SVG, Drehschalter, LCD, Tasten und Buchsen.
- `src/components/Leads.tsx`: Kabel, Bananenstecker und Messspitzen.
- `src/components/TestCircuit.tsx`: austauschbarer Demo-Messaufbau.
- `src/index.css`: Materialdarstellung, Fokus, Responsive Layout und reduzierte Bewegung.

## Vorgehen

1. Implementiere `MeasurementAdapter` aus `src/lib/multimeter.ts` fuer den Host.
2. Uebergib die Instanz als `adapter`-Prop an `App` in `src/main.tsx`.
3. Ersetze die Demo-Testschaltung durch Host-Testpunkte. `NodeId` ist eine Zeichenkette;
   verwende echte Netz-/Knoten-IDs statt der Demo-IDs `positive` und `negative`.
4. Verbinde die Host-Auswahl mit `connections.redNode` und `connections.blackNode`.
   Behalte den Buchsenzustand unabhaengig von den Testpunkten.
5. Passe `probePose()` und die Drop-Ziele in `finishDrag()` in `Leads.tsx` an
   die Host-Knotenpositionen an, ebenso `nodePan()` in `App.tsx` fuer die
   Stereoposition. Die Stecker verwenden `METER_POSITION`, `SOCKET_X` und
   `SOCKET_Y` aus `Multimeter.tsx`. Alle Koordinaten muessen im selben
   SVG-2D-Koordinatensystem liegen.

```tsx
// Beispielstruktur; bridge ist die zu implementierende Host-Schnittstelle.
const adapter: MeasurementAdapter = {
  id: 'host-simulator',
  configure: (request) => bridge.configureInstrument(request),
  sample: (request) => bridge.readLatestMatchingSample(request),
  subscribe: (onChange) => bridge.subscribe(onChange),
};

createRoot(document.getElementById('root')!).render(<App adapter={adapter} />);
```

## Vertrag des Adapters

- `configure(request)` ist optional. Es meldet Messlast und Testpunkte nach
  Zustandsaenderungen an den Host.
- `sample(request)` ist synchron und ohne Seiteneffekte: letzten passenden Solverwert
  zurueckgeben. Netzwerk-/Solverarbeit gehoert in `configure` oder die Bridge, nicht ins React-Rendering.
- `subscribe(callback)` meldet neue Daten und gibt eine Unsubscribe-Funktion zurueck.
  Die Oberflaeche verarbeitet Host-Aenderungen hoechstens alle 500 ms.
- `MeasurementSample.value` verwendet V oder Ohm ohne SI-Praefixe. Rueckgabe-Einheit
  muss zum Modus passen. `null` ist kein gueltiger Nullmesswert.
- `voltageKind` ist `AC` oder `DC`; in Auto-V muss der Host die erkannte Art melden.
- `status` ist `ok`, `off`, `open` oder `live`; `message` beschreibt die Ursache.
- Keine alten Messdaten nach Modus-/Knotenwechsel verwenden. Bis ein passender
  Snapshot vorliegt: `value: null`, `status: 'open'`, erklaerende Nachricht.

## Elektrische Regeln

- DC-Spannung: rot minus schwarz. V AC ist AC-gekoppelter True RMS.
- Auto-V/LoZ erkennt AC oder DC und verwendet 3 kOhm; sonst 10 MOhm
  (`request.inputImpedance`). Der Auto-V-Bereich ist fest 600 V.
- mV misst ohne Sekundaerfunktion AC+DC-RMS; `secondary: true` waehlt DC.
- Ohm und Durchgang nur spannungsfrei. Messstrom im Host modellieren.
- Den Durchgang leitet die UI aus dem Widerstand ab, mit der Hysterese des
  Originals: Piepser ein unter 20 Ohm, aus erst ueber 250 Ohm. Der Host liefert nur Ohm.
- RANGE ist in HOLD und MIN MAX AVG gesperrt; die Taste quittiert mit Doppelton.
- Werte erst in `formatReading()` skalieren/runden. HOLD bleibt eine UI-Funktion.
  MIN/MAX/AVG basiert auf empfangenen Samples; HOLD pausiert die Aufzeichnung.
  Fuer Spitzen zwischen UI-Samples werden Host-Extrema benoetigt.

## Darstellung erhalten

- Der Schattenfilter sitzt ausserhalb der rotierenden Geometrie. Niemals
  `knobShadow` oder `gripShadow` in die drehende `dial-rotor`-Gruppe verschieben.
- Die Griffkontur dreht sich als Clip-Pfad. Materialverlauf und Glanz bleiben
  im Geraetekoordinatensystem. Auch die Messspitzenschatten liegen vor der Rotation.
- LCD-Ziffern sind feste SVG-Segmente mit dunkler, nicht leuchtender Darstellung.
  Keine Ziffern-, Glas-, Leucht- oder Blinkanimationen ergaenzen.

## Geraeusche

- `src/lib/sound.ts` erzeugt alle Geraeusche synthetisch mit der Web Audio API,
  ohne Audiodateien: Rastung und Endanschlag des Drehschalters, Gummitasten
  (Druck und Loslassen getrennt), Piezo-Piepser, Bananenstecker, Messspitzen,
  Kabel, Kippschalter mit Relais, Schiebeschalter, Platine und Einstellknopf.
  Jede Ausloesung variiert leicht und ist im Stereobild verortet.
- `App.tsx` leitet mechanische Geraeusche aus Zustandsaenderungen ab
  (`mode`, `connections`, `circuit`). So klingen Maus, Tastatur, Dialoge,
  Zuruecksetzen und Host-Updates gleich. Tastendruck und Loslassen kommen
  direkt aus `DeviceButton`, Kabelgeraeusche aus `Leads.tsx`.
- Piepser wie beim Original: ein Ton bei gueltiger Taste, zwei bei ungueltiger,
  ein Ton bei neuem MIN/MAX-Wert, Dauerton bei Durchgang. Bei ausgeschaltetem
  Geraet klicken die Tasten nur mechanisch.
- Audio startet erst nach der ersten Nutzergeste und nie ohne Bedienaktion.
  Im Hintergrund-Tab und bei Stummschaltung wird der Audiokontext angehalten.
- Stummschalter oben rechts, Lautstaerke und separaten Piepser-Schalter
  erhalten (WCAG 1.4.2). Die Einstellungen liegen in `localStorage`.
- Ohne Web Audio im Host die oeffentlichen Methoden von `sound` auf dessen
  Audio-API abbilden; Ausloeser, Hysterese und Stereoposition beibehalten.

## Speziell NI Multisim

React/HTML laesst sich nicht als fertiges natives Multisim-Instrument importieren.
NI beschreibt eigene Instrumente ueber LabVIEW. Fuer echtes Multisim die installierte
Version und deren LabVIEW-Instrument-Schnittstelle pruefen; danach eine passende
Bridge oder eine native LabVIEW-Oberflaeche implementieren. Ein WebView-/WebSocket-
Transport ist eine moegliche eigene Architektur, keine hier zugesicherte NI-API.

NI-Referenz: https://www.ni.com/docs/en-US/bundle/multisim/page/topics/instruments.html

## Abnahme

- 12 V DC, vertauschte Spitzen -12 V; 230 V AC; 1 kOhm; Durchgang 0,4 Ohm.
- Auto-V/LoZ: 12-V-Quelle mit 3-kOhm-Innenwiderstand ergibt 6 V.
- 0,2 V ergibt 200,0 mV; offene Leitung OL; spannungsfuehrender Widerstand Err.
- HOLD, MIN/MAX/AVG, AUTO/manueller Bereich, Beleuchtung und CSV pruefen.
- Schattenrichtung bei allen sieben Schalterstellungen vergleichen.
- Geraeusche: eine Rastung je Schalterstellung, Endanschlag, Taste beim Druecken
  und Loslassen, Doppelton bei RANGE in HOLD, Stecker rein/raus, Messspitze auf
  Testpunkt. Durchgang 10 Ohm, dann 100 Ohm: Ton bleibt; ueber 250 Ohm: aus.
- Tastatur, Fokus, Zoom, Screenreader und reduzierte Bewegung erhalten.
  Keine blinkende Anzeige, keine Stroboskope.
- Screenreader-Ausgabe maximal einmal pro Sekunde; Systemeinstellung fuer
  reduzierte Bewegung beachten. Native Ersatzbedienung bleibt im aufklappbaren Menue.
- `npm run build` muss erfolgreich sein. Host-Integration separat im Zielsystem testen.
