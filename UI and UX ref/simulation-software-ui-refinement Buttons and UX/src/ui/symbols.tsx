import React, { useState } from "react";
import { cx } from "./kit";

/* ================= Symbol frame ================= */

function S({ children, vb = "0 0 40 40" }: { children: React.ReactNode; vb?: string }) {
  return (
    <svg
      viewBox={vb}
      className="h-full w-full"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function T({ x, y, children, size = 8.5 }: { x: number; y: number; children: React.ReactNode; size?: number }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor="middle"
      stroke="none"
      fill="currentColor"
      fontSize={size}
      fontWeight={600}
      fontFamily="Inter, -apple-system, sans-serif"
      dominantBaseline="central"
    >
      {children}
    </text>
  );
}

/* ================= Passive ================= */

export const SResistorIEC = () => (
  <S>
    <path d="M20 3v8M20 29v8" />
    <rect x="14.5" y="11" width="11" height="18" rx="1.2" />
  </S>
);
export const SResistorUS = () => (
  <S>
    <path d="M20 3v6l3.4 2.2-6.8 3.4 6.8 3.4-6.8 3.4 6.8 3.4-6.8 3.4 3.4 2.2v6" />
  </S>
);
export const SPot = () => (
  <S>
    <path d="M20 3v8M20 29v8" />
    <rect x="14.5" y="11" width="11" height="18" rx="1.2" />
    <path d="M11.5 27.5 27 13.5M23.4 13.2l3.9.1-.4 3.9" />
    <path d="M27 13.5 34 13.5" strokeWidth={1.4} />
  </S>
);
export const SCap = () => (
  <S>
    <path d="M20 3v15M20 22v15" />
    <path d="M12.5 18h15M12.5 22h15" />
  </S>
);
export const SElko = () => (
  <S>
    <path d="M20 3v15M20 22v15" />
    <path d="M12.5 18h15" />
    <path d="M13.5 22h13v4h-13z" />
    <path d="M10 8.5v5M7.5 11h5" strokeWidth={1.4} />
  </S>
);
export const SInductor = () => (
  <S>
    <path d="M20 3v7c6.5 0 6.5 6 0 6 6.5 0 6.5 6 0 6 6.5 0 6.5 6 0 6v7" />
  </S>
);
export const STrafo = () => (
  <S>
    <path d="M15 6v4c-5 0-5 5 0 5-5 0-5 5 0 5-5 0-5 5 0 5v4" />
    <path d="M25 6v4c5 0 5 5 0 5 5 0 5 5 0 5 5 0 5 5 0 5v4" />
    <path d="M18.5 12v16M21.5 12v16" strokeWidth={1.1} strokeDasharray="2 2" />
  </S>
);
export const SFuse = () => (
  <S>
    <path d="M3 20h7M30 20h7" />
    <rect x="10" y="16.5" width="20" height="7" rx="1" />
    <path d="M16 20h8" strokeWidth={1.2} />
  </S>
);
export const SCrystal = () => (
  <S>
    <path d="M20 3v9M20 28v9" />
    <rect x="14" y="12" width="12" height="16" rx="1" />
  </S>
);

/* ================= Dioden ================= */

export const SDiode = () => (
  <S>
    <path d="M20 3v9M20 28v9" />
    <path d="M13 13h14l-7 12z" />
    <path d="M12 28h16" />
  </S>
);
export const SLed = () => (
  <S>
    <path d="M3 21h8M29 21h8" />
    <path d="M11 13v16l12-8z" />
    <path d="M23 13v16" />
    <path d="M27.5 12.5 31.5 8.5M27.5 12.5l.3 2.4M27.5 12.5l-2.4-.3" strokeWidth={1.4} />
    <path d="M31.5 17.5 35.5 13.5M31.5 17.5l.3 2.4M31.5 17.5l-2.4-.3" strokeWidth={1.4} />
  </S>
);
export const SZener = () => (
  <S>
    <path d="M3 21h8M29 21h8" />
    <path d="M11 13v16l12-8z" />
    <path d="M23 12.5V15l4-1.5V25l-4-1.5V29" strokeWidth={1.6} />
  </S>
);
export const SSchottky = () => (
  <S>
    <path d="M3 21h8M29 21h8" />
    <path d="M11 13v16l12-8z" />
    <path d="M21 13h4v5h-4M23 23h4v5h-4" strokeWidth={1.5} />
  </S>
);

/* ================= Transistoren ================= */

export const SNpn = () => (
  <S>
    <path d="M3 20h12M17 13v14" strokeWidth={2.1} />
    <path d="M17 16.5 29 10v-7M17 23.5 29 30v7" />
    <path d="M23.5 26.4 29.6 29.4 28.4 22.9" strokeWidth={1.5} />
  </S>
);
export const SPnp = () => (
  <S>
    <path d="M3 20h12M17 13v14" strokeWidth={2.1} />
    <path d="M17 16.5 29 10v-7M17 23.5 29 30v7" />
    <path d="M28.6 22.6 22.3 20 25.6 26" strokeWidth={1.5} />
  </S>
);
export const SNmos = () => (
  <S>
    <path d="M3 20h10M15 10.5v19" strokeWidth={2} />
    <path d="M19.5 13v14" strokeWidth={2.4} />
    <path d="M19.5 15.5H29V3M19.5 24.5H29v-4" />
    <path d="M29 28.5V37M25.5 24.5v4" strokeWidth={1.4} />
    <path d="M24.5 17.5l2.5 2.5 2.5-2.5" strokeWidth={1.4} transform="translate(-1 8) rotate(0)" />
  </S>
);
export const SPmos = () => (
  <S>
    <path d="M3 20h10M15 10.5v19" strokeWidth={2} />
    <path d="M19.5 13v14" strokeWidth={2.4} />
    <path d="M19.5 15.5H29V3M19.5 24.5H29v-4" />
    <path d="M29 28.5V37" strokeWidth={1.4} />
    <circle cx="14" cy="20" r="1.6" strokeWidth={1.4} />
  </S>
);

/* ================= Quellen & Masse ================= */

export const SVdc = () => (
  <S>
    <path d="M20 3v6M20 31v6" />
    <circle cx="20" cy="20" r="11" />
    <path d="M20 13.5v5M17.5 16h5" strokeWidth={1.5} />
    <path d="M17.5 25h5" strokeWidth={1.5} />
  </S>
);
export const SVac = () => (
  <S>
    <path d="M20 3v6M20 31v6" />
    <circle cx="20" cy="20" r="11" />
    <path d="M12.5 20c1.8-4.4 4.2-4.4 6 0s4.2 4.4 6 0 2.4-3.4 3-2.6" strokeWidth={1.5} />
  </S>
);
export const SBattery = () => (
  <S>
    <path d="M20 3v10M20 27v10" />
    <path d="M11 13h18" />
    <path d="M15.5 20.5h9M15.5 24.5h9" strokeWidth={1.3} />
    <path d="M11 27h18" strokeWidth={3.2} />
  </S>
);
export const SCurrent = () => (
  <S>
    <path d="M20 3v6M20 31v6" />
    <circle cx="20" cy="20" r="11" />
    <path d="M20 26.5v-13M16.8 17.2 20 13.5l3.2 3.7" strokeWidth={1.5} />
  </S>
);
export const SGround = () => (
  <S>
    <path d="M20 4v16" />
    <path d="M11 20h18M14 24.5h12M17 29h6" strokeWidth={2} />
  </S>
);
export const SChassis = () => (
  <S>
    <path d="M20 4v13" />
    <path d="M9.5 17h21L20 30z" />
    <path d="M14.5 30v3.5M20 30v3.5M25.5 30v3.5" strokeWidth={1.3} />
  </S>
);
export const SVcc = () => (
  <S>
    <circle cx="20" cy="31" r="2.4" strokeWidth={1.5} />
    <path d="M20 28.5V11" />
    <path d="M14.5 16.5 20 9.5l5.5 7" />
  </S>
);

/* ================= Schalter & Sonstige ================= */

export const SSwitch = () => (
  <S>
    <path d="M3 28h6M31 28h6" />
    <circle cx="11" cy="28" r="1.7" fill="currentColor" stroke="none" />
    <circle cx="29" cy="28" r="1.7" fill="currentColor" stroke="none" />
    <path d="M11.8 26.8 27 14" />
  </S>
);
export const SButtonNO = () => (
  <S>
    <path d="M14 24v13M26 24v13" />
    <circle cx="14" cy="23" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="26" cy="23" r="1.6" fill="currentColor" stroke="none" />
    <path d="M20 12.5v5" strokeDasharray="2.4 2" strokeWidth={1.4} />
    <rect x="12" y="6" width="16" height="6.5" rx="2" />
  </S>
);
export const SRelay = () => (
  <S>
    <rect x="6" y="7" width="12" height="18" rx="1" />
    <path d="M9 25v9M15 25v9M6 31h12" strokeWidth={1.3} />
    <path d="M24 10v6M24 24v6" strokeWidth={1.3} />
    <circle cx="24" cy="18" r="1.5" fill="currentColor" stroke="none" />
    <path d="M24.8 16.8 33 9" />
    <circle cx="33" cy="28" r="1.5" fill="currentColor" stroke="none" />
    <path d="M33 29.5V37" strokeWidth={1.3} />
  </S>
);
export const SLamp = () => (
  <S>
    <path d="M20 3v7M20 30v7" />
    <circle cx="20" cy="20" r="10" />
    <path d="M14 14l12 12M26 14 14 26" strokeWidth={1.4} />
  </S>
);
export const SSpeaker = () => (
  <S>
    <path d="M4 17v6h6l9-7v12l-9-7" />
    <path d="M24 15a6 6 0 0 1 0 10M27.5 12a10.5 10.5 0 0 1 0 16" strokeWidth={1.4} />
  </S>
);
export const SMotor = () => (
  <S>
    <path d="M20 3v6M20 31v6" />
    <circle cx="20" cy="20" r="11" />
    <T x={20} y={20.5} size={11}>M</T>
  </S>
);
export const SOszi = () => (
  <S>
    <rect x="7" y="9" width="26" height="19" rx="3" />
    <path d="M11 20c1.6-4.6 3.8-4.6 5.4 0s3.8 4.6 5.4 0 2.6-3.8 3.4-3" strokeWidth={1.4} />
    <path d="M13 28v4M27 28v4" />
  </S>
);

/* ================= ICs & Logik ================= */

export const SOpamp = () => (
  <S>
    <path d="M3 15h7M3 25h7M30 20h7" />
    <path d="M10 10.5v19L30 20z" />
    <T x={16.5} y={17} size={7.5}>−</T>
    <T x={16.5} y={24} size={7.5}>+</T>
  </S>
);
export const SAnd = () => (
  <S>
    <path d="M3 15.5h9M3 24.5h9M29 20h8" />
    <path d="M12 10.5h5.5a9.5 9.5 0 0 1 0 19H12z" />
  </S>
);
export const SOr = () => (
  <S>
    <path d="M3 15.5h7M3 24.5h7M29.5 20H37" />
    <path d="M10 10.5c3 3.2 3 15.8 0 19 6.5-.6 15-2.6 19.5-9.5C25 13.1 16.5 11.1 10 10.5z" />
  </S>
);
export const SIc555 = () => (
  <S>
    <rect x="9" y="7" width="22" height="26" rx="2.5" />
    <path d="M4 12h5M4 18h5M4 24h5M4 30h5M31 12h5M31 18h5M31 24h5M31 30h5" strokeWidth={1.5} />
    <circle cx="20" cy="10.5" r="1.4" strokeWidth={1.2} />
    <T x={20} y={22} size={8}>555</T>
  </S>
);

/* ---- Farbige Sonden ---- */

export const SProbeV = () => (
  <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
    <circle cx="20" cy="20" r="11.5" fill="#b25e09" />
    <circle cx="20" cy="20" r="11.5" fill="url(#pv)" />
    <defs>
      <radialGradient id="pv" cx="0.35" cy="0.3" r="1">
        <stop offset="0%" stopColor="#ffd98a" />
        <stop offset="45%" stopColor="#ff9f0a" />
        <stop offset="100%" stopColor="#c93400" />
      </radialGradient>
    </defs>
    <text x="20" y="21" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight={700} fill="#fff" fontFamily="Inter,sans-serif">V</text>
  </svg>
);
export const SProbeA = () => (
  <svg viewBox="0 0 40 40" className="h-full w-full" aria-hidden>
    <circle cx="20" cy="20" r="11.5" fill="#0a7d8c" />
    <circle cx="20" cy="20" r="11.5" fill="url(#pa)" />
    <defs>
      <radialGradient id="pa" cx="0.35" cy="0.3" r="1">
        <stop offset="0%" stopColor="#7fe3f0" />
        <stop offset="45%" stopColor="#12a5b8" />
        <stop offset="100%" stopColor="#065f6e" />
      </radialGradient>
    </defs>
    <text x="20" y="21" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight={700} fill="#fff" fontFamily="Inter,sans-serif">A</text>
  </svg>
);

/* ================= Registry ================= */

export type SymDef = { id: string; name: string; cat: string; C: () => React.JSX.Element; key?: string };

export const SYMBOL_CATS = ["Passive", "Dioden", "Transistoren", "Quellen & Masse", "Schalter", "ICs & Logik", "Messung & Sonstige"] as const;

export const SYMBOLS: SymDef[] = [
  { id: "r-iec", name: "Widerstand", cat: "Passive", C: SResistorIEC, key: "R" },
  { id: "r-us", name: "Widerstand (US)", cat: "Passive", C: SResistorUS },
  { id: "r-pot", name: "Potentiometer", cat: "Passive", C: SPot },
  { id: "c", name: "Kondensator", cat: "Passive", C: SCap, key: "C" },
  { id: "c-elko", name: "Elko (polar)", cat: "Passive", C: SElko },
  { id: "l", name: "Spule", cat: "Passive", C: SInductor, key: "L" },
  { id: "trafo", name: "Transformator", cat: "Passive", C: STrafo },
  { id: "quarz", name: "Quarz", cat: "Passive", C: SCrystal },
  { id: "d", name: "Diode", cat: "Dioden", C: SDiode, key: "D" },
  { id: "led", name: "LED", cat: "Dioden", C: SLed },
  { id: "zener", name: "Z-Diode", cat: "Dioden", C: SZener },
  { id: "schottky", name: "Schottky-Diode", cat: "Dioden", C: SSchottky },
  { id: "npn", name: "NPN-Transistor", cat: "Transistoren", C: SNpn, key: "Q" },
  { id: "pnp", name: "PNP-Transistor", cat: "Transistoren", C: SPnp },
  { id: "nmos", name: "N-Kanal MOSFET", cat: "Transistoren", C: SNmos },
  { id: "pmos", name: "P-Kanal MOSFET", cat: "Transistoren", C: SPmos },
  { id: "vdc", name: "DC-Quelle", cat: "Quellen & Masse", C: SVdc, key: "V" },
  { id: "vac", name: "AC-Quelle", cat: "Quellen & Masse", C: SVac },
  { id: "bat", name: "Batterie", cat: "Quellen & Masse", C: SBattery },
  { id: "isrc", name: "Stromquelle", cat: "Quellen & Masse", C: SCurrent },
  { id: "gnd", name: "Masse", cat: "Quellen & Masse", C: SGround, key: "G" },
  { id: "gnd-ch", name: "Gehäusemasse", cat: "Quellen & Masse", C: SChassis },
  { id: "vcc", name: "VCC-Pfeil", cat: "Quellen & Masse", C: SVcc },
  { id: "sw", name: "Schalter (SPST)", cat: "Schalter", C: SSwitch, key: "S" },
  { id: "btn-no", name: "Taster (Schließer)", cat: "Schalter", C: SButtonNO },
  { id: "relais", name: "Relais", cat: "Schalter", C: SRelay },
  { id: "opamp", name: "Operationsverstärker", cat: "ICs & Logik", C: SOpamp, key: "U" },
  { id: "and", name: "UND-Gatter", cat: "ICs & Logik", C: SAnd },
  { id: "or", name: "ODER-Gatter", cat: "ICs & Logik", C: SOr },
  { id: "ic555", name: "Timer 555", cat: "ICs & Logik", C: SIc555 },
  { id: "lamp", name: "Lampe", cat: "Messung & Sonstige", C: SLamp },
  { id: "motor", name: "Motor", cat: "Messung & Sonstige", C: SMotor },
  { id: "speaker", name: "Lautsprecher", cat: "Messung & Sonstige", C: SSpeaker },
  { id: "fuse", name: "Sicherung", cat: "Messung & Sonstige", C: SFuse },
  { id: "oszi", name: "Oszilloskop", cat: "Messung & Sonstige", C: SOszi },
  { id: "probe-v", name: "V-Sonde", cat: "Messung & Sonstige", C: SProbeV },
  { id: "probe-a", name: "A-Sonde", cat: "Messung & Sonstige", C: SProbeA },
];

/* ================= Interaktive Schalter-Demos ================= */

export function Kippschalter({ on = false, onFlip }: { on?: boolean; onFlip?: (v: boolean) => void }) {
  const [s, setS] = useState(on);
  const v = onFlip ? on : s;
  const flip = () => { setS(!v); onFlip?.(!v); };
  return (
    <button onClick={flip} aria-pressed={v} aria-label="Kippschalter"
      className="pressable ring-focus relative h-[64px] w-[34px] rounded-[10px]"
      style={{ background: "linear-gradient(180deg,#3a3a40,#1d1d22)", boxShadow: "inset 0 0 0 .5px rgba(255,255,255,.14), 0 2px 6px rgba(0,0,0,.3)" }}>
      <span className="absolute left-1/2 top-[7px] h-[50px] w-[12px] -translate-x-1/2 rounded-full"
        style={{ background: "#0c0c0e", boxShadow: "inset 0 2px 5px rgba(0,0,0,.9), 0 .5px 0 rgba(255,255,255,.12)" }} />
      <span className="absolute left-1/2 w-[20px] -translate-x-1/2 rounded-[7px]"
        style={{
          height: 26, top: v ? 8 : 30,
          background: "linear-gradient(180deg,#fdfdfd,#cfcfd6 55%,#9a9aa2)",
          boxShadow: "0 3px 7px rgba(0,0,0,.5), inset 0 1px 0 #fff, inset 0 0 0 .5px rgba(0,0,0,.25)",
          transition: "top .22s cubic-bezier(.3,1.5,.4,1)",
        }}>
        <span className="absolute left-[5px] right-[5px] top-[5px] h-[2.5px] rounded-full bg-black/25" />
        <span className="absolute bottom-[5px] left-[5px] right-[5px] h-[2.5px] rounded-full bg-black/25" />
      </span>
      <span className={cx("absolute left-1/2 top-[3px] h-[3px] w-[3px] -translate-x-1/2 rounded-full transition-all")}
        style={{ background: v ? "#30d158" : "#48484e", boxShadow: v ? "0 0 6px 2px rgba(48,209,88,.7)" : "none" }} />
    </button>
  );
}

export function TasterRund({ onPress, color = "#ff453a" }: { onPress?: () => void; color?: string }) {
  const [down, setDown] = useState(false);
  return (
    <button
      aria-label="Taster"
      onPointerDown={() => { setDown(true); onPress?.(); }}
      onPointerUp={() => setDown(false)}
      onPointerLeave={() => setDown(false)}
      className="ring-focus relative h-[56px] w-[56px] rounded-full"
      style={{
        background: "conic-gradient(from 200deg, #d7d7dc, #8e8e96, #c9c9d0, #83838b, #d7d7dc)",
        boxShadow: "0 3px 8px rgba(0,0,0,.3), inset 0 1px 1px rgba(255,255,255,.7)",
        padding: 5,
      }}
    >
      <span className="flex h-full w-full items-center justify-center rounded-full"
        style={{
          background: `radial-gradient(circle at 50% 30%, ${down ? color : "#ff6b62"} 0%, ${color} 55%, #a3120a 100%)`,
          transform: down ? "scale(.93) translateY(1px)" : "scale(1)",
          boxShadow: down
            ? "inset 0 3px 8px rgba(0,0,0,.5)"
            : `inset 0 2px 3px rgba(255,255,255,.5), inset 0 -3px 6px rgba(0,0,0,.35), 0 0 ${down ? 18 : 10}px ${color}66`,
          transition: "transform .08s, box-shadow .12s",
        }}>
        <span className="h-[10px] w-[10px] rounded-full bg-white/85" style={{ boxShadow: "0 0 8px 2px rgba(255,255,255,.6)" }} />
      </span>
    </button>
  );
}

export function DipBank({ n = 4 }: { n?: number }) {
  const [st, setSt] = useState<boolean[]>(() => Array.from({ length: n }, (_, i) => i === 0));
  return (
    <div className="flex items-center gap-[7px] rounded-[10px] px-3 py-2.5"
      style={{ background: "linear-gradient(180deg,#2c2c31,#17171b)", boxShadow: "inset 0 0 0 .5px rgba(255,255,255,.12), 0 2px 6px rgba(0,0,0,.28)" }}>
      <span className="mr-1 font-mono text-[9px] font-semibold tracking-wider text-white/45">ON</span>
      {st.map((v, i) => (
        <button key={i} onClick={() => setSt(s => s.map((x, j) => (j === i ? !x : x)))} aria-label={`DIP ${i + 1}`}
          className="ring-focus relative h-[30px] w-[13px] rounded-[4px]"
          style={{ background: "#08080a", boxShadow: "inset 0 1px 3px #000" }}>
          <span className="absolute left-[1.5px] right-[1.5px] rounded-[3px]"
            style={{
              top: v ? 2 : 15, height: 13,
              background: "linear-gradient(180deg,#fff,#d5d5db)",
              boxShadow: "0 1px 3px rgba(0,0,0,.6)",
              transition: "top .16s cubic-bezier(.3,1.4,.4,1)",
            }} />
        </button>
      ))}
      <span className="ml-1 font-mono text-[9px] text-white/30">1–{n}</span>
    </div>
  );
}

export function Drehschalter({ positions = ["AUS", "I", "II", "III"] }: { positions?: string[] }) {
  const [idx, setIdx] = useState(1);
  const ang = -120 + (idx / (positions.length - 1)) * 240;
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-[74px] w-[74px]">
        {positions.map((p, i) => {
          const a = ((-120 + (i / (positions.length - 1)) * 240 - 90) * Math.PI) / 180;
          return (
            <span key={p} className="absolute font-mono text-[8.5px] font-semibold"
              style={{
                left: 37 + Math.cos(a) * 31 - 6, top: 37 + Math.sin(a) * 31 - 6,
                color: i === idx ? "var(--accent-ink)" : "var(--ink-4)",
              }}>{p}</span>
          );
        })}
        <button onClick={() => setIdx((idx + 1) % positions.length)} aria-label="Drehschalter"
          className="ring-focus absolute left-1/2 top-1/2 h-[46px] w-[46px] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{
            background: "conic-gradient(from 180deg,#4a4a52,#222228,#3c3c44,#1b1b20,#4a4a52)",
            boxShadow: "0 4px 10px rgba(0,0,0,.35), inset 0 1px 1px rgba(255,255,255,.25), inset 0 0 0 2px rgba(0,0,0,.4)",
          }}>
          <span className="absolute inset-0" style={{ transform: `rotate(${ang}deg)`, transition: "transform .28s cubic-bezier(.3,1.3,.4,1)" }}>
            <span className="absolute left-1/2 top-[5px] h-[13px] w-[3.5px] -translate-x-1/2 rounded-full bg-white"
              style={{ boxShadow: "0 0 6px rgba(255,255,255,.8)" }} />
          </span>
          <span className="absolute left-1/2 top-1/2 h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{ background: "radial-gradient(circle at 40% 35%, #55555e, #1a1a1f)" }} />
        </button>
      </div>
      <div className="text-[11.5px]" style={{ color: "var(--ink-2)" }}>
        <div className="font-semibold" style={{ color: "var(--ink-1)" }}>Stellung {positions[idx]}</div>
        <div>Klicken zum Weiterschalten</div>
      </div>
    </div>
  );
}

