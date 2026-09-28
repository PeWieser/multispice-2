# CircuitBench

**Schematic capture · SPICE-class circuit simulation · instrument bench.**

> **Deployment:** runs entirely in the browser, no backend and no database required.
> See [DEPLOY.md](DEPLOY.md) for Cloudflare Pages (static export), Wrangler and
> direct-upload instructions. Projects are stored in **IndexedDB** and can be exported
> as versioned JSON files.

CircuitBench is a working electronics workbench: you draw a schematic on a technical grid, the
connectivity resolver derives a real netlist from exact geometry, a Modified Nodal Analysis solver
simulates it, and the results appear on a grapher and on bench instruments (oscilloscope, function
generator, multimeter, Bode plotter, logic analyzer).

Every plotted value is a solved circuit quantity. Nothing is generated randomly or faked.

---

## 1. Startanleitung (getting started)

```bash
npm install
npm run dev          # development server
```

Open the printed URL. The application starts with the **RC Low-Pass** example already drawn —
press **Run** (or `F5`) and the transient solution appears in the Grapher and in the floating
oscilloscope window.

Projects are stored **locally in the browser** (IndexedDB, fallback localStorage) — no backend
and no database is needed:

```bash
npm run build:static   # static bundle in ./out for any static host
npm run deploy         # … plus upload to Cloudflare Pages via wrangler
```

## 2. Build-Anleitung (build)

```bash
npm run build        # production build
npm start            # production server
npm run typecheck    # tsc --noEmit
npx next typegen     # Next.js route/type generation
```

Headless solver verification (no browser required):

```bash
npx tsx scripts/simtest.ts
```

## 3. Architekturübersicht

| Layer | File(s) | Responsibility |
| --- | --- | --- |
| Domain model | `src/lib/domain/types.ts` | Sheets, components, wires, labels, probes, instruments, analyses, project document, engineering-unit parsing |
| Component library | `src/lib/domain/library.ts` | 45+ symbol definitions: pin tables, hand-drawn SVG geometry, property schema, simulation model descriptors |
| Schematic editor | `src/components/Canvas.tsx` | Grid, zoom-at-cursor, pan, marquee, drag, rotate/mirror, wire tool, placement, hit testing |
| Connectivity resolver | `src/lib/domain/connectivity.ts` | Exact-geometry union–find: pin↔wire, wire↔wire (vertex-on-segment), net naming priority, junctions, ERC |
| Simulation adapter | `src/lib/sim/engine.ts` | Circuit assembly + MNA solver: DC operating point, transient, AC sweep, DC sweep, parameter sweep, Fourier |
| Digital engine | `src/lib/sim/digital.ts` | Deterministic event-driven logic simulation (gates, D flip-flops, counters, clocks) |
| Instrument runtime | `src/components/Instruments.tsx` | Floating/dockable windows reading the real result set |
| Grapher | `src/components/Grapher.tsx` | Multi-trace plotting, cursors, statistics, FFT/derivative/integral/math, CSV/SVG/PNG export |
| Measurement | `src/lib/sim/measure.ts` | min/max/avg/RMS/pp/frequency/period/duty/rise/fall/phase, FFT, expression evaluator |
| Persistence | `src/lib/persistence/storage.ts` | Storage adapter: IndexedDB project store (plus versioned snapshots) with an optional HTTP adapter |
| UI state | `src/lib/state/store.ts` | Zustand store, command-pattern history (undo/redo), tools, selection, log |
| Validation | `src/lib/domain/connectivity.ts` + `src/components/Panels.tsx` | ERC diagnostics on canvas and in the Problems panel |

### Simulation model

The solver is a genuine **Modified Nodal Analysis** implementation:

* dense LU with partial pivoting,
* Newton–Raphson for nonlinear devices with junction voltage limiting,
* companion models for capacitors and inductors (backward Euler, optional trapezoidal),
* ideal op-amps as a true nullor stamp (`v+ = v-`, zero input current, arbitrary output current),
* complex MNA (Gaussian elimination over complex arithmetic) for AC analysis,
* gmin fallback for difficult operating points.

