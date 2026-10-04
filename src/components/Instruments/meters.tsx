"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { formatValue } from "@/lib/library/catalog";
import { estimateFrequency, mean, rms } from "@/lib/sim/realtime";
import { InstrumentWindow, engine, useEditor } from "@/state/editor";
import { NetSelect, Stat, grid } from "./shared";

export function Multimeter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const running = useEditor((s) => s.sim.running);
  const tick = useEditor((s) => s.sim.tick);
  const cfg = (win.config.dmm as { a: string; b: string; mode: string; range: string }) ?? {
    a: nets.find((n) => n !== "0") ?? "",
    b: "0",
    mode: "vdc",
    range: "auto",
  };
  const set = (p: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, dmm: { ...cfg, ...p } } });

  let value = 0;
  let unit = "V";
  const ca = engine.channel(cfg.a, 4000);
  const cb = engine.channel(cfg.b, 4000);
  const diff = ca.v.map((v, i) => v - (cb.v[i] ?? 0));
  if (cfg.mode === "vdc") value = mean(diff);
  else if (cfg.mode === "vac") {
    const m = mean(diff);
    value = rms(diff.map((v) => v - m));
  } else if (cfg.mode === "adc" || cfg.mode === "aac") {
    const currents = engine.lastState.currents;
    const first = Object.keys(currents)[0];
    value = currents[first] ?? 0;
    unit = "A";
  } else if (cfg.mode === "ohm") {
    const v = mean(diff);
    const currents = Object.values(engine.lastState.currents);
    const i = currents.length ? currents[0] : 1e-9;
    value = Math.abs(v / (i || 1e-12));
    unit = "Ω";
  } else if (cfg.mode === "db") {
    const m = mean(diff);
    value = 20 * Math.log10(Math.max(rms(diff.map((v) => v - m)) / 0.7746, 1e-12));
    unit = "dBu";
  } else if (cfg.mode === "hz") {
    value = estimateFrequency(ca.t, ca.v);
    unit = "Hz";
  }
  void tick;

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="rounded-xl p-3 bg-surface-2 border border-hairline">
        <div className="mono text-right text-[34px] font-semibold leading-none tabular-nums" style={{ color: running ? "var(--ok)" : "var(--ink-3)" }}>
          {running ? formatValue(value, "") : "– – –"}
        </div>
        <div className="mono mt-1 text-right text-xs text-ink-3">{unit}</div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {[
          ["vdc", "V⎓"],
          ["vac", "V~"],
          ["adc", "A⎓"],
          ["aac", "A~"],
          ["ohm", "Ω"],
          ["db", "dB"],
          ["hz", "Hz"],
        ].map(([m, label]) => (
          <button key={m} className="tab text-center" data-active={cfg.mode === m} onClick={() => set({ mode: m })}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-2xs text-ink-3">
          Messpunkt +
          <NetSelect value={cfg.a} onChange={(v) => set({ a: v })} />
        </label>
        <label className="text-2xs text-ink-3">
          Messpunkt −
          <NetSelect value={cfg.b} onChange={(v) => set({ b: v })} />
        </label>
      </div>
      <div className="flex gap-1">
        {["auto", "200m", "2", "20", "200"].map((r) => (
          <button key={r} className="tab flex-1 text-center" data-active={cfg.range === r} onClick={() => set({ range: r })}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* Der FG-2500 lebt in FgScope.tsx + components/fg2/ (W18)              */
/* ------------------------------------------------------------------ */

export function Wattmeter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const doc = useEditor((s) => s.doc);
  const tick = useEditor((s) => s.sim.tick);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const cfg = (win.config.watt as { vnet: string; gnd: string; device: string }) ?? {
    vnet: nets.find((n) => n !== "0") ?? "",
    gnd: "0",
    device: doc.instances[0]?.label ?? "",
  };
  const set = (p: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, watt: { ...cfg, ...p } } });
  void tick;

  const vch = engine.channel(cfg.vnet, 4000);
  const gch = engine.channel(cfg.gnd, 4000);
  const v = vch.v.map((x, i) => x - (gch.v[i] ?? 0));
  const i = engine.lastState.currents[cfg.device] ?? 0;
  const vrms = rms(v);
  const irms = Math.abs(i);
  const p = mean(v.map((x) => x * i));
  const s = vrms * irms;
  const pf = s > 0 ? p / s : 0;
  const q = Math.sqrt(Math.max(s * s - p * p, 0));

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-2xs text-ink-3">
          Spannung an
          <NetSelect value={cfg.vnet} onChange={(x) => set({ vnet: x })} />
        </label>
        <label className="text-2xs text-ink-3">
          Bezug
          <NetSelect value={cfg.gnd} onChange={(x) => set({ gnd: x })} />
        </label>
      </div>
      <label className="text-2xs text-ink-3">
        Strom durch Bauteil
        <select className="input py-0.5 text-2xs" value={cfg.device} onChange={(e) => set({ device: e.target.value })}>
          {doc.instances.map((x) => (
            <option key={x.id} value={x.label}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Wirkleistung P" value={formatValue(p, "W")} color="var(--ok)" />
        <Stat label="Scheinleistung S" value={formatValue(s, "VA")} color="var(--teal)" />
        <Stat label="Blindleistung Q" value={formatValue(q, "var")} color="var(--violet)" />
        <Stat label="Leistungsfaktor" value={pf.toFixed(3)} color="var(--warn)" />
        <Stat label="U rms" value={formatValue(vrms, "V")} />
        <Stat label="I rms" value={formatValue(irms, "A")} />
      </div>
    </div>
  );
}

export function FrequencyCounter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const running = useEditor((s) => s.sim.running);
  const tick = useEditor((s) => s.sim.tick);
  void tick;
  const cfg = (win.config.counter as { net: string }) ?? { net: nets.find((n) => n !== "0") ?? "" };

  const ch = engine.channel(cfg.net, 8192);
  const f = ch.v.length > 32 ? estimateFrequency(ch.t, ch.v) : 0;
  const avg = ch.v.length ? mean(ch.v) : 0;
  const duty = ch.v.length ? (ch.v.filter((v) => v > avg).length / ch.v.length) * 100 : 0;

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="rounded-xl p-3 bg-surface-2 border border-hairline">
        <div className="mono text-right text-[30px] font-semibold leading-none tabular-nums" style={{ color: running && f > 0 ? "var(--ink)" : "var(--ink-3)" }}>
          {running && f > 0 ? formatValue(f, "") : "– – –"}
        </div>
        <div className="mono mt-1 text-right text-xs text-ink-3">Hz</div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Periode" value={f > 0 ? formatValue(1 / f, "s") : "—"} />
        <Stat label="Tastgrad" value={f > 0 ? `${duty.toFixed(1)} %` : "—"} />
      </div>
      <label className="text-2xs text-ink-3">
        Messknoten
        <NetSelect value={cfg.net} onChange={(v) => update(win.id, { config: { ...win.config, counter: { net: v } } })} />
      </label>
      {!running && <div className="text-2xs text-ink-3">Zählt, sobald die Simulation läuft.</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* logic converter – Multisim iconic                                    */
/* ------------------------------------------------------------------ */
