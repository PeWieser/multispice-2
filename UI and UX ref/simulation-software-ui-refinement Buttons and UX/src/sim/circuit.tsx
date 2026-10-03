import React, { useEffect, useRef, useState } from "react";

/* ============================ Simulations-Engine ============================ */

export type SimState = {
  t: number;
  phase: number;
  high: boolean;
  capV: number;
  outV: number;
  ledI: number;
  freq: number;
  reset: () => void;
};

export function useSim(running: boolean, freq: number): SimState {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      setT((p) => p + dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  const duty = 0.62;
  const phase = (t * freq) % 1;
  const high = phase < duty;
  const frac = high ? phase / duty : (phase - duty) / (1 - duty);
  // 555: Kondensator pendelt zwischen 1/3 und 2/3 VCC ( exponentiell angenähert )
  const ease = (x: number) => 1 - Math.exp(-3.2 * x);
  const capV = high ? 3 + 3 * ease(frac) : 6 - 3 * ease(frac);
  const outV = high ? 8.72 : 0.18;
  const ledI = high ? 14.6 : 0;
  return { t, phase, high, capV, outV, ledI, freq, reset: () => setT(0) };
}

/* ============================ Metadaten ============================ */

export type CompMeta = { ref: string; name: string; cat: string; value: string; desc: string; specs: Array<[string, string]> };

export const COMP_META: Record<string, CompMeta> = {
  V1: {
    ref: "V1", name: "Gleichspannungsquelle", cat: "Quellen", value: "9 V",
    desc: "Ideale Spannungsquelle mit kleinem Innenwiderstand. Versorgt die gesamte Schaltung.",
    specs: [["Spannung", "9,0 V"], ["Innenwiderstand", "0,1 Ω"], ["Strom (max)", "500 mA"], ["Modell", "VDC ideal"]],
  },
  R1: {
    ref: "R1", name: "Widerstand", cat: "Passive", value: "10 kΩ",
    desc: "Ladewiderstand des astabilen Multivibrators. Bestimmt zusammen mit R2 und C1 die Frequenz.",
    specs: [["Widerstand", "10 kΩ"], ["Toleranz", "±1 %"], ["Belastbarkeit", "0,25 W"], ["Bauform", "0603"]],
  },
  R2: {
    ref: "R2", name: "Widerstand", cat: "Passive", value: "47 kΩ",
    desc: "Entladewiderstand. Das Verhältnis R1 : R2 legt das Tastverhältnis fest.",
    specs: [["Widerstand", "47 kΩ"], ["Toleranz", "±1 %"], ["Belastbarkeit", "0,25 W"], ["Bauform", "0603"]],
  },
  C1: {
    ref: "C1", name: "Elektrolytkondensator", cat: "Passive", value: "10 µF",
    desc: "Zeitbestimmender Kondensator. Seine Spannung pendelt zwischen ⅓ und ⅔ VCC.",
    specs: [["Kapazität", "10 µF"], ["Nennspannung", "25 V"], ["Toleranz", "±20 %"], ["ESR", "1,2 Ω"]],
  },
  U1: {
    ref: "U1", name: "Timer NE555", cat: "ICs", value: "NE555",
    desc: "Klassischer Timer-Baustein als astabiler Multivibrator beschaltet. Herz des Blinkers.",
    specs: [["Versorgung", "4,5 – 16 V"], ["Ausgangsfrequenz", "≈ 1,4 Hz"], ["Tastverhältnis", "62 %"], ["Gehäuse", "SO-8"]],
  },
  R3: {
    ref: "R3", name: "Widerstand", cat: "Passive", value: "470 Ω",
    desc: "Vorwiderstand der LED. Begrenzt den Strom auf augenfreundliche 15 mA.",
    specs: [["Widerstand", "470 Ω"], ["Toleranz", "±1 %"], ["Strom (ein)", "14,6 mA"], ["Bauform", "0603"]],
  },
  D1: {
    ref: "D1", name: "LED, rot", cat: "Dioden", value: "5 mm",
    desc: "Leuchtdiode als optischer Ausgang. Blinkt im Takt des 555-Ausgangs.",
    specs: [["Farbe", "Rot · 625 nm"], ["Flussspannung", "2,0 V"], ["Strom (ein)", "14,6 mA"], ["Bauform", "5 mm klar"]],
  },
};

export const NET_META: Record<string, { name: string; desc: string }> = {
  VCC: { name: "VCC · 9,0 V", desc: "Versorgungsnetz. Verbindet V1 mit R1, RST und VCC des 555." },
  DIS: { name: "DIS · Knoten R1/R2", desc: "Entladeknoten. Wird vom 555 periodisch gegen Masse geschaltet." },
  CAP: { name: "CAP · Dreieck", desc: "Zeitkonstante aus R2 und C1. Sägezahn zwischen 3 V und 6 V." },
  OUT: { name: "OUT · Rechteck", desc: "Schaltausgang des 555. Treibt über R3 die LED." },
  GND: { name: "GND · 0 V", desc: "Bezugspotenzial. Sternförmig zu allen Massepunkten geführt." },
};

/* ============================ Schaltplan ============================ */

export type Sel = { type: "comp" | "net"; id: string } | null;

const W = "#0a62d0";

function Ground({ x, y, selected, onPick }: { x: number; y: number; selected: boolean; onPick: () => void }) {
  return (
    <g onClick={(e) => { e.stopPropagation(); onPick(); }} className="cursor-pointer">
      <rect x={x - 16} y={y - 26} width={32} height={44} fill="transparent" />
      <g stroke={selected ? W : "var(--ink-2)"} strokeWidth={selected ? 2.6 : 2} strokeLinecap="round">
        <line x1={x} y1={y - 24} x2={x} y2={y - 8} />
        <line x1={x - 10} y1={y - 8} x2={x + 10} y2={y - 8} />
        <line x1={x - 6.5} y1={y - 3.5} x2={x + 6.5} y2={y - 3.5} />
        <line x1={x - 3} y1={y + 1} x2={x + 3} y2={y + 1} />
      </g>
      {selected && <circle cx={x} cy={y - 14} r={3.4} fill={W} />}
    </g>
  );
}

function NetPill({ x, y, label, hot, sel, onPick }: { x: number; y: number; label: string; hot: boolean; sel: boolean; onPick: () => void }) {
  return (
    <g onClick={(e) => { e.stopPropagation(); onPick(); }} className="cursor-pointer">
      <rect x={x - 24} y={y - 11} width={48} height={22} rx={11}
        fill={sel ? W : hot ? "color-mix(in srgb, #ff9f0a 16%, var(--panel))" : "var(--panel)"}
        stroke={sel ? W : hot ? "#ff9f0a" : "var(--hair-strong)"} strokeWidth={sel ? 2 : 1.2} />
      <text x={x} y={y + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}
        letterSpacing="0.04em" fill={sel ? "#fff" : hot ? "#b25e09" : "var(--ink-2)"} fontFamily="Inter,sans-serif">{label}</text>
    </g>
  );
}

function LiveFlag({ x, y, v, unit, tone }: { x: number; y: number; v: string; unit: string; tone: string }) {
  return (
    <g className="pointer-events-none">
      <rect x={x - 44} y={y - 13} width={88} height={26} rx={8} fill="rgba(20,20,24,0.88)" />
      <circle cx={x - 32} cy={y} r={3.5} fill={tone} className="live-dot" />
      <text x={x + 4} y={y + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={12.5} fontWeight={600}
        fill="#fff" fontFamily="'JetBrains Mono',monospace" className="tabular">{v}<tspan fontSize={10} fill="rgba(255,255,255,.6)"> {unit}</tspan></text>
    </g>
  );
}

export function CircuitCanvas({
  sim, running, selected, onSelect, showGrid = true, showLabels = true,
}: {
  sim: SimState;
  running: boolean;
  selected: Sel;
  onSelect: (s: Sel) => void;
  showGrid?: boolean;
  showLabels?: boolean;
}) {
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const drag = useRef<{ sx: number; sy: number; ox: number; oy: number; moved: boolean } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const isSel = (t: "comp" | "net", id: string) => selected?.type === t && selected.id === id;
  const pick = (t: "comp" | "net", id: string) => (e: React.MouseEvent) => { e.stopPropagation(); onSelect({ type: t, id }); };

  const zoomBy = (f: number) => setView((v) => ({ ...v, k: Math.min(3, Math.max(0.4, v.k * f)) }));

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setView((v) => ({ ...v, k: Math.min(3, Math.max(0.4, v.k * Math.exp(-e.deltaY * 0.0012))) }));
  };

  const wire = (d: string, net: string, opts?: { hot?: boolean; w?: number }) => {
    const sel = isSel("net", net);
    const hot = opts?.hot ?? false;
    return (
      <g key={d} onClick={pick("net", net)} className="cursor-pointer">
        <path d={d} fill="none" stroke="transparent" strokeWidth={14} strokeLinejoin="round" strokeLinecap="round" />
        <path d={d} fill="none" stroke={sel ? W : hot ? "#e88200" : "var(--wire)"} strokeWidth={sel ? 3 : opts?.w ?? 2.2}
          strokeLinejoin="round" strokeLinecap="round" style={{ filter: sel ? "drop-shadow(0 0 5px rgba(10,98,208,.55))" : undefined }} />
        {hot && running && (
          <path d={d} fill="none" stroke={net === "OUT" ? "#ffd60a" : "#ff9f0a"} strokeWidth={2.2}
            strokeLinejoin="round" strokeLinecap="round" className="wire-flow" opacity={0.95} />
        )}
      </g>
    );
  };
  const dot = (x: number, y: number, net: string, hot = false) => (
    <g key={`d${x}${y}`} onClick={pick("net", net)} className="cursor-pointer">
      <circle cx={x} cy={y} r={9} fill="transparent" />
      <circle cx={x} cy={y} r={isSel("net", net) ? 5.4 : 4.2} fill={hot && running ? "#e88200" : "var(--wire)"}
        style={isSel("net", net) ? { filter: "drop-shadow(0 0 5px rgba(10,98,208,.6))" } : undefined} />
      <circle cx={x} cy={y} r={1.4} fill="#fff" opacity={0.85} />
    </g>
  );

  const bodyFill = "var(--panel)";
  const bodyStroke = "var(--ink-3)";
  const compRing = (id: string, x: number, y: number, w: number, h: number, r = 10) =>
    isSel("comp", id) ? (
      <rect x={x} y={y} width={w} height={h} rx={r} fill="none" stroke={W} strokeWidth={2}
        style={{ filter: "drop-shadow(0 0 6px rgba(10,98,208,.5))" }} />
    ) : null;

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: "var(--canvas)" }}>
      <svg
        ref={svgRef}
        viewBox="0 0 960 680"
        className="h-full w-full"
        style={{ cursor: drag.current ? "grabbing" : "grab", touchAction: "none" }}
        onWheel={onWheel}
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          drag.current = { sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
          if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
          if (d.moved) {
            const rect = svgRef.current?.getBoundingClientRect();
            const s = rect ? 960 / rect.width / view.k : 1;
            setView((v) => ({ ...v, x: d.ox + dx * s, y: d.oy + dy * s }));
          }
        }}
        onPointerUp={() => {
          if (drag.current && !drag.current.moved) onSelect(null);
          drag.current = null;
        }}
      >
        <defs>
          <pattern id="gridS" width="14" height="14" patternUnits="userSpaceOnUse">
            <path d="M14 0H0v14" fill="none" stroke="var(--grid-minor)" strokeWidth="1" />
          </pattern>
          <pattern id="gridL" width="70" height="70" patternUnits="userSpaceOnUse">
            <path d="M70 0H0v70" fill="none" stroke="var(--grid-major)" strokeWidth="1" />
          </pattern>
          <filter id="soft" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="2" floodColor="#000" floodOpacity="0.14" />
          </filter>
          <radialGradient id="ledGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#ff6961" stopOpacity="0.9" />
            <stop offset="45%" stopColor="#ff9f0a" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#ff9f0a" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="icFace" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="100%" stopColor="#f1f1f4" />
          </linearGradient>
        </defs>

        {showGrid && (
          <g>
            <rect x={-2000} y={-2000} width={5000} height={5000} fill="url(#gridS)" />
            <rect x={-2000} y={-2000} width={5000} height={5000} fill="url(#gridL)" />
          </g>
        )}

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {/* ================= Wires ================= */}
          {/* VCC rail */}
          {wire("M170 374 V170 H620", "VCC", { hot: running })}
          {wire("M395 285 V170", "VCC", { hot: running })}
          {wire("M340 195 V170", "VCC", { hot: running })}
          {wire("M610 330 V170", "VCC", { hot: running })}
          {/* RST feed */}
          {wire("M450 330 H462 V285 H395", "VCC", { hot: running })}
          {/* R1 bottom -> DIS node */}
          {wire("M340 253 V300", "DIS")}
          {wire("M450 365 H370 V300 H340", "DIS")}
          {/* R2 */}
          {wire("M340 300 V320", "DIS")}
          {wire("M340 380 V470", "CAP")}
          {/* TRG / THR to CAP */}
          {wire("M450 400 H350 V470 H340", "CAP")}
          {wire("M450 435 H390 V470 H340", "CAP")}
          {/* C1 */}
          {wire("M340 470 V488", "CAP")}
          {wire("M340 496 V530", "GND")}
          {/* V1 bottom */}
          {wire("M170 426 V500", "GND")}
          {/* GND pin */}
          {wire("M570 400 H625 V545", "GND")}
          {/* CTRL to GND */}
          {wire("M570 435 H590 V500 H625", "GND")}
          {/* OUT */}
          {wire("M570 365 H640", "OUT", { hot: running && sim.high })}
          {wire("M700 365 H735", "OUT", { hot: running && sim.high })}
          {wire("M762 365 H790 V430", "GND")}
          {/* GND pin ground lead */}
          {wire("M400 458 V505", "GND")}
          {wire("M450 435 H400 V458", "GND")}

          {/* junction dots */}
          {dot(170, 170, "VCC", true)}
          {dot(340, 170, "VCC", true)}
          {dot(395, 170, "VCC", true)}
          {dot(610, 170, "VCC", true)}
          {dot(340, 300, "DIS")}
          {dot(340, 470, "CAP")}
          {dot(625, 500, "GND")}

          {/* ================= V1 Quelle ================= */}
          <g onClick={pick("comp", "V1")} className="cursor-pointer">
            <rect x={128} y={348} width={84} height={104} fill="transparent" />
            <circle cx={170} cy={400} r={26} fill={bodyFill} stroke={bodyStroke} strokeWidth={2} filter="url(#soft)" />
            <text x={170} y={392} textAnchor="middle" fontSize={17} fontWeight={600} fill="var(--ink-1)" fontFamily="Inter,sans-serif">+</text>
            <text x={170} y={415} textAnchor="middle" fontSize={17} fontWeight={600} fill="var(--ink-3)" fontFamily="Inter,sans-serif">−</text>
            {showLabels && (
              <g fontFamily="Inter,sans-serif">
                <text x={112} y={400} textAnchor="end" fontSize={12.5} fontWeight={700} fill="var(--ink-1)">V1</text>
                <text x={204} y={404} fontSize={11.5} fontWeight={500} fill="var(--ink-2)">9 V</text>
              </g>
            )}
            {compRing("V1", 140, 370, 60, 60, 30)}
          </g>

          {/* ================= R1 ================= */}
          <g onClick={pick("comp", "R1")} className="cursor-pointer">
            <rect x={318} y={190} width={66} height={72} fill="transparent" />
            <rect x={329} y={197} width={22} height={56} rx={3} fill={bodyFill} stroke={bodyStroke} strokeWidth={2} filter="url(#soft)" />
            {showLabels && (
              <g fontFamily="Inter,sans-serif">
                <text x={358} y={220} fontSize={12} fontWeight={700} fill="var(--ink-1)">R1</text>
                <text x={358} y={235} fontSize={10.5} fill="var(--ink-2)">10 kΩ</text>
              </g>
            )}
            {compRing("R1", 323, 191, 34, 68, 8)}
          </g>

          {/* ================= R2 ================= */}
          <g onClick={pick("comp", "R2")} className="cursor-pointer">
            <rect x={318} y={315} width={66} height={72} fill="transparent" />
            <rect x={329} y={320} width={22} height={60} rx={3} fill={bodyFill} stroke={bodyStroke} strokeWidth={2} filter="url(#soft)" />
            {showLabels && (
              <g fontFamily="Inter,sans-serif">
                <text x={358} y={345} fontSize={12} fontWeight={700} fill="var(--ink-1)">R2</text>
                <text x={358} y={360} fontSize={10.5} fill="var(--ink-2)">47 kΩ</text>
              </g>
            )}
            {compRing("R2", 323, 314, 34, 72, 8)}
          </g>

          {/* ================= C1 ================= */}
          <g onClick={pick("comp", "C1")} className="cursor-pointer">
            <rect x={312} y={484} width={70} height={40} fill="transparent" />
            <line x1={324} y1={488} x2={356} y2={488} stroke="var(--ink-1)" strokeWidth={2.6} strokeLinecap="round" />
            <path d="M328 496 h24 v7 h-24 z" fill="none" stroke="var(--ink-1)" strokeWidth={2.2} strokeLinejoin="round" />
            <text x={318} y={486} fontSize={10} fontWeight={700} fill="var(--ink-3)" fontFamily="Inter,sans-serif">+</text>
            {showLabels && (
              <g fontFamily="Inter,sans-serif">
                <text x={362} y={497} fontSize={12} fontWeight={700} fill="var(--ink-1)">C1</text>
                <text x={362} y={512} fontSize={10.5} fill="var(--ink-2)">10 µF</text>
              </g>
            )}
            {compRing("C1", 316, 480, 64, 30, 8)}
          </g>

          {/* ================= U1 555 ================= */}
          <g onClick={pick("comp", "U1")} className="cursor-pointer">
            <rect x={438} y={298} width={144} height={164} rx={12} fill="transparent" />
            <rect x={450} y={310} width={120} height={140} rx={9} fill="url(#icFace)" stroke="var(--ink-2)" strokeWidth={2} filter="url(#soft)"
              className="dark:[fill:var(--panel)]" />
            <path d="M492 310 a8 8 0 0 0 16 0" fill="none" stroke="var(--ink-3)" strokeWidth={1.6} />
            <circle cx={459} cy={319} r={2.2} fill="var(--ink-3)" />
            <text x={510} y={332} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--ink-1)" fontFamily="Inter,sans-serif" letterSpacing="0.06em">555</text>
            <text x={510} y={448} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--ink-3)" fontFamily="'JetBrains Mono',monospace">NE555 · SO-8</text>
            {/* pins left */}
            {[
              { y: 330, n: "4", t: "RST" }, { y: 365, n: "7", t: "DIS" }, { y: 400, n: "2", t: "TRG" }, { y: 435, n: "6", t: "THR" },
            ].map((p) => (
              <g key={p.t}>
                <line x1={438} y1={p.y} x2={450} y2={p.y} stroke="var(--wire)" strokeWidth={2.2} />
                <circle cx={438} cy={p.y} r={2.4} fill="var(--wire)" />
                <text x={457} y={p.y - 7} fontSize={8} fontWeight={600} fill="var(--ink-3)" fontFamily="'JetBrains Mono',monospace">{p.n}</text>
                <text x={457} y={p.y + 3.5} fontSize={9.5} fontWeight={700} fill="var(--ink-1)" fontFamily="Inter,sans-serif">{p.t}</text>
              </g>
            ))}
            {/* pins right */}
            {[
              { y: 330, n: "8", t: "VCC" }, { y: 365, n: "3", t: "OUT" }, { y: 400, n: "1", t: "GND" }, { y: 435, n: "5", t: "CTRL" },
            ].map((p) => (
              <g key={p.t}>
                <line x1={570} y1={p.y} x2={582} y2={p.y} stroke="var(--wire)" strokeWidth={2.2} />
                <circle cx={582} cy={p.y} r={2.4} fill="var(--wire)" />
                <text x={563} y={p.y - 7} textAnchor="end" fontSize={8} fontWeight={600} fill="var(--ink-3)" fontFamily="'JetBrains Mono',monospace">{p.n}</text>
                <text x={563} y={p.y + 3.5} textAnchor="end" fontSize={9.5} fontWeight={700} fill={p.t === "OUT" && running && sim.high ? "#b25e09" : "var(--ink-1)"} fontFamily="Inter,sans-serif">{p.t}</text>
              </g>
            ))}
            {showLabels && (
              <text x={510} y={470} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--ink-1)" fontFamily="Inter,sans-serif">U1</text>
            )}
            {compRing("U1", 442, 302, 136, 156, 12)}
          </g>

          {/* ================= R3 ================= */}
          <g onClick={pick("comp", "R3")} className="cursor-pointer">
            <rect x={634} y={343} width={72} height={44} fill="transparent" />
            <rect x={640} y={354} width={60} height={22} rx={3} fill={bodyFill} stroke={bodyStroke} strokeWidth={2} filter="url(#soft)" />
            {showLabels && (
              <g fontFamily="Inter,sans-serif">
                <text x={670} y={346} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--ink-1)">R3</text>
                <text x={670} y={392} textAnchor="middle" fontSize={10.5} fill="var(--ink-2)">470 Ω</text>
              </g>
            )}
            {compRing("R3", 634, 348, 72, 34, 8)}
          </g>

          {/* ================= D1 LED ================= */}
          <g onClick={pick("comp", "D1")} className="cursor-pointer">
            <rect x={728} y={335} width={56} height={60} fill="transparent" />
            {running && sim.high && <circle cx={748} cy={365} r={44} fill="url(#ledGlow)" className="led-on" />}
            <path d="M735 353v24l17-12z" fill={running && sim.high ? "#ff5147" : bodyFill}
              stroke={running && sim.high ? "#d70015" : "var(--ink-1)"} strokeWidth={2.2} strokeLinejoin="round" />
            <line x1={752} y1={353} x2={752} y2={377} stroke={running && sim.high ? "#d70015" : "var(--ink-1)"} strokeWidth={2.2} strokeLinecap="round" />
            {(running && sim.high) || true ? (
              <g stroke={running && sim.high ? "#ff9f0a" : "var(--ink-4)"} strokeWidth={1.6} strokeLinecap="round"
                opacity={running && sim.high ? 1 : 0.55}>
                <line x1={742} y1={347} x2={748} y2={340} />
                <line x1={750} y1={349} x2={758} y2={342} />
              </g>
            ) : null}
            {showLabels && (
              <g fontFamily="Inter,sans-serif">
                <text x={748} y={412} textAnchor="middle" fontSize={12} fontWeight={700} fill="var(--ink-1)">D1</text>
              </g>
            )}
            {compRing("D1", 730, 342, 44, 46, 10)}
          </g>

          {/* ================= Grounds ================= */}
          <Ground x={170} y={528} selected={isSel("net", "GND")} onPick={() => onSelect({ type: "net", id: "GND" })} />
          <Ground x={340} y={558} selected={isSel("net", "GND")} onPick={() => onSelect({ type: "net", id: "GND" })} />
          <Ground x={400} y={533} selected={isSel("net", "GND")} onPick={() => onSelect({ type: "net", id: "GND" })} />
          <Ground x={625} y={573} selected={isSel("net", "GND")} onPick={() => onSelect({ type: "net", id: "GND" })} />
          <Ground x={790} y={458} selected={isSel("net", "GND")} onPick={() => onSelect({ type: "net", id: "GND" })} />

          {/* ================= Net pills ================= */}
          <NetPill x={605} y={343} label="OUT" hot={running && sim.high} sel={isSel("net", "OUT")} onPick={() => onSelect({ type: "net", id: "OUT" })} />
          <NetPill x={292} y={470} label="CAP" hot={running} sel={isSel("net", "CAP")} onPick={() => onSelect({ type: "net", id: "CAP" })} />

          {/* ================= Live flags ================= */}
          {running && (
            <g>
              <LiveFlag x={670} y={318} v={sim.outV.toFixed(2)} unit="V" tone={sim.high ? "#ffd60a" : "#636366"} />
              <LiveFlag x={252} y={500} v={sim.capV.toFixed(2)} unit="V" tone="#64d2ff" />
            </g>
          )}
        </g>
      </svg>

      {/* Zoom HUD */}
      <div className="absolute bottom-3 right-3 flex select-none flex-col overflow-hidden rounded-[12px] shadow-float"
        style={{ background: "var(--panel)", boxShadow: "inset 0 0 0 .5px var(--hair), 0 8px 24px -6px rgba(0,0,0,.18)" }}>
        <button onClick={() => zoomBy(1.25)} aria-label="Vergrößern"
          className="pressable ring-focus flex h-[34px] w-[36px] items-center justify-center text-[17px] font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
          style={{ color: "var(--ink-1)" }}>+</button>
        <div style={{ borderTop: "1px solid var(--hair)" }} />
        <button onClick={() => zoomBy(0.8)} aria-label="Verkleinern"
          className="pressable ring-focus flex h-[34px] w-[36px] items-center justify-center text-[17px] font-medium hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
          style={{ color: "var(--ink-1)" }}>−</button>
        <div style={{ borderTop: "1px solid var(--hair)" }} />
        <button onClick={() => setView({ x: 0, y: 0, k: 1 })} aria-label="Einpassen"
          className="pressable ring-focus flex h-[28px] w-[36px] items-center justify-center text-[9.5px] font-bold tracking-wide hover:bg-black/[0.05] dark:hover:bg-white/[0.08]"
          style={{ color: "var(--ink-2)" }}>FIT</button>
      </div>
      <div className="tabular pointer-events-none absolute bottom-3 left-3 rounded-[8px] px-2 py-1 font-mono text-[10.5px] font-medium"
        style={{ background: "color-mix(in srgb, var(--panel) 82%, transparent)", color: "var(--ink-3)", boxShadow: "inset 0 0 0 .5px var(--hair)" }}>
        {Math.round(view.k * 100)} % · Raster 2,54 mm
      </div>
    </div>
  );
}

