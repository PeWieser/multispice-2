"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  compTransform,
  type Component,
  type Probe,
  type Vec,
} from "@/lib/domain/types";
import { componentValue, getDef } from "@/lib/domain/library";
import { pinPos, routeOrthogonal } from "@/lib/domain/connectivity";
import { snap, useApp } from "@/lib/state/store";

/** Imperative view commands shared with the menus / keyboard layer. */
export const viewApi = {
  fit: () => {},
  zoomIn: () => {},
  zoomOut: () => {},
  zoomTo: (_x: number, _y: number, _w: number, _h: number) => {},
  toWorld: (_sx: number, _sy: number): Vec => ({ x: 0, y: 0 }),
};

type HitKind = "component" | "wire" | "label" | "probe" | "instrument";
interface Hit {
  id: string;
  kind: HitKind;
}

export default function Canvas() {
  const project = useApp((s) => s.project);
  const graph = useApp((s) => s.graph);
  const selection = useApp((s) => s.selection);
  const tool = useApp((s) => s.tool);
  const placeDefId = useApp((s) => s.placeDefId);
  const placeLabelKind = useApp((s) => s.placeLabelKind);
  const wireDraft = useApp((s) => s.wireDraft);
  const netHighlight = useApp((s) => s.netHighlight);
  const ui = project.ui;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState({ x: 60, y: 40, zoom: 1 });
  const [size, setSize] = useState({ w: 1200, h: 700 });
  const [dragOffset, setDragOffset] = useState<Vec | null>(null);
  const [marquee, setMarquee] = useState<{ a: Vec; b: Vec } | null>(null);
  const [cursor, setCursor] = useState<Vec>({ x: 0, y: 0 });
  const [hover, setHover] = useState<string | null>(null);
  const [ghost, setGhost] = useState<Vec | null>(null);
  const spaceRef = useRef(false);
  const dragRef = useRef<{
    mode: "none" | "pan" | "move" | "marquee";
    startScreen: Vec;
    startWorld: Vec;
    moved: boolean;
  }>({ mode: "none", startScreen: { x: 0, y: 0 }, startWorld: { x: 0, y: 0 }, moved: false });

  const sheet = project.sheets.find((s) => s.id === project.activeSheetId) ?? project.sheets[0];

  /* --------------------------- viewport ---------------------------- */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: r.width, h: r.height });
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    setSize({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  const toWorld = useCallback(
    (sx: number, sy: number): Vec => {
      const el = svgRef.current;
      const rect = el?.getBoundingClientRect();
      const px = sx - (rect?.left ?? 0);
      const py = sy - (rect?.top ?? 0);
      return { x: (px - view.x) / view.zoom, y: (py - view.y) / view.zoom };
    },
    [view],
  );

  const fit = useCallback(() => {
    const pts: Vec[] = [];
    for (const c of sheet.components) pts.push({ x: c.x, y: c.y });
    for (const w of sheet.wires) pts.push(...w.points);
    if (!pts.length) {
      setView({ x: 60, y: 40, zoom: 1 });
      return;
    }
    const minX = Math.min(...pts.map((p) => p.x)) - 80;
    const maxX = Math.max(...pts.map((p) => p.x)) + 80;
    const minY = Math.min(...pts.map((p) => p.y)) - 80;
    const maxY = Math.max(...pts.map((p) => p.y)) + 80;
    const zoom = Math.min(size.w / (maxX - minX), size.h / (maxY - minY), 2.2);
    setView({
      x: (size.w - (maxX - minX) * zoom) / 2 - minX * zoom,
      y: (size.h - (maxY - minY) * zoom) / 2 - minY * zoom,
      zoom,
    });
  }, [sheet, size]);

  useEffect(() => {
    viewApi.fit = fit;
    viewApi.zoomIn = () => setView((v) => ({ ...v, zoom: Math.min(6, v.zoom * 1.25) }));
    viewApi.zoomOut = () => setView((v) => ({ ...v, zoom: Math.max(0.08, v.zoom / 1.25) }));
    viewApi.zoomTo = (x, y, w, h) => {
      const zoom = Math.min(size.w / (w + 120), size.h / (h + 120), 3);
      setView({
        x: (size.w - (w + 120) * zoom) / 2 - (x - 60) * zoom,
        y: (size.h - (h + 120) * zoom) / 2 - (y - 60) * zoom,
        zoom,
      });
    };
    viewApi.toWorld = toWorld;
  }, [fit, size, toWorld]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = e.type === "keydown";
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, []);

  /* ---------------------------- hit test --------------------------- */
  const hitTest = useCallback(
    (p: Vec): Hit | null => {
      const tol = 8 / view.zoom;
      for (const pr of sheet.probes) {
        if (Math.hypot(pr.x - p.x, pr.y - p.y) < 12 / view.zoom) return { id: pr.id, kind: "probe" };
      }
      for (const c of sheet.components) {
        const def = getDef(c.defId);
        const r = def ? Math.max(34, def.pins.length * 8) : 34;
        if (Math.abs(c.x - p.x) < r && Math.abs(c.y - p.y) < r) {
          // refine: pin proximity or body proximity
          let near = Math.hypot(c.x - p.x, c.y - p.y) < 22;
          if (!near && def) {
            for (const pin of def.pins) {
              const w = pinPos(c, pin);
              if (Math.hypot(w.x - p.x, w.y - p.y) < 10 / view.zoom) {
                near = true;
                break;
              }
            }
          }
          if (near) return { id: c.id, kind: "component" };
        }
      }
      for (const w of sheet.wires) {
        for (let i = 0; i < w.points.length - 1; i++) {
          const a = w.points[i];
          const b = w.points[i + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len2 = dx * dx + dy * dy || 1;
          const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
          const px = a.x + t * dx;
          const py = a.y + t * dy;
          if (Math.hypot(px - p.x, py - p.y) < tol) return { id: w.id, kind: "wire" };
        }
      }
      for (const l of sheet.labels) {
        if (Math.abs(l.x - p.x) < 40 && Math.abs(l.y - p.y) < 14) return { id: l.id, kind: "label" };
      }
      return null;
    },
    [sheet, view.zoom],
  );

  const netAt = useCallback(
    (p: Vec): string | null => {
      const hit = hitTest(p);
      if (!hit) return null;
      if (hit.kind === "wire") {
        const w = sheet.wires.find((x) => x.id === hit.id);
        const net = graph.nets.find((n) => w && n.wireIds.includes(w.id));
        return net?.id ?? null;
      }
      if (hit.kind === "component") {
        const c = sheet.components.find((x) => x.id === hit.id);
        const def = c ? getDef(c.defId) : undefined;
        if (c && def) {
          for (const pin of def.pins) {
            const w = pinPos(c, pin);
            if (Math.hypot(w.x - p.x, w.y - p.y) < 10) {
              return graph.pinToNet[`${c.id}:${pin.id}`] ?? null;
            }
          }
        }
      }
      return null;
    },
    [hitTest, sheet, graph],
  );

  /* --------------------------- interaction ------------------------- */
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = toWorld(e.clientX, e.clientY);
    const grid = ui.gridSize;
    const sp = { x: snap(p.x, grid, ui.snap), y: snap(p.y, grid, ui.snap) };

    if (e.button === 1 || spaceRef.current || tool === "pan") {
      dragRef.current = {
        mode: "pan",
        startScreen: { x: e.clientX, y: e.clientY },
        startWorld: { x: view.x, y: view.y },
        moved: false,
      };
      return;
    }
    if (e.button !== 0) return;

    const actions = useApp.getState();
    if (tool === "wire" || tool === "bus") {
      const draft = wireDraft ? [...wireDraft] : [];
      if (draft.length) {
        const last = draft[draft.length - 1];
        const seg = routeOrthogonal(last, sp);
        draft.push(...seg.slice(1));
      } else {
        draft.push(sp);
      }
      useApp.setState({ wireDraft: draft });
      return;
    }
    if (tool === "place" && placeDefId) {
      actions.placeComponent(placeDefId, sp.x, sp.y);
      return;
    }
    if (tool === "place" && placeLabelKind) {
      const text =
        placeLabelKind === "net" ? "NET1" : placeLabelKind === "global" ? "SIG" : "Note";
      actions.addLabel(placeLabelKind, text, sp.x, sp.y);
      return;
    }
    if (tool === "label") {
      actions.addLabel("net", "NET1", sp.x, sp.y);
      return;
    }
    if (tool === "power") {
      actions.placeComponent("gnd", sp.x, sp.y);
      return;
    }
    if (tool === "probe") {
      actions.addProbeAt(sp.x, sp.y);
      return;
    }
    if (tool === "instrument") {
      actions.addInstrumentAt(actions.instrumentKind, sp.x, sp.y);
      return;
    }

    const hit = hitTest(p);
    if (hit) {
      const isSel = selection.includes(hit.id);
      let next = selection;
      if (e.shiftKey) next = isSel ? selection.filter((s) => s !== hit.id) : [...selection, hit.id];
      else if (!isSel) next = [hit.id];
      actions.select(next);
      dragRef.current = {
        mode: "move",
        startScreen: { x: e.clientX, y: e.clientY },
        startWorld: p,
        moved: false,
      };
    } else {
      if (!e.shiftKey) actions.select([]);
      dragRef.current = {
        mode: "marquee",
        startScreen: { x: e.clientX, y: e.clientY },
        startWorld: p,
        moved: false,
      };
      setMarquee({ a: p, b: p });
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = toWorld(e.clientX, e.clientY);
    setCursor(p);
    const hit = hitTest(p);
    setHover(hit?.id ?? null);
    const netId = netAt(p);
    const st = useApp.getState();
    if ((netId ?? null) !== st.netHighlight) useApp.setState({ netHighlight: netId });

    const d = dragRef.current;
    if (d.mode === "pan") {
      setView((v) => ({
        ...v,
        x: d.startWorld.x + (e.clientX - d.startScreen.x),
        y: d.startWorld.y + (e.clientY - d.startScreen.y),
      }));
      d.moved = true;
    } else if (d.mode === "move") {
      const dx = p.x - d.startWorld.x;
      const dy = p.y - d.startWorld.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        d.moved = true;
        const grid = ui.gridSize;
        setDragOffset({
          x: snap(dx, grid, ui.snap),
          y: snap(dy, grid, ui.snap),
        });
      }
    } else if (d.mode === "marquee") {
      setMarquee({ a: d.startWorld, b: p });
      d.moved = true;
    } else if (tool === "place" || tool === "probe" || tool === "instrument" || tool === "power") {
      setGhost({ x: snap(p.x, ui.gridSize, ui.snap), y: snap(p.y, ui.gridSize, ui.snap) });
    } else if (ghost) {
      setGhost(null);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    const actions = useApp.getState();
    if (d.mode === "move" && dragOffset && (dragOffset.x || dragOffset.y)) {
      actions.moveSelection(dragOffset.x, dragOffset.y);
    } else if (d.mode === "marquee" && marquee && d.moved) {
      const { a, b } = marquee;
      const x0 = Math.min(a.x, b.x);
      const x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y);
      const y1 = Math.max(a.y, b.y);
      const ids: string[] = [];
      for (const c of sheet.components) if (c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1) ids.push(c.id);
      for (const w of sheet.wires)
        if (w.points.some((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)) ids.push(w.id);
      for (const l of sheet.labels) if (l.x >= x0 && l.x <= x1 && l.y >= y0 && l.y <= y1) ids.push(l.id);
      for (const p of sheet.probes) if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1) ids.push(p.id);
      actions.select(e.shiftKey ? [...selection, ...ids] : ids);
    }
    setDragOffset(null);
    setMarquee(null);
    dragRef.current = { mode: "none", startScreen: { x: 0, y: 0 }, startWorld: { x: 0, y: 0 }, moved: false };
  };

  const onWheel = (e: React.WheelEvent) => {
    const p = toWorld(e.clientX, e.clientY);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setView((v) => {
      const zoom = Math.max(0.08, Math.min(6, v.zoom * factor));
      const rect = svgRef.current?.getBoundingClientRect();
      const px = e.clientX - (rect?.left ?? 0);
      const py = e.clientY - (rect?.top ?? 0);
      return { zoom, x: px - p.x * zoom, y: py - p.y * zoom };
    });
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const p = toWorld(e.clientX, e.clientY);
    const hit = hitTest(p);
    const actions = useApp.getState();
    if (!hit) return;
    if (hit.kind === "component") {
      const c = sheet.components.find((x) => x.id === hit.id);
      if (c?.defId === "logic_in") {
        actions.toggleLogicInput(c.id);
        return;
      }
      actions.select([hit.id]);
      actions.openModal("properties", hit.id);
    } else if (hit.kind === "label") {
      actions.select([hit.id]);
      actions.openModal("properties", hit.id);
    } else if (hit.kind === "probe") {
      actions.select([hit.id]);
      actions.openModal("properties", hit.id);
    }
  };

  const finishWire = () => {
    if (wireDraft && wireDraft.length >= 2) {
      useApp.getState().addWire(wireDraft);
    }
    useApp.setState({ wireDraft: null });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && useApp.getState().wireDraft) {
        useApp.setState({ wireDraft: null });
      }
      if (e.key === "Enter" && useApp.getState().wireDraft) finishWire();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wireDraft]);

  /* ---------------------------- rendering -------------------------- */
  const gridSize = ui.gridSize;
  const worldLeft = -view.x / view.zoom;
  const worldTop = -view.y / view.zoom;
  const worldRight = worldLeft + size.w / view.zoom;
  const worldBottom = worldTop + size.h / view.zoom;
  const gridStep = ui.visibility.Grid === false || !ui.grid ? 0 : gridSize;
  const lines: { x1: number; y1: number; x2: number; y2: number; major: boolean }[] = [];
  if (gridStep > 0 && view.zoom > 0.22) {
    const startX = Math.floor(worldLeft / gridStep) * gridStep;
    const endX = Math.ceil(worldRight / gridStep) * gridStep;
    const startY = Math.floor(worldTop / gridStep) * gridStep;
    const endY = Math.ceil(worldBottom / gridStep) * gridStep;
    const count = (endX - startX) / gridStep + (endY - startY) / gridStep;
    if (count < 1200) {
      for (let x = startX; x <= endX; x += gridStep) {
        lines.push({ x1: x, y1: startY, x2: x, y2: endY, major: x % (gridStep * 5) === 0 });
      }
      for (let y = startY; y <= endY; y += gridStep) {
        lines.push({ x1: startX, y1: y, x2: endX, y2: y, major: y % (gridStep * 5) === 0 });
      }
    }
  }

  const selSet = new Set(selection);
  const diagnostics = [...graph.errors, ...graph.warnings];
  const showRef = ui.visibility.References !== false;
  const showVal = ui.visibility.Values !== false;
  const showLabels = ui.visibility["Net Labels"] !== false;
  const showProbes = ui.visibility.Probes !== false;
  const showInstruments = ui.visibility.Instruments !== false;

  const renderComponent = (c: Component) => {
    const def = getDef(c.defId);
    if (!def) return null;
    const sel = selSet.has(c.id);
    const off = sel && dragOffset ? dragOffset : null;
    const value = componentValue(def, c.props);
    const bad = diagnostics.some((d) => d.ref === c.ref && d.severity === "error");
    return (
      <g
        key={c.id}
        transform={off ? `translate(${off.x} ${off.y})` : undefined}
        style={{ color: c.color ?? "var(--ink)" }}
      >
        <g transform={compTransform(c)}>
          {def.shapes.map((s, i) => {
            const stroke = "currentColor";
            switch (s.t) {
              case "line":
                return (
                  <line
                    key={i}
                    x1={s.x1}
                    y1={s.y1}
                    x2={s.x2}
                    y2={s.y2}
                    stroke={stroke}
                    strokeWidth={s.w ?? 1.3}
                    strokeDasharray={s.dash}
                    strokeLinecap="round"
                  />
                );
              case "rect":
                return (
                  <rect
                    key={i}
                    x={s.x}
                    y={s.y}
                    width={s.w}
                    height={s.h}
                    rx={s.r ?? 0}
                    stroke={stroke}
                    strokeWidth={1.3}
                    fill={s.fill === "none" ? "none" : (s.fill ?? "none")}
                  />
                );
              case "circle":
                return (
                  <circle
                    key={i}
                    cx={s.cx}
                    cy={s.cy}
                    r={s.r}
                    stroke={stroke}
                    strokeWidth={1.3}
                    fill={s.fill ?? "none"}
                  />
                );
              case "path":
                return (
                  <path
                    key={i}
                    d={s.d}
                    stroke={stroke}
                    strokeWidth={s.w ?? 1.3}
                    fill={s.fill ?? "none"}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                );
              case "poly":
                return (
                  <polygon
                    key={i}
                    points={s.pts}
                    stroke={stroke}
                    strokeWidth={s.w ?? 1.3}
                    fill={s.fill ?? "none"}
                    strokeLinejoin="round"
                  />
                );
              case "text":
                return (
                  <text
                    key={i}
                    x={s.x}
                    y={s.y}
                    fontSize={s.size ?? 10}
                    textAnchor={s.anchor ?? "start"}
                    fill="currentColor"
                    fontFamily="var(--font-mono)"
                  >
                    {s.s}
                  </text>
                );
            }
          })}
          {(sel || hover === c.id) && (
            <rect
              x={-34}
              y={-34}
              width={68}
              height={68}
              fill="none"
              stroke={sel ? "var(--blue)" : "var(--ink-3)"}
              strokeWidth={1 / view.zoom}
              strokeDasharray={sel ? undefined : `${4 / view.zoom} ${3 / view.zoom}`}
            />
          )}
          {showRef && (
            <text
              x={0}
              y={-40}
              fontSize={11}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fill={sel ? "var(--blue)" : "var(--ink-2)"}
              transform={`rotate(${-c.rot})`}
            >
              {c.ref}
            </text>
          )}
          {showVal && value && (
            <text
              x={0}
              y={48}
              fontSize={11}
              textAnchor="middle"
              fontFamily="var(--font-mono)"
              fill={sel ? "var(--blue)" : "var(--ink-3)"}
              transform={`rotate(${-c.rot})`}
            >
              {value}
            </text>
          )}
          {ui.visibility["Pin Names"] && (
            <text x={0} y={-52} fontSize={9} textAnchor="middle" fill="var(--ink-3)">
              {def.pins.map((p) => p.name).join(" · ")}
            </text>
          )}
        </g>
        {bad && (
          <g transform={`translate(${c.x + 26} ${c.y - 30})`}>
            <circle r={8} fill="var(--error)" />
            <path d="M0 -4 L0 1 M0 4 L0 4.4" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" />
          </g>
        )}
      </g>
    );
  };

  return (
    <div className="relative flex-1 min-h-0" style={{ background: "var(--paper)" }}>
      <svg
        ref={svgRef}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: tool === "pan" ? "grab" : tool === "select" ? "default" : "crosshair" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="gridMinor" width={gridStep} height={gridStep} patternUnits="userSpaceOnUse">
            <circle cx={0} cy={0} r={0.7} fill="var(--grid-strong)" />
          </pattern>
        </defs>
        <rect x={0} y={0} width="100%" height="100%" fill="var(--paper)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={l.major ? "var(--grid-strong)" : "var(--grid)"}
              strokeWidth={(l.major ? 0.6 : 0.4) / view.zoom}
            />
          ))}
          {ui.pageBounds && (
            <rect
              x={0}
              y={0}
              width={sheet.width}
              height={sheet.height}
              fill="none"
              stroke="var(--rule-strong)"
              strokeWidth={1 / view.zoom}
              strokeDasharray={`${6 / view.zoom} ${4 / view.zoom}`}
            />
          )}

          {/* wires */}
          {sheet.wires.map((w) => {
            const net = graph.nets.find((n) => n.wireIds.includes(w.id));
            const on = netHighlight && net?.id === netHighlight;
            const sel = selSet.has(w.id);
            const d = w.points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
            return (
              <g key={w.id}>
                <path
                  d={d}
                  fill="none"
                  stroke={sel ? "var(--blue)" : on ? "var(--amber)" : (w.color ?? "var(--ink)")}
                  strokeWidth={(sel || on ? 2.6 : w.bus ? 3.2 : 1.6)}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {showLabels && w.showLabel && net && (
                  <text
                    x={w.points[0].x + 8}
                    y={w.points[0].y - 8}
                    fontSize={10}
                    fontFamily="var(--font-mono)"
                    fill="var(--ink-2)"
                  >
                    {net.name}
                  </text>
                )}
              </g>
            );
          })}

          {/* junctions */}
          {graph.junctions.map((j, i) => (
            <circle key={i} cx={j.x} cy={j.y} r={3.4} fill="var(--ink)" />
          ))}

          {/* components */}
          {sheet.components.map(renderComponent)}

          {/* labels */}
          {showLabels &&
            sheet.labels.map((l) => {
              const sel = selSet.has(l.id);
              return (
                <g key={l.id} transform={`translate(${l.x} ${l.y}) rotate(${l.rot})`}>
                  <text
                    fontSize={11}
                    fontFamily="var(--font-mono)"
                    fill={sel ? "var(--blue)" : l.kind === "global" ? "var(--teal)" : "var(--ink-2)"}
                    textAnchor="middle"
                  >
                    {l.text}
                  </text>
                  {l.kind !== "text" && (
                    <path
                      d="M -34 6 L -22 6 M -22 6 L -22 0"
                      stroke={sel ? "var(--blue)" : "var(--ink-3)"}
                      strokeWidth={1.2}
                      fill="none"
                    />
                  )}
                </g>
              );
            })}

          {/* probes */}
          {showProbes &&
            sheet.probes.map((p: Probe) => {
              const sel = selSet.has(p.id);
              return (
                <g key={p.id} transform={`translate(${p.x} ${p.y})`}>
                  <path
                    d={
                      p.type === "current"
                        ? "M 0 -12 L 0 -26 M -5 -22 L 0 -28 L 5 -22"
                        : p.type === "differential"
                          ? "M -10 -10 L 0 -22 L 10 -10 L 0 2 Z"
                          : "M -9 -9 L 0 -20 L 9 -9 L 0 2 Z"
                    }
                    fill={p.color}
                    stroke={p.color}
                    strokeWidth={1.4}
                    opacity={sel ? 1 : 0.9}
                  />
                  <text
                    x={0}
                    y={-26}
                    fontSize={10}
                    fontFamily="var(--font-mono)"
                    textAnchor="middle"
                    fill={p.color}
                  >
                    {p.name}
                  </text>
                  {sel && <circle r={16} fill="none" stroke="var(--blue)" strokeWidth={1 / view.zoom} />}
                </g>
              );
            })}

          {/* instrument anchors */}
          {showInstruments &&
            sheet.instruments.map((i) => (
              <g key={i.id} transform={`translate(${i.x} ${i.y})`}>
                <rect
                  x={-30}
                  y={-24}
                  width={60}
                  height={48}
                  rx={4}
                  fill="var(--panel)"
                  stroke={selSet.has(i.id) ? "var(--blue)" : "var(--ink-2)"}
                  strokeWidth={1.2}
                />
                <rect x={-24} y={-18} width={48} height={22} rx={2} fill="var(--paper-2)" stroke="var(--rule)" />
                <path d="M -22 -8 Q -12 -18 -2 -8 T 18 -8" stroke="var(--blue)" strokeWidth={1.1} fill="none" />
                <text y={16} fontSize={9} textAnchor="middle" fontFamily="var(--font-mono)" fill="var(--ink-2)">
                  {i.ref}
                </text>
              </g>
            ))}

          {/* diagnostic markers */}
          {diagnostics.map((d) =>
            d.x !== undefined && d.y !== undefined ? (
              <g key={d.id} transform={`translate(${d.x} ${d.y})`}>
                <circle
                  r={9 / view.zoom}
                  fill="none"
                  stroke={d.severity === "error" ? "var(--error)" : "var(--warn)"}
                  strokeWidth={1.6 / view.zoom}
                />
                <text
                  y={-14 / view.zoom}
                  fontSize={10 / view.zoom}
                  textAnchor="middle"
                  fill={d.severity === "error" ? "var(--error)" : "var(--warn)"}
                  fontFamily="var(--font-mono)"
                >
                  {d.code}
                </text>
              </g>
            ) : null,
          )}

          {/* wire draft */}
          {wireDraft && wireDraft.length > 0 && (
            <g>
              <path
                d={wireDraft.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")}
                fill="none"
                stroke="var(--blue)"
                strokeWidth={1.8}
                strokeDasharray={`${5 / view.zoom} ${3 / view.zoom}`}
              />
              {wireDraft.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={2.6} fill="var(--blue)" />
              ))}
            </g>
          )}

          {/* placement ghost */}
          {ghost && tool === "place" && placeDefId && (
            <g transform={`translate(${ghost.x} ${ghost.y})`} opacity={0.45}>
              {(getDef(placeDefId)?.shapes ?? []).map((s, i) =>
                s.t === "line" ? (
                  <line key={i} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="var(--blue)" strokeWidth={1.3} />
                ) : s.t === "circle" ? (
                  <circle key={i} cx={s.cx} cy={s.cy} r={s.r} stroke="var(--blue)" strokeWidth={1.3} fill="none" />
                ) : s.t === "path" ? (
                  <path key={i} d={s.d} stroke="var(--blue)" strokeWidth={1.3} fill="none" />
                ) : s.t === "poly" ? (
                  <polygon key={i} points={s.pts} stroke="var(--blue)" strokeWidth={1.3} fill="none" />
                ) : s.t === "rect" ? (
                  <rect key={i} x={s.x} y={s.y} width={s.w} height={s.h} stroke="var(--blue)" fill="none" />
                ) : null,
              )}
            </g>
          )}

          {/* marquee */}
          {marquee && (
            <rect
              x={Math.min(marquee.a.x, marquee.b.x)}
              y={Math.min(marquee.a.y, marquee.b.y)}
              width={Math.abs(marquee.b.x - marquee.a.x)}
              height={Math.abs(marquee.b.y - marquee.a.y)}
              fill="color-mix(in srgb, var(--blue) 12%, transparent)"
              stroke="var(--blue)"
              strokeWidth={1 / view.zoom}
            />
          )}
        </g>
      </svg>

      {/* status strip */}
      <div
        className="absolute left-0 right-0 bottom-0 rule-t"
        style={{ height: 22, background: "var(--panel-2)", fontSize: 10.5 }}
      >
        <div className="flex items-center gap-4 h-full px-3 mono" style={{ color: "var(--ink-2)" }}>
          <span>
            X {cursor.x.toFixed(1)} · Y {cursor.y.toFixed(1)}
          </span>
          <span>Grid {ui.snap ? `${ui.gridSize} snap` : "snap off"}</span>
          <span>Zoom {(view.zoom * 100).toFixed(0)}%</span>
          <span>
            {sheet.components.length} components · {sheet.wires.length} wires · {graph.nets.length} nets
          </span>
          <span className="ml-auto">
            {tool === "wire" || tool === "bus"
              ? wireDraft && wireDraft.length
                ? "Click to add corner · Enter to finish · Esc to cancel"
                : "Click to start the wire"
              : tool === "place"
                ? placeDefId
                  ? `Placing ${getDef(placeDefId)?.name ?? ""}`
                  : placeLabelKind
                    ? `Placing ${placeLabelKind} label`
                    : "Place tool"
                : tool === "probe"
                  ? `Placing ${useApp.getState().probeType} probe`
                  : "Select · drag to move · wheel to zoom"}
          </span>
        </div>
      </div>
    </div>
  );
}
