import { useMemo, useState } from "react";
import { FloatingWindow, IconButton, Select, Switch } from "../ui/primitives";
import { formatSI, sample, type timing as timingFn } from "./model";

type Timing = ReturnType<typeof timingFn>;

const TDIV = ["50m", "100m", "200m", "500m", "1"] as const;
const TDIV_VAL: Record<(typeof TDIV)[number], number> = { "50m": 0.05, "100m": 0.1, "200m": 0.2, "500m": 0.5, "1": 1 };
const VDIV = ["1", "2", "5"] as const;

export function Oscilloscope({
  t,
  running,
  tm,
  onClose,
}: {
  t: number;
  running: boolean;
  tm: Timing;
  onClose: () => void;
}) {
  const [tdiv, setTdiv] = useState<(typeof TDIV)[number]>("200m");
  const [vdiv, setVdiv] = useState<(typeof VDIV)[number]>("2");
  const [chA, setChA] = useState(true);
  const [chB, setChB] = useState(true);
  const [persist, setPersist] = useState(false);

  const W = 520,
    H = 240,
    DIVX = 10,
    DIVY = 8;
  const span = TDIV_VAL[tdiv] * DIVX;
  const vscale = Number(vdiv);

  const { pathA, pathB } = useMemo(() => {
    // trigger on rising edge: align window start to last rising edge before t
    const t0 = running ? Math.floor(t / tm.period) * tm.period - tm.period * 0.15 : 0;
    const N = 400;
    const ya = (v: number) => H - 20 - (v / vscale) * (H / DIVY);
    let a = "",
      b = "";
    for (let i = 0; i <= N; i++) {
      const tt = t0 + (i / N) * span;
      const s = sample(tt, tm);
      const x = (i / N) * W;
      a += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${ya(s.vout).toFixed(1)} `;
      b += `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${ya(s.vc).toFixed(1)} `;
    }
    return { pathA: a, pathB: b };
  }, [t, running, tm, span, vscale]);

  const now = sample(t, tm);

  return (
    <FloatingWindow
      title="Oszilloskop"
      subtitle="XSC1"
      onClose={onClose}
      style={{ left: 24, bottom: 24, width: W }}
      toolbar={<IconButton icon="more" label="Optionen" size="xs" />}
    >
      {/* Screen */}
      <div className="relative m-3 overflow-hidden rounded-[10px] bg-[#0b0d12] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),inset_0_0_40px_rgba(0,0,0,0.6)]">
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
          <defs>
            <pattern id="osc-grid" width={W / DIVX} height={H / DIVY} patternUnits="userSpaceOnUse">
              <path d={`M${W / DIVX} 0H0V${H / DIVY}`} fill="none" stroke="rgba(255,255,255,0.07)" />
            </pattern>
            <filter id="trace-glow">
              <feGaussianBlur stdDeviation="1.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          <rect width={W} height={H} fill="url(#osc-grid)" />
          <path d={`M0 ${H / 2}H${W}M${W / 2} 0V${H}`} stroke="rgba(255,255,255,0.14)" strokeDasharray="2 3" />
          {/* ticks on centre axes */}
          {Array.from({ length: DIVX * 5 }).map((_, i) => (
            <path key={`tx${i}`} d={`M${(i * W) / (DIVX * 5)} ${H / 2 - 3}v6`} stroke="rgba(255,255,255,0.18)" />
          ))}
          {/* ground reference marker */}
          <path d={`M0 ${H - 20}h${W}`} stroke="rgba(255,255,255,0.1)" />
          {chB && <path d={pathB} fill="none" stroke="#5ac8fa" strokeWidth={1.6} filter="url(#trace-glow)" opacity={persist ? 0.9 : 1} />}
          {chA && <path d={pathA} fill="none" stroke="#ffd60a" strokeWidth={1.6} filter="url(#trace-glow)" strokeLinejoin="round" />}
          {/* trigger marker */}
          <path d={`M${W * 0.15} 0 l-4 -0 l4 7 l4 -7z`} fill="#ff9f0a" />
          {!running && (
            <text x={W / 2} y={H / 2 - 6} textAnchor="middle" fontSize={12} fill="rgba(255,255,255,0.35)" fontFamily="var(--font-sans)">
              Simulation gestoppt — ▶ Start drücken
            </text>
          )}
        </svg>
        {/* readouts */}
        <div className="pointer-events-none absolute top-2 left-2.5 flex gap-3 font-mono text-[10.5px] text-white/70">
          <span className="text-[#ffd60a]">A · OUT</span>
          <span className="text-[#5ac8fa]">B · CAP</span>
        </div>
        <div className="tnum pointer-events-none absolute top-2 right-2.5 flex gap-3 font-mono text-[10.5px] text-white/60">
          <span>{tdiv}s/div</span>
          <span>{vdiv} V/div</span>
          <span className={running ? "text-green" : "text-white/40"}>{running ? "RUN" : "STOP"}</span>
        </div>
        <div className="tnum pointer-events-none absolute bottom-2 left-2.5 flex gap-4 font-mono text-[10.5px] text-white/60">
          <span>f = {formatSI(tm.freq, "Hz")}</span>
          <span>T = {formatSI(tm.period, "s")}</span>
          <span>D = {(tm.duty * 100).toFixed(1)} %</span>
        </div>
        <div className="tnum pointer-events-none absolute right-2.5 bottom-2 flex gap-4 font-mono text-[10.5px] text-white/60">
          <span className="text-[#ffd60a]">{now.vout.toFixed(2)} V</span>
          <span className="text-[#5ac8fa]">{now.vc.toFixed(2)} V</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4 border-t border-hairline bg-surface-2/60 px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-[#ffd60a]" />
          <Switch size="sm" checked={chA} onChange={setChA} label="Kanal A" />
        </div>
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-[#5ac8fa]" />
          <Switch size="sm" checked={chB} onChange={setChB} label="Kanal B" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select size="sm" label="Zeit" menuSide="top" value={tdiv} onChange={setTdiv} options={TDIV.map((v) => ({ value: v, label: `${v}s/div` }))} />
          <Select size="sm" label="Volt" menuSide="top" value={vdiv} onChange={setVdiv} options={VDIV.map((v) => ({ value: v, label: `${v} V/div` }))} />
          <Switch size="sm" checked={persist} onChange={setPersist} label="Nachleuchten" />
        </div>
      </div>
    </FloatingWindow>
  );
}
