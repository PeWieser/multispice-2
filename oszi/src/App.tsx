import { useCallback, useMemo, useRef, useState } from "react";
import { Knob } from "./components/Knob";
import { PushButton } from "./components/PushButton";
import {
  ScopeScreen,
  type ChannelState,
  type Measurements,
  type ScreenState,
  type TriggerState,
} from "./components/ScopeScreen";
import { circuitInfo, type CircuitState, type SourceType } from "./lib/signals";
import {
  formatFreq,
  formatTime,
  formatVolt,
  TIME_DIV,
  VOLT_DIV,
} from "./lib/units";

const CH_COLORS = ["#f4e04d", "#45d4e6"];

interface ChConfig {
  enabled: boolean;
  voltsIdx: number;
  positionDiv: number;
  coupling: "DC" | "AC" | "GND";
  probe: number;
}

function nearestIndex(arr: number[], v: number) {
  let best = 0;
  let bd = Infinity;
  arr.forEach((x, i) => {
    const d = Math.abs(Math.log(x) - Math.log(v));
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

const clampIdx = (i: number, arr: number[]) =>
  Math.max(0, Math.min(arr.length - 1, i));

export default function App() {
  const [circuit, setCircuit] = useState<CircuitState>({
    source: "astable",
    freq: 1000,
    amplitude: 4,
    offset: 0,
  });

  const [chs, setChs] = useState<ChConfig[]>([
    { enabled: true, voltsIdx: nearestIndex(VOLT_DIV, 1), positionDiv: 1.6, coupling: "DC", probe: 1 },
    { enabled: true, voltsIdx: nearestIndex(VOLT_DIV, 1), positionDiv: -1.8, coupling: "DC", probe: 1 },
  ]);

  const [timeIdx, setTimeIdx] = useState(nearestIndex(TIME_DIV, 200e-6));
  const [horizPosDiv, setHorizPosDiv] = useState(0);
  const [trigger, setTrigger] = useState<TriggerState>({
    source: 0,
    level: 2.5,
    edge: "rising",
    mode: "auto",
  });
  const [running, setRunning] = useState(true);
  const [active, setActive] = useState(0);
  const [showMeasure, setShowMeasure] = useState(true);
  const [meas, setMeas] = useState<Measurements | null>(null);

  const voltsPerDiv = (c: ChConfig) => VOLT_DIV[c.voltsIdx] * c.probe;

  // Build the live screen state and keep in a ref so the render loop reads fresh values
  const screenState: ScreenState = useMemo(() => {
    const channels: ChannelState[] = chs.map((c, i) => ({
      enabled: c.enabled,
      voltsPerDiv: voltsPerDiv(c),
      positionDiv: c.positionDiv,
      coupling: c.coupling,
      color: CH_COLORS[i],
      probe: c.probe,
    }));
    return {
      circuit,
      channels,
      timePerDiv: TIME_DIV[timeIdx],
      horizPosDiv,
      trigger,
      running,
      showMeasure,
      measureChan: active,
    };
  }, [chs, circuit, timeIdx, horizPosDiv, trigger, running, showMeasure, active]);

  const stateRef = useRef(screenState);
  stateRef.current = screenState;
  const getState = useCallback(() => stateRef.current, []);
  const onMeasure = useCallback((m: Measurements | null) => setMeas(m), []);
  const onSingleCaptured = useCallback(() => setRunning(false), []);

  // ---- control handlers ----
  const setChField = (i: number, patch: Partial<ChConfig>) =>
    setChs((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  const vScale = (dir: number) =>
    setChField(active, {
      voltsIdx: clampIdx(chs[active].voltsIdx - dir, VOLT_DIV),
    });
  const vPos = (dir: number) =>
    setChField(active, {
      positionDiv: Math.max(-4, Math.min(4, chs[active].positionDiv + dir * 0.1)),
    });
  const hScale = (dir: number) => setTimeIdx((i) => clampIdx(i - dir, TIME_DIV));
  const hPos = (dir: number) =>
    setHorizPosDiv((p) => Math.max(-5, Math.min(5, p + dir * 0.2)));
  const trigLevel = (dir: number) =>
    setTrigger((t) => {
      const vdiv = voltsPerDiv(chs[t.source]);
      const nl = t.level + dir * vdiv * 0.1;
      return { ...t, level: Math.max(-6 * vdiv, Math.min(6 * vdiv, nl)) };
    });

  const toggleChannel = (i: number) => {
    if (active === i) {
      setChField(i, { enabled: !chs[i].enabled });
    } else {
      setActive(i);
      if (!chs[i].enabled) setChField(i, { enabled: true });
    }
  };

  const autoset = () => {
    if (circuit.source === "off") return;
    const period = 1 / circuit.freq;
    const newTimeIdx = nearestIndex(TIME_DIV, (period * 2.5) / 10);
    setTimeIdx(newTimeIdx);
    setHorizPosDiv(0);
    const amp = circuit.source === "astable" ? 5 : circuit.amplitude;
    const newVIdx = nearestIndex(VOLT_DIV, amp / 4);
    setChs((prev) =>
      prev.map((c, i) => ({
        ...c,
        enabled: true,
        voltsIdx: newVIdx,
        coupling: "DC",
        probe: 1,
        positionDiv: i === 0 ? 1.6 : -1.8,
      }))
    );
    const mid = circuit.source === "astable" ? 2.5 : circuit.offset;
    setTrigger((t) => ({ ...t, source: 0, level: mid, edge: "rising", mode: "auto" }));
    setRunning(true);
  };

  const defaultSetup = () => {
    setCircuit({ source: "astable", freq: 1000, amplitude: 4, offset: 0 });
    setChs([
      { enabled: true, voltsIdx: nearestIndex(VOLT_DIV, 1), positionDiv: 1.6, coupling: "DC", probe: 1 },
      { enabled: true, voltsIdx: nearestIndex(VOLT_DIV, 1), positionDiv: -1.8, coupling: "DC", probe: 1 },
    ]);
    setTimeIdx(nearestIndex(TIME_DIV, 200e-6));
    setHorizPosDiv(0);
    setTrigger({ source: 0, level: 2.5, edge: "rising", mode: "auto" });
    setRunning(true);
    setActive(0);
    setShowMeasure(true);
  };

  const single = () => {
    setTrigger((t) => ({ ...t, mode: "single" }));
    setRunning(true);
  };

  const info = circuitInfo(circuit);
  const activeColor = CH_COLORS[active];

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-zinc-800 via-zinc-900 to-black p-3 text-zinc-200 sm:p-6">
      <div className="mx-auto max-w-[1180px]">
        {/* ===== Instrument chassis ===== */}
        <div
          className="rounded-2xl p-4 sm:p-6"
          style={{
            background:
              "linear-gradient(180deg,#e7e8ea 0%,#d3d5d8 40%,#c2c4c8 100%)",
            boxShadow:
              "0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.8), inset 0 -3px 6px rgba(0,0,0,0.2)",
          }}
        >
          {/* brand row */}
          <div className="mb-3 flex items-end justify-between px-1">
            <div className="flex items-baseline gap-3">
              <span className="text-2xl font-black italic tracking-tight text-zinc-800">
                Skeuo<span className="text-red-600">Tek</span>
              </span>
              <span className="hidden text-xs font-semibold text-zinc-600 sm:inline">
                TBS-2000 SERIES · DIGITAL OSCILLOSCOPE
              </span>
            </div>
            <span className="text-[10px] font-semibold text-zinc-500">
              200&nbsp;MHz · 2&nbsp;GS/s · 2&nbsp;CH
            </span>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            {/* ===== Screen ===== */}
            <div className="lg:flex-[1.6]">
              <div
                className="rounded-lg p-2"
                style={{
                  background: "linear-gradient(#26282b,#141517)",
                  boxShadow:
                    "inset 0 3px 8px rgba(0,0,0,0.9), 0 1px 0 rgba(255,255,255,0.5)",
                }}
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[4px] ring-1 ring-black/60">
                  <ScopeScreen
                    getState={getState}
                    onMeasure={onMeasure}
                    onSingleCaptured={onSingleCaptured}
                  />

                  {/* Measurement overlay (top-left) */}
                  {showMeasure && meas && (
                    <div className="pointer-events-none absolute left-3 top-6 rounded bg-black/55 px-2 py-1 font-mono text-[10px] leading-tight backdrop-blur-sm">
                      <div
                        className="mb-0.5 font-bold"
                        style={{ color: CH_COLORS[active] }}
                      >
                        CH{active + 1} Messungen
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
                    {chs.map(
                      (c, i) =>
                        c.enabled && (
                          <span key={i} style={{ color: CH_COLORS[i] }}>
                            CH{i + 1} {formatVolt(voltsPerDiv(c))} {c.coupling}
                          </span>
                        )
                    )}
                    <span className="text-zinc-200">
                      M {formatTime(TIME_DIV[timeIdx])}
                    </span>
                    <span className="text-orange-400">
                      Trig CH{trigger.source + 1}{" "}
                      {trigger.edge === "rising" ? "↑" : "↓"}{" "}
                      {formatVolt(trigger.level)} {trigger.mode}
                    </span>
                  </div>
                </div>
              </div>

              {/* ===== Demo circuit board ===== */}
              <DemoBoard circuit={circuit} setCircuit={setCircuit} info={info} />
            </div>

            {/* ===== Control panel ===== */}
            <div
              className="rounded-lg p-3 lg:flex-1"
              style={{
                background: "linear-gradient(180deg,#cfd1d4,#b9bbbf)",
                boxShadow:
                  "inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -2px 4px rgba(0,0,0,0.2)",
              }}
            >
              {/* top action buttons */}
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                <PushButton onClick={autoset}>Autoset</PushButton>
                <PushButton onClick={defaultSetup} size="sm">
                  Default
                </PushButton>
                <PushButton onClick={single} active={trigger.mode === "single"} activeColor="#ffcf4b">
                  Single
                </PushButton>
                <PushButton
                  onClick={() => setRunning((r) => !r)}
                  active={running}
                  activeColor={running ? "#7ddc4b" : "#e0533b"}
                  led
                >
                  {running ? "Run" : "Stop"}
                </PushButton>
              </div>

              {/* dark knob deck */}
              <div
                className="rounded-lg p-3"
                style={{
                  background: "linear-gradient(180deg,#2b2d31,#1b1c1f)",
                  boxShadow:
                    "inset 0 2px 6px rgba(0,0,0,0.8), 0 1px 0 rgba(255,255,255,0.4)",
                }}
              >
                {/* HORIZONTAL */}
                <SectionLabel>Horizontal</SectionLabel>
                <div className="mb-3 flex items-center justify-around">
                  <Knob label="Position" onTurn={hPos} color="#8b8e94" />
                  <div className="text-center font-mono">
                    <div className="text-[9px] uppercase text-zinc-500">Time/Div</div>
                    <div className="text-sm font-bold text-emerald-300">
                      {formatTime(TIME_DIV[timeIdx])}
                    </div>
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
                      onClick={() =>
                        setTrigger((t) => ({ ...t, source: t.source === 0 ? 1 : 0 }))
                      }
                    >
                      Src CH{trigger.source + 1}
                    </PushButton>
                    <PushButton
                      size="sm"
                      onClick={() =>
                        setTrigger((t) => ({
                          ...t,
                          edge: t.edge === "rising" ? "falling" : "rising",
                        }))
                      }
                    >
                      Edge {trigger.edge === "rising" ? "↑" : "↓"}
                    </PushButton>
                    <PushButton
                      size="sm"
                      onClick={() =>
                        setTrigger((t) => ({
                          ...t,
                          mode:
                            t.mode === "auto"
                              ? "normal"
                              : t.mode === "normal"
                                ? "single"
                                : "auto",
                        }))
                      }
                    >
                      {trigger.mode}
                    </PushButton>
                  </div>
                  <div className="text-center font-mono">
                    <div className="text-[9px] uppercase text-zinc-500">Level</div>
                    <div className="text-sm font-bold text-orange-300">
                      {formatVolt(trigger.level)}
                    </div>
                  </div>
                </div>

                {/* VERTICAL */}
                <SectionLabel>Vertical</SectionLabel>
                <div className="mb-2 flex items-center justify-center gap-2">
                  {chs.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => toggleChannel(i)}
                      className="flex-1 rounded px-2 py-1 text-[10px] font-bold uppercase transition-all active:translate-y-[1px]"
                      style={{
                        color: c.enabled ? "#111" : "#e8e9ec",
                        background: c.enabled
                          ? `linear-gradient(#fff,${CH_COLORS[i]})`
                          : "linear-gradient(#5a5d63,#2c2e32)",
                        outline:
                          active === i ? `2px solid ${CH_COLORS[i]}` : "none",
                        outlineOffset: 1,
                        boxShadow: c.enabled
                          ? `0 0 8px ${CH_COLORS[i]}99`
                          : "inset 0 1px 1px rgba(255,255,255,0.15)",
                      }}
                    >
                      CH{i + 1}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-around">
                  <Knob label="Position" onTurn={vPos} color={activeColor} />
                  <div className="flex flex-col gap-1.5">
                    <PushButton
                      size="sm"
                      onClick={() =>
                        setChField(active, {
                          coupling:
                            chs[active].coupling === "DC"
                              ? "AC"
                              : chs[active].coupling === "AC"
                                ? "GND"
                                : "DC",
                        })
                      }
                    >
                      {chs[active].coupling}
                    </PushButton>
                    <PushButton
                      size="sm"
                      onClick={() =>
                        setChField(active, {
                          probe: chs[active].probe === 1 ? 10 : 1,
                        })
                      }
                    >
                      {chs[active].probe}X
                    </PushButton>
                    <PushButton
                      size="sm"
                      onClick={() => setShowMeasure((s) => !s)}
                      active={showMeasure}
                      activeColor="#45d4e6"
                    >
                      Meas
                    </PushButton>
                  </div>
                  <div className="flex flex-col items-center gap-0.5">
                    <Knob label="Scale" onTurn={vScale} color={activeColor} size={54} />
                    <div className="text-center font-mono leading-none">
                      <span
                        className="text-[11px] font-bold"
                        style={{ color: activeColor }}
                      >
                        {formatVolt(voltsPerDiv(chs[active]))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* BNC inputs */}
              <div className="mt-3 flex items-end justify-around">
                {chs.map((_, i) => (
                  <Bnc key={i} color={CH_COLORS[i]} label={`CH${i + 1}`} />
                ))}
                <Bnc color="#9aa" label="EXT" />
              </div>
            </div>
          </div>

          {/* footer hint */}
          <p className="mt-3 px-1 text-center text-[10px] text-zinc-500">
            Drehknöpfe mit der Maus ziehen (hoch/runter) oder Mausrad · Autoset
            stellt automatisch ein · Demo-Schaltung unten wählbar
          </p>
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2">
      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-400">
        {children}
      </span>
      <div className="h-px flex-1 bg-zinc-600/60" />
    </div>
  );
}

function Bnc({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="flex h-9 w-9 items-center justify-center rounded-full"
        style={{
          background: "radial-gradient(circle at 40% 35%,#8a8d92,#3a3c40)",
          boxShadow: "0 2px 4px rgba(0,0,0,0.6),inset 0 1px 2px rgba(255,255,255,0.4)",
        }}
      >
        <div
          className="h-5 w-5 rounded-full"
          style={{
            background: "radial-gradient(circle at 40% 35%,#2b2c2f,#0c0c0d)",
            boxShadow: "inset 0 1px 3px rgba(0,0,0,0.9)",
          }}
        >
          <div className="mx-auto mt-2 h-1 w-1 rounded-full bg-yellow-600/80" />
        </div>
      </div>
      <span
        className="rounded px-1 text-[8px] font-bold"
        style={{ color: "#222", background: color }}
      >
        {label}
      </span>
    </div>
  );
}

// ===== Demo circuit board =====
function DemoBoard({
  circuit,
  setCircuit,
  info,
}: {
  circuit: CircuitState;
  setCircuit: React.Dispatch<React.SetStateAction<CircuitState>>;
  info: { title: string; detail: string };
}) {
  const sources: { id: SourceType; label: string }[] = [
    { id: "astable", label: "Astabil" },
    { id: "sine", label: "Sinus" },
    { id: "triangle", label: "Dreieck" },
    { id: "square", label: "Rechteck" },
    { id: "off", label: "Aus" },
  ];
  return (
    <div
      className="mt-4 rounded-lg p-3"
      style={{
        background: "linear-gradient(180deg,#0d5e3a,#0a3f28)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15),0 2px 6px rgba(0,0,0,0.4)",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-emerald-200">
          🔌 Demo-Testschaltung
        </span>
        <span className="text-[10px] text-emerald-300/80">{info.title}</span>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {/* schematic */}
        <AstableSchematic active={circuit.source === "astable"} />

        <div className="flex-1">
          <div className="mb-2 grid grid-cols-5 gap-1">
            {sources.map((s) => (
              <PushButton
                key={s.id}
                size="sm"
                active={circuit.source === s.id}
                activeColor="#7ddc4b"
                onClick={() => setCircuit((c) => ({ ...c, source: s.id }))}
              >
                {s.label}
              </PushButton>
            ))}
          </div>

          <div className="space-y-2 rounded bg-black/25 p-2">
            <label className="block">
              <div className="mb-0.5 flex justify-between text-[10px] text-emerald-100">
                <span>Frequenz</span>
                <span className="font-mono">{formatFreq(circuit.freq)}</span>
              </div>
              <input
                type="range"
                min={Math.log10(20)}
                max={Math.log10(200000)}
                step={0.01}
                value={Math.log10(circuit.freq)}
                onChange={(e) =>
                  setCircuit((c) => ({
                    ...c,
                    freq: Math.round(Math.pow(10, parseFloat(e.target.value))),
                  }))
                }
                className="w-full accent-emerald-400"
              />
            </label>

            <label className="block" style={{ opacity: circuit.source === "astable" || circuit.source === "off" ? 0.4 : 1 }}>
              <div className="mb-0.5 flex justify-between text-[10px] text-emerald-100">
                <span>Amplitude (Vpp)</span>
                <span className="font-mono">{circuit.amplitude.toFixed(1)} V</span>
              </div>
              <input
                type="range"
                min={0.2}
                max={10}
                step={0.1}
                disabled={circuit.source === "astable" || circuit.source === "off"}
                value={circuit.amplitude}
                onChange={(e) =>
                  setCircuit((c) => ({ ...c, amplitude: parseFloat(e.target.value) }))
                }
                className="w-full accent-emerald-400"
              />
            </label>
          </div>
          <p className="mt-1.5 text-[9px] text-emerald-300/70">{info.detail}</p>
        </div>
      </div>
    </div>
  );
}

function AstableSchematic({ active }: { active: boolean }) {
  const on = active ? "#ffe27a" : "#5f8f78";
  return (
    <svg
      viewBox="0 0 160 120"
      className="h-[120px] w-[160px] shrink-0 rounded bg-black/25 p-1"
    >
      <g stroke={on} strokeWidth="1.4" fill="none">
        {/* rails */}
        <line x1="10" y1="14" x2="150" y2="14" />
        <line x1="10" y1="106" x2="150" y2="106" />
        {/* collector resistors */}
        <line x1="45" y1="14" x2="45" y2="30" />
        <rect x="40" y="30" width="10" height="20" />
        <line x1="115" y1="14" x2="115" y2="30" />
        <rect x="110" y="30" width="10" height="20" />
        {/* to collectors */}
        <line x1="45" y1="50" x2="45" y2="70" />
        <line x1="115" y1="50" x2="115" y2="70" />
        {/* transistors (circles) */}
        <circle cx="45" cy="82" r="12" />
        <circle cx="115" cy="82" r="12" />
        {/* emitters to gnd */}
        <line x1="45" y1="94" x2="45" y2="106" />
        <line x1="115" y1="94" x2="115" y2="106" />
        {/* cross-coupling caps */}
        <line x1="57" y1="60" x2="80" y2="60" />
        <line x1="80" y1="55" x2="80" y2="65" />
        <line x1="86" y1="55" x2="86" y2="65" />
        <line x1="86" y1="60" x2="103" y2="60" />
        <line x1="57" y1="82" x2="57" y2="60" />
        <line x1="103" y1="82" x2="103" y2="60" />
        {/* probe taps */}
        <line x1="45" y1="60" x2="30" y2="60" />
        <line x1="115" y1="60" x2="130" y2="60" />
      </g>
      <circle cx="30" cy="60" r="3" fill="#f4e04d" />
      <circle cx="130" cy="60" r="3" fill="#45d4e6" />
      <text x="14" y="55" fill="#f4e04d" fontSize="8">Q1</text>
      <text x="132" y="55" fill="#45d4e6" fontSize="8">Q2</text>
      <text x="80" y="118" fill={on} fontSize="7" textAnchor="middle">
        Astabile Kippstufe
      </text>
    </svg>
  );
}
