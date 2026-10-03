"use client";

import { useState } from "react";
import { probeHexColor } from "@/lib/probe-style";
import { Cpu, Gauge, Settings2, SlidersHorizontal, Waves, Radio, Zap, Activity, GitBranch } from "lucide-react";
import { PART_MAP, ParamDef, formatValue, parseValue } from "@/lib/library/catalog";
import { IntegrationMethod } from "@/lib/sim/engine";
import { engine, useEditor } from "@/state/editor";
import { ProbeKind } from "@/lib/schematic/model";

function Field({ def, value, onChange }: { def: ParamDef; value: number | string | boolean; onChange: (v: number | string | boolean) => void }) {
  const [text, setText] = useState<string | null>(null);
  if (def.type === "bool") {
    return (
      <label className="flex items-center justify-between gap-2 py-1">
        <span className="text-2xs text-ink-2">{def.label}</span>
        <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="h-3.5 w-3.5 accent-accent" />
      </label>
    );
  }
  if (def.type === "select") {
    return (
      <label className="block py-1">
        <span className="mb-1 block text-2xs text-ink-2">{def.label}</span>
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
        <div className="mb-1 flex justify-between text-2xs">
          <span className="text-ink-2">{def.label}</span>
          <span className="mono text-ink-3">{Number(value).toFixed(2)}</span>
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
      <span className="mb-1 flex items-baseline justify-between text-2xs">
        <span className="text-ink-2">{def.label}</span>
        {def.unit && <span className="mono text-2xs text-ink-3">{def.unit}</span>}
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
  const selectedId = st.selection[0];
  const selected = st.doc.instances.find((i) => i.id === selectedId);
  const selectedProbe = st.doc.probes.find((p) => p.id === selectedId);
  const part = selected ? PART_MAP[selected.partId] : undefined;
  const live = st.sim.running ? engine.lastState : null;

  const groups = new Map<string, ParamDef[]>();
  for (const p of part?.params ?? []) {
    const g = p.group ?? "Parameter";
    groups.set(g, [...(groups.get(g) ?? []), p]);
  }

  return (
    <aside className="flex h-full w-full shrink-0 flex-col" style={{ background: "transparent" }}>
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
            {selectedProbe ? (
              <div className="space-y-3">
                <div className="rounded-lg p-2.5 bg-surface-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold">
                      <Radio size={14} style={{ color: selectedProbe.color }} /> Messpunkt
                    </div>
                    <span className="rounded px-1.5 py-0.5 text-2xs mono" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--teal)" }}>
                      {selectedProbe.kind}
                    </span>
                  </div>
                  <div className="mt-2">
                    <label className="block">
                      <span className="mb-1 block text-2xs text-ink-2">Name</span>
                      <input className="input mono text-xs" value={selectedProbe.name ?? ""} placeholder={`${selectedProbe.kind.toUpperCase()}1`} onChange={(e)=> st.updateMeasurementProbe(selectedProbe.id,{name:e.target.value})} />
                    </label>
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Typ & Darstellung</div>
                  <div className="space-y-2 rounded-lg p-2.5 bg-surface-2">
                    <label className="block">
                      <span className="mb-1 block text-2xs text-ink-2">Typ</span>
                      <select className="input" value={selectedProbe.kind} onChange={(e)=> st.updateMeasurementProbe(selectedProbe.id,{kind:e.target.value as ProbeKind})}>
                        <option value="voltage">Voltage – V gegen GND/REF</option>
                        <option value="current">Current – A mit Richtung</option>
                        <option value="voltage_current">Voltage + Current</option>
                        <option value="power">Power – V·I (W)</option>
                        <option value="diff">Differential – V+ - Vref</option>
                        <option value="ref">Reference – REF für andere Probes</option>
                        <option value="digital">Digital – 1/0/X mit Schwellen</option>
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-2xs text-ink-2">Farbe</span>
                        <input type="color" className="h-8 w-full rounded cursor-pointer" value={probeHexColor(selectedProbe.kind, selectedProbe.color)} onChange={(e)=> st.updateMeasurementProbe(selectedProbe.id,{color:e.target.value})} />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-2xs text-ink-2">Netz (auto)</span>
                        <select className="input" value={selectedProbe.net ?? ""} onChange={(e)=> st.updateMeasurementProbe(selectedProbe.id,{net:e.target.value||undefined})}>
                          <option value="">— auto nearest —</option>
                          {st.netResult.nets.map(n=> <option key={n.name} value={n.name}>{n.name} ({n.pins.length} pins)</option>)}
                        </select>
                      </label>
                    </div>

                    <label className="flex items-center justify-between gap-2 py-1">
                      <span className="text-2xs text-ink-2">Richtung umkehren (Current)</span>
                      <input type="checkbox" checked={!!selectedProbe.direction} onChange={(e)=> st.updateMeasurementProbe(selectedProbe.id,{direction:e.target.checked?1:0})} className="h-3.5 w-3.5 accent-accent" />
                    </label>

                    <div>
                      <div className="mb-1 flex justify-between text-2xs">
                        <span className="text-ink-2">Rotation</span>
                        <span className="mono text-ink-3">{selectedProbe.rotation ?? 0}°</span>
                      </div>
                      <input type="range" min={-180} max={180} step={15} value={selectedProbe.rotation ?? 0} onChange={(e)=> st.updateMeasurementProbe(selectedProbe.id,{rotation:Number(e.target.value)})} className="w-full" />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Referenzpotential</div>
                  <div className="rounded-lg p-2.5 space-y-2 bg-surface-2">
                    <label className="block">
                      <span className="mb-1 block text-2xs text-ink-2">Bezugspunkt</span>
                      <select className="input" value={selectedProbe.ref ?? "0"} onChange={(e)=> st.updateMeasurementProbe(selectedProbe.id,{ref:e.target.value})}>
                        <option value="0">GND (0)</option>
                        {st.doc.probes.filter(p=>p.kind==="ref").map(p=> <option key={p.id} value={p.id}>REF Probe: {p.name ?? p.id.slice(0,6)} – {p.net ?? "auto"} ({p.x},{p.y})</option>)}
                        {st.netResult.nets.filter(n=>n.name!=="0").map(n=> <option key={n.name} value={n.name}>Net: {n.name}</option>)}
                      </select>
                    </label>
                    <div className="text-2xs text-ink-3 leading-snug">
                      Spannungsmessung erfolgt gegen Masse (GND) oder die gewählte Referenzsonde (ΔU = U_Messpunkt − U_Ref).
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Messwerte Anzeige</div>
                  <div className="rounded-lg p-2.5 space-y-2 bg-surface-2">
                    <label className="flex items-center justify-between gap-2 py-1">
                      <span className="text-2xs text-ink-2 flex items-center gap-1.5"><Activity size={12}/> Periodic (RMS/Peak/Freq)</span>
                      <input type="checkbox" checked={!!selectedProbe.periodic} onChange={(e)=> st.updateMeasurementProbe(selectedProbe.id,{periodic:e.target.checked})} className="h-3.5 w-3.5 accent-accent" />
                    </label>

                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        ["vdc","Vdc"],
                        ["vrms","Vrms"],
                        ["vpp","Vpp"],
                        ["vavg","Vavg"],
                        ["freq","Freq"],
                        ["idc","Idc"],
                        ["irms","Irms"],
                        ["ipp","Ipp"],
                        ["power","Power W"],
                      ].map(([k,label])=> (
                        <label key={k} className="flex items-center gap-1.5 text-2xs">
                          <input type="checkbox" checked={!!(selectedProbe.show as any)?.[k]} onChange={(e)=> {
                            const cur = selectedProbe.show ?? {} as any;
                            st.updateMeasurementProbe(selectedProbe.id,{show:{...cur,[k]:e.target.checked}});
                          }} className="h-3 w-3 accent-accent" />
                          <span className="text-ink-2">{label}</span>
                        </label>
                      ))}
                    </div>

                    {selectedProbe.kind==="digital" && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t border-hairline">
                        <label className="block">
                          <span className="mb-1 block text-2xs text-ink-2">Low Threshold</span>
                          <input type="number" step={0.1} className="input mono" value={selectedProbe.thresholds?.low ?? 0.8} onChange={(e)=> st.updateMeasurementProbe(selectedProbe.id,{thresholds:{low:Number(e.target.value), high:selectedProbe.thresholds?.high ?? 2.0}})} />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-2xs text-ink-2">High Threshold</span>
                          <input type="number" step={0.1} className="input mono" value={selectedProbe.thresholds?.high ?? 2.0} onChange={(e)=> st.updateMeasurementProbe(selectedProbe.id,{thresholds:{low:selectedProbe.thresholds?.low ?? 0.8, high:Number(e.target.value)}})} />
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                {live && (
                  <div className="rounded-lg p-2.5 mono text-2xs bg-surface-2">
                    <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Live Messwerte</div>
                    <div className="space-y-0.5">
                      <Row k="Net" v={selectedProbe.net ?? "—"} />
                      <Row k="V" v={formatValue(live.nets[selectedProbe.net ?? ""] ?? 0,"V")} />
                      <Row k="I (net)" v={formatValue((engine as any).lastState ? 0 : 0,"A")} />
                      <Row k="REF" v={selectedProbe.ref ?? "GND"} />
                    </div>
                  </div>
                )}

                <div className="flex gap-1.5 pt-1">
                  <button className="btn btn-danger flex-1" onClick={()=> st.removeMeasurementProbe(selectedProbe.id)}>Probe löschen</button>
                </div>
              </div>
            ) : !selected || !part ? (
              <div className="pt-10 text-center text-xs text-ink-3">
                <SlidersHorizontal size={22} className="mx-auto mb-2 opacity-50" />
                Kein Bauteil ausgewählt.
                <div className="mt-1 text-2xs">Wähle ein Element im Schaltplan aus, um Parameter, SPICE-Modell und Messwerte zu sehen. Probes via Toolbar oder Rechtsklick → Probe hinzufügen.</div>
                <div className="mt-3 flex justify-center gap-2">
                  <button className="btn text-2xs" onClick={()=> { const s=useEditor.getState(); const id=s.addMeasurementProbe("voltage",200,200); if(id) s.setSelection([id]); }}>+ V Probe</button>
                  <button className="btn text-2xs" onClick={()=> { const s=useEditor.getState(); const id=s.addMeasurementProbe("current",240,200); if(id) s.setSelection([id]); }}>+ A Probe</button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg p-2.5 bg-surface-2">
                  <div className="flex items-center justify-between">
                    <input
                      className="input mono w-24 py-0.5 text-xs font-semibold"
                      value={selected.label}
                      onChange={(e) => st.setParam(selected.id, "__label", e.target.value)}
                    />
                    <span className="rounded px-1.5 py-0.5 text-2xs mono" style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--teal)" }}>
                      {part.mount}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs font-medium">{part.name}</div>
                  <div className="text-2xs text-ink-3">{part.category}</div>
                  {part.footprint && <div className="mono mt-1 text-2xs text-ink-3">Footprint: {part.footprint}</div>}
                </div>

                {live && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {part.pins.map((pin, idx) => {
                      const net = st.netResult.pinNets[`${selected.id}:${idx}`];
                      return (
                        <div key={idx} className="rounded-md px-2 py-1 bg-surface-2">
                          <div className="text-2xs text-ink-3">
                            {pin.name} → {net}
                          </div>
                          <div className="mono text-2xs text-teal">
                            {formatValue(live.nets[net] ?? 0, "V")}
                          </div>
                        </div>
                      );
                    })}
                    <div className="col-span-2 rounded-md px-2 py-1 bg-surface-2">
                      <div className="text-2xs text-ink-3">Strom / Leistung</div>
                      <div className="mono text-2xs text-ok">
                        {formatValue(live.currents[selected.label] ?? 0, "A")} · {formatValue(Math.abs(live.power[selected.label] ?? 0), "W")}
                      </div>
                    </div>
                  </div>
                )}

                {[...groups.entries()].map(([group, defs]) => (
                  <div key={group}>
                    <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">{group}</div>
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
                    <div className="mb-1 flex items-center gap-1.5 text-2xs uppercase tracking-wide text-ink-3">
                      <Cpu size={11} /> Firmware (Arduino-C Subset)
                    </div>
                    <textarea
                      className="input mono h-56 resize-y text-2xs leading-[1.45]"
                      value={selected.text ?? ""}
                      onChange={(e) => st.setInstanceText(selected.id, e.target.value)}
                      spellCheck={false}
                    />
                    <div className="mt-1 text-2xs text-ink-3">
                      Unterstützt: setup/loop, pinMode, digitalRead/Write, analogRead/Write, delay, if/for/while, Variablen, eigene Funktionen.
                    </div>
                  </div>
                )}

                {part.spice && (
                  <div>
                    <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">SPICE-Modellkarte</div>
                    <pre className="mono overflow-x-auto rounded-lg p-2 text-2xs leading-relaxed bg-surface-2 text-ink-2">
                      {part.spice}
                    </pre>
                  </div>
                )}

                {part.tags?.includes("custom") && (
                  <button
                    type="button"
                    className="btn w-full gap-1.5"
                    style={{
                      borderColor: "var(--wire-sel, #f59e0b)",
                      color: "var(--wire-sel, #f59e0b)",
                    }}
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent("multispice-open-part-studio", {
                          detail: { partId: selected.partId },
                        }),
                      );
                    }}
                  >
                    <Cpu size={13} />
                    <span>Im Bauteil-Studio bearbeiten (Innenschaltung & Symbol)</span>
                  </button>
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
            <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Knoten-Inspektor & Probes</div>
            <div className="mb-2 rounded-lg p-2 text-2xs bg-surface-2">
              <div className="flex items-center gap-1.5 mb-1 font-medium"><Radio size={12}/> Measurement Probes ({st.doc.probes.length})</div>
              {st.doc.probes.map(p=> (
                <button key={p.id} onClick={()=> st.setSelection([p.id])} className="tree-row flex w-full items-center gap-2 rounded-md px-2 py-1 text-left" style={st.selection.includes(p.id)?{background:"color-mix(in srgb, var(--accent) 18%, transparent)"}:undefined}>
                  <span className="w-2 h-2 rounded-full" style={{background:p.color}}></span>
                  <span className="mono text-2xs flex-1">{p.name ?? `${p.kind.toUpperCase()}`}</span>
                  <span className="text-2xs text-ink-3">{p.net ?? "auto"}</span>
                  <span className="text-2xs text-ink-3">{p.kind}</span>
                </button>
              ))}
              <div className="mt-2 flex gap-1">
                {(["voltage","current","ref"] as ProbeKind[]).map(k=> <button key={k} className="btn flex-1 text-2xs py-1" onClick={()=> { const id=st.addMeasurementProbe(k,200+Math.random()*200,200); if(id) st.setSelection([id]); }}>+ {k}</button>)}
              </div>
            </div>

            {st.netResult.nets.map((n) => {
              const v = live?.nets[n.name];
              const probed = st.probes.includes(n.name);
              return (
                <button
                  key={n.name}
                  onClick={() => st.toggleProbe(n.name)}
                  className="tree-row flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left"
                  style={probed ? { background: "color-mix(in srgb, var(--violet) 18%, transparent)" } : undefined}
                >
                  <span className="mono w-12 shrink-0 text-2xs" style={{ color: n.name === "0" ? "var(--ink-3)" : "var(--teal)" }}>
                    {n.name}
                  </span>
                  <span className="mono flex-1 text-right text-2xs">{v !== undefined ? formatValue(v, "V") : "—"}</span>
                  <span className="w-12 text-right text-2xs text-ink-3">{n.pins.length} Pins</span>
                </button>
              );
            })}
            {!!st.netResult.warnings.length && (
              <div className="mt-2 rounded-lg p-2 text-2xs" style={{ background: "color-mix(in srgb, var(--warn) 14%, transparent)", color: "var(--warn)" }}>
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
              <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Integrationsverfahren</div>
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
              <div className="mb-1 flex justify-between text-2xs">
                <span className="text-ink-2">Abtastrate (Solver)</span>
                <span className="mono text-ink-3">{(st.sim.sampleRate / 1000).toFixed(0)} kS/s</span>
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
              <div className="mb-1 flex justify-between text-2xs">
                <span className="text-ink-2">Temperatur</span>
                <span className="mono text-ink-3">{st.sim.temperature.toFixed(0)} °C</span>
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
            <div className="rounded-lg p-2.5 text-2xs mono bg-surface-2">
              <Row k="Bauteile (SPICE)" v={String(st.netResult.netlist.devices.length)} />
              <Row k="Matrixgröße" v={engine.sim ? `${engine.sim.size}×${engine.sim.size}` : "—"} />
              <Row k="Simulationszeit" v={live ? formatValue(live.time, "s") : "0 s"} />
              <Row k="Echtzeitfaktor" v={live ? `${live.realtimeFactor.toExponential(2)}` : "—"} />
              <Row k="Schritte/s" v={live ? live.stepsPerSecond.toFixed(0) : "—"} />
            </div>

            <div className="rounded-lg p-2.5 bg-surface-2">
              <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3 flex items-center gap-1"><GitBranch size={11}/> Probe Settings (Global)</div>
              <div className="text-2xs text-ink-3">Alle Probes werden automatisch zu Transient/AC Grapher Output hinzugefügt. Konfiguration pro Probe in Eigenschaften-Tab.</div>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <div className="rounded px-2 py-1 text-2xs mono bg-surface">V Probes: {st.doc.probes.filter(p=>p.kind==="voltage"||p.kind==="voltage_current").length}</div>
                <div className="rounded px-2 py-1 text-2xs mono bg-surface">I Probes: {st.doc.probes.filter(p=>p.kind==="current"||p.kind==="voltage_current").length}</div>
                <div className="rounded px-2 py-1 text-2xs mono bg-surface">REF: {st.doc.probes.filter(p=>p.kind==="ref").length}</div>
                <div className="rounded px-2 py-1 text-2xs mono bg-surface">Digital: {st.doc.probes.filter(p=>p.kind==="digital").length}</div>
              </div>
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
      <span className="text-ink-3">{k}</span>
      <span>{v}</span>
    </div>
  );
}
