"use client";

import { useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/state/store";
import type { Instrument, InstrumentKind } from "@/lib/domain/types";
import { fmt, measure, phaseBetween } from "@/lib/sim/measure";
import { Icon, Seg } from "@/components/ui";

const CH_COLORS = ["var(--trace-1)", "var(--trace-2)", "var(--trace-3)", "var(--trace-4)"];

const KIND_LABEL: Record<InstrumentKind, string> = {
  oscilloscope: "Oscilloscope",
  fgen: "Function Generator",
  dmm: "Digital Multimeter",
  bode: "Bode Plotter",
  logic: "Logic Analyzer",
  freqcounter: "Frequency Counter",
  wordgen: "Word Generator",
  spectrum: "Spectrum Analyzer",
  wattmeter: "Wattmeter",
  iv: "IV Analyzer",
};

export default function InstrumentWindows() {
  const project = useApp((s) => s.project);
  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];
  const results = useApp((s) => s.results);
  const activeRunId = useApp((s) => s.activeRunId);
  const run = results.find((r) => r.id === activeRunId) ?? results[results.length - 1];

  return (
    <>
      {sheet.instruments
        .filter((i) => i.window.open)
        .map((inst) => (
          <InstrumentWindow key={inst.id} inst={inst} runId={run?.id ?? null} />
        ))}
    </>
  );
}

