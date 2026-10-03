import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPE } from "react";
import { cn } from "../utils/cn";
import { GRID, snap, type Circuit, type PartType } from "./model";
import { partBBox, PartSymbol, type LiveState } from "./symbols";

export type Tool = "select" | "wire" | "eraser" | "probe" | "tag" | "note" | "hand";
export interface View {
  x: number;
  y: number;
  k: number;
}
export interface Note {
  id: string;
  x: number;
  y: number;
  text: string;
}
export interface Probe {
  id: string;
  x: number;
  y: number;
  net: string;
  kind: "V" | "A";
}

export interface CanvasProps {
  circuit: Circuit;
  notes: Note[];
  probes: Probe[];
  tool: Tool;
  probeKind: "V" | "A";
  placing: PartType | null;
  selection: string[];
  live: LiveState;
  netValue: (net: string, kind: "V" | "A") => string;
  view: View;
  setView: (v: View | ((v: View) => View)) => void;
  showGrid: boolean;
  snapOn: boolean;
  onSelect: (ids: string[], additive?: boolean) => void;
  onPlacePart: (type: PartType, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onAddWire: (points: [number, number][]) => void;
  onAddProbe: (kind: "V" | "A", x: number, y: number, net: string) => void;
  onAddNote: (x: number, y: number) => void;
  onAddLabel: (x: number, y: number) => void;
  onHoverNet: (net: string | null) => void;
  onCursor: (pt: { x: number; y: number } | null) => void;
  onPlaced?: () => void;
}

export function fitView(c: Circuit, w: number, h: number, pad = 90): View {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of c.parts) {
    const b = partBBox(p);
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  for (const wr of c.wires) for (const [x, y] of wr.points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  const cw = maxX - minX,
    ch = maxY - minY;
  const k = Math.min(2.5, Math.max(0.2, Math.min((w - pad * 2) / cw, (h - pad * 2) / ch)));
  return { k, x: (w - cw * k) / 2 - minX * k, y: (h - ch * k) / 2 - minY * k };
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax,
    dy = by - ay;
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  const qx = ax + t * dx,
    qy = ay + t * dy;
  return Math.hypot(px - qx, py - qy);
}

export function Canvas(props: CanvasProps) {
  const {
    circuit, notes, probes, tool, probeKind, placing, selection, live, netValue, view, setView, showGrid, snapOn,
    onSelect, onPlacePart, onDelete, onAddWire, onAddProbe, onAddNote, onAddLabel, onHoverNet, onCursor, onPlaced,
  } = props;

  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [hoverWire, setHoverWire] = useState<string | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const [space, setSpace] = useState(false);
  const [drag, setDrag] = useState<null | { kind: "pan"; sx: number; sy: number; ox: number; oy: number } | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number }>(null);
  const [wirePts, setWirePts] = useState<[number, number][]>([]);

  const toWorld = useCallback(
    (cx: number, cy: number) => {
      const r = ref.current!.getBoundingClientRect();
      return { x: (cx - r.left - view.x) / view.k, y: (cy - r.top - view.y) / view.k };
    },
    [view],
  );

  // non-passive wheel listener (React registers wheel as passive → preventDefault would be ignored)
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = el.getBoundingClientRect();
        const mx = e.clientX - r.left,
          my = e.clientY - r.top;
        const factor = Math.exp(-e.deltaY * 0.0022);
        setView((v) => {
          const k = Math.min(4, Math.max(0.2, v.k * factor));
          const s = k / v.k;
          return { k, x: mx - (mx - v.x) * s, y: my - (my - v.y) * s };
        });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [setView]);

