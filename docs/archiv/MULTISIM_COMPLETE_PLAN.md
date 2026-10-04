# Vollständige Multisim-Abdeckung + Maussteuerung

## Ziel
- Alle Multisim-Bauteilgruppen funktional abdecken (nicht 55k Einzelnummern, aber jede Funktion)
- Maussteuerung intuitiv wie Figma/Multisim/Notion: Links, Rechts, Mitte, Wheel, Drag&Drop, Marquee, Context-Menüs

## Multisim Gruppen (aus Docs)
1. **Sources**: Power (DC, AC, GND, VCC, VDD, VEE, Battery), Signal (Clock, Pulse, PWL, AM/FM, Noise, 3-Phase, etc), Controlled (VCVS, VCCS, CCVS, CCCS)
2. **Basic**: R, R-Pack, Pot, Var R, C, Var C, Electrolytic, Inductor, Var L, Transformer (ideal, tapped, center), Crystal, Fuse, Circuit Breaker, etc
3. **Diodes**: Standard (1N4001-1N4007, 1N4148, 1N5817-5822), Zener (3.3V-24V), Schottky, LED (red/green/blue/yellow/white/RGB), 7-seg LED, Bridge, Diac, Triac driver, TVS
4. **Transistors**: BJT NPN/PNP (2N2222, 2N3904/06, BC547-550, BC557-560, 2N3055, TIP31/32, Darlington TIP120/122/125/127), MOSFET N/P (2N7000, BS170, IRF540/9540, IRFZ44, BSS84/138), JFET (J201, 2N3819, BF245), IGBT, UJT
5. **Analog**: OpAmp (LM741, LM358, LM324, TL081/082/084, TL071/072/074, NE5532/34, OP07, OP27, LM339/393/311), Comparator, Timer (NE555, LMC555, 556, 7555), Regulator (7805/12/15/24, 7905/12/15, LM317/337, 78L05, TL431), VCO, PLL 4046, ADC/DAC (ADC0804, DAC0808)
6. **TTL 74xx**: 7400/01/02/03/04/05/08/10/11/20/21/27/28/30/32/86/266 etc + 74LS/74HC/74HCT/74AC Varianten als Familie-Parameter, plus komplexe: 7442/47/48 BCD decoder, 74138/139/154 decoder, 74147/148 encoder, 74151/153/157 mux, 74157, 74138, 74138, 74160-163 counters, 74164-166 shift, 74173/174/175/273/373/374 latches/FF, 74244/245 buffers, 74247 7-seg, etc
7. **CMOS 4000**: 4000/4001/4002/4011/4012/4023/4025/4069/4070/71/72/73/75/77/81/82/93 etc + 4013/4017/4020/4021/4022/4024/4026/4027/4028/4029/4040/4042/4043/4044/4046/4049/4050/4051/4052/4053/4060/4066/4076/4081/4093/4094/40106/40193/4511/4512/4514/4515/4520/4528/4538 etc
8. **Memory**: RAM, ROM, EPROM
9. **Mixed**: ADC/DAC, Analog Switch 4066/4016, MUX 4051/52/53
10. **Indicators**: Voltmeter, Ammeter, Wattmeter, Probe, Logic Probe, 7-seg (CA/CC), 14-seg, Bargraph, LCD 16x2, LED, Lamp, Buzzer, Motor, Relay, etc
11. **Power/Electromech**: Fuse, Breaker, Relay SPST/SPDT/DPDT/DPST, Switch SPST/SPDT/DPST/DPDT, Rotary, DIP, Pushbutton, Limit Switch
12. **RF/Connectors**: Antenna, Connector, etc
13. **MCU**: Arduino UNO/Mega, PIC16F84/16F877, 8051, AVR, ESP32, STM32 (als cosim Platzhalter)

## Strategie für vollständige Abdeckung
- Statt 55k Einzelnummern: Parametrische Familien + Varianten mit gleichem Modell aber unterschiedlichem Default-Param und Label
- Jede Multisim-Kategorie bekommt mindestens 3-5 repräsentative Teile
- Für Dioden/Zener: generischer Typ mit Vz-Parameter + viele Presets (3.3V, 5.1V, 12V etc)
- Für Transistoren: generischer BJT/MOSFET mit BF/VTO Params + Presets für gängige Typen
- Für OpAmps: generischer OPAMP mit Gain/GBW Params + Presets
- Für TTL/CMOS: generischer GATE/DIGITAL mit Modell-String + Presets
- Für ADC/DAC: einfache Verhaltensmodelle (DAC: Vout = digital*Vref/255, ADC: digital = Vin/Vref*255)
- Für Memory: einfaches Latch-Array
- Ziel: ~400-500 Parts, die alle Funktionen abdecken

## Maussteuerung – Soll-Zustand (Figma + Multisim)

