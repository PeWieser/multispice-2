import type { CableLink, JackGeo, JackId, OutJack, Pt } from './cables';
import { CABLE_TINT, isOut } from './cables';

export interface DragState {
  fixed: JackId;
  pos: Pt;
  start: Pt;
  moved: boolean;
  unplugged: boolean;
}

interface Props {
  cables: CableLink[];
  geo: Partial<Record<JackId, JackGeo>>;
  drag: DragState | null;
  hover: JackId | null;
  onJackDown: (j: JackId, e: React.PointerEvent) => void;
}

const BOOT = 34;

/** Kabelverlauf: hängt aus der Buchse heraus, durchhängende Schlaufe, von oben in den Eingang */
function cablePath(s: Pt, e: Pt) {
  const dx = e.x - s.x;
  const dist = Math.hypot(dx, e.y - s.y);
  const sag = Math.min(230, 70 + dist * 0.28);
  const bow = (30 + Math.abs(dx) * 0.12) * (dx >= 0 ? 1 : -1);
  const c1: Pt = { x: s.x + bow, y: s.y + sag };
  const c2: Pt = { x: e.x - bow * 0.7, y: e.y - Math.min(90, sag * 0.45) };
  return { d: `M${s.x} ${s.y} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${e.x} ${e.y}`, c1, c2 };
}

/** Aufgesteckter BNC-Stecker in Frontansicht (Rändelring + Knickschutz in Kabelrichtung) */
function PluggedConnector({ p, dir, tint, r }: { p: Pt; dir: 1 | -1; tint: string; r: number }) {
  const R = Math.max(16, r * 0.82);
  const ticks = Array.from({ length: 24 }, (_, i) => (i * 360) / 24);
  return (
    <g>
      {/* Knickschutz (hinter dem Ring) */}
      <path
        d={`M${p.x - 10} ${p.y} Q${p.x - 8.5} ${p.y + 22 * dir} ${p.x - 5.5} ${p.y + BOOT * dir}
            L${p.x + 5.5} ${p.y + BOOT * dir} Q${p.x + 8.5} ${p.y + 22 * dir} ${p.x + 10} ${p.y} Z`}
        fill="url(#fg-boot)"
        stroke="rgba(0,0,0,.55)"
        strokeWidth="1"
      />
      {[0.34, 0.55, 0.76].map((f) => (
        <line
          key={f}
          x1={p.x - 9 + f * 3}
          x2={p.x + 9 - f * 3}
          y1={p.y + BOOT * f * dir}
          y2={p.y + BOOT * f * dir}
          stroke="rgba(0,0,0,.45)"
          strokeWidth="1.4"
        />
      ))}
      <circle cx={p.x} cy={p.y + 2} r={R + 1} fill="rgba(0,0,0,.45)" />
      <circle cx={p.x} cy={p.y} r={R} fill="url(#fg-metal)" stroke="#4a4f56" strokeWidth="1" />
      {ticks.map((a) => {
        const rad = (a * Math.PI) / 180;
        return (
          <line
            key={a}
            x1={p.x + Math.cos(rad) * (R - 5)}
            y1={p.y + Math.sin(rad) * (R - 5)}
            x2={p.x + Math.cos(rad) * R}
            y2={p.y + Math.sin(rad) * R}
            stroke="rgba(0,0,0,.35)"
            strokeWidth="1.2"
          />
        );
      })}
      <circle cx={p.x} cy={p.y} r={R - 6} fill="none" stroke={tint} strokeWidth="4" opacity="0.92" />
      <circle cx={p.x} cy={p.y} r={R - 10} fill="url(#fg-metal-in)" stroke="#5c626a" strokeWidth="1" />
      <circle cx={p.x - R * 0.3} cy={p.y - R * 0.34} r={R * 0.26} fill="rgba(255,255,255,.55)" />
    </g>
  );
}

/** Loser Stecker am Mauszeiger (Seitenansicht, entlang des Kabels gedreht) */
function LooseConnector({ p, angle, tint }: { p: Pt; angle: number; tint: string }) {
  return (
    <g transform={`translate(${p.x} ${p.y}) rotate(${angle})`}>
      <rect x="-6" y="-9" width="34" height="18" rx="4" fill="rgba(0,0,0,.4)" transform="translate(1,3)" />
      <rect x="-22" y="-7" width="22" height="14" rx="6" fill="url(#fg-boot)" stroke="rgba(0,0,0,.5)" strokeWidth="1" />
      <rect x="-6" y="-9" width="14" height="18" rx="3" fill={tint} stroke="rgba(0,0,0,.45)" strokeWidth="1" />
      <rect x="6" y="-10" width="16" height="20" rx="3" fill="url(#fg-metal)" stroke="#4a4f56" strokeWidth="1" />
      {[9, 12.5, 16, 19.5].map((x) => <line key={x} x1={x} y1={-9} x2={x} y2={9} stroke="rgba(0,0,0,.3)" strokeWidth="1.1" />)}
      <rect x="22" y="-4.5" width="8" height="9" rx="2" fill="url(#fg-metal-in)" stroke="#585e66" strokeWidth="1" />
      <circle cx="30" cy="0" r="2.6" fill="#d9a83c" stroke="#7a5410" strokeWidth="1" />
      <rect x="6" y="-10" width="16" height="6" rx="3" fill="rgba(255,255,255,.35)" />
    </g>
  );
}

