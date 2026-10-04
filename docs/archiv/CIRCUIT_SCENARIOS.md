# Circuit Scenarios – Alle möglichen Schaltungen, die einwandfrei laufen müssen

> Wie Multisim: Jede Schaltung muss per OP + TRAN + AC + DC Sweep + Param Sweep funktionieren.
> Liste als Beispiel erweitert – wirklich alles, nicht nur Flipflop/Integrierer/OpAmp Inverter.

## Legende
- ✅ PASS – OP ok, TRAN ok, AC ok wenn anwendbar, Grapher zeigt Kurven
- ❌ FAIL – Konvergiert nicht, Fehler, keine Kurve
- 🔄 PARTIAL – Geht aber nicht perfekt

## 1. Grundlagen – Passive

| # | Schaltung | Bauteile | Test | Status |
|---|-----------|----------|------|--------|
| 1.1 | Spannungsteiler | R1,R2,VDC,GND | OP Vout=2.5V, DC Sweep V1 0-5V linear, Param Sweep R1 1k-10k | ✅ |
| 1.2 | RC Tiefpass | R,C,VAC,GND | AC fmin 10 fmax 1Meg, Tran 0.02s, Param Sweep R | ✅ |
| 1.3 | RC Hochpass | R,C,VAC,GND | AC, Tran | ✅ |
| 1.4 | RL Tiefpass | R,L,VAC,GND | AC, Tran | ✅ |
| 1.5 | RLC Serie | R,L,C,VAC,GND | AC Resonanz, Tran | ✅ |
| 1.6 | RLC Parallel | R,L,C,VAC,GND | AC | ✅ |
| 1.7 | Diode Gleichrichter | D,VAC,R,GND | Tran, IV | ✅ |
| 1.8 | Brückengleichrichter | 4x D,VAC,R,C,GND | Tran | ✅ |
| 1.9 | LED Vorwiderstand | LED,R,VDC,GND | OP, rated blow-up wenn R zu klein | ✅ |
| 1.10 | Spannungsteiler mit Poti | Pot,R,VDC,GND | Interactive Pot +5%/-5%, Tran | ✅ |

## 2. OpAmp – Analog

| # | Schaltung | Bauteile | Test | Status |
|---|-----------|----------|------|--------|
| 2.1 | OpAmp Inverter | LM741,R1,R2,VDC,GND,VAC | OP, AC Gain=-Rf/Rin, Tran, Sensitivity | ✅ |
| 2.2 | OpAmp Non-Inverter | LM741,R1,R2,VDC,GND,VAC | AC Gain=1+Rf/Rin, Tran | ✅ |
| 2.3 | Voltage Follower | LM741,GND,VAC | OP, Tran | ✅ |
| 2.4 | Summing Amp | LM741,R1,R2,R3,Rf,VDC,GND | OP, Tran | ✅ |
| 2.5 | Difference Amp | LM741,R1,R2,R3,R4,VAC,GND | OP, AC | ✅ |
| 2.6 | Integrator | LM741,R,C,VAC,GND,VPULSE | Tran (Sägezahn), AC | ✅ |
| 2.7 | Differentiator | LM741,R,C,VAC,GND | Tran, AC | ✅ |
| 2.8 | Comparator | LM393,R,VDC,VAC,GND | Tran, DC Sweep | ✅ |
| 2.9 | Schmitt Trigger | LM393,R1,R2,VAC,GND | Tran Hysterese, DC Sweep | ✅ |
| 2.10 | Instrumentation Amp | 3x LM741,R,VAC,GND | OP, AC | ✅ |
| 2.11 | Wien Bridge Oscillator | LM741,R,C,GND | Tran schwingt, Fourier THD | ✅ |
| 2.12 | Active Lowpass Sallen-Key | LM741,R,C,VAC,GND | AC, Tran | ✅ |
| 2.13 | Active Highpass Sallen-Key | LM741,R,C,VAC,GND | AC | ✅ |
| 2.14 | Bandpass | LM741,R,C,VAC,GND | AC | ✅ |
| 2.15 | Current Source OpAmp | LM741,R,Transistor,VDC,GND | OP, DC Sweep | ✅ |

## 3. Transistor – BJT, MOSFET, JFET

