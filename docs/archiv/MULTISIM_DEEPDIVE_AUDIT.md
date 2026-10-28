# Multisim Deep Dive Audit – Würde Steve Jobs diese Webapp veröffentlichen?

> Datum: 2026-09-24, zweite Iteration nach ContextMenu/ISO/ANSI/Wire Handles
> Frage: Was fehlt unabdingbar, das Multisim hat? Wirklich alles.

## Kurzantwort: Nein, noch nicht.

**Warum nicht?** Die App ist 85-90% wow für Analog-Grundlagen, aber für einen echten Multisim-Ersatz im Web fehlen 5 unabdingbare Säulen, die jeder Student/Lehrer in der ersten Stunde erwartet. Steve Jobs würde sagen: "Es fühlt sich noch nicht an wie Magie – es fühlt sich an wie ein Prototyp, der fast fertig ist."

---

## Multisim Feature Map – Komplett

### 1. Schematic Capture (Schaltplan zeichnen)

| Multisim Feature | Was es tut | Haben wir? | Wie gut? | Unabdingbar? |
|------------------|------------|------------|----------|--------------|
| **Grid, Snap, Zoom, Pan** | 10px Grid, Snap, Mausrad zoomt zum Cursor, Shift+Pan | ✅ | Gut, aber Zoom Buttons klein | ✅ Ja, haben wir |
| **Rubber banding** | Beim Verschieben bewegen sich Leitungen mit | 🔄 Teilweise – Wires bleiben, aber kein Gummiband | Mittel | 🔶 Wichtig für Gefühl |
| **Autowiring / Manual wiring** | Klick-Klick mit Manhattan, Auto-Route A* um Bauteile | ✅ | Gut, A* + Manhattan | ✅ |
| **Fast autoconnect passives** | Widerstand zwischen zwei Drähte platzieren → auto-verbindet | ❌ Fehlt | – | 🔶 Sehr wow, fehlt |
| **Junctions / Dots** | Automatischer Punkt wo 3+ Leitungen treffen | ✅ | Ja, haben wir | ✅ |
| **Wire color, thickness, net name** | Farbe, Dicke, Name pro Leitung | 🔄 Farbe ja, Dicke nein, Net Name via Label | Mittel | ✅ Farbe wichtig |
| **Buses** | Dicke Leitung für 8/16 Signale, sauberer Digital-Schaltplan | ❌ Fehlt komplett | – | 🔴 Unabdingbar für Digital |
| **On-page connector** | Virtuelle Verbindung ohne Draht (z.B. +V an mehreren Stellen) | ❌ Fehlt | – | 🔶 Wichtig für große Pläne |
| **Off-page connector** | Verbindung zwischen Blättern | ❌ Fehlt (kein Multi-Sheet) | – | 🔵 Später |
| **Hierarchical blocks / Subcircuits** | Eigene Schaltung als Block wiederverwenden | ❌ Fehlt | – | 🔴 Unabdingbar für größere Designs |
| **Symbol editor** | Eigenes Symbol zeichnen | ❌ Fehlt | – | 🔵 Power User |
| **Electrical Rules Check (ERC)** | Visuelle Fehlermarken + Zoom to error | 🔄 Console ja, visuell nein | Schlecht | 🔴 Unabdingbar für Anfänger |
| **Component rotation, mirror, copy, paste, duplicate, undo** | Alles mit Shortcuts | ✅ | Sehr gut, 50 History | ✅ |
| **Labels, Notes, Text** | Netzname, Notiz, Textbox | ✅ | Gut, inline Editor | ✅ |
| **Picture, Polygon, Arc** | Grafische Annotation | ❌ Fehlt | – | 🔵 Nice to have |

**Fazit Capture:** 70% – Buses, Hierarchical Blocks, ERC visuell, Fast autoconnect fehlen und sind unabdingbar für "fühlt sich wie Multisim an".

---

### 2. Component Library (Bauteile)

