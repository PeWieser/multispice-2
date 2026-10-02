"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "./ui";
import {
  CustomPartSpec,
  CustomPinSpec,
  CustomParamSpec,
  PACKAGE_PRESETS,
  PinRole,
  PinSide,
  PinMarker,
  SubcircuitElement,
  SubcircuitElementKind,
  SUBCIRCUIT_ELEMENT_META,
  SUBCIRCUIT_TEMPLATES,
  buildCustomGeometry,
  deleteCustomPart,
  extractSubcircuitFromSchematic,
  loadCustomParts,
  saveCustomPart,
} from "@/lib/library/customParts";
import { SymbolPrim } from "@/lib/library/catalog";
import { useEditor } from "@/state/editor";
import {
  Cpu,
  Plus,
  Trash2,
  Check,
  Package,
  Layers,
  PenTool,
  CircuitBoard,
  Download,
  Upload,
  Sparkles,
  MousePointer,
  Minus,
  Square,
  Circle as CircleIcon,
  Type,
  Move,
  RotateCcw,
  Sliders,
} from "lucide-react";

type StudioTab = "subcircuit" | "symbol" | "pins_package" | "manage";
type DrawTool = "select" | "line" | "rect" | "circle" | "arc" | "text" | "pin";

const PIN_ROLE_COLORS: Record<PinRole, string> = {
  input: "#38bdf8",
  output: "#f59e0b",
  signal: "#94a3b8",
  vcc: "#f87171",
  gnd: "#4ade80",
};

/**
 * Live-Topologie-Vorschau der Transistor-/Subcircuit-Innenschaltung (Tab 1)
 */