| # | Schaltung | Bauteile | Test | Status |
|---|-----------|----------|------|--------|
| 3.1 | BJT Common Emitter | NPN,R1,R2,Rc,Re,C,VDC,GND,VAC | OP, AC Gain, Tran, Sensitivity | ✅ |
| 3.2 | BJT Common Collector (Emitter Follower) | NPN,R,VDC,GND,VAC | OP, Tran | ✅ |
| 3.3 | BJT Common Base | NPN,R,VDC,GND,VAC | OP, AC | ✅ |
| 3.4 | BJT Differential Pair | 2x NPN,R,VDC,GND,VAC | OP, AC | ✅ |
| 3.5 | BJT Current Mirror | 2x NPN,R,VDC,GND | OP, DC Sweep | ✅ |
| 3.6 | BJT Darlington | 2x NPN,R,VDC,GND | OP, Tran | ✅ |
| 3.7 | MOSFET Common Source | NMOS,R,VDC,GND,VAC | OP, AC, Tran | ✅ |
| 3.8 | MOSFET Common Drain | NMOS,R,VDC,GND | OP | ✅ |
| 3.9 | MOSFET Current Mirror | 2x NMOS,R,VDC,GND | OP | ✅ |
| 3.10 | CMOS Inverter | PMOS,NMOS,VDC,GND,VPULSE | Tran, DC Sweep | ✅ |
| 3.11 | JFET Common Source | JFET,R,VDC,GND,VAC | OP, AC | ✅ |
| 3.12 | BJT Switch | NPN,R,LED,VDC,GND,VPULSE | Tran LED an/aus, rated | ✅ |

## 4. 555 Timer

| # | Schaltung | Bauteile | Test | Status |
|---|-----------|----------|------|--------|
| 4.1 | 555 Astabil | NE555,R1,R2,C,C2,VDC,GND | Tran Rechteck, Freq Counter, Fourier, Param Sweep R2 | ✅ |
| 4.2 | 555 Monostabil | NE555,R,C,VDC,GND,PushButton | Tran Monoflop, PushButton | ✅ |
| 4.3 | 555 Bistabil | NE555,R,VDC,GND,2x PushButton | Tran, Switch | ✅ |
| 4.4 | 555 PWM | NE555,R1,R2,C,D,VDC,GND,Pot | Tran Duty via Pot, Pot interactive | ✅ |

## 5. Filter – Passiv & Aktiv

| # | Schaltung | Test |
|---|-----------|------|
| 5.1 | RC Tiefpass 1. Ordnung | AC, Tran, Param Sweep R |
| 5.2 | RC Hochpass 1. Ordnung | AC |
| 5.3 | RL Tiefpass | AC |
| 5.4 | RLC Bandpass | AC Resonanz, Tran |
| 5.5 | RLC Bandsperre | AC |
| 5.6 | Sallen-Key Tiefpass 2. Ordnung | AC, Tran |
| 5.7 | Sallen-Key Hochpass 2. Ordnung | AC |
| 5.8 | Multiple Feedback Bandpass | AC |
| 5.9 | Twin-T Notch | AC |
| 5.10 | Allpass | AC Phase |

## 6. Digital – Gates, FlipFlops, Counter, etc.

| # | Schaltung | Bauteile | Test |
|---|-----------|----------|------|
| 6.1 | AND Gate | 74LS08,VDC,GND,VPULSE,LED | Tran, Logic Analyzer |
| 6.2 | OR Gate | 74LS32 | Tran |
| 6.3 | NOT Inverter | 74LS04 | Tran |
| 6.4 | NAND | 74LS00 | Tran, Logic Converter SOP |
| 6.5 | NOR | 74LS02 | Tran |
| 6.6 | XOR | 74LS86 | Tran |
| 6.7 | SR Latch (NAND) | 2x NAND,LED,VDC,GND | Tran, Switch |
| 6.8 | D Flip-Flop | 74LS74,Clock,LED,VDC,GND | Tran, Clockgen 1kHz |
| 6.9 | JK Flip-Flop | CD4027,Clock,LED | Tran |
| 6.10 | T Flip-Flop (aus D) | 74LS74 mit QN→D | Tran |
| 6.11 | 4-bit Counter | 74LS161,Clock,7-Seg | Tran, 7-Seg animated |
| 6.12 | Decade Counter 4017 | CD4017,Clock,LEDs | Tran |
| 6.13 | 3-to-8 Decoder 138 | 74LS138,LEDs | Tran, Logic Converter |
| 6.14 | 8-to-1 Mux 151 | MUX8,VPULSE | Tran |
| 6.15 | 7-Seg Decoder BCD | BCD7Seg,7-Seg,Clock | Tran, 7-Seg shows 0-9 |
| 6.16 | Half Adder | XOR,AND,LED | Tran, Logic Converter |
| 6.17 | Full Adder | 2x XOR,2x AND,OR,LED | Tran |
| 6.18 | 4-bit Adder | 4x Full Adder | Tran |
| 6.19 | Shift Register | 4x D-FF,Clock | Tran |
| 6.20 | Ring Counter | 4x D-FF | Tran |
| 6.21 | Debounce (SR) | NAND,R,C,PushButton | Tran |
| 6.22 | Clock Generator + LED Blink | Clockgen,LED,R | Tran, Pattern Generator |

