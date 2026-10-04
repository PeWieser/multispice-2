"use client";

import { useState } from "react";
import { probeHexColor } from "@/lib/probe-style";
import { Cpu, Gauge, Settings2, SlidersHorizontal, Waves, Radio, Zap, GitBranch, Lock } from "lucide-react";
import { PART_MAP, ParamDef, partPins } from "@/lib/library/catalog";
import { formatValue } from "@/lib/format";
import { Button } from "./ui/Button";
import { Checkbox, NumberField, SelectField, SliderField, TextField } from "./ui/Field";
import { IntegrationMethod } from "@/lib/sim/engine";
import { engine, useEditor } from "@/state/editor";
import { ProbeKind } from "@/lib/schematic/model";

/** S5.2: ParamDef-Dispatcher auf die ui/-Primitives (ersetzt das lokale Field). */
function ParamField({ def, value, onChange }: { def: ParamDef; value: number | string | boolean; onChange: (v: number | string | boolean) => void }) {
  if (def.type === "bool") {
    return <Checkbox label={def.label} checked={!!value} onChange={onChange} />;
  }
  if (def.type === "select") {
    return (
      <SelectField
        label={def.label}
        value={String(value)}
        options={(def.options ?? []).map((o) => ({ value: String(o.value), label: o.label }))}
        onChange={onChange}
      />
    );
  }
  if (def.min !== undefined && def.max !== undefined) {
    return (
      <SliderField
        label={def.label}
        value={Number(value)}
        display={Number(value).toFixed(2)}
        min={def.min}
        max={def.max}
        step={def.step ?? 0.01}
        onChange={onChange}
      />
    );
  }
  if (def.type === "number") {
    return <NumberField label={def.label} value={Number(value)} unit={def.unit} onChange={onChange} />;
  }
  return <TextField label={def.label} value={String(value)} onChange={onChange} />;
}