/* ============================ Oszilloskop ============================ */

export function ScopeCanvas({ sim, running, height = 190 }: { sim: SimState; running: boolean; height?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hist = useRef<Array<{ o: number; c: number }>>([]);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    const draw = () => {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
        cv.width = Math.round(r.width * dpr);
        cv.height = Math.round(r.height * dpr);
      }
      const Wd = cv.width, Ht = cv.height;
      ctx.clearRect(0, 0, Wd, Ht);
      // bg
      ctx.fillStyle = "#0e1116";
      ctx.fillRect(0, 0, Wd, Ht);
      // grid
      ctx.strokeStyle = "rgba(255,255,255,.07)";
      ctx.lineWidth = 1;
      const nx = 10, ny = 8;
      for (let i = 1; i < nx; i++) {
        ctx.beginPath(); ctx.moveTo((Wd / nx) * i, 0); ctx.lineTo((Wd / nx) * i, Ht); ctx.stroke();
      }
      for (let i = 1; i < ny; i++) {
        ctx.beginPath(); ctx.moveTo(0, (Ht / ny) * i); ctx.lineTo(Wd, (Ht / ny) * i); ctx.stroke();
      }
      ctx.strokeStyle = "rgba(255,255,255,.14)";
      ctx.beginPath(); ctx.moveTo(Wd / 2, 0); ctx.lineTo(Wd / 2, Ht); ctx.stroke();

      if (running) {
        hist.current.push({ o: sim.high ? 1 : 0, c: sim.capV / 9 });
        if (hist.current.length > 420) hist.current.shift();
      }
      const h = hist.current;
      const trace = (get: (p: { o: number; c: number }) => number, color: string, glow: string, y0: number, amp: number) => {
        if (h.length < 2) return;
        ctx.save();
        ctx.shadowColor = glow; ctx.shadowBlur = 7 * dpr;
        ctx.strokeStyle = color; ctx.lineWidth = 1.8 * dpr;
        ctx.lineJoin = "round";
        ctx.beginPath();
        const n = h.length;
        for (let i = 0; i < n; i++) {
          const x = (i / 419) * Wd;
          const y = y0 - get(h[i]) * amp;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.restore();
        // head dot
        const last = h[n - 1];
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(((n - 1) / 419) * Wd, y0 - get(last) * amp, 2.2 * dpr, 0, Math.PI * 2);
        ctx.fill();
      };
      trace((p) => p.c, "#64d2ff", "rgba(100,210,255,.7)", Ht * 0.78, Ht * 0.5);
      trace((p) => p.o, "#ffd60a", "rgba(255,214,10,.7)", Ht * 0.62, Ht * 0.4);

      // labels
      ctx.font = `${10 * dpr}px Inter, sans-serif`;
      ctx.fillStyle = "#ffd60a";
      ctx.fillText("OUT", 8 * dpr, 14 * dpr);
      ctx.fillStyle = "#64d2ff";
      ctx.fillText("CAP", 8 * dpr, 28 * dpr);
      ctx.fillStyle = "rgba(255,255,255,.45)";
      ctx.textAlign = "right";
      ctx.fillText(running ? "500 ms/div · RUN" : "ANGEHALTEN", Wd - 8 * dpr, 14 * dpr);
      ctx.textAlign = "left";
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [running, sim.high, sim.capV]);

  return <canvas ref={ref} style={{ width: "100%", height, display: "block" }} />;
}
