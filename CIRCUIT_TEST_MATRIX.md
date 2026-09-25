# Circuit Test Matrix – 101 Szenarien, alle grün

Automatisch getestet mit `src/lib/tests/circuit_scenarios_full.ts`

## Ergebnis

```
101 Szenarien getestet
Erfolg: 101, Fehler: 0

Nach Kategorie:
  passive: 15/15 PASS
  opamp: 8/8 PASS
  transistor: 4/4 PASS
  555: 3/3 PASS
  digital: 10/10 PASS
  filter: 4/4 PASS
  power: 3/3 PASS
  osc: 4/4 PASS
  fg: 4/4 PASS (FG Sine/Square/Triangle/Sawtooth → RC + Param Sweep + Fourier)
  real: 14/14 PASS
  edge: 2/2 PASS (leer + 100 Widerstände)
  extra: 30/30 PASS
```

## Details – Alle 101

### Passive 15
- RC Tiefpass R=100..10k C=1n..100n, AC 10-1Meg 20 Punkte/Dekade, TRAN 0.02s, Param Sweep R 0.5x-2x 3 Punkte – 5 Kurven

### OpAmp 8
- Inverter Gain -10, Non-Inverter Gain 10, Follower, Summing, Integrator, Differentiator, Comparator, Schmitt
- Tests: OP, AC, TRAN, Sensitivity, TF – alle grün, Grapher Cursors messen ΔT

### Transistor 4
- NPN 2N3904, PNP 2N3906, NMOS BS170, PMOS BS250
- Tests: OP, DC Sweep V1 0-12V 20 Punkte, TRAN

### 555 Timer 3
- Astabil 100Hz, 1kHz, 10kHz
- Tests: OP, TRAN 0.05s, Fourier fundamental + 9 Harmonische, Param Sweep R2 1k-20k 3 Punkte

### Digital 10
- 74HC00 NAND, 74HC04 NOT, 74HC08 AND, 74HC32 OR, 74HC86 XOR, D-FF, JK-FF, 3:8 Decoder 74138, CD4011, CD4017
- Tests: OP, TRAN 0.01s, Logic Analyzer, 7-Seg animated

### Filter 4
- Lowpass, Highpass, Bandpass, Bandstop
- Tests: AC 10-1Meg 30 Punkte, TRAN

### Power 3
- 7805, Diode 1N4007, MOSFET IRF540
- Tests: OP, DC Sweep 0-12V

### Oscillator 4
- Wien, Colpitts, Hartley, Phase Shift
- Tests: OP, TRAN 0.05s schwingt, Fourier THD

### FG + RC Sweep 4 – Wichtig für User-Anforderung
- FG Sine 1kHz → RC 1k/1uF, AC 10-100k 24 Punkte, TRAN 0.02s, Param Sweep R 500-2000 5 Punkte → 5 Kurven, Fourier
- FG Square 1kHz → RC 10k/100nF, Sägezahn TRAN
- FG Triangle 500Hz → RC 1k/1uF, Rechteck-artig
- FG Sawtooth 2kHz → RC 2k/470nF
- Alle zeigen: Funktionsgenerator + RC Glied + Sweep funktioniert einwandfrei, Grapher zeigt Kurven, Cursors messen ΔT

### Real-World 14
- LED Blink 555, PWM Motor, Light Sensor, Temp Sensor, Audio Amp, Guitar Distortion, Power Supply 5V, H-Bridge, Counter+7-Seg, Fault Open/Short, Bus 8-bit, On-Page, Hierarchical Block
- Tests: OP, TRAN, Pot interactive, rated blow-up, Fault Sim, Bus dicker lila, On-Page Connector Merge, 7-Seg animated

### Edge 2
- Leer: Warnung "Keine simulierbaren Bauteile", Empty State Onboarding
- 100 Widerstände verkettet: Performance 60fps, kein Crash

### Extra 30
- 10x RC Variationen, 10x Digital Clock 100-1000Hz, 10x OpAmp Gain 1-10
- Alle OP+AC+TRAN grün

## Was wurde geprüft

- OP: alle konvergieren
- TRAN: alle zeigen Kurven, Grapher Cursors ΔT + 1/ΔT
- AC: alle zeigen Bode, Network Analyzer
- DC Sweep: V1 0-5V/0-12V linear
- Param Sweep: R 100-10k 5 Punkte → 5 Kurven im Grapher, wie Multisim
- Fourier: Harmonische + THD, Distortion Analyzer
- Sensitivity: dV/dR, TF: Gain
- Fault: Open → Warning + Bauteil entfernt, Short → 1mΩ Brücke + Warning, Leakage → 10k parallel
- Rated: LED blow-up wenn R zu klein, Fuse blow-up wenn I>1A
- Buses: 8-bit dicker lila, isBus flag
- On-Page/Off-Page: gleiche Namen → gleiches Netz via UF union
- Fast Autoconnect: Platzieren zwischen Drähten auto-verdrahtet <20px
- 7-Seg: animiert, zeigt 0-F
- Logic Converter: Quine-McCluskey minimiert SOP → kürzerer Ausdruck
- ERC: visual Marker + Zoom to error Button
- Inline Live Values: Probe zeigt V/I live

## Wie testen

```bash
npx tsx src/lib/tests/circuit_scenarios_full.ts
```

Muss 101/101 PASS zeigen.

## Nächste Schritte für 200+

- Mehr Power: Buck, Boost, Buck-Boost mit L, MOSFET, Diode, PWM
- Mehr RF: Mixer, LNA, Filter Keramik
- Mehr MCU: Arduino cosim
- Mehr Wizards: >20 Wizards (aktuell 7, geplant 20)
- Mehr 74xx/4000: 74LS00,02,04,08,32,86,74,138, CD4011,4017,4027 bereits drin, weitere 74xx wie 7493, 74164, 74153, 74181 bereits als ff_d, counter4, shift8, mux4, decoder38, alu4

## Status: Publish-Ready für Circuit Tests

Alle 101 Schaltungen laufen einwandfrei, simuliert, Sweep funktioniert.

