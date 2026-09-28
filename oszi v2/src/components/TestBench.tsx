import { useEffect, useState } from 'react';
import Knob from './Knob';
import type { CircuitState, GenState, ProbeState } from '../scope/types';
import { CH_COLORS, clamp, fmt } from '../scope/types';
import { astableLedState, astableParams, sourceLabel } from '../scope/signals';

interface Props {
  circuit: CircuitState;
  setCircuit: (fn: (c: CircuitState) => CircuitState) => void;
  gen: GenState;
  setGen: (fn: (g: GenState) => GenState) => void;
  probes: ProbeState[];
  setProbes: (fn: (p: ProbeState[]) => ProbeState[]) => void;
  heldProbe: number | null;
  setHeldProbe: (n: number | null) => void;
  onTargetClick: (id: string) => void;
}

const CAPS = [470e-6, 100e-6, 47e-6, 10e-6, 4.7e-6, 1e-6, 470e-9, 100e-9, 47e-9, 10e-9, 4.7e-9, 1e-9];
const fmtC = (c: number) => fmt(c, 'F', 2).replace('.0F', 'F');
const fmtR = (r: number) => fmt(r, 'Ω', 3);

// ---------- SVG primitives ----------
const WIRE = '#e0bd6c';
const SILK = '#f4f4ee';

function Resistor({ x, y, vertical = true, label, value }: { x: number; y: number; vertical?: boolean; label: string; value: string }) {
  return vertical ? (
    <g>
      <rect x={x - 7} y={y - 22} width={14} height={44} fill="#0f4a25" stroke={SILK} strokeWidth={2} rx={2} />
      <text x={x + 12} y={y - 3} fill={SILK} fontSize={11} fontWeight={700}>{label}</text>
      <text x={x + 12} y={y + 11} fill="#bfe8c8" fontSize={10}>{value}</text>
    </g>
  ) : (
    <g>
      <rect x={x - 22} y={y - 7} width={44} height={14} fill="#0f4a25" stroke={SILK} strokeWidth={2} rx={2} />
      <text x={x - 20} y={y - 12} fill={SILK} fontSize={11} fontWeight={700}>{label}</text>
    </g>
  );
}

function Cap({ x, y, label, value }: { x: number; y: number; label: string; value: string }) {
  return (
    <g>
      <rect x={x - 7} y={y - 14} width={14} height={28} fill="#13552c" />
      <line x1={x - 5} y1={y - 13} x2={x - 5} y2={y + 13} stroke={SILK} strokeWidth={3} />
      <line x1={x + 5} y1={y - 13} x2={x + 5} y2={y + 13} stroke={SILK} strokeWidth={3} />
      <text x={x - 16} y={y - 19} fill={SILK} fontSize={11} fontWeight={700}>{label}</text>
      <text x={x - 16} y={y + 28} fill="#bfe8c8" fontSize={10}>{value}</text>
    </g>
  );
}

function Led({ x, y, on, label }: { x: number; y: number; on: number; label: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={16} fill={`rgba(255,40,30,${0.55 * on})`} style={{ filter: on > 0.1 ? 'blur(6px)' : undefined }} />
      <polygon points={`${x - 9},${y - 7} ${x + 9},${y - 7} ${x},${y + 8}`} fill={on > 0.05 ? `rgb(${140 + 115 * on},${30 + 60 * on},${30 + 40 * on})` : '#5a1a1a'} stroke={SILK} strokeWidth={1.8} />
      <line x1={x - 9} y1={y + 8} x2={x + 9} y2={y + 8} stroke={SILK} strokeWidth={2} />
      <path d={`M${x + 12} ${y - 4} l7 -6 M${x + 15} ${y + 2} l7 -6`} stroke={SILK} strokeWidth={1.3} />
      <text x={x - 38} y={y + 4} fill={SILK} fontSize={11} fontWeight={700}>{label}</text>
    </g>
  );
}

