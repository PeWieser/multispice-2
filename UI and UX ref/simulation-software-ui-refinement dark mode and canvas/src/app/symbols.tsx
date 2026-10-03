import { formatSI, type Part } from "./model";

export interface LiveState {
  running: boolean;
  outHigh: boolean;
  vcNorm: number; // 0..1 (1/3 Vcc → 2/3 Vcc)
}

export function partBBox(p: Part): { x: number; y: number; w: number; h: number } {
  let w = 0;
  let h = 0;
  switch (p.type) {
    case "resistor":
    case "inductor":
      w = 100;
      h = 28;
      break;
    case "capacitor":
      w = 40;
      h = 30;
      break;
    case "source":
      w = 50;
      h = 50;
      break;
    case "ground":
      return { x: p.x - 14, y: p.y - 2, w: 28, h: 20 };
    case "diode":
    case "led":
      w = 60;
      h = 32;
      break;
    case "ic555":
      w = 100;
      h = 160;
      break;
    case "netlabel": {
      const len = 12 + p.label!.length * 7.2 + 12;
      return p.rot === 180 ? { x: p.x - len, y: p.y - 9, w: len, h: 18 } : { x: p.x, y: p.y - 9, w: len, h: 18 };
    }
  }
  if (p.rot === 90 || p.rot === 270) [w, h] = [h, w];
  return { x: p.x - w / 2, y: p.y - h / 2, w, h };
}

const S = "var(--symbol)";
const F = "var(--symbol-fill)";
const SW = 1.5;

function Lead({ d }: { d: string }) {
  return <path d={d} stroke="var(--wire)" strokeWidth={SW} strokeLinecap="round" fill="none" />;
}

function Labels({ p, lines }: { p: Part; lines: { text: string; sub?: boolean }[] }) {
  // positions relative to center; depends on rotation and symbol kind
  const vertical = p.rot === 90 || p.rot === 270;
  let x = 0;
  let y = 0;
  let anchor: "start" | "middle" | "end" = "middle";
  if (p.type === "ic555") {
    x = 0;
    y = 96;
  } else if (p.type === "source") {
    x = 32;
    y = -4;
    anchor = "start";
  } else if (p.type === "led" || p.type === "diode") {
    x = 0;
    y = vertical ? 0 : 32;
    if (vertical) {
      x = 24;
      anchor = "start";
    }
  } else if (vertical) {
    x = 14;
    y = -4;
    anchor = "start";
  } else {
    x = 0;
    y = p.type === "capacitor" ? -22 : -20;
  }
  const lh = 12;
  const firstDy = vertical || p.type === "source" ? 0 : p.type === "ic555" || p.type === "led" || p.type === "diode" ? 0 : -(lines.length - 1) * lh;
  return (
    <g transform={`rotate(${-p.rot})`} className="pointer-events-none select-none">
      {lines.map((l, i) => (
        <text
          key={i}
          x={x}
          y={y + firstDy + i * lh}
          textAnchor={anchor}
          fontSize={l.sub ? 10 : 10.5}
          fontWeight={l.sub ? 400 : 600}
          fill={l.sub ? "var(--ink-3)" : "var(--ink-2)"}
          fontFamily="var(--font-sans)"
          style={{ letterSpacing: "0.01em" }}
        >
          {l.text}
        </text>
      ))}
    </g>
  );
}