| Multisim | Haben wir? | Bewertung |
|----------|------------|-----------|
| **55.000 manufacturer-verified** (Analog Devices, TI, etc.) | ❌ 402 curated, handcrafted Icons | Für Web okay, aber zu wenig Digital ICs |
| **Kategorien**: Sources, Basic, Diodes, Transistors, Analog, TTL, CMOS, MCU, Power, Misc, etc. | ✅ 12 Kategorien, Tree | Gut, aber 74xx nur ~20, 4000 nur ~10, mehr nötig |
| **Virtual components** (beliebiger Wert) | ✅ Params beliebig | Ja |
| **Interactive** (Switch, Pot, Taster während Sim) | ✅ Switch, Pot, Relay | Gut |
| **Animated** (LED, 7-Seg, Lampe ändert Aussehen) | 🔄 LED ja (glow), 7-Seg nein, Lampe nein | Mittel – 7-Seg wichtig |
| **Rated** (blow up wenn Power/Strom zu hoch) | ❌ Fehlt | 🔴 Unabdingbar für Teaching – "warum raucht mein Widerstand?" |
| **3D components** (Foto statt Symbol) | ❌ Fehlt | 🔶 Nice für Anfänger |
| **Footprint, Datasheet, Model** | 🔄 Datasheet ja (80 curated + Octopart), Footprint nein, Model SPICE ja | Mittel |
| **Component Wizard, Model Maker** | ❌ Fehlt | 🔵 Power |
| **Search, Favorites, Recent, Grid/List, Detail 96px** | ✅ | Sehr gut, 60fps drag, keyboard nav |

**Fazit Library:** 65% – Für Web okay, aber 7-Seg, Rated blow-up, mehr Digital ICs, 3D Fotos fehlen für echtes Multisim-Feeling.

---

### 3. Wiring / Nets

| Feature | Haben wir? |
|---------|------------|
| **Polyline, Punkte, Handles** | ✅ Genial – 9px circle, 7px diamond, 6→10px plus, 44px hit, guides, tooltip Δ/len/angle |
| **Net highlight entire net** | ✅ accent-2 |
| **Pin hover highlight** | ✅ 10px circle + tooltip |
| **Auto-junction** | ✅ |
| **Wire color** | ✅ Palette |
| **Wire thickness** | ❌ Fehlt |
| **Net name propagation** | 🔄 Via Label, aber nicht automatisch bei Wire Farbe |
| **Bus** | ❌ Fehlt – unabdingbar |
| **On-page connector** | ❌ Fehlt |

**Fazit Wiring:** 80% – Sehr gut, aber Bus + Thickness + On-page fehlen.

---

### 4. Instruments (Simulation-driven)

| Multisim Instrument | Funktion | Haben wir? | Unabdingbar? |
|---------------------|----------|------------|--------------|
| **2-Channel Scope** | 2 Kanäle, Y/X scaling, Trigger, Cursor | ✅ 4-Channel ist Superset, aber 2-Channel fehlt explizit | ✅ |
| **4-Channel Scope** | 4 Kanäle | ✅ Skeuomorph CRT, 42-56px Knobs, Trigger Dreieck, Cursors ΔT/ΔV | ✅ |
| **Multimeter** | V, A, R, dB, 7-Seg Anzeige | ✅ | ✅ |
| **Function Generator** | Sine, Tri, Square, Duty, Ampl, Offset | ✅ XFG | ✅ |
| **Bode Plotter** | Gain/Phase vs Freq | ✅ | ✅ |
| **Wattmeter** | P, Q, S, PF | ✅ | ✅ |
| **IV Analyzer** | Diode, BJT, MOS Kennlinie | ✅ | ✅ |
| **Frequency Counter** | Freq, Period, Rise/Fall | ✅ | ✅ |
| **Logic Analyzer** | 16 Kanäle, Cursor, Trigger | ✅ | ✅ |
| **Logic Converter** | Truth table ↔ Boolean ↔ Circuit | ❌ **FEHLT – RIESEN LÜCKE** | 🔴 **UNABDINGBAR für Digital-Lehre** |
| **Word Generator** | 32 Kanäle Pattern | 🔄 Pattern Generator vorhanden, aber UI schwach | 🔶 |
| **Spectrum Analyzer** | Amplitude vs Freq, Span | ✅ | ✅ |
| **Network Analyzer** | S-Parameter, RF | ❌ Fehlt | 🔵 RF Nische |
| **Distortion Analyzer** | THD, SINAD | 🔄 THD Analyse ja, aber kein dediziertes Instrument | 🔶 |
| **Measurement Probe** | Dynamische Werte am Schaltplan | ✅ Leader Pfeil + Dot + permanentes Fenster | ✅ |
| **Current Probe** | Clamp-on | ✅ | ✅ |
| **Voltmeter, Ammeter** | Einfach V/A | 🔄 Via Multimeter, aber nicht als eigenes Symbol | 🔶 |
| **Agilent 34401A DMM, 54622D Scope, Tektronix Scope** | Echte Geräte nachgebildet | ❌ Fehlt | 🔵 Nice |
| **LabVIEW VIs** (Mic, Speaker, Signal Analyzer, etc.) | Custom Instruments | ❌ Fehlt | 🔵 |
| **NI ELVISmx** (DMM, Scope, FGen, Arb, DSA, Bode, Digital Reader/Writer, Power Supply) | Hardware Integration | ❌ Fehlt | 🔵 |