function CableBody({ d, tint }: { d: string; tint: string }) {
  return (
    <g>
      <path d={d} fill="none" stroke="#141619" strokeWidth="13.5" strokeLinecap="round" />
      <path d={d} fill="none" stroke="#2c3036" strokeWidth="10" strokeLinecap="round" />
      <path d={d} fill="none" stroke="rgba(255,255,255,.16)" strokeWidth="3" strokeLinecap="round" transform="translate(-1.4,-2.2)" />
      <path d={d} fill="none" stroke={tint} strokeWidth="10" strokeLinecap="round" opacity="0.1" />
    </g>
  );
}

/**
 * Zeichnet die BNC-Messleitungen über Gerät und Oszilloskop.
 * Nur die Trefferflächen an den Buchsen nehmen Mausereignisse an.
 */
export function CableLayer({ cables, geo, drag, hover, onJackDown }: Props) {
  const jacks = Object.entries(geo) as [JackId, JackGeo][];

  const strands: { key: string; d: string; tint: string; ends: { p: Pt; dir: 1 | -1; r: number }[] }[] = [];
  for (const c of cables) {
    const a = geo[c.out];
    const b = geo[c.inp];
    if (!a || !b) continue;
    const s: Pt = { x: a.x, y: a.y + BOOT };
    const e: Pt = { x: b.x, y: b.y - BOOT };
    strands.push({
      key: `${c.out}-${c.inp}`,
      d: cablePath(s, e).d,
      tint: CABLE_TINT[c.out],
      ends: [{ p: a, dir: 1, r: a.r }, { p: b, dir: -1, r: b.r }],
    });
  }

  let dragDraw: { d: string; tint: string; fixed: Pt; dir: 1 | -1; loose: Pt; angle: number } | null = null;
  if (drag && geo[drag.fixed]) {
    const f = geo[drag.fixed]!;
    const down = drag.pos.y > f.y;
    const dir: 1 | -1 = isOut(drag.fixed) ? 1 : down ? 1 : -1;
    const s: Pt = { x: f.x, y: f.y + BOOT * dir };
    const { d, c2 } = cablePath(dir === 1 ? s : drag.pos, dir === 1 ? drag.pos : s);
    const ref = dir === 1 ? c2 : s;
    const angle = (Math.atan2(drag.pos.y - ref.y, drag.pos.x - ref.x) * 180) / Math.PI;
    const tint = CABLE_TINT[(isOut(drag.fixed) ? drag.fixed : hover && isOut(hover) ? hover : 'out1') as OutJack];
    dragDraw = { d, tint, fixed: f, dir, loose: drag.pos, angle };
  }

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 40, overflow: 'visible' }}
    >
      <defs>
        <radialGradient id="fg-metal" cx="34%" cy="28%" r="80%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#ccd1d7" />
          <stop offset="1" stopColor="#767c84" />
        </radialGradient>
        <radialGradient id="fg-metal-in" cx="45%" cy="35%" r="70%">
          <stop offset="0" stopColor="#e9ecef" />
          <stop offset="1" stopColor="#8b9098" />
        </radialGradient>
        <linearGradient id="fg-boot" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0f1113" />
          <stop offset="0.35" stopColor="#3a4047" />
          <stop offset="0.7" stopColor="#212528" />
          <stop offset="1" stopColor="#101214" />
        </linearGradient>
        <filter id="fg-cable-shadow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      {/* Schlagschatten der Kabel */}
      <g filter="url(#fg-cable-shadow)" opacity="0.5">
        {strands.map((s) => (
          <path key={s.key} d={s.d} fill="none" stroke="#000" strokeWidth="14" strokeLinecap="round" transform="translate(6,12)" />
        ))}
        {dragDraw && <path d={dragDraw.d} fill="none" stroke="#000" strokeWidth="14" strokeLinecap="round" transform="translate(6,12)" />}
      </g>

      {strands.map((s) => <CableBody key={s.key} d={s.d} tint={s.tint} />)}
      {dragDraw && <CableBody d={dragDraw.d} tint={dragDraw.tint} />}

      {strands.map((s) =>
        s.ends.map((e, i) => <PluggedConnector key={s.key + i} p={e.p} dir={e.dir} tint={s.tint} r={e.r} />),
      )}

      {dragDraw && (
        <>
          <PluggedConnector p={dragDraw.fixed} dir={dragDraw.dir} tint={dragDraw.tint} r={geo[drag!.fixed]!.r} />
          <LooseConnector p={dragDraw.loose} angle={dragDraw.angle} tint={dragDraw.tint} />
        </>
      )}

      {/* Trefferflächen + Markierung möglicher Ziele */}
      {jacks.map(([id, g]) => {
        const target = drag && hover === id;
        return (
          <g key={id}>
            {target && <circle cx={g.x} cy={g.y} r={g.r + 7} fill="none" stroke="#7dff9d" strokeWidth="3" opacity="0.9" />}
            <circle
              cx={g.x}
              cy={g.y}
              r={g.r}
              fill="transparent"
              style={{ pointerEvents: 'auto', cursor: 'grab' }}
              onPointerDown={(e) => onJackDown(id, e)}
            />
          </g>
        );
      })}
    </svg>
  );
}
