"use client";

/* Runde 13 (W24): SkeuoTek-Oszilloskop 1:1 aus dem oszi/-Projekt des Users.
 * Runde 14 (W29): Das Oszi ist ein Schaltsymbol auf dem Plan mit Pins
 * CH1–CH4 + GND. Die Messnetze kommen aus der Verdrahtung (pinNets) –
 * keine Dropdowns. Angeschlossene Kanäle leuchten mit ihrem Netznamen,
 * offene Pins erscheinen als „offen“. Liegt am GND-Pin ein Netz ≠ 0,
 * messen alle Kanäle differenziell V(CH) − V(GND). */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Knob } from "./oszi/Knob";
import { PushButton } from "./oszi/PushButton";
import {
  ScopeScreen,
  type ChannelState,
  type Measurements,
  type ScreenState,
} from "./oszi/ScopeScreen";
import { formatFreq, formatTime, formatVolt, TIME_DIV, VOLT_DIV } from "./oszi/units";
import { engine, useEditor, type InstrumentWindow } from "@/state/editor";

const CH_COLORS = ["#f4e04d", "#45d4e6", "#ff7ad9", "#7ddc4b"];
const NCH = 4;
const POS_DEFAULT = [3, 1, -1, -3];

type Coupling = "DC" | "AC" | "GND";

interface OsziCfg {
  voltsIdx: number[];
  positionDiv: number[];
  coupling: Coupling[];
  probe: number[];
  timeIdx: number;
  horizPosDiv: number;
  trigger: { source: number; level: number; edge: "rising" | "falling"; mode: "auto" | "normal" | "single" };
  running: boolean;
  showMeasure: boolean;
  active: number;
}

