"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/state/store";
import { componentValue, getDef, COMPONENTS, CATEGORIES } from "@/lib/domain/library";
import type { Probe } from "@/lib/domain/types";
import { Icon, Seg, SectionTitle, Badge } from "@/components/ui";
import { viewApi } from "@/components/Canvas";
import Grapher from "@/components/Grapher";
import { fmt } from "@/lib/sim/measure";

/* ------------------------------------------------------------------ */
/*  shared helpers                                                     */
/* ------------------------------------------------------------------ */
function focusObject(id: string) {
  const { project, graph } = useApp.getState();
  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];
  const c = sheet.components.find((x) => x.id === id);
  if (c) {
    useApp.getState().select([id]);
    viewApi.zoomTo(c.x - 120, c.y - 90, 240, 180);
    return;
  }
  const w = sheet.wires.find((x) => x.id === id);
  if (w && w.points.length) {
    useApp.getState().select([id]);
    const xs = w.points.map((p) => p.x);
    const ys = w.points.map((p) => p.y);
    viewApi.zoomTo(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    return;
  }
  const p = sheet.probes.find((x) => x.id === id);
  if (p) {
    useApp.getState().select([id]);
    viewApi.zoomTo(p.x - 120, p.y - 90, 240, 180);
    return;
  }
  void graph;
}

/* ------------------------------------------------------------------ */
/*  Design Browser (left rail)                                         */
/* ------------------------------------------------------------------ */
const LEFT_TABS = ["Hierarchy", "Visibility", "Project", "Components", "Nets", "Instruments", "Probes"];