export function Schiebeschalter() {
  const [v, setV] = useState(true);
  return (
    <button onClick={() => setV(!v)} aria-pressed={v} aria-label="Schiebeschalter"
      className="ring-focus relative h-[30px] w-[62px] rounded-full"
      style={{ background: v ? "linear-gradient(180deg,#0a7aff,#0063d1)" : "rgba(120,120,128,.3)", boxShadow: "inset 0 1px 3px rgba(0,0,0,.25), 0 1px 2px rgba(0,0,0,.15)", transition: "background .2s" }}>
      <span className="absolute top-[3px] h-[24px] w-[24px] rounded-full"
        style={{
          left: v ? 35 : 3,
          background: "radial-gradient(circle at 50% 30%, #fff, #e9e9ee 70%, #cfcfd6)",
          boxShadow: "0 2px 5px rgba(0,0,0,.35), inset 0 0 0 .5px rgba(0,0,0,.15)",
          transition: "left .22s cubic-bezier(.3,1.3,.4,1)",
        }}>
        <span className="absolute inset-[7px] rounded-full" style={{ background: v ? "#0a7aff" : "#aeaeb2", filter: "blur(.4px)" }} />
      </span>
    </button>
  );
}

export function Wippschalter() {
  const [v, setV] = useState(true);
  return (
    <button onClick={() => setV(!v)} aria-pressed={v} aria-label="Wippschalter"
      className="ring-focus relative h-[56px] w-[32px] rounded-[9px] p-[4px]"
      style={{ background: "linear-gradient(180deg,#26262b,#101014)", boxShadow: "inset 0 0 0 .5px rgba(255,255,255,.14), 0 2px 6px rgba(0,0,0,.3)", perspective: 120 }}>
      <span className="relative block h-full w-full rounded-[6px]"
        style={{
          background: "linear-gradient(180deg,#f2f2f5,#c6c6cd)",
          transform: `rotateX(${v ? -16 : 16}deg)`,
          transformStyle: "preserve-3d",
          transition: "transform .18s cubic-bezier(.3,1.3,.4,1)",
          boxShadow: "0 2px 5px rgba(0,0,0,.4), inset 0 1px 0 #fff",
        }}>
        <span className="absolute left-1/2 top-[5px] h-[9px] w-[2.5px] -translate-x-1/2 rounded-full"
          style={{ background: v ? "#1e9e50" : "#8e8e93", boxShadow: v ? "0 0 5px #30d158" : "none" }} />
        <span className="absolute bottom-[6px] left-1/2 h-[8px] w-[8px] -translate-x-1/2 rounded-full"
          style={{ border: "2px solid #6e6e73", borderTopColor: "transparent", transform: "rotate(0deg)" }} />
      </span>
    </button>
  );
}
