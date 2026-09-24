"use client";

import { useState } from "react";
import { Cpu, Gauge, Settings2, SlidersHorizontal, Waves } from "lucide-react";
import { PART_MAP, ParamDef, formatValue, parseValue } from "@/lib/library/catalog";
import { IntegrationMethod } from "@/lib/sim/engine";
import { engine, useEditor } from "@/state/editor";

function Field({ def, value, onChange }: { def: ParamDef; value: number | string | boolean; onChange: (v: number | string | boolean) => void }) {
  const [text, setText] = useState<string | null>(null);
  if (def.type === "bool") {
    return (
      <label className="flex items-center justify-between gap-2 py-1">
        <span className="text-[11.5px] text-dim">{def.label}</span>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--accent)]" />
      </label>
    );
  }
  if (def.type === "select") {
    return (
      <label className="block py-1">
        <span className="mb-1 block text-[11.5px] text-dim">{def.label}</span>
        <select className="input" value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {def.options?.map((o) => (
            <option key={String(o.value)} value={String(o.value)}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (def.min !== undefined && def.max !== undefined) {
    return (
      <label className="block py-1">
        <div className="mb-1 flex justify-between text-[11.5px]">
          <span className="text-dim">{def.label}</span>
          <span className="mono text-mute">{Number(value).toFixed(2)}</span>
        </div>
        <input
          type="range"
          className="w-full"
          min={def.min}
          max={def.max}
          step={def.step ?? 0.01}
          value={Number(value)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
    );
  }
  return (
    <label className="block py-1">
      <span className="mb-1 flex items-baseline justify-between text-[11.5px]">
        <span className="text-dim">{def.label}</span>
        {def.unit && <span className="mono text-[10px] text-mute">{def.unit}</span>}
      </span>
      <input
        className="input mono"
        value={text ?? (def.type === "number" ? formatValue(Number(value), "") : String(value))}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (text !== null) {
            onChange(def.type === "number" ? parseValue(text) : text);
            setText(null);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
      />
    </label>
  );
}

export default function Inspector() {
  const st = useEditor();
  const [tab, setTab] = useState<"props" | "net" | "sim">("props");
  const selected = st.doc.instances.find((i) => i.id === st.selection[0]);
  const part = selected ? PART_MAP[selected.partId] : undefined;
  const live = st.sim.running ? engine.lastState : null;

  const groups = new Map<string, ParamDef[]>();
  for (const p of part?.params ?? []) {
    const g = p.group ?? "Parameter";
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }

  return (
    <aside className="panel flex h-full w-[300px] shrink-0 flex-col" style={{ borderWidth: "0 0 0 1px" }}>
      <div className="flex items-center gap-1 px-2 pt-2">
        <button className="tab" data-active={tab === "props"} onClick={() => setTab("props")}>
          <span className="flex items-center gap-1.5">
            <Settings2 size={12} /> Eigenschaften
          </span>
        </button>
        <button className="tab" data-active={tab === "net"} onClick={() => setTab("net")}>
          <span className="flex items-center gap-1.5">
            <Waves size={12} /> Netze
          </span>
        </button>
        <button className="tab" data-active={tab === "sim"} onClick={() => setTab("sim")}>
          <span className="flex items-center gap-1.5">
            <Gauge size={12} /> Solver
          </span>
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {tab === "props" && (
          <>
            {!selected || !part ? (
              <div className="pt-10 text-center text-[12px] text-mute">
                <SlidersHorizontal size={22} className="mx-auto mb-2 opacity-50" />
                Kein Bauteil ausgewählt.
                <div className="mt-1 text-[11px]">Wähle ein Element im Schaltplan aus, um Parameter, SPICE-Modell und Messwerte zu sehen.</div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg p-2.5" style={{ background: "var(--panel-2)" }}>
                  <div className="flex items-center justify-between">
                    <input
                      className="input mono w-24 py-0.5 text-[12px] font-semibold"
                      value={selected.label}
                      onChange={(e) => st.setParam(selected.id, "__label", e.target.value)}
                    />
                    <span className="rounded px-1.5 py-0.5 text-[9.5px] mono" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent-2)" }}>
                      {part.mount}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[12px] font-medium">{part.name}</div>
                  <div className="text-[10.5px] text-mute">{part.category}</div>
                  {part.footprint && <div className="mono mt-1 text-[10px] text-mute">Footprint: {part.footprint}</div>}
                </div>

                {live && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {part.pins.map((pin, idx) => {
                      const net = st.netResult.pinNets[`${selected.id}:${idx}`];
                      return (
                        <div key={idx} className="rounded-md px-2 py-1" style={{ background: "var(--panel-2)" }}>
                          <div className="text-[9.5px] text-mute">
                            {pin.name} → {net}
                          </div>
                          <div className="mono text-[11.5px]" style={{ color: "var(--accent-2)" }}>
                            {formatValue(live.nets[net] ?? 0, "V")}
                          </div>
                        </div>
                      );
                    })}
                    <div className="col-span-2 rounded-md px-2 py-1" style={{ background: "var(--panel-2)" }}>
                      <div className="text-[9.5px] text-mute">Strom / Leistung</div>
                      <div className="mono text-[11.5px]" style={{ color: "var(--ok)" }}>
                        {formatValue(live.currents[selected.label] ?? 0, "A")} · {formatValue(Math.abs(live.power[selected.label] ?? 0), "W")}
                      </div>
                    </div>
                  </div>
                )}

                {[...groups.entries()].map(([group, defs]) => (
                  <div key={group}>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-mute">{group}</div>
                    {defs.map((def) => (
                      <Field
                        key={def.key}
                        def={def}
                        value={selected.params[def.key] ?? def.def}
                        onChange={(v) => st.setParam(selected.id, def.key, v)}
                      />
                    ))}
                  </div>
                ))}

                {part.interactive === "mcu" && (
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-mute">
                      <Cpu size={11} /> Firmware (Arduino-C Subset)
                    </div>
                    <textarea
                      className="input mono h-56 resize-y text-[11px] leading-[1.45]"
                      value={selected.text ?? ""}
                      onChange={(e) => st.setInstanceText(selected.id, e.target.value)}
                      spellCheck={false}
                    />
                    <div className="mt-1 text-[10px] text-mute">
                      Unterstützt: setup/loop, pinMode, digitalRead/Write, analogRead/Write, delay, if/for/while, Variablen, eigene Funktionen.
                    </div>
                  </div>
                )}

                {part.spice && (
                  <div>
                    <div className="mb-1 text-[10px] uppercase tracking-wide text-mute">SPICE-Modellkarte</div>
                    <pre className="mono overflow-x-auto rounded-lg p-2 text-[10px] leading-relaxed" style={{ background: "var(--panel-2)", color: "var(--text-dim)" }}>
                      {part.spice}
                    </pre>
                  </div>
                )}

                <div className="flex gap-1.5 pt-1">
                  <button className="btn flex-1" onClick={() => st.rotateSelection(1)}>
                    Drehen (R)
                  </button>
                  <button className="btn flex-1" onClick={() => st.mirrorSelection()}>
                    Spiegeln (M)
                  </button>
                  <button className="btn btn-danger" onClick={() => st.deleteSelection()}>
                    Löschen
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === "net" && (
          <div className="space-y-1">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-mute">Knoten-Inspektor</div>
            {st.netResult.nets.map((n) => {
              const v = live?.nets[n.name];
              const probed = st.probes.includes(n.name);
              return (
                <button
                  key={n.name}
                  onClick={() => st.toggleProbe(n.name)}
                  className="tree-row flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                  style={probed ? { background: "color-mix(in srgb, var(--accent-3) 18%, transparent)" } : undefined}
                >
                  <span className="mono w-12 shrink-0 text-[11px]" style={{ color: n.name === "0" ? "var(--text-mute)" : "var(--accent-2)" }}>
                    {n.name}
                  </span>
                  <span className="mono flex-1 text-right text-[11px]">{v !== undefined ? formatValue(v, "V") : "—"}</span>
                  <span className="w-12 text-right text-[10px] text-mute">{n.pins.length} Pins</span>
                </button>
              );
            })}
            {!!st.netResult.warnings.length && (
              <div className="mt-2 rounded-lg p-2 text-[11px]" style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)", color: "var(--warn)" }}>
                {st.netResult.warnings.map((w, i) => (
                  <div key={i}>⚠ {w}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "sim" && (
          <div className="space-y-3">
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wide text-mute">Integrationsverfahren</div>
              <select
                className="input"
                value={st.sim.method}
                onChange={(e) => st.setSimOption("method", e.target.value as IntegrationMethod)}
              >
                <option value="trap">Trapez (2. Ordnung, Standard)</option>
                <option value="euler">Rückwärts-Euler (robust)</option>
                <option value="gear2">Gear/BDF 2</option>
                <option value="gear3">Gear/BDF 3</option>
                <option value="gear4">Gear/BDF 4</option>
                <option value="gear5">Gear/BDF 5</option>
                <option value="gear6">Gear/BDF 6</option>
              </select>
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[11.5px]">
                <span className="text-dim">Abtastrate (Solver)</span>
                <span className="mono text-mute">{(st.sim.sampleRate / 1000).toFixed(0)} kS/s</span>
              </div>
              <input
                type="range"
                className="w-full"
                min={4}
                max={6.7}
                step={0.05}
                value={Math.log10(st.sim.sampleRate)}
                onChange={(e) => st.setSimOption("sampleRate", Math.round(Math.pow(10, Number(e.target.value))))}
              />
            </div>
            <div>
              <div className="mb-1 flex justify-between text-[11.5px]">
                <span className="text-dim">Temperatur</span>
                <span className="mono text-mute">{st.sim.temperature.toFixed(0)} °C</span>
              </div>
              <input
                type="range"
                className="w-full"
                min={-55}
                max={150}
                step={1}
                value={st.sim.temperature}
                onChange={(e) => st.setSimOption("temperature", Number(e.target.value))}
              />
            </div>
            <div className="rounded-lg p-2.5 text-[11px] mono" style={{ background: "var(--panel-2)" }}>
              <Row k="Bauteile (SPICE)" v={String(st.netResult.netlist.devices.length)} />
              <Row k="Matrixgröße" v={engine.sim ? `${engine.sim.size}×${engine.sim.size}` : "—"} />
              <Row k="Simulationszeit" v={live ? formatValue(live.time, "s") : "0 s"} />
              <Row k="Echtzeitfaktor" v={live ? `${live.realtimeFactor.toExponential(2)}` : "—"} />
              <Row k="Schritte/s" v={live ? live.stepsPerSecond.toFixed(0) : "—"} />
              <Row k="Render" v={`${st.sim.fps.toFixed(0)} FPS`} />
            </div>
            <div className="flex gap-1.5">
              <label className="flex flex-1 items-center gap-1.5 text-[11.5px] text-dim">
                <input type="checkbox" checked={st.showGrid} onChange={() => useEditor.setState({ showGrid: !st.showGrid })} className="accent-[var(--accent)]" />
                Raster
              </label>
              <label className="flex flex-1 items-center gap-1.5 text-[11.5px] text-dim">
                <input type="checkbox" checked={st.snap} onChange={() => useEditor.setState({ snap: !st.snap })} className="accent-[var(--accent)]" />
                Snap
              </label>
              <label className="flex flex-1 items-center gap-1.5 text-[11.5px] text-dim">
                <input type="checkbox" checked={st.autoRoute} onChange={() => useEditor.setState({ autoRoute: !st.autoRoute })} className="accent-[var(--accent)]" />
                A*-Routing
              </label>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-mute">{k}</span>
      <span>{v}</span>
    </div>
  );
}