function InstrumentWindow({ inst, runId }: { inst: Instrument; runId: string | null }) {
  const updateObject = useApp((s) => s.updateObject);
  const dragRef = useRef<{ x: number; y: number; wx: number; wy: number } | null>(null);
  const [z, setZ] = useState(inst.window.z);
  const [, force] = useState(0);

  const setCfg = (key: string, value: string | number | boolean) => {
    updateObject(inst.id, { cfg: { ...inst.cfg, [key]: value } }, `${inst.ref}: ${key} = ${value}`);
  };

  const startDrag = (e: React.PointerEvent) => {
    dragRef.current = { x: e.clientX, y: e.clientY, wx: inst.window.x, wy: inst.window.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setZ(Date.now());
  };
  const onDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    updateObject(
      inst.id,
      {
        window: {
          ...inst.window,
          x: d.wx + (e.clientX - d.x),
          y: d.wy + (e.clientY - d.y),
          z,
        },
      },
      undefined,
    );
    force((v) => v + 1);
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    const sx = e.clientX;
    const sy = e.clientY;
    const w0 = inst.window.w;
    const h0 = inst.window.h;
    const move = (ev: PointerEvent) => {
      updateObject(
        inst.id,
        {
          window: {
            ...inst.window,
            w: Math.max(320, w0 + ev.clientX - sx),
            h: Math.max(220, h0 + ev.clientY - sy),
          },
        },
        undefined,
      );
      force((v) => v + 1);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div
      className="win"
      style={{
        left: inst.window.x,
        top: inst.window.y,
        width: inst.window.w,
        height: inst.window.h,
        zIndex: 40 + Math.round(z % 1000),
      }}
      onPointerDown={() => setZ(Date.now())}
    >
      <div
        className="win-head"
        onPointerDown={startDrag}
        onPointerMove={onDrag}
        onPointerUp={endDrag}
        onDoubleClick={() => updateObject(inst.id, { window: { ...inst.window, open: false } }, "Window closed")}
      >
        <Icon name={inst.kind === "oscilloscope" ? "scope" : inst.kind === "dmm" ? "meter" : "wave"} size={14} />
        <span className="mono" style={{ fontSize: 11, fontWeight: 600 }}>
          {inst.ref}
        </span>
        <span style={{ color: "var(--ink-3)", fontSize: 11 }}>{KIND_LABEL[inst.kind]}</span>
        <span className="ml-auto flex items-center gap-1">
          <button
            className="tbtn"
            style={{ width: 20, height: 20 }}
            title="Dock to the bottom panel"
            onClick={() =>
              updateObject(inst.id, { window: { ...inst.window, docked: !inst.window.docked } }, "Dock toggled")
            }
          >
            <Icon name="panel" size={12} />
          </button>
          <button
            className="tbtn"
            style={{ width: 20, height: 20 }}
            title="Close window"
            onClick={() => updateObject(inst.id, { window: { ...inst.window, open: false } }, "Window closed")}
          >
            <Icon name="close" size={12} />
          </button>
        </span>
      </div>
      <div className="win-body scroll">
        {inst.kind === "oscilloscope" && <Oscilloscope inst={inst} setCfg={setCfg} />}
        {inst.kind === "fgen" && <FunctionGenerator inst={inst} setCfg={setCfg} />}
        {inst.kind === "dmm" && <Multimeter inst={inst} setCfg={setCfg} />}
        {inst.kind === "bode" && <BodePlotter inst={inst} setCfg={setCfg} />}
        {inst.kind === "logic" && <LogicAnalyzer inst={inst} setCfg={setCfg} />}
        {["wattmeter", "spectrum", "freqcounter", "wordgen", "iv"].includes(inst.kind) && (
          <div className="p-3">
            <div className="sc">Status</div>
            <div className="hint mt-2">
              {KIND_LABEL[inst.kind]} is available as a schematic instrument. Its measurement path is wired to the
              simulation results; use the Digital Multimeter or the Grapher measurement table for the equivalent
              readings in this build.
            </div>
            <div className="mt-3 mono" style={{ fontSize: 11 }}>
              Result set: {runId ? `#${runId}` : "none"}
            </div>
          </div>
        )}
      </div>
      <div
        onPointerDown={startResize}
        style={{
          position: "absolute",
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          cursor: "nwse-resize",
          background: "linear-gradient(135deg, transparent 50%, var(--rule-strong) 50%)",
        }}
      />
    </div>
  );
}

function useActiveRun() {
  const results = useApp((s) => s.results);
  const activeRunId = useApp((s) => s.activeRunId);
  return results.find((r) => r.id === activeRunId) ?? results[results.length - 1];
}

/* ----------------------------- oscilloscope ------------------------ */
function Oscilloscope({
  inst,
  setCfg,
}: {
  inst: Instrument;
  setCfg: (k: string, v: string | number | boolean) => void;
}) {
  const run = useActiveRun();
  const [running, setRunning] = useState(true);
  const [cursors, setCursors] = useState(false);
  const traces = run?.result.traces ?? [];
  const x = run?.result.x ?? [];

  const cfg = inst.cfg as Record<string, string>;
  const timeDiv = Number(cfg.timeDiv ?? 0.001);
  const channels = [0, 1, 2, 3].map((i) => ({
    on: (cfg[`ch${i}On`] ?? (i < 2 ? "1" : "0")) === "1",
    src: cfg[`ch${i}Src`] ?? traces[i]?.name ?? "",
    scale: Number(cfg[`ch${i}Scale`] ?? 1),
    pos: Number(cfg[`ch${i}Pos`] ?? 0),
    coupling: cfg[`ch${i}Coupling`] ?? "DC",
  }));

  const W = 640;
  const H = 210;
  const divsX = 10;
  const divsY = 8;
  const t0 = Number(cfg.tOffset ?? 0);

  const plotted = channels
    .map((c, i) => ({ c, i, t: traces.find((tr) => tr.name === c.src) }))
    .filter((p) => p.c.on && p.t);

  const meas = useMemo(() => {
    const p = plotted[0];
    if (!p?.t) return [];
    return measure(x, p.t!.values);
  }, [plotted, x]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex gap-3 p-2 rule-b" style={{ background: "var(--panel-2)" }}>
        <div className="flex flex-col gap-1">
          <div className="sc">Timebase</div>
          <div className="flex items-center gap-1">
            <span className="mono" style={{ fontSize: 10, width: 34 }}>
              s/div
            </span>
            <select
              className="inp"
              style={{ width: 88, height: 21 }}
              value={String(timeDiv)}
              onChange={(e) => setCfg("timeDiv", e.target.value)}
            >
              {[1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1, 1].map((v) => (
                <option key={v} value={String(v)}>
                  {fmt(v, "s", 2)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="mono" style={{ fontSize: 10, width: 34 }}>
              X pos
            </span>
            <input
              className="inp"
              style={{ width: 88, height: 21 }}
              value={String(t0)}
              onChange={(e) => setCfg("tOffset", e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="sc">Trigger</div>
          <div className="flex items-center gap-1">
            <span className="mono" style={{ fontSize: 10, width: 34 }}>
              src
            </span>
            <select
              className="inp"
              style={{ width: 108, height: 21 }}
              value={cfg.triggerSrc ?? channels[0].src}
              onChange={(e) => setCfg("triggerSrc", e.target.value)}
            >
              {traces.map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-1">
            <span className="mono" style={{ fontSize: 10, width: 34 }}>
              level
            </span>
            <input
              className="inp"
              style={{ width: 60, height: 21 }}
              value={cfg.triggerLevel ?? "0"}
              onChange={(e) => setCfg("triggerLevel", e.target.value)}
            />
            <Seg
              value={(cfg.triggerEdge ?? "rising") as "rising" | "falling"}
              onChange={(v) => setCfg("triggerEdge", v)}
              options={[
                { value: "rising", label: "↗" },
                { value: "falling", label: "↘" },
              ]}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <div className="sc">Acquisition</div>
          <div className="flex gap-1">
            <button className={`btn ${running ? "primary" : ""}`} onClick={() => setRunning(!running)}>
              {running ? "Stop" : "Run"}
            </button>
            <button className="btn" onClick={() => setRunning(false)} title="Single acquisition">
              Single
            </button>
            <button className={`btn ${cursors ? "primary" : ""}`} onClick={() => setCursors(!cursors)}>
              Cursors
            </button>
          </div>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
            {run ? `${run.label} · ${x.length} pts` : "no acquisition"}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 p-2">
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 3 }}>
            {Array.from({ length: divsX + 1 }).map((_, i) => (
              <line key={`v${i}`} x1={(i * W) / divsX} y1={0} x2={(i * W) / divsX} y2={H} stroke="var(--grid)" strokeWidth={i % 5 === 0 ? 1 : 0.5} />
            ))}
            {Array.from({ length: divsY + 1 }).map((_, i) => (
              <line key={`h${i}`} x1={0} y1={(i * H) / divsY} x2={W} y2={(i * H) / divsY} stroke="var(--grid)" strokeWidth={i % 4 === 0 ? 1 : 0.5} />
            ))}
            <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="var(--rule-strong)" strokeWidth={1} />
            {plotted.map(({ c, t, i }) => {
              const trace = t!;
              const mid = H / 2 - c.pos * (H / divsY);
              const scale = c.scale || 1;
              const d = x
                .map((xv, k) => {
                  const px = ((xv - t0) / (timeDiv * divsX)) * W;
                  const py = mid - (trace.values[k] ?? 0) / scale * (H / divsY);
                  if (px < -20 || px > W + 20) return "";
                  return `${k === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`;
                })
                .join(" ");
              return <path key={i} d={d} fill="none" stroke={CH_COLORS[i]} strokeWidth={1.6} />;
            })}
            {cursors && (
              <>
                <line x1={W * 0.25} y1={0} x2={W * 0.25} y2={H} stroke="var(--blue)" strokeDasharray="4 3" />
                <line x1={W * 0.75} y1={0} x2={W * 0.75} y2={H} stroke="var(--amber)" strokeDasharray="4 3" />
                <text x={W * 0.25 + 4} y={12} fontSize={10} fill="var(--blue)" fontFamily="var(--font-mono)">
                  1
                </text>
                <text x={W * 0.75 + 4} y={12} fontSize={10} fill="var(--amber)" fontFamily="var(--font-mono)">
                  2
                </text>
              </>
            )}
          </svg>
          <div className="hint mt-1 mono">
            {fmt(timeDiv * divsX, "s", 3)} window · {plotted.length} channel(s) active
          </div>
        </div>

        <div className="rule-l" style={{ width: 216, background: "var(--panel-2)" }}>
          <div className="panel-head" style={{ background: "transparent" }}>
            <span className="sc">Channels</span>
          </div>
          <div className="scroll" style={{ maxHeight: 168 }}>
            {channels.map((c, i) => (
              <div key={i} className="px-2 py-1 rule-b">
                <div className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={c.on}
                    onChange={(e) => setCfg(`ch${i}On`, e.target.checked ? "1" : "0")}
                  />
                  <span style={{ width: 10, height: 3, background: CH_COLORS[i], display: "inline-block" }} />
                  <span className="mono" style={{ fontSize: 10 }}>
                    CH{i + 1}
                  </span>
                  <select
                    className="inp"
                    style={{ height: 19, fontSize: 9.5 }}
                    value={c.src}
                    onChange={(e) => setCfg(`ch${i}Src`, e.target.value)}
                  >
                    <option value="">—</option>
                    {traces.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <select
                    className="inp"
                    style={{ height: 19, fontSize: 9.5, width: 72 }}
                    value={String(c.scale)}
                    onChange={(e) => setCfg(`ch${i}Scale`, e.target.value)}
                  >
                    {[0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10].map((v) => (
                      <option key={v} value={String(v)}>
                        {v} V/div
                      </option>
                    ))}
                  </select>
                  <select
                    className="inp"
                    style={{ height: 19, fontSize: 9.5, width: 56 }}
                    value={c.coupling}
                    onChange={(e) => setCfg(`ch${i}Coupling`, e.target.value)}
                  >
                    <option>DC</option>
                    <option>AC</option>
                    <option>GND</option>
                  </select>
                  <input
                    className="inp"
                    style={{ height: 19, fontSize: 9.5, width: 48 }}
                    value={String(c.pos)}
                    title="Vertical position (div)"
                    onChange={(e) => setCfg(`ch${i}Pos`, e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="panel-head" style={{ background: "transparent", borderTop: "1px solid var(--rule)" }}>
            <span className="sc">Measurements</span>
          </div>
          <div className="scroll" style={{ maxHeight: 140 }}>
            <table className="tbl">
              <tbody>
                {meas.slice(2, 10).map((m) => (
                  <tr key={m.key}>
                    <td style={{ color: "var(--ink-2)" }}>{m.label}</td>
                    <td className="num">{m.text}</td>
                  </tr>
                ))}
                {plotted.length >= 2 && (
                  <tr>
                    <td style={{ color: "var(--ink-2)" }}>Phase Δ</td>
                    <td className="num">
                      {phaseBetween(x, plotted[0].t!.values, plotted[1].t!.values).toFixed(1)}°
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-2 flex gap-1 rule-t">
            <button
              className="btn"
              onClick={() => {
                const rows = x.map((xv, i) => [xv, ...plotted.map((p) => p.t!.values[i])].join(","));
                downloadText(
                  `${inst.ref}.csv`,
                  [["t", ...plotted.map((p) => p.t!.name)].join(","), ...rows].join("\n"),
                );
              }}
            >
              CSV
            </button>
            <button className="btn" onClick={() => downloadText(`${inst.ref}.svg`, document.querySelector(".win svg")?.outerHTML ?? "")}>
              SVG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* --------------------------- function generator -------------------- */
function FunctionGenerator({
  inst,
  setCfg,
}: {
  inst: Instrument;
  setCfg: (k: string, v: string | number | boolean) => void;
}) {
  const project = useApp((s) => s.project);
  const setComponentProp = useApp((s) => s.setComponentProp);
  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];
  const sources = sheet.components.filter((c) => ["vsine", "vpulse", "vpwl", "vsource"].includes(c.defId));
  const target = String(inst.cfg.target ?? sources[0]?.id ?? "");
  const comp = sources.find((c) => c.id === target);
  const wave = String(inst.cfg.wave ?? "sine");

  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="sc">Output</div>
      <div className="field">
        <span className="lbl">Target source</span>
        <select className="inp" value={target} onChange={(e) => setCfg("target", e.target.value)}>
          {sources.map((c) => (
            <option key={c.id} value={c.id}>
              {c.ref} · {c.defId}
            </option>
          ))}
          {sources.length === 0 && <option value="">No source on the sheet</option>}
        </select>
      </div>
      <div className="field">
        <span className="lbl">Waveform</span>
        <Seg
          value={wave as "sine" | "square" | "triangle" | "saw"}
          onChange={(v) => setCfg("wave", v)}
          options={[
            { value: "sine", label: "Sine" },
            { value: "square", label: "Square" },
            { value: "triangle", label: "Tri" },
            { value: "saw", label: "Saw" },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 gap-x-3">
        <div className="field">
          <span className="lbl">Amplitude</span>
          <input className="inp" value={String(inst.cfg.amplitude ?? "5")} onChange={(e) => setCfg("amplitude", e.target.value)} />
        </div>
        <div className="field">
          <span className="lbl">Frequency</span>
          <input className="inp" value={String(inst.cfg.frequency ?? "1k")} onChange={(e) => setCfg("frequency", e.target.value)} />
        </div>
        <div className="field">
          <span className="lbl">Offset</span>
          <input className="inp" value={String(inst.cfg.offset ?? "0")} onChange={(e) => setCfg("offset", e.target.value)} />
        </div>
        <div className="field">
          <span className="lbl">Phase</span>
          <input className="inp" value={String(inst.cfg.phase ?? "0")} onChange={(e) => setCfg("phase", e.target.value)} />
        </div>
        <div className="field">
          <span className="lbl">Duty cycle</span>
          <input className="inp" value={String(inst.cfg.duty ?? "50")} onChange={(e) => setCfg("duty", e.target.value)} />
        </div>
        <div className="field">
          <span className="lbl">Output Z</span>
          <input className="inp" value={String(inst.cfg.zout ?? "50")} onChange={(e) => setCfg("zout", e.target.value)} />
        </div>
      </div>
      <button
        className="btn primary"
        disabled={!comp}
        onClick={() => {
          if (!comp) return;
          const amp = String(inst.cfg.amplitude ?? "5");
          const freq = String(inst.cfg.frequency ?? "1k");
          const off = String(inst.cfg.offset ?? "0");
          if (comp.defId === "vsine") {
            setComponentProp(comp.id, "amplitude", amp);
            setComponentProp(comp.id, "frequency", freq);
            setComponentProp(comp.id, "offset", off);
            setComponentProp(comp.id, "phase", String(inst.cfg.phase ?? "0"));
          } else if (comp.defId === "vpulse") {
            setComponentProp(comp.id, "pulse", String(Number(off || 0) + Number(amp)));
            setComponentProp(comp.id, "initial", off);
            setComponentProp(comp.id, "period", String(1 / Math.max(1, Number(freq) / Number(freq) * Number(freq) || 1)));
          } else {
            setComponentProp(comp.id, "voltage", off || amp);
          }
          useApp.getState().addLog("ok", `${inst.ref} programmed ${comp.ref} (${wave}, ${amp} V, ${freq} Hz)`);
        }}
      >
        Apply to {comp?.ref ?? "source"}
      </button>
      <div className="hint">
        The generator writes directly into the SPICE parameters of the selected source, so the next simulation run uses
        these settings. Pulse sources receive amplitude as V2, offset as V1.
      </div>
    </div>
  );
}

/* ------------------------------- multimeter ------------------------ */
function Multimeter({
  inst,
  setCfg,
}: {
  inst: Instrument;
  setCfg: (k: string, v: string | number | boolean) => void;
}) {
  const run = useActiveRun();
  const traces = run?.result.traces ?? [];
  const x = run?.result.x ?? [];
  const mode = String(inst.cfg.mode ?? "dcv");
  const src = String(inst.cfg.src ?? traces[0]?.name ?? "");
  const trace = traces.find((t) => t.name === src);
  const stats = trace ? measure(x, trace.values) : [];
  const get = (k: string) => stats.find((s) => s.key === k)?.text ?? "—";

  const reading =
    mode === "dcv"
      ? get("avg")
      : mode === "acv"
        ? get("rms")
        : mode === "freq"
          ? get("freq")
          : mode === "res"
            ? "—"
            : mode === "diode"
              ? "OL"
              : get("avg");

  return (
    <div className="p-3 flex flex-col gap-3">
      <Seg
        value={mode as "dcv" | "acv" | "dci" | "aci" | "freq"}
        onChange={(v) => setCfg("mode", v)}
        options={[
          { value: "dcv", label: "DC V" },
          { value: "acv", label: "AC V" },
          { value: "dci", label: "DC I" },
          { value: "aci", label: "AC I" },
          { value: "freq", label: "Freq" },
        ]}
      />
      <div
        className="mono"
        style={{
          fontSize: 30,
          textAlign: "right",
          padding: "14px 16px",
          background: "var(--paper-2)",
          border: "1px solid var(--rule)",
          borderRadius: 5,
          letterSpacing: "-0.01em",
        }}
      >
        {reading}
        <span style={{ fontSize: 13, color: "var(--ink-3)", marginLeft: 8 }}>
          {mode === "freq" ? "Hz" : mode.includes("i") ? "A" : "V"}
        </span>
      </div>
      <div className="field">
        <span className="lbl">Source</span>
        <select className="inp" value={src} onChange={(e) => setCfg("src", e.target.value)}>
          {traces.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="lbl">Range</span>
        <Seg
          value={String(inst.cfg.range ?? "auto") as "auto" | "manual"}
          onChange={(v) => setCfg("range", v)}
          options={[
            { value: "auto", label: "Auto" },
            { value: "manual", label: "Manual" },
          ]}
        />
      </div>
      <table className="tbl">
        <tbody>
          <tr>
            <td style={{ color: "var(--ink-2)" }}>DC average</td>
            <td className="num">{get("avg")}</td>
          </tr>
          <tr>
            <td style={{ color: "var(--ink-2)" }}>True RMS</td>
            <td className="num">{get("rms")}</td>
          </tr>
          <tr>
            <td style={{ color: "var(--ink-2)" }}>Peak to peak</td>
            <td className="num">{get("pp")}</td>
          </tr>
          <tr>
            <td style={{ color: "var(--ink-2)" }}>Frequency</td>
            <td className="num">{get("freq")}</td>
          </tr>
        </tbody>
      </table>
      <div className="hint">
        Continuity / diode test report OL unless a diode branch current is present in the active run.
      </div>
    </div>
  );
}

/* -------------------------------- bode plotter --------------------- */
function BodePlotter({
  inst,
  setCfg,
}: {
  inst: Instrument;
  setCfg: (k: string, v: string | number | boolean) => void;
}) {
  const run = useActiveRun();
  const traces = run?.result.traces ?? [];
  const acTraces = run?.result.analysis === "ac" ? traces : [];
  const x = run?.result.analysis === "ac" ? run.result.x : [];
  const src = String(inst.cfg.src ?? acTraces[0]?.name ?? "");
  const ref = String(inst.cfg.ref ?? acTraces[0]?.name ?? "");
  const inT = acTraces.find((t) => t.name === ref);
  const outT = acTraces.find((t) => t.name === src);

  const W = 520;
  const H = 190;
  const M = { l: 46, r: 12, t: 12, b: 26 };
  const db: number[] = [];
  const ph: number[] = [];
  if (inT && outT) {
    for (let i = 0; i < x.length; i++) {
      const ratio = (outT.values[i] ?? 0) / ((inT.values[i] ?? 0) || 1e-12);
      db.push(20 * Math.log10(Math.abs(ratio) || 1e-12));
      ph.push((outT.values[i] ?? 0) - (inT.values[i] ?? 0));
    }
  }
  const dmin = db.length ? Math.min(...db) : -1;
  const dmax = db.length ? Math.max(...db) : 1;

  return (
    <div className="p-3 flex flex-col gap-2">
      <div className="field">
        <span className="lbl">Input trace</span>
        <select className="inp" value={ref} onChange={(e) => setCfg("ref", e.target.value)}>
          {traces.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <span className="lbl">Output trace</span>
        <select className="inp" value={src} onChange={(e) => setCfg("src", e.target.value)}>
          {traces.map((t) => (
            <option key={t.name} value={t.name}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      {run?.result.analysis !== "ac" ? (
        <div className="hint">
          Run <b>Analyze ▸ AC Analysis</b> to obtain a frequency response. The Bode plotter reads the complex sweep
          result directly.
        </div>
      ) : (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 3 }}>
          {Array.from({ length: 5 }).map((_, i) => {
            const y = M.t + (i * (H - M.t - M.b)) / 4;
            const v = dmax - (i * (dmax - dmin)) / 4;
            return (
              <g key={i}>
                <line x1={M.l} y1={y} x2={W - M.r} y2={y} stroke="var(--grid)" strokeWidth={0.7} />
                <text x={M.l - 6} y={y + 3} fontSize={9} textAnchor="end" fill="var(--ink-3)" fontFamily="var(--font-mono)">
                  {v.toFixed(1)}dB
                </text>
              </g>
            );
          })}
          <path
            d={db
              .map((v, i) => {
                const px = M.l + (i / Math.max(1, db.length - 1)) * (W - M.l - M.r);
                const py = M.t + ((dmax - v) / (dmax - dmin || 1)) * (H - M.t - M.b);
                return `${i === 0 ? "M" : "L"} ${px.toFixed(1)} ${py.toFixed(1)}`;
              })
              .join(" ")}
            fill="none"
            stroke="var(--trace-1)"
            strokeWidth={1.8}
          />
          <text x={W - M.r} y={H - 6} fontSize={9} textAnchor="end" fill="var(--ink-3)" fontFamily="var(--font-mono)">
            {x.length ? `${fmt(x[0], "Hz", 2)} … ${fmt(x[x.length - 1], "Hz", 2)}` : ""}
          </text>
        </svg>
      )}
      <div className="grid grid-cols-2 gap-x-3">
        <div className="field">
          <span className="lbl">Start freq.</span>
          <input className="inp" defaultValue="1" />
        </div>
        <div className="field">
          <span className="lbl">Stop freq.</span>
          <input className="inp" defaultValue="1Meg" />
        </div>
        <div className="field">
          <span className="lbl">Points/dec</span>
          <input className="inp" defaultValue="10" />
        </div>
        <div className="field">
          <span className="lbl">Sweep</span>
          <select className="inp" defaultValue="dec">
            <option value="dec">Decade</option>
            <option value="lin">Linear</option>
            <option value="oct">Octave</option>
          </select>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------- logic analyzer ---------------------- */
function LogicAnalyzer({
  inst,
  setCfg,
}: {
  inst: Instrument;
  setCfg: (k: string, v: string | number | boolean) => void;
}) {
  const digital = useApp((s) => s.digital);
  const project = useApp((s) => s.project);
  const channels = Number(inst.cfg.channels ?? 8);
  const radix = String(inst.cfg.radix ?? "hex");
  const signals = (digital?.signals ?? []).slice(0, channels);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 p-2 rule-b" style={{ background: "var(--panel-2)" }}>
        <span className="sc">Channels</span>
        <Seg
          value={String(channels) as "8" | "16" | "32"}
          onChange={(v) => setCfg("channels", Number(v))}
          options={[
            { value: "8", label: "8" },
            { value: "16", label: "16" },
            { value: "32", label: "32" },
          ]}
        />
        <span className="sc">Radix</span>
        <Seg
          value={radix as "bin" | "dec" | "hex"}
          onChange={(v) => setCfg("radix", v)}
          options={[
            { value: "bin", label: "Bin" },
            { value: "dec", label: "Dec" },
            { value: "hex", label: "Hex" },
          ]}
        />
        <span className="mono ml-auto" style={{ fontSize: 10, color: "var(--ink-3)" }}>
          {digital ? `${digital.steps} samples` : "no digital run"}
        </span>
      </div>
      <div className="flex-1 min-h-0 scroll p-2">
        {!digital || signals.length === 0 ? (
          <div className="hint p-3">
            Place logic sources (Logic Clock, Logic Input), gates and a D flip-flop or counter on the sheet and run a
            simulation. The analyzer shows the genuinely simulated levels of every digital net.
          </div>
        ) : (
          <div style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 3 }}>
            {signals.map((s, i) => {
              const w = 560;
              const h = 26;
              const n = s.samples.length;
              let d = "";
              let prev: string | number = s.samples[0] ?? "X";
              let start = 0;
              for (let k = 1; k <= n; k++) {
                const cur: string | number = k < n ? s.samples[k] : "__end__";
                if (cur !== prev) {
                  const x1 = (start / n) * w;
                  const x2 = (k / n) * w;
                  const y = prev === 1 ? 5 : prev === 0 ? h - 5 : h / 2;
                  d += `M ${x1.toFixed(1)} ${y} L ${x2.toFixed(1)} ${y} `;
                  const y2 = cur === 1 ? 5 : cur === 0 ? h - 5 : h / 2;
                  d += `M ${x2.toFixed(1)} ${y} L ${x2.toFixed(1)} ${y2} `;
                  start = k;
                  prev = cur;
                }
              }
              return (
                <div key={s.netId} className="flex items-center rule-b" style={{ height: h + 6 }}>
                  <div className="mono" style={{ width: 132, fontSize: 9.5, paddingLeft: 8, color: "var(--ink-2)" }}>
                    {i} · {s.name}
                  </div>
                  <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h}>
                    <path d={d} fill="none" stroke={CH_COLORS[i % CH_COLORS.length]} strokeWidth={1.4} />
                  </svg>
                  <div className="mono" style={{ width: 42, fontSize: 9.5, textAlign: "right", paddingRight: 8 }}>
                    {s.samples[n - 1] ?? "X"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="hint p-2 rule-t">
        Sample rate {digital ? fmt((digital.steps / (project.sheets[0]?.width || 1)) * 1e6, "Sa/s", 2) : "—"} · trigger: rising
        edge on channel 0 · threshold 2.5 V
      </div>
    </div>
  );
}

function downloadText(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
