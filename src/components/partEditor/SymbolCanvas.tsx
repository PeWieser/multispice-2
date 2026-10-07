"use client";

/* S6.2 (Phase 2): Aus dem alten Bauteil-Studio extrahiert — interaktiver
   Vektor-Zeicheneditor für das Schaltsymbol inkl. freier Pin-Platzierung.
   Unverändertes Verhalten; die Shell liefert Spec + Callbacks. */

import { canvasColor } from "@/lib/canvas-theme";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CustomPartSpec,
  CustomPinSpec,
  PinRole,
  buildCustomGeometry,
} from "@/lib/library/customParts";
import { SymbolPrim } from "@/lib/library/catalog";
import {
  Trash2,
  MousePointer,
  Minus,
  Square,
  Circle as CircleIcon,
  Type,
  Move,
  RotateCcw,
} from "lucide-react";

type DrawTool = "select" | "line" | "rect" | "circle" | "arc" | "text" | "pin";

const PIN_ROLE_COLORS: Record<PinRole, string> = {
  input: "#38bdf8",
  output: "#f59e0b",
  signal: "#94a3b8",
  vcc: "#f87171",
  gnd: "#4ade80",
};

/**
 * Interaktiver Vektor-Zeicheneditor für das Schaltsymbol & freie Pin-Platzierung (Tab 2)
 */
export function SymbolCanvasEditor({
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
      ctx.strokeStyle = isSel ? canvasColor("--wire-sel") : "#e2e8f0";
      ctx.fillStyle = isSel ? canvasColor("--wire-sel") : "#e2e8f0";
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
      ctx.fillStyle = isPinSel ? canvasColor("--wire-sel") : roleColor;
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
          className="flex flex-wrap items-center gap-1 rounded-xl border p-1.5 border-hairline bg-surface-2"
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
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-2xs font-medium transition-colors"
                style={
                  active
                    ? {
                        background: "color-mix(in srgb, var(--wire-sel) 20%, transparent)",
                        color: "var(--wire-sel)",
                        border: "1px solid var(--wire-sel)",
                      }
                    : { color: "var(--ink-2)", border: "1px solid transparent" }
                }
              >
                {icon}
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Zusatzleiste für Textwerkzeug & Vorlagen */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-2xs">
          <div className="flex items-center gap-1.5">
            <span className="text-ink-3">Text:</span>
            <input
              className="input h-7 px-2 text-2xs"
              style={{ width: 110 }}
              value={newTextValue}
              onChange={(e) => setNewTextValue(e.target.value)}
              placeholder="Beschriftung …"
            />
            <select
              className="input h-7 px-1.5 text-2xs"
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
              className="btn h-7 px-2 text-2xs"
              onClick={() => applySymbolTemplate("auto_ic")}
              title="Standard-IC-Gehäuse automatisch aus den Pins berechnen" aria-label="Standard-IC-Gehäuse automatisch aus den Pins berechnen"
            >
              Auto-IC
            </button>
            <button
              type="button"
              className="btn h-7 px-2 text-2xs"
              onClick={() => applySymbolTemplate("transistor")}
              title="Transistor-Grundsymbol laden" aria-label="Transistor-Grundsymbol laden"
            >
              Transistor-Form
            </button>
            <button
              type="button"
              className="btn h-7 px-2 text-2xs"
              onClick={() => applySymbolTemplate("triangle")}
              title="Verstärker-/Komparator-Dreieck laden" aria-label="Verstärker-/Komparator-Dreieck laden"
            >
              OPV-Dreieck
            </button>
          </div>
        </div>

        {/* Interaktives Zeichen-Canvas */}
        <div className="flex flex-col items-center justify-center rounded-xl border p-2" style={{ borderColor: "var(--hairline)", background: "#090c12" }}>
          <canvas
            ref={canvasRef}
            className="cursor-crosshair rounded-lg"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          <div className="mt-1.5 flex w-full items-center justify-between px-2 text-2xs text-ink-3 mono">
            <span>Koordinate: ({cursorPt.x}, {cursorPt.y})</span>
            <span>Farbpunkte = Elektrische Pin-Anker (10-px-Raster)</span>
          </div>
        </div>
      </div>

      {/* Rechte Spalte: Element-Liste & Eigenschaften im Symbol */}
      <div
        className="flex flex-col rounded-xl border p-3 border-hairline bg-surface-2"
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-2xs font-semibold uppercase tracking-wider text-ink-3">
            Gezeichnete Elemente ({activePrims.length})
          </span>
          {selectedPrimIdx !== null && (
            <button
              type="button"
              className="btn btn-danger h-6 gap-1 px-2 text-2xs"
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
            className="mb-3 space-y-2 rounded-lg border p-2.5 text-2xs"
            style={{ borderColor: "var(--wire-sel)", background: "var(--surface)" }}
          >
            <div className="font-semibold text-selection">
              Ausgewählt: {selectedPrim.t.toUpperCase()} #{selectedPrimIdx + 1}
            </div>
            {selectedPrim.t === "text" && (
              <div className="space-y-1.5">
                <label className="block text-2xs text-ink-3">Beschriftungstext</label>
                <input
                  className="input h-7 text-2xs"
                  value={selectedPrim.s}
                  onChange={(e) => {
                    const next = ensureEditableSymbol();
                    next[selectedPrimIdx] = { ...selectedPrim, s: e.target.value };
                    onUpdateSymbol(next);
                  }}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <div>
                    <label className="block text-2xs text-ink-3">Größe</label>
                    <input
                      type="number"
                      className="input h-7 text-2xs"
                      value={selectedPrim.size ?? 8}
                      onChange={(e) => {
                        const next = ensureEditableSymbol();
                        next[selectedPrimIdx] = { ...selectedPrim, size: Number(e.target.value) || 8 };
                        onUpdateSymbol(next);
                      }}
                    />
                  </div>
                  <div>
                    <label className="block text-2xs text-ink-3">Ausrichtung</label>
                    <select
                      className="input h-7 text-2xs"
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
              <label className="flex items-center gap-2 text-2xs">
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
                className="flex cursor-pointer items-center justify-between rounded-lg border px-2.5 py-1.5 text-2xs transition-colors"
                style={
                  active
                    ? {
                        borderColor: "var(--wire-sel)",
                        background: "color-mix(in srgb, var(--wire-sel) 14%, transparent)",
                      }
                    : { borderColor: "var(--hairline)", background: "var(--surface)" }
                }
              >
                <span className="truncate mono text-2xs">{summary}</span>
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    const next = ensureEditableSymbol().filter((_, i) => i !== idx);
                    onUpdateSymbol(next);
                    if (selectedPrimIdx === idx) setSelectedPrimIdx(null);
                  }}
                  className="text-ink-3 hover:text-err"
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
