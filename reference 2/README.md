# CircuitBench

Schematic capture, native circuit simulation, virtual instruments and a grapher — a precise technical desktop-style tool running as a Next.js full-stack application with PostgreSQL persistence. Functionally inspired by classic schematic/simulation workbenches; all symbols, icons and visuals are original.

## 1. Start

```bash
npm install
# .env must contain DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/app_db
npx drizzle-kit push        # create tables projects / project_versions
npm run dev                 # http://localhost:3000
```

## 2. Build

```bash
npm run build && npm run start
```

Desktop packaging: the UI is a pure client bundle (`src/components/cb`) plus three small REST routes. To ship as a Tauri 2 desktop app, wrap the built frontend in a Tauri shell and replace `src/lib/cb/actions.ts` fetch calls with Tauri FS commands (the project file format is identical). This repository targets the web runtime available in this environment.

### Static build for Cloudflare Pages (no database)

The editor, MNA simulation engine, instruments and grapher run entirely in the browser — no server is involved in a simulation. Only project persistence used the REST API, and that is behind a storage adapter (`src/lib/cb/storage.ts`) with two interchangeable backends:

| Backend | Used for | Where projects live |
|---|---|---|
| `remote` | full-stack deployment (this repo, `npm run build && npm run start`) | PostgreSQL via Drizzle |
| `local` | static hosting / `file://` | `localStorage` of the browser |

The backend is fixed at build time with `NEXT_PUBLIC_STORAGE_MODE=local` and verified at runtime: the app probes `/api/projects` once and silently falls back to browser storage if no JSON API answers. So a static deployment never issues a database request.

**Cloudflare Pages setup (Git integration):**

1. Push this repository to Git.
2. Cloudflare dashboard → *Workers & Pages* → *Create* → *Pages* → *Connect to Git*, select the repo.
3. Build configuration:
   - **Framework preset:** None
   - **Build command:** `node scripts/build-static.mjs`
   - **Build output directory:** `out`
   - **Environment variables:** `NODE_VERSION` = `22` (Next 16 needs Node ≥ 20.9; the Pages default is older)
4. Save and deploy. HTTPS and the preview URL are automatic; `public/_headers` sets long-lived caching for `/_next/static/*`.

The script temporarily moves `src/app/api` aside (a static export must not contain route handlers), swaps `next.config.ts` for an `output: "export"` config, builds with `NEXT_PUBLIC_STORAGE_MODE=local`, and restores the tree afterwards — including on failure or Ctrl-C. Verify locally with:

```bash
node scripts/build-static.mjs && npx serve out
```

**Deploy without Git (Wrangler):**

```bash
node scripts/build-static.mjs
npx wrangler pages deploy out --project-name circuitbench
```

**Consequences of browser storage** (shown in the title bar and in *Preferences*):

* Projects are bound to that browser profile; no account, no server, nothing leaves the machine.
* Each save keeps the previous state as a restorable version (last 20) — *File ▸ Open ▸ Versions*.
* `localStorage` holds roughly 5 MB. The app reports usage in *Preferences* and tells you to export when it is full.
* Use *File ▸ Export Project File (.json)* / *Open ▸ Import .json file* to move or back up projects; the format is identical to the database deployment.
* Crash-recovery autosave also uses `localStorage` in both modes.

If you ever want shared server-side storage on Cloudflare without operating a database yourself, D1, KV or R2 bindings would be the natural extension — implement them as a third backend in `storage.ts`. They are not required for anything the app does today.

## 3. Architecture (layers)

| Layer | Location |
|---|---|
| Domain model + file format + migrations | `src/lib/cb/types.ts` |
| Component library (symbols, pins, props, models) | `src/lib/cb/library.ts` |
| Connectivity resolver + ERC (validation/diagnostics) | `src/lib/cb/connectivity.ts` |
| Simulation engine (MNA) | `src/lib/cb/engine.ts` |
| Simulation adapter / analyses / DSP / measurements | `src/lib/cb/analyses.ts` |
| Netlist generator (SPICE export/import) | `src/lib/cb/netlist.ts` |
| UI state, command-based undo/redo, sim runner | `src/lib/cb/store.ts` |
| Editing/persistence actions | `src/lib/cb/actions.ts` |
| Schematic editor (SVG) | `src/components/cb/Canvas.tsx` |
| Instrument runtime | `src/components/cb/Instruments.tsx` |
| Grapher | `src/components/cb/Grapher.tsx`, `Plot.tsx`, `src/lib/cb/expr.ts` |
| Persistence (pluggable: PostgreSQL API **or** browser storage) | `src/lib/cb/storage.ts`, `src/app/api/projects/*`, `src/app/api/versions/*` |

Pipeline: **Schematic → Connectivity Resolver → ERC → Circuit build (netlist) → MNA engine → SavedRun results → Instruments/Grapher.**