  // space-to-pan
  useEffect(() => {
    const d = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLButtonElement;
      if (e.code === "Space" && !typing) {
        setSpace(true);
        e.preventDefault();
      }
      if (e.key === "Escape") setWirePts([]);
      if (e.key === "Enter" && wirePts.length > 1) {
        onAddWire(wirePts);
        setWirePts([]);
      }
    };
    const u = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", d);
    window.addEventListener("keyup", u);
    return () => {
      window.removeEventListener("keydown", d);
      window.removeEventListener("keyup", u);
    };
  }, [wirePts, onAddWire]);

  const wireAt = useCallback(
    (wx: number, wy: number) => {
      const tol = 6 / view.k;
      for (const w of circuit.wires) {
        for (let i = 0; i < w.points.length - 1; i++) {
          const [ax, ay] = w.points[i];
          const [bx, by] = w.points[i + 1];
          if (distToSeg(wx, wy, ax, ay, bx, by) < tol) {
            // snap onto segment
            const sx = ax === bx ? ax : snap(wx);
            const sy = ay === by ? ay : snap(wy);
            return { wire: w, x: sx, y: sy };
          }
        }
      }
      return null;
    },
    [circuit.wires, view.k],
  );

  const onPointerDown = (e: RPE) => {
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const w = toWorld(e.clientX, e.clientY);
    const sx = snapOn ? snap(w.x) : w.x,
      sy = snapOn ? snap(w.y) : w.y;
    const panMode = tool === "hand" || space || e.button === 1;

    if (panMode) {
      setDrag({ kind: "pan", sx: e.clientX, sy: e.clientY, ox: view.x, oy: view.y });
      return;
    }
    if (e.button !== 0) return;

    if (placing) {
      onPlacePart(placing, sx, sy);
      if (!e.shiftKey) onPlaced?.();
      return;
    }
    if (tool === "wire") {
      if (wirePts.length === 0) setWirePts([[sx, sy]]);
      else {
        const last = wirePts[wirePts.length - 1];
        const bend: [number, number] = Math.abs(sx - last[0]) > Math.abs(sy - last[1]) ? [sx, last[1]] : [last[0], sy];
        const next = [...wirePts];
        if (bend[0] !== last[0] || bend[1] !== last[1]) next.push(bend);
        if (bend[0] !== sx || bend[1] !== sy) next.push([sx, sy]);
        if (e.detail >= 2) {
          onAddWire(next);
          setWirePts([]);
        } else setWirePts(next);
      }
      return;
    }
    if (tool === "note") {
      onAddNote(sx, sy);
      return;
    }
    if (tool === "tag") {
      const hit = wireAt(w.x, w.y);
      if (hit) onAddLabel(hit.x, hit.y);
      else onAddLabel(sx, sy);
      return;
    }
    if (tool === "probe") {
      const hit = wireAt(w.x, w.y);
      if (hit) onAddProbe(probeKind, hit.x, hit.y, hit.wire.net);
      return;
    }
    if (tool === "eraser") {
      if (hover) onDelete(hover);
      return;
    }
    // select
    if (hover) {
      if (e.shiftKey) onSelect([hover], true);
      else if (!selection.includes(hover)) onSelect([hover]);
      return;
    }
    if (!e.shiftKey) onSelect([]);
    setDrag({ kind: "marquee", x0: w.x, y0: w.y, x1: w.x, y1: w.y });
  };

  const onPointerMove = (e: RPE) => {
    const w = toWorld(e.clientX, e.clientY);
    setCursor(w);
    onCursor({ x: snap(w.x), y: snap(w.y) });
    if (drag?.kind === "pan") {
      setView((v) => ({ ...v, x: drag.ox + (e.clientX - drag.sx), y: drag.oy + (e.clientY - drag.sy) }));
      return;
    }
    if (drag?.kind === "marquee") {
      setDrag({ ...drag, x1: w.x, y1: w.y });
      return;
    }
    // hover testing
    let h: string | null = null;
    for (const p of [...circuit.parts].reverse()) {
      const b = partBBox(p);
      const m = 4 / view.k;
      if (w.x >= b.x - m && w.x <= b.x + b.w + m && w.y >= b.y - m && w.y <= b.y + b.h + m) {
        h = p.id;
        break;
      }
    }
    if (!h) {
      for (const n of notes) {
        if (w.x >= n.x && w.x <= n.x + 150 && w.y >= n.y && w.y <= n.y + 70) h = n.id;
      }
    }
    if (!h) {
      for (const pr of probes) {
        if (Math.hypot(w.x - pr.x, w.y - pr.y) < 10 / view.k) h = pr.id;
      }
    }
    setHover(h);
    const hw = h ? null : wireAt(w.x, w.y);
    setHoverWire(hw?.wire.id ?? null);
    onHoverNet(hw?.wire.net ?? null);
  };

  const onPointerUp = () => {
    if (drag?.kind === "marquee") {
      const x0 = Math.min(drag.x0, drag.x1),
        x1 = Math.max(drag.x0, drag.x1);
      const y0 = Math.min(drag.y0, drag.y1),
        y1 = Math.max(drag.y0, drag.y1);
      if (x1 - x0 > 3 && y1 - y0 > 3) {
        const ids = circuit.parts.filter((p) => {
          const b = partBBox(p);
          return b.x >= x0 && b.x + b.w <= x1 && b.y >= y0 && b.y + b.h <= y1;
        }).map((p) => p.id);
        onSelect(ids);
      }
    }
    setDrag(null);
  };

  const cursorCls = useMemo(() => {
    if (drag?.kind === "pan") return "cursor-grabbing";
    if (tool === "hand" || space) return "cursor-grab";
    if (placing || tool === "wire" || tool === "probe" || tool === "tag" || tool === "note") return "cursor-crosshair";
    if (tool === "eraser") return hover ? "cursor-pointer" : "cursor-crosshair";
    return hover ? "cursor-pointer" : "cursor-default";
  }, [drag, tool, space, placing, hover]);

  const gridMinor = GRID * view.k;
  const gridMajor = GRID * 5 * view.k;
  const selSet = new Set(selection);

  // wire colouring while running
  const netStroke = (net: string, isHover: boolean) => {
    if (isHover) return "var(--accent)";
    if (!live.running) return "var(--wire)";
    if (net === "OUT") return live.outHigh ? "var(--green)" : "var(--wire)";
    return "var(--wire)";
  };

  const previewWire = useMemo(() => {
    if (tool !== "wire" || wirePts.length === 0 || !cursor) return null;
    const last = wirePts[wirePts.length - 1];
    const sx = snap(cursor.x),
      sy = snap(cursor.y);
    const bend: [number, number] = Math.abs(sx - last[0]) > Math.abs(sy - last[1]) ? [sx, last[1]] : [last[0], sy];
    return [...wirePts, bend, [sx, sy] as [number, number]];
  }, [tool, wirePts, cursor]);

  return (
    <div
      ref={ref}
      className={cn("relative h-full w-full touch-none overflow-hidden bg-canvas", cursorCls)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        setHover(null);
        setHoverWire(null);
        setCursor(null);
        onCursor(null);
        onHoverNet(null);
      }}
    >
      <svg className="absolute inset-0 h-full w-full" style={{ display: "block" }}>
        <defs>
          <pattern id="grid-minor" width={gridMinor} height={gridMinor} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
            <circle cx={0.5} cy={0.5} r={view.k > 0.6 ? 0.9 : 0.6} fill="var(--grid-major)" />
          </pattern>
          <pattern id="grid-major" width={gridMajor} height={gridMajor} patternUnits="userSpaceOnUse" x={view.x} y={view.y}>
            <path d={`M${gridMajor} 0H0V${gridMajor}`} fill="none" stroke="var(--grid-minor)" strokeWidth={1} />
          </pattern>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {showGrid && (
          <>
            <rect width="100%" height="100%" fill="url(#grid-major)" />
            {view.k > 0.45 && <rect width="100%" height="100%" fill="url(#grid-minor)" />}
          </>
        )}

        <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
          {/* wires */}
          {circuit.wires.map((w) => {
            const isH = hoverWire === w.id;
            const d = w.points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ");
            const hot = live.running && w.net === "OUT" && live.outHigh;
            return (
              <g key={w.id}>
                {isH && <path d={d} fill="none" stroke="var(--accent)" strokeWidth={8} strokeOpacity={0.12} strokeLinecap="round" strokeLinejoin="round" />}
                <path
                  d={d}
                  fill="none"
                  stroke={netStroke(w.net, isH)}
                  strokeWidth={isH ? 2.2 : 1.6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter={hot ? "url(#glow)" : undefined}
                  style={{ transition: "stroke 120ms" }}
                />
              </g>
            );
          })}
          {/* junctions */}
          {circuit.junctions.map((j, i) => (
            <circle key={i} cx={j.x} cy={j.y} r={3} fill="var(--junction)" />
          ))}

          {/* parts */}
          {circuit.parts.map((p) => {
            const sel = selSet.has(p.id);
            const hov = hover === p.id && !sel;
            const b = partBBox(p);
            return (
              <g key={p.id}>
                {hov && tool !== "eraser" && (
                  <rect x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} rx={7} fill="var(--accent)" fillOpacity={0.06} stroke="var(--accent)" strokeOpacity={0.35} strokeWidth={1} />
                )}
                {hov && tool === "eraser" && (
                  <rect x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} rx={7} fill="var(--red)" fillOpacity={0.08} stroke="var(--red)" strokeOpacity={0.6} strokeWidth={1} />
                )}
                <PartSymbol p={p} live={live} selected={sel} />
                {sel && (
                  <g>
                    <rect x={b.x - 6} y={b.y - 6} width={b.w + 12} height={b.h + 12} rx={7} fill="var(--accent)" fillOpacity={0.07} stroke="var(--accent)" strokeWidth={1.25} />
                    {[[b.x - 6, b.y - 6], [b.x + b.w + 6, b.y - 6], [b.x - 6, b.y + b.h + 6], [b.x + b.w + 6, b.y + b.h + 6]].map(([hx, hy], i) => (
                      <rect key={i} x={hx - 3} y={hy - 3} width={6} height={6} rx={1.5} fill="var(--surface)" stroke="var(--accent)" strokeWidth={1.25} />
                    ))}
                  </g>
                )}
              </g>
            );
          })}

          {/* notes */}
          {notes.map((n) => {
            const sel = selSet.has(n.id);
            return (
              <g key={n.id} transform={`translate(${n.x} ${n.y})`}>
                <rect width={150} height={70} rx={8} fill="#fff6c7" stroke={sel ? "var(--accent)" : "#e7d98a"} strokeWidth={sel ? 1.5 : 1} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.08))" }} />
                <foreignObject x={10} y={8} width={130} height={54}>
                  <div style={{ font: "500 11px/1.35 var(--font-sans)", color: "#6b5a00", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{n.text}</div>
                </foreignObject>
              </g>
            );
          })}

          {/* probes */}
          {probes.map((pr) => {
            const col = pr.kind === "V" ? "var(--orange)" : "var(--teal)";
            const sel = selSet.has(pr.id);
            return (
              <g key={pr.id} transform={`translate(${pr.x} ${pr.y})`}>
                <circle r={4} fill={col} stroke="var(--surface)" strokeWidth={1.5} />
                <path d="M0 -4 L14 -26" stroke={col} strokeWidth={1.5} />
                <g transform="translate(14 -26)">
                  <rect x={0} y={-22} width={74} height={22} rx={6} fill="var(--surface)" stroke={sel ? "var(--accent)" : col} strokeWidth={1} style={{ filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.12))" }} />
                  <rect x={0} y={-22} width={18} height={22} rx={6} fill={col} />
                  <rect x={10} y={-22} width={8} height={22} fill={col} />
                  <text x={9} y={-7.5} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#fff" fontFamily="var(--font-sans)">{pr.kind}</text>
                  <text x={46} y={-7} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--ink)" fontFamily="var(--font-mono)" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {netValue(pr.net, pr.kind)}
                  </text>
                </g>
              </g>
            );
          })}

          {/* wire preview */}
          {previewWire && (
            <g>
              <path d={previewWire.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="anim-march" />
              {wirePts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill="var(--accent)" />)}
            </g>
          )}

          {/* placing ghost */}
          {placing && cursor && (
            <g opacity={0.55} style={{ pointerEvents: "none" }}>
              <PartSymbol
                p={{ id: "ghost", type: placing, ref: "", x: snap(cursor.x), y: snap(cursor.y), rot: placing === "resistor" || placing === "capacitor" || placing === "inductor" ? 90 : 0, label: "NET", showRef: false, showValue: false }}
                live={live}
              />
            </g>
          )}

          {/* cursor crosshair for precision tools */}
          {cursor && (tool === "wire" || tool === "probe" || placing || tool === "tag") && (
            <g style={{ pointerEvents: "none" }}>
              <circle cx={snap(cursor.x)} cy={snap(cursor.y)} r={3.5 / view.k} fill="none" stroke="var(--accent)" strokeWidth={1 / view.k} />
            </g>
          )}

          {/* marquee */}
          {drag?.kind === "marquee" && (
            <rect
              x={Math.min(drag.x0, drag.x1)}
              y={Math.min(drag.y0, drag.y1)}
              width={Math.abs(drag.x1 - drag.x0)}
              height={Math.abs(drag.y1 - drag.y0)}
              rx={3 / view.k}
              fill="var(--accent)"
              fillOpacity={0.08}
              stroke="var(--accent)"
              strokeWidth={1 / view.k}
            />
          )}
        </g>
      </svg>

      {tool === "wire" && wirePts.length > 0 && (
        <div className="anim-fade material-overlay pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 text-[12px] text-ink-2 shadow-2">
          Klick für Knick · Doppelklick oder <span className="font-medium text-ink">⏎</span> zum Beenden · <span className="font-medium text-ink">Esc</span> abbrechen
        </div>
      )}
      {placing && (
        <div className="anim-fade material-overlay pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-1.5 text-[12px] text-ink-2 shadow-2">
          Klick zum Platzieren · <span className="font-medium text-ink">⇧</span> für mehrere · <span className="font-medium text-ink">Esc</span> abbrechen
        </div>
      )}
    </div>
  );
}
