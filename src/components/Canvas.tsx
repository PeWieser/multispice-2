"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PART_MAP, SymbolPrim, formatValue } from "@/lib/library/catalog";
import {
  GRID,
  Instance,
  SchematicDoc,
  instanceBounds,
  pinPosition,
  rotatePoint,
} from "@/lib/schematic/model";
import { obstaclesFor, routeOrthogonal } from "@/lib/schematic/tools";
import { engine, hitTestInstance, useEditor, useHud } from "@/state/editor";

interface Pt {
  x: number;
  y: number;
}

const css = (name: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
};

export default function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [cursor, setCursor] = useState<Pt>({ x: 0, y: 0 });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  const [editing, setEditing] = useState<{ kind: "label" | "text"; x: number; y: number; sx: number; sy: number } | null>(null);
  const editingDone = useRef(false);
  const stateRef = useRef({
    dragging: false,
    panning: false,
    marquee: null as null | { x0: number; y0: number; x1: number; y1: number },
    dragStart: { x: 0, y: 0 },
    moved: false,
    wireStart: null as null | Pt,
    wirePreview: [] as Pt[],
    lastMouse: { x: 0, y: 0 },
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

  /** Finds the nearest pin within a radius. */
  const findPin = useCallback((doc: SchematicDoc, p: Pt, r = 9): Pt | null => {
    let best: Pt | null = null;
    let bestD = r * r;
    for (const inst of doc.instances) {
      const part = PART_MAP[inst.partId];
      if (!part) continue;
      part.pins.forEach((_, idx) => {
        const pos = pinPosition(inst, idx);
        const d = (pos.x - p.x) ** 2 + (pos.y - p.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = pos;
        }
      });
    }
    return best;
  }, []);

  /* ------------------------------ drawing ------------------------------ */
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
    const { doc, view, selection, showGrid, netResult, probes, sim } = st;
    const live = sim.running ? engine.lastState : null;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = css("--canvas", "#0d1017");
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.scale(view.zoom, view.zoom);
    ctx.translate(-view.x, -view.y);

    const x0 = view.x;
    const y0 = view.y;
    const x1 = view.x + w / view.zoom;
    const y1 = view.y + h / view.zoom;

    /* grid */
    if (showGrid) {
      const step = view.zoom < 0.45 ? GRID * 10 : view.zoom < 1.1 ? GRID * 5 : GRID;
      ctx.lineWidth = 1 / view.zoom;
      ctx.strokeStyle = css("--grid", "rgba(255,255,255,.05)");
      ctx.beginPath();
      for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      ctx.stroke();
      const big = step * 10;
      ctx.strokeStyle = css("--grid-strong", "rgba(255,255,255,.1)");
      ctx.beginPath();
      for (let x = Math.floor(x0 / big) * big; x < x1; x += big) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      for (let y = Math.floor(y0 / big) * big; y < y1; y += big) {
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
      }
      ctx.stroke();
    }

    /* wires */
    const wireColor = css("--wire", "#7dd3fc");
    const selColor = css("--wire-sel", "#fbbf24");
    for (const wire of doc.wires) {
      const isSel = selection.includes(wire.id);
      let color = isSel ? selColor : wireColor;
      if (live && wire.points.length) {
        const netName = netResult.pointNets[`${Math.round(wire.points[0].x)},${Math.round(wire.points[0].y)}`];
        const v = netName ? live.nets[netName] ?? 0 : 0;
        color = isSel ? selColor : voltageColor(v);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = (isSel ? 2.6 : 1.9) / Math.max(view.zoom, 0.4);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      wire.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }

    /* junction dots */
    const counts = new Map<string, number>();
    for (const wire of doc.wires) {
      for (const p of wire.points) {
        const k = `${Math.round(p.x)},${Math.round(p.y)}`;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
    }
    ctx.fillStyle = wireColor;
    for (const [k, c] of counts) {
      if (c < 2) continue;
      const [px, py] = k.split(",").map(Number);
      ctx.beginPath();
      ctx.arc(px, py, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    /* instances */
    for (const inst of doc.instances) {
      drawInstance(ctx, inst, selection.includes(inst.id), view.zoom, live);
    }

    /* net labels */
    ctx.font = "600 11px ui-sans-serif, system-ui";
    for (const label of doc.labels) {
      const name = netResult.pointNets[`${Math.round(label.x)},${Math.round(label.y)}`] ?? label.name;
      const txt = name || label.name;
      const tw = ctx.measureText(txt).width;
      ctx.fillStyle = css("--panel-2", "#151a25");
      roundRect(ctx, label.x + 8, label.y - 20, tw + 12, 16, 4);
      ctx.fill();
      ctx.strokeStyle = css("--border-strong", "#333");
      ctx.lineWidth = 1 / view.zoom;
      ctx.stroke();
      ctx.fillStyle = css("--accent-2", "#22d3ee");
      ctx.textAlign = "left";
      ctx.fillText(txt, label.x + 14, label.y - 8);
      ctx.fillStyle = css("--accent-2", "#22d3ee");
      ctx.beginPath();
      ctx.arc(label.x, label.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    /* notes */
    ctx.textAlign = "left";
    for (const note of doc.notes) {
      ctx.fillStyle = css("--text-mute", "#64708c");
      ctx.font = `${note.size ?? 11}px ui-sans-serif, system-ui`;
      ctx.fillText(note.text, note.x, note.y);
    }

    /* probes */
    for (const probe of probes) {
      const net = netResult.nets.find((n) => n.name === probe);
      if (!net || !net.points.length) continue;
      const p = net.points[0];
      ctx.strokeStyle = css("--accent-3", "#a78bfa");
      ctx.lineWidth = 1.6 / view.zoom;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      if (live) {
        ctx.fillStyle = css("--accent-3", "#a78bfa");
        ctx.font = "600 10px ui-monospace, monospace";
        ctx.fillText(formatValue(live.nets[probe] ?? 0, "V"), p.x + 10, p.y - 8);
      }
    }

    /* wire preview */
    const sr = stateRef.current;
    if (sr.wireStart && sr.wirePreview.length > 1) {
      ctx.strokeStyle = css("--accent", "#5b8cff");
      ctx.setLineDash([5, 4]);
      ctx.lineWidth = 2 / view.zoom;
      ctx.beginPath();
      sr.wirePreview.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
    }

    /* ghost for placement */
    if (st.tool === "place" && st.placingPartId) {
      const part = PART_MAP[st.placingPartId];
      if (part) {
        ctx.globalAlpha = 0.55;
        drawInstance(
          ctx,
          { id: "ghost", partId: st.placingPartId, x: cursor.x, y: cursor.y, rot: 0, label: part.ref + "?", params: {} },
          false,
          view.zoom,
          null,
        );
        ctx.globalAlpha = 1;
      }
    }

    /* marquee */
    if (sr.marquee) {
      const m = sr.marquee;
      ctx.fillStyle = "color-mix(in srgb, " + css("--accent", "#5b8cff") + " 14%, transparent)";
      ctx.strokeStyle = css("--accent", "#5b8cff");
      ctx.lineWidth = 1 / view.zoom;
      ctx.fillRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
      ctx.strokeRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0);
    }

    ctx.restore();
  }, [cursor.x, cursor.y]);

  /* ------------------------------ animation loop ------------------------------ */
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let frames = 0;
    let fpsTime = last;
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const st = useEditor.getState();
      if (st.sim.running) engine.tick(dt);
      (globalThis as unknown as { __clsTime?: number }).__clsTime = engine.lastState.time;
      draw();
      frames++;
      if (now - fpsTime > 500) {
        const fps = (frames * 1000) / (now - fpsTime);
        frames = 0;
        fpsTime = now;
        useEditor.getState().bumpTick(fps);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  useEffect(() => {
    useEditor.getState().refreshNets();
  }, []);

  /* ------------------------------ interactions ------------------------------ */
  const onWheel = useCallback((e: React.WheelEvent) => {
    const st = useEditor.getState();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    // Shift+wheel = scroll (pan), wheel = zoom toward cursor (manifesto §3: direct manipulation)
    if (e.shiftKey && !e.ctrlKey && !e.metaKey) {
      st.setView({ x: st.view.x + e.deltaY / st.view.zoom, y: st.view.y + e.deltaX / st.view.zoom });
      return;
    }
    // Ctrl/Cmd+wheel OR plain wheel = zoom toward cursor
    const factor = Math.exp(-e.deltaY * 0.0014);
    const zoom = Math.min(6, Math.max(0.12, st.view.zoom * factor));
    // Keep the world point under the cursor fixed
    const wx = mx / st.view.zoom + st.view.x;
    const wy = my / st.view.zoom + st.view.y;
    st.setView({ zoom, x: wx - mx / zoom, y: wy - my / zoom });
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    const world = toWorld(e.clientX, e.clientY);
    const sp = snap(world);
    const sr = stateRef.current;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    sr.dragStart = world;
    sr.moved = false;

    if (e.button === 1 || e.button === 2 || st.tool === "pan" || e.altKey) {
      sr.panning = true;
      return;
    }

    if (st.tool === "place" && st.placingPartId) {
      st.addInstance(st.placingPartId, sp.x, sp.y);
      if (!e.shiftKey) st.setPlacing(null);
      return;
    }

    if (st.tool === "wire") {
      const pin = findPin(st.doc, world) ?? sp;
      if (!sr.wireStart) {
        sr.wireStart = pin;
        sr.wirePreview = [pin];
      } else {
        const pts = sr.wirePreview.length > 1 ? sr.wirePreview : [sr.wireStart, pin];
        st.addWire({ id: "w_" + Math.random().toString(36).slice(2, 9), points: pts });
        const endsOnPin = !!findPin(st.doc, pin, 8);
        if (endsOnPin) {
          sr.wireStart = null;
          sr.wirePreview = [];
        } else {
          sr.wireStart = pin;
          sr.wirePreview = [pin];
        }
      }
      return;
    }

    if (st.tool === "label" || st.tool === "text") {
      const rect = canvasRef.current?.getBoundingClientRect();
      editingDone.current = false;
      setEditing({
        kind: st.tool,
        x: sp.x,
        y: sp.y,
        sx: e.clientX - (rect?.left ?? 0),
        sy: e.clientY - (rect?.top ?? 0),
      });
      return;
    }

    const hit = hitTestInstance(st.doc, world.x, world.y);

    if (st.tool === "erase") {
      if (hit) {
        st.setSelection([hit.id]);
        st.deleteSelection();
      } else {
        const wireHit = hitWire(st.doc, world);
        if (wireHit) {
          st.setSelection([wireHit]);
          st.deleteSelection();
        }
      }
      return;
    }

    if (st.tool === "probe") {
      const netName = nearestNetName(world);
      if (netName) {
        st.toggleProbe(netName);
        st.log("info", `Sonde an Netz ${netName} ${st.probes.includes(netName) ? "entfernt" : "gesetzt"}`);
      }
      return;
    }

    // interactive components during simulation
    if (hit && st.sim.running) {
      const part = PART_MAP[hit.partId];
      if (part?.interactive === "switch" || part?.interactive === "button" || part?.interactive === "dip") {
        const cur = engine.controls[hit.label] ?? (hit.params.closed ? 1 : 0);
        engine.setControl(hit.label, cur > 0.5 ? 0 : 1);
        st.log("info", `${hit.label} ${cur > 0.5 ? "geöffnet" : "geschlossen"}`);
        return;
      }
      if (part?.interactive === "pot") {
        const cur = engine.controls[hit.label] ?? Number(hit.params.pos ?? 0.5);
        const next = Math.min(0.99, Math.max(0.01, cur + (e.shiftKey ? -0.05 : 0.05)));
        engine.setControl(hit.label, next);
        st.log("info", `${hit.label} Schleifer: ${(next * 100).toFixed(0)} %`);
        return;
      }
    }

    if (hit) {
      if (e.shiftKey) st.setSelection([...new Set([...st.selection, hit.id])]);
      else if (!st.selection.includes(hit.id)) st.setSelection([hit.id]);
      sr.dragging = true;
    } else {
      const wireHit = hitWire(st.doc, world);
      if (wireHit) {
        st.setSelection(e.shiftKey ? [...st.selection, wireHit] : [wireHit]);
        sr.dragging = true;
      } else {
        if (!e.shiftKey) st.setSelection([]);
        sr.marquee = { x0: world.x, y0: world.y, x1: world.x, y1: world.y };
      }
    }
  };

  const commitEditing = (text: string | null) => {
    // Enter löst Commit + Unmount aus, danach feuert Blur — nur einmal werten.
    if (editingDone.current) return;
    editingDone.current = true;
    const st = useEditor.getState();
    const cur = editing;
    setEditing(null);
    st.setTool("select");
    if (cur && text && text.trim()) {
      const clean = text.trim();
      if (cur.kind === "label") {
        st.commit((d) => d.labels.push({ id: "l_" + Math.random().toString(36).slice(2, 8), x: cur.x, y: cur.y, name: clean }));
        st.log("ok", `Netzname „${clean}“ gesetzt`);
      } else {
        st.commit((d) => d.notes.push({ id: "n_" + Math.random().toString(36).slice(2, 8), x: cur.x, y: cur.y, text: clean }));
        st.log("ok", "Notiz eingefügt");
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const st = useEditor.getState();
    const world = toWorld(e.clientX, e.clientY);
    const sp = snap(world);
    const sr = stateRef.current;
    setCursor(sp);
    useHud.setState({ cursor: sp });

    if (sr.panning) {
      const dx = (e.clientX - (sr.lastMouse.x || e.clientX)) / st.view.zoom;
      const dy = (e.clientY - (sr.lastMouse.y || e.clientY)) / st.view.zoom;
      st.setView({ x: st.view.x - dx, y: st.view.y - dy });
    }
    sr.lastMouse = { x: e.clientX, y: e.clientY };

    if (sr.dragging && st.selection.length) {
      const dx = sp.x - Math.round(sr.dragStart.x / GRID) * GRID;
      const dy = sp.y - Math.round(sr.dragStart.y / GRID) * GRID;
      if (dx || dy) {
        st.moveSelection(dx, dy);
        sr.dragStart = sp;
        sr.moved = true;
      }
    }

    if (sr.marquee) {
      sr.marquee.x1 = world.x;
      sr.marquee.y1 = world.y;
    }

    if (sr.wireStart) {
      const target = findPin(st.doc, world) ?? sp;
      sr.wirePreview = st.autoRoute
        ? routeOrthogonal(sr.wireStart, target, obstaclesFor(st.doc))
        : [sr.wireStart, { x: target.x, y: sr.wireStart.y }, target];
    }

    // live tooltip
    if (st.sim.running) {
      const net = nearestNetName(world, 12);
      if (net) {
        const v = engine.lastState.nets[net] ?? 0;
        const lines = [`Netz ${net}`, `${formatValue(v, "V")}`];
        const hit = hitTestInstance(st.doc, world.x, world.y);
        if (hit) {
          const i = engine.lastState.currents[hit.label];
          if (i !== undefined) lines.push(`${hit.label}: ${formatValue(i, "A")}`);
          const p = engine.lastState.power[hit.label];
          if (p !== undefined) lines.push(`P = ${formatValue(Math.abs(p), "W")}`);
        }
        const wr = wrapRef.current?.getBoundingClientRect();
        setTooltip({ x: e.clientX - (wr?.left ?? 0), y: e.clientY - (wr?.top ?? 0), lines });
      } else setTooltip(null);
    } else setTooltip(null);
  };

  const onPointerUp = () => {
    const st = useEditor.getState();
    const sr = stateRef.current;
    if (sr.marquee) {
      const m = sr.marquee;
      const x0 = Math.min(m.x0, m.x1);
      const x1 = Math.max(m.x0, m.x1);
      const y0 = Math.min(m.y0, m.y1);
      const y1 = Math.max(m.y0, m.y1);
      if (Math.abs(x1 - x0) > 4 && Math.abs(y1 - y0) > 4) {
        const ids = st.doc.instances
          .filter((i) => {
            const b = instanceBounds(i);
            return b.x >= x0 && b.x + b.w <= x1 && b.y >= y0 && b.y + b.h <= y1;
          })
          .map((i) => i.id);
        const wireIds = st.doc.wires.filter((w) => w.points.every((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)).map((w) => w.id);
        st.setSelection([...ids, ...wireIds]);
      }
      sr.marquee = null;
    }
    sr.dragging = false;
    sr.panning = false;
    if (sr.moved && st.sim.running) engine.rebuild(st.doc);
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const sr = stateRef.current;
    if (sr.wireStart) {
      sr.wireStart = null;
      sr.wirePreview = [];
      return;
    }
    const st = useEditor.getState();
    const world = toWorld(e.clientX, e.clientY);
    const hit = hitTestInstance(st.doc, world.x, world.y);
    if (hit) {
      st.setSelection([hit.id]);
      useEditor.setState({ rightOpen: true });
    }
  };

  /* keyboard */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void st.saveProject();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        st.copySelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        st.pasteClipboard();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        st.duplicateSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        st.selectAll();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        st.deleteSelection();
      } else if (e.key.toLowerCase() === "r") {
        st.rotateSelection(e.shiftKey ? -1 : 1);
      } else if (e.key.toLowerCase() === "m") {
        st.mirrorSelection();
      } else if (e.key.toLowerCase() === "w") {
        st.setTool("wire");
      } else if (e.key.toLowerCase() === "v" || e.key === "Escape") {
        stateRef.current.wireStart = null;
        stateRef.current.wirePreview = [];
        st.setTool("select");
        st.setPlacing(null);
      } else if (e.key.toLowerCase() === "p") {
        st.setTool("probe");
      } else if (e.key.toLowerCase() === "l") {
        st.setTool("label");
      } else if (e.key.toLowerCase() === "t") {
        st.setTool("text");
      } else if (e.key.toLowerCase() === "e") {
        st.setTool("erase");
      } else if (e.key.toLowerCase() === "h") {
        st.setTool("pan");
      } else if (e.key === " ") {
        e.preventDefault();
        if (st.sim.running) st.pauseSim();
        else st.startSim();
      } else if (e.key === "f") {
        st.fitView();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => useEditor.getState().fitView(), 120);
    return () => clearTimeout(t);
  }, []);

  const tool = useEditor((s) => s.tool);

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        style={{ cursor: tool === "pan" ? "grab" : tool === "wire" ? "crosshair" : tool === "erase" ? "not-allowed" : "default" }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      />
      {tooltip && (
        <div
          className="glass pointer-events-none absolute z-30 rounded-lg px-2.5 py-1.5 text-[11px] mono shadow-xl"
          style={{ left: tooltip.x + 14, top: tooltip.y + 14 }}
        >
          {tooltip.lines.map((l, i) => (
            <div key={i} style={{ color: i === 0 ? "var(--text-mute)" : "var(--text)" }}>
              {l}
            </div>
          ))}
        </div>
      )}
      {editing && (
        <input
          autoFocus
          className="input mono absolute z-40 w-44"
          style={{ left: editing.sx + 8, top: editing.sy - 13, boxShadow: "var(--shadow)" }}
          placeholder={editing.kind === "label" ? "Netzname …" : "Notiz …"}
          aria-label={editing.kind === "label" ? "Netzname eingeben" : "Notiz eingeben"}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") commitEditing((e.target as HTMLInputElement).value);
            else if (e.key === "Escape") commitEditing(null);
          }}
          onBlur={(e) => commitEditing(e.target.value)}
        />
      )}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
        <ZoomButtons onFit={() => useEditor.getState().fitView()} />
      </div>
    </div>
  );
}

function ZoomButtons({ onFit }: { onFit: () => void }) {
  const view = useEditor((s) => s.view);
  const setView = useEditor((s) => s.setView);
  return (
    <div className="flex flex-col overflow-hidden rounded-lg text-xs" style={{ background: "var(--panel-solid)", border: "1px solid var(--border)" }}>
      <button className="btn rounded-none" onClick={() => setView({ zoom: Math.min(6, view.zoom * 1.25) })} title="Vergrößern">
        +
      </button>
      <button className="btn rounded-none" onClick={() => setView({ zoom: Math.max(0.12, view.zoom / 1.25) })} title="Verkleinern">
        −
      </button>
      <button className="btn rounded-none text-[10px]" onClick={onFit} title="Einpassen (F)">
        FIT
      </button>
    </div>
  );
}

/* ------------------------------ helpers ------------------------------ */

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function voltageColor(v: number): string {
  const a = Math.min(Math.abs(v) / 12, 1);
  if (v > 0.15) return `rgb(${Math.round(80 + 175 * a)}, ${Math.round(190 - 90 * a)}, ${Math.round(255 - 180 * a)})`;
  if (v < -0.15) return `rgb(${Math.round(90 - 40 * a)}, ${Math.round(160 + 40 * a)}, 255)`;
  return "#64748b";
}

function hitWire(doc: SchematicDoc, p: Pt): string | null {
  for (const w of doc.wires) {
    for (let i = 0; i + 1 < w.points.length; i++) {
      const a = w.points[i];
      const b = w.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const cx = a.x + t * dx;
      const cy = a.y + t * dy;
      if ((cx - p.x) ** 2 + (cy - p.y) ** 2 < 36) return w.id;
    }
  }
  return null;
}

function nearestNetName(p: Pt, radius = 14): string | null {
  const st = useEditor.getState();
  let best: string | null = null;
  let bestD = radius * radius;
  for (const net of st.netResult.nets) {
    for (const pt of net.points) {
      const d = (pt.x - p.x) ** 2 + (pt.y - p.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = net.name;
      }
    }
  }
  if (best) return best;
  const wireId = hitWire(st.doc, p);
  if (wireId) {
    const wire = st.doc.wires.find((w) => w.id === wireId);
    if (wire?.points.length) return st.netResult.pointNets[`${Math.round(wire.points[0].x)},${Math.round(wire.points[0].y)}`] ?? null;
  }
  return null;
}

function drawInstance(
  ctx: CanvasRenderingContext2D,
  inst: Instance,
  selected: boolean,
  zoom: number,
  live: { nets: Record<string, number>; currents: Record<string, number> } | null,
) {
  const part = PART_MAP[inst.partId];
  if (!part) return;
  ctx.save();
  ctx.translate(inst.x, inst.y);
  ctx.rotate((inst.rot * Math.PI) / 180);
  if (inst.mirror) ctx.scale(-1, 1);

  const stroke = selected ? css("--wire-sel", "#fbbf24") : css("--symbol", "#dbe4f7");
  ctx.strokeStyle = stroke;
  ctx.fillStyle = stroke;
  ctx.lineWidth = 1.7;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // LED / lamp glow
  if (live && (part.interactive === "led" || part.interactive === "lamp")) {
    const i = Math.abs(live.currents[inst.label] ?? 0);
    const bright = Math.min(1, i / 0.015);
    if (bright > 0.02) {
      const colorMap: Record<string, string> = { red: "#ff4d4f", green: "#4ade80", blue: "#60a5fa", yellow: "#fde047", white: "#f8fafc" };
      const c = colorMap[String(inst.params.color ?? "red")] ?? "#ff4d4f";
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, 34);
      g.addColorStop(0, hexAlpha(c, 0.85 * bright));
      g.addColorStop(1, hexAlpha(c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = stroke;
    }
  }

  for (const prim of part.symbol) drawPrim(ctx, prim);

  // pins
  ctx.fillStyle = css("--pin", "#64748b");
  for (const pin of part.pins) {
    ctx.beginPath();
    ctx.arc(pin.x, pin.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  // interactive switch state overlay
  if (part.interactive === "switch" || part.interactive === "button") {
    const closed = (engine.controls[inst.label] ?? (inst.params.closed ? 1 : 0)) > 0.5;
    ctx.strokeStyle = closed ? css("--ok", "#34d399") : css("--text-mute", "#64708c");
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    if (closed) {
      ctx.moveTo(-12, 0);
      ctx.lineTo(12, 0);
    } else {
      ctx.moveTo(-12, -2);
      ctx.lineTo(12, -12);
    }
    ctx.stroke();
  }
  if (part.interactive === "pot") {
    const pos = engine.controls[inst.label] ?? Number(inst.params.pos ?? 0.5);
    ctx.fillStyle = css("--accent-2", "#22d3ee");
    ctx.fillRect(-20 + 40 * pos - 1, -12, 2, 8);
  }

  ctx.restore();

  // label + value (unrotated)
  if (zoom > 0.42 && part.mount !== "virtual") {
    ctx.save();
    ctx.translate(inst.x, inst.y);
    const b = instanceBounds(inst);
    const dy = b.y + b.h - inst.y + 14;
    ctx.font = "600 10.5px ui-sans-serif, system-ui";
    ctx.textAlign = "center";
    ctx.fillStyle = selected ? css("--wire-sel", "#fbbf24") : css("--text-dim", "#9aa5bd");
    ctx.fillText(inst.label, 0, dy);
    const main = part.params[0];
    if (main && main.type === "number") {
      const val = Number(inst.params[main.key] ?? main.def);
      ctx.fillStyle = css("--text-mute", "#64708c");
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(formatValue(val, main.unit ?? ""), 0, dy + 12);
    }
    ctx.restore();
  }

  if (selected) {
    const b = instanceBounds(inst);
    ctx.strokeStyle = css("--accent", "#5b8cff");
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12);
    ctx.setLineDash([]);
  }
}

function drawPrim(ctx: CanvasRenderingContext2D, prim: SymbolPrim) {
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
      roundRect(ctx, prim.x, prim.y, prim.w, prim.h, prim.r ?? 0);
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
    case "text": {
      ctx.save();
      ctx.font = `600 ${prim.size ?? 9}px ui-sans-serif, system-ui`;
      ctx.textAlign = prim.align ?? "center";
      ctx.fillText(prim.s, prim.x, prim.y);
      ctx.restore();
      break;
    }
  }
}

function hexAlpha(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export { rotatePoint };
