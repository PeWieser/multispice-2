import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeneratorCore } from '../generator/core';
import type { GenState } from '../generator/types';
import { formatString } from '../generator/format';
import { Bnc } from './Bnc';
import type { InJack } from './cables';
import { IN_JACKS } from './cables';

const seq = (from: number, to: number) => {
  const a: number[] = [];
  for (let e = from; e <= to; e++) for (const m of [1, 2, 5]) a.push(m * Math.pow(10, e));
  return a;
};
const TDIVS = seq(-9, 0);
const VDIVS = seq(-3, 1);
const COLORS: Record<InJack, string> = { scopeA: '#ffd23f', scopeB: '#3fd0ff' };
const IN_NAME: Record<InJack, string> = { scopeA: 'CH A', scopeB: 'CH B' };
const W = 1000;
const H = 400;
const N = 1000;

export interface ScopeProps {
  core: GeneratorCore;
  state: GenState;
  /** angeschlossener Generatorkanal je Oszilloskop-Eingang (null = kein Kabel) */
  links: Record<InJack, 0 | 1 | null>;
  /** Eingangsimpedanz je Eingang */
  imp: Record<InJack, number>;
  onImp: (j: InJack, v: number) => void;
}

/** Oszilloskop als Prüfaufbau: misst nur das, was über ein Kabel anliegt */
export function Scope({ core, state, links, imp, onImp }: ScopeProps) {
  const [tdiv, setTdiv] = useState(500e-6);
  const [vdiv, setVdiv] = useState<number>(0);
  const ref = useRef<HTMLCanvasElement>(null);

  const { data, meas, peak } = useMemo(() => {
    const data = {} as Record<InJack, Float64Array | null>;
    const meas = {} as Record<InJack, { vpp: number; vrms: number; vavg: number } | null>;
    let peak = 0;
    for (const j of IN_JACKS) {
      data[j] = null;
      meas[j] = null;
      const ch = links[j];
      if (ch === null || !state.sys.power || !state.ch[ch].output) continue;
      const arr = core.block(ch, 0, (10 * tdiv) / (N - 1), N, imp[j]);
      data[j] = arr;
      let mn = Infinity, mx = -Infinity, sum = 0, sq = 0;
      for (const v of arr) { mn = Math.min(mn, v); mx = Math.max(mx, v); sum += v; sq += v * v; peak = Math.max(peak, Math.abs(v)); }
      meas[j] = { vpp: mx - mn, vrms: Math.sqrt(sq / N), vavg: sum / N };
    }
    return { data, meas, peak };
  }, [core, state, tdiv, links, imp]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const g = cv.getContext('2d')!;
    g.fillStyle = '#07110c';
    g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(80,200,120,.22)';
    g.lineWidth = 1;
    for (let i = 0; i <= 10; i++) { g.beginPath(); g.moveTo((i * W) / 10, 0); g.lineTo((i * W) / 10, H); g.stroke(); }
    for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(0, (i * H) / 8); g.lineTo(W, (i * H) / 8); g.stroke(); }
    g.strokeStyle = 'rgba(80,200,120,.5)';
    g.beginPath(); g.moveTo(0, H / 2); g.lineTo(W, H / 2); g.moveTo(W / 2, 0); g.lineTo(W / 2, H); g.stroke();

    let vd = vdiv;
    if (!vd) vd = VDIVS.find((v) => peak / v <= 3.6) ?? VDIVS[VDIVS.length - 1];

    g.lineWidth = 2;
    g.lineJoin = 'round';
    for (const j of IN_JACKS) {
      const arr = data[j];
      if (!arr) continue;
      g.strokeStyle = COLORS[j];
      g.shadowColor = COLORS[j];
      g.shadowBlur = 6;
      g.beginPath();
      for (let i = 0; i < N; i++) {
        const y = H / 2 - (arr[i] / vd) * (H / 8);
        const x = (i / (N - 1)) * W;
        if (i) g.lineTo(x, Math.max(-20, Math.min(H + 20, y))); else g.moveTo(x, y);
      }
      g.stroke();
      g.shadowBlur = 0;
    }
    g.font = '15px monospace';
    g.fillStyle = '#9fe6b5';
    g.fillText(`${formatString(tdiv, 'time')}/div   ${formatString(vd, 'volt')}/div`, 10, 20);
  }, [data, peak, tdiv, vdiv]);

  const sel = 'rounded bg-[#10151a] text-emerald-200 border border-emerald-900/70 px-2 py-1 text-sm shadow-inner';
  const nothing = IN_JACKS.every((j) => !data[j]);

  return (
    <section
      className="mx-auto mt-2 w-full max-w-[1160px] rounded-2xl p-4"
      style={{
        background: 'linear-gradient(180deg,#2c3138,#1c1f24)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12), 0 14px 26px rgba(0,0,0,.5)',
      }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-300">
          <h2 className="text-base font-semibold tracking-wide text-slate-100">Oszilloskop-Monitor (Prüfaufbau)</h2>
          <label className="flex items-center gap-2">Zeit/Div
            <select className={sel} value={tdiv} onChange={(e) => setTdiv(Number(e.target.value))}>
              {TDIVS.map((t) => <option key={t} value={t}>{formatString(t, 'time')}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2">V/Div
            <select className={sel} value={vdiv} onChange={(e) => setVdiv(Number(e.target.value))}>
              <option value={0}>Auto</option>
              {VDIVS.map((v) => <option key={v} value={v}>{formatString(v, 'volt')}</option>)}
            </select>
          </label>
        </div>

        {/* Eingangsbuchsen – hier werden die Messleitungen eingesteckt */}
        <div
          className="flex items-end gap-5 rounded-xl px-5 pb-2 pt-1"
          style={{ background: 'linear-gradient(180deg,#232830,#171a1f)', boxShadow: 'inset 0 2px 6px rgba(0,0,0,.6), 0 1px 0 rgba(255,255,255,.08)' }}
        >
          {IN_JACKS.map((j) => (
            <div key={j} className="flex flex-col items-center gap-1">
              <span className="text-xs font-semibold tracking-wide" style={{ color: COLORS[j] }}>{IN_NAME[j]}</span>
              <div style={{ position: 'relative', width: 56, height: 56 }}>
                <Bnc x={28} y={28} size={56} jackId={j} title={`Oszilloskop-Eingang ${IN_NAME[j]}`} live={!!data[j]} />
              </div>
              <select className="rounded bg-[#10151a] px-1 py-0.5 text-[11px] text-emerald-200 border border-emerald-900/70" value={imp[j]} onChange={(e) => onImp(j, Number(e.target.value))}>
                <option value={1e6}>1 MΩ</option>
                <option value={50}>50 Ω</option>
              </select>
            </div>
          ))}
        </div>
      </div>

      <div className="relative overflow-hidden rounded-xl border-4 border-[#0d0f12]" style={{ boxShadow: 'inset 0 0 20px #000, 0 1px 0 rgba(255,255,255,.15)' }}>
        <canvas ref={ref} width={W} height={H} className="block w-full" />
        {nothing && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="rounded bg-black/60 px-4 py-2 font-mono text-sm text-emerald-300/90">
              Kein Signal – Messleitung von OUT1/OUT2 an einen Eingang stecken
            </span>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-2 font-mono text-sm sm:grid-cols-2">
        {IN_JACKS.map((j) => {
          const m = meas[j];
          const ch = links[j];
          return (
            <div key={j} className="rounded-lg bg-black/40 px-3 py-2" style={{ color: COLORS[j] }}>
              {IN_NAME[j]} {ch === null ? '· kein Kabel' : `← OUT${ch + 1} @ ${imp[j] === 50 ? '50 Ω' : '1 MΩ'}`}
              {m ? `: Vpp ${formatString(m.vpp, 'volt')} · Vrms ${formatString(m.vrms, 'volt')} · Ø ${formatString(m.vavg, 'volt')}`
                 : ch !== null ? ': Ausgang aus' : ''}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-slate-400">
        Der Generator hat 50 Ω Innenwiderstand. An einem 50-Ω-Eingang halbiert sich die Spannung gegenüber „High Z“ – wie am echten Gerät.
      </p>
    </section>
  );
}