**Fazit Instruments:** 75% – Logic Converter fehlt und ist **unabdingbar** für jede Digital-Vorlesung. Ohne ihn kein "Multisim für Digital". Word Generator schwach, Distortion/Network fehlen aber weniger kritisch.

---

### 5. Analyses (SPICE)

| Multisim Analyse | Was es tut | Haben wir? | Unabdingbar? |
|------------------|------------|------------|--------------|
| **DC Operating Point** | Alle Knoten DC Lösung | ✅ direct | ✅ |
| **AC Sweep** | Bode über Freq | ✅ fmin-fmax, points/dec | ✅ |
| **AC Single Frequency** | Ein Punkt AC | ❌ Fehlt | 🔵 |
| **DC Sweep** | Sweep Quelle | ✅ source, start, stop, points | ✅ |
| **Transient** | Zeitverlauf | ✅ stop, step, outputs | ✅ |
| **Fourier / THD** | Oberwellen, Klirr | 🔄 THD ja, aber kein reines Fourier Spektrum | 🔶 |
| **Noise** | Ausgangsrauschen vs Freq | ✅ | ✅ |
| **Noise Figure** | Rauschzahl | ❌ Fehlt | 🔵 |
| **Distortion** | Klirr vs Freq | ❌ Fehlt (nur THD) | 🔶 |
| **Parameter Sweep** | Sweep Bauteilwert (z.B. R 1k-10k) | ❌ **FEHLT – RIESEN LÜCKE** | 🔴 **Unabdingbar – "Was wenn R größer?"** |
| **Temperature Sweep** | Sweep Temp | ✅ -40..125 | ✅ |
| **Monte Carlo** | Toleranzen statistisch | ✅ runs, tolerance | ✅ |
| **Worst Case** | Ungünstigste Toleranzkombi | ✅ | ✅ |
| **Sensitivity (DC/AC)** | Welche Bauteile beeinflussen Ausgang am meisten? | ❌ Fehlt | 🔴 Unabdingbar für Design |
| **Pole-Zero** | Pole/Nullstellen | ❌ Fehlt | 🔵 |
| **Transfer Function** | Übertragungsfunktion | ❌ Fehlt | 🔶 |
| **Batched** | Mehrere Analysen nacheinander | ❌ Fehlt | 🔵 |
| **Nested Sweep** | Sweep in Sweep | ❌ Fehlt | 🔵 |
| **Trace Width** | Leiterbahnbreite | ❌ Fehlt | 🔵 |
| **User Defined** | Eigene Analyse | ❌ Fehlt | 🔵 |

**Fazit Analyses:** 50% – Die 3 wichtigsten fehlen: **Parameter Sweep, Sensitivity, Transfer Function**. Ohne Parameter Sweep kein "Was wenn?" – das ist 50% des Lernens.

---

### 6. Probes / Live Measurement

| Multisim | Haben wir? |
|----------|------------|
| **Measurement Probe** (dynamische Werte am Schaltplan) | ✅ Leader Pfeil 32px Offset, permanentes Fenster, Tabelle, Alt+Hover |
| **Inline dynamic values** (kleine Labels direkt auf Leitung: "5.0V", "10mA" die live updaten) | ❌ **FEHLT – RIESEN LÜCKE** – Multisim zeigt V/I direkt auf Draht |
| **Current Probe** (clamp) | ✅ |
| **Voltage Probe** (Indicators Gruppe) | ✅ |
| **Ref Probe** | ✅ |
| **Differential Probe** | ✅ |
| **Power Probe** | ✅ |
| **Digital Probe** | ✅ |
| **Probe Farben** (V gelb, A blau, W violett, etc.) | ✅ #fbbf24/#22d3ee/#a78bfa etc. |

**Fazit Probes:** 70% – Inline live Werte direkt auf Leitung fehlen, das ist das "Magie"-Gefühl von Multisim: Man sieht sofort wo 5V ist, ohne Probe setzen zu müssen.

---

### 7. Interactive, Animated, Rated, 3D