function nearestIndex(arr: number[], v: number) {
  let best = 0;
  let bd = Infinity;
  arr.forEach((x, i) => {
    const d = Math.abs(Math.log(x) - Math.log(Math.max(v, 1e-12)));
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

const clampIdx = (i: number, arr: number[]) => Math.max(0, Math.min(arr.length - 1, i));
const clamp4 = (n: unknown) => Math.max(0, Math.min(NCH - 1, Math.round(Number(n) || 0)));

/** Fremd-Array (z. B. 2-Kanal-Config aus Runde 13) auf 4 Kanäle auffüllen. */
function pad4<T>(arr: unknown, def: T[]): T[] {
  const out = [...def];
  if (Array.isArray(arr)) {
    for (let i = 0; i < NCH; i++) {
      const v = arr[i];
      if (v !== undefined && v !== null) out[i] = v as T;
    }
  }
  return out;
}

function defaultCfg(): OsziCfg {
  const v1 = nearestIndex(VOLT_DIV, 1);
  return {
    voltsIdx: [v1, v1, v1, v1],
    positionDiv: [...POS_DEFAULT],
    coupling: ["DC", "DC", "DC", "DC"],
    probe: [1, 1, 1, 1],
    timeIdx: nearestIndex(TIME_DIV, 200e-6),
    horizPosDiv: 0,
    trigger: { source: 0, level: 2.5, edge: "rising", mode: "auto" },
    running: true,
    showMeasure: true,
    active: 0,
  };
}

/** Alte Configs wandern (≤ R12: timebase/volts, R13: 2 Kanäle + nets).
 *  Netze stecken nicht mehr in der Config – sie kommen aus der Verdrahtung. */
function normalizeCfg(raw: unknown): OsziCfg {
  const def = defaultCfg();
  if (!raw || typeof raw !== "object") return def;
  const r = raw as Record<string, unknown>;
  if (typeof r.timeIdx === "number") {
    const cfg = { ...def, ...(raw as Partial<OsziCfg>) } as OsziCfg & { nets?: unknown };
    delete cfg.nets;
    cfg.voltsIdx = pad4(cfg.voltsIdx, def.voltsIdx).map((v) => clampIdx(Math.round(Number(v) || 0), VOLT_DIV));
    cfg.positionDiv = pad4(cfg.positionDiv, def.positionDiv).map((v) =>
      Math.max(-4, Math.min(4, Number(v) || 0)),
    );
    cfg.coupling = pad4(cfg.coupling, def.coupling).map((v) => (v === "AC" || v === "GND" ? v : ("DC" as Coupling)));
    cfg.probe = pad4(cfg.probe, def.probe).map((v) => (Number(v) === 10 ? 10 : 1));
    const t = (typeof r.trigger === "object" && r.trigger !== null ? r.trigger : {}) as Partial<OsziCfg["trigger"]>;
    cfg.trigger = {
      source: clamp4(t.source ?? def.trigger.source),
      level: typeof t.level === "number" ? t.level : def.trigger.level,
      edge: t.edge === "falling" ? "falling" : "rising",
      mode: t.mode === "normal" || t.mode === "single" ? t.mode : "auto",
    };
    cfg.active = clamp4(cfg.active);
    return cfg;
  }
  // Migration aus dem alten Instrument (Runde ≤ 12)
  const o = raw as {
    timebase?: number;
    volts?: number[];
    trigger?: { source?: number; level?: number; edge?: "rising" | "falling"; mode?: string };
    runMode?: string;
  };
  return {
    ...def,
    timeIdx: typeof o.timebase === "number" ? nearestIndex(TIME_DIV, o.timebase) : def.timeIdx,
    voltsIdx: pad4(
      Array.isArray(o.volts) ? o.volts.map((v) => nearestIndex(VOLT_DIV, Number(v) || 1)) : [],
      def.voltsIdx,
    ),
    trigger: {
      source: clamp4(o.trigger?.source ?? 0),
      level: typeof o.trigger?.level === "number" ? o.trigger.level : def.trigger.level,
      edge: o.trigger?.edge === "falling" ? "falling" : "rising",
      mode: o.trigger?.mode === "normal" ? "normal" : "auto",
    },
    running: o.runMode !== "stop",
  };
}

type Buf = { t: number[]; v: number[] } | null;

/** Lineare Interpolation im Engine-Buffer (binäre Suche). */
function interpAt(b: Buf, t: number): number {
  if (!b || b.t.length === 0) return 0;
  const arr = b.t;
  if (t <= arr[0]) return b.v[0];
  const n = arr.length - 1;
  if (t >= arr[n]) return b.v[n];
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= t) lo = m;
    else hi = m;
  }
  const f = (t - arr[lo]) / (arr[hi] - arr[lo] || 1);
  return b.v[lo] + (b.v[hi] - b.v[lo]) * f;
}

/** Frequenzschätzung über Mittellinien-Nulldurchgänge (aus oszi/). */
function estimateFreq(values: ArrayLike<number>, dur: number): number | null {
  const N = values.length;
  let vmax = -Infinity;
  let vmin = Infinity;
  for (let i = 0; i < N; i++) {
    if (values[i] > vmax) vmax = values[i];
    if (values[i] < vmin) vmin = values[i];
  }
  const mid = (vmax + vmin) / 2;
  let crossings = 0;
  let prevBelow: boolean | null = null;
  for (let i = 0; i < N; i++) {
    const below = values[i] < mid;
    if (prevBelow !== null && !below && prevBelow) crossings++;
    prevBelow = below;
  }
  return crossings >= 2 && dur > 0 ? crossings / dur : null;
}

export default function OsziScope({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const cfg = useMemo(() => normalizeCfg(win.config.scope), [win.config.scope]);
  const set = (patch: Partial<OsziCfg>) =>
    update(win.id, { config: { ...win.config, scope: { ...cfg, ...patch } } });

  // W29: Messnetze aus der Verdrahtung – Pins CH1–CH4 (Index 0–3), GND (4).
  // Freie Pins trägt das Modell als „<instanz>_nc<i>“ → Kanal gilt als offen.
  const nets = useMemo(() => {
    if (!win.instanceId) return ["", "", "", ""];
    return Array.from({ length: NCH }, (_, i) => {
      const n = netResult.pinNets[`${win.instanceId}:${i}`] ?? "";
      return n === `${win.instanceId}_nc${i}` ? "" : n;
    });
  }, [win.instanceId, netResult.pinNets]);
  const gndNet = useMemo(() => {
    if (!win.instanceId) return "";
    const n = netResult.pinNets[`${win.instanceId}:4`] ?? "";
    return n === `${win.instanceId}_nc4` ? "" : n;
  }, [win.instanceId, netResult.pinNets]);
  // GND-Pin verdrahtet und nicht selbst Knoten 0 → Differenzreferenz.
  const gndRef = gndNet && gndNet !== "0" ? gndNet : "";

  const [meas, setMeas] = useState<Measurements | null>(null);
  const cfgRef = useRef(cfg);
  const netsRef = useRef({ nets, gndRef });
  useEffect(() => {
    cfgRef.current = cfg;
    netsRef.current = { nets, gndRef };
  }, [cfg, nets, gndRef]);

  const voltsPerDiv = (i: number) => VOLT_DIV[cfg.voltsIdx[i]] * cfg.probe[i];

  // ---- Engine-Adapter: Buffer holen, interpolieren, Frequenz schätzen ----
  const getState = useCallback((): ScreenState => {
    const c = cfgRef.current;
    const { nets: ns, gndRef: gref } = netsRef.current;
    const bufs = ns.map((net): Buf => (net ? engine.channel(net, 8192) : null));
    const gbuf: Buf = gref ? engine.channel(gref, 8192) : null;
    const sample = (ch: number, t: number): number =>
      interpAt(bufs[ch], t) - (gbuf ? interpAt(gbuf, t) : 0);
    let freqHint = 1000;
    let active = false;
    const trigIdx = ns[c.trigger.source] ? c.trigger.source : ns.findIndex(Boolean);
    const tb = trigIdx >= 0 ? bufs[trigIdx] : null;
    if (tb && tb.t.length > 64) {
      active = true;
      const N = tb.v.length;
      const dur = tb.t[N - 1] - tb.t[0];
      const f = gbuf
        ? estimateFreq(Array.from({ length: N }, (_, i) => tb.v[i] - interpAt(gbuf, tb.t[i])), dur)
        : estimateFreq(tb.v, dur);
      if (f !== null) freqHint = f;
    }
    const channels: ChannelState[] = ns.map((net, i) => ({
      enabled: Boolean(net),
      voltsPerDiv: VOLT_DIV[c.voltsIdx[i]] * c.probe[i],
      positionDiv: c.positionDiv[i],
      coupling: c.coupling[i],
      color: CH_COLORS[i],
      probe: c.probe[i],
    }));
    return {
      sample,
      freqHint,
      active,
      simTime: engine.lastState.time,
      channels,
      timePerDiv: TIME_DIV[c.timeIdx],
      horizPosDiv: c.horizPosDiv,
      trigger: c.trigger,
      running: c.running,
      showMeasure: c.showMeasure,
      measureChan: c.active,
    };
  }, []);

  const onMeasure = useCallback((m: Measurements | null) => setMeas(m), []);
  const onSingleCaptured = useCallback(() => {
    const c = cfgRef.current;
    update(win.id, { config: { ...win.config, scope: { ...c, running: false } } });
  }, [update, win.id, win.config]);

  // ---- Regler (1:1 aus oszi/App.tsx, auf Config-Tupel) ----
  const setPair = <K extends "voltsIdx" | "positionDiv" | "coupling" | "probe">(
    k: K,
    i: number,
    v: OsziCfg[K][number],
  ) => {
    const arr = [...cfg[k]] as OsziCfg[K];
    arr[i] = v;
    set({ [k]: arr } as Partial<OsziCfg>);
  };
  const vScale = (dir: number) =>
    setPair("voltsIdx", cfg.active, clampIdx(cfg.voltsIdx[cfg.active] - dir, VOLT_DIV));
  const vPos = (dir: number) =>
    setPair("positionDiv", cfg.active, Math.max(-4, Math.min(4, cfg.positionDiv[cfg.active] + dir * 0.1)));
  const hScale = (dir: number) => set({ timeIdx: clampIdx(cfg.timeIdx - dir, TIME_DIV) });
  const hPos = (dir: number) =>
    set({ horizPosDiv: Math.max(-5, Math.min(5, cfg.horizPosDiv + dir * 0.2)) });
  const trigLevel = (dir: number) => {
    const vdiv = voltsPerDiv(cfg.trigger.source);
    const nl = cfg.trigger.level + dir * vdiv * 0.1;
    set({ trigger: { ...cfg.trigger, level: Math.max(-6 * vdiv, Math.min(6 * vdiv, nl)) } });
  };
  // W29: Kanäle schaltet man nicht mehr per UI aus – die Verdrahtung zählt.
  // Klick auf den Kanalbutton macht den Kanal zum aktiven Kanal.
  const toggleChannel = (i: number) => set({ active: i });

  const estimate = (net: string) => {
    const b = engine.channel(net, 8192);
    if (!b || b.t.length < 64) return null;
    const g = gndRef ? engine.channel(gndRef, 8192) : null;
    const N = b.v.length;
    const val = (i: number) => b.v[i] - (g ? interpAt(g, b.t[i]) : 0);
    let vmax = -Infinity;
    let vmin = Infinity;
    for (let i = 0; i < N; i++) {
      const v = val(i);
      if (v > vmax) vmax = v;
      if (v < vmin) vmin = v;
    }
    const dur = b.t[N - 1] - b.t[0];
    const freq = estimateFreq(Array.from({ length: N }, (_, i) => val(i)), dur) ?? 0;
    return { vmax, vmin, mid: (vmax + vmin) / 2, freq };
  };

  const autoset = () => {
    const trigNet = nets[cfg.trigger.source] || nets.find(Boolean) || "";
    if (!trigNet) return;
    const e = estimate(trigNet);
    if (!e) return;
    const period = e.freq > 0 ? 1 / e.freq : TIME_DIV[cfg.timeIdx];
    const timeIdx = nearestIndex(TIME_DIV, (period * 2.5) / 10);
    const amp = Math.max(e.vmax - e.vmin, 1e-6);
    const vIdx = nearestIndex(VOLT_DIV, amp / 4);
    const def = defaultCfg();
    set({
      timeIdx,
      horizPosDiv: 0,
      voltsIdx: [vIdx, vIdx, vIdx, vIdx],
      positionDiv: [...POS_DEFAULT],
      coupling: [...def.coupling],
      trigger: { ...cfg.trigger, level: e.mid, edge: "rising", mode: "auto" },
      running: true,
    });
  };

  const defaultSetup = () => set({ ...defaultCfg() });

  const single = () => {
    set({ trigger: { ...cfg.trigger, mode: "single" }, running: true });
  };

  const activeColor = CH_COLORS[cfg.active];

  return (
    <div className="h-full w-full overflow-auto bg-gradient-to-b from-zinc-800 via-zinc-900 to-black p-2 text-zinc-200 sm:p-3">
      <div className="mx-auto max-w-[1180px]">
        {/* ===== Instrument chassis ===== */}
        <div
          className="rounded-2xl p-3 sm:p-4"
          style={{
            background: "linear-gradient(180deg,#e7e8ea 0%,#d3d5d8 40%,#c2c4c8 100%)",
            boxShadow:
              "0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -3px 6px rgba(0,0,0,0.2)",
          }}
        >
          {/* brand row */}
          <div className="mb-3 flex items-end justify-between px-1">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-black italic tracking-tight text-zinc-800">
                Skeuo<span className="text-red-600">tek</span>
              </span>
              <span className="hidden text-xs font-semibold text-zinc-600 sm:inline">
                TBS-2000 SERIES · DIGITAL OSCILLOSCOPE
              </span>
            </div>
            <span className="text-[10px] font-semibold text-zinc-500">
              200&nbsp;MHz · 2&nbsp;GS/s · 4&nbsp;CH
            </span>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            {/* ===== Screen ===== */}
            <div className="lg:flex-[1.6]">
              <div
                className="rounded-lg p-2"
                style={{
                  background: "linear-gradient(#26282b,#141517)",
                  boxShadow: "inset 0 3px 8px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.5)",
                }}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[4px] ring-1 ring-black/60">
                  <ScopeScreen getState={getState} onMeasure={onMeasure} onSingleCaptured={onSingleCaptured} />

                  {/* Measurement overlay (top-left) */}
                  {cfg.showMeasure && meas && nets[cfg.active] && (
                    <div className="pointer-events-none absolute left-3 top-6 rounded bg-black/55 px-2 py-1 font-mono text-[10px] leading-tight backdrop-blur-sm">
                      <div className="mb-0.5 font-bold" style={{ color: activeColor }}>
                        CH{cfg.active + 1} Messungen
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 text-zinc-200">
                        <span>Freq: {formatFreq(meas.freq)}</span>
                        <span>T: {formatTime(meas.period)}</span>
                        <span>Vpp: {formatVolt(meas.vpp)}</span>
                        <span>Vrms: {formatVolt(meas.vrms)}</span>
                        <span>Vmax: {formatVolt(meas.vmax)}</span>
                        <span>Vmin: {formatVolt(meas.vmin)}</span>
                      </div>
                    </div>
                  )}

                  {/* bottom readout bar */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-x-3 gap-y-0.5 bg-black/60 px-2 py-1 font-mono text-[10px] backdrop-blur-sm">
                    {nets.map((net, i) =>
                      net ? (
                        <span key={i} style={{ color: CH_COLORS[i] }}>
                          CH{i + 1} {formatVolt(voltsPerDiv(i))} {cfg.coupling[i]} {net}
                        </span>
                      ) : (
                        <span key={i} className="text-zinc-600">
                          CH{i + 1} offen
                        </span>
                      ),
                    )}
                    <span className="text-zinc-200">M {formatTime(TIME_DIV[cfg.timeIdx])}</span>
                    <span className="text-orange-400">
                      Trig CH{cfg.trigger.source + 1} {cfg.trigger.edge === "rising" ? "↑" : "↓"}{" "}
                      {formatVolt(cfg.trigger.level)} {cfg.trigger.mode}
                    </span>
                    {gndRef ? <span className="text-zinc-400">Ref {gndRef}</span> : null}
                  </div>
                </div>
              </div>
            </div>

            {/* ===== Control panel ===== */}
            <div
              className="rounded-lg p-3 lg:flex-1"
              style={{
                background: "linear-gradient(180deg,#cfd1d4,#b9bbbf)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -2px 4px rgba(0,0,0,0.2)",
              }}
            >
              {/* top action buttons */}
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                <PushButton onClick={autoset}>Autoset</PushButton>
                <PushButton onClick={defaultSetup} size="sm">
                  Default
                </PushButton>
                <PushButton onClick={single} active={cfg.trigger.mode === "single"} activeColor="#ffcf4b">
                  Single
                </PushButton>
                <PushButton
                  onClick={() => set({ running: !cfg.running })}
                  active={cfg.running}
                  activeColor={cfg.running ? "#7ddc4b" : "#e0533b"}
                  led
                >
                  {cfg.running ? "Run" : "Stop"}
                </PushButton>
              </div>

              {/* dark knob deck */}
              <div
                className="rounded-lg p-3"
                style={{
                  background: "linear-gradient(180deg,#2b2d31,#1b1c1f)",
                  boxShadow: "inset 0 2px 6px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.4)",
                }}
              >
                {/* HORIZONTAL */}
                <SectionLabel>Horizontal</SectionLabel>
                <div className="mb-3 flex items-center justify-around">
                  <Knob label="Position" onTurn={hPos} color="#8b8e94" />
                  <div className="text-center font-mono">
                    <div className="text-[9px] uppercase text-zinc-500">Time/Div</div>
                    <div className="text-sm font-bold text-emerald-300">{formatTime(TIME_DIV[cfg.timeIdx])}</div>
                  </div>
                  <Knob label="Scale" onTurn={hScale} color="#8b8e94" />
                </div>

                {/* TRIGGER */}
                <SectionLabel>Trigger</SectionLabel>
                <div className="mb-2 flex items-center justify-around">
                  <Knob label="Level" onTurn={trigLevel} color="#c98a2e" />
                  <div className="flex flex-col gap-1.5">
                    <PushButton
                      size="sm"
                      onClick={() => set({ trigger: { ...cfg.trigger, source: (cfg.trigger.source + 1) % NCH } })}
                    >
                      Src CH{cfg.trigger.source + 1}
                      {nets[cfg.trigger.source] ? "" : " (offen)"}
                    </PushButton>
                    <PushButton
                      size="sm"
                      onClick={() =>
                        set({ trigger: { ...cfg.trigger, edge: cfg.trigger.edge === "rising" ? "falling" : "rising" } })
                      }
                    >
                      Edge {cfg.trigger.edge === "rising" ? "↑" : "↓"}
                    </PushButton>
                    <PushButton
                      size="sm"
                      onClick={() =>
                        set({
                          trigger: {
                            ...cfg.trigger,
                            mode:
                              cfg.trigger.mode === "auto"
                                ? "normal"
                                : cfg.trigger.mode === "normal"
                                  ? "single"
                                  : "auto",
                          },
                        })
                      }
                    >
                      {cfg.trigger.mode}
                    </PushButton>
                  </div>
                  <div className="text-center font-mono">
                    <div className="text-[9px] uppercase text-zinc-500">Level</div>
                    <div className="text-sm font-bold text-orange-300">{formatVolt(cfg.trigger.level)}</div>
                  </div>
                </div>

                {/* VERTICAL */}
                <SectionLabel>Vertical</SectionLabel>
                {/* W29: Anschlussfeld – die Verdrahtung am Oszi-Symbol bestimmt
                    die Netze. Leuchtender Button = verbunden (mit Netzname),
                    dunkler Button = offener Anschluss. */}
                <div className="mb-2 flex items-center justify-center gap-2">
                  {nets.map((net, i) => (
                    <button
                      key={i}
                      onClick={() => toggleChannel(i)}
                      className="min-w-0 flex-1 rounded px-1 py-1 text-[10px] font-bold uppercase transition-all active:translate-y-[1px]"
                      style={{
                        color: net ? "#111" : "#e8e9ec",
                        background: net ? `linear-gradient(#fff,${CH_COLORS[i]})` : "linear-gradient(#5a5d63,#2c2e32)",
                        outline: cfg.active === i ? `2px solid ${CH_COLORS[i]}` : "none",
                        outlineOffset: 1,
                        boxShadow: net ? `0 0 8px ${CH_COLORS[i]}99` : "inset 0 1px 1px rgba(255,255,255,0.15)",
                      }}
                      title={
                        net
                          ? `CH${i + 1}: verbunden mit Netz „${net}“ – Klick macht den Kanal aktiv`
                          : `CH${i + 1}: offener Anschluss – Leitung am Oszi-Symbol auf dem Schaltplan verbinden`
                      }
                    >
                      CH{i + 1}
                      <span className="block truncate font-mono text-[8px] font-normal normal-case">
                        {net || "offen"}
                      </span>
                    </button>
                  ))}
                </div>
                {/* GND-Anschluss */}
                <div
                  className="mb-2 flex items-center gap-1.5 rounded border px-1.5 py-1 font-mono text-[9px]"
                  style={{
                    borderColor: "#3f4247",
                    background: "#1b1c1f",
                    color: gndNet ? "#9fd49f" : "#71757c",
                  }}
                  title={
                    gndNet
                      ? gndRef
                        ? `GND-Pin verbunden mit „${gndNet}“ – alle Kanäle messen differenziell gegen dieses Netz`
                        : "GND-Pin verbunden mit Knoten 0 – Kanäle messen direkt gegen Masse"
                      : "GND-Pin offen – Referenz ist Knoten 0 (Masse)"
                  }
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={
                      gndNet
                        ? { background: "#9fd49f", boxShadow: "0 0 6px #9fd49f" }
                        : { border: "1px solid #71757c" }
                    }
                  />
                  <span className="truncate">
                    GND {gndNet ? `· ${gndNet}${gndRef ? " (differenziell)" : " (Masse)"}` : "· offen – Referenz = 0"}
                  </span>
                </div>
                <div className="flex items-center justify-around">
                  <Knob label="Position" onTurn={vPos} color={activeColor} />
                  <div className="flex flex-col gap-1.5">
                    <PushButton
                      size="sm"
                      onClick={() =>
                        setPair(
                          "coupling",
                          cfg.active,
                          cfg.coupling[cfg.active] === "DC"
                            ? "AC"
                            : cfg.coupling[cfg.active] === "AC"
                              ? "GND"
                              : "DC",
                        )
                      }
                    >
                      {cfg.coupling[cfg.active]}
                    </PushButton>
                    <PushButton size="sm" onClick={() => setPair("probe", cfg.active, cfg.probe[cfg.active] === 1 ? 10 : 1)}>
                      {cfg.probe[cfg.active]}X
                    </PushButton>
                    <PushButton size="sm" onClick={() => set({ showMeasure: !cfg.showMeasure })} active={cfg.showMeasure} activeColor="#45d4e6">
                      Meas
                    </PushButton>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <Knob label="Scale" onTurn={vScale} color={activeColor} size={54} />
                    <div className="text-center font-mono leading-none">
                      <span className="text-[11px] font-bold" style={{ color: activeColor }}>
                        {formatVolt(voltsPerDiv(cfg.active))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* footer hint */}
          <p className="mt-3 px-1 text-center text-[10px] text-zinc-500">
            Drehknöpfe mit der Maus ziehen (hoch/runter) oder Mausrad · Autoset stellt automatisch ein ·
            Messnetze bestimmt die Verdrahtung: Leitungen an die Pins CH1–CH4 und GND des
            Oszi-Symbols auf dem Schaltplan anschließen
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-400">{children}</span>
      <div className="h-px flex-1 bg-zinc-600/60" />
    </div>
  );
}