export function PartSymbol({ p, live, selected }: { p: Part; live: LiveState; selected?: boolean }) {
  const lines: { text: string; sub?: boolean }[] = [];
  if (p.showRef !== false && p.type !== "ground" && p.type !== "netlabel") lines.push({ text: p.ref });
  if (p.showValue !== false && p.value !== undefined && p.unit) lines.push({ text: formatSI(p.value, p.unit), sub: true });
  if (p.showValue !== false && p.type === "ic555") lines.push({ text: p.label ?? "", sub: true });
  if (p.showValue !== false && p.type === "led") lines.push({ text: p.label ?? "", sub: true });

  const stroke = selected ? "var(--accent)" : S;

  let body: React.ReactNode = null;
  switch (p.type) {
    case "resistor":
      body = (
        <>
          <Lead d="M-50 0H-30M30 0H50" />
          <rect x={-30} y={-9} width={60} height={18} rx={1.5} fill={F} stroke={stroke} strokeWidth={SW} />
        </>
      );
      break;
    case "inductor":
      body = (
        <>
          <Lead d="M-50 0H-36M36 0H50" />
          <path d="M-36 0a9 9 0 0 1 18 0a9 9 0 0 1 18 0a9 9 0 0 1 18 0a9 9 0 0 1 18 0" fill="none" stroke={stroke} strokeWidth={SW} />
        </>
      );
      break;
    case "capacitor":
      body = (
        <>
          <Lead d="M-20 0H-4M4 0H20" />
          <path d="M-4 -13V13M4 -13V13" stroke={stroke} strokeWidth={2.2} strokeLinecap="round" />
        </>
      );
      break;
    case "source":
      body = (
        <>
          <circle r={24} fill={F} stroke={stroke} strokeWidth={SW} />
          <path d="M0 -16v8M-4 -12h8" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
          <path d="M-4 12h8" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
          <path d="M-9 0h18" stroke={stroke} strokeWidth={1} strokeLinecap="round" opacity={0.35} />
        </>
      );
      break;
    case "ground":
      body = (
        <>
          <Lead d="M0 0V6" />
          <path d="M-12 6H12M-8 11H8M-4 16H4" stroke={stroke} strokeWidth={SW} strokeLinecap="round" />
        </>
      );
      break;
    case "diode":
    case "led": {
      const lit = p.type === "led" && live.running && live.outHigh;
      const col = p.color ?? "#ff453a";
      body = (
        <>
          {lit && (
            <circle r={22} fill={col} opacity={0.22} style={{ filter: "blur(6px)" }} />
          )}
          <Lead d="M-30 0H-12M12 0H30" />
          <path d="M-12 -11L12 0L-12 11Z" fill={lit ? col : F} stroke={lit ? col : stroke} strokeWidth={SW} strokeLinejoin="round" style={{ transition: "fill 90ms, stroke 90ms" }} />
          <path d="M12 -11V11" stroke={lit ? col : stroke} strokeWidth={2} strokeLinecap="round" />
          {p.type === "led" && (
            <g stroke={lit ? col : stroke} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" fill="none">
              <path d="M2 -12l7 -8M8 -10l7 -8" />
              <path d="M9 -22l0 3.5l-3.5 0M15 -20l0 3.5l-3.5 0" transform="translate(0,2)" />
            </g>
          )}
        </>
      );
      break;
    }
    case "ic555": {
      const left = [
        { n: 4, t: "RST", y: -60 },
        { n: 7, t: "DIS", y: -20 },
        { n: 2, t: "TRIG", y: 20 },
        { n: 1, t: "GND", y: 60 },
      ];
      const right = [
        { n: 8, t: "VCC", y: -60 },
        { n: 3, t: "OUT", y: -20 },
        { n: 6, t: "THR", y: 20 },
        { n: 5, t: "CTRL", y: 60 },
      ];
      body = (
        <>
          <rect x={-50} y={-80} width={100} height={160} rx={3} fill={F} stroke={stroke} strokeWidth={SW} />
          <circle cx={-40} cy={-70} r={2.2} fill="var(--ink-3)" />
          <text x={0} y={-62} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--ink)" fontFamily="var(--font-sans)" letterSpacing="0.06em">
            555
          </text>
          <path d="M-50 -52H50" stroke="var(--hairline-strong)" strokeWidth={1} />
          {left.map((pin) => (
            <g key={pin.t}>
              <Lead d={`M-70 ${pin.y}H-50`} />
              <text x={-44} y={pin.y + 3.5} fontSize={8.5} fontWeight={500} fill="var(--ink-2)" fontFamily="var(--font-sans)">
                {pin.t}
              </text>
              <text x={-62} y={pin.y - 4} fontSize={7} fill="var(--ink-3)" textAnchor="middle" fontFamily="var(--font-sans)">
                {pin.n}
              </text>
            </g>
          ))}
          {right.map((pin) => (
            <g key={pin.t}>
              <Lead d={`M50 ${pin.y}H70`} />
              <text x={44} y={pin.y + 3.5} fontSize={8.5} fontWeight={500} fill="var(--ink-2)" textAnchor="end" fontFamily="var(--font-sans)">
                {pin.t}
              </text>
              <text x={62} y={pin.y - 4} fontSize={7} fill="var(--ink-3)" textAnchor="middle" fontFamily="var(--font-sans)">
                {pin.n}
              </text>
              {pin.t === "OUT" && live.running && (
                <circle cx={60} cy={pin.y} r={3} fill={live.outHigh ? "var(--green)" : "var(--ink-4)"} style={{ transition: "fill 90ms" }} />
              )}
            </g>
          ))}
        </>
      );
      break;
    }
    case "netlabel": {
      const text = p.label ?? "";
      const len = 12 + text.length * 7.2 + 12;
      const active = live.running && (text === "OUT" ? live.outHigh : text === "CAP" ? live.vcNorm > 0.5 : false);
      body = (
        <g>
          <path
            d={`M0 0 L7 -8 H${len} a3 3 0 0 1 3 3 v10 a3 3 0 0 1 -3 3 H7 Z`}
            fill={active ? "var(--accent-soft)" : F}
            stroke={selected ? "var(--accent)" : active ? "var(--accent)" : "var(--ink-4)"}
            strokeWidth={1}
            strokeLinejoin="round"
            style={{ transition: "fill 90ms, stroke 90ms" }}
          />
          <text
            x={len / 2 + 5}
            y={3.5}
            textAnchor="middle"
            fontSize={10}
            fontWeight={600}
            fill={active ? "var(--accent)" : "var(--ink-2)"}
            fontFamily="var(--font-mono)"
            transform={p.rot === 180 ? `rotate(180 ${len / 2 + 5} 0)` : undefined}
            letterSpacing="0.03em"
          >
            {text}
          </text>
        </g>
      );
      break;
    }
  }

  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${p.rot})`}>
      {body}
      {lines.length > 0 && <Labels p={p} lines={lines} />}
    </g>
  );
}