Supported devices: resistor, capacitor, inductor, coupled inductors / transformer, potentiometer,
switch, independent voltage and current sources (DC, sine, pulse, PWL), diode, zener, LED,
NPN/PNP bipolar transistors, N/P-channel MOSFETs, ideal op-amp, comparator.

Analyses: Operating Point, Transient, AC Sweep (decade/linear/octave), DC Sweep, Parameter Sweep
(linear/log/explicit value list, overlaid runs), Fourier (FFT of a transient trace).

## 4. Dateiformat (project format)

Versioned JSON document (`schemaVersion: 1`), created/loaded by
`src/lib/state/store.ts → migrateProject()`:

```jsonc
{
  "schemaVersion": 1,
  "id": "proj_xxx",
  "name": "RC Low-Pass Demo",
  "description": "...",
  "createdAt": 0, "updatedAt": 0,
  "sheets": [{
    "id": "sheet_rc", "name": "Sheet 1", "width": 1400, "height": 900,
    "components": [{ "id": "r1", "defId": "resistor", "ref": "R1",
                     "x": 360, "y": 120, "rot": 0, "mirror": false,
                     "props": { "resistance": "1k", "footprint": "R_0805" },
                     "showRef": true, "showValue": true, "showPins": false }],
    "wires":     [{ "id": "w1", "points": [{ "x": 200, "y": 170 }], "bus": false }],
    "labels":    [{ "id": "lb1", "kind": "net", "text": "N_IN", "x": 250, "y": 120, "rot": 0 }],
    "probes":    [{ "id": "pr1", "type": "voltage", "name": "V_IN", "color": "#c77a16",
                    "x": 300, "y": 120, "plotVisible": true }],
    "instruments": [{ "id": "xsc1_inst", "kind": "oscilloscope", "ref": "XSC1",
                      "cfg": { "ch0Src": "V(N_IN)" }, "window": { "x": 620, "y": 96, "w": 520, "h": 340 } }]
  }],
  "activeSheetId": "sheet_rc",
  "designVariables": [{ "name": "RLOAD", "value": "1k" }],
  "analyses": [{ "id": "an1", "kind": "tran", "name": "Transient Analysis", "enabled": true,
                 "params": { "tstart": "0", "tstop": "5m", "tstep": "10u" } }],
  "simSettings": { "engine": "internal-mna", "temperature": 27, "gmin": 1e-12,
                    "reltol": 1e-3, "vntol": 1e-6, "maxNewton": 80, "integration": "be" },
  "runs": [],
  "ui": { "theme": "light", "grid": true, "snap": true, "gridSize": 10,
          "leftWidth": 270, "rightWidth": 320, "bottomHeight": 240, "visibility": {} }
}
```

Migrations: `migrateProject()` upgrades older documents to the current `schemaVersion`.
Autosave: the working document is written to `localStorage` every 60 s and offered again on the
next start through the crash-recovery dialog. Every explicit **Save** stores the document in
IndexedDB and appends an immutable snapshot to the `versions` object store
(`File ▸ Save Copy` creates one deliberately). `File ▸ Export Project JSON` writes the same
document to disk so a design can travel between machines and browsers.

## 5. Testanleitung

Automated headless tests (`npx tsx scripts/simtest.ts`) cover the required scenarios:

1. **RC low-pass** — resolves nets, converges operating point and transient, output attenuated
   relative to input, measured −3 dB frequency close to `1/(2πRC)`.
2. **DC diode sweep** — reverse current below 1 nA, forward current in the mA range.
3. **AC sweep** — complex MNA result over a decade sweep.

Manual regression checklist in the UI:

* Draw the RC circuit by hand (Place ▸ Component, `W` for wires, `G` for ground) and run `F5`.
* Parameter Sweep: `Simulate ▸ Parameter Sweep`, `R1.resistance`, log, 1 k…100 k, 10 points —
  the Grapher legend shows `R1=…` for every overlaid run.
