"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PART_MAP, SymbolPrim, formatValue, getPartSymbol } from "@/lib/library/catalog";
import { resolveSymbolStyle } from "@/lib/settings";
import {
  GRID,
  Instance,
  MeasurementProbe,
  ProbeKind,
  SchematicDoc,
  instanceBounds,
  pinPosition,
  rotatePoint,
} from "@/lib/schematic/model";
import { findNetTarget, netClick, previewNetPath, type NetTarget } from "@/lib/schematic/netdraw";
import { engine, hitTestInstance, useEditor, useHud, wireJunctionCandidates } from "@/state/editor";
import { LEGACY_PROBE_COLORS, PROBE_CSSVAR, PROBE_HEX } from "@/lib/probe-style";
import { Library as LibIcon, Sparkles } from "lucide-react";
import { rms, mean, peakToPeak, estimateFrequency } from "@/lib/sim/realtime";
import { loadHoverConfig } from "@/lib/settings";
import { parseSpiceValue } from "@/lib/schematic/importers";
import { click } from "./oszi2/sound";
import { openFileInEditor } from "@/lib/schematic/openFile";
import { adaptShortcut, useIsApple } from "@/lib/platform";
import { PEN_CURSOR } from "@/components/cursors";

interface Pt { x: number; y: number; }

const css = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

/** Mini-Wellenform im Hover-Tooltip: der Oszilloskop-Blick ohne Klick. */
function Sparkline({ data }: { data: number[] }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c || data.length < 2) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    let min = Infinity;
    let max = -Infinity;
    for (const v of data) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const span = max - min || 1;
    const yOf = (v: number) => h - 3 - ((v - min) / span) * (h - 6);
    ctx.strokeStyle = css("--border-strong", "#b4b0a8");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, yOf(0));
    ctx.lineTo(w - 2, yOf(0));
    ctx.stroke();
    ctx.strokeStyle = css("--accent", "#1f5fd0");
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * (w - 4) + 2;
      if (i) ctx.lineTo(x, yOf(v));
      else ctx.moveTo(x, yOf(v));
    });
    ctx.stroke();
  }, [data]);
  return <canvas ref={ref} width={132} height={34} className="mt-1 rounded" style={{ background: "rgba(0,0,0,0.28)" }} aria-hidden="true" />;
}

type CtxTarget =
  | { kind: "empty"; net: string | null }
  | { kind: "instance"; id: string; net: string | null }
  | { kind: "wire"; id: string; net: string | null }
  | { kind: "probe"; id: string; probe: MeasurementProbe; net: string | null };