Connectivity is derived only from exact coordinates: wire endpoints, pin positions, T-junctions (a wire end or pin lying exactly on another wire), net labels (local per sheet; global/port across sheets) and power symbols. Crossing wires never connect.

Engine: dense Modified Nodal Analysis, Newton–Raphson with voltage-step limiting, source stepping for difficult operating points, backward-Euler transient with sub-step fallback, complex AC analysis linearised at the OP (numeric Jacobians of nonlinear devices), event-driven behavioural digital logic.

## 4. Project file format (schemaVersion 2)

JSON document (`Project` in `types.ts`):

```
schemaVersion, meta{name,author,created,modified,description}, sheets[{id,name}],
components[{id,type,ref,x,y,rot(0..3),mirror,sheet,props{},showRef,showValue,color,enabled}],
wires[{id,a:[x,y],b:[x,y],sheet,bus?,color?,netClass?}], labels[{id,x,y,name,kind:local|global|port,sheet}],
texts[{id,x,y,text,shape:text|rect,w,h}], probes[{id,kind:voltage|current|diff|power,name,color,x,y,x2,y2,compId,visible}],
variables{NAME:value}, sim{analysis,tran,ac,dc,param{dims[],analysis},temp,tempList,gmin},
presets[{name,sim}], runs[SavedRun{id,label,analysis,param,timestamp,status,xLabel,x[],signals{}}],
layout{panels,theme,grid,snap,visibility,windows{id:{x,y,w,h}}}, instrumentState{compId:{...}}
```

Coordinates: 1 unit = 10 mil; pins lie on the 100 mil grid. Junctions and power nets are derived (not stored). Migrations live in `migrations` inside `types.ts` (v1 → v2 shown). Every save stores the previous state in `project_versions` (restorable via File ▸ Open ▸ Versions). Autosave to localStorage provides crash recovery.

## 5. Tests

* In the app: **Tools ▸ Run Self-Tests**
* HTTP: `GET /api/selftest` (includes PostgreSQL save/reopen round-trip)
* CLI: `npx tsx scripts/test.ts` (engine/ERC/persistence) and `npx tsx scripts/test-local-storage.mts` (browser-storage backend)

Covered: RC low-pass transient + scope + probe, diode DC sweep, R1 parameter sweep (4 overlaid runs with legend labels), inverting op-amp with supplies, digital counter + D flip-flop + logic analyzer, ERC error cases (no GND, unconnected pin, missing model, duplicate reference, floating node, invalid value, crossing wires), persistence.

## 6. Example projects

File ▸ Open ▸ Example projects: RC Low-pass, Diode DC Sweep, RC Parameter Sweep, Inverting Op-Amp, Digital Counter + Logic Analyzer.

## 7. Supported parts & models

Resistor, Capacitor, Inductor, Potentiometer, Switch, ideal Transformer · DC V/I sources, Sine, Pulse, PWL · Diode, Zener, LED (Shockley + breakdown, RS, temperature scaling) · BJT NPN/PNP (Ebers–Moll) · NMOS/PMOS (level-1) · Ideal op amp (±Vsat), 5-pin op amp (rail clamp), Comparator · GND, VCC, VDD, VEE · NOT, BUF, AND, OR, NAND, NOR, XOR, D flip-flop, 4-bit counter, Logic Input, Logic Clock, Logic Probe, LED Indicator · 2-pin connector (physical only) · Instruments: Oscilloscope, Function Generator, Multimeter, Bode Plotter, Logic Analyzer (8/16/32), Wattmeter, Frequency Counter, Spectrum Analyzer, Word Generator, IV Analyzer.

Analyses: Operating Point, Transient (UIC/OP, interactive continuous mode, pause/stop), AC (dec/oct/lin, input source), DC sweep (nested), Parameter sweep (lin/log/list, nested, design variables), Temperature sweep, Fourier (harmonics, THD), Monte Carlo (tolerance), DC Sensitivity.

## 8. Known limitations

* Native TypeScript engine, not ngspice: fixed-step backward Euler (no LTE step control, no breakpoints), dense solver (practical up to a few hundred nodes).
* Noise analysis is not implemented (menu entry disabled).
* Transformer is ideal (passes DC). Op-amp export to SPICE ignores rails; digital parts are exported as comments.
* Buses are graphical; connectivity across buses is by equal net label names.
* Rotating a part does not re-route attached wires (moving does stretch them).
* SPICE import supports R, C, L, V (DC/SIN/PULSE), I, D and places parts with net labels.
* Static (database-less) deployment stores projects in `localStorage` — per browser, ~5 MB, no cross-device sync.

## 9. Licenses

Next.js (MIT), React (MIT), Zustand (MIT), Drizzle ORM (Apache-2.0), node-postgres (MIT), Tailwind CSS (MIT). No third-party symbol libraries, icons or vendor assets are used.
