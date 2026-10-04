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
import {
  findNetTarget,
  finishNetDraft,
  nearestWireFoot,
  netClick,
  previewNetPath,
  type NetDraft,
  type NetPathOptions,
  type NetTarget,
} from "@/lib/schematic/netdraw";
import { engine, hitTestInstance, inferWireAngleAt, useEditor, useHud, wireJunctionCandidates } from "@/state/editor";
import { LEGACY_PROBE_COLORS, PROBE_CSSVAR, PROBE_HEX } from "@/lib/probe-style";
import { rms, mean, peakToPeak, estimateFrequency } from "@/lib/sim/realtime";
import { loadHoverConfig } from "@/lib/settings";
import { parseSpiceValue } from "@/lib/schematic/importers";
import { click } from "./oszi2/sound";
import ShortcutSheet from "./ShortcutSheet";
import EmptyCanvas from "./EmptyCanvas";
import InlineEditor, { type InlineEdit } from "./InlineEditor";
import ContextMenu, { type CtxTarget } from "./CanvasContextMenu";
import ZoomButtons from "./ZoomButtons";
import { canvasColor } from "@/lib/canvas-theme";
import { openFileInEditor } from "@/lib/schematic/openFile";
import { adaptShortcut, useIsApple } from "@/lib/platform";
import { ERASER_CURSOR, PEN_CURSOR } from "@/components/cursors";

interface Pt { x: number; y: number; }

let wireIdSeq = 0;
function makeWireId(): string {
  wireIdSeq += 1;
  return `w_${Date.now().toString(36)}_${wireIdSeq.toString(36)}`;
}


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
    ctx.strokeStyle = canvasColor("--hairline-strong");
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(2, yOf(0));
    ctx.lineTo(w - 2, yOf(0));
    ctx.stroke();
    ctx.strokeStyle = canvasColor("--accent");
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

function getNetObstacles(doc: SchematicDoc): Array<{ x: number; y: number; w: number; h: number }> {
  return doc.instances.map((inst) => {
    const b = instanceBounds(inst);
    return { x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 };
  });
}

function hitTestLabel(doc: SchematicDoc, p: Pt): import("@/lib/schematic/model").NetLabel | null {
  for (let i = doc.labels.length - 1; i >= 0; i--) {
    const l = doc.labels[i];
    const w = Math.max(28, (l.name?.length ?? 3) * 7 + 14);
    if (
      (Math.hypot(p.x - l.x, p.y - l.y) <= 8) ||
      (p.x >= l.x + 6 && p.x <= l.x + 8 + w && p.y >= l.y - 22 && p.y <= l.y - 2)
    ) {
      return l;
    }
  }
  return null;
}

function getNoteBounds(n: import("@/lib/schematic/model").TextNote): { x: number; y: number; w: number; h: number } {
  const sz = n.size ?? 11;
  const raw = n.text && n.text.trim().length > 0 ? n.text : "Notiz";
  const lines = raw.split(/\r?\n/);
  const maxChars = Math.max(6, ...lines.map((l) => l.length));
  const lineH = sz + 5;
  const w = Math.max(96, Math.ceil(maxChars * (sz * 0.58) + 26));
  const h = 18 + lines.length * lineH + 8;
  return { x: n.x, y: n.y - 18, w, h };
}

function hitTestNote(doc: SchematicDoc, p: Pt): import("@/lib/schematic/model").TextNote | null {
  for (let i = doc.notes.length - 1; i >= 0; i--) {
    const n = doc.notes[i];
    const b = getNoteBounds(n);
    if (p.x >= b.x - 4 && p.x <= b.x + b.w + 4 && p.y >= b.y - 4 && p.y <= b.y + b.h + 4) {
      return n;
    }
  }
  return null;
}

function hitTestInstanceValueLabel(inst: Instance, p: Pt): boolean {
  const b = instanceBounds(inst);
  const cx = inst.x;
  const topY = b.y + b.h + 4;
  const botY = b.y + b.h + 34;
  return Math.abs(p.x - cx) <= Math.max(28, b.w * 0.55) && p.y >= topY && p.y <= botY;
}

function findInstanceByValueLabel(doc: SchematicDoc, p: Pt): Instance | null {
  for (let i = doc.instances.length - 1; i >= 0; i--) {
    const inst = doc.instances[i];
    if (hitTestInstanceValueLabel(inst, p)) return inst;
  }
  return null;
}