export default function Canvas() {
  const apple = useIsApple();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState<Pt>({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[]; spark?: number[] | null } | null>(null);
  const [editing, setEditing] = useState<{ kind: "label" | "text" | "value"; x: number; y: number; sx: number; sy: number; instId?: string; initial?: string } | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; wx: number; wy: number; target: CtxTarget } | null>(null);
  const editingDone = useRef(false);
  const spaceDown = useRef(false);
  const stateRef = useRef({
    dragging: false,
    panning: false,
    marquee: null as null | { x0: number; y0: number; x1: number; y1: number },
    dragStart: { x: 0, y: 0 },
    moved: false,
    // W63: Netzmodus. Anker + bereits gesetzte Ecken; null = kein Netz in Arbeit.
    netDraft: null as null | { anchor: Pt; corners: Pt[] },
    // W64: Ziel unter dem Zeiger (Pin/Verbindungspunkt/Leitung) für den Magneten.
    netHover: null as null | NetTarget,
    lastMouse: { x: 0, y: 0 },
    duplicated: false,
  });

  const toWorld = useCallback((sx: number, sy: number): Pt => {
    const { view } = useEditor.getState();
    const rect = canvasRef.current?.getBoundingClientRect();
    const x = sx - (rect?.left ?? 0);
    const y = sy - (rect?.top ?? 0);
    return { x: x / view.zoom + view.x, y: y / view.zoom + view.y };
  }, []);

  const snap = useCallback((p: Pt): Pt => {
    const { snap: doSnap } = useEditor.getState();
    if (!doSnap) return p;
    return { x: Math.round(p.x / GRID) * GRID, y: Math.round(p.y / GRID) * GRID };
  }, []);

  const toScreen = useCallback((p: Pt): { x: number; y: number } => {
    const { view } = useEditor.getState();
    return { x: (p.x - view.x) * view.zoom, y: (p.y - view.y) * view.zoom };
  }, []);

  const findPinInfo = useCallback((doc: SchematicDoc, p: Pt, r = 12): { inst: Instance; pinIdx: number; pos: Pt; pinName: string; net?: string } | null => {
    const st = useEditor.getState();
    for (const inst of doc.instances) {
      const part = PART_MAP[inst.partId];
      if (!part) continue;
      for (let idx = 0; idx < part.pins.length; idx++) {
        const pos = pinPosition(inst, idx);
        if (Math.hypot(pos.x - p.x, pos.y - p.y) < r) {
          const pinName = part.pins[idx].name ?? `Pin ${idx}`;
          const net = st.netResult.pinNets[`${inst.id}:${idx}`];
          return { inst, pinIdx: idx, pos, pinName, net };
        }
      }
    }
    return null;
  }, []);

  const hitTestProbe = useCallback((doc: SchematicDoc, p: Pt, radius?: number): MeasurementProbe | null => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const r = radius ?? (isMobile ? 26 : 16);
    const radiusFinal = r;
    let best: MeasurementProbe | null = null;
    let bestD = radiusFinal * radiusFinal;
    for (const pr of doc.probes) {
      const d = (pr.x - p.x) ** 2 + (pr.y - p.y) ** 2;
      if (d < bestD) { bestD = d; best = pr; }
    }
    return best;
  }, []);

  // ---- drawing ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = wrap.clientWidth;
    const h = wrap.clientHeight;
    const vp = useHud.getState().viewport;
    if (vp.w !== w || vp.h !== h) useHud.setState({ viewport: { w, h } });
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const st = useEditor.getState();
    const { doc, view, selection, showGrid, netResult, sim, showCurrentFlow, showVoltageColors, showErcMarkers } = st;
    const live = sim.running || engine.lastState.time > 0 ? engine.lastState : null;
    const now = performance.now();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css("--canvas", "#0d1017");
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.scale(view.zoom, view.zoom);
    ctx.translate(-view.x, -view.y);

    const x0 = view.x, y0 = view.y;
    const x1 = view.x + w / view.zoom, y1 = view.y + h / view.zoom;

    if (showGrid) {
      const step = view.zoom < 0.45 ? GRID * 10 : view.zoom < 1.1 ? GRID * 5 : GRID;
      ctx.lineWidth = 1 / view.zoom;
      ctx.strokeStyle = css("--grid", "rgba(255,255,255,.05)");
      ctx.beginPath();
      for (let x = Math.floor(x0 / step) * step; x < x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = Math.floor(y0 / step) * step; y < y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
      const big = step * 10;
      ctx.strokeStyle = css("--grid-strong", "rgba(255,255,255,.1)");
      ctx.beginPath();
      for (let x = Math.floor(x0 / big) * big; x < x1; x += big) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = Math.floor(y0 / big) * big; y < y1; y += big) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
    }

    // ── Runde 11: Blattrand + Titelstempel (Zeichenblatt wie Ref 2) ──
    if (st.showPageFrame) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const inst of doc.instances) {
        const b = instanceBounds(inst);
        minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
      }
      for (const wire of doc.wires) for (const p of wire.points) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      if (isFinite(minX)) {
        const pad = 40;
        minX = Math.floor((minX - pad) / 50) * 50;
        minY = Math.floor((minY - pad) / 50) * 50;
        maxX = Math.ceil((maxX + pad) / 50) * 50;
        maxY = Math.ceil((maxY + pad + 44) / 50) * 50;
        ctx.strokeStyle = css("--border-strong", "#b4b0a8");
        ctx.lineWidth = 1.5 / view.zoom;
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        // Titelstempel unten rechts
        const tw = 150, th = 36, tx = maxX - tw - 8, ty = maxY - th - 8;
        ctx.fillStyle = css("--panel-solid", "#fbfaf8");
        ctx.fillRect(tx, ty, tw, th);
        ctx.strokeStyle = css("--border-strong", "#b4b0a8");
        ctx.lineWidth = 1 / view.zoom;
        ctx.strokeRect(tx, ty, tw, th);
        ctx.textAlign = "left";
        ctx.fillStyle = css("--text", "#1c1f22");
        ctx.font = `600 10px ${getComputedStyle(document.body).fontFamily}`;
        ctx.fillText(doc.name || "Unbenannt", tx + 6, ty + 13);
        ctx.font = "8px ui-monospace, monospace";
        ctx.fillStyle = css("--text-mute", "#8a8f95");
        ctx.fillText(new Date().toLocaleDateString("de-DE"), tx + 6, ty + 26);
        ctx.fillText("Blatt 1/1", tx + 90, ty + 26);
      }
    }

    const netCurrentMap = new Map<string, number>();
    if (live) {
      for (const inst of doc.instances) {
        const part = PART_MAP[inst.partId];
        if (!part) continue;
        const devCurrent = live.currents[inst.label] ?? 0;
        if (Math.abs(devCurrent) < 1e-12) continue;
        part.pins.forEach((_, idx) => {
          const net = netResult.pinNets[`${inst.id}:${idx}`];
          if (!net || net === "0") return;
          const prev = netCurrentMap.get(net) ?? 0;
          netCurrentMap.set(net, prev + devCurrent / part.pins.length);
        });
      }
    }

    // ── W1: Flussrichtung aus KCL statt Raten ──────────────────────────
    // Pro Netz: Einspeisepins (konventioneller Strom fließt INTO the net) als
    // BFS-Quellen; Richtung pro Leitung = entlang wachsender BFS-Distanz.
    // Default-Anzeige: Elektronenfluss (− → +), umschaltbar auf konventionell.
    const flowByWire = new Map<string, { dir: number; mag: number }>();
    const flowState = stateRef.current as any;
    const flowLive = showCurrentFlow && live && (sim.running || live.time > 0);
    if (flowLive) {
      // Phase läuft NUR im Run auf – Pause friert ein, Stopp zeigt nichts.
      if (sim.running) {
        const dtms = flowState._flowLast ? now - flowState._flowLast : 0;
        flowState._flowPhase = (flowState._flowPhase ?? 0) + Math.min(Math.max(dtms, 0), 100);
      }
      flowState._flowLast = now;
      if (flowState._flowDoc !== doc || flowState._flowNets !== netResult) {
        const adj = new Map<string, Set<string>>();
        const addE = (a: string, b: string) => {
          if (a === b) return;
          let sa = adj.get(a);
          if (!sa) adj.set(a, (sa = new Set()));
          sa.add(b);
          let sb = adj.get(b);
          if (!sb) adj.set(b, (sb = new Set()));
          sb.add(a);
        };
        for (const w of doc.wires)
          for (let i = 0; i + 1 < w.points.length; i++)
            addE(
              `${Math.round(w.points[i].x)},${Math.round(w.points[i].y)}`,
              `${Math.round(w.points[i + 1].x)},${Math.round(w.points[i + 1].y)}`,
            );
        flowState._flowDoc = doc;
        flowState._flowNets = netResult;
        flowState._flowAdj = adj;
      }
      const adj: Map<string, Set<string>> = flowState._flowAdj;
      const pinsByNet = new Map<string, Array<{ key: string; entering: number }>>();
      const netMag = new Map<string, number>();
      for (const inst of doc.instances) {
        const part = PART_MAP[inst.partId];
        if (!part || part.pins.length !== 2) continue;
        const I = live.currents[inst.label] ?? 0;
        if (!Number.isFinite(I) || Math.abs(I) < 1e-12) continue;
        for (let idx = 0; idx < 2; idx++) {
          const net = netResult.pinNets[`${inst.id}:${idx}`];
          if (!net) continue;
          const pos = pinPosition(inst, idx);
          const k = `${Math.round(pos.x)},${Math.round(pos.y)}`;
          // deviceCurrent: positiv = node0 → node1 INS Gerät. Ins Netz am
          // node1-Pin fließen +I, am node0-Pin −I (konventionell).
          const entering = idx === 0 ? -I : I;
          let arr = pinsByNet.get(net);
          if (!arr) pinsByNet.set(net, (arr = []));
          arr.push({ key: k, entering });
          if (entering > 0) netMag.set(net, (netMag.get(net) ?? 0) + entering);
        }
      }
      const dist = new Map<string, number>();
      const netSign = new Map<string, number>();
      for (const [net, pins] of pinsByNet) {
        const sources = pins.filter((p) => p.entering > 1e-12).map((p) => p.key);
        const sinks = pins.filter((p) => p.entering < -1e-12).map((p) => p.key);
        const seeds = sources.length ? sources : sinks;
        if (!seeds.length) continue;
        netSign.set(net, sources.length ? 1 : -1);
        if (!netMag.has(net)) {
          let m = 0;
          for (const p of pins) if (p.entering < 0) m += -p.entering;
          netMag.set(net, m);
        }
        const q: Array<[string, number]> = seeds.map((k) => [k, 0]);
        for (let qi = 0; qi < q.length; qi++) {
          const [k, dk] = q[qi];
          const prev = dist.get(k);
          if (prev !== undefined && prev <= dk) continue;
          dist.set(k, dk);
          for (const nb of adj.get(k) ?? []) {
            if (netResult.pointNets[nb] !== net) continue;
            if ((dist.get(nb) ?? Infinity) > dk + 1) q.push([nb, dk + 1]);
          }
        }
      }
      const electron = st.currentFlowDirection !== "conventional";
      for (const w of doc.wires) {
        if (w.points.length < 2) continue;
        const k0 = `${Math.round(w.points[0].x)},${Math.round(w.points[0].y)}`;
        const k1 = `${Math.round(w.points[w.points.length - 1].x)},${Math.round(w.points[w.points.length - 1].y)}`;
        const net = netResult.pointNets[k0] ?? netResult.pointNets[k1];
        if (!net) continue;
        const d0 = dist.get(k0);
        const d1 = dist.get(k1);
        const sign = netSign.get(net);
        if (d0 === undefined || d1 === undefined || d0 === d1 || !sign) continue;
        const conv = (d1 > d0 ? 1 : -1) * sign;
        flowByWire.set(w.id, { dir: electron ? -conv : conv, mag: netMag.get(net) ?? 0 });
      }
    }

    const wireColor = css("--wire", "#7dd3fc");
    const selColor = css("--wire-sel", "#fbbf24");
    const voltageColorFn = (v: number): string => {
      if (!showVoltageColors) return wireColor;
      const a = Math.min(Math.abs(v) / 12, 1);
      if (v > 0.15) return `rgb(${Math.round(80 + 175 * a)}, ${Math.round(190 - 90 * a)}, ${Math.round(255 - 180 * a)})`;
      if (v < -0.15) return `rgb(${Math.round(90 - 40 * a)}, ${Math.round(160 + 40 * a)}, 255)`;
      return css("--text-mute", "#8a8f95");
    };

    // Human Design: Hover highlight for wires – makes editing discoverable
    const hoveredWireId = (() => {
      try {
        const cur = useHud.getState().cursor;
        return hitWire(doc, cur);
      } catch { return null; }
    })();
    const hoveredHandle = (stateRef.current as any)._hoveredHandle as { wireId: string; pointIdx: number; isMid?: boolean; segIdx?: number } | null;
    const hoveredNetName = (() => {
      try {
        if (!hoveredWireId) return null;
        const w = doc.wires.find(x=>x.id===hoveredWireId);
        if (!w || !w.points.length) return null;
        const key = `${Math.round(w.points[0].x)},${Math.round(w.points[0].y)}`;
        return netResult.pointNets[key] ?? null;
      } catch { return null; }
    })();
    const hoveredPinInfo = (() => {
      try {
        const cur = useHud.getState().cursor;
        // Use same logic as findPinInfo but inline for draw
        for (const inst of doc.instances) {
          const part = (PART_MAP as any)[inst.partId];
          if (!part) continue;
          for (let idx=0; idx<part.pins.length; idx++) {
            const pos = pinPosition(inst, idx);
            if (Math.hypot(pos.x - cur.x, pos.y - cur.y) < 12) {
              return { inst, pinIdx: idx, pos };
            }
          }
        }
        return null;
      } catch { return null; }
    })();

    for (const wire of doc.wires) {
      const isSel = selection.includes(wire.id);
      const isHovered = hoveredWireId === wire.id;
      const isBus = (wire as any).isBus as boolean | undefined;
      const isNetHovered = (() => {
        if (!hoveredNetName || !wire.points.length) return false;
        const key = `${Math.round(wire.points[0].x)},${Math.round(wire.points[0].y)}`;
        const net = netResult.pointNets[key];
        return net === hoveredNetName;
      })();
      // Wire custom color like Multisim – if set, use it unless selected/hovered
      const customColor = (wire as any).color as string | undefined;
      let color = isSel ? selColor : (isHovered || isNetHovered) ? css("--accent-2","#22d3ee") : (customColor ?? wireColor);
      if (isBus) color = isSel ? selColor : (isHovered || isNetHovered) ? css("--accent-2","#22d3ee") : (customColor ?? css("--accent-3", "#7a4fa3"));
      if (wire.points.length) {
        const key = `${Math.round(wire.points[0].x)},${Math.round(wire.points[0].y)}`;
        const netName = netResult.pointNets[key];
        if (netName && live && showVoltageColors && !customColor && !isBus) {
          const netV = live.nets[netName] ?? 0;
          color = isSel ? selColor : (isHovered || isNetHovered) ? css("--accent-2","#22d3ee") : voltageColorFn(netV);
        }
      }
      // W13: Keine Glow-Konturen – Auswahl/Hover zeigen sich allein über
      // Farbe und Strichstärke (professionell, nicht dekorativ).
      ctx.strokeStyle = color;
      ctx.lineWidth = (isSel ? 3.0 : isHovered ? 2.8 : 1.9) / Math.max(view.zoom, 0.4);
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.beginPath();
      wire.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();

      // If selected, show GENIAL handles – Steve Jobs: editing must be obvious + delightful
      if (isSel) {
        const iz = 1 / Math.max(view.zoom, 0.3);
        for (let idx = 0; idx < wire.points.length; idx++) {
          const pt = wire.points[idx];
          const isFirst = idx === 0;
          const isLast = idx === wire.points.length - 1;
          const isHoveredHandle = hoveredHandle && hoveredHandle.wireId === wire.id && hoveredHandle.pointIdx === idx && !hoveredHandle.isMid;
          const baseSize = isFirst || isLast ? 9 : 7; // screen px
          const sz = (isHoveredHandle ? baseSize + 4 : baseSize) * iz;
          const isEnd = isFirst || isLast;
          // shadow
          ctx.save();
          ctx.fillStyle = "rgba(0,0,0,0.35)";
          ctx.beginPath();
          if (isEnd) ctx.arc(pt.x + 1*iz, pt.y + 1*iz, sz/2, 0, Math.PI*2);
          else ctx.rect(pt.x - sz/2 + 1*iz, pt.y - sz/2 + 1*iz, sz, sz);
          ctx.fill();
          ctx.restore();
          // fill
          ctx.fillStyle = isHoveredHandle ? "#ffffff" : css("--panel-solid","#1a1f2e");
          ctx.strokeStyle = isHoveredHandle ? css("--accent","#5b8cff") : isEnd ? css("--ok","#34d399") : css("--accent","#5b8cff");
          ctx.lineWidth = (isHoveredHandle ? 2.2 : 1.5) * iz;
          ctx.beginPath();
          if (isEnd) {
            ctx.arc(pt.x, pt.y, sz/2, 0, Math.PI*2);
          } else {
            // square with rounded corners, or diamond for middle
            if (idx % 2 === 0) {
              ctx.rect(pt.x - sz/2, pt.y - sz/2, sz, sz);
            } else {
              // diamond
              ctx.moveTo(pt.x, pt.y - sz/2);
              ctx.lineTo(pt.x + sz/2, pt.y);
              ctx.lineTo(pt.x, pt.y + sz/2);
              ctx.lineTo(pt.x - sz/2, pt.y);
              ctx.closePath();
            }
          }
          ctx.fill();
          ctx.stroke();
          // inner dot for end points
          if (isEnd) {
            ctx.fillStyle = isHoveredHandle ? css("--accent","#5b8cff") : css("--ok","#34d399");
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, (isHoveredHandle ? 2.5 : 1.8) * iz, 0, Math.PI*2);
            ctx.fill();
          }
          // index label for first few points when zoomed
          if (view.zoom > 0.8 && wire.points.length < 10) {
            ctx.fillStyle = css("--text-mute","#64748b");
            ctx.font = `${9*iz}px ui-monospace, monospace`;
            ctx.textAlign = "center";
            ctx.fillText(String(idx), pt.x, pt.y - (sz/2 + 8*iz));
          }
        }
        // Mid-segment add handles – small plus that creates new point (wow moment)
        for (let s = 0; s < wire.points.length - 1; s++) {
          const a = wire.points[s];
          const b = wire.points[s+1];
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          const isHoveredMid = hoveredHandle && hoveredHandle.wireId === wire.id && hoveredHandle.isMid && hoveredHandle.segIdx === s;
          // Only show mid handle when hovered wire or always when selected but subtle
          if (!isHovered && !isHoveredMid) continue; // show only on hover to reduce clutter, but always if hovered mid
          // For selected wire, show all mids faintly
          const showAlways = isSel && view.zoom > 0.6;
          if (!showAlways && !isHoveredMid && !isHovered) continue;
          const msz = (isHoveredMid ? 10 : 6) * iz;
          ctx.save();
          ctx.fillStyle = isHoveredMid ? "#ffffff" : "rgba(255,255,255,0.75)";
          ctx.strokeStyle = isHoveredMid ? css("--accent-2","#22d3ee") : css("--text-mute", "#8a8f95");
          ctx.lineWidth = 1.2 * iz;
          ctx.beginPath();
          ctx.arc(mx, my, msz/2, 0, Math.PI*2);
          ctx.fill();
          ctx.stroke();
          // plus icon
          ctx.strokeStyle = isHoveredMid ? css("--accent-2","#22d3ee") : css("--text-mute", "#8a8f95");
          ctx.lineWidth = 1.2 * iz;
          ctx.beginPath();
          ctx.moveTo(mx - msz*0.25, my);
          ctx.lineTo(mx + msz*0.25, my);
          ctx.moveTo(mx, my - msz*0.25);
          ctx.lineTo(mx, my + msz*0.25);
          ctx.stroke();
          ctx.restore();
        }
      }
      // If hovered but not selected, show subtle dot + hint for adding probe or selecting
      if (isHovered && !isSel) {
        ctx.fillStyle = css("--accent-2","#22d3ee")+"AA";
        ctx.beginPath();
        ctx.arc(wire.points[0].x, wire.points[0].y, 4 / Math.max(view.zoom,0.4), 0, Math.PI*2);
        ctx.fill();
        // W13: Der Endpunkt-Marker genügt – kein Glow-Streifen.
      }

      // W15: Dezente matte Punkte aus echter Flussrichtung – keine Pfeile,
      // kein Neon. Phase nur im Run lebendig (W1).
      const flow = flowByWire.get(wire.id);
      if (flow && flow.mag > 1e-9 && wire.points.length > 1) {
        const absI = flow.mag;
        const totalLen = polyLength(wire.points);
        if (totalLen > 2) {
          const speed = Math.min(400, Math.max(20, Math.log10(absI + 1e-9) * 40 + 80));
          const dir = flow.dir;
          const offset = (((flowState._flowPhase ?? 0) * speed * 0.001 * dir) % totalLen + totalLen) % totalLen;
          const count = Math.max(1, Math.floor(totalLen / 60));
          ctx.fillStyle = css("--text-mute", "#94a3b8");
          for (let d = 0; d < count; d++) {
            const pos = (offset + (d * totalLen) / count) % totalLen;
            const pt = pointAtLength(wire.points, pos);
            if (!pt) continue;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 2 / Math.max(view.zoom, 0.5), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
    }

    // Alignment guides when dragging wire point or instances – delightful snap feedback (Figma/Multisim)
    const align = (stateRef.current as any)._alignGuides as { x: number | null; y: number | null } | null;
    if (align && ((stateRef.current as any).wirePointDrag || (stateRef.current as any).dragging)) {
      ctx.save();
      ctx.strokeStyle = "rgba(91,140,255,0.6)";
      ctx.setLineDash([6,4]);
      ctx.lineWidth = 1 / Math.max(view.zoom, 0.5);
      if (align.x !== null) {
        ctx.beginPath();
        ctx.moveTo(align.x, y0);
        ctx.lineTo(align.x, y1);
        ctx.stroke();
      }
      if (align.y !== null) {
        ctx.beginPath();
        ctx.moveTo(x0, align.y);
        ctx.lineTo(x1, align.y);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // W53/W61: Verbindungspunkte kommen aus der Netzprüfung – T-Kontakte
    // (≥ 3 Anschlüsse), Pin auf Leitung und alle ausdrücklich gesetzten
    // Verbindungspunkte. Eine bloße Kreuzung zweier Leitungen hat keinen Punkt
    // und ist deshalb auch nicht leitend (Multisim-Regel).
    const jz = 1 / Math.max(view.zoom, 0.4);
    ctx.fillStyle = css("--wire", "#7dd3fc");
    for (const j of netResult.junctions) {
      ctx.beginPath();
      ctx.arc(j.x, j.y, 3.4 * jz, 0, Math.PI * 2);
      ctx.fill();
    }
    // W51: offene Leitungsenden sichtbar machen – der Fehler fällt dort auf,
    // wo er entsteht. Während des Ziehens eines Leitungspunkts nicht flackern.
    const draggingWirePoint = Boolean((stateRef.current as any).wirePointDrag);
    if (showErcMarkers && !draggingWirePoint) {
      ctx.save();
      ctx.strokeStyle = css("--err", "#b3372c");
      ctx.lineWidth = 1.6 * jz;
      for (const e of netResult.openEnds) {
        ctx.beginPath();
        ctx.arc(e.x, e.y, 5 * jz, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const inst of doc.instances) drawInstance(ctx, inst, selection.includes(inst.id), view.zoom, live);

    // Inline live values – Multisim magic: show V on wires, I on components directly on schematic
    if (live && st.showInlineValues && st.sim.running) {
      ctx.save();
      const iz = 1 / Math.max(view.zoom, 0.3);
      // Wires: show voltage at middle
      for (const wire of doc.wires) {
        if (wire.points.length < 2) continue;
        const midIdx = Math.floor(wire.points.length / 2);
        const a = wire.points[midIdx];
        const b = wire.points[Math.min(midIdx+1, wire.points.length-1)];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        const key = `${Math.round(wire.points[0].x)},${Math.round(wire.points[0].y)}`;
        const netName = st.netResult.pointNets[key];
        if (!netName) continue;
        const v = live.nets[netName];
        if (v === undefined) continue;
        const txt = formatValue(v, "V");
        // Background pill
        ctx.font = `${10*iz}px ui-monospace, monospace`;
        ctx.textAlign = "center";
        const tw = ctx.measureText(txt).width;
        const pad = 4*iz;
        const h = 14*iz;
        // Use voltage color
        const col = v > 0.5 ? css("--accent", "#1f5fd0") : v < -0.5 ? css("--err", "#b3372c") : css("--text-mute", "#8a8f95");
        ctx.fillStyle = "rgba(13,16,23,0.85)";
        ctx.strokeStyle = col + "60";
        ctx.lineWidth = 1*iz;
        const rx = mx - tw/2 - pad;
        const ry = my - h/2 - 6*iz;
        // @ts-ignore
        if (ctx.roundRect) {
          ctx.beginPath();
          // @ts-ignore
          ctx.roundRect(rx, ry, tw + pad*2, h, 3*iz);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(rx, ry, tw + pad*2, h);
          ctx.strokeRect(rx, ry, tw + pad*2, h);
        }
        ctx.fillStyle = col;
        ctx.fillText(txt, mx, my - 2*iz);
      }
      // Components: show current next to component
      for (const inst of doc.instances) {
        const cur = live.currents[inst.label];
        if (cur === undefined || Math.abs(cur) < 1e-9) continue;
        const txt = formatValue(cur, "A");
        const b = instanceBounds(inst);
        const cx = b.x + b.w + 8*iz;
        const cy = b.y + b.h/2;
        ctx.font = `${9*iz}px ui-monospace, monospace`;
        ctx.textAlign = "left";
        const tw = ctx.measureText(txt).width;
        const pad = 3*iz;
        const h = 12*iz;
        const col = Math.abs(cur) > 0.01 ? css("--warn", "#a87a12") : css("--text-mute", "#8a8f95");
        ctx.fillStyle = "rgba(13,16,23,0.85)";
        ctx.strokeStyle = col + "50";
        ctx.lineWidth = 1*iz;
        // @ts-ignore
        if (ctx.roundRect) {
          ctx.beginPath();
          // @ts-ignore
          ctx.roundRect(cx, cy - h/2, tw + pad*2, h, 3*iz);
          ctx.fill();
          ctx.stroke();
        } else {
          ctx.fillRect(cx, cy - h/2, tw + pad*2, h);
          ctx.strokeRect(cx, cy - h/2, tw + pad*2, h);
        }
        ctx.fillStyle = col;
        ctx.fillText(txt, cx + pad, cy + 3*iz);
      }
      ctx.restore();
    }

    // ERC visual markers – red/yellow markers directly on canvas, like Multisim
    if (st.showErcMarkers && (st.netResult.errors.length > 0 || st.netResult.warnings.length > 0)) {
      ctx.save();
      const iz = 1 / Math.max(view.zoom, 0.3);
      for (const err of st.netResult.errors) {
        // Try to find instance or wire related to error – simple heuristic: look for label in error message
        // For now, show marker at center of first instance if no better location
        let mx = 0, my = 0;
        if (st.doc.instances.length > 0) {
          const inst = st.doc.instances[0];
          const b = instanceBounds(inst);
          mx = b.x + b.w/2;
          my = b.y + b.h/2;
        }
        // If error message contains instance label, try to find it
        for (const inst of st.doc.instances) {
          if (err.includes(inst.label)) {
            const b = instanceBounds(inst);
            mx = b.x + b.w/2;
            my = b.y - 12*iz;
            break;
          }
        }
        // Draw red error marker
        ctx.fillStyle = css("--err", "#b3372c");
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5*iz;
        ctx.beginPath();
        ctx.arc(mx, my, 8*iz, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${10*iz}px ui-sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("!", mx, my + 3.5*iz);
        // Label
        ctx.font = `${9*iz}px ui-sans-serif`;
        ctx.fillStyle = css("--err", "#b3372c");
        ctx.textAlign = "left";
        ctx.fillText(err.slice(0, 40), mx + 12*iz, my + 3*iz);
      }
      for (const warn of st.netResult.warnings) {
        let mx = 20*iz, my = 20*iz;
        // Similar heuristic
        for (const inst of st.doc.instances) {
          if (warn.includes(inst.label)) {
            const b = instanceBounds(inst);
            mx = b.x + b.w/2;
            my = b.y + b.h + 12*iz;
            break;
          }
        }
        ctx.fillStyle = css("--warn", "#a87a12");
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.2*iz;
        ctx.beginPath();
        ctx.arc(mx, my, 6*iz, 0, Math.PI*2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = `bold ${8*iz}px ui-sans-serif`;
        ctx.textAlign = "center";
        ctx.fillText("!", mx, my + 2.5*iz);
      }
      ctx.restore();
    }

    // Rated components blow up – smoke animation when power exceeded
    if (st.showRated && live && st.sim.running) {
      ctx.save();
      const iz = 1 / Math.max(view.zoom, 0.3);
      for (const inst of st.doc.instances) {
        const pwr = live.power[inst.label];
        if (pwr === undefined) continue;
        // Simple rated check: resistor 0.25W, cap 0.1W, etc.
        const part = PART_MAP[inst.partId];
        if (!part) continue;
        let maxP = 0.25;
        if (part.category.includes("Capacitor")) maxP = 0.1;
        if (part.category.includes("Inductor")) maxP = 0.5;
        if (part.category.includes("Diode") || part.category.includes("Transistor")) maxP = 0.5;
        if (Math.abs(pwr) > maxP * 1.5) {
          const b = instanceBounds(inst);
          const cx = b.x + b.w/2;
          const cy = b.y + b.h/2;
          // Smoke puffs – Zeit aus der Simulation, damit Pause = Stillstand (W14)
          const t = live.time * 3.33;
          for (let i = 0; i < 3; i++) {
            const ang = t + i * 2.1;
            const r = 8*iz + i*6*iz + Math.sin(t+i)*2*iz;
            const x = cx + Math.cos(ang) * r * 0.3;
            const y = cy - 10*iz - i*10*iz - Math.sin(t*0.7+i)*3*iz;
            ctx.fillStyle = `rgba(120,120,120,${0.4 - i*0.1})`;
            ctx.beginPath();
            ctx.arc(x, y, (4+ i*2)*iz, 0, Math.PI*2);
            ctx.fill();
          }
          // Red border
          ctx.strokeStyle = css("--err", "#b3372c");
          ctx.lineWidth = 2*iz;
          ctx.setLineDash([4*iz,3*iz]);
          ctx.strokeRect(b.x - 2*iz, b.y - 2*iz, b.w + 4*iz, b.h + 4*iz);
          ctx.setLineDash([]);
          // Tooltip
          ctx.fillStyle = css("--err", "#b3372c");
          ctx.font = `bold ${9*iz}px ui-sans-serif`;
          ctx.textAlign = "center";
          ctx.fillText(`⚠ ${formatValue(pwr,"W")} > ${maxP}W`, cx, b.y - 8*iz);
        }
      }
      ctx.restore();
    }

    // Pin hover highlight – delightful: show pin name, net, highlight
    if (hoveredPinInfo) {
      const { pos } = hoveredPinInfo;
      const iz = 1 / Math.max(view.zoom, 0.3);
      ctx.save();
      ctx.fillStyle = "rgba(91,140,255,0.25)";
      ctx.strokeStyle = css("--accent","#5b8cff");
      ctx.lineWidth = 2 * iz;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 10*iz, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
      // inner dot
      ctx.fillStyle = css("--accent","#5b8cff");
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3*iz, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    ctx.font = "600 11px ui-sans-serif, system-ui";
    for (const label of doc.labels) {
      const name = netResult.pointNets[`${Math.round(label.x)},${Math.round(label.y)}`] ?? label.name;
      const txt = name || label.name;
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = css("--panel-2", "#151a25");
      roundRect(ctx, label.x + 8, label.y - 20, tw + 12, 16, 4); ctx.fill();
      ctx.strokeStyle = css("--border-strong", "#333"); ctx.lineWidth = 1 / view.zoom; ctx.stroke();
      ctx.fillStyle = css("--accent-2", "#22d3ee"); ctx.textAlign = "left"; ctx.fillText(txt, label.x + 14, label.y - 8);
      ctx.fillStyle = css("--accent-2", "#22d3ee"); ctx.beginPath(); ctx.arc(label.x, label.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    ctx.textAlign = "left";
    for (const note of doc.notes) {
      ctx.fillStyle = css("--text-mute", "#64708c");
      ctx.font = `${note.size ?? 11}px ui-sans-serif, system-ui`;
      ctx.fillText(note.text, note.x, note.y);
    }

    for (const probe of doc.probes) {
      const isSel = selection.includes(probe.id);
      drawProbe(ctx, probe, isSel, view.zoom, live, netResult, netCurrentMap);
    }

    for (const probeName of st.probes) {
      const net = netResult.nets.find((n) => n.name === probeName);
      if (!net || !net.points.length) continue;
      const p = net.points[0];
      ctx.strokeStyle = css("--accent-3", "#a78bfa"); ctx.lineWidth = 1.6 / view.zoom;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.stroke();
      if (live) {
        ctx.fillStyle = css("--accent-3", "#a78bfa"); ctx.font = "600 10px ui-monospace, monospace";
        ctx.fillText(formatValue(live.nets[probeName] ?? 0, "V"), p.x + 10, p.y - 8);
      }
    }

    const sr = stateRef.current;
    // W68: Knotenpunkt-Vorschau
    if ((sr as any).junctionHover) {
      const j = (sr as any).junctionHover as { x: number; y: number };
      const connected = (st.doc.junctions ?? []).some((q) => Math.hypot(q.x - j.x, q.y - j.y) < 0.5);
      ctx.save();
      ctx.strokeStyle = connected ? css("--err", "#b3372c") : css("--ok", "#4ade80");
      ctx.lineWidth = 1.8 / Math.max(view.zoom, 0.3);
      ctx.beginPath(); ctx.arc(j.x, j.y, 8 / Math.max(view.zoom, 0.3), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = connected ? css("--err", "#b3372c") : css("--ok", "#4ade80");
      ctx.beginPath(); ctx.arc(j.x, j.y, 2.6 / Math.max(view.zoom, 0.3), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // W63/W64: Netz in Arbeit – gesetzte Ecken stehen fest, der Rest läuft als
    // gestrichelte Vorschau bis zum Zeiger bzw. exakt auf das Magnet-Ziel.
    if (sr.netDraft) {
      const draft = sr.netDraft;
      const ref = draft.corners.length ? draft.corners[draft.corners.length - 1] : draft.anchor;
      const hover = sr.netHover;
      const magnetHit = hover && Math.hypot(hover.x - ref.x, hover.y - ref.y) > 0.01 ? { x: hover.x, y: hover.y } : null;
      const preview = previewNetPath(draft.anchor, draft.corners, magnetHit ?? { x: cursor.x, y: cursor.y });
      const zLine = 2 / Math.max(view.zoom, 0.3);
      // fester Teil (Anker + gesetzte Ecken)
      ctx.strokeStyle = css("--accent", "#5b8cff"); ctx.lineWidth = zLine;
      ctx.beginPath();
      ctx.moveTo(draft.anchor.x, draft.anchor.y);
      for (const c of draft.corners) ctx.lineTo(c.x, c.y);
      ctx.stroke();
      // Vorschau ab dem letzten festen Punkt
      ctx.setLineDash([5, 4]); ctx.lineWidth = zLine * 0.9;
      ctx.beginPath();
      ctx.moveTo(ref.x, ref.y);
      for (let i = 1; i < preview.length; i++) ctx.lineTo(preview[i].x, preview[i].y);
      ctx.stroke(); ctx.setLineDash([]);
      // Anker- und Eckpunkte sichtbar machen
      ctx.fillStyle = css("--accent", "#5b8cff");
      for (const p of [draft.anchor, ...draft.corners]) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 / Math.max(view.zoom, 0.3), 0, Math.PI * 2); ctx.fill();
      }
      // Magnet-Ziel hervorheben, damit klar ist, wo angeschlossen wird
      if (magnetHit && hover) {
        const r = hover.kind === "pin" ? 7 : 6;
        ctx.save();
        ctx.strokeStyle = hover.kind === "wire" ? css("--accent-2", "#22d3ee") : css("--ok", "#4ade80");
        ctx.lineWidth = 1.8 / Math.max(view.zoom, 0.3);
        ctx.beginPath(); ctx.arc(hover.x, hover.y, r / Math.max(view.zoom, 0.3), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = css("--text-dim", "#cbd5e1");
        ctx.font = `${11 / Math.max(view.zoom, 0.5)}px ui-monospace, monospace`;
        ctx.fillText(hover.label, hover.x + 12 / Math.max(view.zoom, 0.5), hover.y - 8 / Math.max(view.zoom, 0.5));
        ctx.restore();
      }
    }

    if (st.tool === "place" && st.placingPartId || useHud.getState().dragPart) {
      const partId = st.placingPartId ?? useHud.getState().dragPart;
      const part = PART_MAP[partId ?? ""];
      if (part) {
        // Ghost: halbtransparent, ohne Schatteneffekte (W13)
        ctx.save();
        ctx.globalAlpha = 0.65;
        drawInstance(ctx, { id: "ghost", partId: part.id, x: cursor.x, y: cursor.y, rot: 0, label: part.ref + "?", params: {} }, false, view.zoom, null);
        ctx.restore();
        // Snap indicator
        const snapped = snap(cursor);
        if (Math.abs(snapped.x - cursor.x) > 0.1 || Math.abs(snapped.y - cursor.y) > 0.1) {
          ctx.save();
          ctx.fillStyle = "rgba(91,140,255,0.3)";
          ctx.strokeStyle = css("--accent","#5b8cff");
          ctx.lineWidth = 1 / Math.max(view.zoom, 0.5);
          ctx.beginPath();
          ctx.arc(snapped.x, snapped.y, 4 / Math.max(view.zoom,0.5), 0, Math.PI*2);
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    if (st.tool.startsWith("probe") && st.placingProbeKind) {
      ctx.save();
      ctx.globalAlpha = 0.7;
      drawProbe(ctx, { id: "ghost", kind: st.placingProbeKind, x: cursor.x, y: cursor.y } as MeasurementProbe, false, view.zoom, live, netResult, netCurrentMap);
      ctx.restore();
      // Live-Vorschau: Ring zeigt das Netz, dessen Wert der Ghost bereits anzeigt
      const gNet = nearestNetName(cursor, 18);
      if (gNet) {
        ctx.save();
        ctx.strokeStyle = css("--accent-2", "#22d3ee");
        ctx.lineWidth = 1.5 / Math.max(view.zoom, 0.3);
        ctx.beginPath();
        ctx.arc(cursor.x, cursor.y, 7 / Math.max(view.zoom, 0.3), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    if (sr.marquee) {
      const m = sr.marquee;
      ctx.fillStyle = "color-mix(in srgb, " + css("--accent", "#5b8cff") + " 14%, transparent)";
      ctx.strokeStyle = css("--accent", "#5b8cff"); ctx.lineWidth = 1.2 / view.zoom;
      ctx.setLineDash([6,4]);
      ctx.fillRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
      ctx.strokeRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
      ctx.setLineDash([]);
      // Count badge – delightful
      const w = Math.abs(m.x1 - m.x0);
      const h = Math.abs(m.y1 - m.y0);
      const cx = (m.x0 + m.x1)/2;
      const cy = (m.y0 + m.y1)/2;
      if (w > 20 && h > 20) {
        ctx.save();
        ctx.scale(1/view.zoom, 1/view.zoom);
        const sx = cx * view.zoom;
        const sy = cy * view.zoom;
        ctx.fillStyle = "var(--panel-solid)";
        ctx.strokeStyle = "var(--border-strong)";
        ctx.lineWidth = 1;
        const txt = `${Math.round(w)}×${Math.round(h)}`;
        ctx.font = "11px ui-sans-serif";
        const tw = ctx.measureText(txt).width;
        const pad = 8;
        ctx.beginPath();
        // @ts-ignore
        if (ctx.roundRect) ctx.roundRect(sx - tw/2 - pad, sy - 10, tw + pad*2, 18, 6);
        else ctx.rect(sx - tw/2 - pad, sy - 10, tw + pad*2, 18);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "var(--text)";
        ctx.textAlign = "center";
        ctx.fillText(txt, sx, sy+2);
        ctx.restore();
      }
    }

    ctx.restore();

    // ── Runde 11: Lineale (Screen-Raum, Ref-2-Chrome) ──
    if (st.showRulers) {
      const R = 16;
      ctx.fillStyle = css("--panel-solid", "#fbfaf8");
      ctx.fillRect(0, 0, w, R);
      ctx.fillRect(0, 0, R, h);
      ctx.strokeStyle = css("--border", "#cfccc5");
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, R + 0.5); ctx.lineTo(w, R + 0.5);
      ctx.moveTo(R + 0.5, 0); ctx.lineTo(R + 0.5, h);
      ctx.stroke();
      // Schöner Tick-Schritt: ≥ 48 px Abstand
      const rawStep = 48 / view.zoom;
      const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
      const norm = rawStep / mag;
      const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
      ctx.fillStyle = css("--text-mute", "#8a8f95");
      ctx.strokeStyle = css("--text-mute", "#8a8f95");
      ctx.font = "8px ui-monospace, monospace";
      ctx.textAlign = "center";
      for (let wx = Math.floor(view.x / step) * step; wx < view.x + w / view.zoom; wx += step) {
        const sx = (wx - view.x) * view.zoom;
        if (sx < R) continue;
        ctx.beginPath(); ctx.moveTo(sx + 0.5, R - 5); ctx.lineTo(sx + 0.5, R); ctx.stroke();
        ctx.fillText(String(Math.round(wx)), sx, R - 6);
      }
      for (let wy = Math.floor(view.y / step) * step; wy < view.y + h / view.zoom; wy += step) {
        const sy = (wy - view.y) * view.zoom;
        if (sy < R) continue;
        ctx.beginPath(); ctx.moveTo(R - 5, sy + 0.5); ctx.lineTo(R, sy + 0.5); ctx.stroke();
        ctx.save();
        ctx.translate(R - 6, sy);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(String(Math.round(wy)), 0, 0);
        ctx.restore();
      }
      ctx.fillStyle = css("--panel-solid", "#fbfaf8");
      ctx.fillRect(0, 0, R, R);
      ctx.strokeStyle = css("--border", "#cfccc5");
      ctx.strokeRect(0.5, 0.5, R - 1, R - 1);
    }
  }, [cursor, snap]);

  useEffect(() => {
    let raf = 0, last = performance.now(), frames = 0, fpsTime = last;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05); last = now;
      const st = useEditor.getState();
      if (st.sim.running) engine.tick(dt);
      (globalThis as unknown as { __clsTime?: number }).__clsTime = engine.lastState.time;
      draw(); frames++;
      if (now - fpsTime > 500) {
        const fps = (frames * 1000) / (now - fpsTime); frames = 0; fpsTime = now;
        useEditor.getState().bumpTick(fps);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  useEffect(() => { useEditor.getState().refreshNets(); }, []);

  // key tracking for space pan and ctrl duplicate
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  const onWheel = useCallback((e: React.WheelEvent) => {
    const st = useEditor.getState();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      st.setView({ x: st.view.x + e.deltaY / st.view.zoom, y: st.view.y + e.deltaX / st.view.zoom });
      return;
    }
    const factor = Math.exp(-e.deltaY * 0.0014);
    const zoom = Math.min(6, Math.max(0.12, st.view.zoom * factor));
    const wx = mx / st.view.zoom + st.view.x, wy = my / st.view.zoom + st.view.y;
    st.setView({ zoom, x: wx - mx / zoom, y: wy - my / zoom });
  }, []);

  const getTargetAt = (world: Pt): CtxTarget => {
    const st = useEditor.getState();
    const probe = hitTestProbe(st.doc, world);
    if (probe) {
      const net = (probe as any).net ?? nearestNetName(world);
      return { kind: "probe", id: probe.id, probe, net };
    }
    const inst = hitTestInstance(st.doc, world.x, world.y);
    if (inst) {
      const net = nearestNetName(world);
      return { kind: "instance", id: inst.id, net };
    }
    const wireId = hitWire(st.doc, world);
    if (wireId) {
      const net = nearestNetName(world);
      return { kind: "wire", id: wireId, net };
    }
    return { kind: "empty", net: nearestNetName(world) };
  };

  // Touch handling state
  const touchState = useRef<{ lastDist: number; lastMid: Pt | null; longPressTimer: any; startPt: Pt | null } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    // Mobile long press for context menu / Alt tooltip
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    if (isMobile) {
      const world = toWorld(e.clientX, e.clientY);
      (touchState.current as any) = { startPt: world, lastDist: 0, lastMid: null, longPressTimer: null };
      // Long press 500ms -> context menu + Alt tooltip
      (touchState.current as any).longPressTimer = setTimeout(() => {
        const st = useEditor.getState();
        const hit = hitTestInstance(st.doc, world.x, world.y);
        const probe = hitTestProbe(st.doc, world);
        const net = nearestNetName(world, 24);
        let target: CtxTarget;
        if (probe) target = { kind: "probe", id: probe.id, probe, net };
        else if (hit) target = { kind: "instance", id: hit.id, net };
        else {
          const wireId = hitWire(st.doc, world);
          if (wireId) target = { kind: "wire", id: wireId, net };
          else target = { kind: "empty", net };
        }
        setCtxMenu({ x: e.clientX, y: e.clientY, wx: world.x, wy: world.y, target });
        // Haptic feedback
        try { (navigator as any).vibrate?.(20); } catch {}
      }, 500);
    }

    const st = useEditor.getState();
    const world = toWorld(e.clientX, e.clientY);
    const sp = snap(world);
    const sr = stateRef.current;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    sr.dragStart = world; sr.moved = false; sr.duplicated = false;

    if (ctxMenu) { setCtxMenu(null); return; }

    // W63/W64: Netzmodus wie in Multisim – hat Vorrang, solange gezeichnet
    // wird. Pin anklicken öffnet den Modus, Klick ins Leere setzt einen
    // Eckpunkt, Klick auf Pin/Verbindungspunkt/Leitung schließt exakt an und
    // beendet ihn (Esc verwirft die angefangene Leitung).
    const magnet = 14 / Math.max(st.view.zoom, 0.25);
    if (st.tool !== "junction") {
      // (Im Knotenpunkt-Werkzeug darf ein Klick nahe einem Pin kein Netz beginnen.)
      const res = netClick(st.doc, sr.netDraft, world, sp, { magnet, allowStartOnEmpty: st.tool === "wire", startOnWire: st.tool === "wire" });
      if (res) {
        if (res.kind === "start") {
          sr.netDraft = res.draft;
          sr.netHover = null;
          if (canvasRef.current) canvasRef.current.style.cursor = PEN_CURSOR;
          st.log("info", `Netz von (${Math.round(res.draft.anchor.x)}, ${Math.round(res.draft.anchor.y)}): Klick setzt Ecken, Klick auf Pin/Leitung verbindet, Esc bricht ab`);
        } else if (res.kind === "corner") {
          sr.netDraft = res.draft;
          st.log("info", `Eckpunkt gesetzt (${Math.round(sp.x)}, ${Math.round(sp.y)}) – weiter zeichnen, Esc bricht ab`);
        } else {
          st.addWire({ id: "w_" + Math.random().toString(36).slice(2, 9), points: res.points });
          st.log("ok", `Netz angeschlossen – ${res.target.label}`);
          sr.netDraft = null; sr.netHover = null;
          st.setTool("select");
        }
        return;
      }
    }

    // Runde 17 (W32c): Messleitung legen – Vorrang vor allen Werkzeugen.
    // Klick auf Leitung oder Bauteil-Pin verbindet den gehaltenen Kanal dorthin.
    if (st.leadArmed && e.button === 0 && !spaceDown.current) {
      const tgt = probeTarget(st.doc, world);
      if (tgt) {
        st.connectProbeWire(st.leadArmed.instanceId, st.leadArmed.pinIndex, tgt);
        st.setLeadArmed(null);
        click("plug");
        return;
      }
    }

    // Wire point drag – GENIAL handles with mid-point add (Steve Jobs: wow moment)
    if (st.tool === "select") {
      const handle = hitWireHandle(st.doc, world, st.view.zoom, true);
      if (handle) {
        if (handle.isMid) {
          // Insert new point at mid, then drag it – delightful!
          st.commit((d)=>{
            const w = d.wires.find(x=>x.id===handle.wireId);
            if (w) {
              const a = w.points[handle.segIdx!];
              const b = w.points[handle.segIdx!+1];
              const mx = (a.x + b.x)/2;
              const my = (a.y + b.y)/2;
              w.points.splice(handle.pointIdx, 0, { x: mx, y: my });
            }
          });
          (sr as any).wirePointDrag = { wireId: handle.wireId, pointIdx: handle.pointIdx };
          st.log("info", `Punkt an Leitung hinzugefügt`);
          return;
        } else {
          (sr as any).wirePointDrag = { wireId: handle.wireId, pointIdx: handle.pointIdx };
          return;
        }
      }
      // Probe anchor drag
      const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
      const hitRadius = isMobile ? 18 : 10;
      for (const prId of st.selection) {
        const pr = st.doc.probes.find(p=>p.id===prId);
        if (!pr || pr.anchorX===undefined || pr.anchorY===undefined) continue;
        const d2a = (pr.anchorX-world.x)**2 + (pr.anchorY-world.y)**2;
        if (d2a < hitRadius*hitRadius) {
          (sr as any).probeAnchorDrag = { probeId: prId };
          return;
        }
      }
      // Also allow dragging any wire handle even if wire not selected – auto-select
      const anyHandle = hitWireHandle(st.doc, world, st.view.zoom, false);
      if (anyHandle && !anyHandle.isMid) {
        if (!st.selection.includes(anyHandle.wireId)) st.setSelection([anyHandle.wireId]);
        (sr as any).wirePointDrag = { wireId: anyHandle.wireId, pointIdx: anyHandle.pointIdx };
        return;
      }
    }

    // Space+drag or middle button or pan tool or Alt -> panning
    if (e.button === 1 || st.tool === "pan" || e.altKey || spaceDown.current) {
      sr.panning = true; return;
    }

    if (e.button === 2) {
      const target = getTargetAt(world);
      // If right-click on unselected instance/wire/probe, select it first (like Figma)
      if (target.kind === "instance" && !st.selection.includes(target.id)) st.setSelection([target.id]);
      if (target.kind === "wire" && !st.selection.includes(target.id)) st.setSelection([target.id]);
      if (target.kind === "probe" && !st.selection.includes(target.id)) st.setSelection([target.id]);
      setCtxMenu({ x: e.clientX, y: e.clientY, wx: world.x, wy: world.y, target });
      return;
    }

    // Placing with fast autoconnect – if placed between two wires, auto-connect
    if (st.tool === "place" && st.placingPartId) {
      if (e.button === 0) {
        const id = st.addInstance(st.placingPartId, sp.x, sp.y);
        // Fast autoconnect: check if new instance pins are near existing wires, if so, create small wire segments to connect
        if (id) {
          const part = PART_MAP[st.placingPartId];
          if (part) {
            const doc = useEditor.getState().doc;
            const inst = doc.instances.find(i=>i.id===id);
            if (inst) {
              for (let pi=0; pi<part.pins.length; pi++) {
                const pp = pinPosition(inst, pi);
                // Find nearest wire point within 20px
                for (const w of doc.wires) {
                  for (let si=0; si<w.points.length-1; si++) {
                    const a = w.points[si];
                    const b = w.points[si+1];
                    // distance from point to segment
                    const dx = b.x - a.x;
                    const dy = b.y - a.y;
                    const len2 = dx*dx + dy*dy;
                    if (len2 < 1) continue;
                    const t = Math.max(0, Math.min(1, ((pp.x - a.x)*dx + (pp.y - a.y)*dy)/len2));
                    const proj = { x: a.x + t*dx, y: a.y + t*dy };
                    const dist = Math.hypot(pp.x - proj.x, pp.y - proj.y);
                    if (dist < 20) {
                      // Auto-connect: create wire from pin to projection
                      st.commit((d)=>{
                        d.wires.push({ id: "w_" + Math.random().toString(36).slice(2,8), points: [ { x: pp.x, y: pp.y }, { x: proj.x, y: proj.y } ] });
                        // W61: Das neue Leitungsende sitzt auf einer bestehenden
                        // Leitung → Verbindungspunkt wie in Multisim setzen.
                        if (!Array.isArray(d.junctions)) d.junctions = [];
                        if (!d.junctions.some((j) => Math.hypot(j.x - proj.x, j.y - proj.y) < 0.5)) {
                          d.junctions.push({ id: "jnc_" + Math.random().toString(36).slice(2,8), x: proj.x, y: proj.y });
                        }
                      });
                      break;
                    }
                  }
                }
              }
            }
          }
        }
        if (!e.shiftKey) st.setPlacing(null);
      } else {
        st.setPlacing(null);
      }
      return;
    }

    if (st.tool.startsWith("probe") && st.placingProbeKind) {
      if (e.button === 0) {
        const net = nearestNetName(world);
        const id = st.addMeasurementProbe(st.placingProbeKind, sp.x, sp.y);
        if (id && net) st.updateMeasurementProbe(id, { net });
        if (!e.shiftKey) st.setPlacingProbe(null);
      } else {
        st.setPlacingProbe(null);
      }
      return;
    }


    if (st.tool === "junction") {
      // W68: Knotenpunkt-Werkzeug – setzt bzw. entfernt einen Verbindungspunkt
      // an der nächsten Kreuzung zweier Leitungen (W61: nur mit Punkt leitend).
      st.toggleJunction(world.x, world.y);
      return;
    }

    if (st.tool === "label" || st.tool === "text") {
      const rect = canvasRef.current?.getBoundingClientRect();
      editingDone.current = false;
      setEditing({ kind: st.tool, x: sp.x, y: sp.y, sx: e.clientX - (rect?.left ?? 0), sy: e.clientY - (rect?.top ?? 0) });
      return;
    }

    const probeHit = hitTestProbe(st.doc, world);
    if (probeHit) {
      if (e.shiftKey || e.metaKey || e.ctrlKey) st.setSelection([...new Set([...st.selection, probeHit.id])]);
      else if (!st.selection.includes(probeHit.id)) st.setSelection([probeHit.id]);
      sr.dragging = true; return;
    }

    const hit = hitTestInstance(st.doc, world.x, world.y);

    if (st.tool === "erase") {
      if (hit) { st.setSelection([hit.id]); st.deleteSelection(); }
      else {
        const wireHit = hitWire(st.doc, world);
        if (wireHit) { st.setSelection([wireHit]); st.deleteSelection(); }
        else { const ph = hitTestProbe(st.doc, world); if (ph) { st.setSelection([ph.id]); st.deleteSelection(); } }
      }
      return;
    }

    if (st.tool === "probe") {
      const netName = nearestNetName(world);
      if (netName) { st.toggleProbe(netName); st.log("info", `Sonde ${netName}`); }
      return;
    }

    if (hit && st.sim.running) {
      const part = PART_MAP[hit.partId];
      if (part?.interactive === "switch" || part?.interactive === "button" || part?.interactive === "dip") {
        const cur = engine.controls[hit.label] ?? (hit.params.closed ? 1 : 0);
        engine.setControl(hit.label, cur > 0.5 ? 0 : 1);
        st.log("info", `${hit.label} ${cur > 0.5 ? "geöffnet" : "geschlossen"}`); return;
      }
      if (part?.interactive === "pot") {
        const cur = engine.controls[hit.label] ?? Number(hit.params.pos ?? 0.5);
        const next = Math.min(0.99, Math.max(0.01, cur + (e.shiftKey ? -0.05 : 0.05)));
        engine.setControl(hit.label, next);
        st.log("info", `${hit.label} ${(next*100).toFixed(0)}%`); return;
      }
    }

    if (hit) {
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        const sel = new Set(st.selection);
        if (sel.has(hit.id)) sel.delete(hit.id); else sel.add(hit.id);
        st.setSelection([...sel]);
      } else if (!st.selection.includes(hit.id)) {
        st.setSelection([hit.id]);
      }
      sr.dragging = true;
    } else {
      const wireHit = hitWire(st.doc, world);
      if (wireHit) {
        if (e.shiftKey || e.metaKey || e.ctrlKey) st.setSelection([...new Set([...st.selection, wireHit])]);
        else if (!st.selection.includes(wireHit)) st.setSelection([wireHit]);
        // W54: Ein Segment lässt sich senkrecht verschieben; Alt zieht wie bisher
        // die ganze Auswahl (Leitung bzw. Leitung + Bauteile) mit.
        const seg = e.altKey ? null : hitWireSegment(st.doc, world.x, world.y);
        const multi = st.selection.length > 1 && st.selection.some((id) => st.doc.instances.some((i) => i.id === id));
        if (seg && !multi) {
          const segWire = st.doc.wires.find((x) => x.id === seg.wireId);
          if (segWire) {
            (sr as any).wireSegDrag = {
              wireId: seg.wireId,
              segIdx: seg.segIdx,
              orig: segWire.points.map((p) => ({ x: p.x, y: p.y })),
              applied: { dx: 0, dy: 0 },
            };
            return;
          }
        }
        sr.dragging = true;
      } else {
        if (!e.shiftKey && !e.metaKey && !e.ctrlKey) st.setSelection([]);
        sr.marquee = { x0: world.x, y0: world.y, x1: world.x, y1: world.y };
      }
    }
  };

  const commitEditing = (text: string | null) => {
    if (editingDone.current) return; editingDone.current = true;
    const st = useEditor.getState(); const cur = editing; setEditing(null); st.setTool("select");
    if (cur && text && text.trim()) {
      const clean = text.trim();
      if (cur.kind === "value" && cur.instId) {
        const inst0 = st.doc.instances.find((i) => i.id === cur.instId);
        const key = inst0 ? PART_MAP[inst0.partId]?.params[0]?.key : undefined;
        const v = parseSpiceValue(clean);
        if (inst0 && key && Number.isFinite(v)) {
          st.commit((d) => {
            const ins = d.instances.find((i) => i.id === cur.instId);
            if (ins) ins.params[key] = v;
          });
          st.log("ok", `${inst0.label} = ${clean}`);
        } else {
          st.log("warn", `Wert „${clean}“ ist nicht lesbar (Beispiele: 10k, 4u7, 100n) – unverändert.`);
        }
        return;
      }
      if (cur.kind === "label") {
        st.commit((d) => d.labels.push({ id: "l_" + Math.random().toString(36).slice(2, 8), x: cur.x, y: cur.y, name: clean }));
        st.log("ok", `Netzname „${clean}“`);
      } else {
        st.commit((d) => d.notes.push({ id: "n_" + Math.random().toString(36).slice(2, 8), x: cur.x, y: cur.y, text: clean }));
        st.log("ok", "Notiz");
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    const world = toWorld(e.clientX, e.clientY);
    const sp = snap(world);
    const sr = stateRef.current;
    setCursor(sp); useHud.setState({ cursor: sp });

    // Track hovered wire handle for delightful UX – show larger handle + tooltip
    if (st.tool === "select" && !(sr as any).wirePointDrag) {
      const hovered = hitWireHandle(st.doc, world, st.view.zoom, true) || hitWireHandle(st.doc, world, st.view.zoom, false);
      const prev = (sr as any)._hoveredHandle;
      if ((hovered?.wireId !== prev?.wireId) || (hovered?.pointIdx !== prev?.pointIdx) || (hovered?.isMid !== prev?.isMid)) {
        (sr as any)._hoveredHandle = hovered;
        // Trigger redraw by bumping cursor (no state change)
        // We use hud cursor already updated
      }
      // Cursor feedback
      const canvas = canvasRef.current;
      if (canvas) {
        if (hovered) {
          canvas.style.cursor = hovered.isMid ? "copy" : "grab";
        } else if (sr.dragging) {
          canvas.style.cursor = "grabbing";
        }
      }
    }

    // Clear long press if moved >10px
    if (touchState.current?.startPt) {
      const dx = world.x - touchState.current.startPt.x;
      const dy = world.y - touchState.current.startPt.y;
      if (Math.hypot(dx,dy) > 10 && touchState.current.longPressTimer) {
        clearTimeout(touchState.current.longPressTimer);
        touchState.current.longPressTimer = null;
      }
    }

    // Pinch zoom handling – if 2 pointers active (we track via pointer events? Simplified: if e has 2 touches via native event)
    // For pointer events, we need to handle touch events separately – we add onTouchMove below


    if (sr.panning) {
      const dx = (e.clientX - (sr.lastMouse.x || e.clientX)) / st.view.zoom;
      const dy = (e.clientY - (sr.lastMouse.y || e.clientY)) / st.view.zoom;
      st.setView({ x: st.view.x - dx, y: st.view.y - dy });
    }
    sr.lastMouse = { x: e.clientX, y: e.clientY };

    // W54: Segment verschieben – senkrecht zur Segmentrichtung, Raster-Snap.
    if ((sr as any).wireSegDrag) {
      const seg = (sr as any).wireSegDrag as { wireId: string; segIdx: number; orig: Array<{ x: number; y: number }>; applied: { dx: number; dy: number } };
      const sa = seg.orig[seg.segIdx];
      const sb = seg.orig[seg.segIdx + 1];
      const horizontal = Math.abs(sb.x - sa.x) >= Math.abs(sb.y - sa.y);
      let dx = 0;
      let dy = 0;
      if (horizontal) dy = Math.round((sp.y - sr.dragStart.y) / GRID) * GRID;
      else dx = Math.round((sp.x - sr.dragStart.x) / GRID) * GRID;
      if (Math.abs(dx) < GRID / 2) dx = 0;
      if (Math.abs(dy) < GRID / 2) dy = 0;
      if (dx !== seg.applied.dx || dy !== seg.applied.dy) {
        st.setWireSegmentOffset(seg.wireId, seg.segIdx, seg.orig, dx, dy);
        seg.applied = { dx, dy };
        sr.moved = true;
      }
      return;
    }

    // Wire point drag – with alignment guides and snap, delightful
    if ((sr as any).wirePointDrag) {

      const { wireId, pointIdx } = (sr as any).wirePointDrag;
      // Alignment guides: find nearby pins or other wire points aligned horizontally/vertically within 12px
      let guideX: number | null = null;
      let guideY: number | null = null;
      const threshold = 10;
      try {
        const doc = st.doc;
        for (const inst of doc.instances) {
          const part = (PART_MAP as any)[inst.partId];
          if (!part) continue;
          for (const pin of part.pins) {
            const px = inst.x + (inst.rot===90? -pin.y : inst.rot===180? -pin.x : inst.rot===270? pin.y : pin.x);
            const py = inst.y + (inst.rot===90? pin.x : inst.rot===180? -pin.y : inst.rot===270? -pin.x : pin.y);
            if (Math.abs(px - sp.x) < threshold) guideX = px;
            if (Math.abs(py - sp.y) < threshold) guideY = py;
          }
        }
        for (const w of doc.wires) {
          if (w.id === wireId) continue;
          for (const pt of w.points) {
            if (Math.abs(pt.x - sp.x) < threshold) guideX = pt.x;
            if (Math.abs(pt.y - sp.y) < threshold) guideY = pt.y;
          }
        }
      } catch {}
      const finalPt = { x: guideX !== null ? guideX : sp.x, y: guideY !== null ? guideY : sp.y };
      (sr as any)._alignGuides = { x: guideX, y: guideY };
      st.commit((d)=>{
        const w = d.wires.find(x=>x.id===wireId);
        if (w && w.points[pointIdx]) {
          w.points[pointIdx] = finalPt;
        }
      });
      sr.moved = true;
      (sr as any)._wasDraggingHandle = true;
      // Show tooltip with coordinates and delta
      const orig = (sr as any)._dragOrig;
      if (orig) {
        const dx = finalPt.x - orig.x;
        const dy = finalPt.y - orig.y;
        const len = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx) * 180 / Math.PI;
        setTooltip({ x: e.clientX - (wrapRef.current?.getBoundingClientRect().left ?? 0) + 16, y: e.clientY - (wrapRef.current?.getBoundingClientRect().top ?? 0) + 16, lines: [`Punkt ${pointIdx}: ${finalPt.x.toFixed(0)}, ${finalPt.y.toFixed(0)}`, `Δ ${dx>=0?"+":""}${dx.toFixed(0)}, ${dy>=0?"+":""}${dy.toFixed(0)} • ${len.toFixed(1)}px`, `Winkel ${ang.toFixed(0)}° ${Math.abs(ang)%90<5||Math.abs(ang%90-90)<5?"(90°)":Math.abs(ang%45)<5?"(45°)":""}`, guideX!==null||guideY!==null ? `🧲 Ausrichtung an ${guideX!==null?"X":""}${guideX!==null&&guideY!==null?"+":""}${guideY!==null?"Y":""}` : ""] });
      } else {
        (sr as any)._dragOrig = { ...finalPt };
      }
      return;
    }
    if ((sr as any).probeAnchorDrag) {
      const { probeId } = (sr as any).probeAnchorDrag;
      st.updateMeasurementProbe(probeId, { anchorX: sp.x, anchorY: sp.y });
      sr.moved = true;
      return;
    }

    if (sr.dragging && st.selection.length) {
      if ((e.ctrlKey || e.metaKey) && !sr.duplicated && !sr.moved) {
        st.duplicateSelection();
        sr.duplicated = true;
      }
      // Alignment guides for instances – like Figma/Multisim, show when aligned
      let guideX: number | null = null;
      let guideY: number | null = null;
      const threshold = 8;
      const selIds = new Set(st.selection);
      // Find bounds of selection
      let selMinX = Infinity, selMaxX = -Infinity, selMinY = Infinity, selMaxY = -Infinity;
      for (const id of st.selection) {
        const inst = st.doc.instances.find(i=>i.id===id);
        if (!inst) continue;
        const b = instanceBounds(inst);
        selMinX = Math.min(selMinX, b.x);
        selMaxX = Math.max(selMaxX, b.x + b.w);
        selMinY = Math.min(selMinY, b.y);
        selMaxY = Math.max(selMaxY, b.y + b.h);
      }
      // Check against other instances
      for (const other of st.doc.instances) {
        if (selIds.has(other.id)) continue;
        const b = instanceBounds(other);
        const candidatesX = [b.x, b.x + b.w/2, b.x + b.w];
        const candidatesY = [b.y, b.y + b.h/2, b.y + b.h];
        for (const cx of candidatesX) {
          if (Math.abs((selMinX + (sp.x - sr.dragStart.x)) - cx) < threshold) guideX = cx;
          if (Math.abs((selMaxX + (sp.x - sr.dragStart.x)) - cx) < threshold) guideX = cx;
          if (Math.abs(((selMinX+selMaxX)/2 + (sp.x - sr.dragStart.x)) - cx) < threshold) guideX = cx;
        }
        for (const cy of candidatesY) {
          if (Math.abs((selMinY + (sp.y - sr.dragStart.y)) - cy) < threshold) guideY = cy;
          if (Math.abs((selMaxY + (sp.y - sr.dragStart.y)) - cy) < threshold) guideY = cy;
          if (Math.abs(((selMinY+selMaxY)/2 + (sp.y - sr.dragStart.y)) - cy) < threshold) guideY = cy;
        }
      }
      (sr as any)._alignGuides = { x: guideX, y: guideY };
      let dx = sp.x - Math.round(sr.dragStart.x / GRID) * GRID;
      let dy = sp.y - Math.round(sr.dragStart.y / GRID) * GRID;
      // Snap to guides if present
      if (guideX !== null) {
        const curMinX = selMinX + dx;
        const snapDx = guideX - curMinX;
        // Only snap if close
        if (Math.abs(snapDx) < threshold*2) dx += snapDx;
      }
      if (guideY !== null) {
        const curMinY = selMinY + dy;
        const snapDy = guideY - curMinY;
        if (Math.abs(snapDy) < threshold*2) dy += snapDy;
      }
      if (dx || dy) {
        st.moveSelection(dx, dy);
        sr.dragStart = { x: sr.dragStart.x + dx, y: sr.dragStart.y + dy };
        sr.moved = true;
      }
    }

    if (sr.marquee) { sr.marquee.x1 = world.x; sr.marquee.y1 = world.y; }

    // W68: Knotenpunkt-Werkzeug – der nächste Treffpunkt zweier Leitungen wird
    // mit einem Ring gezeigt, damit der Klick sitzt.
    if (st.tool === "junction") {
      let best: { x: number; y: number } | null = null;
      let bestD = 16 / Math.max(st.view.zoom, 0.25);
      for (const c of wireJunctionCandidates(st.doc)) {
        const dd = Math.hypot(c.x - world.x, c.y - world.y);
        if (dd < bestD) { bestD = dd; best = c; }
      }
      (sr as any).junctionHover = best;
    } else if ((sr as any).junctionHover) {
      (sr as any).junctionHover = null;
    }

    // W64: Anschluss-Magnet. Das beste Ziel (Pin → Verbindungspunkt → Leitung)
    // wird gemerkt, die Vorschau springt exakt dorthin – Klicks müssen nicht
    // mehr pixelgenau treffen, Anschlüsse gehen nicht mehr verloren.
    const magnet = 14 / Math.max(st.view.zoom, 0.25);
    sr.netHover = findNetTarget(st.doc, world, magnet);

    // W65: kein Fadenkreuz mehr. Beim Zeichnen (und über einem möglichen
    // Anschluss) zeigt der Stift, dass hier ein Netz entsteht. Andere Zeiger
    // (Leitungsgriff „copy/grab", Pan, Löschen) bleiben unangetastet.
    const canvasEl = canvasRef.current;
    if (canvasEl && !(sr as any)._hoveredHandle) {
      const drawing = (Boolean(sr.netDraft) || st.tool === "wire" || sr.netHover !== null) && st.tool !== "junction";
      if (drawing) canvasEl.style.cursor = PEN_CURSOR;
      else if (!spaceDown.current && !sr.panning && !sr.dragging) canvasEl.style.cursor = st.tool === "erase" ? "not-allowed" : st.tool === "pan" ? "grab" : "default";
    }

    // Human Design: Tooltips everywhere – explain how to edit, no flicker
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    // W4: Der Canvas ist still. Messwerte erscheinen nur, wenn man Alt bewusst
    // hält (Profi-Blick auf Abruf) – niemals als Dauerbeschuss beim Darüberfahren.
    const hasLiveData = st.sim.running || engine.lastState.time > 0;
    const showAltTooltip = hasLiveData && e.altKey;
    const now = performance.now();
    const last = (stateRef.current as any)._lastTooltipNet;
    const lastTime = (stateRef.current as any)._lastTooltipTime ?? 0;
    if (showAltTooltip) {
      const net = nearestNetName(world, isMobile ? 24 : 12);
      const hit = hitTestInstance(st.doc, world.x, world.y);
      const shouldUpdate = net !== last || (now - lastTime) > 200 || hit;
      if (shouldUpdate && net) {
        const v = engine.lastState.nets[net] ?? 0;
        // estimate current via netCurrentMap if available – we compute similar to draw loop
        let netCurrent = 0;
        try {
          // quick approx: sum currents of instances connected to net
          for (const inst of st.doc.instances) {
            const part = PART_MAP[inst.partId];
            if (!part) continue;
            const devCurrent = engine.lastState.currents[inst.label] ?? 0;
            if (Math.abs(devCurrent) < 1e-12) continue;
            part.pins.forEach((_, idx) => {
              const pn = st.netResult.pinNets[`${inst.id}:${idx}`];
              if (pn === net) netCurrent += devCurrent / part.pins.length;
            });
          }
        } catch {}
        const cfg = loadHoverConfig();
        const lines: string[] = [];
        if (cfg.showNetName) lines.push(`Netz ${net}`);
        if (cfg.showV) lines.push(`V = ${formatValue(v, "V")}`);
        if (cfg.showI && Math.abs(netCurrent) > 1e-12) lines.push(`I ≈ ${formatValue(netCurrent, "A")}`);
        if (cfg.showP && Math.abs(v*netCurrent) > 1e-12) lines.push(`P ≈ ${formatValue(Math.abs(v*netCurrent), "W")}`);
        if (cfg.showFreq) {
          try {
            const ch = engine.channel(net, 512);
            if (ch.v.length > 16) {
              const freq = estimateFrequency(ch.t, ch.v);
              if (freq > 0.1) lines.push(`f ≈ ${freq.toFixed(1)} Hz`);
            }
          } catch {}
        }
        if (hit) {
          const i = engine.lastState.currents[hit.label];
          if (i !== undefined) lines.push(`${hit.label}: ${formatValue(i, "A")}`);
          const pwr = engine.lastState.power[hit.label];
          if (pwr !== undefined) lines.push(`P=${formatValue(Math.abs(pwr), "W")}`);
        }
        const wr = wrapRef.current?.getBoundingClientRect();
        let spark: number[] | null = null;
        let sparkIsCurrent = false;
        try {
          if (hit) {
            const dc = engine.deviceChannel(hit.label, 96);
            if (dc.v.length > 8) {
              spark = dc.v;
              sparkIsCurrent = true;
            }
          }
          if (!spark) {
            const ch = engine.channel(net, 96);
            if (ch.v.length > 8) spark = ch.v;
          }
        } catch {}
        if (spark) lines.push(sparkIsCurrent ? "I(t)-Verlauf ↓" : "V(t)-Verlauf ↓");
        setTooltip({ x: e.clientX - (wr?.left ?? 0), y: e.clientY - (wr?.top ?? 0), lines, spark });
        (stateRef.current as any)._lastTooltipNet = net;
        (stateRef.current as any)._lastTooltipTime = now;
      } else if (!net) {
        setTooltip(null);
        (stateRef.current as any)._lastTooltipNet = null;
      }
    } else {
      if (tooltip) {
        const lastHide = (stateRef.current as any)._lastHide ?? 0;
        if (now - lastHide > 150) {
          setTooltip(null);
          (stateRef.current as any)._lastTooltipNet = null;
        }
      } else {
        (stateRef.current as any)._lastTooltipNet = null;
      }
      (stateRef.current as any)._lastHide = now;
    }
  };

  const onPointerUp = () => {
    if (touchState.current?.longPressTimer) {
      clearTimeout(touchState.current.longPressTimer);
      touchState.current.longPressTimer = null;
    }
    touchState.current = null;
    const st = useEditor.getState(); const sr = stateRef.current;
    (sr as any).wirePointDrag = null;
    (sr as any).probeAnchorDrag = null;
    (sr as any)._alignGuides = null;
    (sr as any)._dragOrig = null;
    // Clear handle tooltip after drag
    if ((sr as any)._wasDraggingHandle) {
      setTooltip(null);
      (sr as any)._wasDraggingHandle = false;
    }
    if (sr.marquee) {
      const m = sr.marquee;
      const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
      if (Math.abs(x1 - x0) > 4 && Math.abs(y1 - y0) > 4) {
        const ids = st.doc.instances.filter((i) => {
          const b = instanceBounds(i);
          return b.x >= x0 && b.x + b.w <= x1 && b.y >= y0 && b.y + b.h <= y1;
        }).map((i) => i.id);
        const wireIds = st.doc.wires.filter((w) => w.points.every((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)).map((w) => w.id);
        const probeIds = st.doc.probes.filter((pr) => pr.x >= x0 && pr.x <= x1 && pr.y >= y0 && pr.y <= y1).map((pr) => pr.id);
        const newSel = [...ids, ...wireIds, ...probeIds];
        // Shift adds
        const cur = useEditor.getState().selection;
        // Actually we already handled shift earlier – if shift held, add, else replace
        // We check if shift was held during marquee start? We stored? For simplicity, if shift key currently down, add
        const isAdditive = (window as any)._lastShift ?? false;
        if (isAdditive) st.setSelection([...new Set([...cur, ...newSel])]);
        else st.setSelection(newSel);
      }
      sr.marquee = null;
    }
    sr.dragging = false; sr.panning = false; (sr as any).wireSegDrag = null;
    if (sr.moved && st.sim.running) engine.rebuild(st.doc);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const sr = stateRef.current;
    // W63: Doppelklick beendet den Netzmodus (die angefangene Leitung wird verworfen).
    if (sr.netDraft) { sr.netDraft = null; sr.netHover = null; return; }
    const st = useEditor.getState();
    const world = toWorld(e.clientX, e.clientY);
    // Double-click on wire handle deletes point (if >2 points) – delightful editing
    const handle = hitWireHandle(st.doc, world, st.view.zoom, true);
    if (handle && !handle.isMid) {
      const wire = st.doc.wires.find(w=>w.id===handle.wireId);
      if (wire && wire.points.length > 2) {
        st.commit((d)=>{
          const w = d.wires.find(x=>x.id===handle.wireId);
          if (w) w.points.splice(handle.pointIdx, 1);
        });
        st.log("info", `Punkt ${handle.pointIdx} gelöscht – Leitung hat jetzt ${wire.points.length-1} Punkte (Undo)`);
        return;
      }
    }
    const hit = hitTestInstance(st.doc, world.x, world.y);
    if (hit) {
      st.setSelection([hit.id]);
      const part = PART_MAP[hit.partId];
      if (part?.id === "oscilloscope") {
        // W29: Doppelklick auf das Oszi-Symbol öffnet das gebundene
        // Gerätefenster (Kanäle kommen aus der Verdrahtung an CH1…CH4/GND).
        useEditor.getState().openInstrument("scope", { instanceId: hit.id, title: `Oszilloskop ${hit.label}` });
        return;
      }
      if (part?.id === "funcgen") {
        // W18: Doppelklick auf den FG-2500 öffnet das gebundene Gerät
        // (Ausgänge OUT1/OUT2/SYNC werden im Schaltplan verdrahtet).
        useEditor.getState().openInstrument("funcgen", { instanceId: hit.id, title: `Funktionsgenerator ${hit.label}` });
        return;
      }
      const key = part?.params[0]?.key;
      if (key && e.altKey) {
        // Alt+Doppelklick: Inline-Wertedit direkt auf der Fläche (Direct Manipulation).
        const scr = toScreen({ x: hit.x, y: hit.y });
        setEditing({ kind: "value", instId: hit.id, x: hit.x, y: hit.y, sx: scr.x, sy: scr.y, initial: String(hit.params[key] ?? "") });
      } else {
        // W10: Doppelklick öffnet den Inspector als Fenster.
        useEditor.getState().openInstrument("inspector");
      }
    }
    else {
      const probe = hitTestProbe(st.doc, world);
      if (probe) {
        st.setSelection([probe.id]); useEditor.getState().openInstrument("inspector");
      } else {
        // W67: Doppelklick auf eine Leitung zieht von dort ein neues Netz
        // (Multisim: „Leitung abzweigen"). Der Anker liegt exakt auf der
        // Leitung; der Abzweig erhält beim Anschließen einen Verbindungspunkt.
        const wireId = hitWire(st.doc, world);
        if (wireId) {
          const target = findNetTarget(st.doc, world, 14 / Math.max(st.view.zoom, 0.25));
          const anchor = target?.kind === "wire" || target?.kind === "junction"
            ? { x: target.x, y: target.y }
            : snap(world);
          sr.netDraft = { anchor, corners: [] };
          sr.netHover = null;
          if (canvasRef.current) canvasRef.current.style.cursor = PEN_CURSOR;
          st.log("info", `Abzweig ab (${Math.round(anchor.x)}, ${Math.round(anchor.y)}) – Klick setzt Ecken, Klick auf Pin/Leitung verbindet, Esc bricht ab`);
          return;
        }
      }
    }
  };

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      (window as any)._lastShift = e.shiftKey;
      const st = useEditor.getState();
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      // Leertaste auf fokussiertem Button/Link = native Aktivierung, nicht Sim-Toggle
      if (e.key === " " && (tag === "BUTTON" || tag === "A")) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); st.redo(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void st.saveProject(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") { e.preventDefault(); st.copySelection(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") { e.preventDefault(); st.pasteClipboard(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); st.duplicateSelection(); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") { e.preventDefault(); st.selectAll(); }
      // Multisim-Muskelgedächtnis: Strg/⌘+R rotiert, statt den Tab zu reloaden
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "r") { e.preventDefault(); st.rotateSelection(e.shiftKey ? -1 : 1); }
      else if (e.key === "Delete" || e.key === "Backspace") st.deleteSelection();
      else if (e.key.toLowerCase() === "r") st.rotateSelection(e.shiftKey ? -1 : 1);
      else if (e.key.toLowerCase() === "m") st.mirrorSelection();
      else if (e.key.toLowerCase() === "w") st.setTool("wire");
      else if (e.key === "Escape") {
        // W66: Esc verlässt jeden Modus. Die angefangene Leitung wird verworfen
        // (wie am echten Editor), Platzieren/Proben/Messleitungs-Pick ebenso.
        const sr = stateRef.current;
        sr.netDraft = null; sr.netHover = null;
        sr.marquee = null; (sr as any).wireSegDrag = null;
        useEditor.getState().setLeadArmed(null);
        st.setTool("select"); st.setPlacing(null); st.setPlacingProbe(null); setCtxMenu(null);
      } else if (e.key.toLowerCase() === "v") st.setPlacingProbe("voltage");
      else if (e.key.toLowerCase() === "a") st.setPlacingProbe("current");
      else if (e.key.toLowerCase() === "g") {
        if (e.shiftKey) useEditor.setState({ snap: !st.snap });
        else useEditor.setState({ showGrid: !st.showGrid });
      }
      // W55: ⇧L begradigt die ausgewählten Leitungen (L allein = Label-Werkzeug)
      else if (e.shiftKey && e.key.toLowerCase() === "l") st.straightenSelection();
      else if (e.key.toLowerCase() === "l") st.setTool("label");
      else if (e.key.toLowerCase() === "t") st.setTool("text");
      else if (e.key.toLowerCase() === "e") st.setTool("erase");
      else if (e.key.toLowerCase() === "h") st.setTool("pan");
      else if (e.key === " ") { e.preventDefault(); if (st.sim.running) st.pauseSim(); else st.startSim(); }
      else if (e.key === "f") st.fitView();
    };
    const onKeyUp = (e: KeyboardEvent) => { (window as any)._lastShift = e.shiftKey; if (e.code === "Space") spaceDown.current = false; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); };
  }, []);

  useEffect(() => { const t = setTimeout(() => useEditor.getState().fitView(), 120); return () => clearTimeout(t); }, []);


  const tool = useEditor((s) => s.tool);

  // W66: Werkzeugwechsel beendet ein angefangenes Netz – kein Zustand, der
  // unsichtbar weiterläuft, wenn der Nutzer z. B. auf „Auswahl" umschaltet.
  useEffect(() => {
    const sr = stateRef.current;
    if (tool !== "wire") { sr.netDraft = null; sr.netHover = null; }
  }, [tool]);
  const leadArmed = useEditor((s) => s.leadArmed);
  // Runde 19 (W36): Quelle der aufgenommenen Messleitung markieren (Oszi-Pin
  // CH1–CH4 bzw. FG-Pin OUT1/OUT2) – man sieht, wo das Kabel herkommt.
  const armedInst = useEditor((s) =>
    s.leadArmed ? (s.doc.instances.find((i) => i.id === s.leadArmed!.instanceId) ?? null) : null,
  );
  const armedPin = armedInst && leadArmed ? toScreen(pinPosition(armedInst, leadArmed.pinIndex)) : null;
  const [showHelp, setShowHelp] = useState(false);

  // Show help on ? key
  useEffect(() => {
    const onHelpKey = (e: KeyboardEvent) => {
      if (e.key === "?" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setShowHelp(v=>!v);
      }
    };
    window.addEventListener("keydown", onHelpKey);
    return () => window.removeEventListener("keydown", onHelpKey);
  }, []);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden" role="application" aria-label={adaptShortcut("Schaltplan Canvas – Bauteile platzieren, Leitungen ziehen, Probes setzen. Shortcuts: R Drehen, W Wire, F Fit, Leertaste Start, ⌘K Bibliothek, ? Hilfe", apple)}>
      <canvas
        id="schematic-canvas"
        ref={canvasRef}
        className="block h-full w-full touch-none"
        aria-label="Schaltplan Zeichenfläche"
        tabIndex={0}
        style={{ cursor: spaceDown.current || stateRef.current.panning ? "grabbing" : tool === "pan" ? "grab" : tool === "wire" ? PEN_CURSOR : tool === "erase" ? "not-allowed" : "default" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          // W63: Rechtsklick bricht das Zeichnen ab (Multisim-Verhalten).
          if (stateRef.current.netDraft) { stateRef.current.netDraft = null; stateRef.current.netHover = null; }
        }}
        onDragOver={(e) => {
          const types = Array.from(e.dataTransfer.types);
          if (types.includes("text/multispice-part") || types.includes("Files")) {
            e.preventDefault();
            e.dataTransfer.dropEffect = "copy";
            const w = snap(toWorld(e.clientX, e.clientY));
            setCursor(w);
            useHud.setState({ cursor: w });
          }
        }}
        onDrop={(e) => {
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            useHud.setState({ dragPart: null });
            void openFileInEditor(e.dataTransfer.files[0]);
            return;
          }
          const id = e.dataTransfer.getData("text/multispice-part");
          useHud.setState({ dragPart: null });
          if (id && PART_MAP[id]) {
            e.preventDefault();
            const stt = useEditor.getState();
            const w = snap(toWorld(e.clientX, e.clientY));
            const newId = stt.addInstance(id, w.x, w.y);
            if (newId) stt.setSelection([newId]);
            stt.log("ok", `${PART_MAP[id].name} per Drag & Drop platziert`);
          }
        }}
        onDragLeave={() => useHud.setState({ dragPart: null })}
        onTouchStart={(e) => {
          if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const mx = (e.touches[0].clientX + e.touches[1].clientX)/2;
            const my = (e.touches[0].clientY + e.touches[1].clientY)/2;
            (touchState.current as any) = { lastDist: dist, lastMid: { x: mx, y: my }, longPressTimer: null, startPt: null };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 2 && touchState.current) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const mx = (e.touches[0].clientX + e.touches[1].clientX)/2;
            const my = (e.touches[0].clientY + e.touches[1].clientY)/2;
            const lastDist = touchState.current.lastDist || dist;
            const lastMid = touchState.current.lastMid;
            const scale = dist / lastDist;
            const st = useEditor.getState();
            const zooming = Math.abs(scale - 1) > 0.005;
            const panDx = lastMid ? mx - lastMid.x : 0;
            const panDy = lastMid ? my - lastMid.y : 0;
            // R12: Pinch zoomt UND der Mittelpunkt schwenkt – eine Geste, eine Bewegung.
            if (zooming || Math.hypot(panDx, panDy) > 1) {
              const rect = canvasRef.current?.getBoundingClientRect();
              let newZoom = st.view.zoom;
              let nx = st.view.x;
              let ny = st.view.y;
              if (zooming) {
                newZoom = Math.max(0.15, Math.min(4, st.view.zoom * scale));
                const worldMid = toWorld(mx, my);
                nx = worldMid.x - (mx - (rect?.left ?? 0))/newZoom;
                ny = worldMid.y - (my - (rect?.top ?? 0))/newZoom;
              }
              nx -= panDx / newZoom;
              ny -= panDy / newZoom;
              st.setView({ zoom: newZoom, x: nx, y: ny });
            }
            touchState.current.lastDist = dist;
            touchState.current.lastMid = { x: mx, y: my };
          } else if (e.touches.length === 1) {
            // single finger pan if tool pan
            const st = useEditor.getState();
            if (st.tool === "pan") {
              const touch = e.touches[0];
              const last = touchState.current?.lastMid;
              if (last) {
                const dx = (touch.clientX - last.x)/st.view.zoom;
                const dy = (touch.clientY - last.y)/st.view.zoom;
                st.setView({ x: st.view.x - dx, y: st.view.y - dy });
              }
              if (touchState.current) touchState.current.lastMid = { x: touch.clientX, y: touch.clientY };
            }
          }
        }}
        onTouchEnd={(e) => {
          if (touchState.current?.longPressTimer) {
            clearTimeout(touchState.current.longPressTimer);
          }
          touchState.current = null;
        }}
      />
      {tooltip && (
        <div className="glass pointer-events-none absolute z-30 rounded-lg px-2.5 py-1.5 text-[11px] mono shadow-xl" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          {tooltip.lines.map((l, i) => (
            <div key={i} style={{ color: i === 0 ? "var(--text-mute)" : "var(--text)" }}>{l}</div>
          ))}
          {tooltip.spark && tooltip.spark.length > 8 && <Sparkline data={tooltip.spark} />}
        </div>
      )}
      {editing && (
        <input autoFocus className="input mono absolute z-40 w-44" style={{ left: editing.sx + 8, top: editing.sy - 13, boxShadow: "var(--shadow)" }}
          key={`${editing.kind}_${editing.instId ?? ""}`}
          defaultValue={editing.initial}
          placeholder={editing.kind === "label" ? "Netzname …" : editing.kind === "value" ? "Wert … z. B. 10k, 4u7" : "Notiz …"}
          onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commitEditing((e.target as HTMLInputElement).value); else if (e.key === "Escape") commitEditing(null); }}
          onBlur={(e) => commitEditing(e.target.value)} />
      )}
      {ctxMenu && (
        <ContextMenu menu={ctxMenu} onClose={() => setCtxMenu(null)} />
      )}
      {/* Empty state – delightful onboarding */}
      {(() => {
        const doc = useEditor.getState().doc;
        if (doc.instances.length === 0 && doc.wires.length === 0) {
          return (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="pointer-events-auto rounded-2xl p-6 text-center shadow-2xl backdrop-blur-xl max-w-[380px]" style={{ background: "color-mix(in srgb, var(--panel-solid) 92%, transparent)", border: "1px solid var(--border-strong)" }}>
                <div className="mx-auto mb-3 h-12 w-12 rounded-xl grid place-items-center" style={{ background: "var(--accent-soft)", border: "1px solid var(--border)", color: "var(--accent)" }}>
                  <Sparkles size={20} />
                </div>
                <div className="text-[14px] font-semibold">Leere Leinwand – los geht’s!</div>
                <div className="mt-1 text-[12px] text-mute">Drücke <kbd className="kbd">{adaptShortcut("⌘K", apple)}</kbd> für die Bauteil-Bibliothek oder ziehe Bauteile aus der Seitenleiste.</div>
                <div className="mt-3 flex flex-wrap gap-1.5 justify-center">
                  <button className="btn btn-primary h-7 px-3 text-[11px]" onClick={() => useEditor.setState({ libraryOpen: true })}><LibIcon size={12} /> Bibliothek öffnen</button>
                  <button className="btn h-7 px-3 text-[11px]" onClick={() => { const id = useEditor.getState().addInstance("resistor", 0, 0); if (id) useEditor.getState().setSelection([id]); }}>+ R Widerstand</button>
                  <button className="btn h-7 px-3 text-[11px]" onClick={() => useEditor.getState().setPlacingProbe("voltage")}>∿ Probe</button>
                </div>
                <div className="mt-3 text-[10px] text-mute">Tipps: <span className="mono">W</span> Wire • <span className="mono">R</span> Drehen • <span className="mono">F</span> Fit • <span className="mono">Leertaste</span> Simulieren • <span className="mono">?</span> Hilfe</div>
              </div>
            </div>
          );
        }
        return null;
      })()}
      {showHelp && (
        <div className="absolute inset-0 z-40 grid place-items-center bg-black/40 backdrop-blur-sm p-4" onClick={()=>setShowHelp(false)}>
          <div className="rounded-2xl p-5 w-full max-w-[560px] max-h-[80vh] overflow-auto" style={{ background: "var(--panel-solid)", border: "1px solid var(--border-strong)", boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }} onClick={e=>e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-[14px] font-semibold">Tastenkürzel</div>
              <button className="btn h-7 w-7 p-0" onClick={()=>setShowHelp(false)}>✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div>
                <div className="text-[10px] uppercase text-mute mb-1">Canvas</div>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>W Wire</span><kbd className="kbd">W</kbd></div>
                  <div className="flex justify-between"><span>Bauteil drehen</span><kbd className="kbd">R</kbd> / <kbd className="kbd">{adaptShortcut("⇧R", apple)}</kbd> / <kbd className="kbd">{adaptShortcut("⌘R", apple)}</kbd></div>
                  <div className="flex justify-between"><span>Spiegeln</span><kbd className="kbd">M</kbd></div>
                  <div className="flex justify-between"><span>Grid / Snap</span><kbd className="kbd">G</kbd> / <kbd className="kbd">{adaptShortcut("⇧G", apple)}</kbd></div>
                  <div className="flex justify-between"><span>Zoom / Pan</span><kbd className="kbd">Rad</kbd> / <kbd className="kbd">{adaptShortcut("⇧Rad", apple)}</kbd></div>
                  <div className="flex justify-between"><span>Touch</span><span className="text-mute">2 Finger = Zoom + Pan, lang halten = Menü</span></div>
                  <div className="flex justify-between"><span>Löschen</span><kbd className="kbd">Entf</kbd></div>
                  <div className="flex justify-between"><span>Duplizieren</span><kbd className="kbd">{adaptShortcut("⌘D", apple)}</kbd></div>
                  <div className="flex justify-between"><span>Alles wählen</span><kbd className="kbd">{adaptShortcut("⌘A", apple)}</kbd></div>
                  <div className="flex justify-between"><span>Rückgängig/Wiederholen</span><kbd className="kbd">{adaptShortcut("⌘Z", apple)}</kbd> / <kbd className="kbd">{adaptShortcut("⇧⌘Z", apple)}</kbd></div>
                  <div className="flex justify-between"><span>Fit View</span><kbd className="kbd">F</kbd></div>
                  <div className="flex justify-between"><span>Simulation Start/Pause</span><kbd className="kbd">Leertaste</kbd></div>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-mute mb-1">Probes & Library</div>
                <div className="space-y-1">
                  <div className="flex justify-between"><span>Bibliothek</span><kbd className="kbd">{adaptShortcut("⌘K", apple)}</kbd></div>
                  <div className="flex justify-between"><span>V-Probe</span><kbd className="kbd">V</kbd> + Klick</div>
                  <div className="flex justify-between"><span>A-Probe (Strom)</span><kbd className="kbd">A</kbd> + Klick</div>
                  <div className="flex justify-between"><span>Label setzen</span><kbd className="kbd">L</kbd></div>
                  <div className="flex justify-between"><span>Notiz</span><kbd className="kbd">T</kbd></div>
                  <div className="flex justify-between"><span>Pan Tool</span><kbd className="kbd">H</kbd></div>
                  <div className="flex justify-between"><span>Wire Anfasser</span><span className="text-mute">Hover + Ziehen, Doppelklick löschen</span></div>
                  <div className="flex justify-between"><span>Net hervorheben</span><span className="text-mute">Hover Leitung</span></div>
                  <div className="flex justify-between"><span>Kontextmenü</span><span className="text-mute">Rechtsklick</span></div>
                  <div className="flex justify-between"><span>Hilfe</span><kbd className="kbd">?</kbd></div>
                </div>
              </div>
            </div>
            <div className="mt-4 text-[10px] text-mute">Tipp: Halte <kbd className="kbd">Alt</kbd> im Live-Modus für Spannungs-Tooltip, ziehe Oszilloskop-Fenster mit rAF für 60fps, Library drag ist will-change transform.</div>
          </div>
        </div>
      )}
      {armedPin && leadArmed && (
        <div
          className="pointer-events-none absolute z-10 animate-pulse"
          style={{ left: armedPin.x, top: armedPin.y }}
          aria-hidden
        >
          <div
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
            style={{
              width: 22,
              height: 22,
              border: `2px solid ${leadArmed.color ?? "var(--accent)"}`,
              boxShadow: `0 0 0 4px color-mix(in srgb, ${leadArmed.color ?? "var(--accent)"} 30%, transparent)`,
            }}
          />
          <span
            className="absolute left-0 top-3 -translate-x-1/2 whitespace-nowrap rounded-full px-1.5 py-[1px] text-[9.5px] font-bold"
            style={{ background: leadArmed.color ?? "var(--accent)", color: "#101010" }}
          >
            {leadArmed.name ?? "Messleitung"}
          </span>
        </div>
      )}
      {/* W71: Die Geräteleiste ist 44 px breit (Instruments.tsx DeviceBar) –
          das Zoom-Feld sitzt links daneben und verschwindet nicht mehr darunter. */}
      <div className="absolute bottom-3 right-[52px] flex flex-col gap-1.5">
        <ZoomButtons onFit={() => useEditor.getState().fitView()} />
      </div>
    </div>
  );
}

function ContextMenu({ menu, onClose }: { menu: { x: number; y: number; wx: number; wy: number; target: CtxTarget }; onClose: () => void }) {
  const apple = useIsApple();
  const st = useEditor.getState();
  const { target, wx, wy } = menu;
  const netLabel = target.net ? ` – ${target.net}` : "";
  const doc = st.doc;
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  const addProbe = (k: ProbeKind) => {
    const id = st.addMeasurementProbe(k, wx, wy);
    if (id && target.net) st.updateMeasurementProbe(id, { net: target.net });
    onClose();
  };

  // Position clamping – keep inside viewport
  const stylePos = (() => {
    const vw = typeof window !== "undefined" ? window.innerWidth : 800;
    const vh = typeof window !== "undefined" ? window.innerHeight : 600;
    let x = menu.x;
    let y = menu.y;
    const w = 280;
    const h = 420;
    if (x + w > vw - 12) x = vw - w - 12;
    if (y + h > vh - 12) y = vh - h - 12;
    return { left: x, top: y };
  })();

  return (
    <div className="fixed z-50 min-w-[280px] max-w-[320px] rounded-xl p-1.5 text-[12px] backdrop-blur-xl" style={{ ...stylePos, background: "color-mix(in srgb, var(--panel-solid) 92%, transparent)", border: "1px solid var(--border-strong)", boxShadow: "0 12px 40px rgba(0,0,0,0.45), 0 0 0 1px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.08)" }}
      onPointerDown={(e) => e.stopPropagation()}
      onContextMenu={(e)=>e.preventDefault()}
      role="menu"
    >
      {target.kind === "instance" && (() => {
        const inst = doc.instances.find(i=>i.id===target.id);
        const part = inst ? (require("@/lib/library/catalog").PART_MAP as any)[inst.partId] : null;
        return (
          <>
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1" style={{ background: "var(--panel-2)" }}>
              <div className="h-7 w-7 rounded-md grid place-items-center" style={{ background: "var(--accent-soft)", border: "1px solid var(--border)" }}>🔧</div>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold truncate">{part?.name ?? "Bauteil"} {inst?.label}</div>
                <div className="text-[10px] text-mute truncate">{part?.category ?? ""}{netLabel}</div>
              </div>
              <div className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-black/30 text-mute">{inst?.rot}°</div>
            </div>
            <div className="grid grid-cols-3 gap-1 mb-1">
              <button className="row justify-center" onClick={() => { st.rotateSelection(1); onClose(); }} title="Drehen 90° (R)">↻ 90°</button>
              <button className="row justify-center" onClick={() => { st.rotateSelection(-1); onClose(); }} title={adaptShortcut("Drehen -90° (⇧R)", apple)}>↺ -90°</button>
              <button className="row justify-center" onClick={() => { st.mirrorSelection(); onClose(); }} title="Spiegeln (M)">⇆ Spiegel</button>
            </div>
            <button className="row" onClick={() => { st.setSelection([target.id]); useEditor.getState().openInstrument("inspector"); onClose(); }}><span>Eigenschaften…</span><span className="ml-auto text-[10px] text-mute">Doppelklick</span></button>
            <button className="row" onClick={() => { st.duplicateSelection(); onClose(); }}><span>⎘ Duplizieren</span><span className="ml-auto text-[10px] text-mute">{adaptShortcut("⌘D", apple)}</span></button>
            <button className="row" onClick={() => { st.copySelection(); onClose(); }}><span>⎙ Kopieren</span><span className="ml-auto text-[10px] text-mute">{adaptShortcut("⌘C", apple)}</span></button>
            <div className="sep" />
            {(() => {
              const selInst = doc.instances.filter((i) => st.selection.includes(i.id));
              const n = selInst.length;
              if (n < 2) return null;
              const act = (fn: () => void) => { fn(); onClose(); };
              return (
                <>
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-mute">Anordnen – {n} Bauteile (W55)</div>
                  <div className="grid grid-cols-3 gap-1 mb-1">
                    <button className="row justify-center text-[10.5px]" onClick={() => act(() => st.alignSelection("left"))} title="Links ausrichten">⇤ links</button>
                    <button className="row justify-center text-[10.5px]" onClick={() => act(() => st.alignSelection("centerH"))} title="Waagerecht mittig">↔ Mitte</button>
                    <button className="row justify-center text-[10.5px]" onClick={() => act(() => st.alignSelection("right"))} title="Rechts ausrichten">⇥ rechts</button>
                    <button className="row justify-center text-[10.5px]" onClick={() => act(() => st.alignSelection("top"))} title="Oben ausrichten">⇧ oben</button>
                    <button className="row justify-center text-[10.5px]" onClick={() => act(() => st.alignSelection("centerV"))} title="Senkrecht mittig">↕ Mitte</button>
                    <button className="row justify-center text-[10.5px]" onClick={() => act(() => st.alignSelection("bottom"))} title="Unten ausrichten">⇩ unten</button>
                  </div>
                  {n >= 3 && (
                    <div className="grid grid-cols-2 gap-1 mb-1">
                      <button className="row justify-center text-[10.5px]" onClick={() => act(() => st.distributeSelection("h"))} title="Gleicher Abstand waagerecht">⇹ verteilen</button>
                      <button className="row justify-center text-[10.5px]" onClick={() => act(() => st.distributeSelection("v"))} title="Gleicher Abstand senkrecht">⇳ verteilen</button>
                    </div>
                  )}
                  <div className="sep" />
                </>
              );
            })()}
            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-mute">Probe auf Netz{netLabel} – Multisim Style</div>
            <div className="grid grid-cols-2 gap-1">
              {([
                ["voltage","V","#fbbf24"],
                ["current","A","#22d3ee"],
                ["power","W","#a78bfa"],
                ["digital","D","#4ade80"],
              ] as const).map(([k, sym, col]) => (
                <button key={k} className="row" onClick={() => addProbe(k as any)}><span className="badge" style={{ background: col+"20", color: col, borderColor: col+"40" }}>{sym}</span> {k}</button>
              ))}
            </div>
            <div className="sep" />
            <button className="row danger" onClick={() => { st.setSelection([target.id]); st.deleteSelection(); onClose(); }}><span>🗑 Löschen</span><span className="ml-auto text-[10px] text-mute">Entf</span></button>
          </>
        );
      })()}
      {target.kind === "wire" && (() => {
        const wire = doc.wires.find(w=>w.id===target.id);
        const pts = wire?.points.length ?? 0;
        return (
          <>
            <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1" style={{ background: "var(--panel-2)" }}>
              <div className="h-7 w-7 rounded-md grid place-items-center" style={{ background: "#22d3ee20", border: "1px solid #22d3ee40" }}>∿</div>
              <div className="min-w-0">
                <div className="text-[12px] font-semibold">Leitung {target.id.slice(0,6)}</div>
                <div className="text-[10px] text-mute">{pts} Punkte • Netz {target.net ?? "?"}</div>
              </div>
              <div className="ml-auto h-2 w-2 rounded-full" style={{ background: "#22d3ee", boxShadow: "0 0 6px #22d3ee" }} />
            </div>
            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-mute">Bearbeiten – Wow Handles</div>
            {(() => {
              // W61: Multisim – Kreuzung ist nur mit Punkt leitend. Der Eintrag
              // erscheint genau dann, wenn hier zwei Leitungen aufeinandertreffen.
              let near = false;
              let verbunden = false;
              for (const c of wireJunctionCandidates(doc)) {
                if (Math.hypot(c.x - wx, c.y - wy) > 14) continue;
                near = true;
                if ((doc.junctions ?? []).some((j) => Math.hypot(j.x - c.x, j.y - c.y) < 0.5)) verbunden = true;
              }
              if (!near) return null;
              return (
                <button className="row" onClick={() => { st.toggleJunction(wx, wy); onClose(); }} data-active={verbunden}>
                  <span>{verbunden ? "⭕ Verbindungspunkt entfernen" : "🔗 Verbindungspunkt setzen (Kreuzung verbinden)"}</span>
                </button>
              );
            })()}
            <button className="row" onClick={() => {
              // W55: begradigt wirklich – Stützpunkte aufs Raster, rechte Winkel,
              // Enden zurück auf die Pins (statt Mittelpunkte wegzuwerfen).
              st.setSelection([target.id]);
              st.straightenSelection();
              onClose();
            }}><span>📐 Leitung begradigen (Raster + rechte Winkel)</span></button>
            <button className="row" onClick={() => {
              const w = doc.wires.find(x=>x.id===target.id);
              if (!w) return;
              const mid = Math.floor(w.points.length/2);
              st.commit((d)=>{
                const ww = d.wires.find(x=>x.id===target.id);
                if (ww) ww.points.splice(mid,0,{ x: wx, y: wy });
              });
              onClose();
            }}><span>➕ Punkt hier hinzufügen</span></button>
            <div className="sep" />
            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-mute">Leitungsfarbe</div>
            <button className="row" onClick={() => {
              const w = doc.wires.find(x=>x.id===target.id);
              if (!w) return;
              st.commit((d)=>{
                const ww = d.wires.find(x=>x.id===target.id) as any;
                if (ww) ww.isBus = !ww.isBus;
              });
              onClose();
            }}><span>🚌 { (doc.wires.find(x=>x.id===target.id) as any)?.isBus ? "Bus → normale Leitung" : "Als Bus markieren (dicker, digital)"}</span></button>
            <div className="flex gap-1 flex-wrap px-1">
              {[
                [null, "Auto", "var(--wire)"],
                ["#ef4444", "Rot", "#ef4444"],
                ["#22c55e", "Grün", "#22c55e"],
                ["#3b82f6", "Blau", "#3b82f6"],
                ["#fbbf24", "Gelb", "#fbbf24"],
                ["#a78bfa", "Lila", "#a78bfa"],
                ["#ec4899", "Pink", "#ec4899"],
              ].map(([col, label, dot]) => (
                <button key={String(col)} className="h-7 w-7 rounded-full border-2 grid place-items-center text-[10px]" style={{ background: (col as string) ?? "var(--panel)", borderColor: ((doc.wires.find(w=>w.id===target.id) as any)?.color ?? null) === col ? "var(--accent)" : "var(--border)", boxShadow: ((doc.wires.find(w=>w.id===target.id) as any)?.color ?? null) === col ? "0 0 0 2px var(--accent-soft)" : "none" }} title={label as string} onClick={() => {
                  st.commit((d)=>{
                    const ww = d.wires.find(x=>x.id===target.id);
                    if (ww) {
                      if (col) (ww as any).color = col as string;
                      else delete (ww as any).color;
                    }
                  });
                  onClose();
                }}>
                  <span className="h-3 w-3 rounded-full" style={{ background: dot as string }} />
                </button>
              ))}
            </div>
            <div className="sep" />
            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-mute">Faults – Troubleshooting Lehre</div>
            <div className="grid grid-cols-2 gap-1">
              {[
                ["none", "Kein Fault"],
                ["open", "Open – Unterbrechung"],
                ["short", "Short – Kurzschluss"],
                ["leakage", "Leakage – Leckstrom"],
              ].map(([f, label])=> {
                const curInst = doc.instances.find(x=>x.id===target.id) as any;
                return (
                <button key={f} className="row" data-active={curInst?.fault === f || (!curInst?.fault && f==="none")} onClick={()=>{
                  st.commit((d)=>{
                    const ii = d.instances.find(x=>x.id===target.id) as any;
                    if (ii) ii.fault = f as any;
                  });
                  onClose();
                }}>{label}</button>
              )})}
            </div>
            <div className="sep" />
            <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-mute">Probe setzen – Multisim</div>
            <div className="grid grid-cols-2 gap-1">
              {([
                ["voltage","V – Spannung","#fbbf24"],
                ["current","A – Strom","#22d3ee"],
                ["power","W – Leistung","#a78bfa"],
                ["diff","ΔV – Diff","#f472b6"],
                ["digital","D – Digital","#4ade80"],
              ] as const).map(([k, label, col]) => (
                <button key={k} className="row" onClick={() => addProbe(k as any)}>
                  <span className="badge" style={{ background: col+"20", color: col, borderColor: col+"40" }}>{k==="diff"?"ΔV":k[0].toUpperCase()}</span> {label}
                </button>
              ))}
            </div>
            <div className="sep" />
            <button className="row danger" onClick={() => { st.setSelection([target.id]); st.deleteSelection(); onClose(); }}><span>🗑 Leitung löschen</span></button>
          </>
        );
      })()}
      {target.kind === "probe" && (
        <>
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1" style={{ background: "var(--panel-2)" }}>
            <div className="h-7 w-7 rounded-md grid place-items-center text-[12px] font-bold" style={{ background: (target.probe.color??"#fbbf24")+"20", color: target.probe.color??"#fbbf24", border: `1px solid ${(target.probe.color??"#fbbf24")}40` }}>{target.probe.kind[0].toUpperCase()}</div>
            <div className="min-w-0">
              <div className="text-[12px] font-semibold truncate">{target.probe.name ?? target.probe.kind.toUpperCase()} Probe</div>
              <div className="text-[10px] text-mute truncate">Netz {target.probe.net ?? target.net ?? "auto"}{netLabel}</div>
            </div>
          </div>
          <button className="row" onClick={() => { st.setSelection([target.id]); useEditor.getState().openInstrument("inspector"); onClose(); }}><span>Eigenschaften…</span><span className="ml-auto text-[10px] text-mute">Doppelklick</span></button>
          {(target.probe.kind==="current" || target.probe.kind==="voltage_current" || target.probe.kind==="power") && (
            <button className="row" onClick={() => { st.updateMeasurementProbe(target.id, { direction: target.probe.direction?0:1 }); onClose(); }}><span>↺ Richtung umkehren</span><span className="ml-auto text-[10px] text-mute">{target.probe.direction? "Reverse":"Normal"}</span></button>
          )}
          <div className="sep" />
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-mute">Typ ändern</div>
          <div className="grid grid-cols-1 gap-0.5">
          {([
            ["voltage","V – Voltage – misst gegen GND/REF","#fbbf24"],
            ["current","A – Current – Stromrichtung Pfeil","#22d3ee"],
            ["voltage_current","V·A – Kombi","#f59e0b"],
            ["power","W – Power V·I","#a78bfa"],
            ["diff","ΔV – Differential","#f472b6"],
            ["ref","REF – Referenz","#94a3b8"],
            ["digital","D – Digital 0/1","#4ade80"],
          ] as const).map(([k, desc, col]) => (
            <button key={k} className="row" data-active={target.probe.kind===k} onClick={() => { st.updateMeasurementProbe(target.id, { kind: k as any }); onClose(); }}><span className="badge" style={{ background: col+"20", color: col }}>{k[0].toUpperCase()}</span><span className="flex-1 truncate">{desc}</span></button>
          ))}
          </div>
          <div className="sep" />
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-mute">Referenz (für V/Diff/Power)</div>
          <button className="row" data-active={!target.probe.ref || target.probe.ref==="0"} onClick={()=> { st.updateMeasurementProbe(target.id,{ref:"0"}); onClose(); }}>GND (0) – Standard</button>
          {st.doc.probes.filter(pr=> pr.kind==="ref" && pr.id!==target.id).map(pr=> (
            <button key={pr.id} className="row" data-active={target.probe.ref===pr.id} onClick={()=> { st.updateMeasurementProbe(target.id,{ref:pr.id}); onClose(); }}><span className="truncate">REF {pr.name ?? pr.id.slice(0,6)} ({pr.net ?? "auto"})</span></button>
          ))}
          <div className="sep" />
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-mute">Anzeige</div>
          <button className="row" onClick={()=> { st.updateMeasurementProbe(target.id,{periodic:!target.probe.periodic}); onClose(); }}><span>{target.probe.periodic?"☐ Periodic aus – nur DC":"☑ Periodic an – RMS/Vpp/Freq"}</span></button>
          <div className="sep" />
          <button className="row danger" onClick={() => { st.removeMeasurementProbe(target.id); onClose(); }}><span>🗑 Probe löschen</span><span className="ml-auto text-[10px] text-mute">Entf</span></button>
        </>
      )}
      {target.kind === "empty" && (
        <>
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg mb-1" style={{ background: "var(--panel-2)" }}>
            <div className="h-7 w-7 rounded-md grid place-items-center" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>◍</div>
            <div>
              <div className="text-[12px] font-semibold">Leinwand</div>
              <div className="text-[10px] text-mute">Netz {target.net ?? "–"} • {doc.instances.length} Bauteile</div>
            </div>
          </div>
          {st.clipboard && <button className="row" onClick={() => { st.pasteClipboard(); onClose(); }}><span>⎘ Einfügen</span><span className="ml-auto text-[10px] text-mute">{adaptShortcut("⌘V", apple)}</span></button>}
          <button className="row" onClick={() => { st.setTool("label" as any); onClose(); }}><span>🏷️ Netzname hinzufügen</span><span className="ml-auto text-[10px] text-mute">L</span></button>
          <button className="row" onClick={() => { st.setTool("text" as any); onClose(); }}><span>📝 Notiz hinzufügen</span><span className="ml-auto text-[10px] text-mute">T</span></button>
          <div className="sep" />
          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-mute">Messpunkt setzen – Multisim</div>
          <div className="grid grid-cols-2 gap-1">
          {([
            ["voltage","V","#fbbf24"],
            ["current","A","#22d3ee"],
            ["power","W","#a78bfa"],
            ["diff","ΔV","#f472b6"],
            ["digital","D","#4ade80"],
          ] as const).map(([k, sym, col]) => (
            <button key={k} className="row" onClick={() => addProbe(k as any)}>
              <span className="badge" style={{ background: col+"20", color: col, borderColor: col+"40" }}>{sym}</span> {k}
            </button>
          ))}
          </div>
          <div className="sep" />
          <div className="grid grid-cols-2 gap-1">
            <button className="row justify-center" onClick={() => { st.fitView(); onClose(); }}><span>⛶ Einpassen</span><span className="ml-auto text-[10px] text-mute">F</span></button>
            <button className="row justify-center" onClick={() => { st.toggleLibrary(); onClose(); }}><span>Bibliothek</span><span className="ml-auto text-[10px] text-mute">{adaptShortcut("⌘K", apple)}</span></button>
          </div>
          <div className="grid grid-cols-2 gap-1 mt-1">
            <button className="row justify-center" onClick={() => { useEditor.setState({ showGrid: !st.showGrid }); onClose(); }}><span>{st.showGrid?"☑":"☐"} Grid</span></button>
            <button className="row justify-center" onClick={() => { st.toggleCurrentFlow(); onClose(); }}><span>{st.showCurrentFlow?"☑":"☐"} Strom</span></button>
          </div>
        </>
      )}
      <div className="sep" />
      <button className="row muted justify-center" onClick={onClose}><span>Schließen</span><span className="ml-auto text-[10px] text-mute">Esc</span></button>

      <style>{`
        .row { display:flex; width:100%; align-items:center; gap:8px; border-radius:8px; padding:7px 10px; text-align:left; transition: all 0.12s ease; }
        .row:hover { background: color-mix(in srgb, var(--text) 8%, transparent); transform: translateX(1px); }
        .row[data-active=true] { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent); border: 1px solid color-mix(in srgb, var(--accent) 20%, transparent); }
        .row.danger { color: var(--err); }
        .row.danger:hover { background: color-mix(in srgb, var(--err) 12%, transparent); }
        .row.muted { color: var(--text-mute); }
        .sep { height:1px; margin:6px 0; background: var(--border); }
        .badge { display:grid; place-items:center; width:22px; height:22px; border-radius:6px; border:1px solid var(--border); background: var(--panel-2); font-size:10px; font-weight:700; }
      `}</style>
    </div>
  );
}

function ZoomButtons({ onFit }: { onFit: () => void }) {
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  return (
    <div className="flex flex-col overflow-hidden rounded-lg text-xs" style={{ background: "var(--panel-solid)", border: "1px solid var(--border)" }}>
      <button className="btn rounded-none" onClick={() => setView({ zoom: Math.min(6, view.zoom * 1.25) })} title="Vergrößern">+</button>
      <button className="btn rounded-none" onClick={() => setView({ zoom: Math.max(0.12, view.zoom / 1.25) })} title="Verkleinern">−</button>
      <button className="btn rounded-none text-[10px]" onClick={onFit} title="Einpassen (F)">FIT</button>
    </div>
  );
}

function polyLength(pts: Pt[]): number {
  let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y); return l;
}
function pointAtLength(pts: Pt[], len: number): Pt | null {
  if (!pts.length) return null; if (len <= 0) return pts[0];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i-1], b = pts[i]; const seg = Math.hypot(b.x-a.x, b.y-a.y);
    if (acc+seg >= len) { const t = (len-acc)/Math.max(seg,1e-9); return { x: a.x+(b.x-a.x)*t, y: a.y+(b.y-a.y)*t }; }
    acc+=seg;
  }
  return pts[pts.length-1];
}
function tangentAtLength(pts: Pt[], len: number): Pt | null {
  if (pts.length<2) return null; let acc=0;
  for (let i=1;i<pts.length;i++) {
    const a=pts[i-1], b=pts[i]; const seg=Math.hypot(b.x-a.x,b.y-a.y);
    if (acc+seg>=len) return { x:b.x-a.x, y:b.y-a.y };
    acc+=seg;
  }
  const a=pts[pts.length-2], b=pts[pts.length-1]; return { x:b.x-a.x, y:b.y-a.y };
}
function roundRect(ctx: CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number) {
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}
/** W54: nächstes Leitungssegment unter dem Zeiger (für das Segment-Ziehen). */
function hitWireSegment(doc: SchematicDoc, x: number, y: number, tol = 8): { wireId: string; segIdx: number; dist: number } | null {
  let best: { wireId: string; segIdx: number; dist: number } | null = null;
  for (const w of doc.wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((x - a.x) * dx + (y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const d = Math.hypot(a.x + t * dx - x, a.y + t * dy - y);
      if (d <= tol && (!best || d < best.dist)) best = { wireId: w.id, segIdx: i, dist: d };
    }
  }
  return best;
}

function hitWire(doc: SchematicDoc, p: Pt): string | null {
  for (const w of doc.wires) for (let i=0;i+1<w.points.length;i++) {
    const a=w.points[i], b=w.points[i+1]; const dx=b.x-a.x, dy=b.y-a.y; const len2=dx*dx+dy*dy||1;
    let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/len2; t=Math.max(0,Math.min(1,t));
    const cx=a.x+t*dx, cy=a.y+t*dy;
    if ((cx-p.x)**2+(cy-p.y)**2<36) return w.id;
  }
  return null;
}
/** Runde 17 (W32c): Anschlusspunkt für die Messleitung – Bauteil-Pin zuerst,
 *  sonst Leitungsende (verbindet sicheres Raster) bzw. Projektion aufs Segment. */
function probeTarget(doc: SchematicDoc, p: Pt): Pt | null {
  let best: Pt | null = null;
  let bestD = 144; // 12 px
  for (const inst of doc.instances) {
    const part = PART_MAP[inst.partId];
    if (!part) continue;
    for (let idx = 0; idx < part.pins.length; idx++) {
      const pos = pinPosition(inst, idx);
      const d = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2;
      if (d < bestD) { bestD = d; best = pos; }
    }
  }
  if (best) return best;
  let segBest: { x: number; y: number; d: number } | null = null;
  let endBest: { x: number; y: number; d: number } | null = null;
  for (const w of doc.wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i], b = w.points[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + t * dx, cy = a.y + t * dy;
      const d = Math.hypot(cx - p.x, cy - p.y);
      if (d < 6 && (!segBest || d < segBest.d)) segBest = { x: cx, y: cy, d };
    }
    for (const pt of w.points) {
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d < 10 && (!endBest || d < endBest.d)) endBest = { x: pt.x, y: pt.y, d };
    }
  }
  if (endBest) return { x: endBest.x, y: endBest.y };
  return segBest ? { x: segBest.x, y: segBest.y } : null;
}
function hitWireHandle(doc: SchematicDoc, p: Pt, zoom: number, onlySelected = true): { wireId: string; pointIdx: number; isMid?: boolean; segIdx?: number; dist: number } | null {
  const st = useEditor.getState();
  const sel = onlySelected ? st.selection : doc.wires.map(w=>w.id);
  const hitRadius = 12 / Math.max(zoom, 0.3); // generous hit for delightful grabbing
  let best: any = null;
  let bestDist = Infinity;
  for (const wireId of sel) {
    const wire = doc.wires.find(w=>w.id===wireId);
    if (!wire) continue;
    // point handles
    for (let idx=0; idx<wire.points.length; idx++) {
      const pt = wire.points[idx];
      const d = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (d < hitRadius && d < bestDist) {
        bestDist = d;
        best = { wireId, pointIdx: idx, dist: d };
      }
    }
    // mid handles
    for (let s=0; s<wire.points.length-1; s++) {
      const a = wire.points[s];
      const b = wire.points[s+1];
      const mx = (a.x + b.x)/2;
      const my = (a.y + b.y)/2;
      const d = Math.hypot(mx - p.x, my - p.y);
      const midRadius = 10 / Math.max(zoom, 0.3);
      if (d < midRadius && d < bestDist) {
        bestDist = d;
        best = { wireId, pointIdx: s+1, isMid: true, segIdx: s, dist: d };
      }
    }
  }
  // If no selected hit, try all wires for mid handles when hovered (for discoverability)
  if (!best && !onlySelected) {
    for (const wire of doc.wires) {
      for (let s=0; s<wire.points.length-1; s++) {
        const a = wire.points[s];
        const b = wire.points[s+1];
        const mx = (a.x + b.x)/2;
        const my = (a.y + b.y)/2;
        const d = Math.hypot(mx - p.x, my - p.y);
        const midRadius = 10 / Math.max(zoom, 0.3);
        if (d < midRadius && d < bestDist) {
          bestDist = d;
          best = { wireId: wire.id, pointIdx: s+1, isMid: true, segIdx: s, dist: d };
        }
      }
    }
  }
  return best;
}
function nearestNetName(p: Pt, radius=14): string | null {
  const st=useEditor.getState(); let best:string|null=null, bestD=radius*radius;
  for (const net of st.netResult.nets) for (const pt of net.points) {
    const d=(pt.x-p.x)**2+(pt.y-p.y)**2; if (d<bestD){ bestD=d; best=net.name; }
  }
  if (best) return best;
  const wireId=hitWire(st.doc,p);
  if (wireId) {
    const wire=st.doc.wires.find(w=>w.id===wireId);
    if (wire?.points.length) return st.netResult.pointNets[`${Math.round(wire.points[0].x)},${Math.round(wire.points[0].y)}`] ?? null;
  }
  return null;
}
function drawProbe(ctx: CanvasRenderingContext2D, probe: MeasurementProbe, selected:boolean, zoom:number, live:any, netResult:any, netCurrentMap:Map<string,number>) {
  // Runde 12: ruhige Token-Palette; Legacy-Neon in Altdokumenten gilt als „Auto"
  const col = (probe.color && !LEGACY_PROBE_COLORS.has(probe.color as string))
    ? (probe.color as string)
    : css(PROBE_CSSVAR[probe.kind] ?? "--warn", PROBE_HEX[probe.kind] ?? "#a87a12");
  const rot = (probe.rotation ?? 0) * Math.PI/180;
  const dir = probe.direction ?? 0;

  // V2: anchor (on wire) and body (offset) – like Multisim magnifier/arrow pointing to wire
  const ax = probe.anchorX ?? probe.x;
  const ay = probe.anchorY ?? probe.y;
  const bx = probe.x;
  const by = probe.y;
  const hasLeader = (probe.anchorX !== undefined && probe.anchorY !== undefined) || probe.leader;
  const iz = 1 / Math.max(zoom, 0.15); // inverse zoom for constant screen size

  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(rot);

  // ---- leader line from body to anchor (arrow pointing to wire) – world coords, constant screen thickness ----
  if (hasLeader) {
    const dx = ax - bx;
    const dy = ay - by;
    const angle = Math.atan2(dy, dx);
    ctx.save();
    ctx.rotate(-rot); // leader in world coords (unrotate)
    ctx.strokeStyle = col+"AA";
    ctx.lineWidth = 1 * iz;
    ctx.setLineDash(probe.leader==="magnifier" ? [3*iz,3*iz] : []);
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.lineTo(dx, dy);
    ctx.stroke();
    // arrow head at anchor – constant screen size
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(angle);
    ctx.fillStyle = col;
    ctx.beginPath();
    // arrow size constant screen: 6px screen -> world 6*iz
    const as = 4.5 * iz;
    ctx.moveTo(0,0);
    ctx.lineTo(-as, -as*0.5);
    ctx.lineTo(-as, as*0.5);
    ctx.closePath();
    ctx.fill();
    // small dot at anchor – constant screen
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(0,0,1.8*iz,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ---- reference line for diff/ref (dashed to REF) – world, constant thickness ----
  if (probe.kind==="diff" || (probe.kind==="voltage" && probe.ref && probe.ref!=="0")) {
    let refX = 0, refY = 0, hasRef = false;
    if (probe.ref && probe.ref.startsWith("pr_")) {
      const st = useEditor.getState();
      const refProbe = st.doc.probes.find(p=>p.id===probe.ref);
      if (refProbe) { refX = refProbe.x - bx; refY = refProbe.y - by; hasRef = true; }
    } else if (probe.ref && probe.ref!=="0") {
      const st = useEditor.getState();
      const refNet = st.netResult.nets.find(n=>n.name===probe.ref);
      if (refNet && refNet.points.length) {
        const pt = refNet.points[0];
        refX = pt.x - bx; refY = pt.y - by; hasRef = true;
      }
    }
    if (hasRef) {
      ctx.save();
      ctx.rotate(-rot);
      ctx.strokeStyle = col+"66";
      ctx.setLineDash([4*iz,3*iz]);
      ctx.lineWidth = 1 * iz;
      ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(refX, refY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // ---- probe body – kleines Fähnchen statt Neon-Badge (Ref-2-Stil, Runde 12) ----
  ctx.save();
  ctx.scale(iz, iz); // Screen-Pixel relativ zum Körper
  ctx.strokeStyle = selected ? css("--wire-sel", "#c77a16") : col;
  ctx.lineWidth = selected ? 1.6 : 1;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (probe.kind === "current" || probe.kind === "power") {
    // Richtungspfeil entlang der Leitung
    const ang = dir ? Math.PI : 0;
    ctx.save();
    ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(4, 0); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(3, -2.5); ctx.lineTo(3, 2.5); ctx.closePath(); ctx.fill();
    ctx.restore();
    if (probe.kind === "power") {
      ctx.fillStyle = col;
      ctx.font = `600 7px ui-monospace, monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText("W", 0, -9);
    }
  } else {
    // Fähnchen am Draht (Ref-2-Pfad), dünne Kontur, 18 % Füllung
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(4, -6); ctx.lineTo(12, -6); ctx.lineTo(12, -14); ctx.lineTo(4, -14); ctx.lineTo(4, -6);
    ctx.closePath();
    ctx.fillStyle = col + "2E";
    ctx.fill();
    ctx.stroke();
    const glyph: Record<string, string> = { voltage: "V", voltage_current: "V", diff: "Δ", ref: "R", digital: "D" };
    ctx.fillStyle = col;
    ctx.font = `600 6.5px ui-monospace, monospace`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(glyph[probe.kind] ?? "V", 8, -10);
  }

  if (selected) {
    ctx.strokeStyle = css("--accent", "#1f5fd0");
    ctx.setLineDash([3, 2]);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(4, -7, 12, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore(); // end constant screen body

  ctx.rotate(-rot);

  // ---- live values - permanent box like Multisim – constant screen size ----
  if (live) {
    const netName=probe.net ?? nearestNetName({x:ax,y:ay},24);
    const st = useEditor.getState();
    let refNetName: string | null = null;
    if (probe.ref) {
      if (probe.ref.startsWith("pr_")) {
        const rp = st.doc.probes.find(p=>p.id===probe.ref);
        refNetName = rp?.net ?? rp?.ref ?? null;
      } else {
        refNetName = probe.ref;
      }
    }

    let v = netName ? (live.nets[netName] ?? 0) : 0;
    let refV = refNetName ? (live.nets[refNetName] ?? 0) : 0;
    let i = netName ? (netCurrentMap.get(netName) ?? 0) : 0;
    if (dir) i = -i;

    let lines: string[] = [];
    const show = probe.show ?? { vdc: true };
    const namePrefix = probe.name ? `${probe.name} ` : "";

    let vrms=0, vpp=0, vavg=0, irms=0, ipp=0, freq=0;
    if (probe.periodic && netName) {
      try {
        const ch = engine.channel(netName, 2048);
        if (ch.v.length>8) {
          vavg = mean(ch.v);
          vrms = rms(ch.v);
          vpp = peakToPeak(ch.v);
          freq = estimateFrequency(ch.t, ch.v);
          irms = Math.abs(i)*0.707;
          ipp = Math.abs(i)*2;
        }
      } catch {}
    }

    if (probe.kind==="voltage") {
      if (show.vdc) {
        const dv = refNetName ? v - refV : v;
        lines.push(`${namePrefix}${formatValue(dv,"V")}`);
      }
      if (probe.periodic) {
        if (show.vrms) lines.push(`Vrms ${formatValue(vrms,"V")}`);
        if (show.vpp) lines.push(`Vpp ${formatValue(vpp,"V")}`);
        if (show.vavg) lines.push(`Vavg ${formatValue(vavg,"V")}`);
        if (show.freq) lines.push(`${freq.toFixed(1)} Hz`);
      }
      if (refNetName && refNetName!=="0") lines.push(`ref ${refNetName}: ${formatValue(refV,"V")}`);
    } else if (probe.kind==="current") {
      if (show.idc) lines.push(`${namePrefix}${formatValue(i,"A")}`);
      if (probe.periodic) {
        if (show.irms) lines.push(`Irms ${formatValue(irms,"A")}`);
        if (show.ipp) lines.push(`Ipp ${formatValue(ipp,"A")}`);
      }
    } else if (probe.kind==="voltage_current") {
      const dv = refNetName ? v - refV : v;
      lines.push(`${namePrefix}${formatValue(dv,"V")} · ${formatValue(i,"A")}`);
      if (probe.periodic && show.vrms) lines.push(`Vrms ${formatValue(vrms,"V")} Irms ${formatValue(irms,"A")}`);
    } else if (probe.kind==="power") {
      const pwr = (refNetName ? (v - refV) : v) * i;
      lines.push(`${namePrefix}${formatValue(pwr,"W")}`);
      if (show.vdc) lines.push(`${formatValue(refNetName ? v - refV : v,"V")} · ${formatValue(i,"A")}`);
    } else if (probe.kind==="diff") {
      const dv = v - refV;
      lines.push(`${namePrefix}Δ ${formatValue(dv,"V")}`);
      if (probe.periodic) lines.push(`${formatValue(v,"V")} - ${formatValue(refV,"V")}`);
    } else if (probe.kind==="ref") {
      lines.push(`${namePrefix}REF ${formatValue(v,"V")}`);
    } else if (probe.kind==="digital") {
      const low = probe.thresholds?.low ?? 0.8;
      const high = probe.thresholds?.high ?? 2.0;
      const lvl = v > high ? "H" : v < low ? "L" : "X";
      const colLvl = v > high ? css("--ok", "#2e7a4f") : v < low ? css("--err", "#b3372c") : css("--warn", "#a87a12");
      lines.push(`${namePrefix}${lvl} ${formatValue(v,"V")}`);
      // colored dot – constant screen
      ctx.save();
      ctx.scale(iz, iz);
      ctx.fillStyle=colLvl; ctx.beginPath(); ctx.arc(16, -12, 4, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }

    if (lines.length) {
      // draw box in constant screen coords
      ctx.save();
      ctx.scale(iz, iz);
      ctx.font=`500 9.5px ui-monospace, monospace`;
      ctx.textAlign="left"; ctx.textBaseline="top";
      const maxW = Math.max(...lines.map(l=> ctx.measureText(l).width));
      const lineH = 12;
      const padX = 6, padY=3;
      const boxW = maxW + padX*2;
      const boxH = lines.length*lineH + padY*2;
      const bxOff = 16, byOff = -boxH/2;
      ctx.fillStyle=css("--panel-solid","#1a1f2e");
      roundRect(ctx,bxOff,byOff,boxW,boxH,5); ctx.fill();
      ctx.strokeStyle=col+"55"; ctx.lineWidth=1; ctx.stroke();
      ctx.fillStyle=css("--text","#e2e8f0");
      lines.forEach((ln, idx)=> {
        ctx.fillText(ln, bxOff+padX, byOff+padY+idx*lineH);
      });
      ctx.restore();
    }
  }

  ctx.restore();
}

function drawInstance(ctx: CanvasRenderingContext2D, inst: Instance, selected:boolean, zoom:number, live:any) {
  const part=PART_MAP[inst.partId]; if (!part) return;
  // ISO/ANSI symbol style – auto by browser locale (DE -> IEC rectangle, US -> ANSI zigzag)
  let sym = part.symbol;
  try {
    const pref = (typeof window !== "undefined" ? (localStorage.getItem("multispice.symbolStyle") as any) : null) || "auto";
    const resolved = resolveSymbolStyle(pref);
    sym = getPartSymbol(part, resolved);
  } catch {}
  ctx.save(); ctx.translate(inst.x, inst.y); ctx.rotate((inst.rot*Math.PI)/180); if (inst.mirror) ctx.scale(-1,1);
  const stroke=selected?css("--wire-sel","#fbbf24"):css("--symbol","#dbe4f7");
  ctx.strokeStyle=stroke; ctx.fillStyle=stroke; ctx.lineWidth=1.3; ctx.lineJoin="round"; ctx.lineCap="round"; // W27: dünnere Tinte wie die Referenz
  if (live && (part.interactive==="led" || part.interactive==="lamp")) {
    const i=Math.abs(live.currents[inst.label]??0); const bright=Math.min(1,i/0.015);
    if (bright>0.02) {
      const colorMap: Record<string,string> = { red:"#ff4d4f", green:"#4ade80", blue:"#60a5fa", yellow:"#fde047", white:"#f8fafc" };
      const c=colorMap[String(inst.params.color??"red")]??"#ff4d4f";
      const g=ctx.createRadialGradient(0,0,1,0,0,part.interactive==="lamp" ? 48 : 34); g.addColorStop(0,hexAlpha(c,0.85*bright)); g.addColorStop(1,hexAlpha(c,0));
      ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,part.interactive==="lamp" ? 48 : 34,0,Math.PI*2); ctx.fill(); ctx.fillStyle=stroke;
      if (part.interactive==="lamp") {
        // Filament glow
        ctx.strokeStyle = hexAlpha(c, 0.6*bright);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-6,-4); ctx.lineTo(-2,4); ctx.lineTo(2,-4); ctx.lineTo(6,4);
        ctx.stroke();
      }
    }
  }
  // 7-seg display – animated, shows number based on digital engine or voltage
  if (part.interactive==="sevenseg") {
    let val = 0;
    try {
      const ctrl = engine.controls[inst.label];
      if (ctrl !== undefined) val = Math.floor(ctrl) % 16;
      else if (live) {
        // Try digital engine first – real digital state
        const dig = (engine as any).digitalStates?.[inst.label] ?? (engine as any).digitalStates?.[inst.id];
        if (dig !== undefined) val = Math.floor(dig) % 16;
        else {
          // Try connected net voltage – use first net voltage found
          const netVals = Object.values(live.nets);
          if (netVals.length) {
            // Use max voltage as heuristic for BCD
            const maxV = Math.max(...netVals.filter(v=> typeof v === "number") as number[]);
            if (maxV > 0.5) val = Math.floor(maxV) % 16;
            else val = Math.floor((live.time / 1.2) % 10);
          } else {
            val = Math.floor((live.time / 1.2) % 10);
          }
        }
      }
    } catch {}
    const segOn = [
      [1,1,1,1,1,1,0], //0
      [0,1,1,0,0,0,0], //1
      [1,1,0,1,1,0,1], //2
      [1,1,1,1,0,0,1], //3
      [0,1,1,0,0,1,1], //4
      [1,0,1,1,0,1,1], //5
      [1,0,1,1,1,1,1], //6
      [1,1,1,0,0,0,0], //7
      [1,1,1,1,1,1,1], //8
      [1,1,1,1,0,1,1], //9
    ][val] || [0,0,0,0,0,0,0];
    const segPos = [
      {x:0,y:-12,w:14,h:3}, //a top
      {x:9,y:-6,w:3,h:12}, //b top right
      {x:9,y:8,w:3,h:12}, //c bottom right
      {x:0,y:20,w:14,h:3}, //d bottom
      {x:-9,y:8,w:3,h:12}, //e bottom left
      {x:-9,y:-6,w:3,h:12}, //f top left
      {x:0,y:2,w:14,h:3}, //g middle
    ];
    ctx.save();
    segPos.forEach((sp,i)=>{
      ctx.fillStyle = segOn[i] ? "#ff4d4f" : "rgba(255,255,255,0.08)";
      if (segOn[i]) {
        ctx.shadowColor = "#ff4d4f";
        ctx.shadowBlur = 6;
      }
      ctx.fillRect(sp.x - sp.w/2, sp.y - sp.h/2, sp.w, sp.h);
      ctx.shadowBlur = 0;
    });
    ctx.restore();
  }
  // Motor – spins when current flows
  if (part.interactive==="motor" && live) {
    const i = Math.abs(live.currents[inst.label]??0);
    if (i > 0.001) {
      const ang = (live.time * 3600 * i) % 360;
      ctx.save();
      ctx.rotate(ang * Math.PI/180);
      ctx.strokeStyle = "#60a5fa";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0,0); ctx.lineTo(12,0);
      ctx.stroke();
      ctx.restore();
    }
  }
  for (const prim of sym) drawPrim(ctx, prim);
  ctx.fillStyle=css("--pin","#64748b");
  for (const pin of part.pins){ ctx.beginPath(); ctx.arc(pin.x,pin.y,1.5,0,Math.PI*2); ctx.fill(); } // W27: dezente Pin-Punkte
  if (part.interactive==="switch" || part.interactive==="button") {
    // W27: Ref-2-Schalter – dünner Hebel, gefüllte Lagerpunkte, neutrale Tinte
    const closed=(engine.controls[inst.label] ?? (inst.params.closed?1:0))>0.5;
    ctx.strokeStyle=css("--symbol","#1c1f22"); ctx.lineWidth=1.3; ctx.lineCap="round";
    ctx.beginPath();
    if (closed){ ctx.moveTo(-14,0); ctx.lineTo(14,0); }
    else { ctx.moveTo(-14,0); ctx.lineTo(11,-10); }
    ctx.stroke();
    ctx.fillStyle=css("--symbol","#1c1f22");
    ctx.beginPath(); ctx.arc(-14,0,1.8,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(14,0,1.8,0,Math.PI*2); ctx.fill();
  }
  if (part.interactive==="pot") {
    const pos=engine.controls[inst.label] ?? Number(inst.params.pos??0.5);
    ctx.fillStyle=css("--accent-2","#22d3ee"); ctx.fillRect(-20+40*pos-1,-12,2,8);
  }
  // Fault visualization
  if ((inst as any).fault && (inst as any).fault !== "none") {
    ctx.save();
    const fault = (inst as any).fault;
      ctx.strokeStyle = fault === "open" ? css("--warn","#a87a12") : fault === "short" ? css("--err","#b3372c") : css("--accent-3","#7a4fa3");
      ctx.lineWidth = 1.4;
    ctx.setLineDash([3,3]);
    const b = { x: -20, y: -14, w: 40, h: 28 };
    ctx.strokeRect(b.x, b.y, b.w, b.h);
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = "bold 8px ui-sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(fault.toUpperCase(), 0, -18);
    ctx.restore();
  }
  ctx.restore();
  if (zoom>0.42 && part.mount!=="virtual") {
    ctx.save(); ctx.translate(inst.x, inst.y);
    const b=instanceBounds(inst); const dy=b.y+b.h-inst.y+14;
    ctx.font="600 10.5px ui-sans-serif, system-ui"; ctx.textAlign="center";
    ctx.fillStyle=selected?css("--wire-sel","#fbbf24"):css("--text-dim","#9aa5bd"); ctx.fillText(inst.label,0,dy);
    const main=part.params[0];
    if (main && main.type==="number"){ const val=Number(inst.params[main.key]??main.def); ctx.fillStyle=css("--text-mute","#64708c"); ctx.font="10px ui-monospace, monospace"; ctx.fillText(formatValue(val,main.unit??""),0,dy+12); }
    ctx.restore();
  }
  if (selected){ const b=instanceBounds(inst); ctx.strokeStyle=css("--accent","#5b8cff"); ctx.setLineDash([4,3]); ctx.lineWidth=1; ctx.strokeRect(b.x-6,b.y-6,b.w+12,b.h+12); ctx.setLineDash([]); }
}
function drawPrim(ctx: CanvasRenderingContext2D, prim: SymbolPrim) {
  switch(prim.t){
    case "line": ctx.beginPath(); for(let i=0;i<prim.pts.length;i+=2){ if(i===0) ctx.moveTo(prim.pts[0],prim.pts[1]); else ctx.lineTo(prim.pts[i],prim.pts[i+1]); } ctx.stroke(); break;
    case "rect": roundRect(ctx,prim.x,prim.y,prim.w,prim.h,prim.r??0); if(prim.fill) ctx.fill(); else ctx.stroke(); break;
    case "circle": ctx.beginPath(); ctx.arc(prim.x,prim.y,prim.r,0,Math.PI*2); if(prim.fill) ctx.fill(); else ctx.stroke(); break;
    case "arc": ctx.beginPath(); ctx.arc(prim.x,prim.y,prim.r,prim.a0,prim.a1); ctx.stroke(); break;
    case "text": { ctx.save(); ctx.font=`600 ${prim.size??9}px ui-sans-serif, system-ui`; ctx.textAlign=prim.align??"center"; ctx.fillText(prim.s,prim.x,prim.y); ctx.restore(); break; }
  }
}
function hexAlpha(hex:string,a:number):string { const h=hex.replace("#",""); const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16); return `rgba(${r},${g},${b},${a})`; }
export { rotatePoint };