/** S5.6d: Sperr-Hinweis statt Werten/Fehlerbildern/Edits. */
function LockNote() {
  return (
    <div className="rounded-lg p-3 text-center text-xs text-ink-3 bg-surface-2">
      <Lock size={16} className="mx-auto mb-1.5 opacity-60" />
      Lehrer-Modus: Plan gesperrt.
      <div className="mt-0.5 text-2xs">Werte und Fehlerbilder sind versteckt — Messen bleibt erlaubt.</div>
    </div>
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
              st.teacher.locked ? <LockNote /> : (
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
                    <TextField label="Name" mono value={selectedProbe.name ?? ""} placeholder={`${selectedProbe.kind.toUpperCase()}1`} onChange={(name)=> st.updateMeasurementProbe(selectedProbe.id,{name})} />
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Typ & Darstellung</div>
                  <div className="space-y-2 rounded-lg p-2.5 bg-surface-2">
                    <SelectField label="Typ" value={selectedProbe.kind} onChange={(kind)=> st.updateMeasurementProbe(selectedProbe.id,{kind:kind as ProbeKind})} options={[
                      { value: "voltage", label: "Voltage – V gegen GND/REF" },
                      { value: "current", label: "Current – A mit Richtung" },
                      { value: "voltage_current", label: "Voltage + Current" },
                      { value: "power", label: "Power – V·I (W)" },
                      { value: "diff", label: "Differential – V+ - Vref" },
                      { value: "ref", label: "Reference – REF für andere Probes" },
                      { value: "digital", label: "Digital – 1/0/X mit Schwellen" },
                    ]} />

                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="mb-1 block text-2xs text-ink-2">Farbe</span>
                        <input type="color" className="h-8 w-full rounded cursor-pointer" value={probeHexColor(selectedProbe.kind, selectedProbe.color)} onChange={(e)=> st.updateMeasurementProbe(selectedProbe.id,{color:e.target.value})} />
                      </label>
                      <SelectField label="Netz (auto)" value={selectedProbe.net ?? ""} onChange={(net)=> st.updateMeasurementProbe(selectedProbe.id,{net:net||undefined})} options={[
                      { value: "", label: "— auto nearest —" },
                      ...st.netResult.nets.map(n=> ({ value: n.name, label: `${n.name} (${n.pins.length} pins)` })),
                    ]} />
                    </div>

                    <Checkbox label="Richtung umkehren (Current)" checked={!!selectedProbe.direction} onChange={(v)=> st.updateMeasurementProbe(selectedProbe.id,{direction:v?1:0})} />

                    <SliderField label="Rotation" value={selectedProbe.rotation ?? 0} display={`${selectedProbe.rotation ?? 0}°`} min={-180} max={180} step={15} onChange={(rotation)=> st.updateMeasurementProbe(selectedProbe.id,{rotation})} />
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Referenzpotential</div>
                  <div className="rounded-lg p-2.5 space-y-2 bg-surface-2">
                    <SelectField label="Bezugspunkt" value={selectedProbe.ref ?? "0"} onChange={(ref)=> st.updateMeasurementProbe(selectedProbe.id,{ref})} options={[
                      { value: "0", label: "GND (0)" },
                      ...st.doc.probes.filter(p=>p.kind==="ref").map(p=> ({ value: p.id, label: `REF Probe: ${p.name ?? p.id.slice(0,6)} – ${p.net ?? "auto"} (${p.x},${p.y})` })),
                      ...st.netResult.nets.filter(n=>n.name!=="0").map(n=> ({ value: n.name, label: `Net: ${n.name}` })),
                    ]} />
                    <div className="text-2xs text-ink-3 leading-snug">
                      Spannungsmessung erfolgt gegen Masse (GND) oder die gewählte Referenzsonde (ΔU = U_Messpunkt − U_Ref).
                    </div>
                  </div>
                </div>

                <div>
                  <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">Messwerte Anzeige</div>
                  <div className="rounded-lg p-2.5 space-y-2 bg-surface-2">
                    <Checkbox label="Periodic (RMS/Peak/Freq)" checked={!!selectedProbe.periodic} onChange={(periodic)=> st.updateMeasurementProbe(selectedProbe.id,{periodic})} />

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
                        <NumberField label="Low Threshold" unit="V" value={selectedProbe.thresholds?.low ?? 0.8} onChange={(low)=> st.updateMeasurementProbe(selectedProbe.id,{thresholds:{low, high:selectedProbe.thresholds?.high ?? 2.0}})} />
                        <NumberField label="High Threshold" unit="V" value={selectedProbe.thresholds?.high ?? 2.0} onChange={(high)=> st.updateMeasurementProbe(selectedProbe.id,{thresholds:{low:selectedProbe.thresholds?.low ?? 0.8, high}})} />
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
                  <Button variant="danger" className="flex-1" onClick={()=> st.removeMeasurementProbe(selectedProbe.id)}>Probe löschen</Button>
                </div>
              </div>
              )
            ) : !selected || !part ? (
              <div className="pt-10 text-center text-xs text-ink-3">
                <SlidersHorizontal size={22} className="mx-auto mb-2 opacity-50" />
                Kein Bauteil ausgewählt.
                <div className="mt-1 text-2xs">Wähle ein Element im Schaltplan aus, um Parameter, SPICE-Modell und Messwerte zu sehen. Probes via Toolbar oder Rechtsklick → Probe hinzufügen.</div>
                {!st.teacher.locked && (
                <div className="mt-3 flex justify-center gap-2">
                  <Button size="sm" onClick={()=> { const s=useEditor.getState(); const id=s.addMeasurementProbe("voltage",200,200); if(id) s.setSelection([id]); }}>+ V Probe</Button>
                  <Button size="sm" onClick={()=> { const s=useEditor.getState(); const id=s.addMeasurementProbe("current",240,200); if(id) s.setSelection([id]); }}>+ A Probe</Button>
                </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg p-2.5 bg-surface-2">
                  <div className="flex items-center justify-between">
                    <input
                      className="input mono w-24 py-0.5 text-xs font-semibold"
                      disabled={st.teacher.locked}
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
                    {partPins(part, selected.params).map((pin, idx) => {
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

                {st.teacher.locked ? <LockNote /> : [...groups.entries()].map(([group, defs]) => (
                  <div key={group}>
                    <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">{group}</div>
                    {defs.map((def) => (
                      <ParamField
                        key={def.key}
                        def={def}
                        value={selected.params[def.key] ?? def.def}
                        onChange={(v) => st.setParam(selected.id, def.key, v)}
                      />
                    ))}
                  </div>
                ))}

                {!st.teacher.locked && part.interactive === "mcu" && (
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

                {!st.teacher.locked && part.spice && (
                  <div>
                    <div className="mb-1 text-2xs uppercase tracking-wide text-ink-3">SPICE-Modellkarte</div>
                    <pre className="mono overflow-x-auto rounded-lg p-2 text-2xs leading-relaxed bg-surface-2 text-ink-2">
                      {part.spice}
                    </pre>
                  </div>
                )}

                {!st.teacher.locked && part.tags?.includes("custom") && (
                  <Button
                    variant="ghost"
                    className="w-full"
                    style={{
                      borderColor: "var(--wire-sel)",
                      color: "var(--wire-sel)",
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
                  </Button>
                )}

                {!st.teacher.locked && (
                <div className="flex gap-1.5 pt-1">
                  <Button className="flex-1" size="sm" onClick={() => st.rotateSelection(1)}>
                    Drehen (R)
                  </Button>
                  <Button className="flex-1" size="sm" onClick={() => st.mirrorSelection()}>
                    Spiegeln (M)
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => st.deleteSelection()}>
                    Löschen
                  </Button>
                </div>
                )}
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
                {(["voltage","current","ref"] as ProbeKind[]).map(k=> <Button key={k} size="sm" className="flex-1" onClick={()=> { const id=st.addMeasurementProbe(k,200+Math.random()*200,200); if(id) st.setSelection([id]); }}>+ {k}</Button>)}
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
            <SelectField label="Integrationsverfahren" value={st.sim.method} onChange={(method) => st.setSimOption("method", method as IntegrationMethod)} options={[
              { value: "trap", label: "Trapez (2. Ordnung, Standard)" },
              { value: "euler", label: "Rückwärts-Euler (robust)" },
              { value: "gear2", label: "Gear/BDF 2" },
              { value: "gear3", label: "Gear/BDF 3" },
              { value: "gear4", label: "Gear/BDF 4" },
              { value: "gear5", label: "Gear/BDF 5" },
              { value: "gear6", label: "Gear/BDF 6" },
            ]} />
            <SliderField label="Abtastrate (Solver)" value={Math.log10(st.sim.sampleRate)} display={`${(st.sim.sampleRate / 1000).toFixed(0)} kS/s`} min={4} max={6.7} step={0.05} onChange={(v) => st.setSimOption("sampleRate", Math.round(Math.pow(10, v)))} />
            <SliderField label="Temperatur" value={st.sim.temperature} display={`${st.sim.temperature.toFixed(0)} °C`} min={-55} max={150} step={1} onChange={(temperature) => st.setSimOption("temperature", temperature)} />
            <div className="rounded-lg p-2.5 text-2xs mono bg-surface-2">
              <Row k="Bauteile (SPICE)" v={String(st.netResult.netlist.devices.length)} />
              <Row k="Matrixgröße" v={engine.sim ? `${engine.sim.size}×${engine.sim.size}` : "—"} />
              <Row k="Simulationszeit" v={live ? formatValue(live.time, "s") : "0 s"} />
              <Row
                k="Echtzeitfaktor"
                v={
                  live
                    ? `×${(live.realtimeFactor || 0).toFixed(2)}${live.overload ? " ÜBERLAST" : ""}${(live.effectiveSampleRate ?? 0) > 0 && live.effectiveSampleRate! < engine.options.sampleRate ? ` (adaptiv ${(live.effectiveSampleRate! / 1000).toFixed(0)} kHz)` : ""}`
                    : "—"
                }
              />
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