export default function Canvas() {
  const apple = useIsApple();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);
  const editingOpenedAt = useRef<number>(0);
  const [cursor, setCursor] = useState<Pt>({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[]; spark?: number[] | null } | null>(null);
  const [editing, setEditing] = useState<InlineEdit | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; wx: number; wy: number; target: CtxTarget } | null>(null);
  const [isTouchActive, setIsTouchActive] = useState(false);
  const lastTouchTimeRef = useRef<number>(0);
  const lastTouchTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const editingDone = useRef(false);
  const spaceDown = useRef(false);

  useEffect(() => {
    if (!editing) return;
    editingOpenedAt.current = performance.now();
    const t = setTimeout(() => {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }, 16);
    return () => clearTimeout(t);
  }, [editing]);
  const stateRef = useRef({
    dragging: false,
    panning: false,
    marquee: null as null | { x0: number; y0: number; x1: number; y1: number },
    dragStart: { x: 0, y: 0 },
    moved: false,
    // W63/W77: Netzmodus. Anker + bereits gesetzte Ecken; null = kein Netz in Arbeit.
    netDraft: null as null | NetDraft,
    // W64: Ziel unter dem Zeiger (Pin/Verbindungspunkt/Leitung) für den Magneten.
    netHover: null as null | NetTarget,
    lastMouse: { x: 0, y: 0 },
    duplicated: false,
  });

  const syncNetDraft = useCallback((draft: NetDraft | null) => {
    stateRef.current.netDraft = draft;
    if (!draft) stateRef.current.netHover = null;
    if (useHud.getState().netDrawing !== Boolean(draft)) {
      useHud.setState({ netDrawing: Boolean(draft) });
    }
  }, []);

  const netCancelSeq = useHud((s) => s.netCancelSeq);
  useEffect(() => {
    stateRef.current.netDraft = null;
    stateRef.current.netHover = null;
  }, [netCancelSeq]);

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
    const zoom = useEditor.getState().view.zoom;
    const iz = 1 / Math.max(zoom, 0.25);
    const r = (radius ?? (isMobile ? 24 : 14)) * iz;
    for (let i = doc.probes.length - 1; i >= 0; i--) {
      const pr = doc.probes[i];
      // W87/W93: Trifft das gesamte vergrößerte Multisim-Anzeigekästchen (ab pr.x nach rechts,
      // vertikal zentriert um pr.y) sowie den Bereich direkt um (pr.x, pr.y).
      const boxW = 158 * iz;
      const boxH = 58 * iz;
      if (
        p.x >= pr.x - 8 * iz &&
        p.x <= pr.x + boxW + 6 * iz &&
        p.y >= pr.y - boxH / 2 - 6 * iz &&
        p.y <= pr.y + boxH / 2 + 6 * iz
      ) {
        return pr;
      }
      if ((pr.x - p.x) ** 2 + (pr.y - p.y) ** 2 <= r * r) {
        return pr;
      }
    }
    return null;
  }, []);

  const hitTestProbeAnchor = useCallback((doc: SchematicDoc, p: Pt, touchExpand = false): MeasurementProbe | null => {
    const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
    const zoom = useEditor.getState().view.zoom;
    const iz = 1 / Math.max(zoom, 0.25);
    const hitR = (touchExpand || isMobile ? 18 : 11) * iz;
    for (let i = doc.probes.length - 1; i >= 0; i--) {
      const pr = doc.probes[i];
      const ax = pr.anchorX ?? pr.x;
      const ay = pr.anchorY ?? pr.y;
      if (Math.hypot(ax - p.x, ay - p.y) <= hitR) {
        return pr;
      }
    }
    return null;
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
    ctx.fillStyle = canvasColor("--canvas");
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.scale(view.zoom, view.zoom);
    ctx.translate(-view.x, -view.y);

    const x0 = view.x, y0 = view.y;
    const x1 = view.x + w / view.zoom, y1 = view.y + h / view.zoom;

    if (showGrid) {
      // W84: Ab normaler Ansicht (zoom >= 0.45) immer das echte GRID=10-Raster
      // zeichnen, damit 1 sichtbares Kästchen exakt 1 Bewegungsschritt (10 px)
      // entspricht; jede 5. Linie (50 px) als Hauptlinie.
      const step = view.zoom < 0.45 ? GRID * 5 : GRID;
      ctx.lineWidth = 1 / view.zoom;
      ctx.strokeStyle = canvasColor("--grid-minor");
      ctx.beginPath();
      for (let x = Math.floor(x0 / step) * step; x < x1; x += step) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
      for (let y = Math.floor(y0 / step) * step; y < y1; y += step) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
      ctx.stroke();
      const big = step * 5;
      ctx.strokeStyle = canvasColor("--grid-major");
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
        ctx.strokeStyle = canvasColor("--hairline-strong");
        ctx.lineWidth = 1.5 / view.zoom;
        ctx.strokeRect(minX, minY, maxX - minX, maxY - minY);
        // Titelstempel unten rechts
        const tw = 150, th = 36, tx = maxX - tw - 8, ty = maxY - th - 8;
        ctx.fillStyle = canvasColor("--surface");
        ctx.fillRect(tx, ty, tw, th);
        ctx.strokeStyle = canvasColor("--hairline-strong");
        ctx.lineWidth = 1 / view.zoom;
        ctx.strokeRect(tx, ty, tw, th);
        ctx.textAlign = "left";
        ctx.fillStyle = canvasColor("--ink");
        ctx.font = `600 10px ${getComputedStyle(document.body).fontFamily}`;
        ctx.fillText(doc.name || "Unbenannt", tx + 6, ty + 13);
        ctx.font = "8px ui-monospace, monospace";
        ctx.fillStyle = canvasColor("--ink-3");
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
    // ── W1 / W105–W107: Physikalisch konsistente, sprungfreie Stromanimation ──
    // 1. Konstante Ladungsträgerdichte im Leiter (fester Punktabstand SPACING = 22 px);
    //    die Stromstärke I bestimmt die Driftgeschwindigkeit v(I).
    // 2. Kontinuierliche Phasen-Integration pro Leitung (phase_k+1 = phase_k + v * dt):
    //    kehrt sich der Stromfluss um, wechselt nur das Vorzeichen von v * dt —
    //    die Elektronen bremsen ab und laufen ohne jeden Sprung zurück!
    // 3. T-Abzweige und Mehrpol-Bauteile (NE555, OPV, BJT, MOSFET) werden über
    //    Segment-Splitting und KCL-Bilanz vollständig berücksichtigt.
    const FLOW_SPACING = 22;
    const flowByWire = new Map<string, { dir: number; mag: number; phase: number }>();
    const flowState = stateRef.current as any;
    if (!flowState._wirePhases) {
      flowState._wirePhases = new Map<string, number>();
    }
    const wirePhases: Map<string, number> = flowState._wirePhases;
    const flowLive = showCurrentFlow && live && (sim.running || live.time > 0);
    if (flowLive) {
      const dtms = sim.running && flowState._flowLast ? Math.min(Math.max(now - flowState._flowLast, 0), 80) : 0;
      const dtSec = dtms / 1000;
      flowState._flowLast = now;

      if (flowState._flowDoc !== doc || flowState._flowNets !== netResult) {
        // Alle relevanten Knotenpunkte (Leitungseckpunkte, Pins, Junctions) sammeln,
        // damit auch T-Abzweige mitten auf einem Leitungssegment im Graphen verbunden sind.
        const specialPts: Array<{ x: number; y: number; key: string }> = [];
        const seenKeys = new Set<string>();
        const regPt = (x: number, y: number) => {
          const rx = Math.round(x);
          const ry = Math.round(y);
          const key = `${rx},${ry}`;
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            specialPts.push({ x: rx, y: ry, key });
          }
        };
        for (const w of doc.wires) for (const p of w.points) regPt(p.x, p.y);
        for (const j of netResult.junctions) regPt(j.x, j.y);
        for (const inst of doc.instances) {
          const part = PART_MAP[inst.partId];
          if (!part) continue;
          for (let idx = 0; idx < part.pins.length; idx++) {
            const pos = pinPosition(inst, idx);
            regPt(pos.x, pos.y);
          }
        }

        const adj = new Map<string, Set<string>>();
        const wireChains = new Map<string, Array<{ a: string; b: string; len: number }>>();
        const addE = (a: string, b: string) => {
          if (a === b) return;
          let sa = adj.get(a);
          if (!sa) adj.set(a, (sa = new Set()));
          sa.add(b);
          let sb = adj.get(b);
          if (!sb) adj.set(b, (sb = new Set()));
          sb.add(a);
        };
        for (const w of doc.wires) {
          const chain: Array<{ a: string; b: string; len: number }> = [];
          for (let i = 0; i + 1 < w.points.length; i++) {
            const ax = Math.round(w.points[i].x);
            const ay = Math.round(w.points[i].y);
            const bx = Math.round(w.points[i + 1].x);
            const by = Math.round(w.points[i + 1].y);
            const segLen = Math.hypot(bx - ax, by - ay);
            if (segLen < 0.5) continue;
            // Alle Punkte finden, die exakt auf diesem Segment liegen (inkl. T-Knoten)
            const onSeg: Array<{ key: string; t: number }> = [];
            for (const sp of specialPts) {
              const d1 = Math.hypot(sp.x - ax, sp.y - ay);
              const d2 = Math.hypot(bx - sp.x, by - sp.y);
              if (Math.abs(d1 + d2 - segLen) < 0.75) {
                onSeg.push({ key: sp.key, t: d1 / segLen });
              }
            }
            onSeg.sort((u, v) => u.t - v.t);
            for (let k = 0; k + 1 < onSeg.length; k++) {
              addE(onSeg[k].key, onSeg[k + 1].key);
              const subLen = (onSeg[k + 1].t - onSeg[k].t) * segLen;
              if (subLen > 0.1) {
                chain.push({ a: onSeg[k].key, b: onSeg[k + 1].key, len: subLen });
              }
            }
          }
          wireChains.set(w.id, chain);
        }
        flowState._flowDoc = doc;
        flowState._flowNets = netResult;
        flowState._flowAdj = adj;
        flowState._wireChains = wireChains;
      }

      const adj: Map<string, Set<string>> = flowState._flowAdj;
      const wireChains: Map<string, Array<{ a: string; b: string; len: number }>> = flowState._wireChains;

      // W114: Pin-Einspeisungen sammeln und nach Typ klassifizieren:
      //  - "gnd": Masse-Referenzsymbol (nimmt in seiner Leitungs-Insel exakt den KCL-Rückstrom auf)
      //  - "twopin": Zweipol mit exakt bekanntem Zweigstrom aus der MNA-Lösung
      //  - "multipin": Mehrpol-Pin (isHighZ = true für hochohmige Steuereingänge wie TRIG/THR/IN+/IN-/Gate)
      interface PinEntry {
        key: string;
        entering: number;
        kind: "gnd" | "twopin" | "multipin";
        isHighZ?: boolean;
      }
      const pinsAtNode = new Map<string, PinEntry[]>();
      const pushPin = (entry: PinEntry) => {
        let arr = pinsAtNode.get(entry.key);
        if (!arr) pinsAtNode.set(entry.key, (arr = []));
        arr.push(entry);
      };

      for (const inst of doc.instances) {
        const part = PART_MAP[inst.partId];
        if (!part) continue;
        if (inst.partId === "gnd" || part.pins.length === 1) {
          const pos = pinPosition(inst, 0);
          const k = `${Math.round(pos.x)},${Math.round(pos.y)}`;
          pushPin({ key: k, entering: 0, kind: "gnd" });
        } else if (part.pins.length === 2) {
          const I = live.currents[inst.label] ?? 0;
          if (!Number.isFinite(I)) continue;
          for (let idx = 0; idx < 2; idx++) {
            const pos = pinPosition(inst, idx);
            const k = `${Math.round(pos.x)},${Math.round(pos.y)}`;
            // deviceCurrent: positiv = technischer Strom von Pin 0 durch das Bauteil zu Pin 1.
            // Ins Leitungsnetz fließt am Pin 0 der Strom −I, am Pin 1 der Strom +I.
            const entering = idx === 0 ? -I : I;
            pushPin({ key: k, entering, kind: "twopin" });
          }
        } else {
          const dev = engine.netlist.devices.find((d) => d.id === inst.label);
          for (let idx = 0; idx < part.pins.length; idx++) {
            const pos = pinPosition(inst, idx);
            const k = `${Math.round(pos.x)},${Math.round(pos.y)}`;
            let pinEnter = 0;
            if (dev && engine.sim) {
              // pinCurrent ist positiv in das Bauteil hinein -> ins Leitungsnetz also negativ
              pinEnter = -engine.sim.pinCurrent(dev, idx);
            }
            const devType = dev?.type ?? "";
            const isHighZ =
              (devType === "TIMER555" && (idx === 1 || idx === 3 || idx === 5)) ||
              ((devType === "OPAMP" || devType === "COMPARATOR") && (idx === 0 || idx === 1)) ||
              ((devType === "M" || devType === "J") && idx === 1);
            pushPin({ key: k, entering: pinEnter, kind: "multipin", isHighZ });
          }
        }
      }

      // W114: KCL-Bilanz und exakte Kirchhoff-Lösung pro zusammenhängender Leitungs-Insel
      // (Connected Component im Draht-Graphen adj). Dadurch beeinflussen sich getrennte
      // GND-Zweige (z. B. V1− nach GND1 vs. D1 nach GND4) niemals gegenseitig.
      const phi = new Map<string, number>();
      const visited = new Set<string>();
      for (const startKey of adj.keys()) {
        if (visited.has(startKey)) continue;
        const compNodes: string[] = [];
        const compSet = new Set<string>();
        const q: string[] = [startKey];
        visited.add(startKey);
        compSet.add(startKey);
        while (q.length > 0) {
          const u = q.pop()!;
          compNodes.push(u);
          for (const v of adj.get(u) ?? []) {
            if (!visited.has(v)) {
              visited.add(v);
              compSet.add(v);
              q.push(v);
            }
          }
        }

        const compPins: PinEntry[] = [];
        for (const u of compNodes) {
          const ps = pinsAtNode.get(u);
          if (ps) compPins.push(...ps);
        }
        if (compPins.length === 0) continue;

        const gndPins = compPins.filter((p) => p.kind === "gnd");
        const activeMultiPins = compPins.filter((p) => p.kind === "multipin" && !p.isHighZ);
        let knownSum = 0;
        for (const p of compPins) {
          if (p.kind !== "gnd") knownSum += p.entering;
        }

        if (gndPins.length > 0) {
          // Masse-Symbole in dieser Leitungs-Insel nehmen exakt den KCL-Rückstrom auf
          const share = -knownSum / gndPins.length;
          for (const gp of gndPins) gp.entering = share;
        } else if (activeMultiPins.length > 0 && Math.abs(knownSum) > 1e-12) {
          // Falls kein GND-Symbol in der Insel liegt, gleichen aktive IC-Treiberpins die Bilanz aus
          const corr = -knownSum / activeMultiPins.length;
          for (const mp of activeMultiPins) mp.entering += corr;
        }

        const inject = new Map<string, number>();
        let maxAbsInj = 0;
        for (const p of compPins) {
          const nextVal = (inject.get(p.key) ?? 0) + p.entering;
          inject.set(p.key, nextVal);
        }
        for (const val of inject.values()) {
          if (Math.abs(val) > maxAbsInj) maxAbsInj = Math.abs(val);
        }
        if (maxAbsInj < 1e-6) continue;

        // Löse L * phi = inject auf der Leitungs-Insel (mit phi(compNodes[0]) = 0 als Referenz).
        // Dann gilt auf jeder Teilkante (a -> b): Zweigstrom I(a->b) = phi(a) - phi(b) in Ampere!
        for (const u of compNodes) phi.set(u, 0);
        const nNodes = compNodes.length;
        const iters = Math.min(80, Math.max(24, nNodes * 8));
        for (let iter = 0; iter < iters; iter++) {
          for (let ni = 1; ni < nNodes; ni++) {
            const u = compNodes[ni];
            const nbs = adj.get(u);
            if (!nbs || nbs.size === 0) continue;
            let sumNb = 0;
            let deg = 0;
            for (const v of nbs) {
              if (!compSet.has(v)) continue;
              sumNb += phi.get(v) ?? 0;
              deg++;
            }
            if (deg > 0) {
              const target = (sumNb + (inject.get(u) ?? 0)) / deg;
              const prev = phi.get(u) ?? 0;
              phi.set(u, prev + 1.35 * (target - prev));
            }
          }
        }
      }

      const electron = st.currentFlowDirection !== "conventional";
      const timeScaleFactor = Math.max(0.25, Math.min(3.5, Math.pow(sim.timeScale || 1, 0.35)));
      // W114: Erst ab 10 µA (1e-5 A) Stromfluss animieren – unterdrückt Sperr-/Leckströme
      // (z. B. an gesperrter LED bei ausgeschaltetem 555-Ausgang oder hochohmigen Eingängen).
      const MIN_FLOW_CURRENT = 1e-5;
      for (const w of doc.wires) {
        const chain = wireChains.get(w.id);
        if (!chain || chain.length === 0) continue;
        let weightedCurrent = 0;
        let totalLen = 0;
        for (const seg of chain) {
          const pa = phi.get(seg.a);
          const pb = phi.get(seg.b);
          if (pa === undefined || pb === undefined) continue;
          // Technischer Zweigstrom von seg.a nach seg.b ist (pa - pb) in Ampere
          weightedCurrent += (pa - pb) * seg.len;
          totalLen += seg.len;
        }
        if (totalLen < 1) continue;
        const iWire = weightedCurrent / totalLen;
        const mag = Math.abs(iWire);
        if (mag < MIN_FLOW_CURRENT) continue;
        const convDir = iWire > 0 ? 1 : -1;
        const dir = electron ? -convDir : convDir;
        // Gedämpfte logarithmische Driftgeschwindigkeit (px/s):
        // ~20 px/s bei 10 µA, ~56 px/s bei 1 mA, ~80 px/s bei 10 mA, max 110 px/s
        const speedPxPerSec =
          Math.min(110, Math.max(18, 20 + Math.max(0, Math.log10(mag / MIN_FLOW_CURRENT)) * 18)) * timeScaleFactor;
        const prevPhase = wirePhases.get(w.id) ?? 0;
        const nextPhase = sim.running
          ? (((prevPhase + dir * speedPxPerSec * dtSec) % FLOW_SPACING) + FLOW_SPACING) % FLOW_SPACING
          : prevPhase;
        wirePhases.set(w.id, nextPhase);
        flowByWire.set(w.id, { dir, mag, phase: nextPhase });
      }
    }

    const wireColor = canvasColor("--wire");
    const selColor = canvasColor("--wire-sel");
    const voltageColorFn = (v: number): string => {
      if (!showVoltageColors) return wireColor;
      const a = Math.min(Math.abs(v) / 12, 1);
      if (v > 0.15) return `rgb(${Math.round(80 + 175 * a)}, ${Math.round(190 - 90 * a)}, ${Math.round(255 - 180 * a)})`;
      if (v < -0.15) return `rgb(${Math.round(90 - 40 * a)}, ${Math.round(160 + 40 * a)}, 255)`;
      return canvasColor("--ink-3");
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
      let color = isSel ? selColor : (isHovered || isNetHovered) ? canvasColor("--teal") : (customColor ?? wireColor);
      if (isBus) color = isSel ? selColor : (isHovered || isNetHovered) ? canvasColor("--teal") : (customColor ?? canvasColor("--violet"));
      if (wire.points.length) {
        const key = `${Math.round(wire.points[0].x)},${Math.round(wire.points[0].y)}`;
        const netName = netResult.pointNets[key];
        if (netName && live && showVoltageColors && !customColor && !isBus) {
          const netV = live.nets[netName] ?? 0;
          color = isSel ? selColor : (isHovered || isNetHovered) ? canvasColor("--teal") : voltageColorFn(netV);
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
          ctx.fillStyle = isHoveredHandle ? "#ffffff" : canvasColor("--surface");
          ctx.strokeStyle = isHoveredHandle ? canvasColor("--accent") : isEnd ? canvasColor("--ok") : canvasColor("--accent");
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
            ctx.fillStyle = isHoveredHandle ? canvasColor("--accent") : canvasColor("--ok");
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, (isHoveredHandle ? 2.5 : 1.8) * iz, 0, Math.PI*2);
            ctx.fill();
          }
          // index label for first few points when zoomed
          if (view.zoom > 0.8 && wire.points.length < 10) {
            ctx.fillStyle = canvasColor("--ink-3");
            ctx.font = `${9*iz}px ui-monospace, monospace`;
            ctx.textAlign = "center";
            ctx.fillText(String(idx), pt.x, pt.y - (sz/2 + 8*iz));
          }
        }
        // Mid-segment add handles – small plus that creates new point (wow moment)
        for (let s = 0; s < wire.points.length - 1; s++) {
          const a = wire.points[s];
          const b = wire.points[s+1];
          const mx = Math.round(((a.x + b.x) / 2) / GRID) * GRID;
          const my = Math.round(((a.y + b.y) / 2) / GRID) * GRID;
          const isHoveredMid = hoveredHandle && hoveredHandle.wireId === wire.id && hoveredHandle.isMid && hoveredHandle.segIdx === s;
          // Only show mid handle when hovered wire or always when selected but subtle
          if (!isHovered && !isHoveredMid) continue; // show only on hover to reduce clutter, but always if hovered mid
          // For selected wire, show all mids faintly
          const showAlways = isSel && view.zoom > 0.6;
          if (!showAlways && !isHoveredMid && !isHovered) continue;
          const msz = (isHoveredMid ? 10 : 6) * iz;
          ctx.save();
          ctx.fillStyle = isHoveredMid ? "#ffffff" : "rgba(255,255,255,0.75)";
          ctx.strokeStyle = isHoveredMid ? canvasColor("--teal") : canvasColor("--ink-3");
          ctx.lineWidth = 1.2 * iz;
          ctx.beginPath();
          ctx.arc(mx, my, msz/2, 0, Math.PI*2);
          ctx.fill();
          ctx.stroke();
          // plus icon
          ctx.strokeStyle = isHoveredMid ? canvasColor("--teal") : canvasColor("--ink-3");
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
        ctx.fillStyle = canvasColor("--teal")+"AA";
        ctx.beginPath();
        ctx.arc(wire.points[0].x, wire.points[0].y, 4 / Math.max(view.zoom,0.4), 0, Math.PI*2);
        ctx.fill();
        // W13: Der Endpunkt-Marker genügt – kein Glow-Streifen.
      }

      // W15 / W105–W107 / W113: Dezentere, sprungfreie Ladungsträger-Perlen
      // mit konstantem Abstand (FLOW_SPACING = 22 px) und kontinuierlich
      // integrierter Phase pro Leitung.
      const flow = flowByWire.get(wire.id);
      if (flow && flow.mag >= 1e-5 && wire.points.length > 1) {
        const totalLen = polyLength(wire.points);
        if (totalLen >= 6) {
          const iz = 1 / Math.max(view.zoom, 0.45);
          // Dezente Deckkraft (0.32 bei 10 µA bis max. 0.68 ab 10 mA)
          const intensity = Math.min(0.68, Math.max(0.32, 0.32 + (Math.log10(flow.mag / 1e-5) / 3) * 0.36));
          const rDot = 2.0 * iz;
          const isElectron = st.currentFlowDirection !== "conventional";
          ctx.save();
          ctx.globalAlpha = intensity;
          ctx.fillStyle = isElectron ? "#f59e0b" : "#cbd5e1";
          ctx.strokeStyle = "rgba(15, 23, 42, 0.45)";
          ctx.lineWidth = 0.85 * iz;
          for (let pos = flow.phase; pos <= totalLen; pos += FLOW_SPACING) {
            const pt = pointAtLength(wire.points, pos);
            if (!pt) continue;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, rDot, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
          }
          ctx.restore();
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
    ctx.fillStyle = canvasColor("--wire");
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
      ctx.strokeStyle = canvasColor("--err");
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
        const col = v > 0.5 ? canvasColor("--accent") : v < -0.5 ? canvasColor("--err") : canvasColor("--ink-3");
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
        const col = Math.abs(cur) > 0.01 ? canvasColor("--warn") : canvasColor("--ink-3");
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
        ctx.fillStyle = canvasColor("--err");
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
        ctx.fillStyle = canvasColor("--err");
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
        ctx.fillStyle = canvasColor("--warn");
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
          ctx.strokeStyle = canvasColor("--err");
          ctx.lineWidth = 2*iz;
          ctx.setLineDash([4*iz,3*iz]);
          ctx.strokeRect(b.x - 2*iz, b.y - 2*iz, b.w + 4*iz, b.h + 4*iz);
          ctx.setLineDash([]);
          // Tooltip
          ctx.fillStyle = canvasColor("--err");
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
      ctx.strokeStyle = canvasColor("--accent");
      ctx.lineWidth = 2 * iz;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 10*iz, 0, Math.PI*2);
      ctx.fill();
      ctx.stroke();
      // inner dot
      ctx.fillStyle = canvasColor("--accent");
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3*iz, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    ctx.font = "600 11px ui-sans-serif, system-ui";
    for (const label of doc.labels) {
      // W91: Der vom Nutzer vergebene Name hat immer Vorrang vor einem generischen Netznamen
      const txt = label.name || netResult.pointNets[`${Math.round(label.x)},${Math.round(label.y)}`] || "NET";
      const tw = ctx.measureText(txt).width;
      const isSel = selection.includes(label.id);
      ctx.fillStyle = canvasColor("--surface-2");
      roundRect(ctx, label.x + 8, label.y - 20, tw + 12, 16, 4); ctx.fill();
      ctx.strokeStyle = isSel ? canvasColor("--wire-sel") : canvasColor("--hairline-strong");
      ctx.lineWidth = (isSel ? 1.8 : 1) / view.zoom;
      ctx.stroke();
      ctx.fillStyle = isSel ? canvasColor("--wire-sel") : canvasColor("--teal");
      ctx.textAlign = "left";
      ctx.fillText(txt, label.x + 14, label.y - 8);
      ctx.beginPath(); ctx.arc(label.x, label.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // W117: Edle Laborbuch-Notizkarten (Callout-Cards mit warmem Bernstein-Akzentstreifen)
    ctx.textAlign = "left";
    for (const note of doc.notes) {
      const sz = note.size ?? 11;
      const isSel = selection.includes(note.id);
      const lines = (note.text || "Notiz").split(/\r?\n/);
      const lineH = sz + 5;
      ctx.font = `500 ${sz}px ui-sans-serif, system-ui`;
      let maxTw = 48;
      for (const ln of lines) {
        const wLn = ctx.measureText(ln).width;
        if (wLn > maxTw) maxTw = wLn;
      }
      const cardX = note.x;
      const cardY = note.y - 18;
      const cardW = Math.max(96, Math.ceil(maxTw + 24));
      const cardH = 18 + lines.length * lineH + 8;

      ctx.save();
      // Sanfter Kartenschatten
      ctx.fillStyle = "rgba(0, 0, 0, 0.24)";
      roundRect(ctx, cardX + 1.5, cardY + 2, cardW, cardH, 6);
      ctx.fill();

      // Kartenkörper
      ctx.fillStyle = canvasColor("--surface");
      roundRect(ctx, cardX, cardY, cardW, cardH, 6);
      ctx.fill();

      // Linker Akzentstreifen (3.5 px)
      ctx.save();
      ctx.beginPath();
      roundRect(ctx, cardX, cardY, cardW, cardH, 6);
      ctx.clip();
      ctx.fillStyle = canvasColor("--wire-sel");
      ctx.fillRect(cardX, cardY, 3.5, cardH);
      ctx.restore();

      // Rahmen (hervorgehoben bei Auswahl)
      ctx.strokeStyle = isSel ? canvasColor("--wire-sel") : canvasColor("--hairline-strong");
      ctx.lineWidth = (isSel ? 1.8 : 1.1) / Math.max(view.zoom, 0.35);
      roundRect(ctx, cardX, cardY, cardW, cardH, 6);
      ctx.stroke();

      // Kopfzeile "NOTIZ"
      ctx.font = "700 8px ui-monospace, monospace";
      ctx.fillStyle = canvasColor("--wire-sel");
      ctx.fillText("NOTIZ", cardX + 10, cardY + 11);

      // Notiztext (ein- oder mehrzeilig)
      ctx.font = `500 ${sz}px ui-sans-serif, system-ui`;
      ctx.fillStyle = canvasColor("--ink");
      for (let li = 0; li < lines.length; li++) {
        ctx.fillText(lines[li], cardX + 10, cardY + 16 + (li + 1) * lineH - 4);
      }
      ctx.restore();
    }

    for (const probe of doc.probes) {
      const isSel = selection.includes(probe.id);
      drawProbe(ctx, probe, isSel, view.zoom, live, netResult, netCurrentMap);
    }

    // W85: Legacy-Netzmarker (st.probes) nur dann zeichnen, wenn auf diesem Netz
    // nicht bereits eine echte MeasurementProbe (doc.probes) sitzt – verhindert
    // den doppelten lila Geisterkreis am anderen Ende des Netzes.
    const measuredNets = new Set(doc.probes.map((pr) => pr.net).filter(Boolean));
    for (const probeName of st.probes) {
      if (measuredNets.has(probeName)) continue;
      const net = netResult.nets.find((n) => n.name === probeName);
      if (!net || !net.points.length) continue;
      const p = net.points[0];
      ctx.strokeStyle = canvasColor("--violet"); ctx.lineWidth = 1.6 / view.zoom;
      ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.stroke();
      if (live) {
        ctx.fillStyle = canvasColor("--violet"); ctx.font = "600 10px ui-monospace, monospace";
        ctx.fillText(formatValue(live.nets[probeName] ?? 0, "V"), p.x + 10, p.y - 8);
      }
    }

    const sr = stateRef.current;
    // W68: Knotenpunkt-Vorschau
    if ((sr as any).junctionHover) {
      const j = (sr as any).junctionHover as { x: number; y: number };
      const connected = (st.doc.junctions ?? []).some((q) => Math.hypot(q.x - j.x, q.y - j.y) < 0.5);
      ctx.save();
      ctx.strokeStyle = connected ? canvasColor("--err") : canvasColor("--ok");
      ctx.lineWidth = 1.8 / Math.max(view.zoom, 0.3);
      ctx.beginPath(); ctx.arc(j.x, j.y, 8 / Math.max(view.zoom, 0.3), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = connected ? canvasColor("--err") : canvasColor("--ok");
      ctx.beginPath(); ctx.arc(j.x, j.y, 2.6 / Math.max(view.zoom, 0.3), 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // W63/W64/W77: Netz in Arbeit – gesetzte Ecken stehen fest, der Rest läuft als
    // gestrichelte Vorschau bis zum Zeiger bzw. exakt auf das Magnet-Ziel.
    if (sr.netDraft) {
      const draft = sr.netDraft;
      const ref = draft.corners.length ? draft.corners[draft.corners.length - 1] : draft.anchor;
      const hover = sr.netHover;
      const magnetHit = hover && Math.hypot(hover.x - ref.x, hover.y - ref.y) > 0.01 ? { x: hover.x, y: hover.y } : null;
      const pathOpts: NetPathOptions = {
        preferDir: draft.corners.length === 0 ? draft.preferDir : undefined,
        flipBend: draft.flipBend,
        obstacles: getNetObstacles(doc),
      };
      const preview = previewNetPath(draft.anchor, draft.corners, magnetHit ?? { x: cursor.x, y: cursor.y }, pathOpts);
      const zLine = 2 / Math.max(view.zoom, 0.3);
      // fester Teil (Anker + gesetzte Ecken)
      ctx.strokeStyle = canvasColor("--wire-sel"); ctx.lineWidth = zLine;
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
      ctx.fillStyle = canvasColor("--wire-sel");
      for (const p of [draft.anchor, ...draft.corners]) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 3 / Math.max(view.zoom, 0.3), 0, Math.PI * 2); ctx.fill();
      }
      // Magnet-Ziel hervorheben, damit klar ist, wo angeschlossen wird
      if (magnetHit && hover) {
        const r = hover.kind === "pin" ? 7 : 6;
        ctx.save();
        ctx.strokeStyle = hover.kind === "wire" ? canvasColor("--teal") : canvasColor("--ok");
        ctx.lineWidth = 1.8 / Math.max(view.zoom, 0.3);
        ctx.beginPath(); ctx.arc(hover.x, hover.y, r / Math.max(view.zoom, 0.3), 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = canvasColor("--ink-2");
        ctx.font = `${11 / Math.max(view.zoom, 0.5)}px ui-monospace, monospace`;
        ctx.fillText(hover.label, hover.x + 12 / Math.max(view.zoom, 0.5), hover.y - 8 / Math.max(view.zoom, 0.5));
        ctx.restore();
      }
    }

    if (st.tool === "place" && st.placingPartId || useHud.getState().dragPart) {
      const partId = st.placingPartId ?? useHud.getState().dragPart;
      const part = PART_MAP[partId ?? ""];
      if (part) {
        // W13/W75: Ghost zeigt die aktuelle Drehung & Spiegelung (R / ⇧R / M)
        ctx.save();
        ctx.globalAlpha = 0.65;
        drawInstance(
          ctx,
          {
            id: "ghost",
            partId: part.id,
            x: cursor.x,
            y: cursor.y,
            rot: st.placingRot ?? 0,
            mirror: st.placingMirror ?? false,
            label: part.ref + "?",
            params: {},
          },
          false,
          view.zoom,
          null,
        );
        ctx.restore();
        // Snap indicator
        const snapped = snap(cursor);
        if (Math.abs(snapped.x - cursor.x) > 0.1 || Math.abs(snapped.y - cursor.y) > 0.1) {
          ctx.save();
          ctx.fillStyle = "rgba(91,140,255,0.3)";
          ctx.strokeStyle = canvasColor("--accent");
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
      // W86/W93: Vorschau-Ghost rastet wie beim Klick per Magnet auf der nächsten
      // Leitung / dem nächsten Pin ein und zeigt die Messspitze (anchorX/anchorY)
      // plus das Kästchen im Rasterabstand (+40, -40).
      const target = findNetTarget(doc, cursor, 24 / Math.max(view.zoom, 0.25));
      const ax = target ? Math.round(target.x / GRID) * GRID : cursor.x;
      const ay = target ? Math.round(target.y / GRID) * GRID : cursor.y;
      const gNet = nearestNetName({ x: ax, y: ay }, 24);
      const nextNum = doc.probes.filter((p) => p.kind === st.placingProbeKind).length + 1;
      const ghostName = `${st.placingProbeKind.charAt(0).toUpperCase()}${nextNum}`;
      ctx.save();
      ctx.globalAlpha = 0.85;
      drawProbe(
        ctx,
        {
          id: "ghost",
          kind: st.placingProbeKind,
          name: ghostName,
          x: ax + 40,
          y: ay - 40,
          anchorX: ax,
          anchorY: ay,
          offsetX: 40,
          offsetY: -40,
          leader: "arrow",
          net: gNet ?? undefined,
          show: { vdc: true, idc: true, power: true },
        } as MeasurementProbe,
        false,
        view.zoom,
        live,
        netResult,
        netCurrentMap,
      );
      ctx.restore();
      if (gNet) {
        ctx.save();
        ctx.strokeStyle = canvasColor("--teal");
        ctx.lineWidth = 1.6 / Math.max(view.zoom, 0.3);
        ctx.beginPath();
        ctx.arc(ax, ay, 7 / Math.max(view.zoom, 0.3), 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // W91: Live-Vorschau beim Platzieren eines Netznamens (label) oder einer Notiz (text)
    if ((st.tool === "label" || st.tool === "text") && !editing) {
      ctx.save();
      ctx.globalAlpha = 0.78;
      if (st.tool === "label") {
        const target = findNetTarget(doc, cursor, 24 / Math.max(view.zoom, 0.25));
        const lx = target ? Math.round(target.x / GRID) * GRID : cursor.x;
        const ly = target ? Math.round(target.y / GRID) * GRID : cursor.y;
        const previewTxt = "NETZ…";
        ctx.font = "600 11px ui-sans-serif, system-ui";
        const tw = ctx.measureText(previewTxt).width;
        ctx.fillStyle = canvasColor("--surface-2");
        roundRect(ctx, lx + 8, ly - 20, tw + 12, 16, 4);
        ctx.fill();
        ctx.strokeStyle = canvasColor("--wire-sel");
        ctx.lineWidth = 1.4 / Math.max(view.zoom, 0.3);
        ctx.stroke();
        ctx.fillStyle = canvasColor("--wire-sel");
        ctx.textAlign = "left";
        ctx.fillText(previewTxt, lx + 14, ly - 8);
        ctx.beginPath();
        ctx.arc(lx, ly, 3.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const cardX = cursor.x;
        const cardY = cursor.y - 18;
        const cardW = 136;
        const cardH = 42;
        ctx.fillStyle = canvasColor("--surface");
        roundRect(ctx, cardX, cardY, cardW, cardH, 6);
        ctx.fill();
        ctx.fillStyle = canvasColor("--wire-sel");
        ctx.fillRect(cardX, cardY + 3, 3.5, cardH - 6);
        ctx.strokeStyle = canvasColor("--wire-sel");
        ctx.lineWidth = 1.3 / Math.max(view.zoom, 0.35);
        roundRect(ctx, cardX, cardY, cardW, cardH, 6);
        ctx.stroke();
        ctx.font = "700 8px ui-monospace, monospace";
        ctx.fillStyle = canvasColor("--wire-sel");
        ctx.textAlign = "left";
        ctx.fillText("NOTIZ", cardX + 10, cardY + 11);
        ctx.font = "500 11px ui-sans-serif, system-ui";
        ctx.fillStyle = canvasColor("--ink");
        ctx.fillText("Notiz platzieren …", cardX + 10, cardY + 30);
      }
      ctx.restore();
    }

    // ── S2.2: Problem-Marker (pulsierender Ring + Netzname, Welt-Raum) ──
    if (st.spotlight) {
      const sp = st.spotlight;
      const pulse = 0.5 + 0.5 * Math.sin(now / 280);
      const r = (14 + 7 * pulse) / Math.max(view.zoom, 0.3);
      ctx.save();
      ctx.strokeStyle = canvasColor("--err");
      ctx.globalAlpha = 0.55 + 0.45 * pulse;
      ctx.lineWidth = 2.4 / Math.max(view.zoom, 0.3);
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = "700 11px ui-monospace, monospace";
      ctx.textAlign = "center";
      const label = "⚠ " + sp.label;
      const tw = ctx.measureText(label).width + 12;
      ctx.fillStyle = canvasColor("--err");
      roundRect(ctx, sp.x - tw / 2, sp.y + r + 6, tw, 18, 5);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(label, sp.x, sp.y + r + 19);
      ctx.restore();
    }

    if (sr.marquee) {
      const m = sr.marquee;
      ctx.fillStyle = "color-mix(in srgb, " + canvasColor("--wire-sel") + " 12%, transparent)";
      ctx.strokeStyle = canvasColor("--wire-sel");
      ctx.lineWidth = 1.2 / view.zoom;
      ctx.setLineDash([6 / view.zoom, 4 / view.zoom]);
      ctx.fillRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
      ctx.strokeRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
      ctx.setLineDash([]);
    }

    ctx.restore();

    // ── Runde 11: Lineale (Screen-Raum, Ref-2-Chrome) ──
    if (st.showRulers) {
      const R = 16;
      ctx.fillStyle = canvasColor("--surface");
      ctx.fillRect(0, 0, w, R);
      ctx.fillRect(0, 0, R, h);
      ctx.strokeStyle = canvasColor("--hairline");
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
      ctx.fillStyle = canvasColor("--ink-3");
      ctx.strokeStyle = canvasColor("--ink-3");
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
      ctx.fillStyle = canvasColor("--surface");
      ctx.fillRect(0, 0, R, R);
      ctx.strokeStyle = canvasColor("--hairline");
      ctx.strokeRect(0.5, 0.5, R - 1, R - 1);
    }
  }, [cursor, snap, editing]);

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
    const lbl = hitTestLabel(st.doc, world);
    if (lbl) {
      return { kind: "label", id: lbl.id, net: lbl.name };
    }
    const note = hitTestNote(st.doc, world);
    if (note) {
      return { kind: "note", id: note.id, net: null };
    }
    const inst = hitTestInstance(st.doc, world.x, world.y) ?? findInstanceByValueLabel(st.doc, world);
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

  // Touch handling state (W100: unterstützt alle Touch-Geräte inkl. iPad/Tablet/Touch-Notebook)
  const touchState = useRef<{
    lastDist: number;
    lastMid: Pt | null;
    longPressTimer: ReturnType<typeof setTimeout> | null;
    startPt: Pt | null;
    startScreen: Pt | null;
    pinching?: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const isTouch = e.pointerType === "touch";
    if (isTouch) {
      lastTouchTimeRef.current = performance.now();
      if (!isTouchActive) setIsTouchActive(true);
    } else if (e.pointerType === "mouse" && performance.now() - lastTouchTimeRef.current > 600) {
      if (isTouchActive) setIsTouchActive(false);
    }

    // W100: Während einer aktiven 2-Finger-Pinch-Geste keine 1-Finger-Klicks ausführen
    if (touchState.current?.pinching) return;

    const st = useEditor.getState();
    if (st.spotlight) st.clearSpotlight();
    const world = toWorld(e.clientX, e.clientY);
    const sp = snap(world);
    const sr = stateRef.current;
    sr.dragStart = world; sr.moved = false; sr.duplicated = false;
    sr.lastMouse = { x: e.clientX, y: e.clientY };

    if (ctxMenu) { setCtxMenu(null); return; }

    // W100: Long-Press (500 ms ohne Bewegung > 10 px) öffnet auf jedem Touch-Gerät
    // das Kontextmenü und bricht ein evtl. gestartetes Ziehen/Schwenken sauber ab.
    if (isTouch) {
      if (touchState.current?.longPressTimer) {
        clearTimeout(touchState.current.longPressTimer);
      }
      const clientX = e.clientX;
      const clientY = e.clientY;
      touchState.current = {
        startPt: world,
        startScreen: { x: clientX, y: clientY },
        lastDist: 0,
        lastMid: { x: clientX, y: clientY },
        pinching: false,
        longPressTimer: setTimeout(() => {
          if (touchState.current?.pinching) return;
          sr.dragging = false;
          sr.panning = false;
          sr.marquee = null;
          (sr as any).wireSegDrag = null;
          (sr as any).wirePointDrag = null;
          (sr as any).probeAnchorDrag = null;
          useEditor.getState().endGesture();
          const target = getTargetAt(world);
          setCtxMenu({ x: clientX, y: clientY, wx: world.x, wy: world.y, target });
          try { (navigator as any).vibrate?.(20); } catch {}
        }, 500),
      };
    }

    // W91: Bei aktivem Label-/Notiz-Werkzeug sofort das Eingabefeld öffnen,
    // OHNE setPointerCapture auf dem Canvas (damit das Loslassen der Maustaste
    // dem neuen <input> nicht sofort wieder den Fokus per onBlur entzieht!).
    if (e.button === 0 && (st.tool === "label" || st.tool === "text")) {
      e.preventDefault();
      e.stopPropagation();
      const rect = canvasRef.current?.getBoundingClientRect();
      editingDone.current = false;
      editingOpenedAt.current = performance.now();
      if (st.tool === "label") {
        const existingLbl = hitTestLabel(st.doc, world);
        if (existingLbl) {
          setEditing({
            kind: "label",
            itemId: existingLbl.id,
            x: existingLbl.x,
            y: existingLbl.y,
            sx: e.clientX - (rect?.left ?? 0),
            sy: e.clientY - (rect?.top ?? 0),
            initial: existingLbl.name,
          });
          return;
        }
        const target = findNetTarget(st.doc, world, 24 / Math.max(st.view.zoom, 0.25));
        const lx = target ? Math.round(target.x / GRID) * GRID : sp.x;
        const ly = target ? Math.round(target.y / GRID) * GRID : sp.y;
        setEditing({
          kind: "label",
          x: lx,
          y: ly,
          sx: e.clientX - (rect?.left ?? 0),
          sy: e.clientY - (rect?.top ?? 0),
          initial: "",
        });
      } else {
        const existingNote = hitTestNote(st.doc, world);
        if (existingNote) {
          setEditing({
            kind: "text",
            itemId: existingNote.id,
            x: existingNote.x,
            y: existingNote.y,
            sx: e.clientX - (rect?.left ?? 0),
            sy: e.clientY - (rect?.top ?? 0),
            initial: existingNote.text,
          });
          return;
        }
        setEditing({
          kind: "text",
          x: sp.x,
          y: sp.y,
          sx: e.clientX - (rect?.left ?? 0),
          sy: e.clientY - (rect?.top ?? 0),
          initial: "",
        });
      }
      return;
    }

    if (e.detail < 2) {
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {}
    }

    // W63/W64/W77/W87/W101: Netzmodus wie in Multisim – hat Vorrang, solange aktiv
    // gezeichnet wird (`sr.netDraft`) oder das Stift-Werkzeug (`wire`) aktiv ist.
    // Im `select`-Modus (`sr.netDraft === null`) darf ein Klick auf eine bestehende
    // Probe (Kästchen oder Messspitze) oder auf einen ausgewählten Leitungsgriff
    // jedoch NICHT versehentlich ein neues Netz starten!
    const magnet = (isTouch ? 22 : 14) / Math.max(st.view.zoom, 0.25);
    const blockingSelectHit =
      st.tool === "select" &&
      !sr.netDraft &&
      Boolean(
        hitTestProbeAnchor(st.doc, world, isTouch) ||
          hitTestProbe(st.doc, world, isTouch ? 24 : undefined) ||
          hitWireHandle(st.doc, world, st.view.zoom, true, isTouch ? 20 : 12),
      );
    if (
      e.button === 0 &&
      !blockingSelectHit &&
      st.tool !== "junction" &&
      st.tool !== "erase" &&
      st.tool !== "label" &&
      st.tool !== "text" &&
      st.tool !== "place" &&
      !st.tool.startsWith("probe")
    ) {
      // Beim 2. Klick eines Doppelklicks auf eine Leitung nicht schon hier einen
      // Punkt setzen, sondern onDoubleClick den Abzweig/Abschluss behandeln lassen.
      if (e.detail >= 2 && sr.netDraft) return;
      // W133: Im Auswahlmodus (ohne laufendes Netz) nur direkt am Pin-Anschluss
      // (7 px) ein Netz starten, damit man Bauteile überall am Gehäuse sofort
      // anklicken, gedrückt halten und ziehen kann!
      const effectiveMagnet =
        sr.netDraft || st.tool === "wire"
          ? magnet
          : (isTouch ? 12 : 7) / Math.max(st.view.zoom, 0.25);
      const res = netClick(st.doc, sr.netDraft, world, sp, {
        magnet: effectiveMagnet,
        allowStartOnEmpty: st.tool === "wire",
        startOnWire: st.tool === "wire",
        obstacles: getNetObstacles(st.doc),
      });
      if (res) {
        if (res.kind === "start") {
          (sr as any).netStartScreen = { x: e.clientX, y: e.clientY };
          syncNetDraft(res.draft);
          if (canvasRef.current) canvasRef.current.style.cursor = PEN_CURSOR;
          st.log("info", `Netz von (${Math.round(res.draft.anchor.x)}, ${Math.round(res.draft.anchor.y)}): Ziehen & Loslassen oder Klick setzt Ecken, Klick auf Pin/Leitung verbindet`);
        } else if (res.kind === "corner") {
          (sr as any).netStartScreen = null;
          syncNetDraft(res.draft);
          st.log("info", `Eckpunkt gesetzt (${Math.round(sp.x)}, ${Math.round(sp.y)}) – weiter zeichnen, Doppelklick beendet, Esc bricht ab`);
        } else {
          (sr as any).netStartScreen = null;
          st.addWire({ id: "w_" + Math.random().toString(36).slice(2, 9), points: res.points });
          st.log("ok", `Netz angeschlossen – ${res.target.label}`);
          syncNetDraft(null);
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

    // W77/W78/W87/W101: Leitungs-Griffe und Probe-Messspitze im Auswahlmodus
    if (st.tool === "select" && e.button === 0 && e.detail < 2) {
      // W87: Messspitze (Anker) einer Probe direkt greifbar – auch ohne dass
      // die Probe vorher ausgewählt sein musste!
      const anchorProbe = hitTestProbeAnchor(st.doc, world, isTouch);
      if (anchorProbe) {
        if (!st.selection.includes(anchorProbe.id)) st.setSelection([anchorProbe.id]);
        st.beginGesture();
        (sr as any).probeAnchorDrag = { probeId: anchorProbe.id };
        return;
      }
      const handle = hitWireHandle(st.doc, world, st.view.zoom, true, isTouch ? 20 : 12);
      if (handle) {
        const segWire = st.doc.wires.find((x) => x.id === handle.wireId);
        if (segWire) {
          st.beginGesture();
          if (handle.isMid && handle.segIdx !== undefined) {
            // W78: Ziehen am mittleren +-Griff zieht das Segment streng orthogonal
            // als 90°-Stufe heraus (statt ein schräges Dreieck zu spleißen).
            (sr as any).wireSegDrag = {
              wireId: handle.wireId,
              segIdx: handle.segIdx,
              orig: segWire.points.map((p) => ({ x: p.x, y: p.y })),
              applied: { dx: 0, dy: 0 },
            };
            return;
          }
          (sr as any).wirePointDrag = {
            wireId: handle.wireId,
            pointIdx: handle.pointIdx,
            orig: segWire.points.map((p) => ({ x: p.x, y: p.y })),
          };
          return;
        }
      }
      // Also allow dragging any wire corner handle even if wire not selected – auto-select
      const anyHandle = hitWireHandle(st.doc, world, st.view.zoom, false, isTouch ? 20 : 12);
      if (anyHandle && !anyHandle.isMid) {
        const segWire = st.doc.wires.find((x) => x.id === anyHandle.wireId);
        if (segWire) {
          if (!st.selection.includes(anyHandle.wireId)) st.setSelection([anyHandle.wireId]);
          st.beginGesture();
          (sr as any).wirePointDrag = {
            wireId: anyHandle.wireId,
            pointIdx: anyHandle.pointIdx,
            orig: segWire.points.map((p) => ({ x: p.x, y: p.y })),
          };
          return;
        }
      }
    }

    // Space+drag or middle button or pan tool or Alt -> panning
    if (e.button === 1 || st.tool === "pan" || e.altKey || spaceDown.current) {
      sr.panning = true; return;
    }

    if (e.button === 2) {
      if (sr.netDraft) {
        syncNetDraft(null);
        return;
      }
      const target = getTargetAt(world);
      if (target.kind !== "empty" && !st.selection.includes(target.id)) {
        st.setSelection([target.id]);
      }
      setCtxMenu({ x: e.clientX, y: e.clientY, wx: world.x, wy: world.y, target });
      return;
    }

    // W75/W76: Bauteil platzieren – übernimmt Drehung/Spiegelung der Vorschau,
    // trennt durchgehende Leitungen automatisch auf (In-Line-Split) und verbindet
    // nahe Pins orthogonal in einem einzigen Undo-Schritt.
    if (st.tool === "place" && st.placingPartId) {
      if (e.button === 0) {
        st.addInstance(st.placingPartId, sp.x, sp.y, {
          rot: st.placingRot,
          mirror: st.placingMirror,
          autoWire: true,
        });
        if (!e.shiftKey) st.setPlacing(null);
      } else {
        st.setPlacing(null);
      }
      return;
    }

    if (st.tool.startsWith("probe") && st.placingProbeKind) {
      if (e.button === 0) {
        // W86: Exakt dieselbe Magnet-Fang-Logik wie in der Ghost-Vorschau nutzen;
        // addMeasurementProbe löst das Netz (inkl. Segment-Fußpunkt) bereits selbst auf.
        const target = findNetTarget(st.doc, world, 24 / Math.max(st.view.zoom, 0.25));
        const tx = target ? Math.round(target.x / GRID) * GRID : sp.x;
        const ty = target ? Math.round(target.y / GRID) * GRID : sp.y;
        st.addMeasurementProbe(st.placingProbeKind, tx, ty);
        if (!e.shiftKey) st.setPlacingProbe(null);
      } else {
        st.setPlacingProbe(null);
      }
      return;
    }

    if (st.tool === "junction") {
      st.toggleJunction(world.x, world.y);
      return;
    }

    const probeHit = hitTestProbe(st.doc, world);
    if (probeHit && st.tool !== "erase") {
      if (e.shiftKey || e.metaKey || e.ctrlKey) st.setSelection([...new Set([...st.selection, probeHit.id])]);
      else if (!st.selection.includes(probeHit.id)) st.setSelection([probeHit.id]);
      if (e.detail >= 2) return;
      st.beginGesture();
      sr.dragging = true;
      return;
    }

    const labelHit = hitTestLabel(st.doc, world);
    const noteHit = !labelHit ? hitTestNote(st.doc, world) : null;
    const hit = hitTestInstance(st.doc, world.x, world.y) ?? findInstanceByValueLabel(st.doc, world);

    if (st.tool === "erase") {
      if (hit) { st.setSelection([hit.id]); st.deleteSelection(); }
      else if (labelHit) { st.setSelection([labelHit.id]); st.deleteSelection(); }
      else if (noteHit) { st.setSelection([noteHit.id]); st.deleteSelection(); }
      else {
        const wireHit = hitWire(st.doc, world);
        if (wireHit) { st.setSelection([wireHit]); st.deleteSelection(); }
        else if (probeHit) { st.setSelection([probeHit.id]); st.deleteSelection(); }
      }
      return;
    }

    if (st.tool === "probe") {
      const netName = nearestNetName(world);
      if (netName) { st.toggleProbe(netName); st.log("info", `Sonde ${netName}`); }
      return;
    }

    if (labelHit || noteHit) {
      const itemId = (labelHit ?? noteHit)!.id;
      if (e.shiftKey || e.metaKey || e.ctrlKey) {
        const sel = new Set(st.selection);
        if (sel.has(itemId)) sel.delete(itemId); else sel.add(itemId);
        st.setSelection([...sel]);
      } else if (!st.selection.includes(itemId)) {
        st.setSelection([itemId]);
      }
      if (e.detail >= 2) return;
      st.beginGesture();
      sr.dragging = true;
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
      if (e.detail >= 2) return;
      st.beginGesture();
      sr.dragging = true;
    } else {
      const wireHit = hitWire(st.doc, world, isTouch ? 12 : 6);
      if (wireHit) {
        if (e.shiftKey || e.metaKey || e.ctrlKey) st.setSelection([...new Set([...st.selection, wireHit])]);
        else if (!st.selection.includes(wireHit)) st.setSelection([wireHit]);
        // W54/W78: Ein Segment lässt sich senkrecht verschieben (ohne Pin-Abriss!);
        // Alt zieht wie bisher die ganze Auswahl mit. Bei Doppelklick (e.detail >= 2)
        // kein Segment-Ziehen starten, damit onDoubleClick einen Abzweig startet.
        if (e.detail >= 2) return;
        const seg = e.altKey ? null : hitWireSegment(st.doc, world.x, world.y, isTouch ? 14 : 8);
        const multi = st.selection.length > 1 && st.selection.some((id) => st.doc.instances.some((i) => i.id === id));
        if (seg && !multi) {
          const segWire = st.doc.wires.find((x) => x.id === seg.wireId);
          if (segWire) {
            st.beginGesture();
            (sr as any).wireSegDrag = {
              wireId: seg.wireId,
              segIdx: seg.segIdx,
              orig: segWire.points.map((p) => ({ x: p.x, y: p.y })),
              applied: { dx: 0, dy: 0 },
            };
            return;
          }
        }
        st.beginGesture();
        sr.dragging = true;
      } else {
        if (!e.shiftKey && !e.metaKey && !e.ctrlKey) st.setSelection([]);
        // W100 (pan_on_touch): Mit einem Finger auf freiem Hintergrund schwenkt
        // der Schaltplan (Pan); mit der Maus bleibt es wie gewohnt der Auswahlrahmen (Marquee).
        if (isTouch) {
          sr.panning = true;
        } else {
          sr.marquee = { x0: world.x, y0: world.y, x1: world.x, y1: world.y };
        }
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
        const main0 = inst0 ? PART_MAP[inst0.partId]?.params[0] : undefined;
        const key = main0?.key;
        if (inst0 && key && main0?.type === "text") {
          st.commit((d) => {
            const ins = d.instances.find((i) => i.id === cur.instId);
            if (ins) ins.params[key] = clean;
          });
          st.log("ok", `${inst0.label} = „${clean}“`);
          return;
        }
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
        if (cur.itemId) {
          st.updateLabel(cur.itemId, clean);
          st.log("ok", `Netzname geändert in „${clean}“`);
        } else {
          st.commit((d) => d.labels.push({ id: "l_" + Math.random().toString(36).slice(2, 8), x: cur.x, y: cur.y, name: clean }));
          st.log("ok", `Netzname „${clean}“`);
        }
      } else {
        if (cur.itemId) {
          st.updateNote(cur.itemId, clean);
          st.log("ok", "Notiz aktualisiert");
        } else {
          st.commit((d) => d.notes.push({ id: "n_" + Math.random().toString(36).slice(2, 8), x: cur.x, y: cur.y, text: clean }));
          st.log("ok", "Notiz");
        }
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const isTouch = e.pointerType === "touch";
    if (isTouch) {
      lastTouchTimeRef.current = performance.now();
    } else if (
      e.pointerType === "mouse" &&
      (e.movementX !== 0 || e.movementY !== 0) &&
      performance.now() - lastTouchTimeRef.current > 600 &&
      isTouchActive
    ) {
      setIsTouchActive(false);
    }

    if (touchState.current?.pinching) return;

    const st = useEditor.getState();
    const world = toWorld(e.clientX, e.clientY);
    const sp = snap(world);
    const sr = stateRef.current;
    setCursor(sp); useHud.setState({ cursor: sp });

    // Track hovered wire handle for delightful UX – show larger handle + tooltip
    if (st.tool === "select" && !(sr as any).wirePointDrag) {
      const hovered =
        hitWireHandle(st.doc, world, st.view.zoom, true, isTouch ? 20 : 12) ||
        hitWireHandle(st.doc, world, st.view.zoom, false, isTouch ? 20 : 12);
      const prev = (sr as any)._hoveredHandle;
      if ((hovered?.wireId !== prev?.wireId) || (hovered?.pointIdx !== prev?.pointIdx) || (hovered?.isMid !== prev?.isMid)) {
        (sr as any)._hoveredHandle = hovered;
      }
      const canvas = canvasRef.current;
      if (canvas) {
        if (hovered) {
          canvas.style.cursor = hovered.isMid ? "copy" : "grab";
        } else if (sr.dragging) {
          canvas.style.cursor = "grabbing";
        }
      }
    } else if ((sr as any)._hoveredHandle) {
      (sr as any)._hoveredHandle = null;
    }

    // Clear long press if moved > 10 screen px (or > 10 world units)
    if (touchState.current?.longPressTimer) {
      const scrDist = touchState.current.startScreen
        ? Math.hypot(e.clientX - touchState.current.startScreen.x, e.clientY - touchState.current.startScreen.y)
        : 0;
      const worldDist = touchState.current.startPt
        ? Math.hypot(world.x - touchState.current.startPt.x, world.y - touchState.current.startPt.y)
        : 0;
      if (scrDist > 10 || worldDist > 10) {
        clearTimeout(touchState.current.longPressTimer);
        touchState.current.longPressTimer = null;
      }
    }

    if (sr.panning) {
      const dx = (e.clientX - (sr.lastMouse.x || e.clientX)) / st.view.zoom;
      const dy = (e.clientY - (sr.lastMouse.y || e.clientY)) / st.view.zoom;
      if (Math.hypot(e.clientX - (sr.lastMouse.x || e.clientX), e.clientY - (sr.lastMouse.y || e.clientY)) > 2) {
        sr.moved = true;
      }
      st.setView({ x: st.view.x - dx, y: st.view.y - dy });
      sr.lastMouse = { x: e.clientX, y: e.clientY };
      if (isTouch) return;
    }
    sr.lastMouse = { x: e.clientX, y: e.clientY };

    // W54/W83/W98a: Segment verschieben – senkrecht zur Segmentrichtung, die neue
    // Segmentposition rastet direkt auf die Rasterlinie sp.y / sp.x (GRID=10) ein.
    // Während des Ziehens einer Leitung darf NIEMALS der Stift-Cursor erscheinen!
    if ((sr as any).wireSegDrag) {
      sr.netHover = null;
      const seg = (sr as any).wireSegDrag as { wireId: string; segIdx: number; orig: Array<{ x: number; y: number }>; applied: { dx: number; dy: number } };
      const sa = seg.orig[seg.segIdx];
      const sb = seg.orig[seg.segIdx + 1];
      const horizontal = Math.abs(sb.x - sa.x) >= Math.abs(sb.y - sa.y);
      if (canvasRef.current) {
        canvasRef.current.style.cursor = horizontal ? "ns-resize" : "ew-resize";
      }
      let dx = 0;
      let dy = 0;
      if (horizontal) dy = sp.y - sa.y;
      else dx = sp.x - sa.x;
      if (dx !== seg.applied.dx || dy !== seg.applied.dy) {
        st.setWireSegmentOffset(seg.wireId, seg.segIdx, seg.orig, dx, dy);
        seg.applied = { dx, dy };
        sr.moved = true;
      }
      return;
    }

    // W78/W98a: Eck- oder Endpunkt einer Leitung streng orthogonal verschieben
    if ((sr as any).wirePointDrag) {
      sr.netHover = null;
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
      const { wireId, pointIdx, orig } = (sr as any).wirePointDrag as {
        wireId: string;
        pointIdx: number;
        orig: Array<{ x: number; y: number }>;
      };
      // Alignment guides: find nearby pins or other wire points aligned horizontally/vertically
      let guideX: number | null = null;
      let guideY: number | null = null;
      const threshold = 10;
      try {
        const doc = st.doc;
        for (const inst of doc.instances) {
          const part = (PART_MAP as any)[inst.partId];
          if (!part) continue;
          for (let idx = 0; idx < part.pins.length; idx++) {
            const p = pinPosition(inst, idx);
            if (Math.abs(p.x - sp.x) < threshold) guideX = Math.round(p.x / GRID) * GRID;
            if (Math.abs(p.y - sp.y) < threshold) guideY = Math.round(p.y / GRID) * GRID;
          }
        }
        for (const w of doc.wires) {
          if (w.id === wireId) continue;
          for (const pt of w.points) {
            if (Math.abs(pt.x - sp.x) < threshold) guideX = Math.round(pt.x / GRID) * GRID;
            if (Math.abs(pt.y - sp.y) < threshold) guideY = Math.round(pt.y / GRID) * GRID;
          }
        }
      } catch {}
      const finalPt = { x: guideX !== null ? guideX : sp.x, y: guideY !== null ? guideY : sp.y };
      (sr as any)._alignGuides = { x: guideX, y: guideY };
      st.setWireCornerPosition(wireId, pointIdx, orig, finalPt);
      sr.moved = true;
      (sr as any)._wasDraggingHandle = true;
      const dragOrig = (sr as any)._dragOrig;
      if (dragOrig) {
        const dx = finalPt.x - dragOrig.x;
        const dy = finalPt.y - dragOrig.y;
        const len = Math.hypot(dx, dy);
        setTooltip({
          x: e.clientX - (wrapRef.current?.getBoundingClientRect().left ?? 0) + 16,
          y: e.clientY - (wrapRef.current?.getBoundingClientRect().top ?? 0) + 16,
          lines: [
            `Ecke ${pointIdx}: ${finalPt.x.toFixed(0)}, ${finalPt.y.toFixed(0)}`,
            `Δ ${dx >= 0 ? "+" : ""}${dx.toFixed(0)}, ${dy >= 0 ? "+" : ""}${dy.toFixed(0)} • ${len.toFixed(0)} px (90° orthogonal)`,
            guideX !== null || guideY !== null
              ? `Ausrichtung an ${guideX !== null ? "X" : ""}${guideX !== null && guideY !== null ? "+" : ""}${guideY !== null ? "Y" : ""}`
              : "",
          ].filter(Boolean),
        });
      } else {
        (sr as any)._dragOrig = { ...finalPt };
      }
      return;
    }
    if ((sr as any).probeAnchorDrag) {
      sr.netHover = null;
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
      const { probeId } = (sr as any).probeAnchorDrag;
      // W87: Messspitze (Anker) rastet beim Ziehen per Magnet auf nahen Pins,
      // Verbindungspunkten oder Leitungssegmenten ein (sonst auf dem Raster sp).
      const target = findNetTarget(st.doc, world, 16 / Math.max(st.view.zoom, 0.25));
      const ax = target ? Math.round(target.x / GRID) * GRID : sp.x;
      const ay = target ? Math.round(target.y / GRID) * GRID : sp.y;
      st.updateMeasurementProbe(probeId, { anchorX: ax, anchorY: ay });
      sr.moved = true;
      return;
    }

    if (sr.dragging && st.selection.length) {
      sr.netHover = null;
      if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
      if ((e.ctrlKey || e.metaKey) && !sr.duplicated && !sr.moved) {
        st.duplicateSelection();
        sr.duplicated = true;
      }
      const selIds = new Set(st.selection);
      let dx = sp.x - Math.round(sr.dragStart.x / GRID) * GRID;
      let dy = sp.y - Math.round(sr.dragStart.y / GRID) * GRID;

      // W83: Falls ein gezogenes Bauteil (oder eine gezogene Probe) aus einem
      // Altstand noch auf einer krummen Koordinate saß, rastet es beim Ziehen
      // sofort exakt auf ein Vielfaches von GRID = 10 ein!
      const anchorInst = st.doc.instances.find((i) => selIds.has(i.id));
      const anchorProbe = !anchorInst ? st.doc.probes.find((p) => selIds.has(p.id)) : undefined;
      if (anchorInst && (dx !== 0 || dy !== 0)) {
        dx = Math.round((anchorInst.x + dx) / GRID) * GRID - anchorInst.x;
        dy = Math.round((anchorInst.y + dy) / GRID) * GRID - anchorInst.y;
      } else if (anchorProbe && (dx !== 0 || dy !== 0)) {
        dx = Math.round((anchorProbe.x + dx) / GRID) * GRID - anchorProbe.x;
        dy = Math.round((anchorProbe.y + dy) / GRID) * GRID - anchorProbe.y;
      }

      // W83: Visuelle Ausrichtungslinien (_alignGuides) prüfen nur echte
      // Raster-Ursprünge (other.x / other.y) und Pin-Positionen, NIEMALS krumme
      // Grafik-Bounding-Box-Kanten, und verbiegen dx/dy niemals vom Raster weg!
      let guideX: number | null = null;
      let guideY: number | null = null;
      if (anchorInst) {
        const nextX = anchorInst.x + dx;
        const nextY = anchorInst.y + dy;
        for (const other of st.doc.instances) {
          if (selIds.has(other.id)) continue;
          if (Math.abs(other.x - nextX) < 0.5) guideX = other.x;
          if (Math.abs(other.y - nextY) < 0.5) guideY = other.y;
        }
      }
      (sr as any)._alignGuides = { x: guideX, y: guideY };

      if (dx || dy) {
        st.moveSelection(dx, dy);
        sr.dragStart = { x: Math.round(sr.dragStart.x / GRID) * GRID + dx, y: Math.round(sr.dragStart.y / GRID) * GRID + dy };
        sr.moved = true;
      }
      return;
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

    // W64/W89/W98a/W101/W133: Anschluss-Magnet nur in Modi, in denen tatsächlich Leitungen
    // gezeichnet oder Labels gesetzt werden. Im Auswahlmodus (`select` ohne `netDraft`)
    // darf der Magnet-Ring nur eng am Bauteil-Pin (`selectPinMagnet = 7px`) anspringen,
    // damit der Bauteilkörper frei zum direkten Klicken-Halten-Ziehen bleibt!
    const magnet = (isTouch ? 22 : 14) / Math.max(st.view.zoom, 0.25);
    const selectPinMagnet = (isTouch ? 12 : 7) / Math.max(st.view.zoom, 0.25);
    if (st.tool === "wire" || st.tool === "label" || Boolean(sr.netDraft)) {
      sr.netHover = findNetTarget(st.doc, world, magnet);
    } else if (st.tool === "select") {
      const rawTarget = findNetTarget(st.doc, world, selectPinMagnet);
      sr.netHover = rawTarget?.kind === "pin" ? rawTarget : null;
    } else {
      sr.netHover = null;
    }

    // W65/W89/W98a: Saubere Cursor-Steuerung pro Werkzeug.
    // - Der Radiergummi zeigt IMMER das Radiergummi-Icon (ERASER_CURSOR).
    // - Beim Überfahren oder Verschieben einer Leitung im Auswahlmodus erscheint
    //   NIEMALS der Stift (PEN_CURSOR), sondern der Segment-Verschiebe-Cursor.
    const canvasEl = canvasRef.current;
    if (canvasEl && !(sr as any)._hoveredHandle) {
      if (spaceDown.current || sr.panning) {
        canvasEl.style.cursor = "grabbing";
      } else if (st.tool === "erase") {
        canvasEl.style.cursor = ERASER_CURSOR;
      } else if (st.tool === "pan") {
        canvasEl.style.cursor = "grab";
      } else if (st.tool === "label" || st.tool === "text") {
        canvasEl.style.cursor = "text";
      } else if (
        Boolean(sr.netDraft) ||
        st.tool === "wire" ||
        (st.tool === "select" &&
          sr.netHover?.kind === "pin" &&
          !hitTestProbe(st.doc, world) &&
          !hitTestProbeAnchor(st.doc, world))
      ) {
        canvasEl.style.cursor = PEN_CURSOR;
      } else if (st.tool === "select" && !sr.dragging) {
        const hoverSeg = hitWireSegment(st.doc, world.x, world.y);
        if (hoverSeg) {
          const hw = st.doc.wires.find((x) => x.id === hoverSeg.wireId);
          const ha = hw?.points[hoverSeg.segIdx];
          const hb = hw?.points[hoverSeg.segIdx + 1];
          const isHoriz = ha && hb ? Math.abs(hb.x - ha.x) >= Math.abs(hb.y - ha.y) : true;
          canvasEl.style.cursor = isHoriz ? "ns-resize" : "ew-resize";
        } else {
          canvasEl.style.cursor = "default";
        }
      } else if (!sr.dragging) {
        canvasEl.style.cursor = "default";
      }
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

  const onPointerUp = (e: React.PointerEvent) => {
    const isTouch = e.pointerType === "touch";
    const wasPinching = Boolean(touchState.current?.pinching);
    const startScr = touchState.current?.startScreen ?? null;
    if (touchState.current?.longPressTimer) {
      clearTimeout(touchState.current.longPressTimer);
      touchState.current.longPressTimer = null;
    }
    if (!wasPinching) {
      touchState.current = null;
    }
    const st = useEditor.getState(); const sr = stateRef.current;
    const wasMoved = sr.moved;
    st.endGesture();

    // W133: Klicken, gedrückt halten und Ziehen beim Leitungszeichnen:
    // Hat der Nutzer auf einem Pin gedrückt, die Maustaste gedrückt gehalten,
    // zu einem anderen Pin/Leitung/Knoten gezogen (> 14 px) und dort losgelassen,
    // wird die Leitung sofort beim Loslassen fertig angeschlossen!
    const netStartScr = (sr as any).netStartScreen as { x: number; y: number } | null;
    (sr as any).netStartScreen = null;
    if (sr.netDraft && netStartScr && Math.hypot(e.clientX - netStartScr.x, e.clientY - netStartScr.y) > 14) {
      const worldUp = toWorld(e.clientX, e.clientY);
      const spUp = snap(worldUp);
      const magnetUp = (isTouch ? 22 : 14) / Math.max(st.view.zoom, 0.25);
      const resUp = netClick(st.doc, sr.netDraft, worldUp, spUp, {
        magnet: magnetUp,
        allowStartOnEmpty: false,
        startOnWire: true,
        obstacles: getNetObstacles(st.doc),
      });
      if (resUp && resUp.kind === "finish") {
        st.addWire({ id: makeWireId(), points: resUp.points });
        st.log("ok", `Netz angeschlossen – ${resUp.target.label}`);
        syncNetDraft(null);
        st.setTool("select");
      }
    }

    // W133: Klicken, gedrückt halten und Ziehen einer Messleitung (Oszi / FG) auf den Canvas:
    if (st.leadArmed && e.button === 0) {
      const worldUp = toWorld(e.clientX, e.clientY);
      const tgt = probeTarget(st.doc, worldUp);
      if (tgt) {
        st.connectProbeWire(st.leadArmed.instanceId, st.leadArmed.pinIndex, tgt);
        st.setLeadArmed(null);
        click("plug");
      }
    }

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
        const labelIds = st.doc.labels.filter((l) => l.x >= x0 && l.x <= x1 && l.y >= y0 && l.y <= y1).map((l) => l.id);
        const noteIds = st.doc.notes.filter((n) => n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1).map((n) => n.id);
        const newSel = [...ids, ...wireIds, ...probeIds, ...labelIds, ...noteIds];
        const cur = useEditor.getState().selection;
        const isAdditive = (window as any)._lastShift ?? false;
        if (isAdditive) st.setSelection([...new Set([...cur, ...newSel])]);
        else st.setSelection(newSel);
      }
      sr.marquee = null;
    }
    sr.dragging = false; sr.panning = false; (sr as any).wireSegDrag = null;
    if (wasMoved && st.sim.running) engine.rebuild(st.doc);

    // W100: Zuverlässiger Touch-Doppeltipp (< 320 ms, < 26 px) für Inline-Werteingabe,
    // Stromrichtungs-Umkehr, Leitungsabzweig und freies Beenden eines Netzes.
    if (isTouch && !wasPinching && !wasMoved && !ctxMenu && st.tool !== "place") {
      const now = e.timeStamp;
      const tapDist = startScr ? Math.hypot(e.clientX - startScr.x, e.clientY - startScr.y) : 0;
      if (tapDist < 12) {
        const prevTap = lastTouchTapRef.current;
        if (
          prevTap &&
          now - prevTap.time < 320 &&
          Math.hypot(e.clientX - prevTap.x, e.clientY - prevTap.y) < 26
        ) {
          lastTouchTapRef.current = null;
          onDoubleClick({
            clientX: e.clientX,
            clientY: e.clientY,
            shiftKey: e.shiftKey,
          } as React.MouseEvent);
        } else {
          lastTouchTapRef.current = { time: now, x: e.clientX, y: e.clientY };
        }
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const sr = stateRef.current;
    const st = useEditor.getState();
    const world = toWorld(e.clientX, e.clientY);
    const sp = snap(world);
    // W77: Doppelklick im freien Raum beendet das angefangene Netz an der
    // aktuellen Position (statt es zu verwerfen – verworfen wird per Esc / Rechtsklick).
    if (sr.netDraft) {
      const pts = finishNetDraft(sr.netDraft, sp, {
        preferDir: sr.netDraft.corners.length === 0 ? sr.netDraft.preferDir : undefined,
        flipBend: sr.netDraft.flipBend,
        obstacles: getNetObstacles(st.doc),
      });
      if (pts) {
        st.addWire({ id: "w_" + Math.random().toString(36).slice(2, 9), points: pts });
        st.log("ok", `Netz im freien Raum abgeschlossen (${Math.round(sp.x)}, ${Math.round(sp.y)})`);
      }
      syncNetDraft(null);
      st.setTool("select");
      return;
    }

    // W81: Doppelklick auf Netzlabel oder Textnotiz öffnet den Inline-Editor
    const lblHit = hitTestLabel(st.doc, world);
    if (lblHit) {
      const scr = toScreen({ x: lblHit.x, y: lblHit.y });
      editingDone.current = false;
      setEditing({ kind: "label", itemId: lblHit.id, x: lblHit.x, y: lblHit.y, sx: scr.x, sy: scr.y, initial: lblHit.name });
      return;
    }
    const noteHit = hitTestNote(st.doc, world);
    if (noteHit) {
      const scr = toScreen({ x: noteHit.x, y: noteHit.y });
      editingDone.current = false;
      setEditing({ kind: "text", itemId: noteHit.id, x: noteHit.x, y: noteHit.y, sx: scr.x, sy: scr.y, initial: noteHit.text });
      return;
    }

    // Double-click on wire corner handle deletes point (if >2 points)
    const handle = hitWireHandle(st.doc, world, st.view.zoom, true);
    if (handle && !handle.isMid) {
      const wire = st.doc.wires.find((w) => w.id === handle.wireId);
      if (wire && wire.points.length > 2) {
        st.commit((d) => {
          const w = d.wires.find((x) => x.id === handle.wireId);
          if (w) w.points.splice(handle.pointIdx, 1);
        });
        st.log("info", `Punkt ${handle.pointIdx} gelöscht – Leitung hat jetzt ${wire.points.length - 1} Punkte (Undo)`);
        return;
      }
    }
    const bodyHit = hitTestInstance(st.doc, world.x, world.y);
    const valueLabelHit = !bodyHit ? findInstanceByValueLabel(st.doc, world) : null;
    const hit = bodyHit ?? valueLabelHit;
    if (hit) {
      st.setSelection([hit.id]);
      const part = PART_MAP[hit.partId];
      if (part?.id === "oscilloscope") {
        useEditor.getState().openInstrument("scope", { instanceId: hit.id, title: `Oszilloskop ${hit.label}` });
        return;
      }
      if (part?.id === "funcgen") {
        useEditor.getState().openInstrument("funcgen", { instanceId: hit.id, title: `Funktionsgenerator ${hit.label}` });
        return;
      }
      const main = part?.params[0];
      // W125: Nur ein Doppelklick gezielt auf den Wert/Bezeichner unter dem Bauteil
      // (valueLabelHit) öffnet das Inline-Wertefeld; ein Doppelklick auf das Bauteil
      // selbst (bodyHit) öffnet den Inspector.
      if (valueLabelHit && main && (main.type === "number" || main.type === "text") && !e.shiftKey) {
        const scr = toScreen({ x: hit.x, y: hit.y });
        const rawVal = Number(hit.params[main.key] ?? main.def);
        const formatted = main.type === "text"
          ? String(hit.params[main.key] ?? main.def ?? "")
          : Number.isFinite(rawVal) ? formatValue(rawVal, "").trim() : String(hit.params[main.key] ?? "");
        editingDone.current = false;
        editingOpenedAt.current = performance.now();
        setEditing({
          kind: "value",
          instId: hit.id,
          x: hit.x,
          y: hit.y,
          sx: scr.x,
          sy: scr.y + 18,
          initial: formatted,
        });
      } else {
        useEditor.getState().openInstrument("inspector");
      }
    } else {
      const probe = hitTestProbe(st.doc, world) ?? hitTestProbeAnchor(st.doc, world);
      if (probe) {
        st.setSelection([probe.id]);
        // W99: Doppelklick auf eine Strom-/Leistungs-/V·A-Sonde kehrt sofort die
        // Strommessrichtung um (Shift + Doppelklick öffnet den Inspector).
        if (
          !e.shiftKey &&
          (probe.kind === "current" || probe.kind === "voltage_current" || probe.kind === "power")
        ) {
          const nextDir = probe.direction ? 0 : 1;
          st.updateMeasurementProbe(probe.id, { direction: nextDir });
          st.log("info", `Strommessrichtung von ${probe.name ?? "Sonde"} umgekehrt`);
        } else {
          useEditor.getState().openInstrument("inspector");
        }
      } else {
        // W67/W77: Doppelklick auf eine Leitung zieht von dort ein neues Netz
        // (Multisim: „Leitung abzweigen").
        const wireId = hitWire(st.doc, world);
        if (wireId) {
          const target = findNetTarget(st.doc, world, 14 / Math.max(st.view.zoom, 0.25));
          const anchor =
            target?.kind === "wire" || target?.kind === "junction"
              ? { x: target.x, y: target.y }
              : sp;
          syncNetDraft({ anchor, corners: [], flipBend: false });
          if (canvasRef.current) canvasRef.current.style.cursor = PEN_CURSOR;
          st.log("info", `Abzweig ab (${Math.round(anchor.x)}, ${Math.round(anchor.y)}) – Klick setzt Ecken, Klick auf Pin/Leitung verbindet, Doppelklick beendet, Esc bricht ab`);
          return;
        }
      }
    }
  };

  // W133: Echtes Klicken, gedrückt halten und Ziehen eines Bauteils aus
  // LibraryPalette, ComponentStrip oder DeviceBar direkt auf den Schaltplan:
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const dragPartId = useHud.getState().dragPart;
      if (!dragPartId) return;
      const el = canvasRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const st = useEditor.getState();
      const world = {
        x: (e.clientX - r.left - st.view.x) / st.view.zoom,
        y: (e.clientY - r.top - st.view.y) / st.view.zoom,
      };
      const sp = snap(world);
      setCursor(sp);
      useHud.setState({ cursor: sp });
    };
    const onUp = (e: PointerEvent) => {
      const dragPartId = useHud.getState().dragPart;
      if (!dragPartId) return;
      useHud.setState({ dragPart: null });
      const el = canvasRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
        const st = useEditor.getState();
        const world = {
          x: (e.clientX - r.left - st.view.x) / st.view.zoom,
          y: (e.clientY - r.top - st.view.y) / st.view.zoom,
        };
        const sp = snap(world);
        const newId = st.addInstance(dragPartId, sp.x, sp.y, {
          rot: st.placingRot,
          mirror: st.placingMirror,
          autoWire: true,
        });
        if (newId) st.setSelection([newId]);
        if (!e.shiftKey) st.setPlacing(null);
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [snap]);

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
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void st.saveProject(undefined, { saveAs: e.shiftKey }); }
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
      else if (e.key.toLowerCase() === "j") st.setTool("junction");
      else if (e.key === "Escape") {
        // W66: Esc verlässt jeden Modus. Die angefangene Leitung wird verworfen.
        const sr = stateRef.current;
        syncNetDraft(null);
        sr.marquee = null; (sr as any).wireSegDrag = null; (sr as any).wirePointDrag = null;
        st.endGesture();
        useEditor.getState().setLeadArmed(null);
        st.setTool("select"); st.setPlacing(null); st.setPlacingProbe(null); setCtxMenu(null);
      } else if (e.key.toLowerCase() === "v") {
        // W90: V schaltet konsistent zu A die Spannungs-Probe (Volt) ein/aus;
        // für das Auswahl-Werkzeug dient Esc.
        syncNetDraft(null);
        st.setPlacingProbe(st.placingProbeKind === "voltage" ? null : "voltage");
      } else if (e.key.toLowerCase() === "a") {
        syncNetDraft(null);
        st.setPlacingProbe(st.placingProbeKind === "current" ? null : "current");
      }
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
      else if (e.key === " ") {
        e.preventDefault();
        // W77: Während ein Netz gezeichnet wird, wendet die Leertaste die
        // Knick-Orientierung (Horizontal↔Vertikal) statt die Simulation zu starten!
        const sr = stateRef.current;
        if (sr.netDraft) {
          sr.netDraft = { ...sr.netDraft, flipBend: !sr.netDraft.flipBend };
        } else {
          if (st.sim.running) st.pauseSim(); else st.startSim();
        }
      }
      else if (e.key === "f") st.fitView();
    };
    const onKeyUp = (e: KeyboardEvent) => { (window as any)._lastShift = e.shiftKey; if (e.code === "Space") spaceDown.current = false; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp); };
  }, [syncNetDraft]);

  useEffect(() => { const t = setTimeout(() => useEditor.getState().fitView(), 120); return () => clearTimeout(t); }, []);


  const tool = useEditor((s) => s.tool);
  const placingPartId = useEditor((s) => s.placingPartId);
  const placingProbeKind = useEditor((s) => s.placingProbeKind);
  const selection = useEditor((s) => s.selection);
  const netDrawing = useHud((s) => s.netDrawing);
  const selDoc = useEditor((s) => s.doc);
  const selId0 = selection[0];
  const selInst0 = selection.length === 1 ? selDoc.instances.find((i) => i.id === selId0) : undefined;
  const selProbe0 = selection.length === 1 ? selDoc.probes.find((p) => p.id === selId0) : undefined;
  const selLabel0 = selection.length === 1 ? selDoc.labels.find((l) => l.id === selId0) : undefined;
  const selNote0 = selection.length === 1 ? selDoc.notes.find((n) => n.id === selId0) : undefined;
  const isCurrentProbe0 = Boolean(
    selProbe0 &&
      (selProbe0.kind === "current" || selProbe0.kind === "power" || selProbe0.kind === "voltage_current"),
  );
  const mainParam0 = selInst0 ? PART_MAP[selInst0.partId]?.params[0] : undefined;
  const canInlineEdit0 = Boolean((selInst0 && (mainParam0?.type === "number" || mainParam0?.type === "text")) || selLabel0 || selNote0);

  // W66: Werkzeugwechsel beendet ein angefangenes Netz – kein Zustand, der
  // unsichtbar weiterläuft, wenn der Nutzer z. B. auf „Auswahl" umschaltet.
  useEffect(() => {
    if (tool !== "wire" && tool !== "select") {
      syncNetDraft(null);
    }
  }, [tool, syncNetDraft]);
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
      {selDoc.instances.length === 0 && selDoc.wires.length === 0 && !placingPartId && !placingProbeKind && (
        <EmptyCanvas
          onPlaceResistor={() => useEditor.getState().setPlacing("resistor")}
          onOpenLibrary={() => useEditor.getState().toggleLibrary()}
          onShowShortcuts={() => setShowHelp(true)}
        />
      )}
      <canvas
        id="schematic-canvas"
        ref={canvasRef}
        className="block h-full w-full touch-none"
        aria-label="Schaltplan Zeichenfläche"
        tabIndex={0}
        style={{ cursor: tool === "pan" ? "grab" : tool === "wire" ? PEN_CURSOR : tool === "erase" ? ERASER_CURSOR : tool === "label" || tool === "text" ? "text" : "default", background: "var(--canvas)" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => {
          e.preventDefault();
          // W63: Rechtsklick bricht das Zeichnen ab (Multisim-Verhalten).
          if (stateRef.current.netDraft) {
            syncNetDraft(null);
          }
        }}
        onDragOver={(e) => {
          const types = Array.from(e.dataTransfer.types);
          if (types.includes("text/multispice-part") || types.includes("text/partId") || types.includes("Files")) {
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
          const id = e.dataTransfer.getData("text/multispice-part") || e.dataTransfer.getData("text/partId");
          useHud.setState({ dragPart: null });
          if (id && PART_MAP[id]) {
            e.preventDefault();
            const stt = useEditor.getState();
            const w = snap(toWorld(e.clientX, e.clientY));
            const newId = stt.addInstance(id, w.x, w.y, { autoWire: true });
            if (newId) stt.setSelection([newId]);
          }
        }}
        onDragLeave={() => useHud.setState({ dragPart: null })}
        onTouchStart={(e) => {
          lastTouchTimeRef.current = performance.now();
          if (!isTouchActive) setIsTouchActive(true);
          if (e.touches.length >= 2) {
            if (touchState.current?.longPressTimer) {
              clearTimeout(touchState.current.longPressTimer);
            }
            // W100: Beim Aufsetzen des 2. Fingers (Pinch-to-Zoom / 2-Finger-Pan)
            // werden laufende 1-Finger-Aktionen sofort sauber abgebrochen.
            const sr = stateRef.current;
            sr.dragging = false;
            sr.panning = false;
            sr.marquee = null;
            (sr as any).wireSegDrag = null;
            (sr as any).wirePointDrag = null;
            (sr as any).probeAnchorDrag = null;
            useEditor.getState().endGesture();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            touchState.current = {
              lastDist: dist,
              lastMid: { x: mx, y: my },
              longPressTimer: null,
              startPt: null,
              startScreen: null,
              pinching: true,
            };
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length >= 2 && touchState.current) {
            e.preventDefault();
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const lastDist = touchState.current.lastDist || dist;
            const lastMid = touchState.current.lastMid;
            const scale = dist / Math.max(lastDist, 1);
            const st = useEditor.getState();
            const zooming = Math.abs(scale - 1) > 0.004;
            const panDx = lastMid ? mx - lastMid.x : 0;
            const panDy = lastMid ? my - lastMid.y : 0;
            // R12/W100: Pinch zoomt UND der Mittelpunkt schwenkt – eine Geste, eine Bewegung.
            if (zooming || Math.hypot(panDx, panDy) > 0.5) {
              const rect = canvasRef.current?.getBoundingClientRect();
              let newZoom = st.view.zoom;
              let nx = st.view.x;
              let ny = st.view.y;
              if (zooming) {
                newZoom = Math.max(0.12, Math.min(6, st.view.zoom * scale));
                const worldMid = toWorld(mx, my);
                nx = worldMid.x - (mx - (rect?.left ?? 0)) / newZoom;
                ny = worldMid.y - (my - (rect?.top ?? 0)) / newZoom;
              }
              nx -= panDx / newZoom;
              ny -= panDy / newZoom;
              st.setView({ zoom: newZoom, x: nx, y: ny });
            }
            touchState.current.lastDist = dist;
            touchState.current.lastMid = { x: mx, y: my };
          }
        }}
        onTouchEnd={(e) => {
          if (touchState.current?.longPressTimer) {
            clearTimeout(touchState.current.longPressTimer);
            touchState.current.longPressTimer = null;
          }
          if (e.touches.length === 0) {
            touchState.current = null;
          }
        }}
      />
      {tooltip && (
        <div className="glass pointer-events-none absolute z-30 rounded-lg px-2.5 py-1.5 text-[11px] mono shadow-xl" style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}>
          {tooltip.lines.map((l, i) => (
            <div key={i} style={{ color: i === 0 ? "var(--ink-3)" : "var(--ink)" }}>{l}</div>
          ))}
          {tooltip.spark && tooltip.spark.length > 8 && <Sparkline data={tooltip.spark} />}
        </div>
      )}
      {editing && (() => {
        const editInst = editing.instId ? selDoc.instances.find((i) => i.id === editing.instId) : null;
        const editMainParam = editInst ? PART_MAP[editInst.partId]?.params[0] : undefined;
        return (
          <InlineEditor
            key={`${editing.kind}_${editing.instId ?? editing.itemId ?? `${editing.x}_${editing.y}`}`}
            editing={editing}
            badge={editing.kind === "value" ? (editInst?.label ?? "WERT") : editing.kind === "label" ? "NET" : "NOTIZ"}
            caption={editing.kind === "value" ? (editMainParam?.label ?? "Wert") : editing.kind === "label" ? "Netzname" : "Schaltplan-Notiz"}
            unit={editing.kind === "value" ? (editMainParam?.unit ?? "") : ""}
            viewport={useHud.getState().viewport}
            inputRef={editInputRef}
            openedAt={editingOpenedAt}
            onCommit={commitEditing}
            placeholder={editing.kind === "value" && editMainParam?.type === "text" ? "z. B. VCC, NET_A" : undefined}
          />
        );
      })()}
      {ctxMenu && (
        <ContextMenu
          menu={ctxMenu}
          onClose={() => setCtxMenu(null)}
          onEdit={(item) => {
            editingDone.current = false;
            editingOpenedAt.current = performance.now();
            setEditing(item);
          }}
        />
      )}
      {showHelp && <ShortcutSheet onClose={() => setShowHelp(false)} />}
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
      {/* W102: Kontextsensitive Touch-Schnellaktionsleiste (touch_only).
          Erscheint ausschließlich nach Touch-Bedienung für Aktionen, die am Desktop
          über Tastenkürzel (R, M, Leertaste, Entf, Esc) laufen. */}
      {isTouchActive &&
        (Boolean(tool === "place" && placingPartId) ||
          Boolean(tool.startsWith("probe") && placingProbeKind) ||
          netDrawing ||
          tool === "wire" ||
          selection.length > 0) && (
          <div
            className="absolute bottom-3 left-1/2 z-30 flex max-w-[calc(100vw-110px)] -translate-x-1/2 items-center gap-1.5 overflow-x-auto no-scrollbar rounded-xl border px-2 py-1.5 text-[11.5px] font-medium shadow-xl backdrop-blur-md"
            style={{
              background: "color-mix(in srgb, var(--surface) 94%, transparent)",
              borderColor: "var(--hairline-strong)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.38)",
            }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {tool === "place" && placingPartId ? (
              <>
                <button
                  type="button"
                  className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                  onClick={() => useEditor.getState().rotateSelection(1)}
                >
                  ↻ 90°
                </button>
                <button
                  type="button"
                  className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                  onClick={() => useEditor.getState().rotateSelection(-1)}
                >
                  ↺ -90°
                </button>
                <button
                  type="button"
                  className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                  onClick={() => useEditor.getState().mirrorSelection()}
                >
                  ⇆ Spiegeln
                </button>
                <button
                  type="button"
                  className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                  style={{ color: "var(--err)" }}
                  onClick={() => useEditor.getState().setPlacing(null)}
                >
                  ✕ Abbrechen
                </button>
              </>
            ) : tool.startsWith("probe") && placingProbeKind ? (
              <>
                <span className="px-1.5 text-[11px] text-dim">Leitung oder Pin antippen</span>
                <button
                  type="button"
                  className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                  onClick={() => useEditor.getState().setPlacingProbe(null)}
                >
                  ✕ Fertig
                </button>
              </>
            ) : netDrawing || tool === "wire" ? (
              <>
                {netDrawing ? (
                  <>
                    <button
                      type="button"
                      className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                      onClick={() => {
                        const sr = stateRef.current;
                        if (sr.netDraft) {
                          sr.netDraft = { ...sr.netDraft, flipBend: !sr.netDraft.flipBend };
                        }
                      }}
                    >
                      ↱ Knick wenden
                    </button>
                    <button
                      type="button"
                      className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                      style={{ color: "var(--ok)" }}
                      onClick={() => {
                        const sr = stateRef.current;
                        const st = useEditor.getState();
                        if (sr.netDraft) {
                          const pts = finishNetDraft(sr.netDraft, cursor, {
                            preferDir: sr.netDraft.corners.length === 0 ? sr.netDraft.preferDir : undefined,
                            flipBend: sr.netDraft.flipBend,
                            obstacles: getNetObstacles(st.doc),
                          });
                          if (pts) {
                            st.addWire({ id: "w_" + Math.random().toString(36).slice(2, 9), points: pts });
                          }
                          syncNetDraft(null);
                          st.setTool("select");
                        }
                      }}
                    >
                      ✓ Hier beenden
                    </button>
                  </>
                ) : (
                  <span className="px-1.5 text-[11px] text-dim">Pin oder Leitung antippen</span>
                )}
                <button
                  type="button"
                  className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                  style={{ color: "var(--err)" }}
                  onClick={() => {
                    syncNetDraft(null);
                    useEditor.getState().setTool("select");
                  }}
                >
                  ✕ Abbrechen
                </button>
              </>
            ) : (
              <>
                {!selProbe0 && (
                  <>
                    <button
                      type="button"
                      className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                      onClick={() => useEditor.getState().rotateSelection(1)}
                    >
                      ↻ 90°
                    </button>
                    <button
                      type="button"
                      className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                      onClick={() => useEditor.getState().mirrorSelection()}
                    >
                      ⇆ Spiegeln
                    </button>
                  </>
                )}
                {isCurrentProbe0 && selProbe0 && (
                  <button
                    type="button"
                    className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                    onClick={() =>
                      useEditor
                        .getState()
                        .updateMeasurementProbe(selProbe0.id, { direction: selProbe0.direction ? 0 : 1 })
                    }
                  >
                    ⇄ Richtung
                  </button>
                )}
                {canInlineEdit0 && (
                  <button
                    type="button"
                    className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                    onClick={() => {
                      editingDone.current = false;
                      editingOpenedAt.current = performance.now();
                      if (selInst0 && mainParam0) {
                        const scr = toScreen({ x: selInst0.x, y: selInst0.y });
                        const rawVal = Number(selInst0.params[mainParam0.key] ?? mainParam0.def);
                        const formatted = mainParam0.type === "text"
                          ? String(selInst0.params[mainParam0.key] ?? mainParam0.def ?? "")
                          : Number.isFinite(rawVal)
                            ? formatValue(rawVal, "").trim()
                            : String(selInst0.params[mainParam0.key] ?? "");
                        setEditing({
                          kind: "value",
                          instId: selInst0.id,
                          x: selInst0.x,
                          y: selInst0.y,
                          sx: scr.x,
                          sy: scr.y + 18,
                          initial: formatted,
                        });
                      } else if (selLabel0) {
                        const scr = toScreen({ x: selLabel0.x, y: selLabel0.y });
                        setEditing({
                          kind: "label",
                          itemId: selLabel0.id,
                          x: selLabel0.x,
                          y: selLabel0.y,
                          sx: scr.x,
                          sy: scr.y,
                          initial: selLabel0.name,
                        });
                      } else if (selNote0) {
                        const scr = toScreen({ x: selNote0.x, y: selNote0.y });
                        setEditing({
                          kind: "text",
                          itemId: selNote0.id,
                          x: selNote0.x,
                          y: selNote0.y,
                          sx: scr.x,
                          sy: scr.y,
                          initial: selNote0.text,
                        });
                      }
                    }}
                  >
                    {selInst0 && mainParam0?.type === "text" ? "✎ Name" : "✎ Wert"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                  onClick={() => useEditor.getState().openInstrument("inspector")}
                >
                  Inspector
                </button>
                <button
                  type="button"
                  className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                  onClick={() => useEditor.getState().duplicateSelection()}
                >
                  Kopie
                </button>
                <button
                  type="button"
                  className="btn h-8 shrink-0 px-2.5 text-[11.5px]"
                  style={{ color: "var(--err)" }}
                  onClick={() => useEditor.getState().deleteSelection()}
                >
                  Löschen
                </button>
                <button
                  type="button"
                  className="btn h-8 shrink-0 px-2 text-[11.5px]"
                  onClick={() => useEditor.getState().setSelection([])}
                  title="Auswahl aufheben" aria-label="Auswahl aufheben"
                >
                  ✕
                </button>
              </>
            )}
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

function hitWire(doc: SchematicDoc, p: Pt, tol = 6): string | null {
  const tol2 = tol * tol;
  for (const w of doc.wires) for (let i=0;i+1<w.points.length;i++) {
    const a=w.points[i], b=w.points[i+1]; const dx=b.x-a.x, dy=b.y-a.y; const len2=dx*dx+dy*dy||1;
    let t=((p.x-a.x)*dx+(p.y-a.y)*dy)/len2; t=Math.max(0,Math.min(1,t));
    const cx=a.x+t*dx, cy=a.y+t*dy;
    if ((cx-p.x)**2+(cy-p.y)**2 < tol2) return w.id;
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
function hitWireHandle(doc: SchematicDoc, p: Pt, zoom: number, onlySelected = true, baseRadius = 12): { wireId: string; pointIdx: number; isMid?: boolean; segIdx?: number; dist: number } | null {
  const st = useEditor.getState();
  const sel = onlySelected ? st.selection : doc.wires.map(w=>w.id);
  const hitRadius = baseRadius / Math.max(zoom, 0.3); // generous hit for delightful grabbing
  const midBase = Math.max(10, baseRadius - 2);
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
      const mx = Math.round(((a.x + b.x)/2) / GRID) * GRID;
      const my = Math.round(((a.y + b.y)/2) / GRID) * GRID;
      const d = Math.hypot(mx - p.x, my - p.y);
      const midRadius = midBase / Math.max(zoom, 0.3);
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
        const mx = Math.round(((a.x + b.x)/2) / GRID) * GRID;
        const my = Math.round(((a.y + b.y)/2) / GRID) * GRID;
        const d = Math.hypot(mx - p.x, my - p.y);
        const midRadius = midBase / Math.max(zoom, 0.3);
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
  const foot = nearestWireFoot(st.doc, p, radius);
  if (foot && foot.dist * foot.dist <= bestD) {
    const w = st.doc.wires.find((x) => x.id === foot.wireId);
    const a = w?.points[foot.segIdx];
    if (a) {
      const segNet = st.netResult.pointNets[`${Math.round(a.x)},${Math.round(a.y)}`];
      if (segNet) return segNet;
    }
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
  // W85: NI-Multisim-Stil für Messpunkte (Probes).
  // Jede Sonde besitzt:
  //  1. Messspitze / Kontaktpunkt (ax, ay) auf der Leitung oder am Bauteil-Pin
  //     (bei Strom-/Leistungssonde zusätzlich einen Richtungspfeil entlang der Leitung).
  //  2. Ein permanent sichtbares Anzeigekästchen bei (bx, by) mit farbigem
  //     Header (Typ-Badge + Name + Netz) und den Messwerten (im Live-Betrieb
  //     echte Messwerte, vor Simulationsstart ruhige Bereitschaftsanzeige).
  //  3. Eine durchgehende Führungs-Linie (Leader) vom nächstgelegenen Randpunkt
  //     des Anzeigekästchens exakt zur Messspitze (ax, ay).
  const col = (probe.color && !LEGACY_PROBE_COLORS.has(probe.color as string))
    ? (probe.color as string)
    : canvasColor(PROBE_CSSVAR[probe.kind] ?? "--warn");
  const ax = probe.anchorX ?? probe.x;
  const ay = probe.anchorY ?? probe.y;
  const bx = probe.x;
  const by = probe.y;
  const iz = 1 / Math.max(zoom, 0.2);

  const st = useEditor.getState();
  const autoWireDeg = inferWireAngleAt(st.doc, ax, ay);
  const baseDeg = probe.rotation !== undefined ? probe.rotation : autoWireDeg;
  const dir = probe.direction ?? 0;
  const effectiveDeg = (((baseDeg + (dir ? 180 : 0)) % 360) + 360) % 360;
  const effectiveRad = (effectiveDeg * Math.PI) / 180;
  const dirArrow =
    effectiveDeg === 90 ? "↓" : effectiveDeg === 180 ? "←" : effectiveDeg === 270 ? "↑" : "→";

  const netName = probe.net ?? nearestNetName({ x: ax, y: ay }, 20);
  let refNetName: string | null = null;
  if (probe.ref) {
    if (probe.ref.startsWith("pr_")) {
      const rp = st.doc.probes.find((p) => p.id === probe.ref);
      refNetName = rp?.net ?? rp?.ref ?? null;
    } else {
      refNetName = probe.ref;
    }
  }

  const v = live && netName ? (live.nets[netName] ?? 0) : 0;
  const refV = live && refNetName ? (live.nets[refNetName] ?? 0) : 0;

  // W99: Gerichteter Zweigstrom in Pfeilrichtung (effectiveRad) am Messpunkt (ax, ay)
  // nach dem Kirchhoffschen Knotensatz (KCL). Für 2-polige Bauteile fließt
  // live.currents[inst.label] von Pin 0 (Senke aus dem Netz) nach Pin 1 (Quelle in das Netz).
  let i = 0;
  if (live && netName) {
    const ux = Math.cos(effectiveRad);
    const uy = Math.sin(effectiveRad);
    let forwardSinkSum = 0;
    let backwardSinkSum = 0;
    let forwardCount = 0;
    let backwardCount = 0;
    for (const inst of st.doc.instances) {
      const part = PART_MAP[inst.partId];
      if (!part) continue;
      const devCurrent = live.currents[inst.label] ?? 0;
      for (let pIdx = 0; pIdx < part.pins.length; pIdx++) {
        const pNet = netResult.pinNets[`${inst.id}:${pIdx}`];
        if (pNet !== netName) continue;
        const pos = pinPosition(inst, pIdx);
        const dot = (pos.x - ax) * ux + (pos.y - ay) * uy;
        // Wie viel Strom nimmt dieser Pin aus dem Netz auf?
        let pinSink = 0;
        if (part.pins.length === 2) {
          pinSink = pIdx === 0 ? devCurrent : -devCurrent;
        } else {
          pinSink = pIdx === 0 ? devCurrent : -devCurrent / Math.max(1, part.pins.length - 1);
        }
        if (dot >= 0) {
          forwardSinkSum += pinSink;
          forwardCount++;
        } else {
          backwardSinkSum += pinSink;
          backwardCount++;
        }
      }
    }
    if (forwardCount > 0 && backwardCount > 0) {
      i = forwardSinkSum;
    } else if (forwardCount > 0) {
      i = forwardSinkSum;
    } else if (backwardCount > 0) {
      i = -backwardSinkSum;
    }
    if (Math.abs(i) < 1e-12) {
      const fallbackMag = netCurrentMap.get(netName) ?? 0;
      i = dir ? -fallbackMag : fallbackMag;
    }
  }

  let vrms = 0, vpp = 0, vavg = 0, irms = 0, ipp = 0, freq = 0;
  if (live && probe.periodic && netName) {
    try {
      const ch = engine.channel(netName, 2048);
      if (ch.v.length > 8) {
        vavg = mean(ch.v);
        vrms = rms(ch.v);
        vpp = peakToPeak(ch.v);
        freq = estimateFrequency(ch.t, ch.v);
        irms = Math.abs(i) * 0.707;
        ipp = Math.abs(i) * 2;
      }
    } catch {}
  }

  const show = probe.show ?? { vdc: true, idc: true, power: true };
  const glyphMap: Record<string, string> = {
    voltage: "V",
    current: "I",
    voltage_current: "V/I",
    power: "W",
    diff: "ΔV",
    ref: "REF",
    digital: "D",
  };
  const glyph = glyphMap[probe.kind] ?? "V";
  const hasCurrentDir =
    probe.kind === "current" || probe.kind === "power" || probe.kind === "voltage_current";
  const titleName = probe.name || glyph;
  const headerText = `${titleName}${hasCurrentDir ? ` ${dirArrow}` : ""}  ${netName ? `(${netName})` : "(—)"}`;

  const valueLines: string[] = [];
  let digCol: string | null = null;
  if (!netName) {
    valueLines.push("Nicht verbunden");
  } else if (!live) {
    if (probe.kind === "voltage") valueLines.push("V(dc): — V");
    else if (probe.kind === "current") valueLines.push(`I(${dirArrow}): — A`);
    else if (probe.kind === "voltage_current") valueLines.push(`V: — V · I(${dirArrow}): — A`);
    else if (probe.kind === "power") valueLines.push(`P(${dirArrow}): — W`);
    else if (probe.kind === "diff") valueLines.push("ΔV: — V");
    else if (probe.kind === "ref") valueLines.push(`Bezug: ${netName}`);
    else if (probe.kind === "digital") valueLines.push("Logik: —");
  } else {
    if (probe.kind === "voltage") {
      const dv = refNetName ? v - refV : v;
      if (show.vdc !== false) valueLines.push(`V(dc): ${formatValue(dv, "V")}`);
      if (probe.periodic) {
        if (show.vrms) valueLines.push(`V(rms): ${formatValue(vrms, "V")}`);
        if (show.vpp) valueLines.push(`V(p-p): ${formatValue(vpp, "V")}`);
        if (show.vavg) valueLines.push(`V(avg): ${formatValue(vavg, "V")}`);
        if (show.freq) valueLines.push(`f: ${freq.toFixed(1)} Hz`);
      }
      if (refNetName && refNetName !== "0") valueLines.push(`Ref ${refNetName}: ${formatValue(refV, "V")}`);
    } else if (probe.kind === "current") {
      if (show.idc !== false) valueLines.push(`I(${dirArrow}): ${formatValue(i, "A")}`);
      if (probe.periodic) {
        if (show.irms) valueLines.push(`I(rms): ${formatValue(irms, "A")}`);
        if (show.ipp) valueLines.push(`I(p-p): ${formatValue(ipp, "A")}`);
      }
    } else if (probe.kind === "voltage_current") {
      const dv = refNetName ? v - refV : v;
      valueLines.push(`V: ${formatValue(dv, "V")}`);
      valueLines.push(`I(${dirArrow}): ${formatValue(i, "A")}`);
      if (probe.periodic && show.vrms) valueLines.push(`Vrms ${formatValue(vrms, "V")} · Irms ${formatValue(irms, "A")}`);
    } else if (probe.kind === "power") {
      const dv = refNetName ? v - refV : v;
      const pwr = dv * i;
      valueLines.push(`P: ${formatValue(pwr, "W")}`);
      if (show.vdc !== false) valueLines.push(`${formatValue(dv, "V")} · I(${dirArrow}) ${formatValue(i, "A")}`);
    } else if (probe.kind === "diff") {
      const dv = v - refV;
      valueLines.push(`ΔV: ${formatValue(dv, "V")}`);
      if (probe.periodic) valueLines.push(`${formatValue(v, "V")} − ${formatValue(refV, "V")}`);
    } else if (probe.kind === "ref") {
      valueLines.push(`REF: ${formatValue(v, "V")}`);
    } else if (probe.kind === "digital") {
      const low = probe.thresholds?.low ?? 0.8;
      const high = probe.thresholds?.high ?? 2.0;
      const lvl = v > high ? "HIGH (1)" : v < low ? "LOW (0)" : "UNDEF (X)";
      digCol = v > high ? canvasColor("--ok") : v < low ? canvasColor("--err") : canvasColor("--warn");
      valueLines.push(`${lvl} · ${formatValue(v, "V")}`);
    }
  }
  if (!valueLines.length) valueLines.push(formatValue(v, "V"));

  ctx.save();

  // ---- 1. Kästchen-Maße in Screen-Einheiten (* iz in Welt-Einheiten) berechnen (W93: groß & klar lesbar!) ----
  ctx.font = `700 12px ui-monospace, monospace`;
  const headerW = ctx.measureText(headerText).width + 38;
  ctx.font = `600 13px ui-monospace, monospace`;
  const maxValW = Math.max(...valueLines.map((l) => ctx.measureText(l).width));
  const padX = 11;
  const headerH = 24;
  const lineH = 18;
  const boxScreenW = Math.max(132, Math.ceil(Math.max(headerW, maxValW + padX * 2)));
  const boxScreenH = headerH + valueLines.length * lineH + 9;

  const boxW = boxScreenW * iz;
  const boxH = boxScreenH * iz;
  const boxX0 = bx;
  const boxY0 = by - boxH / 2;

  // ---- 2. Gestrichelte Referenzlinie für Diff-/Ref-Sonden ----
  if (probe.kind === "diff" || (probe.kind === "voltage" && probe.ref && probe.ref !== "0")) {
    let refX = 0, refY = 0, hasRef = false;
    if (probe.ref && probe.ref.startsWith("pr_")) {
      const refProbe = st.doc.probes.find((p) => p.id === probe.ref);
      if (refProbe) {
        refX = refProbe.anchorX ?? refProbe.x;
        refY = refProbe.anchorY ?? refProbe.y;
        hasRef = true;
      }
    } else if (probe.ref && probe.ref !== "0") {
      const refNet = st.netResult.nets.find((n) => n.name === probe.ref);
      if (refNet && refNet.points.length) {
        refX = refNet.points[0].x;
        refY = refNet.points[0].y;
        hasRef = true;
      }
    }
    if (hasRef) {
      ctx.save();
      ctx.strokeStyle = col + "88";
      ctx.setLineDash([4 * iz, 3 * iz]);
      ctx.lineWidth = 1.1 * iz;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(refX, refY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  // ---- 3. Durchgehende Leader-Linie vom nächsten Rand des Kästchens zur Messspitze (ax, ay) ----
  const attachX = Math.max(boxX0, Math.min(boxX0 + boxW, ax));
  const attachY = Math.max(boxY0, Math.min(boxY0 + boxH, ay));
  const distToAnchor = Math.hypot(ax - attachX, ay - attachY);

  if (distToAnchor > 2 * iz) {
    const angle = Math.atan2(ay - attachY, ax - attachX);
    ctx.save();
    ctx.strokeStyle = selected ? canvasColor("--wire-sel") : col;
    ctx.lineWidth = (selected ? 1.5 : 1.15) * iz;
    if (!netName || probe.leader === "magnifier") {
      ctx.setLineDash([3.5 * iz, 2.5 * iz]);
    }
    ctx.beginPath();
    ctx.moveTo(attachX, attachY);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pfeilspitze am Messpunkt (ax, ay)
    ctx.save();
    ctx.translate(ax, ay);
    ctx.rotate(angle);
    ctx.fillStyle = selected ? canvasColor("--wire-sel") : col;
    const as = 5.5 * iz;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-as, -as * 0.52);
    ctx.lineTo(-as, as * 0.52);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ---- 4. Messspitze / Kontaktpunkt auf der Leitung (ax, ay) + W99 Stromzange & Richtungspfeil ----
  ctx.save();
  ctx.translate(ax, ay);
  ctx.scale(iz, iz);

  if (hasCurrentDir) {
    const strokeCol = selected ? canvasColor("--wire-sel") : col;
    ctx.save();
    ctx.rotate(effectiveRad);

    // 4a) Stromzangen-Hülse (Current Clamp Ring) um die Leitung bei (0, 0)
    ctx.fillStyle = canvasColor("--surface");
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = selected ? 2.2 : 1.7;
    roundRect(ctx, -4.5, -7.5, 9, 15, 4);
    ctx.fill();
    ctx.stroke();

    // 4b) Kontrastreiches Richtungs-Pfeil-Schild ("I ━━▶") parallel zur Leitung
    const badgeY = -18;
    ctx.fillStyle = canvasColor("--surface");
    ctx.strokeStyle = strokeCol;
    ctx.lineWidth = selected ? 2.0 : 1.5;
    roundRect(ctx, -18, badgeY - 7.5, 36, 15, 7.5);
    ctx.fill();
    ctx.stroke();

    // Kräftiger Richtungspfeil im Schild + direkt auf der Leitung
    ctx.strokeStyle = strokeCol;
    ctx.fillStyle = strokeCol;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-11, badgeY);
    ctx.lineTo(6, badgeY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(13, badgeY);
    ctx.lineTo(4.5, badgeY - 4.5);
    ctx.lineTo(4.5, badgeY + 4.5);
    ctx.closePath();
    ctx.fill();

    // Zusätzlich direkter Richtungspfeil unmittelbar auf der Leitung vor der Stromzange
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(5.5, -4.5);
    ctx.lineTo(5.5, 4.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Kontaktpunkt auf der Leitung
  ctx.fillStyle = canvasColor("--surface");
  ctx.strokeStyle = selected ? canvasColor("--wire-sel") : col;
  ctx.lineWidth = selected ? 1.8 : 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, selected ? 4.2 : 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = selected ? canvasColor("--wire-sel") : col;
  ctx.beginPath();
  ctx.arc(0, 0, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // ---- 5. Permanentes Multisim-Anzeigekästchen bei (boxX0, boxY0) (W93: groß & kontrastreich) ----
  ctx.save();
  ctx.translate(boxX0, boxY0);
  ctx.scale(iz, iz);

  // Kästchen-Hintergrund & Rahmen
  ctx.fillStyle = canvasColor("--surface");
  roundRect(ctx, 0, 0, boxScreenW, boxScreenH, 7);
  ctx.fill();

  // Farbige Kopfzeile im Kästchen
  ctx.save();
  roundRect(ctx, 0, 0, boxScreenW, headerH, 7);
  ctx.clip();
  ctx.fillStyle = col + "28";
  ctx.fillRect(0, 0, boxScreenW, headerH);
  ctx.restore();

  // Trennlinie unter dem Header
  ctx.strokeStyle = col + "55";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, headerH);
  ctx.lineTo(boxScreenW, headerH);
  ctx.stroke();

  // Außenrahmen (hervorgehoben bei Auswahl)
  ctx.strokeStyle = selected ? canvasColor("--wire-sel") : col;
  ctx.lineWidth = selected ? 2.2 : 1.4;
  roundRect(ctx, 0, 0, boxScreenW, boxScreenH, 7);
  ctx.stroke();

  // Typ-Badge + Header-Text
  ctx.fillStyle = col;
  roundRect(ctx, 6, 4, 22, 16, 4);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = `700 10.5px ui-monospace, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(glyph.slice(0, 2), 17, 12.2);

  ctx.fillStyle = canvasColor("--ink");
  ctx.font = `700 12px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(headerText, 34, 12.2);

  if (digCol) {
    ctx.fillStyle = digCol;
    ctx.beginPath();
    ctx.arc(boxScreenW - 11, 12, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Messwert-Zeilen
  ctx.font = `600 13px ui-monospace, monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = !netName || !live ? canvasColor("--ink-3") : canvasColor("--ink");
  valueLines.forEach((ln, idx) => {
    ctx.fillText(ln, padX, headerH + 5 + idx * lineH);
  });

  ctx.restore();
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
  const stroke=selected?canvasColor("--wire-sel"):canvasColor("--symbol");
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
  ctx.fillStyle=canvasColor("--pin");
  for (const pin of part.pins){ ctx.beginPath(); ctx.arc(pin.x,pin.y,1.5,0,Math.PI*2); ctx.fill(); } // W27: dezente Pin-Punkte
  if (part.interactive==="switch" || part.interactive==="button") {
    // W27: Ref-2-Schalter – dünner Hebel, gefüllte Lagerpunkte, neutrale Tinte
    const closed=(engine.controls[inst.label] ?? (inst.params.closed?1:0))>0.5;
    ctx.strokeStyle=canvasColor("--symbol"); ctx.lineWidth=1.3; ctx.lineCap="round";
    ctx.beginPath();
    if (closed){ ctx.moveTo(-14,0); ctx.lineTo(14,0); }
    else { ctx.moveTo(-14,0); ctx.lineTo(11,-10); }
    ctx.stroke();
    ctx.fillStyle=canvasColor("--symbol");
    ctx.beginPath(); ctx.arc(-14,0,1.8,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(14,0,1.8,0,Math.PI*2); ctx.fill();
  }
  if (part.interactive==="pot") {
    const pos=engine.controls[inst.label] ?? Number(inst.params.pos??0.5);
    ctx.fillStyle=canvasColor("--teal"); ctx.fillRect(-20+40*pos-1,-12,2,8);
  }
  // Fault visualization
  if ((inst as any).fault && (inst as any).fault !== "none") {
    ctx.save();
    const fault = (inst as any).fault;
      ctx.strokeStyle = fault === "open" ? canvasColor("--warn") : fault === "short" ? canvasColor("--err") : canvasColor("--violet");
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
    ctx.fillStyle=selected?canvasColor("--wire-sel"):canvasColor("--ink-2");
    ctx.fillText(inst.label,0,dy);
    const main=part.params[0];
    if (main && main.type==="number"){
      const val=Number(inst.params[main.key]??main.def);
      // W92: Wenn das Bauteil ausgewählt ist, wird auch sein Wert darunter
      // optisch in der Auswahlfarbe (--wire-sel) hervorgehoben!
      ctx.fillStyle=selected?canvasColor("--wire-sel"):canvasColor("--ink-3");
      ctx.font=selected?"600 10.5px ui-monospace, monospace":"10px ui-monospace, monospace";
      ctx.fillText(formatValue(val,main.unit??""),0,dy+12);
    }
    ctx.restore();
  }
  if (zoom>0.42 && part.id==="onpage_connector") {
    // S1.6: Virtuelle Bauteile bekommen sonst kein Schild — der Verbinder
    // braucht seinen Netznamen aber sichtbar (der Name IST die Verbindung).
    ctx.save(); ctx.translate(inst.x, inst.y);
    const b=instanceBounds(inst); const dy=b.y+b.h-inst.y+14;
    ctx.font="600 10.5px ui-monospace, monospace"; ctx.textAlign="center";
    ctx.fillStyle=selected?canvasColor("--wire-sel"):canvasColor("--ink-2");
    ctx.fillText(String(inst.params.name??"NET_A"),0,dy);
    ctx.restore();
  }
  if (selected){
    const b=instanceBounds(inst);
    const hasValueLabel = zoom>0.42 && (part.mount!=="virtual" || part.id==="onpage_connector");
    const main=part.params[0];
    const extraBottom = hasValueLabel ? (main && main.type==="number" ? 30 : 18) : 6;
    ctx.strokeStyle=canvasColor("--wire-sel");
    ctx.setLineDash([4,3]);
    ctx.lineWidth=1.1;
    ctx.strokeRect(b.x-6, b.y-6, b.w+12, b.h+6+extraBottom);
    ctx.setLineDash([]);
  }
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