function SubcircuitTopologyPreview({
  pins,
  subcircuit,
}: {
  pins: CustomPinSpec[];
  subcircuit: SubcircuitElement[];
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = 360;
    const h = 270;
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Hintergrund + feines Raster
    ctx.fillStyle = "#0d1118";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 1;
    for (let x = 0; x < w; x += 15) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += 15) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Außenpins links (Eingänge/GND) & rechts (Ausgänge/VCC)
    const leftPins = pins.filter((p) => p.side === "left" || p.side === "top");
    const rightPins = pins.filter((p) => p.side === "right" || p.side === "bottom");

    const nodePositions = new Map<string, { x: number; y: number }>();

    leftPins.forEach((p, idx) => {
      const py = Math.round(((idx + 1) * h) / (leftPins.length + 1));
      const key = (p.internalNode || p.name).toUpperCase();
      nodePositions.set(key, { x: 46, y: py });
      ctx.fillStyle = PIN_ROLE_COLORS[p.role] || "#94a3b8";
      ctx.beginPath();
      ctx.arc(46, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "700 9px ui-monospace, monospace";
      ctx.textAlign = "left";
      ctx.fillText(p.name, 8, py + 3);
    });

    rightPins.forEach((p, idx) => {
      const py = Math.round(((idx + 1) * h) / (rightPins.length + 1));
      const key = (p.internalNode || p.name).toUpperCase();
      nodePositions.set(key, { x: w - 46, y: py });
      ctx.fillStyle = PIN_ROLE_COLORS[p.role] || "#94a3b8";
      ctx.beginPath();
      ctx.arc(w - 46, py, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "700 9px ui-monospace, monospace";
      ctx.textAlign = "right";
      ctx.fillText(p.name, w - 8, py + 3);
    });

    // Interne Bauteile in bis zu 2 Spalten in der Mitte anordnen
    const count = subcircuit.length;
    if (count === 0) {
      ctx.fillStyle = "#64748b";
      ctx.font = "11px ui-sans-serif, system-ui";
      ctx.textAlign = "center";
      ctx.fillText("Keine internen Bauteile – füge links Transistoren/Widerstände hinzu", w / 2, h / 2);
      return;
    }

    const cols = count > 6 ? 2 : 1;
    const rows = Math.ceil(count / cols);

    subcircuit.forEach((el, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = cols === 1 ? w / 2 : col === 0 ? w * 0.38 : w * 0.62;
      const cy = Math.round(((row + 1) * (h - 24)) / (rows + 1)) + 12;

      // Verbindungsfäden zu bekannten Port-Pins zeichnen
      for (const nd of el.nodes) {
        const target = nodePositions.get((nd || "").toUpperCase());
        if (target) {
          ctx.save();
          ctx.strokeStyle = "rgba(245, 158, 11, 0.28)";
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(target.x, target.y);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Bauteil-Kästchen / Transistor-Kreis zeichnen
      const isTransistor = el.kind === "npn" || el.kind === "pnp" || el.kind === "nmos" || el.kind === "pmos";
      ctx.save();
      if (isTransistor) {
        ctx.fillStyle = "#1e293b";
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(cx, cy, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillStyle = "#172030";
        ctx.strokeStyle = "#475569";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.roundRect(cx - 24, cy - 10, 48, 20, 4);
        ctx.fill();
        ctx.stroke();
      }

      ctx.fillStyle = isTransistor ? "#fbbf24" : "#e2e8f0";
      ctx.font = "700 8.5px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(el.id.slice(0, 8), cx, cy + 3);
      ctx.restore();
    });
  }, [pins, subcircuit]);

  return (
    <canvas
      ref={ref}
      className="rounded-xl border"
      style={{ borderColor: "var(--border)", background: "#0d1118" }}
    />
  );
}

/**
 * Interaktiver Vektor-Zeicheneditor für das Schaltsymbol & freie Pin-Platzierung (Tab 2)
 */
function SymbolCanvasEditor({
  spec,
  onUpdateSymbol,
  onUpdatePins,
}: {
  spec: CustomPartSpec;
  onUpdateSymbol: (prims: SymbolPrim[]) => void;
  onUpdatePins: (pins: CustomPinSpec[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [tool, setTool] = useState<DrawTool>("select");
  const [selectedPrimIdx, setSelectedPrimIdx] = useState<number | null>(null);
  const [selectedPinIdx, setSelectedPinIdx] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [cursorPt, setCursorPt] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [newTextValue, setNewTextValue] = useState("NE555");
  const [newTextSize, setNewTextSize] = useState(9);

  const built = useMemo(() => buildCustomGeometry(spec), [spec]);
  const activePrims = spec.customSymbol && spec.customSymbol.length > 0 ? spec.customSymbol : built.symbol;
  const activePins = built.pins;

  const SCALE = 2.4;
  const W = 440;
  const H = 320;

  const toSymCoords = (clientX: number, clientY: number, snapGrid = 5): { x: number; y: number } => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    const rawX = (clientX - r.left - W / 2) / SCALE;
    const rawY = (clientY - r.top - H / 2) / SCALE;
    return {
      x: Math.round(rawX / snapGrid) * snapGrid,
      y: Math.round(rawY / snapGrid) * snapGrid,
    };
  };

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = W * dpr;
    c.height = H * dpr;
    c.style.width = `${W}px`;
    c.style.height = `${H}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = "#0d1118";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(SCALE, SCALE);

    // 10-px-Hauptgitter & 5-px-Feingitter
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.4;
    for (let x = -90; x <= 90; x += 5) {
      ctx.beginPath();
      ctx.moveTo(x, -65);
      ctx.lineTo(x, 65);
      ctx.stroke();
    }
    for (let y = -65; y <= 65; y += 5) {
      ctx.beginPath();
      ctx.moveTo(-90, y);
      ctx.lineTo(90, y);
      ctx.stroke();
    }
    ctx.strokeStyle = "rgba(255,255,255,0.09)";
    ctx.lineWidth = 0.5;
    for (let x = -90; x <= 90; x += 10) {
      ctx.beginPath();
      ctx.moveTo(x, -65);
      ctx.lineTo(x, 65);
      ctx.stroke();
    }
    for (let y = -65; y <= 65; y += 10) {
      ctx.beginPath();
      ctx.moveTo(-90, y);
      ctx.lineTo(90, y);
      ctx.stroke();
    }

    // Ursprungs-Fadenkreuz (0,0)
    ctx.strokeStyle = "rgba(245, 158, 11, 0.25)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-90, 0);
    ctx.lineTo(90, 0);
    ctx.moveTo(0, -65);
    ctx.lineTo(0, 65);
    ctx.stroke();

    // Symbol-Primitive zeichnen
    activePrims.forEach((prim, idx) => {
      const isSel = idx === selectedPrimIdx;
      ctx.save();
      ctx.strokeStyle = isSel ? "#f59e0b" : "#e2e8f0";
      ctx.fillStyle = isSel ? "#f59e0b" : "#e2e8f0";
      ctx.lineWidth = isSel ? 2.0 : 1.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      switch (prim.t) {
        case "line":
          ctx.beginPath();
          for (let i = 0; i < prim.pts.length; i += 2) {
            if (i === 0) ctx.moveTo(prim.pts[0], prim.pts[1]);
            else ctx.lineTo(prim.pts[i], prim.pts[i + 1]);
          }
          ctx.stroke();
          break;
        case "rect":
          ctx.beginPath();
          ctx.roundRect(prim.x, prim.y, prim.w, prim.h, prim.r ?? 0);
          if (prim.fill) ctx.fill();
          else ctx.stroke();
          break;
        case "circle":
          ctx.beginPath();
          ctx.arc(prim.x, prim.y, prim.r, 0, Math.PI * 2);
          if (prim.fill) ctx.fill();
          else ctx.stroke();
          break;
        case "arc":
          ctx.beginPath();
          ctx.arc(prim.x, prim.y, prim.r, prim.a0, prim.a1);
          ctx.stroke();
          break;
        case "text":
          ctx.font = `600 ${prim.size ?? 8}px ui-sans-serif, system-ui`;
          ctx.textAlign = prim.align ?? "center";
          ctx.fillText(prim.s, prim.x, prim.y);
          break;
      }
      ctx.restore();
    });

    // Vorschau während des Aufziehens einer neuen Form
    if (dragStart && tool !== "select" && tool !== "pin" && tool !== "text") {
      ctx.save();
      ctx.strokeStyle = "#fbbf24";
      ctx.lineWidth = 1.3;
      ctx.setLineDash([2, 2]);
      if (tool === "line") {
        ctx.beginPath();
        ctx.moveTo(dragStart.x, dragStart.y);
        ctx.lineTo(cursorPt.x, cursorPt.y);
        ctx.stroke();
      } else if (tool === "rect") {
        const rx = Math.min(dragStart.x, cursorPt.x);
        const ry = Math.min(dragStart.y, cursorPt.y);
        const rw = Math.max(5, Math.abs(cursorPt.x - dragStart.x));
        const rh = Math.max(5, Math.abs(cursorPt.y - dragStart.y));
        ctx.strokeRect(rx, ry, rw, rh);
      } else if (tool === "circle" || tool === "arc") {
        const rad = Math.max(3, Math.round(Math.hypot(cursorPt.x - dragStart.x, cursorPt.y - dragStart.y)));
        ctx.beginPath();
        ctx.arc(dragStart.x, dragStart.y, rad, 0, tool === "arc" ? Math.PI : Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Elektrische Pin-Anschlusspunkte zeichnen (immer auf 10er-Raster)
    activePins.forEach((pin, idx) => {
      const pSpec = spec.pins[idx];
      const isPinSel = idx === selectedPinIdx;
      const roleColor = pSpec ? PIN_ROLE_COLORS[pSpec.role] : "#f59e0b";
      ctx.save();
      ctx.fillStyle = isPinSel ? "#fbbf24" : roleColor;
      ctx.strokeStyle = "#0d1118";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pin.x, pin.y, isPinSel ? 3.6 : 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    ctx.restore();
  }, [activePrims, activePins, spec.pins, selectedPrimIdx, selectedPinIdx, dragStart, cursorPt, tool]);

  const ensureEditableSymbol = (): SymbolPrim[] => {
    if (spec.customSymbol && spec.customSymbol.length > 0) {
      return [...spec.customSymbol];
    }
    return [...built.symbol];
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toSymCoords(e.clientX, e.clientY, tool === "pin" ? 10 : 5);
    setCursorPt(pt);

    // Prüfen, ob ein Pin getroffen wurde
    const hitPin = activePins.findIndex((p) => Math.hypot(p.x - pt.x, p.y - pt.y) <= 6);
    if (tool === "pin" || (tool === "select" && hitPin >= 0)) {
      if (hitPin >= 0) {
        setSelectedPinIdx(hitPin);
        setSelectedPrimIdx(null);
        setDragStart(pt);
      }
      return;
    }

    if (tool === "select") {
      // Treffertest auf Symbol-Primitive
      const foundIdx = activePrims.findIndex((pr) => {
        if (pr.t === "text") return Math.hypot(pr.x - pt.x, pr.y - pt.y) <= 12;
        if (pr.t === "circle" || pr.t === "arc") return Math.abs(Math.hypot(pr.x - pt.x, pr.y - pt.y) - pr.r) <= 6;
        if (pr.t === "rect") {
          return pt.x >= pr.x - 4 && pt.x <= pr.x + pr.w + 4 && pt.y >= pr.y - 4 && pt.y <= pr.y + pr.h + 4;
        }
        if (pr.t === "line") {
          for (let i = 0; i < pr.pts.length - 2; i += 2) {
            const mx = (pr.pts[i] + pr.pts[i + 2]) / 2;
            const my = (pr.pts[i + 1] + pr.pts[i + 3]) / 2;
            if (Math.hypot(mx - pt.x, my - pt.y) <= 10 || Math.hypot(pr.pts[i] - pt.x, pr.pts[i + 1] - pt.y) <= 8) {
              return true;
            }
          }
        }
        return false;
      });
      setSelectedPrimIdx(foundIdx >= 0 ? foundIdx : null);
      setSelectedPinIdx(null);
      if (foundIdx >= 0) setDragStart(pt);
      return;
    }

    if (tool === "text") {
      const next = ensureEditableSymbol();
      next.push({
        t: "text",
        x: pt.x,
        y: pt.y,
        s: newTextValue || "TXT",
        size: newTextSize,
        align: "center",
      });
      onUpdateSymbol(next);
      setSelectedPrimIdx(next.length - 1);
      setTool("select");
      return;
    }

    setDragStart(pt);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pt = toSymCoords(e.clientX, e.clientY, tool === "pin" || selectedPinIdx !== null ? 10 : 5);
    setCursorPt(pt);

    if (!dragStart) return;

    // Pin auf dem 10-px-Raster verschieben
    if (selectedPinIdx !== null && (tool === "pin" || tool === "select")) {
      const snappedX = Math.round(pt.x / 10) * 10;
      const snappedY = Math.round(pt.y / 10) * 10;
      const nextPins = spec.pins.map((p, i) =>
        i === selectedPinIdx ? { ...p, x: snappedX, y: snappedY } : p,
      );
      onUpdatePins(nextPins);
      return;
    }

    // Ausgewähltes Primitiv verschieben
    if (tool === "select" && selectedPrimIdx !== null) {
      const dx = pt.x - dragStart.x;
      const dy = pt.y - dragStart.y;
      if (dx === 0 && dy === 0) return;
      const next = ensureEditableSymbol();
      const pr = next[selectedPrimIdx];
      if (!pr) return;
      if (pr.t === "rect" || pr.t === "circle" || pr.t === "arc" || pr.t === "text") {
        next[selectedPrimIdx] = { ...pr, x: pr.x + dx, y: pr.y + dy };
      } else if (pr.t === "line") {
        next[selectedPrimIdx] = {
          ...pr,
          pts: pr.pts.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)),
        };
      }
      onUpdateSymbol(next);
      setDragStart(pt);
    }
  };

  const handlePointerUp = () => {
    if (!dragStart) return;
    if (tool === "line") {
      if (dragStart.x !== cursorPt.x || dragStart.y !== cursorPt.y) {
        const next = ensureEditableSymbol();
        next.push({ t: "line", pts: [dragStart.x, dragStart.y, cursorPt.x, cursorPt.y] });
        onUpdateSymbol(next);
        setSelectedPrimIdx(next.length - 1);
      }
    } else if (tool === "rect") {
      const rx = Math.min(dragStart.x, cursorPt.x);
      const ry = Math.min(dragStart.y, cursorPt.y);
      const rw = Math.max(10, Math.abs(cursorPt.x - dragStart.x));
      const rh = Math.max(10, Math.abs(cursorPt.y - dragStart.y));
      const next = ensureEditableSymbol();
      next.push({ t: "rect", x: rx, y: ry, w: rw, h: rh, r: 2 });
      onUpdateSymbol(next);
      setSelectedPrimIdx(next.length - 1);
    } else if (tool === "circle") {
      const rad = Math.max(4, Math.round(Math.hypot(cursorPt.x - dragStart.x, cursorPt.y - dragStart.y)));
      const next = ensureEditableSymbol();
      next.push({ t: "circle", x: dragStart.x, y: dragStart.y, r: rad });
      onUpdateSymbol(next);
      setSelectedPrimIdx(next.length - 1);
    } else if (tool === "arc") {
      const rad = Math.max(4, Math.round(Math.hypot(cursorPt.x - dragStart.x, cursorPt.y - dragStart.y)));
      const next = ensureEditableSymbol();
      next.push({ t: "arc", x: dragStart.x, y: dragStart.y, r: rad, a0: 0, a1: Math.PI });
      onUpdateSymbol(next);
      setSelectedPrimIdx(next.length - 1);
    }
    setDragStart(null);
  };

  const applySymbolTemplate = (kind: "auto_ic" | "transistor" | "triangle" | "clear") => {
    setSelectedPrimIdx(null);
    if (kind === "auto_ic") {
      onUpdateSymbol([]);
      return;
    }
    if (kind === "clear") {
      onUpdateSymbol([{ t: "rect", x: -30, y: -20, w: 60, h: 40, r: 2 }]);
      return;
    }
    if (kind === "transistor") {
      onUpdateSymbol([
        { t: "circle", x: 0, y: 0, r: 24 },
        { t: "line", pts: [-30, 0, -6, 0] },
        { t: "line", pts: [-6, -16, -6, 16] },
        { t: "line", pts: [-6, -8, 10, -18, 10, -30] },
        { t: "line", pts: [-6, 8, 10, 18, 10, 30] },
        { t: "line", pts: [4, 14, 10, 18, 2, 20, 4, 14] },
        { t: "text", x: 0, y: -28, s: spec.name.slice(0, 8), size: 8, align: "center" },
      ]);
      return;
    }
    if (kind === "triangle") {
      onUpdateSymbol([
        { t: "line", pts: [-30, -30, 30, 0, -30, 30, -30, -30] },
        { t: "line", pts: [-40, -10, -30, -10] },
        { t: "line", pts: [-40, 10, -30, 10] },
        { t: "line", pts: [30, 0, 40, 0] },
        { t: "text", x: -22, y: -7, s: "+", size: 9, align: "left" },
        { t: "text", x: -22, y: 13, s: "−", size: 9, align: "left" },
        { t: "text", x: -8, y: 3, s: spec.name.slice(0, 6), size: 7, align: "center" },
      ]);
    }
  };

  const selectedPrim = selectedPrimIdx !== null ? activePrims[selectedPrimIdx] : null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
      <div className="flex flex-col gap-2.5">
        {/* Zeichen-Werkzeugleiste */}
        <div
          className="flex flex-wrap items-center gap-1 rounded-xl border p-1.5"
          style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}
        >
          {(
            [
              ["select", "Auswahl / Bewegen", <MousePointer key="s" size={13} />],
              ["line", "Linie zeichnen", <Minus key="l" size={13} />],
              ["rect", "Rechteck / Gehäuse", <Square key="r" size={13} />],
              ["circle", "Kreis", <CircleIcon key="c" size={13} />],
              ["arc", "Halogen-/Bogen", <RotateCcw key="a" size={13} />],
              ["text", "Beschriftung setzen", <Type key="t" size={13} />],
              ["pin", "Pins verschieben", <Move key="p" size={13} />],
            ] as const
          ).map(([id, label, icon]) => {
            const active = tool === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTool(id)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors"
                style={
                  active
                    ? {
                        background: "color-mix(in srgb, var(--wire-sel, #f59e0b) 20%, transparent)",
                        color: "var(--wire-sel, #f59e0b)",
                        border: "1px solid var(--wire-sel, #f59e0b)",
                      }
                    : { color: "var(--text-dim)", border: "1px solid transparent" }
                }
              >
                {icon}
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Zusatzleiste für Textwerkzeug & Vorlagen */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="text-mute">Text:</span>
            <input
              className="input h-7 px-2 text-[11px]"
              style={{ width: 110 }}
              value={newTextValue}
              onChange={(e) => setNewTextValue(e.target.value)}
              placeholder="Beschriftung …"
            />
            <select
              className="input h-7 px-1.5 text-[11px]"
              style={{ width: 68 }}
              value={newTextSize}
              onChange={(e) => setNewTextSize(Number(e.target.value))}
            >
              <option value={7}>7 px</option>
              <option value={8}>8 px</option>
              <option value={9}>9 px</option>
              <option value={10}>10 px</option>
              <option value={12}>12 px</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              className="btn h-7 px-2 text-[10.5px]"
              onClick={() => applySymbolTemplate("auto_ic")}
              title="Standard-IC-Gehäuse automatisch aus den Pins berechnen"
            >
              Auto-IC
            </button>
            <button
              type="button"
              className="btn h-7 px-2 text-[10.5px]"
              onClick={() => applySymbolTemplate("transistor")}
              title="Transistor-Grundsymbol laden"
            >
              Transistor-Form
            </button>
            <button
              type="button"
              className="btn h-7 px-2 text-[10.5px]"
              onClick={() => applySymbolTemplate("triangle")}
              title="Verstärker-/Komparator-Dreieck laden"
            >
              OPV-Dreieck
            </button>
          </div>
        </div>

        {/* Interaktives Zeichen-Canvas */}
        <div className="flex flex-col items-center justify-center rounded-xl border p-2" style={{ borderColor: "var(--border)", background: "#090c12" }}>
          <canvas
            ref={canvasRef}
            className="cursor-crosshair rounded-lg"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div className="mt-1.5 flex w-full items-center justify-between px-2 text-[10.5px] text-mute mono">
            <span>Koordinate: ({cursorPt.x}, {cursorPt.y})</span>
            <span>Farbpunkte = Elektrische Pin-Anker (10-px-Raster)</span>
          </div>
        </div>
      </div>

      {/* Rechte Spalte: Element-Liste & Eigenschaften im Symbol */}
      <div
        className="flex flex-col rounded-xl border p-3"
        style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">
            Gezeichnete Elemente ({activePrims.length})
          </span>
          {selectedPrimIdx !== null && (
            <button
              type="button"
              className="btn h-6 gap-1 px-2 text-[10.5px] text-[#f87171]"
              onClick={() => {
                const next = ensureEditableSymbol().filter((_, i) => i !== selectedPrimIdx);
                onUpdateSymbol(next);
                setSelectedPrimIdx(null);
              }}
            >
              <Trash2 size={11} /> Löschen
            </button>
          )}
        </div>

        {selectedPrim && selectedPrimIdx !== null && (
          <div
            className="mb-3 space-y-2 rounded-lg border p-2.5 text-[11px]"
            style={{ borderColor: "var(--wire-sel, #f59e0b)", background: "var(--panel-solid)" }}
          >
            <div className="font-semibold text-[var(--wire-sel)]">
              Ausgewählt: {selectedPrim.t.toUpperCase()} #{selectedPrimIdx + 1}
            </div>
            {selectedPrim.t === "text" && (
              <div className="space-y-1.5">
                <label className="block text-[10px] text-mute">Beschriftungstext</label>
                <input
                  className="input h-7 text-[11.5px]"
                  value={selectedPrim.s}
                  onChange={(e) => {
                    const next = ensureEditableSymbol();
                    next[selectedPrimIdx] = { ...selectedPrim, s: e.target.value };
                    onUpdateSymbol(next);
                  }}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-[10px] text-mute">Größe</label>
                    <input
                      type="number"
                      className="input h-7 text-[11px]"
                      value={selectedPrim.size ?? 8}
                      onChange={(e) => {
                        const next = ensureEditableSymbol();
                        next[selectedPrimIdx] = { ...selectedPrim, size: Number(e.target.value) || 8 };
                        onUpdateSymbol(next);
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-mute">Ausrichtung</label>
                    <select
                      className="input h-7 text-[11px]"
                      value={selectedPrim.align ?? "center"}
                      onChange={(e) => {
                        const next = ensureEditableSymbol();
                        next[selectedPrimIdx] = {
                          ...selectedPrim,
                          align: e.target.value as "left" | "center" | "right",
                        };
                        onUpdateSymbol(next);
                      }}
                    >
                      <option value="left">Links</option>
                      <option value="center">Zentriert</option>
                      <option value="right">Rechts</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            {(selectedPrim.t === "rect" || selectedPrim.t === "circle") && (
              <label className="flex items-center gap-2 text-[11px]">
                <input
                  type="checkbox"
                  checked={Boolean(selectedPrim.fill)}
                  onChange={(e) => {
                    const next = ensureEditableSymbol();
                    next[selectedPrimIdx] = { ...selectedPrim, fill: e.target.checked };
                    onUpdateSymbol(next);
                  }}
                />
                <span>Fläche gefüllt zeichnen</span>
              </label>
            )}
          </div>
        )}

        <div className="max-h-[230px] flex-1 space-y-1 overflow-y-auto pr-1">
          {activePrims.map((pr, idx) => {
            const active = idx === selectedPrimIdx;
            const summary =
              pr.t === "text"
                ? `Text "${pr.s}" (${pr.x}, ${pr.y})`
                : pr.t === "rect"
                  ? `Rechteck ${pr.w}×${pr.h} bei (${pr.x}, ${pr.y})`
                  : pr.t === "circle"
                    ? `Kreis r=${pr.r} bei (${pr.x}, ${pr.y})`
                    : pr.t === "arc"
                      ? `Bogen r=${pr.r} bei (${pr.x}, ${pr.y})`
                      : `Linie (${pr.pts.slice(0, 4).join(", ")})`;
            return (
              <div
                key={idx}
                onClick={() => setSelectedPrimIdx(idx)}
                className="flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors"
                style={
                  active
                    ? {
                        borderColor: "var(--wire-sel, #f59e0b)",
                        background: "color-mix(in srgb, var(--wire-sel, #f59e0b) 14%, transparent)",
                      }
                    : { borderColor: "var(--border)", background: "var(--panel-solid)" }
                }
              >
                <span className="truncate mono text-[10.5px]">{summary}</span>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    const next = ensureEditableSymbol().filter((_, i) => i !== idx);
                    onUpdateSymbol(next);
                    if (selectedPrimIdx === idx) setSelectedPrimIdx(null);
                  }}
                  className="text-mute hover:text-[#f87171]"
                  title="Element entfernen"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Physische Gehäuse-Draufsicht (Package View für Tab 3: DIP-8, SOIC-8, TO-220, TO-92 …)
 */
function PackageTopView({
  footprint,
  pins,
}: {
  footprint: string;
  pins: CustomPinSpec[];
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = 260;
    const h = 210;
    c.width = w * dpr;
    c.height = h * dpr;
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = "#0d1118";
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);

    const n = pins.length;
    const fpUpper = footprint.toUpperCase();

    if (fpUpper.includes("TO-220")) {
      // Metall-Kühlfahne oben + schwarzes Epoxid-Gehäuse + 3 Beinchen unten
      ctx.fillStyle = "#94a3b8";
      ctx.strokeStyle = "#cbd5e1";
      ctx.lineWidth = 1.2;
      ctx.fillRect(-38, -68, 76, 30);
      ctx.strokeRect(-38, -68, 76, 30);
      ctx.fillStyle = "#0d1118";
      ctx.beginPath();
      ctx.arc(0, -53, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#1e293b";
      ctx.strokeStyle = "#64748b";
      ctx.fillRect(-38, -38, 76, 54);
      ctx.strokeRect(-38, -38, 76, 54);

      pins.slice(0, 3).forEach((p, idx) => {
        const px = (idx - 1) * 24;
        ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(px - 3, 16, 6, 34);
        ctx.fillStyle = PIN_ROLE_COLORS[p.role];
        ctx.font = "700 9px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${idx + 1}:${p.name}`, px, 64);
      });
    } else {
      // Dual-Inline / SOIC / QFP Gehäuse-Draufsicht
      const half = Math.ceil(n / 2);
      const bodyW = 86;
      const bodyH = Math.max(76, half * 20 + 16);

      // Metall-Pads links & rechts
      for (let i = 0; i < half; i++) {
        const py = -bodyH / 2 + 16 + i * 20;
        const pLeft = pins[i];
        if (pLeft) {
          ctx.fillStyle = "#cbd5e1";
          ctx.fillRect(-bodyW / 2 - 14, py - 4, 14, 8);
          ctx.fillStyle = PIN_ROLE_COLORS[pLeft.role];
          ctx.font = "700 8.5px ui-monospace, monospace";
          ctx.textAlign = "right";
          ctx.fillText(`${i + 1} ${pLeft.name}`, -bodyW / 2 - 18, py + 3);
        }
        const rIdx = n - 1 - i;
        const pRight = rIdx >= half ? pins[rIdx] : undefined;
        if (pRight) {
          ctx.fillStyle = "#cbd5e1";
          ctx.fillRect(bodyW / 2, py - 4, 14, 8);
          ctx.fillStyle = PIN_ROLE_COLORS[pRight.role];
          ctx.font = "700 8.5px ui-monospace, monospace";
          ctx.textAlign = "left";
          ctx.fillText(`${pRight.name} ${rIdx + 1}`, bodyW / 2 + 18, py + 3);
        }
      }

      // Epoxid-Körper
      ctx.fillStyle = "#1a202c";
      ctx.strokeStyle = "#475569";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(-bodyW / 2, -bodyH / 2, bodyW, bodyH, 5);
      ctx.fill();
      ctx.stroke();

      // Pin-1-Kerbe & Punkt
      ctx.beginPath();
      ctx.arc(0, -bodyH / 2, 9, 0, Math.PI);
      ctx.stroke();
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(-bodyW / 2 + 12, -bodyH / 2 + 14, 3, 0, Math.PI * 2);
      ctx.fill();

      // Gehäuse-Aufdruck
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "700 9px ui-monospace, monospace";
      ctx.textAlign = "center";
      ctx.fillText(footprint, 0, 3);
    }

    ctx.restore();
  }, [footprint, pins]);

  return (
    <canvas
      ref={ref}
      className="rounded-xl border"
      style={{ borderColor: "var(--border)", background: "#0d1118" }}
    />
  );
}