### Canvas
- **Linksklick leer**: Clear Selection, starte Marquee (Rechteck)
- **Shift+Linksklick leer**: Marquee additiv
- **Linksklick Bauteil**: Selektiere (ersetzt), Shift addiert, Cmd/Ctrl toggelt
- **Linksdrag Bauteil**: Move Selection (GRID gesnapped), Ghost-Vorschau, bei Drop rebuild
- **Ctrl/Cmd+Drag Bauteil**: Duplizieren + Move (Duplikat sofort)
- **Alt+Drag Bauteil**: Duplizieren (Alternative)
- **Doppelklick Bauteil**: Inspector öffnen (rightOpen true) + Fokus
- **Rechtsklick Bauteil**: Context-Menü: Drehen (R), Spiegeln (M), Duplizieren (Ctrl+D), Löschen (Entf), Eigenschaften (Inspector), Probe hinzufügen (auf Pin-Netz)
- **Linksklick Leitung**: Selektiere Leitung
- **Linksdrag Leitung**: Move Leitung (wie Bauteil)
- **Doppelklick Leitung**: Net-Label editieren? Oder nichts
- **Rechtsklick Leitung**: Context-Menü: Probe hinzufügen (Voltage/Current/Power/Diff/Digital), Farbe ändern, Löschen, Eigenschaften
- **Linksklick Probe**: Selektiere Probe
- **Linksdrag Probe**: Move Probe
- **Rechtsklick Probe**: Context-Menü: Typ ändern, Name editieren, Farbe, Löschen
- **Doppelklick Probe**: Name editieren
- **Mittelklick Drag**: Pan (wie bisher) – Cursor grab
- **Mittelklick Click**: Nichts oder Fit View
- **Wheel**: Zoom zu Cursor (exp factor), 0.12-6x
- **Shift+Wheel**: Pan (horizontal/vertical)
- **Space+Drag**: Pan (Figma) – zusätzlich zu Mittelklick
- **Rechtsklick leer**: Context-Menü: Einfügen (wenn Clipboard), Probe hinzufügen (an Mauspos), Label/Notiz hinzufügen, Einpassen (F), Bibliothek öffnen (Cmd+K)
- **Marquee**: Während Drag, zeige Rechteck, bei Up selektiere alle Instances/Wires/Probes im Rechteck
- **Placing Mode (Bauteil)**: Ghost folgt Maus, Linksklick platziert, Rechtsklick/Esc bricht ab, Shift hält Modus
- **Wiring Mode**: Linksklick setzt Start, dann Preview (orthogonal), Linksklick setzt Punkt, Rechtsklick/Esc bricht ab, Doppelklick beendet
- **Probe Placing Mode**: Ghost Probe folgt Maus, Linksklick auf Leitung setzt Probe mit Netz-Erkennung, Rechtsklick/Esc bricht ab

### LibraryPalette
- Drag Header: Move
- Drag Ecke: Resize
- Scroll: Liste
- Linksklick Part: Set placing, bleibt offen
- Doppelklick Part: Platziert in Mitte + schließt nicht? Oder platziert und behält Fokus
- Rechtsklick Part: Favorit toggeln

### Inspector (Floating)
- Drag Header: Move (wenn wir Header hinzufügen)
- Close X: Schließt

### StatusBar
- Keine Maus-Spezial, nur Buttons

## Implementierungsplan
1. **Katalog erweitern**: Skript das alle fehlenden Gruppen generiert, mit toDevices die auf bestehende Engine-Typen mappen (R,C,L,D,Q,M,J,OPAMP,COMPARATOR,GATE,DIGITAL,MCU,V,I,etc). Für ADC/DAC neue Typen ADC/DAC in Engine hinzufügen (einfache Modelle)
2. **Engine erweitern**: DIGITAL Modelle ergänzen (counter10/12/14, mux8, decoder 4-16, etc), ADC/DAC Typen
3. **Canvas Maussteuerung**: Context-Menü Komponente, verbesserte onPointerDown/Move/Up mit Modifikatoren (Shift, Ctrl, Alt, Space), Duplizieren bei Ctrl+Drag, Space+Drag Pan, Rechtsklick Menüs für Instance/Wire/Probe/Empty
4. **LibraryPalette Maus**: Favorit per Rechtsklick
5. **Test**: Build + tsc, manuelle Checks (Mittelklick Pan, Rechtsklick Menüs, Drag&Drop, Marquee, Duplizieren)

## Akzeptanz
- Katalog hat >=300 Parts, jede Multisim-Hauptkategorie vertreten, alle funktional simulierbar (zumindest als idealisiertes Modell)
- Maus: Mittelklick Drag panniert, Rechtsklick zeigt kontextsensitives Menü (Bauteil/Leitung/Probe/Leer), Linksdrag verschiebt, Ctrl+Drag dupliziert, Marquee selektiert, Doppelklick öffnet Inspector, Placing/Wiring/Probing via Esc/RightClick abbrechbar, Space+Drag panniert
- Build grün