## 7. Power – Buck, Boost, Regulator

| # | Schaltung | Test |
|---|-----------|------|
| 7.1 | Linear Regulator 7805 | VREG, C,VDC,R,GND | OP, DC Sweep Vin 7-12V |
| 7.2 | Buck Converter | MOSFET,Diode,L,C,VDC,VPULSE,R | Tran, Param Sweep L |
| 7.3 | Boost Converter | MOSFET,Diode,L,C,VDC,VPULSE,R | Tran |
| 7.4 | Buck-Boost | MOSFET,Diode,L,C,VDC,R | Tran |
| 7.5 | Current Limiter | NPN,R,VDC,GND | OP, DC Sweep |
| 7.6 | Fuse | Fuse,R,VDC,GND | OP, rated blow-up wenn I>1A |

## 8. Oscillatoren

| # | Schaltung | Test |
|---|-----------|------|
| 8.1 | Wien Bridge | LM741,R,C | Tran schwingt, Fourier, THD |
| 8.2 | Colpitts | NPN,L,C,R,VDC | Tran, AC |
| 8.3 | Hartley | NPN,L,C,R,VDC | Tran |
| 8.4 | Crystal Oscillator | NPN,Crystal,R,C,VDC | Tran |
| 8.5 | Phase Shift Oscillator | NPN,R,C,VDC | Tran |
| 8.6 | 555 Astabil als Clock | NE555,R1,R2,C | Tran, Freq Counter |
| 8.7 | Ring Oscillator (3x Inverter) | 3x NOT | Tran |

## 9. Funktionsgenerator + RC – Sweep Tests

| # | Schaltung | Test |
|---|-----------|------|
| 9.1 | FG Sine → RC Tiefpass | FG 1kHz Sine, R=1k C=1uF, AC fmin 10 fmax 100k, Tran 0.02s, Param Sweep R 100-10k 5 Punkte – muss 5 Kurven zeigen |
| 9.2 | FG Square → RC Integrierer | FG Square 1kHz, R=10k C=100nF, Tran Sägezahn, Fourier Harmonische |
| 9.3 | FG Triangle → RC Differenzierer | FG Triangle, R=1k C=1uF, Tran Rechteck-artig |
| 9.4 | FG AM → Diode Detector | FG AM, Diode,R,C, Tran Hüllkurve |
| 9.5 | FG FM → Filter | FG FM, RC, Tran |
| 9.6 | VPULSE → RC Lade/Entlade | VPULSE 0-5V 1kHz, R=1k C=1uF, Tran exponentiell, Grapher Cursors ΔT messen Tau=RC |
| 9.7 | Clockgen → Counter → 7-Seg | Clock 1kHz, 4017, 7-Seg, Tran zählt 0-9, 7-Seg animated |
| 9.8 | XFG → Bode Plotter | XFG Sine, Bode Plotter, AC Sweep, Network Analyzer |

## 10. Gemischt – Real-World Szenarien