export default function PartEditorDialog({
  onClose,
  initialPartId,
}: {
  onClose: () => void;
  initialPartId?: string;
}) {
  const [tab, setTab] = useState<StudioTab>("subcircuit");
  const [savedParts, setSavedParts] = useState<CustomPartSpec[]>(() => loadCustomParts());
  const [editingId, setEditingId] = useState<string | null>(initialPartId ?? null);

  // Standardmäßig starten wir mit einem ausgewählten eigenen Bauteil (falls übergeben)
  // oder der vollständigen NE555-Transistor-Innenschaltung als Vorlage!
  const initialSpec =
    (initialPartId ? savedParts.find((p) => p.id === initialPartId) : undefined) ??
    SUBCIRCUIT_TEMPLATES[0].spec;

  const [name, setName] = useState(initialSpec.name);
  const [ref, setRef] = useState(initialSpec.ref);
  const [category, setCategory] = useState(initialSpec.category);
  const [footprint, setFootprint] = useState(initialSpec.footprint);
  const [mount, setMount] = useState<"THT" | "SMD" | "both">(initialSpec.mount);
  const [description, setDescription] = useState(initialSpec.description ?? "");
  const [pins, setPins] = useState<CustomPinSpec[]>(initialSpec.pins);
  const [subcircuit, setSubcircuit] = useState<SubcircuitElement[]>(initialSpec.subcircuit ?? []);
  const [customSymbol, setCustomSymbol] = useState<SymbolPrim[]>(initialSpec.customSymbol ?? []);
  const [customParams, setCustomParams] = useState<CustomParamSpec[]>(initialSpec.customParams ?? []);

  const loadSpecIntoStudio = (spec: CustomPartSpec | Omit<CustomPartSpec, "id">, idOverride?: string | null) => {
    setEditingId(idOverride ?? ("id" in spec ? spec.id : null));
    setName(spec.name);
    setRef(spec.ref);
    setCategory(spec.category);
    setFootprint(spec.footprint);
    setMount(spec.mount);
    setDescription(spec.description ?? "");
    setPins(spec.pins.map((p) => ({ ...p })));
    setSubcircuit((spec.subcircuit ?? []).map((el) => ({ ...el, nodes: [...el.nodes] })));
    setCustomSymbol(spec.customSymbol ? [...spec.customSymbol] : []);
    setCustomParams(spec.customParams ? [...spec.customParams] : []);
  };

  const previewSpec: CustomPartSpec = useMemo(
    () => ({
      id: editingId ?? "preview_custom_part",
      name: name.trim() || "Eigenes Bauteil",
      ref: ref.trim() || "U",
      category: category.trim() || "Eigene Bauteile/ICs",
      footprint: footprint.trim() || "DIP-8",
      mount,
      description: description.trim() || undefined,
      modelKind: subcircuit.length > 0 ? "subcircuit" : "ic",
      pins,
      subcircuit,
      customSymbol: customSymbol.length > 0 ? customSymbol : undefined,
      customParams: customParams.length > 0 ? customParams : undefined,
    }),
    [editingId, name, ref, category, footprint, mount, description, pins, subcircuit, customSymbol, customParams],
  );

  // Bekannte Knotennamen für Autocomplete (alle Pin-Knoten + alle internen Knoten)
  const allKnownNodes = useMemo(() => {
    const s = new Set<string>(["VCC", "GND"]);
    for (const p of pins) {
      if (p.internalNode) s.add(p.internalNode);
      if (p.name) s.add(p.name);
    }
    for (const el of subcircuit) {
      for (const nd of el.nodes) {
        if (nd) s.add(nd);
      }
    }
    return Array.from(s);
  }, [pins, subcircuit]);

  const handleImportFromCurrentCanvas = () => {
    const doc = useEditor.getState().doc;
    const extracted = extractSubcircuitFromSchematic(doc);
    if (extracted.subcircuit.length === 0) {
      useEditor.getState().log("warn", "Auf dem aktuellen Schaltplan wurden keine übernehmbaren Bauteile gefunden.");
      return;
    }
    setPins(extracted.pins);
    setSubcircuit(extracted.subcircuit);
    setName(doc.name ? `${doc.name} (IC)` : "Schaltplan-Modul");
    useEditor
      .getState()
      .log(
        "ok",
        `${extracted.subcircuit.length} Bauteile und ${extracted.pins.length} Pins vom aktuellen Schaltplan als Innenschaltung übernommen.`,
      );
  };

  const addSubcircuitElement = (kind: SubcircuitElementKind) => {
    const meta = SUBCIRCUIT_ELEMENT_META[kind];
    const countOfKind = subcircuit.filter((e) => e.kind === kind).length + 1;
    const newId = `${meta.refPrefix}${countOfKind}`;
    const defaultNodes = meta.pinLabels.map((_, idx) => {
      if (idx === 0) return pins[0]?.internalNode || pins[0]?.name || "VCC";
      if (idx === meta.pinLabels.length - 1) return "GND";
      return `N_${newId}_${idx}`;
    });
    setSubcircuit((prev) => [
      ...prev,
      {
        id: newId,
        kind,
        label: meta.title,
        nodes: defaultNodes,
        value: meta.defaultValue,
      },
    ]);
  };

  const handleSaveAndPlace = (placeImmediately: boolean) => {
    const cleanName = name.trim() || "Eigenes Bauteil";
    const id =
      editingId ??
      `custom_${cleanName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_${Date.now().toString(36).slice(-4)}`;
    const finalSpec: CustomPartSpec = {
      ...previewSpec,
      id,
      name: cleanName,
      pins: pins.map((p, idx) => ({
        ...p,
        name: p.name.trim() || `${idx + 1}`,
        internalNode: (p.internalNode || p.name || `${idx + 1}`).trim(),
      })),
    };
    const nextList = saveCustomPart(finalSpec);
    setSavedParts(nextList);
    setEditingId(id);
    if (placeImmediately) {
      useEditor.getState().setPlacing(id);
      useEditor
        .getState()
        .log(
          "ok",
          `Eigenes Bauteil „${cleanName}“ (${finalSpec.footprint}, ${finalSpec.pins.length} Pins, ${finalSpec.subcircuit?.length ?? 0} Innenschaltungs-Elemente) gespeichert – Klick auf den Schaltplan platziert es`,
        );
      onClose();
    } else {
      useEditor.getState().log("ok", `Bauteil „${cleanName}“ in der Bibliothek gespeichert.`);
    }
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(previewSpec, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(previewSpec.name || "bauteil").toLowerCase().replace(/\s+/g, "-")}.multispice-part.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as CustomPartSpec;
        if (parsed && parsed.name && Array.isArray(parsed.pins)) {
          loadSpecIntoStudio(parsed, parsed.id);
          useEditor.getState().log("ok", `Bauteil-Definition „${parsed.name}“ geladen.`);
        }
      } catch {
        useEditor.getState().log("error", "Ungültige Bauteil-JSON-Datei.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <Dialog
      onClose={onClose}
      title="Bauteil-Studio – Innenschaltung, Schaltsymbol & Gehäuse"
      wide
      actions={null}
    >
      <div className="flex flex-col gap-4 p-4">
        {/* Obere Kopfzeile: Bauteil-Grunddaten + 4 Studio-Reiter */}
        <div
          className="flex flex-col gap-3 rounded-xl border p-3"
          style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}
        >
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
            <div className="md:col-span-2">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-mute">
                Bauteilname / Typenbezeichnung
              </label>
              <input
                className="input h-8 text-[12px] font-medium"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. NE555 Transistor-Timer"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-mute">
                Referenz-Kürzel
              </label>
              <input
                className="input mono h-8 text-[12px]"
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="U / Q / IC"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-mute">
                Gehäuse (Footprint)
              </label>
              <input
                className="input mono h-8 text-[12px]"
                value={footprint}
                onChange={(e) => setFootprint(e.target.value)}
                placeholder="DIP-8 / TO-220"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-mute">
                Kategorie
              </label>
              <input
                className="input h-8 text-[12px]"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="Eigene Bauteile/ICs"
              />
            </div>
          </div>

          {/* 4 Studio-Reiter */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2.5" style={{ borderColor: "var(--border)" }}>
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ["subcircuit", "1. Innenschaltung (Transistoren & Knoten)", <CircuitBoard key="1" size={13} />],
                  ["symbol", "2. Schaltsymbol zeichnen & beschriften", <PenTool key="2" size={13} />],
                  ["pins_package", "3. Ein-/Ausgangs-Pins & Gehäuse", <Package key="3" size={13} />],
                  ["manage", `4. Parameter & Bibliothek (${savedParts.length})`, <Sliders key="4" size={13} />],
                ] as const
              ).map(([id, label, icon]) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11.5px] font-medium transition-colors"
                    style={
                      active
                        ? {
                            background: "color-mix(in srgb, var(--wire-sel, #f59e0b) 20%, transparent)",
                            color: "var(--wire-sel, #f59e0b)",
                            border: "1px solid var(--wire-sel, #f59e0b)",
                          }
                        : { color: "var(--text-dim)", border: "1px solid transparent" }
                    }
                  >
                    {icon}
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                className="btn h-7 gap-1 px-2.5 text-[11px]"
                onClick={handleExportJson}
                title="Bauteil als JSON-Datei exportieren"
              >
                <Download size={12} /> JSON-Export
              </button>
              <label className="btn h-7 cursor-pointer gap-1 px-2.5 text-[11px]" title="Bauteil-JSON laden">
                <Upload size={12} /> JSON-Import
                <input type="file" accept=".json" className="hidden" onChange={handleImportJson} />
              </label>
            </div>
          </div>
        </div>

        {/* ==================== TAB 1: INNENSCHALTUNG ==================== */}
        {tab === "subcircuit" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_376px]">
            <div className="flex flex-col gap-3">
              {/* Vorlagen & Schaltplan-Übernahme */}
              <div
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-2.5"
                style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-[var(--wire-sel)]">
                    <Sparkles size={13} /> Vorlage laden:
                  </span>
                  {SUBCIRCUIT_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => loadSpecIntoStudio(tpl.spec, null)}
                      className="btn h-7 px-2.5 text-[11px]"
                      title={tpl.subtitle}
                    >
                      {tpl.title.split(" (")[0]}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleImportFromCurrentCanvas}
                  className="btn h-7 gap-1 px-2.5 text-[11px]"
                  style={{
                    borderColor: "var(--accent-2, #22d3ee)",
                    color: "var(--accent-2, #22d3ee)",
                  }}
                  title="Übernimmt alle Bauteile und Netzlabels vom aktuellen Haupt-Schaltplan als Innenschaltung"
                >
                  <Layers size={12} /> Vom Schaltplan übernehmen
                </button>
              </div>

              {/* Schnell-Palette zum Hinzufügen interner Transistoren & Bauteile */}
              <div className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[10.5px] font-semibold uppercase tracking-wider text-mute">
                  + Bauteil zur Innenschaltung:
                </span>
                {(
                  [
                    ["npn", "+ NPN-Transistor"],
                    ["pnp", "+ PNP-Transistor"],
                    ["nmos", "+ NMOS"],
                    ["pmos", "+ PMOS"],
                    ["resistor", "+ Widerstand (R)"],
                    ["capacitor", "+ Kondensator (C)"],
                    ["diode", "+ Diode"],
                    ["zener", "+ Zener"],
                    ["comparator", "+ Komparator"],
                    ["opamp", "+ OPV-Stufe"],
                    ["vdc", "+ Referenzquelle"],
                  ] as Array<[SubcircuitElementKind, string]>
                ).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => addSubcircuitElement(kind)}
                    className="btn h-6 px-2 text-[10.5px]"
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Liste der internen Bauteile mit Knoten-Zuordnung */}
              <div
                className="max-h-[340px] space-y-2 overflow-y-auto rounded-xl border p-2.5"
                style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}
              >
                <datalist id="subcircuit-known-nodes">
                  {allKnownNodes.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>

                {subcircuit.map((el, idx) => {
                  const meta = SUBCIRCUIT_ELEMENT_META[el.kind];
                  return (
                    <div
                      key={`${el.id}_${idx}`}
                      className="rounded-xl border p-2.5 transition-colors"
                      style={{ borderColor: "var(--border)", background: "var(--panel-solid)" }}
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <input
                            className="input mono h-6 px-2 text-[11.5px] font-bold"
                            style={{ width: 88, color: "var(--wire-sel, #f59e0b)" }}
                            value={el.id}
                            onChange={(e) => {
                              const v = e.target.value;
                              setSubcircuit((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, id: v } : item)),
                              );
                            }}
                          />
                          <select
                            className="input h-6 px-2 text-[11px]"
                            style={{ width: 175 }}
                            value={el.kind}
                            onChange={(e) => {
                              const nextKind = e.target.value as SubcircuitElementKind;
                              const nextMeta = SUBCIRCUIT_ELEMENT_META[nextKind];
                              setSubcircuit((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        kind: nextKind,
                                        value: nextMeta.defaultValue,
                                        nodes: nextMeta.pinLabels.map((_, ni) => item.nodes[ni] ?? "GND"),
                                      }
                                    : item,
                                ),
                              );
                            }}
                          >
                            {Object.entries(SUBCIRCUIT_ELEMENT_META).map(([k, m]) => (
                              <option key={k} value={k}>
                                {m.title}
                              </option>
                            ))}
                          </select>
                          <input
                            className="input h-6 px-2 text-[11px]"
                            style={{ width: 190 }}
                            value={el.label ?? ""}
                            placeholder="Beschreibung (z. B. Entlade-NPN)"
                            onChange={(e) => {
                              const v = e.target.value;
                              setSubcircuit((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, label: v } : item)),
                              );
                            }}
                          />
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span className="text-[10.5px] text-mute">{meta.valueLabel}:</span>
                          <input
                            type="number"
                            step="any"
                            className="input mono h-6 px-2 text-[11px]"
                            style={{ width: 82 }}
                            value={el.value}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              setSubcircuit((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, value: v } : item)),
                              );
                            }}
                          />
                          {meta.unit && <span className="mono text-[10.5px] text-mute">{meta.unit}</span>}
                          <button
                            type="button"
                            onClick={() => setSubcircuit((prev) => prev.filter((_, i) => i !== idx))}
                            className="ml-1 grid h-6 w-6 place-items-center rounded text-mute hover:text-[#f87171]"
                            title="Bauteil aus Innenschaltung löschen"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Anschlüsse / Knoten dieses internen Bauteils */}
                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        {meta.pinLabels.map((pLabel, nIdx) => {
                          const nodeVal = el.nodes[nIdx] ?? "";
                          const isExternalPort = pins.some(
                            (p) => (p.internalNode || p.name).toUpperCase() === nodeVal.toUpperCase(),
                          );
                          return (
                            <div
                              key={nIdx}
                              className="flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[10.5px]"
                              style={{
                                borderColor: isExternalPort ? "var(--wire-sel, #f59e0b)" : "var(--border)",
                                background: "var(--bg)",
                              }}
                            >
                              <span className="text-mute">{pLabel}:</span>
                              <input
                                list="subcircuit-known-nodes"
                                className="mono bg-transparent font-semibold text-[var(--text)] outline-none"
                                style={{ width: 78 }}
                                value={nodeVal}
                                placeholder="Knoten …"
                                onChange={(e) => {
                                  const nextNode = e.target.value;
                                  setSubcircuit((prev) =>
                                    prev.map((item, i) => {
                                      if (i !== idx) return item;
                                      const nextNodes = [...item.nodes];
                                      nextNodes[nIdx] = nextNode;
                                      return { ...item, nodes: nextNodes };
                                    }),
                                  );
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Rechte Spalte in Tab 1: Topologie-Vorschau & Außen-Pin-Kurzübersicht */}
            <div className="flex flex-col gap-3">
              <div
                className="flex flex-col items-center rounded-xl border p-3"
                style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}
              >
                <div className="mb-2 flex w-full items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">
                    Innenschaltungs-Topologie
                  </span>
                  <span className="mono text-[10.5px] text-[var(--wire-sel)]">
                    {subcircuit.length} Elemente · {pins.length} Außen-Pins
                  </span>
                </div>
                <SubcircuitTopologyPreview pins={pins} subcircuit={subcircuit} />
                <div className="mt-2 text-[10.5px] text-mute">
                  Jeder Pin-Name (z. B. <span className="mono text-[var(--text)]">VCC, TRIG, THR, DIS, OUT, GND</span>) verbindet die Innenschaltung direkt mit dem äußeren Schaltplan-Pin.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: SYMBOL ZEICHNEN & BESCHRIFTEN ==================== */}
        {tab === "symbol" && (
          <SymbolCanvasEditor
            spec={previewSpec}
            onUpdateSymbol={setCustomSymbol}
            onUpdatePins={setPins}
          />
        )}

        {/* ==================== TAB 3: PINS & GEHÄUSE ==================== */}
        {tab === "pins_package" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_290px]">
            <div
              className="flex flex-col rounded-xl border p-3"
              style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}
            >
              <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">
                    Ein- und Ausgangs-Pins ({pins.length})
                  </span>
                  <select
                    className="input h-7 px-2 text-[11px]"
                    style={{ width: 210 }}
                    value=""
                    onChange={(e) => {
                      const preset = PACKAGE_PRESETS.find((p) => p.id === e.target.value);
                      if (preset) {
                        setFootprint(preset.id);
                        setMount(preset.mount);
                        setPins(preset.pins.map((p) => ({ ...p })));
                      }
                    }}
                  >
                    <option value="">Gehäuse-Vorlage anwenden …</option>
                    {PACKAGE_PRESETS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="btn h-7 gap-1 px-2.5 text-[11px]"
                  onClick={() =>
                    setPins((prev) => [
                      ...prev,
                      {
                        name: `P${prev.length + 1}`,
                        side: prev.length % 2 === 0 ? "left" : "right",
                        role: "signal",
                        internalNode: `P${prev.length + 1}`,
                      },
                    ])
                  }
                >
                  <Plus size={12} /> Pin hinzufügen
                </button>
              </div>

              <div className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                {pins.map((pin, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[26px_1fr_110px_120px_100px_110px_28px] items-center gap-1.5 rounded-lg border px-2 py-1.5"
                    style={{ borderColor: "var(--border)", background: "var(--panel-solid)" }}
                  >
                    <span className="mono text-center text-[11px] font-bold text-mute">#{idx + 1}</span>
                    <input
                      className="input mono h-7 px-2 text-[11.5px] font-semibold"
                      value={pin.name}
                      placeholder="Pin-Name"
                      onChange={(e) => {
                        const val = e.target.value;
                        setPins((prev) =>
                          prev.map((item, i) =>
                            i === idx
                              ? {
                                  ...item,
                                  name: val,
                                  internalNode:
                                    !item.internalNode || item.internalNode === item.name
                                      ? val
                                      : item.internalNode,
                                }
                              : item,
                          ),
                        );
                      }}
                    />
                    <select
                      className="input h-7 px-1.5 text-[11px]"
                      value={pin.role}
                      onChange={(e) => {
                        const r = e.target.value as PinRole;
                        setPins((prev) => prev.map((item, i) => (i === idx ? { ...item, role: r } : item)));
                      }}
                      title="Elektrische Rolle (Eingang, Ausgang, Versorgung, Masse)"
                    >
                      <option value="input">Eingang (IN)</option>
                      <option value="output">Ausgang (OUT)</option>
                      <option value="signal">Bidir. / Signal</option>
                      <option value="vcc">Versorgung (+VCC)</option>
                      <option value="gnd">Masse (GND)</option>
                    </select>
                    <input
                      list="subcircuit-known-nodes"
                      className="input mono h-7 px-2 text-[11px]"
                      value={pin.internalNode ?? pin.name}
                      placeholder="Interner Knoten"
                      title="Verknüpfter Knotenname in der Innenschaltung"
                      onChange={(e) => {
                        const nd = e.target.value;
                        setPins((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, internalNode: nd } : item)),
                        );
                      }}
                    />
                    <select
                      className="input h-7 px-1.5 text-[11px]"
                      value={pin.side}
                      onChange={(e) => {
                        const s = e.target.value as PinSide;
                        setPins((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, side: s, x: undefined, y: undefined } : item,
                          ),
                        );
                      }}
                    >
                      <option value="left">Links</option>
                      <option value="right">Rechts</option>
                      <option value="top">Oben</option>
                      <option value="bottom">Unten</option>
                    </select>
                    <select
                      className="input h-7 px-1.5 text-[11px]"
                      value={pin.marker ?? "none"}
                      onChange={(e) => {
                        const m = e.target.value as PinMarker;
                        setPins((prev) => prev.map((item, i) => (i === idx ? { ...item, marker: m } : item)));
                      }}
                      title="Pin-Markierung am Schaltsymbol"
                    >
                      <option value="none">Standard</option>
                      <option value="invert">Invertiert (○)</option>
                      <option value="clock">Takt (▷)</option>
                    </select>
                    <button
                      type="button"
                      disabled={pins.length <= 2}
                      onClick={() => setPins((prev) => prev.filter((_, i) => i !== idx))}
                      className="grid h-7 w-7 place-items-center rounded text-mute hover:text-[#f87171] disabled:opacity-30"
                      title="Pin entfernen"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Rechte Spalte in Tab 3: Physische Gehäuse-Draufsicht */}
            <div
              className="flex flex-col items-center rounded-xl border p-3"
              style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}
            >
              <div className="mb-2 flex w-full items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">
                  Gehäuse-Draufsicht
                </span>
                <select
                  className="input h-6 px-1.5 text-[10.5px]"
                  style={{ width: 90 }}
                  value={mount}
                  onChange={(e) => setMount(e.target.value as "THT" | "SMD" | "both")}
                >
                  <option value="THT">THT</option>
                  <option value="SMD">SMD</option>
                  <option value="both">THT/SMD</option>
                </select>
              </div>
              <PackageTopView footprint={footprint} pins={pins} />
              <div className="mt-2.5 flex flex-wrap justify-center gap-2 text-[10px]">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#38bdf8]" /> IN
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> OUT
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#f87171]" /> VCC
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-[#4ade80]" /> GND
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: PARAMETER & VERWALTUNG ==================== */}
        {tab === "manage" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Eigene Bauteil-Parameter */}
            <div
              className="flex flex-col rounded-xl border p-3"
              style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">
                  Einstellbare Bauteil-Parameter ({customParams.length})
                </span>
                <button
                  type="button"
                  className="btn h-7 gap-1 px-2.5 text-[11px]"
                  onClick={() =>
                    setCustomParams((prev) => [
                      ...prev,
                      { key: `p${prev.length + 1}`, label: "Parameter", unit: "Ω", def: 1000 },
                    ])
                  }
                >
                  <Plus size={12} /> Parameter hinzufügen
                </button>
              </div>
              <div className="space-y-1.5">
                {customParams.map((cp, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-[90px_1fr_65px_90px_28px] items-center gap-1.5 rounded-lg border px-2 py-1.5"
                    style={{ borderColor: "var(--border)", background: "var(--panel-solid)" }}
                  >
                    <input
                      className="input mono h-7 px-2 text-[11px]"
                      value={cp.key}
                      placeholder="Key"
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomParams((prev) => prev.map((it, i) => (i === idx ? { ...it, key: v } : it)));
                      }}
                    />
                    <input
                      className="input h-7 px-2 text-[11px]"
                      value={cp.label}
                      placeholder="Anzeigename"
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomParams((prev) => prev.map((it, i) => (i === idx ? { ...it, label: v } : it)));
                      }}
                    />
                    <input
                      className="input mono h-7 px-2 text-[11px]"
                      value={cp.unit}
                      placeholder="Einheit"
                      onChange={(e) => {
                        const v = e.target.value;
                        setCustomParams((prev) => prev.map((it, i) => (i === idx ? { ...it, unit: v } : it)));
                      }}
                    />
                    <input
                      type="number"
                      step="any"
                      className="input mono h-7 px-2 text-[11px]"
                      value={cp.def}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setCustomParams((prev) => prev.map((it, i) => (i === idx ? { ...it, def: v } : it)));
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setCustomParams((prev) => prev.filter((_, i) => i !== idx))}
                      className="grid h-7 w-7 place-items-center text-mute hover:text-[#f87171]"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-mute">
                  Technische Beschreibung / Datenblatt-Notiz
                </label>
                <textarea
                  className="input min-h-[72px] w-full p-2 text-[11.5px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Funktionsweise der Innenschaltung, Pinbelegung, Grenzwerte …"
                />
              </div>
            </div>

            {/* Gespeicherte eigene Bauteile */}
            <div
              className="flex flex-col rounded-xl border p-3"
              style={{ borderColor: "var(--border)", background: "var(--panel-2)" }}
            >
              <span className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-mute">
                Gespeicherte eigene Bauteile ({savedParts.length})
              </span>
              {savedParts.length === 0 ? (
                <div className="flex flex-1 items-center justify-center py-8 text-center text-[11.5px] text-mute">
                  Noch keine eigenen Bauteile gespeichert. Klicke unten rechts auf „Speichern & Platzieren“.
                </div>
              ) : (
                <div className="max-h-[260px] space-y-1.5 overflow-y-auto pr-1">
                  {savedParts.map((sp) => (
                    <div
                      key={sp.id}
                      className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                      style={{ borderColor: "var(--border)", background: "var(--panel-solid)" }}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold">{sp.name}</div>
                        <div className="mono text-[10px] text-mute">
                          {sp.ref} · {sp.footprint} · {sp.pins.length} Pins · {sp.subcircuit?.length ?? 0} interne Bauteile
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="btn h-6 px-2 text-[10.5px]"
                          onClick={() => {
                            loadSpecIntoStudio(sp, sp.id);
                            setTab("subcircuit");
                          }}
                        >
                          Im Studio laden
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary h-6 px-2 text-[10.5px]"
                          onClick={() => {
                            useEditor.getState().setPlacing(sp.id);
                            onClose();
                          }}
                        >
                          Platzieren
                        </button>
                        <button
                          type="button"
                          className="btn h-6 px-1.5 text-[10.5px] text-[#f87171]"
                          onClick={() => setSavedParts(deleteCustomPart(sp.id))}
                          title="Aus Bibliothek löschen"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Fußzeile: Aktionsknöpfe */}
        <div
          className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"
          style={{ borderColor: "var(--border)" }}
        >
          <div className="flex items-center gap-2 text-[11px] text-mute">
            <Cpu size={14} className="text-[var(--wire-sel)]" />
            <span>
              {editingId ? `Bearbeite Bauteil (${editingId})` : "Neues eigenes Bauteil"} ·{" "}
              <strong className="text-[var(--text)]">{pins.length} Pins</strong> ·{" "}
              <strong className="text-[var(--text)]">{subcircuit.length} Innenschaltungs-Elemente</strong>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="btn h-8 px-3 text-[12px]" onClick={onClose}>
              Schließen
            </button>
            <button
              type="button"
              className="btn h-8 px-3 text-[12px]"
              onClick={() => handleSaveAndPlace(false)}
            >
              In Bibliothek speichern
            </button>
            <button
              type="button"
              className="btn btn-primary h-8 gap-1.5 px-4 text-[12px]"
              onClick={() => handleSaveAndPlace(true)}
            >
              <Check size={14} />
              <span>Speichern & auf Schaltplan platzieren</span>
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