* Digital example (`File ▸ Example: Digital Counter`) + `F5` → Logic Analyzer window.
* Error cases: delete the ground symbol (ERC-001), leave a pin open (ERC-004), rename two parts to
  the same reference (ERC-003), set a value to `0` (ERC-006) — all marked on the canvas and in
  **Problems**.
* Persistence: `Ctrl+S`, `File ▸ Open…`, reload the page — positions, values, wires, probes and
  simulation settings are restored from IndexedDB. Close the tab without saving and the
  crash-recovery dialog offers the last autosave copy on the next start.

## 6. Beispielprojekte

* **RC Low-Pass** (default) — sine source, 1 kΩ, 100 nF, two voltage probes, a current probe and a
  bench oscilloscope. Run Transient.
* **Diode Rectifier** — `File ▸ Example: Diode Rectifier`. Run `Analyze ▸ DC Sweep` with source
  `V1`, −5 V…5 V.
* **Digital Counter** — `File ▸ Example: Digital Counter`. Logic clock, 4-bit counter, inverter,
  Logic Analyzer.

## 7. Unterstützte Bauteile und Modelle

| Category | Parts |
| --- | --- |
| Basic | Resistor, Capacitor, Inductor, Potentiometer, Switch (SPST), Transformer |
| Sources | DC voltage/current source, Sine source, Pulse source, PWL source |
| Diodes | Diode, Zener, LED |
| Transistors | NPN/PNP BJT (Gummel-Poon style), N/P-channel MOSFET (Level 1) |
| Analog | Ideal Op Amp (nullor), Comparator |
| Power | Ground, VCC, VDD |
| Digital | NOT, Buffer, AND, OR, NAND, NOR, XOR, Logic Input, Logic Clock, Logic Probe, LED Indicator, D Flip-Flop, 4-bit Counter |
| Connectors | Test Point, Hierarchical Port |
| Instruments | Oscilloscope, Function Generator, Digital Multimeter, Bode Plotter, Logic Analyzer, Wattmeter |

## 8. Bekannte Einschränkungen

* Project storage is bound to the browser profile/origin (IndexedDB). Use
  `File ▸ Export Project JSON` to move a design between machines; there is no server-side
  sync in this build.
* The desktop shell runs in the browser in this environment; the layering mirrors the requested
  Tauri/React/TypeScript architecture so the domain, simulation and UI layers port unchanged.
* SPICE export is a translation of the internal netlist; **SPICE import** understands
  `R/C/L/V/I/D` lines and maps unknown nodes onto net labels.
* Logic components are solved by the digital engine, not the analog MNA solver, so a mixed
  analog/digital design is simulated by both engines on the same net graph.
* Inductor companion model uses backward Euler (optional trapezoidal) with a fixed output grid;
  adaptive time-step control and `.ic` node initial conditions are simplified.
* Temperature sweep, noise analysis, Monte Carlo and sensitivity are listed but disabled in this
  build; Fourier analysis is provided as an FFT of a transient trace in the Grapher.
* Frequency Counter, Word Generator, Spectrum Analyzer and IV Analyzer place and open correctly but
  delegate their readouts to the Multimeter/Grapher measurement table.
* Rulers and PDF export use the browser print pipeline; "Exit" is disabled in the web preview.

## 9. Lizenzhinweise verwendeter Bibliotheken

| Library | License |
| --- | --- |
| React, React DOM | MIT |
| Next.js | MIT |
| Zustand | MIT |
| Drizzle ORM | Apache-2.0 |
| `pg` (node-postgres) | MIT |
| Tailwind CSS | MIT |
| IBM Plex Sans / IBM Plex Mono | SIL Open Font License 1.1 |
| TypeScript | Apache-2.0 |

All symbols, icons and plots in CircuitBench are drawn from scratch (SVG paths in
`src/lib/domain/library.ts` and `src/components/ui.tsx`). No third-party vendor logos, symbols or
library files are included.