function Transistor({ x, y, mirror, label }: { x: number; y: number; mirror?: boolean; label: string }) {
  // base comes from the inside (right for T1, left for T2)
  const m = mirror ? -1 : 1;
  return (
    <g>
      <circle cx={x} cy={y} r={24} fill="#0f4a25" stroke={SILK} strokeWidth={2} />
      <line x1={x + 8 * m} y1={y - 14} x2={x + 8 * m} y2={y + 14} stroke={SILK} strokeWidth={3} />
      <line x1={x + 30 * m} y1={y} x2={x + 8 * m} y2={y} stroke={WIRE} strokeWidth={3} />
      <line x1={x + 8 * m} y1={y - 6} x2={x - 10 * m} y2={y - 25} stroke={SILK} strokeWidth={2} />
      <line x1={x + 8 * m} y1={y + 6} x2={x - 10 * m} y2={y + 25} stroke={SILK} strokeWidth={2} />
      <polygon points={`${x - 10 * m},${y + 25} ${x - 3 * m},${y + 13} ${x - 12 * m},${y + 15}`} fill={SILK} />
      <text x={mirror ? x + 30 : x - 52} y={y + 4} fill={SILK} fontSize={12} fontWeight={800}>{label}</text>
      <text x={mirror ? x + 30 : x - 60} y={y + 17} fill="#bfe8c8" fontSize={9}>BC547</text>
    </g>
  );
}

function TestPoint({ x, y, id, label, desc, probes, held, onClick, labelSide = 'right' }: {
  x: number; y: number; id: string; label: string; desc: string; probes: ProbeState[]; held: number | null; onClick: (id: string) => void; labelSide?: 'right' | 'left' | 'below';
}) {
  const attached = probes.map((p, i) => (p.target === id ? i : -1)).filter((i) => i >= 0);
  const lx = labelSide === 'left' ? x - 16 : labelSide === 'below' ? x : x + 16;
  const ly = labelSide === 'below' ? y + 26 : y - 2;
  const anchor = labelSide === 'left' ? 'end' : labelSide === 'below' ? 'middle' : 'start';
  return (
    <g className="tp" onClick={() => onClick(id)}>
      {held !== null && <circle className="tp-hint" cx={x} cy={y} r={17} fill="none" stroke={CH_COLORS[held]} strokeWidth={3} />}
      <circle cx={x} cy={y} r={14} fill="transparent" />
      <circle className="tp-ring" cx={x} cy={y} r={10} fill="#caa24c" stroke="#fff3c4" strokeWidth={2} />
      <circle cx={x} cy={y} r={4} fill="#3a2a08" />
      <text x={lx} y={ly} textAnchor={anchor} fill="#fff" fontSize={12} fontWeight={800}>{label}</text>
      <text x={lx} y={ly + 12} textAnchor={anchor} fill="#bfe8c8" fontSize={9}>{desc}</text>
      {attached.map((i, j) => (
        <g key={i}>
          <path d={`M${x} ${y} q ${8 + j * 7} ${-18 - j * 4} ${16 + j * 10} ${-26 - j * 6}`} stroke={CH_COLORS[i]} strokeWidth={4} fill="none" strokeLinecap="round" />
          <circle cx={x + 16 + j * 10} cy={y - 26 - j * 6} r={6} fill={CH_COLORS[i]} stroke="#000" strokeWidth={1} />
          <text x={x + 16 + j * 10} y={y - 23 - j * 6} textAnchor="middle" fontSize={8} fontWeight={900} fill="#000">{i + 1}</text>
        </g>
      ))}
    </g>
  );
}