export function DesignBrowser() {
  const project = useApp((s) => s.project);
  const graph = useApp((s) => s.graph);
  const setUi = useApp((s) => s.setUi);
  const tab = project.ui.leftTab;
  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];
  const [query, setQuery] = useState("");

  return (
    <aside className="flex flex-col min-h-0" style={{ width: project.ui.leftWidth, background: "var(--panel)" }}>
      <div className="flex rule-b" style={{ overflowX: "auto", flex: "none" }}>
        {LEFT_TABS.map((t) => (
          <button
            key={t}
            className={`tab ${tab === t ? "active" : ""}`}
            onClick={() => setUi({ leftTab: t })}
            style={{ flex: "none" }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="scroll flex-1 min-h-0">
        {tab === "Hierarchy" && (
          <div>
            <SectionTitle>Sheets</SectionTitle>
            {project.sheets.map((s) => (
              <div
                key={s.id}
                className={`row ${s.id === project.activeSheetId ? "sel" : ""}`}
                onClick={() => useApp.getState().setProject({ ...project, activeSheetId: s.id }, true)}
              >
                <Icon name="doc" size={13} />
                <span className="flex-1">{s.name}</span>
                <span className="mono hint">
                  {s.components.length}c / {s.wires.length}w
                </span>
              </div>
            ))}
            <SectionTitle>Blocks</SectionTitle>
            <div className="hint px-3 pb-3">
              Hierarchical sub-circuits are represented as off-sheet ports (Place ▸ Hierarchical Port). Ports with the
              same net name are merged by the connectivity resolver.
            </div>
          </div>
        )}

        {tab === "Visibility" && (
          <div>
            <SectionTitle>Show / Hide</SectionTitle>
            {Object.keys(project.ui.visibility).map((k) => (
              <label key={k} className="row cursor-pointer">
                <input
                  type="checkbox"
                  checked={project.ui.visibility[k] !== false}
                  onChange={(e) =>
                    setUi({ visibility: { ...project.ui.visibility, [k]: e.target.checked } })
                  }
                />
                <span>{k}</span>
              </label>
            ))}
            <SectionTitle>Canvas</SectionTitle>
            <label className="row cursor-pointer">
              <input type="checkbox" checked={project.ui.grid} onChange={(e) => setUi({ grid: e.target.checked })} />
              <span>Grid</span>
            </label>
            <label className="row cursor-pointer">
              <input type="checkbox" checked={project.ui.snap} onChange={(e) => setUi({ snap: e.target.checked })} />
              <span>Snap to grid</span>
            </label>
            <label className="row cursor-pointer">
              <input
                type="checkbox"
                checked={project.ui.pageBounds}
                onChange={(e) => setUi({ pageBounds: e.target.checked })}
              />
              <span>Page boundaries</span>
            </label>
            <div className="px-3 py-2">
              <div className="sc pb-1">Grid size</div>
              <Seg
                value={String(project.ui.gridSize) as "10" | "25" | "50"}
                onChange={(v) => setUi({ gridSize: Number(v) as 10 | 25 | 50 })}
                options={[
                  { value: "10", label: "10 mil" },
                  { value: "25", label: "25 mil" },
                  { value: "50", label: "50 mil" },
                ]}
              />
            </div>
          </div>
        )}

        {tab === "Project" && (
          <div>
            <SectionTitle>Project</SectionTitle>
            <div className="px-3">
              <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                {project.name}
              </div>
              <div className="hint">{project.description || "No description"}</div>
            </div>
            <SectionTitle>Design Variables</SectionTitle>
            {project.designVariables.map((v, i) => (
              <div className="field px-3" key={v.name}>
                <span className="lbl mono">{v.name}</span>
                <input
                  value={v.value}
                  onChange={(e) => {
                    const next = [...project.designVariables];
                    next[i] = { ...v, value: e.target.value };
                    useApp.getState().commit((p) => {
                      p.designVariables = next;
                    }, `Design variable ${v.name} = ${e.target.value}`);
                  }}
                />
              </div>
            ))}
            <div className="hint px-3 py-2">
              Reference variables in any value field with braces, e.g. <span className="mono">{"{RLOAD}"}</span>.
            </div>
            <SectionTitle>Saved Runs</SectionTitle>
            {useApp.getState().results.length === 0 && <div className="hint px-3 pb-3">No runs yet.</div>}
          </div>
        )}

        {tab === "Components" && (
          <div>
            <div className="p-2">
              <input
                className="inp"
                placeholder="Search components…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <SectionTitle>Library ({COMPONENTS.length} parts)</SectionTitle>
            {CATEGORIES.map((cat) => {
              const items = COMPONENTS.filter(
                (c) =>
                  c.category === cat &&
                  (query.trim() === "" ||
                    `${c.name} ${c.desc} ${c.searchTerms ?? ""} ${c.prefix}`.toLowerCase().includes(query.toLowerCase())),
              );
              if (!items.length) return null;
              return (
                <div key={cat}>
                  <div className="px-3 pt-2 pb-1 sc">{cat}</div>
                  {items.map((d) => (
                    <div
                      key={d.id}
                      className="row"
                      onDoubleClick={() => {
                        useApp.setState({ tool: "place", placeDefId: d.id });
                        useApp.getState().addLog("info", `Placement tool: ${d.name}`);
                      }}
                      title="Double-click to place"
                    >
                      <Icon name={d.kind === "source" ? "power" : d.kind === "digital" ? "logic" : "resistor"} size={13} />
                      <span className="flex-1 truncate">{d.name}</span>
                      <button
                        className="tbtn"
                        title="Place on the sheet"
                        onClick={() => useApp.setState({ tool: "place", placeDefId: d.id })}
                      >
                        <Icon name="plus" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {tab === "Nets" && (
          <div>
            <SectionTitle>Nets ({graph.nets.length})</SectionTitle>
            {graph.nets.map((n) => (
              <div
                key={n.id}
                className={`row ${useApp.getState().netHighlight === n.id ? "sel" : ""}`}
                onClick={() => {
                  useApp.setState({ netHighlight: n.id });
                  if (n.pins[0]) viewApi.zoomTo(n.pins[0].x - 120, n.pins[0].y - 90, 240, 180);
                }}
              >
                <span
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 2,
                    background: n.isGround
                      ? "var(--teal)"
                      : n.signalType === "digital"
                        ? "var(--amber)"
                        : n.signalType === "power"
                          ? "var(--ok)"
                          : "var(--blue)",
                  }}
                />
                <div className="flex-1 min-w-0">
                  <div className="mono truncate" style={{ fontSize: 11 }}>
                    {n.name}
                  </div>
                  <div className="truncate hint">
                    {n.pins.map((p) => `${p.ref}.${p.pinName}`).join(", ") || "no pins"}
                  </div>
                </div>
                <Badge kind="mute">{n.signalType}</Badge>
              </div>
            ))}
            {graph.nets.length === 0 && <div className="hint px-3">No nets resolved yet.</div>}
          </div>
        )}

        {tab === "Instruments" && (
          <div>
            <SectionTitle>Instruments</SectionTitle>
            {sheet.instruments.map((i) => (
              <div key={i.id} className="row">
                <Icon name="scope" size={13} />
                <div className="flex-1 min-w-0">
                  <div className="mono" style={{ fontSize: 11 }}>
                    {i.ref}
                  </div>
                  <div className="hint truncate">{i.name}</div>
                </div>
                <button
                  className="btn"
                  style={{ height: 20 }}
                  onClick={() =>
                    useApp.getState().updateObject(
                      i.id,
                      { window: { ...i.window, open: !i.window.open } },
                      `${i.ref} window toggled`,
                    )
                  }
                >
                  {i.window.open ? "Hide" : "Show"}
                </button>
              </div>
            ))}
            {sheet.instruments.length === 0 && (
              <div className="hint px-3 pb-3">
                No instruments placed. Use Place ▸ Instrument to add an oscilloscope, function generator, multimeter,
                Bode plotter or logic analyzer.
              </div>
            )}
          </div>
        )}

        {tab === "Probes" && (
          <div>
            <SectionTitle>Probe Manager</SectionTitle>
            {sheet.probes.map((p: Probe) => (
              <div key={p.id} className="row" onClick={() => focusObject(p.id)}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                <input
                  className="inp"
                  style={{ height: 20, fontSize: 11, flex: 1 }}
                  value={p.name}
                  onChange={(e) =>
                    useApp.getState().updateObject(p.id, { name: e.target.value }, `Probe renamed to ${e.target.value}`)
                  }
                />
                <select
                  className="inp"
                  style={{ height: 20, fontSize: 10, width: 66 }}
                  value={p.color}
                  onChange={(e) => useApp.getState().updateObject(p.id, { color: e.target.value }, "Probe colour changed")}
                >
                  <option value="#1f5fd0">blue</option>
                  <option value="#c77a16">amber</option>
                  <option value="#2e7a4f">green</option>
                  <option value="#b3372c">red</option>
                  <option value="#7a4fa3">violet</option>
                  <option value="#2c7a7b">teal</option>
                </select>
                <button
                  className="tbtn"
                  title="Toggle plot visibility"
                  onClick={(e) => {
                    e.stopPropagation();
                    useApp.getState().updateObject(p.id, { plotVisible: !p.plotVisible }, "Probe plot visibility");
                  }}
                >
                  <Icon name={p.plotVisible ? "check" : "close"} size={12} />
                </button>
                <button
                  className="tbtn"
                  title="Delete probe"
                  onClick={(e) => {
                    e.stopPropagation();
                    useApp.getState().select([p.id]);
                    useApp.getState().deleteSelection();
                  }}
                >
                  <Icon name="trash" size={12} />
                </button>
              </div>
            ))}
            {sheet.probes.length === 0 && (
              <div className="hint px-3 pb-3">
                No probes. Place ▸ Voltage / Current / Differential / Power Probe, then click a wire or component.
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Inspector (right rail)                                             */
/* ------------------------------------------------------------------ */
export function Inspector() {
  const project = useApp((s) => s.project);
  const graph = useApp((s) => s.graph);
  const selection = useApp((s) => s.selection);
  const commit = useApp((s) => s.commit);
  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];
  const [, force] = useState(0);

  const comp = sheet.components.find((c) => selection.includes(c.id));
  const wire = sheet.wires.find((w) => selection.includes(w.id));
  const label = sheet.labels.find((l) => selection.includes(l.id));
  const probe = sheet.probes.find((p) => selection.includes(p.id));
  const instrument = sheet.instruments.find((i) => selection.includes(i.id));

  const setProp = (key: string, value: string) => {
    if (!comp) return;
    commit((p) => {
      const s = p.sheets.find((x) => x.id === p.activeSheetId) ?? p.sheets[0];
      const c = s.components.find((x) => x.id === comp.id);
      if (c) c.props[key] = value;
    }, `${comp.ref}.${key} = ${value}`);
    force((v) => v + 1);
  };

  return (
    <aside className="flex flex-col min-h-0 rule-l" style={{ width: project.ui.rightWidth, background: "var(--panel)" }}>
      <div className="panel-head">
        <Icon name="settings" size={13} />
        <span className="sc" style={{ color: "var(--ink)" }}>
          Inspector
        </span>
        <span className="ml-auto mono hint">{selection.length} selected</span>
      </div>
      <div className="scroll flex-1 min-h-0 pb-4">
        {!comp && !wire && !label && !probe && !instrument && (
          <div>
            <SectionTitle>Project</SectionTitle>
            <div className="field px-3">
              <span className="lbl">Name</span>
              <input
                value={project.name}
                onChange={(e) => useApp.getState().setProject({ ...project, name: e.target.value }, true)}
              />
            </div>
            <div className="field px-3">
              <span className="lbl">Description</span>
              <input
                value={project.description}
                onChange={(e) => useApp.getState().setProject({ ...project, description: e.target.value }, true)}
              />
            </div>
            <SectionTitle>Simulation</SectionTitle>
            <div className="field px-3">
              <span className="lbl">Engine</span>
              <select className="inp" value={project.simSettings.engine} disabled>
                <option value="internal-mna">internal MNA solver</option>
              </select>
            </div>
            <div className="field px-3">
              <span className="lbl">Temperature</span>
              <input
                value={String(project.simSettings.temperature)}
                onChange={(e) =>
                  useApp.getState().setProject(
                    {
                      ...project,
                      simSettings: { ...project.simSettings, temperature: Number(e.target.value) || 27 },
                    },
                    true,
                  )
                }
              />
            </div>
            <div className="field px-3">
              <span className="lbl">Rel. tolerance</span>
              <input
                value={String(project.simSettings.reltol)}
                onChange={(e) =>
                  useApp.getState().setProject(
                    {
                      ...project,
                      simSettings: { ...project.simSettings, reltol: Number(e.target.value) || 1e-3 },
                    },
                    true,
                  )
                }
              />
            </div>
            <div className="field px-3">
              <span className="lbl">Max. Newton</span>
              <input
                value={String(project.simSettings.maxNewton)}
                onChange={(e) =>
                  useApp.getState().setProject(
                    {
                      ...project,
                      simSettings: { ...project.simSettings, maxNewton: Number(e.target.value) || 80 },
                    },
                    true,
                  )
                }
              />
            </div>
            <SectionTitle>Statistics</SectionTitle>
            <table className="tbl">
              <tbody>
                <tr>
                  <td>Components</td>
                  <td className="num">{graph.stats.components}</td>
                </tr>
                <tr>
                  <td>Wires</td>
                  <td className="num">{graph.stats.wires}</td>
                </tr>
                <tr>
                  <td>Nets</td>
                  <td className="num">{graph.stats.nets}</td>
                </tr>
                <tr>
                  <td>Pins</td>
                  <td className="num">{graph.stats.pins}</td>
                </tr>
                <tr>
                  <td>Floating nodes</td>
                  <td className="num">{graph.floatingNodes.length}</td>
                </tr>
              </tbody>
            </table>
            <div className="hint px-3 pt-3">
              Select a component, wire or probe to edit its properties. Double-click a component for the full property
              sheet.
            </div>
          </div>
        )}

        {comp && (
          <div>
            <div className="px-3 pt-3">
              <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
                {comp.ref}
              </div>
              <div className="hint">{getDef(comp.defId)?.name ?? comp.defId}</div>
            </div>
            <SectionTitle>General</SectionTitle>
            <div className="field px-3">
              <span className="lbl">Reference</span>
              <input
                value={comp.ref}
                onChange={(e) =>
                  useApp.getState().updateObject(comp.id, { ref: e.target.value }, `Reference → ${e.target.value}`)
                }
              />
            </div>
            <div className="field px-3">
              <span className="lbl">Value</span>
              <input
                value={comp.props[getDef(comp.defId)?.valueProp ?? ""] ?? ""}
                disabled={!getDef(comp.defId)?.valueProp}
                onChange={(e) => setProp(getDef(comp.defId)!.valueProp!, e.target.value)}
              />
            </div>
            <div className="field px-3">
              <span className="lbl">Position</span>
              <span className="mono" style={{ fontSize: 11 }}>
                {comp.x}, {comp.y} · rot {comp.rot}° {comp.mirror ? "· mirrored" : ""}
              </span>
            </div>
            {(["Simulation", "Physical", "Advanced", "General"] as const).map((group) => {
              const props = (getDef(comp.defId)?.props ?? []).filter((p) => p.group === group);
              if (!props.length) return null;
              return (
                <div key={group}>
                  <SectionTitle>{group}</SectionTitle>
                  {props.map((p) => (
                    <div className="field px-3" key={p.key} title={p.hint}>
                      <span className="lbl">
                        {p.label}
                        {p.unit ? ` [${p.unit}]` : ""}
                      </span>
                      {p.type === "enum" ? (
                        <select
                          className="inp"
                          value={comp.props[p.key] ?? p.def}
                          onChange={(e) => setProp(p.key, e.target.value)}
                        >
                          {(p.options ?? []).map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input value={comp.props[p.key] ?? ""} onChange={(e) => setProp(p.key, e.target.value)} />
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
            <SectionTitle>Appearance</SectionTitle>
            <label className="row cursor-pointer">
              <input
                type="checkbox"
                checked={comp.showRef}
                onChange={(e) => useApp.getState().updateObject(comp.id, { showRef: e.target.checked }, "Show reference")}
              />
              <span>Show reference</span>
            </label>
            <label className="row cursor-pointer">
              <input
                type="checkbox"
                checked={comp.showValue}
                onChange={(e) => useApp.getState().updateObject(comp.id, { showValue: e.target.checked }, "Show value")}
              />
              <span>Show value</span>
            </label>
            <div className="px-3 pt-2 flex gap-2">
              <button className="btn" onClick={() => useApp.getState().rotateSelection()}>
                Rotate
              </button>
              <button className="btn" onClick={() => useApp.getState().mirrorSelection()}>
                Mirror
              </button>
              <button className="btn danger" onClick={() => useApp.getState().deleteSelection()}>
                Delete
              </button>
            </div>
          </div>
        )}

        {wire && (
          <div>
            <SectionTitle>Wire</SectionTitle>
            <div className="field px-3">
              <span className="lbl">Net</span>
              <span className="mono" style={{ fontSize: 11 }}>
                {graph.nets.find((n) => n.wireIds.includes(wire.id))?.name ?? "unresolved"}
              </span>
            </div>
            <div className="field px-3">
              <span className="lbl">Net name</span>
              <input
                value={wire.netName ?? ""}
                placeholder="auto"
                onChange={(e) => useApp.getState().updateObject(wire.id, { netName: e.target.value }, "Wire net name")}
              />
            </div>
            <div className="field px-3">
              <span className="lbl">Net class</span>
              <input
                value={wire.netClass ?? "Default"}
                onChange={(e) => useApp.getState().updateObject(wire.id, { netClass: e.target.value }, "Net class")}
              />
            </div>
            <div className="field px-3">
              <span className="lbl">Signal type</span>
              <select
                className="inp"
                value={wire.signalType ?? "unknown"}
                onChange={(e) => useApp.getState().updateObject(wire.id, { signalType: e.target.value }, "Signal type")}
              >
                <option>analog</option>
                <option>digital</option>
                <option>power</option>
                <option>mixed</option>
                <option>unknown</option>
              </select>
            </div>
            <label className="row cursor-pointer">
              <input
                type="checkbox"
                checked={!!wire.showLabel}
                onChange={(e) => useApp.getState().updateObject(wire.id, { showLabel: e.target.checked }, "Label shown")}
              />
              <span>Show net label</span>
            </label>
            <div className="px-3 pt-2">
              <button className="btn danger" onClick={() => useApp.getState().deleteSelection()}>
                Delete wire
              </button>
            </div>
          </div>
        )}

        {label && (
          <div>
            <SectionTitle>{label.kind === "text" ? "Text" : "Net Label"}</SectionTitle>
            <div className="field px-3">
              <span className="lbl">Text</span>
              <input
                value={label.text}
                onChange={(e) => useApp.getState().updateObject(label.id, { text: e.target.value }, "Label text")}
              />
            </div>
            <div className="field px-3">
              <span className="lbl">Kind</span>
              <select
                className="inp"
                value={label.kind}
                onChange={(e) => useApp.getState().updateObject(label.id, { kind: e.target.value }, "Label kind")}
              >
                <option value="net">Net label (local)</option>
                <option value="global">Global label</option>
                <option value="text">Free text</option>
              </select>
            </div>
            <div className="px-3 pt-2">
              <button className="btn danger" onClick={() => useApp.getState().deleteSelection()}>
                Delete label
              </button>
            </div>
          </div>
        )}

        {probe && (
          <div>
            <SectionTitle>Probe</SectionTitle>
            <div className="field px-3">
              <span className="lbl">Type</span>
              <select
                className="inp"
                value={probe.type}
                onChange={(e) => useApp.getState().updateObject(probe.id, { type: e.target.value }, "Probe type")}
              >
                <option value="voltage">Voltage</option>
                <option value="current">Current</option>
                <option value="differential">Differential</option>
                <option value="power">Power</option>
              </select>
            </div>
            <div className="field px-3">
              <span className="lbl">Name</span>
              <input
                value={probe.name}
                onChange={(e) => useApp.getState().updateObject(probe.id, { name: e.target.value }, "Probe name")}
              />
            </div>
            <div className="field px-3">
              <span className="lbl">Source net</span>
              <select
                className="inp"
                value={probe.netId ?? ""}
                onChange={(e) => useApp.getState().updateObject(probe.id, { netId: e.target.value }, "Probe source net")}
              >
                <option value="">(auto from position)</option>
                {graph.nets.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.name}
                  </option>
                ))}
              </select>
            </div>
            {probe.type === "differential" && (
              <div className="field px-3">
                <span className="lbl">Reference net</span>
                <select
                  className="inp"
                  value={probe.refNetId ?? ""}
                  onChange={(e) =>
                    useApp.getState().updateObject(probe.id, { refNetId: e.target.value }, "Probe reference net")
                  }
                >
                  <option value="">GND</option>
                  {graph.nets.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field px-3">
              <span className="lbl">Colour</span>
              <input
                type="color"
                value={probe.color}
                onChange={(e) => useApp.getState().updateObject(probe.id, { color: e.target.value }, "Probe colour")}
              />
            </div>
            <div className="field px-3">
              <span className="lbl">Description</span>
              <input
                value={probe.description ?? ""}
                onChange={(e) => useApp.getState().updateObject(probe.id, { description: e.target.value }, "Probe note")}
              />
            </div>
            <label className="row cursor-pointer">
              <input
                type="checkbox"
                checked={probe.plotVisible}
                onChange={(e) =>
                  useApp.getState().updateObject(probe.id, { plotVisible: e.target.checked }, "Probe plot visibility")
                }
              />
              <span>Plot in Grapher</span>
            </label>
            <div className="px-3 pt-2">
              <button className="btn danger" onClick={() => useApp.getState().deleteSelection()}>
                Delete probe
              </button>
            </div>
          </div>
        )}

        {instrument && (
          <div>
            <SectionTitle>Instrument</SectionTitle>
            <div className="field px-3">
              <span className="lbl">Reference</span>
              <input
                value={instrument.ref}
                onChange={(e) => useApp.getState().updateObject(instrument.id, { ref: e.target.value }, "Instrument ref")}
              />
            </div>
            <div className="field px-3">
              <span className="lbl">Kind</span>
              <span className="mono" style={{ fontSize: 11 }}>
                {instrument.kind}
              </span>
            </div>
            <div className="px-3 pt-2 flex gap-2">
              <button
                className="btn"
                onClick={() =>
                  useApp.getState().updateObject(
                    instrument.id,
                    { window: { ...instrument.window, open: !instrument.window.open } },
                    "Instrument window",
                  )
                }
              >
                {instrument.window.open ? "Hide window" : "Show window"}
              </button>
              <button className="btn danger" onClick={() => useApp.getState().deleteSelection()}>
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Bottom panel: problems / console / results / netlist / reports      */
/* ------------------------------------------------------------------ */
const BOTTOM_TABS = ["Problems", "Console", "Results", "Grapher", "Netlist", "BOM", "Reports"];

export function BottomPanel() {
  const project = useApp((s) => s.project);
  const graph = useApp((s) => s.graph);
  const log = useApp((s) => s.log);
  const results = useApp((s) => s.results);
  const simState = useApp((s) => s.simState);
  const setUi = useApp((s) => s.setUi);
  const tab = project.ui.bottomTab;
  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];

  const netlist = useMemo(() => buildNetlistText(sheet, graph), [sheet, graph]);

  return (
    <div className="flex flex-col rule-t" style={{ height: project.ui.bottomHeight, background: "var(--panel)" }}>
      <div className="flex items-center rule-b" style={{ flex: "none" }}>
        {BOTTOM_TABS.map((t) => (
          <button key={t} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setUi({ bottomTab: t })}>
            {t}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pr-2">
          <Badge kind={simState === "Running" ? "ok" : simState === "Error" ? "err" : "mute"}>{simState}</Badge>
          <button className="tbtn" title="Collapse panel" onClick={() => setUi({ showBottom: false })}>
            <Icon name="down" size={13} />
          </button>
        </div>
      </div>
      <div className={`flex-1 min-h-0 ${tab === "Grapher" ? "flex flex-col" : "scroll"}`}>
        {tab === "Grapher" && <Grapher />}
        {tab === "Problems" && (
          <div>
            {[...graph.errors, ...graph.warnings].map((d) => (
              <div
                key={d.id}
                className={`row ${d.severity === "error" ? "err" : "warn"}`}
                onClick={() => {
                  if (d.x !== undefined && d.y !== undefined) viewApi.zoomTo(d.x - 120, d.y - 90, 240, 180);
                }}
              >
                <Icon name={d.severity === "error" ? "error" : "warning"} size={13} />
                <span className="mono" style={{ width: 58, fontSize: 10.5, color: "var(--ink-3)" }}>
                  {d.code}
                </span>
                <span className="flex-1">{d.message}</span>
                <span className="hint">{d.hint}</span>
              </div>
            ))}
            {graph.errors.length === 0 && graph.warnings.length === 0 && (
              <div className="row">
                <Icon name="check" size={13} />
                <span>No electrical rule violations. The netlist is ready to simulate.</span>
              </div>
            )}
          </div>
        )}

        {tab === "Console" && (
          <div className="mono" style={{ fontSize: 11 }}>
            {log.map((l) => (
              <div key={l.id} className="row" style={{ alignItems: "baseline" }}>
                <span style={{ color: "var(--ink-3)", width: 66 }}>{l.time}</span>
                <span
                  style={{
                    width: 46,
                    color:
                      l.level === "error"
                        ? "var(--error)"
                        : l.level === "warn"
                          ? "var(--warn)"
                          : l.level === "ok"
                            ? "var(--ok)"
                            : "var(--ink-3)",
                  }}
                >
                  {l.level}
                </span>
                <span style={{ whiteSpace: "pre-wrap" }}>{l.text}</span>
              </div>
            ))}
            {log.length === 0 && <div className="hint px-3 py-2">Console output will appear here.</div>}
          </div>
        )}

        {tab === "Results" && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Time</th>
                <th>Analysis</th>
                <th>Sweep</th>
                <th className="num">Traces</th>
                <th className="num">Points</th>
                <th>Status</th>
                <th className="num">Solve time</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id} onClick={() => useApp.getState().setActiveRun(r.id)}>
                  <td>{new Date(r.createdAt).toLocaleTimeString("en-GB", { hour12: false })}</td>
                  <td>{r.label}</td>
                  <td>{r.sweepParam ?? "—"}</td>
                  <td className="num">{r.result.traces.length}</td>
                  <td className="num">{r.result.x.length}</td>
                  <td>
                    <Badge kind={r.status === "completed" ? "ok" : "err"}>{r.status}</Badge>
                  </td>
                  <td className="num">{r.result.solveMs.toFixed(1)} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {tab === "Netlist" && (
          <pre
            className="mono p-3"
            style={{ fontSize: 11, margin: 0, whiteSpace: "pre-wrap", color: "var(--ink-2)" }}
          >
            {netlist}
          </pre>
        )}

        {tab === "BOM" && (
          <table className="tbl">
            <thead>
              <tr>
                <th>Reference</th>
                <th>Part</th>
                <th>Value</th>
                <th>Footprint</th>
                <th>Manufacturer</th>
                <th>Part number</th>
              </tr>
            </thead>
            <tbody>
              {sheet.components.map((c) => {
                const def = getDef(c.defId);
                return (
                  <tr key={c.id}>
                    <td>{c.ref}</td>
                    <td>{def?.name ?? c.defId}</td>
                    <td>{def ? componentValue(def, c.props) : ""}</td>
                    <td>{c.props.footprint ?? "—"}</td>
                    <td>{c.props.manufacturer || "—"}</td>
                    <td>{c.props.partNumber || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === "Reports" && (
          <div className="p-3">
            <div className="sc">Design summary</div>
            <table className="tbl" style={{ maxWidth: 520, marginTop: 8 }}>
              <tbody>
                <tr>
                  <td>Components</td>
                  <td className="num">{sheet.components.length}</td>
                </tr>
                <tr>
                  <td>Wires</td>
                  <td className="num">{sheet.wires.length}</td>
                </tr>
                <tr>
                  <td>Nets</td>
                  <td className="num">{graph.nets.length}</td>
                </tr>
                <tr>
                  <td>Probes</td>
                  <td className="num">{sheet.probes.length}</td>
                </tr>
                <tr>
                  <td>Instruments</td>
                  <td className="num">{sheet.instruments.length}</td>
                </tr>
                <tr>
                  <td>Simulation runs</td>
                  <td className="num">{results.length}</td>
                </tr>
                <tr>
                  <td>Errors / warnings</td>
                  <td className="num">
                    {graph.errors.length} / {graph.warnings.length}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="sc pt-4">Last run</div>
            {results.length ? (
              <table className="tbl" style={{ maxWidth: 520, marginTop: 8 }}>
                <tbody>
                  <tr>
                    <td>Analysis</td>
                    <td className="num">{results[results.length - 1].label}</td>
                  </tr>
                  <tr>
                    <td>Points</td>
                    <td className="num">{results[results.length - 1].result.x.length}</td>
                  </tr>
                  <tr>
                    <td>Solver</td>
                    <td className="num">
                      {results[results.length - 1].result.converged ? "converged" : "not converged"}
                    </td>
                  </tr>
                  <tr>
                    <td>Solve time</td>
                    <td className="num">{fmt(results[results.length - 1].result.solveMs, "ms", 1)}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="hint">No simulation has been run yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function buildNetlistText(
  sheet: ReturnType<typeof useApp.getState>["project"]["sheets"][number],
  graph: ReturnType<typeof useApp.getState>["graph"],
): string {
  const lines: string[] = [`* CircuitBench netlist — sheet "${sheet.name}"`, `* generated ${new Date().toISOString()}`];
  const nodeOf = (compId: string, pinId: string) => {
    const netId = graph.pinToNet[`${compId}:${pinId}`];
    const net = netId ? graph.netById[netId] : undefined;
    return net ? (net.isGround ? "0" : net.name.replace(/\s+/g, "_")) : "NC";
  };
  for (const c of sheet.components) {
    const def = getDef(c.defId);
    if (!def) continue;
    const n = def.pins.map((p) => nodeOf(c.id, p.id));
    const v = componentValue(def, c.props);
    switch (c.defId) {
      case "resistor":
        lines.push(`R${c.ref} ${n[0]} ${n[1]} ${v}`);
        break;
      case "capacitor":
        lines.push(`C${c.ref} ${n[0]} ${n[1]} ${v}`);
        break;
      case "inductor":
        lines.push(`L${c.ref} ${n[0]} ${n[1]} ${v}`);
        break;
      case "vsource":
      case "vsine":
      case "vpulse":
      case "vpwl":
        lines.push(`V${c.ref} ${n[0]} ${n[1]} ${v || "0"}`);
        break;
      case "isource":
        lines.push(`I${c.ref} ${n[0]} ${n[1]} ${v || "0"}`);
        break;
      case "diode":
      case "zener":
      case "led":
        lines.push(`D${c.ref} ${n[0]} ${n[1]} ${c.props.model ?? "D1N4148"}`);
        break;
      case "npn":
      case "pnp":
        lines.push(`Q${c.ref} ${n[0]} ${n[1]} ${n[2]} ${c.props.model ?? "Q2N3904"}`);
        break;
      case "nmos":
      case "pmos":
        lines.push(`M${c.ref} ${n[0]} ${n[1]} ${n[2]} ${n[2]} ${c.props.model ?? "M2N7000"}`);
        break;
      case "opamp":
        lines.push(`E${c.ref} ${n[2]} 0 ${n[0]} ${n[1]} 1e6`);
        break;
      default:
        if (def.model === "simulated") lines.push(`* ${c.ref} (${def.name}) pins ${n.join(" ")}`);
        break;
    }
  }
  lines.push("", "* analysis");
  for (const a of useApp.getState().project.analyses.filter((x) => x.enabled)) {
    lines.push(`.${a.kind} ${Object.values(a.params).join(" ")}`);
  }
  lines.push(".end");
  return lines.join("\n");
}
