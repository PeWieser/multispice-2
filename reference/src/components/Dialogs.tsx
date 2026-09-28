"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/state/store";
import { storage, type ProjectRecord, type VersionSummary } from "@/lib/persistence/storage";
import { COMPONENTS, CATEGORIES, componentValue, getDef } from "@/lib/domain/library";
import type { AnalysisConfig } from "@/lib/domain/types";
import { Icon, Modal, SectionTitle, Seg, Badge } from "@/components/ui";
import type { SweepSpec } from "@/lib/sim/engine";

/* ------------------------------------------------------------------ */
/*  Component Browser                                                  */
/* ------------------------------------------------------------------ */
export function ComponentBrowser() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "simulated" | "physical" | "virtual">("all");
  const [sel, setSel] = useState<string>(COMPONENTS[0].id);
  const [favs, setFavs] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const def = getDef(sel)!;

  const list = COMPONENTS.filter((c) => {
    if (cat && c.category !== cat) return false;
    if (filter !== "all" && c.model !== filter) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      return `${c.name} ${c.desc} ${c.searchTerms ?? ""} ${c.prefix} ${c.category}`.toLowerCase().includes(q);
    }
    return true;
  });

  const place = () => {
    useApp.setState({ showComponentBrowser: false, tool: "place", placeDefId: sel });
    setRecent((r) => [sel, ...r.filter((x) => x !== sel)].slice(0, 8));
    useApp.getState().addLog("info", `Placement tool armed: ${def.name}`);
    useApp.getState().openModal(null);
  };

  return (
    <Modal
      title="Component Browser"
      width={860}
      onClose={() => useApp.getState().openModal(null)}
      footer={
        <>
          <button className="btn" onClick={() => useApp.getState().openModal(null)}>
            Cancel
          </button>
          <button className="btn primary" onClick={place}>
            Place {def.name}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 12, minHeight: 420 }}>
        <div style={{ width: 200, borderRight: "1px solid var(--rule)", paddingRight: 10 }}>
          <input className="inp" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="sc pt-3 pb-1">Filter</div>
          <Seg
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All" },
              { value: "simulated", label: "Sim" },
              { value: "virtual", label: "Virtual" },
            ]}
          />
          <div className="sc pt-3 pb-1">Categories</div>
          <div className="row" onClick={() => setCat(null)}>
            <Icon name="folder" size={12} />
            <span>All</span>
            <span className="ml-auto mono hint">{COMPONENTS.length}</span>
          </div>
          {CATEGORIES.map((c) => (
            <div key={c} className={`row ${cat === c ? "sel" : ""}`} onClick={() => setCat(c)}>
              <Icon name="folder" size={12} />
              <span className="flex-1 truncate">{c}</span>
              <span className="mono hint">{COMPONENTS.filter((x) => x.category === c).length}</span>
            </div>
          ))}
          {favs.length > 0 && (
            <>
              <div className="sc pt-3 pb-1">Favourites</div>
              {favs.map((id) => (
                <div key={id} className="row" onClick={() => setSel(id)}>
                  <Icon name="bulb" size={12} />
                  <span className="flex-1 truncate">{getDef(id)?.name}</span>
                </div>
              ))}
            </>
          )}
          {recent.length > 0 && (
            <>
              <div className="sc pt-3 pb-1">Recently used</div>
              {recent.map((id) => (
                <div key={id} className="row" onClick={() => setSel(id)}>
                  <Icon name="file" size={12} />
                  <span className="flex-1 truncate">{getDef(id)?.name}</span>
                </div>
              ))}
            </>
          )}
        </div>

        <div style={{ width: 280 }} className="scroll">
          {list.map((c) => (
            <div key={c.id} className={`row ${sel === c.id ? "sel" : ""}`} onClick={() => setSel(c.id)}>
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 11.5, fontWeight: 500 }}>{c.name}</div>
                <div className="hint truncate">{c.desc}</div>
              </div>
              <Badge kind={c.model === "simulated" ? "ok" : "mute"}>{c.model}</Badge>
            </div>
          ))}
          {list.length === 0 && <div className="hint p-3">No parts match the filter.</div>}
        </div>

        <div style={{ flex: 1, borderLeft: "1px solid var(--rule)", paddingLeft: 12 }}>
          <div className="flex items-center gap-2">
            <div style={{ fontSize: 15, fontWeight: 600 }}>{def.name}</div>
            <Badge kind={def.model === "simulated" ? "ok" : "mute"}>{def.model}</Badge>
            <button
              className="tbtn ml-auto"
              title={favs.includes(def.id) ? "Remove favourite" : "Add favourite"}
              onClick={() =>
                setFavs((f) => (f.includes(def.id) ? f.filter((x) => x !== def.id) : [...f, def.id]))
              }
            >
              <Icon name="bulb" size={13} />
            </button>
          </div>
          <div className="hint">{def.desc}</div>
          <div
            className="mt-3"
            style={{
              background: "var(--paper)",
              border: "1px solid var(--rule)",
              borderRadius: 4,
              height: 150,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg viewBox="-60 -60 120 120" width={170} height={140}>
              {def.shapes.map((s, i) => {
                const stroke = "var(--ink)";
                if (s.t === "line")
                  return <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke={stroke} strokeWidth={1.4} />;
                if (s.t === "circle")
                  return <circle key={i} cx={s.cx} cy={s.cy} r={s.r} stroke={stroke} strokeWidth={1.4} fill={s.fill ?? "none"} />;
                if (s.t === "path")
                  return <path key={i} d={s.d} stroke={stroke} strokeWidth={1.4} fill={s.fill ?? "none"} />;
                if (s.t === "poly")
                  return <polygon key={i} points={s.pts} stroke={stroke} strokeWidth={1.4} fill={s.fill ?? "none"} />;
                if (s.t === "rect")
                  return <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} stroke={stroke} fill={s.fill ?? "none"} />;
                return (
                  <text key={i} x={s.x} y={s.y} fontSize={9} textAnchor="middle" fill="var(--ink-2)">
                    {s.s}
                  </text>
                );
              })}
              {def.pins.map((p) => (
                <circle key={p.id} cx={p.x} cy={p.y} r={2.2} fill="var(--blue)" />
              ))}
            </svg>
          </div>
          <div className="sc pt-3">Pins</div>
          <table className="tbl">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Type</th>
                <th className="num">X</th>
                <th className="num">Y</th>
              </tr>
            </thead>
            <tbody>
              {def.pins.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td>{p.name}</td>
                  <td>{p.type}</td>
                  <td className="num">{p.x}</td>
                  <td className="num">{p.y}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="sc pt-3">Properties</div>
          <table className="tbl">
            <tbody>
              {def.props.slice(0, 8).map((p) => (
                <tr key={p.key}>
                  <td>{p.label}</td>
                  <td className="num">
                    {p.def}
                    {p.unit ? ` ${p.unit}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="hint pt-2">
            Model status: {def.model === "simulated" ? "SPICE-compatible simulation model included" : "virtual / display only"} ·
            reference prefix {def.prefix}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Analysis settings                                                  */
/* ------------------------------------------------------------------ */
export function AnalysisDialog() {
  const project = useApp((s) => s.project);
  const [kind, setKind] = useState<AnalysisConfig["kind"]>("tran");
  const analysis = project.analyses.find((a) => a.kind === kind)!;
  const setParam = (key: string, value: string) => {
    useApp.getState().commit((p) => {
      const a = p.analyses.find((x) => x.kind === kind);
      if (a) a.params = { ...a.params, [key]: value };
    }, `${analysis.name}: ${key} = ${value}`);
  };

  return (
    <Modal
      title="Simulation Settings"
      width={620}
      onClose={() => useApp.getState().openModal(null)}
      footer={
        <>
          <button className="btn" onClick={() => useApp.getState().openModal(null)}>
            Close
          </button>
          <button
            className="btn primary"
            onClick={() => {
              useApp.getState().commit((p) => {
                p.analyses.forEach((a) => (a.enabled = a.kind === kind));
              }, `Active analysis → ${analysis.name}`);
              useApp.getState().openModal(null);
              useApp.getState().run(kind);
            }}
          >
            Run {analysis.name}
          </button>
        </>
      }
    >
      <Seg
        value={kind}
        onChange={setKind}
        options={[
          { value: "op", label: "Operating Point" },
          { value: "tran", label: "Transient" },
          { value: "ac", label: "AC" },
          { value: "dc", label: "DC Sweep" },
          { value: "param", label: "Parameter" },
        ]}
      />
      <div className="pt-3">
        <div className="field">
          <span className="lbl">Analysis name</span>
          <input
            value={analysis.name}
            onChange={(e) =>
              useApp.getState().commit((p) => {
                const a = p.analyses.find((x) => x.kind === kind);
                if (a) a.name = e.target.value;
              }, "Analysis renamed")
            }
          />
        </div>
        {kind === "tran" && (
          <>
            <div className="field">
              <span className="lbl">Start time</span>
              <input value={analysis.params.tstart ?? "0"} onChange={(e) => setParam("tstart", e.target.value)} />
            </div>
            <div className="field">
              <span className="lbl">Stop time</span>
              <input value={analysis.params.tstop ?? "5m"} onChange={(e) => setParam("tstop", e.target.value)} />
            </div>
            <div className="field">
              <span className="lbl">Max time step</span>
              <input value={analysis.params.tmax ?? "50u"} onChange={(e) => setParam("tmax", e.target.value)} />
            </div>
            <div className="field">
              <span className="lbl">Initial step</span>
              <input value={analysis.params.tstep ?? "10u"} onChange={(e) => setParam("tstep", e.target.value)} />
            </div>
            <div className="field">
              <span className="lbl">Initial conditions</span>
              <select value={analysis.params.useOp ?? "true"} onChange={(e) => setParam("useOp", e.target.value)}>
                <option value="true">Use operating point</option>
                <option value="false">UIC — skip operating point</option>
              </select>
            </div>
          </>
        )}
        {kind === "ac" && (
          <>
            <div className="field">
              <span className="lbl">Start frequency</span>
              <input value={analysis.params.fstart ?? "1"} onChange={(e) => setParam("fstart", e.target.value)} />
            </div>
            <div className="field">
              <span className="lbl">Stop frequency</span>
              <input value={analysis.params.fstop ?? "1Meg"} onChange={(e) => setParam("fstop", e.target.value)} />
            </div>
            <div className="field">
              <span className="lbl">Sweep type</span>
              <select value={analysis.params.sweepType ?? "dec"} onChange={(e) => setParam("sweepType", e.target.value)}>
                <option value="dec">Decade</option>
                <option value="lin">Linear</option>
                <option value="oct">Octave</option>
              </select>
            </div>
            <div className="field">
              <span className="lbl">Points / decade</span>
              <input value={analysis.params.points ?? "10"} onChange={(e) => setParam("points", e.target.value)} />
            </div>
            <div className="field">
              <span className="lbl">Input source</span>
              <input
                value={analysis.params.source ?? ""}
                placeholder="V1"
                onChange={(e) => setParam("source", e.target.value)}
              />
            </div>
          </>
        )}
        {kind === "dc" && (
          <>
            <div className="field">
              <span className="lbl">Sweep source</span>
              <input value={analysis.params.source ?? ""} placeholder="V1" onChange={(e) => setParam("source", e.target.value)} />
            </div>
            <div className="field">
              <span className="lbl">Start value</span>
              <input value={analysis.params.start ?? "0"} onChange={(e) => setParam("start", e.target.value)} />
            </div>
            <div className="field">
              <span className="lbl">Stop value</span>
              <input value={analysis.params.stop ?? "5"} onChange={(e) => setParam("stop", e.target.value)} />
            </div>
            <div className="field">
              <span className="lbl">Step value</span>
              <input value={analysis.params.step ?? "0.1"} onChange={(e) => setParam("step", e.target.value)} />
            </div>
            <div className="hint px-3 py-2">
              The sweep source is matched against the schematic reference of a voltage or current source (for example{" "}
              <span className="mono">V1</span>).
            </div>
          </>
        )}
        {kind === "param" && (
          <div className="hint px-3 py-2">
            Use <b>Simulate ▸ Parameter Sweep</b> for the full sweep dialog with component/property selection, linear,
            logarithmic or explicit value lists and overlaid runs.
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Parameter sweep dialog                                             */
/* ------------------------------------------------------------------ */
export function SweepDialog() {
  const project = useApp((s) => s.project);
  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];
  const sweepable = sheet.components.filter((c) => {
    const def = getDef(c.defId);
    return def && def.props.some((p) => p.type === "number" && p.group === "Simulation");
  });
  const [ref, setRef] = useState(sweepable[0]?.ref ?? "");
  const comp = sweepable.find((c) => c.ref === ref) ?? sweepable[0];
  const props = comp
    ? (getDef(comp.defId)?.props ?? []).filter((p) => p.type === "number" && p.group === "Simulation")
    : [];
  const [prop, setProp] = useState(props[0]?.key ?? "resistance");
  const [mode, setMode] = useState<"lin" | "log" | "list">("log");
  const [start, setStart] = useState("1k");
  const [stop, setStop] = useState("100k");
  const [points, setPoints] = useState("10");
  const [values, setValues] = useState("10nF, 22nF, 47nF, 100nF");
  const [baseKind, setBaseKind] = useState<"tran" | "dc" | "ac">("tran");
  const [saved, setSaved] = useState<string[]>([]);

  const preview = useMemo(() => {
    const n = Math.max(2, Number(points) || 2);
    const s = Number.parseFloat(start);
    const e = Number.parseFloat(stop);
    if (mode === "list") return values.split(/[,\s]+/).filter(Boolean).map((v) => v.trim());
    if (Number.isFinite(s) && Number.isFinite(e)) {
      return Array.from({ length: Math.min(20, n) }, (_, i) =>
        mode === "log"
          ? (s * Math.pow(e / s, i / (n - 1))).toPrecision(3)
          : (s + ((e - s) * i) / (n - 1)).toPrecision(3),
      );
    }
    return [];
  }, [mode, start, stop, points, values]);

  return (
    <Modal
      title="Parameter Sweep"
      width={640}
      onClose={() => useApp.getState().openModal(null)}
      footer={
        <>
          <button className="btn" onClick={() => useApp.getState().openModal(null)}>
            Cancel
          </button>
          <button
            className="btn"
            onClick={() => {
              setSaved((s) => [...s, `${ref}.${prop} (${mode})`]);
              useApp.getState().addLog("ok", `Sweep configuration saved: ${ref}.${prop}`);
            }}
          >
            Save configuration
          </button>
          <button
            className="btn primary"
            onClick={() => {
              const spec: SweepSpec = {
                baseKind,
                componentRef: ref,
                property: prop,
                mode,
                start: Number.parseFloat(start) || 1,
                stop: Number.parseFloat(stop) || 10,
                points: Number(points) || 10,
                values: values
                  .split(/[,\s]+/)
                  .filter(Boolean)
                  .map((v) => Number.parseFloat(v.replace(/[a-zA-ZµΩ]+/g, "")) || 0),
              };
              useApp.getState().openModal(null);
              useApp.getState().runSweep(spec as SweepSpec);
            }}
          >
            Run sweep
          </button>
        </>
      }
    >
      <div className="sc">Target parameter</div>
      <div className="field">
        <span className="lbl">Component</span>
        <select
          className="inp"
          value={ref}
          onChange={(e) => {
            setRef(e.target.value);
            const c = sweepable.find((x) => x.ref === e.target.value);
            const p = c ? (getDef(c.defId)?.props ?? []).find((x) => x.type === "number") : undefined;
            if (p) setProp(p.key);
          }}
        >
          {sweepable.map((c) => (
            <option key={c.id} value={c.ref}>
              {c.ref} · {getDef(c.defId)?.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="lbl">Property</span>
        <select className="inp" value={prop} onChange={(e) => setProp(e.target.value)}>
          {props.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="lbl">Base analysis</span>
        <select className="inp" value={baseKind} onChange={(e) => setBaseKind(e.target.value as "tran")}>
          <option value="tran">Transient</option>
          <option value="dc">DC Sweep</option>
          <option value="ac">AC Analysis</option>
        </select>
      </div>

      <div className="sc pt-3">Value range</div>
      <div className="field">
        <span className="lbl">Mode</span>
        <Seg
          value={mode}
          onChange={setMode}
          options={[
            { value: "lin", label: "Linear" },
            { value: "log", label: "Logarithmic" },
            { value: "list", label: "Value list" },
          ]}
        />
      </div>
      {mode === "list" ? (
        <div className="field">
          <span className="lbl">Values</span>
          <input value={values} onChange={(e) => setValues(e.target.value)} />
        </div>
      ) : (
        <>
          <div className="field">
            <span className="lbl">Start</span>
            <input value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="field">
            <span className="lbl">Stop</span>
            <input value={stop} onChange={(e) => setStop(e.target.value)} />
          </div>
          <div className="field">
            <span className="lbl">Points</span>
            <input value={points} onChange={(e) => setPoints(e.target.value)} />
          </div>
        </>
      )}

      <div className="sc pt-3">Preview</div>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-2)", paddingLeft: 12 }}>
        {preview.join("  ·  ")}
      </div>
      {saved.length > 0 && (
        <>
          <div className="sc pt-3">Saved configurations</div>
          {saved.map((s, i) => (
            <div key={i} className="row">
              <Icon name="doc" size={12} />
              <span className="mono">{s}</span>
            </div>
          ))}
        </>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Properties dialog                                                  */
/* ------------------------------------------------------------------ */
export function PropertiesDialog({ id }: { id: string }) {
  const project = useApp((s) => s.project);
  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];
  const comp = sheet.components.find((c) => c.id === id);
  const def = comp ? getDef(comp.defId) : undefined;

  return (
    <Modal
      title={`Properties — ${comp?.ref ?? id}`}
      width={520}
      onClose={() => useApp.getState().openModal(null)}
      footer={
        <button className="btn primary" onClick={() => useApp.getState().openModal(null)}>
          Done
        </button>
      }
    >
      {comp && def ? (
        <>
          <div className="sc">General</div>
          <div className="field">
            <span className="lbl">Reference</span>
            <input
              value={comp.ref}
              onChange={(e) => useApp.getState().updateObject(comp.id, { ref: e.target.value }, "Reference")}
            />
          </div>
          <div className="field">
            <span className="lbl">Value</span>
            <input
              value={componentValue(def, comp.props)}
              disabled={!def.valueProp}
              onChange={(e) =>
                useApp.getState().setComponentProp(comp.id, def.valueProp!, e.target.value, `${comp.ref} value`)
              }
            />
          </div>
          <div className="field">
            <span className="lbl">Description</span>
            <input value={def.desc} disabled />
          </div>
          {def.props.map((p) => (
            <div className="field" key={p.key}>
              <span className="lbl">{p.label}</span>
              <input
                value={comp.props[p.key] ?? ""}
                onChange={(e) => useApp.getState().setComponentProp(comp.id, p.key, e.target.value, `${comp.ref}.${p.key}`)}
              />
            </div>
          ))}
        </>
      ) : (
        <div className="hint">This object has no editable property sheet. Use the Inspector instead.</div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Keyboard shortcuts                                                 */
/* ------------------------------------------------------------------ */
const SHORTCUTS: [string, string][] = [
  ["Select tool", "Esc / V"],
  ["Wire tool", "W"],
  ["Bus tool", "B"],
  ["Place component", "P"],
  ["Net label", "N"],
  ["Ground", "G"],
  ["Voltage probe", "1"],
  ["Current probe", "2"],
  ["Differential probe", "3"],
  ["Power probe", "4"],
  ["Rotate", "R"],
  ["Mirror", "M"],
  ["Properties", "E"],
  ["Delete", "Del"],
  ["Undo", "Ctrl+Z"],
  ["Redo", "Ctrl+Y / Ctrl+Shift+Z"],
  ["Cut / Copy / Paste", "Ctrl+X / C / V"],
  ["Duplicate", "Ctrl+D"],
  ["Select all", "Ctrl+A"],
  ["Find", "Ctrl+F"],
  ["Save", "Ctrl+S"],
  ["Command palette", "Ctrl+K"],
  ["Run simulation", "F5"],
  ["Zoom in / out", "Ctrl+ + / −"],
  ["Fit to content", "Ctrl+0"],
  ["Pan", "Space+Drag or middle mouse"],
  ["Zoom", "Mouse wheel"],
];

export function ShortcutsDialog() {
  return (
    <Modal title="Keyboard Shortcuts" width={520} onClose={() => useApp.getState().openModal(null)}>
      <table className="tbl">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td className="num mono">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  About                                                              */
/* ------------------------------------------------------------------ */
export function AboutDialog() {
  return (
    <Modal title="About CircuitBench" width={620} onClose={() => useApp.getState().openModal(null)}>
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ width: 250, flex: "none" }}>
          <img
            src="images/bench.jpg"
            alt="Electronics workbench with oscilloscope, power supply and a populated circuit board"
            style={{ width: "100%", borderRadius: 5, border: "1px solid var(--rule)", display: "block" }}
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.01em" }}>CircuitBench</div>
          <div className="mono hint">Schematic capture · Simulation · Instrument bench</div>
          <div className="sc pt-3">Engine</div>
          <div style={{ fontSize: 11.5 }}>
            Built-in Modified Nodal Analysis solver: dense LU with partial pivoting, Newton–Raphson with junction
            limiting, backward-Euler companion models for reactive parts, complex MNA for AC sweeps and a separate
            event-driven digital engine. All plotted values are solved circuit quantities.
          </div>
          <div className="sc pt-3">Layers</div>
          <div style={{ fontSize: 11.5 }}>
            Domain model · Schematic editor · Connectivity resolver · Component library · Simulation adapter ·
            Instrument runtime · Grapher · Persistence · UI state · Validation &amp; diagnostics
          </div>
          <div className="sc pt-3">Third-party libraries</div>
          <div className="mono" style={{ fontSize: 11 }}>
            React 19 (MIT) · Next.js 15 (MIT) · Zustand (MIT) · Drizzle ORM (Apache-2.0) · PostgreSQL driver `pg` (MIT)
            · Tailwind CSS (MIT) · IBM Plex typeface (SIL OFL 1.1)
          </div>
          <div className="hint pt-3">
            CircuitBench is an independent workbench with its own symbol library and visual identity. It contains no
            third-party vendor logos, symbols or library files.
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Open project                                                       */
/* ------------------------------------------------------------------ */
export function OpenProjectDialog() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [versionsFor, setVersionsFor] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);

  const reload = useCallback(() => {
    setLoading(true);
    storage
      .list()
      .then((rows) => setProjects(rows))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <Modal
      title={`Open Project — ${storage.kind === "local" ? "browser storage" : "project store"}`}
      width={600}
      onClose={() => useApp.getState().openModal(null)}
      footer={
        <button className="btn primary" onClick={() => useApp.getState().openModal(null)}>
          Close
        </button>
      }
    >
      {loading && <div className="hint">Reading the project store…</div>}
      {error && (
        <div className="hint" style={{ color: "var(--error)" }}>
          {error}
        </div>
      )}
      {projects.map((p) => (
        <div key={p.id} className="row" style={{ borderLeft: "2px solid var(--rule)", flexWrap: "wrap" }}>
          <Icon name="doc" size={14} />
          <div className="flex-1 min-w-0">
            <div style={{ fontSize: 12, fontWeight: 600 }}>{p.name}</div>
            <div className="hint truncate">{p.description || "No description"}</div>
          </div>
          <span className="mono hint">{new Date(p.updatedAt).toLocaleString("en-GB")}</span>
          <button
            className="btn"
            onClick={() => {
              useApp.getState().loadProject(p.id);
              useApp.getState().openModal(null);
            }}
          >
            Open
          </button>
          <button
            className="btn"
            onClick={async () => {
              setVersionsFor(versionsFor === p.id ? null : p.id);
              setVersions(await storage.versions(p.id));
            }}
            title="Show saved snapshots"
          >
            Versions
          </button>
          <button
            className="btn danger"
            onClick={async () => {
              await storage.remove(p.id);
              reload();
            }}
          >
            Delete
          </button>
          {versionsFor === p.id && (
            <div className="mono" style={{ width: "100%", fontSize: 10.5, color: "var(--ink-3)", paddingLeft: 22 }}>
              {versions.length === 0
                ? "No snapshots yet — every save creates one."
                : versions
                    .slice(0, 8)
                    .map((v) => `${new Date(v.createdAt).toLocaleTimeString("en-GB")} · ${v.label ?? "save"}`)
                    .join("   |   ")}
            </div>
          )}
        </div>
      ))}
      {!loading && projects.length === 0 && (
        <div className="hint">
          No saved projects in this browser yet. Use <b>File ▸ Save</b> (Ctrl+S) to store the current design locally —
          CircuitBench needs no backend and no database.
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/*  Find                                                               */
/* ------------------------------------------------------------------ */
export function FindDialog() {
  const project = useApp((s) => s.project);
  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];
  const [q, setQ] = useState("");
  const hits = sheet.components.filter(
    (c) =>
      q.trim() &&
      `${c.ref} ${componentValue(getDef(c.defId) ?? ({ props: [] } as never), c.props)} ${
        getDef(c.defId)?.name ?? ""
      }`
        .toLowerCase()
        .includes(q.toLowerCase()),
  );
  return (
    <Modal
      title="Find in Design"
      width={480}
      onClose={() => useApp.getState().openModal(null)}
      footer={
        <button className="btn primary" onClick={() => useApp.getState().openModal(null)}>
          Close
        </button>
      }
    >
      <input className="inp" placeholder="Reference, value or part name…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="pt-2">
        {hits.map((c) => (
          <div
            key={c.id}
            className="row"
            onClick={() => {
              useApp.getState().select([c.id]);
              useApp.getState().openModal(null);
            }}
          >
            <Icon name="resistor" size={12} />
            <span className="mono">{c.ref}</span>
            <span className="flex-1">{getDef(c.defId)?.name}</span>
            <Badge kind="mute">{componentValue(getDef(c.defId)!, c.props)}</Badge>
          </div>
        ))}
        {q.trim() && hits.length === 0 && <div className="hint">No matches.</div>}
      </div>
    </Modal>
  );
}

export function ReportDialog({ kind }: { kind: string }) {
  const project = useApp((s) => s.project);
  const graph = useApp((s) => s.graph);
  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];
  const results = useApp((s) => s.results);

  return (
    <Modal
      title={kind}
      width={620}
      onClose={() => useApp.getState().openModal(null)}
      footer={
        <>
          <button
            className="btn"
            onClick={() => {
              const text = document.querySelector(".modal .scroll")?.textContent ?? "";
              const blob = new Blob([text], { type: "text/plain" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${kind.replace(/\s+/g, "_")}.txt`;
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export
          </button>
          <button className="btn primary" onClick={() => useApp.getState().openModal(null)}>
            Close
          </button>
        </>
      }
    >
      {kind === "Bill of Materials" && (
        <table className="tbl">
          <thead>
            <tr>
              <th>Qty</th>
              <th>Reference</th>
              <th>Part</th>
              <th>Value</th>
              <th>Footprint</th>
            </tr>
          </thead>
          <tbody>
            {Object.values(
              sheet.components.reduce<Record<string, { qty: number; ref: string; part: string; value: string; fp: string }>>(
                (acc, c) => {
                  const def = getDef(c.defId);
                  const key = `${def?.name ?? c.defId}|${def ? componentValue(def, c.props) : ""}`;
                  acc[key] = acc[key] ?? {
                    qty: 0,
                    ref: c.ref,
                    part: def?.name ?? c.defId,
                    value: def ? componentValue(def, c.props) : "",
                    fp: c.props.footprint ?? "—",
                  };
                  acc[key].qty++;
                  return acc;
                },
                {},
              ),
            ).map((row, i) => (
              <tr key={i}>
                <td className="num">{row.qty}</td>
                <td>{row.ref}</td>
                <td>{row.part}</td>
                <td>{row.value}</td>
                <td>{row.fp}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {kind === "Net List" && (
        <table className="tbl">
          <thead>
            <tr>
              <th>Net</th>
              <th>Type</th>
              <th>Pins</th>
            </tr>
          </thead>
          <tbody>
            {graph.nets.map((n) => (
              <tr key={n.id}>
                <td>{n.name}</td>
                <td>{n.signalType}</td>
                <td>{n.pins.map((p) => `${p.ref}.${p.pinName}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {kind === "Simulation Report" && (
        <table className="tbl">
          <thead>
            <tr>
              <th>Run</th>
              <th>Analysis</th>
              <th className="num">Points</th>
              <th className="num">Traces</th>
              <th className="num">Solve</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id}>
                <td>{new Date(r.createdAt).toLocaleTimeString("en-GB", { hour12: false })}</td>
                <td>{r.label}</td>
                <td className="num">{r.result.x.length}</td>
                <td className="num">{r.result.traces.length}</td>
                <td className="num">{r.result.solveMs.toFixed(1)} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {kind === "Measurement Report" && (
        <table className="tbl">
          <thead>
            <tr>
              <th>Probe</th>
              <th>Type</th>
              <th>Net</th>
              <th>Colour</th>
            </tr>
          </thead>
          <tbody>
            {sheet.probes.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>{p.type}</td>
                <td>{graph.netById[p.netId ?? ""]?.name ?? "—"}</td>
                <td>{p.color}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {kind === "Component List" && (
        <table className="tbl">
          <thead>
            <tr>
              <th>Reference</th>
              <th>Part</th>
              <th>Value</th>
              <th>Model</th>
            </tr>
          </thead>
          <tbody>
            {sheet.components.map((c) => (
              <tr key={c.id}>
                <td>{c.ref}</td>
                <td>{getDef(c.defId)?.name ?? c.defId}</td>
                <td>{getDef(c.defId) ? componentValue(getDef(c.defId)!, c.props) : ""}</td>
                <td>{getDef(c.defId)?.model}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

export function DocumentationDialog() {
  return (
    <Modal title="Documentation" width={680} onClose={() => useApp.getState().openModal(null)}>
      <SectionTitle>Workflow</SectionTitle>
      <ol style={{ paddingLeft: 18, fontSize: 12, lineHeight: 1.7 }}>
        <li>
          Place parts with <b>Place ▸ Component</b> (or the Component Browser) — click on the sheet to drop the symbol.
        </li>
        <li>
          Wire with <b>W</b>: click to set corners, <b>Enter</b> to finish, <b>Esc</b> to cancel. Wires snap to the
          10 mil grid and route orthogonally.
        </li>
        <li>
          Ground is mandatory: <b>Place ▸ Ground</b>. Power rails (VCC/VDD) name their net globally.
        </li>
        <li>Place probes on wires, then run a transient, AC or DC sweep from the Simulate menu.</li>
        <li>
          The Grapher shows the solved traces; the instrument windows read exactly the same result set, so the
          oscilloscope and the plotter always agree.
        </li>
      </ol>
      <SectionTitle>Connectivity rules</SectionTitle>
      <div style={{ fontSize: 12, lineHeight: 1.7 }}>
        Connectivity is derived from exact geometry only. A pin connects when its coordinate lies on a wire segment or
        endpoint. Two wires connect when a vertex of one lies on the other. Segments that merely cross are <b>not</b>{" "}
        connected — place a junction by ending a wire on the crossing point.
      </div>
      <SectionTitle>Simulation model</SectionTitle>
      <div style={{ fontSize: 12, lineHeight: 1.7 }}>
        Resistors, capacitors, inductors, coupled inductors, independent V/I sources with DC, sine, pulse and
        piecewise-linear waveforms, diodes (incl. zener/LED), bipolar transistors, MOSFETs, switches, ideal op-amps
        (nullor), comparators and potentiometers are supported for operating point, transient, AC and DC sweep
        analyses. Parameter sweeps re-solve the circuit for every value.
      </div>
    </Modal>
  );
}