// ---------- main ----------
export default function TestBench({ circuit, setCircuit, gen, setGen, probes, setProbes, heldProbe, setHeldProbe, onTargetClick }: Props) {
  const [leds, setLeds] = useState<[number, number]>([0, 0]);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const l = astableLedState(performance.now() / 1000, circuit);
      setLeds((p) => (p[0] === l[0] && p[1] === l[1] ? p : l));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [circuit]);

  const p = astableParams(circuit);
  const freq = 1 / p.T;
  const duty = (p.TA / p.T) * 100;

  const capStep = (key: 'c1' | 'c2', d: number) => setCircuit((c) => {
    const i = CAPS.findIndex((x) => Math.abs(x - c[key]) / x < 0.01);
    return { ...c, [key]: CAPS[clamp(i + d, 0, CAPS.length - 1)] };
  });

  const tpProps = { probes, held: heldProbe, onClick: onTargetClick };

  return (
    <div className="flex flex-wrap items-start justify-center gap-6">
      {/* ================= PCB ================= */}
      <div className="pcb relative p-4" style={{ width: 800 }}>
        <div className="mb-1 flex items-center justify-between">
          <div>
            <div className="text-[15px] font-extrabold tracking-wide text-[#f4f4ee]">TESTSCHALTUNG · ASTABILE KIPPSTUFE</div>
            <div className="text-[11px] text-[#bfe8c8]">Zwei kreuzgekoppelte NPN-Transistoren · f ≈ 1 / (0,69·(R<sub>B1</sub>C<sub>2</sub> + R<sub>B2</sub>C<sub>1</sub>))</div>
          </div>
          <div className="lcd7 px-3 py-1 text-right text-[13px] leading-tight">
            <div>f = {circuit.power ? fmt(freq, 'Hz', 4) : '---'}</div>
            <div className="text-[11px]">Tastgrad T1: {circuit.power ? duty.toFixed(1) + ' %' : '---'}</div>
          </div>
        </div>
        <svg viewBox="0 0 640 350" width={768} height={420} className="block">
          {/* mounting holes */}
          {[[12, 12], [628, 12], [12, 338], [628, 338]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={7} fill="#0a2a14" stroke="#caa24c" strokeWidth={3} />
          ))}
          {/* rails */}
          <line x1={60} y1={40} x2={600} y2={40} stroke={WIRE} strokeWidth={5} />
          <line x1={60} y1={322} x2={600} y2={322} stroke={WIRE} strokeWidth={5} />
          <text x={36} y={44} fill="#fff" fontSize={12} fontWeight={800}>+U<tspan fontSize={9}>B</tspan></text>
          <text x={30} y={326} fill="#fff" fontSize={12} fontWeight={800}>GND</text>
          {/* wires */}
          <g stroke={WIRE} strokeWidth={3} fill="none">
            {/* col T1 collector x=100 */}
            <path d="M100 40 V215" />
            <path d="M540 40 V215" />
            {/* RB columns */}
            <path d="M240 40 V240 H140" />
            <path d="M400 40 V240 H500" />
            {/* C1: Vc1 -> Vb2  (y=170) */}
            <path d="M100 170 H400" />
            {/* C2: Vc2 -> Vb1  (y=205) */}
            <path d="M540 205 H240" />
            {/* emitters */}
            <path d="M100 265 V322" />
            <path d="M540 265 V322" />
            {/* TP stubs */}
            <path d="M100 170 H72" />
            <path d="M540 205 H568" />
            <path d="M240 240 V278" />
            <path d="M400 240 V278" />
          </g>
          {/* crossing hops (no connection) */}
          <g fill="#13552c" stroke={WIRE} strokeWidth={3}>
            <path d="M232 170 a8 8 0 0 1 16 0" />
            <path d="M392 205 a8 8 0 0 1 16 0" />
          </g>
          <rect x={233} y={168} width={14} height={4} fill="#13552c" />
          <rect x={393} y={203} width={14} height={4} fill="#13552c" />
          <line x1={240} y1={160} x2={240} y2={180} stroke={WIRE} strokeWidth={3} />
          <line x1={400} y1={195} x2={400} y2={215} stroke={WIRE} strokeWidth={3} />
          {/* junction dots */}
          {[[100, 40], [240, 40], [400, 40], [540, 40], [100, 170], [400, 170], [540, 205], [240, 205], [240, 240], [400, 240], [100, 322], [540, 322]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r={4.5} fill={WIRE} />
          ))}
          {/* components */}
          <Led x={100} y={72} on={leds[0]} label="LED1" />
          <Resistor x={100} y={128} label="RC1" value={fmtR(circuit.rc)} />
          <Led x={540} y={72} on={leds[1]} label="LED2" />
          <Resistor x={540} y={128} label="RC2" value={fmtR(circuit.rc)} />
          <Resistor x={240} y={100} label="RB1" value={fmtR(circuit.rb1)} />
          <Resistor x={400} y={100} label="RB2" value={fmtR(circuit.rb2)} />
          <Cap x={170} y={170} label="C1" value={fmtC(circuit.c1)} />
          <Cap x={470} y={205} label="C2" value={fmtC(circuit.c2)} />
          <Transistor x={110} y={240} label="T1" />
          <Transistor x={530} y={240} mirror label="T2" />
          {/* test points */}
          <TestPoint x={60} y={170} id="tp1" label="TP1" desc="U_C T1" labelSide="below" {...tpProps} />
          <TestPoint x={240} y={290} id="tp2" label="TP2" desc="U_B T1" labelSide="right" {...tpProps} />
          <TestPoint x={580} y={205} id="tp3" label="TP3" desc="U_C T2" labelSide="below" {...tpProps} />
          <TestPoint x={400} y={290} id="tp4" label="TP4" desc="U_B T2" labelSide="right" {...tpProps} />
          <TestPoint x={320} y={322} id="gnd" label="" desc="" {...tpProps} />
          <text x={320} y={346} textAnchor="middle" fill="#fff" fontSize={10} fontWeight={800}>GND (Masseklemme)</text>
          {!circuit.power && <text x={320} y={140} textAnchor="middle" fill="#ffb4a8" fontSize={14} fontWeight={800} opacity={0.8}>SPANNUNG AUS</text>}
        </svg>

        {/* controls */}
        <div className="mt-2 flex flex-wrap items-center gap-5 rounded-lg bg-black/25 p-3">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-[#dfe]">VERSORGUNG</span>
            <button
              onClick={() => setCircuit((c) => ({ ...c, power: !c.power, powerOnT: performance.now() / 1000 }))}
              className="relative h-[46px] w-[26px] rounded-md"
              style={{ background: 'linear-gradient(90deg,#222,#444,#222)', boxShadow: 'inset 0 2px 5px #000, 0 1px 0 rgba(255,255,255,.3)' }}
              title="Versorgungsspannung ein/aus"
            >
              <span className="absolute left-[3px] h-[20px] w-[20px] rounded transition-all" style={{ top: circuit.power ? 3 : 23, background: 'linear-gradient(#f2f2f2,#9da1a6)', boxShadow: '0 2px 3px rgba(0,0,0,.6)' }} />
            </button>
            <span className="text-[10px] font-bold" style={{ color: circuit.power ? '#7dff8a' : '#ff8a7a' }}>{circuit.power ? 'EIN' : 'AUS'}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] font-bold text-[#dfe]">U<sub>B</sub></span>
            <div className="flex overflow-hidden rounded-md" style={{ boxShadow: 'inset 0 1px 3px #000' }}>
              {[5, 9, 12].map((v) => (
                <button key={v} onClick={() => setCircuit((c) => ({ ...c, vcc: v }))} className="px-2 py-1 text-[11px] font-bold"
                  style={{ background: circuit.vcc === v ? 'linear-gradient(#7dff8a,#2fa845)' : 'linear-gradient(#555,#333)', color: circuit.vcc === v ? '#062' : '#ddd' }}>
                  {v} V
                </button>
              ))}
            </div>
          </div>
          {(['c1', 'c2'] as const).map((k) => (
            <div key={k} className="flex flex-col items-center gap-1">
              <span className="text-[10px] font-bold text-[#dfe]">{k.toUpperCase()}</span>
              <div className="flex items-center gap-1">
                <button className="sk-btn" style={{ width: 22, height: 22 }} onClick={() => capStep(k, -1)}>−</button>
                <span className="lcd7 w-[62px] px-1 text-center text-[12px]">{fmtC(circuit[k])}</span>
                <button className="sk-btn" style={{ width: 22, height: 22 }} onClick={() => capStep(k, 1)}>+</button>
              </div>
            </div>
          ))}
          {(['rb1', 'rb2'] as const).map((k) => (
            <div key={k} className="flex items-center gap-1">
              <Knob size={34} variant="metal" onTurn={(d) => setCircuit((c) => ({ ...c, [k]: clamp(Math.round(c[k] * Math.pow(1.05, d) / 100) * 100, 4700, 220000) }))} title={`Trimmpoti ${k.toUpperCase()}`} />
              <div className="flex flex-col">
                <span className="text-[10px] font-bold text-[#dfe]">{k.toUpperCase()} (Poti)</span>
                <span className="lcd7 px-1 text-[12px]">{fmtR(circuit[k])}</span>
              </div>
            </div>
          ))}
          <button className="sk-btn ml-auto text-[10px]" style={{ width: 70, height: 36 }}
            onClick={() => setCircuit((c) => ({ ...c, c1: 100e-9, c2: 100e-9, rb1: 47000, rb2: 47000, vcc: 9 }))}>
            Standard-<br />werte
          </button>
        </div>
      </div>

      {/* ================= right column ================= */}
      <div className="flex flex-col gap-6" style={{ width: 520 }}>
        {/* ---- function generator ---- */}
        <div className="device-box p-4">
          <div className="flex items-center justify-between">
            <div className="text-[14px] font-extrabold italic text-[#e6e6e6]">OSZITRON <span className="font-normal not-italic text-[#aaa]">FG-100 Funktionsgenerator</span></div>
            <button onClick={() => setGen((g) => ({ ...g, on: !g.on }))} className="sk-btn text-[10px]" style={{ width: 64, height: 26, ...(gen.on ? { background: 'linear-gradient(#b8ffb8,#3ecf4a)', boxShadow: '0 0 12px #3ecf4a, 0 2px 0 #1a5a20' } : {}) }}>
              Output {gen.on ? 'EIN' : 'AUS'}
            </button>
          </div>
          <div className="lcd7 mt-3 flex items-center justify-between px-3 py-2">
            <div className="text-[22px] font-bold">{fmt(gen.freq, 'Hz', 4)}</div>
            <div className="text-right text-[12px] leading-tight">
              <div>{{ sine: 'SINUS', square: 'RECHTECK', triangle: 'DREIECK', saw: 'SÄGEZAHN', pulse: 'PULS 10%' }[gen.wave]}</div>
              <div>{gen.amp.toFixed(2)} Vss · Offs {gen.offset.toFixed(2)} V</div>
              <div>Rauschen {(gen.noise * 1000).toFixed(0)} mV</div>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            {(['sine', 'square', 'triangle', 'saw', 'pulse'] as const).map((w) => (
              <button key={w} onClick={() => setGen((g) => ({ ...g, wave: w }))} className="sk-btn sk-btn-dark" style={{ width: 52, height: 30, ...(gen.wave === w ? { boxShadow: '0 0 0 2px #7dff8a, 0 0 10px #7dff8a', color: '#7dff8a' } : {}) }} title={w}>
                <svg width="30" height="16" viewBox="0 0 30 16" fill="none" stroke="currentColor" strokeWidth="1.8">
                  {w === 'sine' && <path d="M1 8 C5 -2 10 -2 15 8 S25 18 29 8" />}
                  {w === 'square' && <path d="M1 13 V3 H15 V13 H29 V3" />}
                  {w === 'triangle' && <path d="M1 13 L8 3 L15 13 L22 3 L29 13" />}
                  {w === 'saw' && <path d="M1 13 L14 3 V13 L28 3 V13" />}
                  {w === 'pulse' && <path d="M1 13 H4 V3 H7 V13 H18 V3 H21 V13 H29" />}
                </svg>
              </button>
            ))}
          </div>
          <div className="mt-3 flex items-end justify-between">
            {[
              { l: 'Frequenz', f: (d: number) => setGen((g) => ({ ...g, freq: +clamp(g.freq * Math.pow(10, d / 30), 0.1, 25e6).toPrecision(4) })) },
              { l: 'Amplitude', f: (d: number) => setGen((g) => ({ ...g, amp: +clamp(g.amp + d * (g.amp < 1 ? 0.02 : 0.1), 0.02, 20).toFixed(2) })) },
              { l: 'Offset', f: (d: number) => setGen((g) => ({ ...g, offset: +clamp(g.offset + d * 0.1, -10, 10).toFixed(2) })) },
              { l: 'Rauschen', f: (d: number) => setGen((g) => ({ ...g, noise: +clamp(g.noise + d * 0.01, 0, 1).toFixed(2) })) },
            ].map((k) => (
              <div key={k.l} className="flex flex-col items-center">
                <Knob size={44} onTurn={k.f} title={k.l} />
                <span className="silk mt-1">{k.l}</span>
              </div>
            ))}
            <div className="flex flex-col items-center">
              <div className="flex gap-1">
                <button className="sk-btn sk-btn-dark text-[10px]" style={{ width: 34, height: 22 }} onClick={() => setGen((g) => ({ ...g, freq: clamp(g.freq / 10, 0.1, 25e6) }))}>÷10</button>
                <button className="sk-btn sk-btn-dark text-[10px]" style={{ width: 34, height: 22 }} onClick={() => setGen((g) => ({ ...g, freq: clamp(g.freq * 10, 0.1, 25e6) }))}>×10</button>
              </div>
              <svg width="60" height="58" viewBox="0 0 60 58" className="mt-1">
                <TestPoint x={30} y={24} id="gen" label="" desc="" {...tpProps} />
              </svg>
              <span className="silk -mt-2">OUTPUT 50Ω</span>
            </div>
          </div>
        </div>

        {/* ---- probe tray ---- */}
        <div className="device-box p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[13px] font-extrabold text-[#e6e6e6]">TASTKÖPFE</span>
            <span className="text-[10px] text-[#aaa]">Aufnehmen → auf Messpunkt klicken</span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {probes.map((pr, i) => (
              <div key={i} className="probe-card p-2" style={{ boxShadow: heldProbe === i ? `0 0 0 2px ${CH_COLORS[i]}, 0 0 16px ${CH_COLORS[i]}` : undefined }}>
                <div className="flex items-center gap-2">
                  <span className="h-4 w-4 rounded-full" style={{ background: CH_COLORS[i], boxShadow: '0 0 6px ' + CH_COLORS[i] }} />
                  <span className="text-[12px] font-bold text-white">CH{i + 1}</span>
                  <span className="ml-auto text-[11px] text-[#cde]">Spitze: <b className="text-white">{sourceLabel(pr.target)}</b></span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button className="sk-btn text-[10px]" style={{ width: 70, height: 24, ...(heldProbe === i ? { background: `linear-gradient(#fff, ${CH_COLORS[i]})` } : {}) }} onClick={() => setHeldProbe(heldProbe === i ? null : i)}>
                    {heldProbe === i ? 'Ablegen' : 'Aufnehmen'}
                  </button>
                  <button className="sk-btn text-[10px]" style={{ width: 46, height: 24 }} onClick={() => setProbes((ps) => ps.map((p, j) => (j === i ? { ...p, target: null } : p)))}>Lösen</button>
                  {/* 1X/10X slide switch */}
                  <button
                    onClick={() => setProbes((ps) => ps.map((p, j) => (j === i ? { ...p, atten: p.atten === 10 ? 1 : 10 } : p)))}
                    className="relative ml-auto h-[22px] w-[54px] rounded-full text-[9px] font-bold"
                    style={{ background: 'linear-gradient(#111,#333)', boxShadow: 'inset 0 1px 3px #000' }}
                    title="Tastkopf-Teiler (Schiebeschalter am Tastkopf)"
                  >
                    <span className="absolute left-[6px] top-[5px] text-[#888]">1X</span>
                    <span className="absolute right-[4px] top-[5px] text-[#888]">10X</span>
                    <span className="absolute top-[2px] flex h-[18px] w-[26px] items-center justify-center rounded-full text-[9px] text-[#222] transition-all" style={{ left: pr.atten === 10 ? 26 : 2, background: 'linear-gradient(#fafafa,#aaa)' }}>{pr.atten}X</span>
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Knob size={26} variant="metal" disabled={pr.atten === 1} onTurn={(d) => setProbes((ps) => ps.map((p, j) => (j === i ? { ...p, comp: +clamp(p.comp + d * 0.03, -0.6, 0.6).toFixed(2) } : p)))} title="Abgleich-Trimmer" />
                  <div className="text-[10px] leading-tight text-[#cde]">
                    Abgleich-Trimmer: <b className="text-white">{pr.atten === 1 ? '—' : (pr.comp > 0 ? '+' : '') + Math.round(pr.comp * 100) + ' %'}</b><br />
                    <span className="text-[#8a9]">{pr.atten === 1 ? '1X: Bandbreite ≈ 6 MHz' : Math.abs(pr.comp) < 0.02 ? 'korrekt abgeglichen' : pr.comp > 0 ? 'überkompensiert' : 'unterkompensiert'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