| Typ | Beispiel | Haben wir? | Unabdingbar? |
|-----|----------|------------|--------------|
| **Interactive** | Switch klick, Pot +5% / Shift -5%, Taster gedrückt, Relay klickt | ✅ | ✅ |
| **Animated** | LED leuchtet, 7-Seg zählt, Lampe glüht, Motor dreht | 🔄 LED ja, 7-Seg nein, Lampe nein, Motor nein | 🔴 7-Seg + Lampe unabdingbar für Anfänger |
| **Rated** | Widerstand raucht wenn P>0.25W, Diode blow up wenn I> | ❌ Fehlt | 🔴 Unabdingbar für Teaching – "Warum raucht es?" |
| **Virtual** | Beliebiger Wert, auch unrealistisch | ✅ | ✅ |
| **3D** | Foto statt Symbol (Batterie sieht aus wie Batterie) | ❌ Fehlt | 🔶 Sehr hilfreich für Anfänger |
| **Fault** | Insert open/short/leakage | ❌ Fehlt | 🔴 Unabdingbar für Troubleshooting Lehre |

**Fazit:** 40% – Rated + Fault + 7-Seg fehlen, das sind die "Aha!" Momente.

---

### 8. Grapher / Postprocessor

| Multisim Grapher | Haben wir? |
|------------------|------------|
| **Waveforms** (Transient, AC, DC, etc.) | ✅ Grapher mit Bode 2 Panels, Transient, DC Sweep, Noise log/log, IV, Temp, THD Spektrum |
| **Cursors** (ΔT, ΔV, 1/ΔT) | 🔄 Im Oszi ja (lila dashed), im Grapher nein |
| **Measurements** (Vpp, Vrms, Freq, etc.) | 🔄 Im Oszi ja, im Grapher teilweise |
| **Multiple traces** | ✅ 4 Kanäle farbig |
| **Math** (A+B, A-B, A*B, etc.) | 🔄 MATH A±B gestrichelt lila im Oszi, aber nicht im Grapher |
| **Postprocessor** (arith, trig, exp, log, vector, logical) | ❌ Fehlt – nur einfache |
| **Annotations, Labels** | ❌ Fehlt |
| **Export PNG/CSV** | ✅ PNG via canvas.toBlob, CSV via ProbeTable |
| **Print** | ✅ window.print |

**Fazit Grapher:** 60% – Cursors + Measurements im Grapher fehlen, Postprocessor Math schwach.

---

### 9. Teaching Features

| Feature | Haben wir? |
|---------|------------|
| **Circuit Wizards** (555 Timer, Filter, OpAmp, etc.) | ❌ Fehlt – nur Vorlagen |
| **Description box synced with simulation** | ❌ Fehlt – nur Logs |
| **Electrical Rules Check visual** | ❌ Fehlt – nur Console |
| **Zoom to error** | ❌ Fehlt |
| **Hide values, Hide faults, Lock subcircuits** (für Lehrer) | ❌ Fehlt |
| **3D Breadboarding** | ❌ Fehlt |
| **NI ELVIS, myDAQ Integration** | ❌ Fehlt (nicht nötig für Web) |
| **Ladder diagrams** | ❌ Fehlt |

**Fazit Teaching:** 30% – Wizards + ERC visuell + Description box fehlen, das sind die Features die Lehrer lieben.

---

### 10. UI/UX – Library, Context Menu, Responsive, etc.

| Feature | Haben wir? | Bewertung |
|---------|------------|-----------|
| **Library** schnell findbar, 402 Teile, Suche, Kategorien, Detail 96px, Datasheet, Favorites, Recent, Grid/List, Icons handcrafted, 60fps drag, keyboard nav | ✅ | Sehr gut, aber 402 vs 55k |
| **Context Menu** wie Multisim, Icons, Shortcuts, disabled Grund, Wire Farbe/Dicke, Junction, Eigenschaften, Probe setzen | ✅ | Sehr gut, 280px, clamped, backdrop-blur |
| **Wire Handles** genial, immer sichtbar wenn selektiert, midpoint insert, hover feedback, snap, tooltip, 44px hit, undo | ✅ | Sehr gut |
| **ISO/ANSI** Toggle, Auto per Browserlocale | ✅ | Sehr gut |
| **Responsive** Tablet/Handy, 44px Touch, BottomSheet, Drawer | ✅ | Sehr gut |
| **Instruments** skeuomorph Oszi CRT, Knobs conic-gradient, tactile Buttons | ✅ | Sehr gut |
| **Settings** 5 Tabs, erklärt jede Option, localStorage | ✅ | Sehr gut |
| **Undo Toast** Rückgängig statt Dialog | ✅ | Sehr gut |
| **Alignment Guides** Figma-like | ✅ | Sehr gut |
| **Empty State** Onboarding | ✅ | Sehr gut |
| **Shortcuts Overlay** ? | ✅ | Sehr gut |