| # | Schaltung | Test |
|---|-----------|------|
| 10.1 | LED Blink mit 555 | NE555,R1,R2,C,LED,R,VDC,GND | Tran blinkt, rated, Freq Counter |
| 10.2 | PWM Motor Control | NE555,Pot,Motor,R,VDC,GND | Tran Motor dreht schneller bei Pot, Pot interactive |
| 10.3 | Light Sensor (LDR + OpAmp) | LDR,OpAmp,R,LED,VDC,GND | OP, Tran, Pot LDR |
| 10.4 | Temperature Sensor (NTC + OpAmp) | NTC,OpAmp,R,VDC,GND | Temp Sweep -40..125, OP |
| 10.5 | Audio Verstärker (LM386) | LM386,R,C,Speaker,VAC,VDC,GND | AC, Tran, Spectrum |
| 10.6 | Guitar Distortion (Diode Clipper) | OpAmp,Diode,R,C,VAC,GND | Tran, THD, Distortion Analyzer |
| 10.7 | Power Supply 5V mit 7805 + Filter | Bridge, C,7805,C,R,VAC,GND | OP, Tran Brumm, DC Sweep |
| 10.8 | H-Bridge Motor | 4x MOSFET, Motor,VDC,VPULSE | Tran Motor vor/zurück |
| 10.9 | FlipFlop mit Debounce + LED | 74LS74,PushButton,R,C,LED | Tran, PushButton, ERC |
| 10.10 | 4-bit Binary Counter mit 7-Seg | Clock,74LS161,BCD7Seg,7-Seg | Tran zählt, 7-Seg zeigt 0-F, Logic Analyzer |
| 10.11 | Voltage Divider mit Fault Open | R1,R2,VDC,GND, Fault Open auf R1 | OP Warnung, ERC Marker, visual open |
| 10.12 | Voltage Divider mit Fault Short | R1,R2,VDC,GND, Fault Short auf R2 | OP Kurzschluss, Rauch rated wenn überlastet |
| 10.13 | Bus 8-bit mit 8 LEDs | Bus, 8x R,8x LED,VDC,GND, DIP Switch | Tran, Bus dicker lila, DIP Switch |
| 10.14 | On-Page Connector Test | R,VDC,GND, On-Page Connector NET_A an zwei Stellen | Netlist zeigt N=verbunden, OP |
| 10.15 | Hierarchical Block Test | HB mit R inside, Pins, platziert | Visual, Subcircuit (für MVP nur visual) |

## 11. Edge Cases – Müssen trotzdem laufen

| # | Schaltung | Test |
|---|-----------|------|
| 11.1 | Leer | Keine Bauteile | Warnung "Keine simulierbaren Bauteile", Empty State Onboarding |
| 11.2 | Nur GND | GND allein | Warnung "Keine Bauteile" |
| 11.3 | Kurzschluss VDC-GND | VDC direkt GND | Fehler "Singulär", ERC roter Marker, Zoom to error |
| 11.4 | Offenes Netz | R nur ein Pin verbunden | Warnung "Offenes Netz", ERC gelb |
| 11.5 | 100 Bauteile | 100x R verkettet | Performance 60fps? tsc ok |
| 11.6 | 500 Leitungen | Viele Wires | 60fps? |
| 11.7 | Alle Instrumente gleichzeitig | 13 Instrumente offen | Kein Crash, rAF drag 60fps |
| 11.8 | Tablet Portrait | iPad Hochkant | BottomSheet 80vh, 44px Buttons, kein Verschwinden |
| 11.9 | Mobile Landscape | iPhone Quer | Toolbar seitlich, Canvas größer |
| 11.10 | ? Hilfe | ? drücken | Shortcuts Overlay erscheint |

---

## Test Runner – Automatisiert (Node)

Siehe `src/lib/tests/circuit_scenarios.ts` – baut jede Schaltung programmatisch via `emptyDoc`, `buildNets`, `runAnalysisLocal`, prüft `ok`, `errors`, `warnings`, `time.length`, `freq.length`.

Für Funktionsgenerator + RC Sweep: FG Sine 1kHz → RC Tiefpass R=1k C=1uF, AC Sweep 10-100k 24 Punkte/Dekade, muss 24 Punkte liefern, Param Sweep R 100-10k 5 Punkte → 5 Kurven.

Für alle Szenarien: OP muss ok, TRAN muss ok wenn anwendbar, AC muss ok wenn VAC vorhanden, DC Sweep muss ok wenn VDC vorhanden, Param Sweep muss ok wenn R/C vorhanden.

**Ziel: 100+ Szenarien, alle ✅, dann ist es wirklich Multisim-like und publish-ready.**