**Fazit UI/UX:** 90% – Sehr stark, fast Steve Jobs Level.

---

## Was ist UNABDINGBAR und fehlt noch? (Top 10)

1. **Logic Converter** – Ohne ihn kein Digital-Unterricht. Truth table ↔ Boolean ↔ Circuit ist DAS Feature von Multisim für Digital. **Status: ❌ Fehlt komplett – muss als Instrument gebaut werden.**

2. **Parameter Sweep** – "Was passiert wenn R von 1k auf 10k geht?" – 50% des Lernens. **Status: ❌ Fehlt – muss als Analyse gebaut werden.**

3. **Inline Live Values** – Kleine Labels direkt auf Leitung: "5.0V" "10mA" die live updaten, ohne Probe setzen. Das ist die Magie: Man sieht sofort wo Strom fließt. **Status: ❌ Fehlt – muss als Toggle "Live Werte auf Schaltplan" gebaut werden.**

4. **ERC visuell + Zoom to error** – Rote Marker direkt am Bauteil wo Fehler, Klick zoomt hin. Anfänger verstehen Console nicht. **Status: ❌ Fehlt – nur Console, kein visuell.**

5. **Buses** – Dicke Leitung für 8/16 Signale, sauberer Digital-Schaltplan. Ohne Bus sieht jeder Digital-Schaltplan chaotisch aus. **Status: ❌ Fehlt komplett.**

6. **Rated Components + Fault Insertion** – Widerstand raucht wenn P>0.25W, Diode blow up, Fault open/short einfügen via Rechtsklick. Das sind die "Aha! Warum raucht es?" Momente. **Status: ❌ Fehlt komplett.**

7. **7-Seg + Lampe + Motor animated** – LED haben wir, aber 7-Seg die zählt, Lampe die glüht, Motor der dreht fehlen. Für Anfänger unabdingbar. **Status: ❌ Fehlt.**

8. **Sensitivity + Transfer Function + Fourier** – Welche Bauteile beeinflussen Ausgang am meisten? Übertragungsfunktion? Fourier Spektrum? Das sind Standard-Analysen in jeder Vorlesung. **Status: ❌ Fehlt.**

9. **Hierarchical Blocks / Subcircuits** – Eigene Schaltung als Block wiederverwenden. Ohne das keine größeren Designs. **Status: ❌ Fehlt komplett.**

10. **Circuit Wizards** – 555 Timer Wizard, Filter Wizard, OpAmp Wizard – für Anfänger die nicht wissen wie man astabilen Multivibrator baut. **Status: ❌ Fehlt – nur Vorlagen.**

---

## Was ist NICE TO HAVE aber nicht unabdingbar?

- Network Analyzer, Agilent/Tektronix simulated instruments, LabVIEW VIs, NI ELVISmx, VHDL, MCU co-sim, 3D components, 3D breadboarding, Ladder diagrams, Symbol editor, Model maker, User Defined Analysis, Batched, Nested Sweep, Trace Width, etc. – Alles cool, aber nicht für MVP.

---

## Würde Steve Jobs veröffentlichen?

**Heute: Nein.**

Er würde sagen:
> "Ihr habt 90% der UI perfekt – Library, Context Menu, Wire Handles, Oszi – das ist magisch. Aber ihr habt die 10% vergessen, die den Unterschied machen zwischen 'cooles Demo' und 'ich kann damit meine Vorlesung halten'.
> 
> Wo ist der Logic Converter? Jeder Digital-Professor braucht ihn in der ersten Stunde.
> Wo ist Parameter Sweep? Jeder Student fragt 'Was wenn R größer ist?'
> Wo sind die live Werte direkt auf dem Draht? In Multisim sehe ich sofort 5V, ohne Probe setzen zu müssen – das ist Magie.
> Wo sind die roten Fehlermarker? Anfänger lesen keine Console.
> Wo sind Buses? Ohne Buses sieht jeder Digital-Schaltplan aus wie Spaghetti.
> 
> Ihr habt die Details geliebt – 44px Hit Area, 9px Circle, glow, tooltip Δ/len/angle – das ist großartig. Aber ihr habt die großen Lücken vergessen.
> 
> **Macht die 5 unabdingbaren Dinge, dann könnt ihr veröffentlichen:**
> 1. Logic Converter
> 2. Parameter Sweep
> 3. Inline Live Values
> 4. ERC visuell
> 5. Buses (basic)
> 
> Der Rest – Rated, Fault, 7-Seg, Sensitivity – kommt danach."

---

## Plan für nächste Iteration (um publish-ready zu werden)

### Phase 1 – Unabdingbar (2-3 Tage)

- [ ] **Logic Converter Instrument**: UI mit 3 Tabs: Truth Table (Eingänge 2-8, Ausgänge 1-4), Boolean Expression (SOP/POS), Circuit (generiert aus AND/OR/NOT). Kann Truth Table → Boolean (Quine-McCluskey) → Circuit. Und umgekehrt Circuit → Truth Table (via Simulation).
- [ ] **Parameter Sweep Analyse**: Dialog: Bauteil wählen (R, C, L, etc.), Parameter wählen, Start/Stop/Points, Outputs. Runner: Für jeden Wert DC/AC/Tran rechnen, Grapher zeigt multiple Kurven farbig.
- [ ] **Inline Live Values**: Toggle in Settings + Toolbar "Live Werte". Wenn an und Simulation läuft: Auf jeder Leitung kleines Label "5.0V" (Mitte der Leitung), auf jedem Bauteil "10mA" (neben Bauteil). Nutzt engine.lastState.nets/currents. Konstante Screen-Größe, 10px, mono, farbcodiert (blau positiv, rot negativ wie Multisim).
- [ ] **ERC visuell**: In Canvas: Für jeden Fehler in netResult.errors/warnings roter/gelber Marker direkt am Bauteil/Netz. Klick zoomt hin. Tooltip zeigt Fehler. Liste in BottomPanel hat "Zoom to error" Button.
- [ ] **Buses basic**: Wire Typ "bus" – dicker (3px), gestrichelt oder farbig, kann mehrere Netze tragen? Einfach: Bus ist visuell dicker + hat Name "BUS[0..7]" + beim Ziehen werden mehrere parallele Leitungen gezeichnet. Für MVP: Bus ist nur visuell dicker + Label.

### Phase 2 – Wichtig (1-2 Tage)

- [ ] **Rated + Fault**: Context Menu Bauteil → Faults: Open, Short, Leakage. Rated: Wenn P > max (z.B. R 0.25W) dann Rauch-Animation + roter Rand + Tooltip "Überlastet! P=0.5W > 0.25W". 
- [ ] **7-Seg + Lampe animated**: 7-Seg Display Bauteil: 7 Segmente die leuchten je nach Eingang (BCD). Lampe: Glüht wenn Strom fließt, Helligkeit proportional zu I.
- [ ] **Sensitivity + Transfer Function + Fourier**: Als Analysen hinzufügen, ähnlich wie AC/DC.
- [ ] **Hierarchical Blocks basic**: Bauteil Typ "Subcircuit" – kann andere Schaltung enthalten, Pins definieren, als Block platzieren.

### Phase 3 – Polish (1 Tag)

- [ ] **Circuit Wizards**: Dialoge für 555 Astabil, 555 Monostabil, RC Tiefpass, RC Hochpass, OpAmp Inverter, etc. – User gibt Werte ein, Wizard generiert Schaltung.
- [ ] **Grapher Cursors**: Im Grapher Cursors wie im Oszi: ΔT, ΔV, 1/ΔT.
- [ ] **Fast autoconnect**: Wenn Bauteil zwischen zwei Drähte platziert, auto-verbinden.

---

## Fazit

- **Heute**: 85% UI perfekt, 50% Analyses, 75% Instruments, 70% Teaching – nicht publish-ready für Lehrer.
- **Nach Phase 1**: 95% publish-ready – Logic Converter + Parameter Sweep + Inline Live Values + ERC visuell + Buses machen den Unterschied zwischen Demo und "ich kann damit unterrichten".
- **Nach Phase 2**: 98% – Rated, Fault, 7-Seg, mehr Analysen.
- **Nach Phase 3**: 99% – Wizards, Grapher Cursors, Fast autoconnect.

Steve Jobs würde heute sagen: "Noch nicht. Aber ihr seid nah dran. Macht die 5 Dinge, dann ist es magisch."

