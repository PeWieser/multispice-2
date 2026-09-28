"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useCB, currentRunSet } from "@/lib/cb/store";
import { LIBMAP, symbolOf, pinsOf } from "@/lib/cb/library";
import { compBBox, worldPins, onSegment, xform } from "@/lib/cb/connectivity";
import type { Pt, Component, Wire } from "@/lib/cb/types";
import { uid } from "@/lib/cb/types";
import { Prims } from "./Symbol";
import { fmt } from "@/lib/cb/units";
import { probeSeries, probeUnit } from "@/lib/cb/probes";

type Hit = { kind: "comp" | "wire" | "label" | "probe" | "text"; id: string } | null;

function distSeg(p: Pt, a: Pt, b: Pt) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

export default function Canvas({ svgRef }: { svgRef: React.RefObject<SVGSVGElement | null> }) {
  const s = useCB();
  const { project: p, zoom, panX, panY, sheet, tool, selection, cn, diags } = s;
  const L = p.layout;
  const wrap = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  const [mouse, setMouse] = useState<Pt>([0, 0]);
  const [wireStart, setWireStart] = useState<Pt | null>(null);
  const [wireDir, setWireDir] = useState<"h" | "v">("h");
  const [band, setBand] = useState<[number, number, number, number] | null>(null);
  const [diffFirst, setDiffFirst] = useState<Pt | null>(null);
  const [delta, setDelta] = useState<Pt>([0, 0]);
  const [rectStart, setRectStart] = useState<Pt | null>(null);
  const drag = useRef<null | { mode: "move" | "pan" | "band" | "end"; start: Pt; sx: number; sy: number; px: number; py: number; attached: { id: string; end: "a" | "b" }[]; endRef?: { id: string; end: "a" | "b" } }>(null);
  const space = useRef(false);
  const RUL = L.rulers ? 18 : 0;

  useEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    const kd = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea,select")) return;
      if (e.code === "Space") space.current = true;
      if (e.key === "Escape") { setWireStart(null); setDiffFirst(null); setRectStart(null); }
      if (e.key === "/") setWireDir((d) => (d === "h" ? "v" : "h"));
    };
    const ku = (e: KeyboardEvent) => { if (e.code === "Space") space.current = false; };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
    return () => { ro.disconnect(); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
  }, []);
  useEffect(() => { if (tool !== "wire" && tool !== "bus") setWireStart(null); if (tool !== "probe-diff") setDiffFirst(null); }, [tool]);
  // focus requests (browser click -> zoom to object)
  useEffect(() => {
    if (s.focus) { s.set({ panX: size.w / 2 - s.focus.x * zoom, panY: size.h / 2 - s.focus.y * zoom, focus: null }); }
  }, [s.focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const snapV = (v: number) => Math.round(v / L.snap) * L.snap;
  const toWorld = (e: React.MouseEvent | React.WheelEvent): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    return [(e.clientX - r.left - panX) / zoom, (e.clientY - r.top - panY) / zoom];
  };
  const snapPt = (w: Pt): Pt => [snapV(w[0]), snapV(w[1])];

  const comps = p.components.filter((c) => c.sheet === sheet);
  const wires = p.wires.filter((w) => w.sheet === sheet);
  const labels = p.labels.filter((l) => l.sheet === sheet);
  const probes = p.probes.filter((q) => q.sheet === sheet);
  const texts = p.texts.filter((t) => t.sheet === sheet);
  const sel = useMemo(() => new Set(selection), [selection]);
  const runs = currentRunSet(s);
  const run = runs[runs.length - 1];

  const connPoints = useMemo(() => {
    const set = new Set<string>();
    for (const c of comps) for (const pin of worldPins(c)) set.add(pin.x + "," + pin.y);
    for (const w of wires) { set.add(w.a.join(",")); set.add(w.b.join(",")); }
    return set;
  }, [comps, wires]);
  const isConn = (pt: Pt) => connPoints.has(pt.join(",")) || wires.some((w) => onSegment(pt, w.a, w.b));

  function hit(w: Pt): Hit {
    const tol = 4 / zoom + 1;
    for (const q of [...probes].reverse()) {
      if (q.kind === "current" || q.kind === "power") { const c = comps.find((x) => x.id === q.compId); if (c && Math.hypot(w[0] - c.x, w[1] - (c.y - 12)) < 6) return { kind: "probe", id: q.id }; }
      else if (w[0] >= q.x && w[0] <= q.x + 12 && w[1] >= q.y - 14 && w[1] <= q.y) return { kind: "probe", id: q.id };
    }
    for (const l of labels) if (w[0] >= l.x - 2 && w[0] <= l.x + 6 + l.name.length * 5 && w[1] >= l.y - 9 && w[1] <= l.y + 1) return { kind: "label", id: l.id };
    for (const t of texts) { const tw = t.shape === "rect" ? t.w ?? 0 : t.text.length * 5; const th = t.shape === "rect" ? t.h ?? 0 : 10; const y0 = t.shape === "rect" ? t.y : t.y - 9; if (w[0] >= t.x && w[0] <= t.x + tw && w[1] >= y0 && w[1] <= y0 + th) return { kind: "text", id: t.id }; }
    for (const c of [...comps].reverse()) { const b = compBBox(c); if (w[0] >= b[0] - 1 && w[0] <= b[2] + 1 && w[1] >= b[1] - 1 && w[1] <= b[3] + 1) return { kind: "comp", id: c.id }; }
    for (const wr of wires) if (distSeg(w, wr.a, wr.b) < tol) return { kind: "wire", id: wr.id };
    return null;
  }

  function commitWire(a: Pt, b: Pt) {
    if (a[0] === b[0] && a[1] === b[1]) return;
    const corner: Pt = wireDir === "h" ? [b[0], a[1]] : [a[0], b[1]];
    const segs: [Pt, Pt][] = [];
    if (corner[0] !== a[0] || corner[1] !== a[1]) segs.push([a, corner]);
    if (corner[0] !== b[0] || corner[1] !== b[1]) segs.push([corner, b]);
    s.commit(tool === "bus" ? "Draw bus" : "Draw wire", (pp) => { for (const [x, y] of segs) pp.wires.push({ id: uid("w"), a: x, b: y, sheet, bus: tool === "bus" || undefined }); });
  }

  const onDown = (e: React.MouseEvent) => {
    const w = toWorld(e), sp = snapPt(w);
    if (e.button === 1 || (e.button === 0 && space.current)) { e.preventDefault(); drag.current = { mode: "pan", start: w, sx: e.clientX, sy: e.clientY, px: panX, py: panY, attached: [] }; return; }
    if (e.button !== 0) return;
    switch (tool) {
      case "place": if (s.placeType) s.addPart(s.placeType, sp[0], sp[1]); return;
      case "wire": case "bus": {
        if (!wireStart) { setWireStart(sp); return; }
        commitWire(wireStart, sp);
        if (isConn(sp) && !(sp[0] === wireStart[0] && sp[1] === wireStart[1])) setWireStart(null); else setWireStart(sp);
        return;
      }
      case "busentry": s.commit("Bus entry", (pp) => pp.wires.push({ id: uid("w"), a: sp, b: [sp[0] + 10, sp[1] - 10], sheet })); return;
      case "label": case "glabel": case "port": {
        const name = window.prompt(tool === "port" ? "Hierarchical port name" : "Net label name", "");
        if (name) s.commit("Place label", (pp) => pp.labels.push({ id: uid("l"), x: sp[0], y: sp[1], name: name.trim(), kind: tool === "label" ? "local" : tool === "glabel" ? "global" : "port", sheet }));
        return;
      }
      case "probe-voltage": {
        const net = cn.pointNet(sheet, sp[0], sp[1]);
        if (!net) { s.logMsg("warn", `No net at (${sp[0]}, ${sp[1]}) — click exactly on a wire or pin`); return; }
        const n = p.probes.length + 1;
        s.commit("Place voltage probe", (pp) => pp.probes.push({ id: uid("p"), kind: "voltage", name: `Probe${n}`, color: PALETTE[n % PALETTE.length], x: sp[0], y: sp[1], sheet, visible: true }));
        s.logMsg("info", `Voltage probe attached to net ${net}`);
        return;
      }
      case "probe-diff": {
        const net = cn.pointNet(sheet, sp[0], sp[1]);
        if (!net) { s.logMsg("warn", "Click on a net"); return; }
        if (!diffFirst) { setDiffFirst(sp); s.logMsg("info", `Diff probe (+) = ${net}. Now click the (−) reference net.`); return; }
        const n = p.probes.length + 1;
        s.commit("Place differential probe", (pp) => pp.probes.push({ id: uid("p"), kind: "diff", name: `Vdiff${n}`, color: PALETTE[n % PALETTE.length], x: diffFirst[0], y: diffFirst[1], x2: sp[0], y2: sp[1], sheet, visible: true }));
        setDiffFirst(null);
        return;
      }
      case "probe-current": case "probe-power": {
        const h = hit(w);
        const c = h?.kind === "comp" ? comps.find((x) => x.id === h.id) : null;
        if (!c || !LIBMAP[c.type]?.model || LIBMAP[c.type].instrument) { s.logMsg("warn", "Click on a simulated component to attach the probe"); return; }
        const n = p.probes.length + 1, kind = tool === "probe-current" ? "current" : "power";
        s.commit(`Place ${kind} probe`, (pp) => pp.probes.push({ id: uid("p"), kind, name: `${kind === "current" ? "I" : "P"}(${c.ref})`, color: PALETTE[n % PALETTE.length], compId: c.id, x: c.x, y: c.y, sheet, visible: true }));
        return;
      }
      case "text": {
        const t = window.prompt("Text", ""); if (t) s.commit("Place text", (pp) => pp.texts.push({ id: uid("t"), x: sp[0], y: sp[1], text: t, sheet, shape: "text" }));
        return;
      }
      case "rect": setRectStart(sp); return;
    }
    // select tool
    // endpoint drag of selected wire
    for (const id of selection) {
      const wr = wires.find((x) => x.id === id);
      if (wr) for (const end of ["a", "b"] as const) if (Math.hypot(wr[end][0] - w[0], wr[end][1] - w[1]) < 4 / zoom + 1) { drag.current = { mode: "end", start: sp, sx: e.clientX, sy: e.clientY, px: panX, py: panY, attached: [], endRef: { id, end } }; return; }
    }
    const h = hit(w);
    if (!h) { if (!e.shiftKey) s.select([]); s.set({ highlightNet: null }); drag.current = { mode: "band", start: w, sx: 0, sy: 0, px: 0, py: 0, attached: [] }; setBand([w[0], w[1], w[0], w[1]]); return; }
    let newSel = selection;
    if (e.shiftKey || e.ctrlKey || e.metaKey) { newSel = sel.has(h.id) ? selection.filter((x) => x !== h.id) : [...selection, h.id]; s.select(newSel); }
    else if (!sel.has(h.id)) { newSel = [h.id]; s.select(newSel); }
    if (h.kind === "wire") s.set({ highlightNet: cn.wireNet[h.id] ?? null });
    // compute attached wire ends (rubber-banding)
    const nsel = new Set(newSel);
    const pinPts = new Set<string>();
    for (const c of comps) if (nsel.has(c.id)) for (const pin of worldPins(c)) pinPts.add(pin.x + "," + pin.y);
    const attached: { id: string; end: "a" | "b" }[] = [];
    for (const wr of wires) if (!nsel.has(wr.id)) for (const end of ["a", "b"] as const) if (pinPts.has(wr[end].join(","))) attached.push({ id: wr.id, end });
    drag.current = { mode: "move", start: sp, sx: e.clientX, sy: e.clientY, px: panX, py: panY, attached };
    setDelta([0, 0]);
  };

  const onMove = (e: React.MouseEvent) => {
    const w = toWorld(e), sp = snapPt(w);
    setMouse(sp);
    const d = drag.current; if (!d) return;
    if (d.mode === "pan") { s.set({ panX: d.px + e.clientX - d.sx, panY: d.py + e.clientY - d.sy }); return; }
    if (d.mode === "band") { setBand([d.start[0], d.start[1], w[0], w[1]]); return; }
    setDelta([sp[0] - d.start[0], sp[1] - d.start[1]]);
  };

  const onUp = (e: React.MouseEvent) => {
    const d = drag.current; drag.current = null;
    if (rectStart && tool === "rect") {
      const sp = snapPt(toWorld(e));
      const x = Math.min(rectStart[0], sp[0]), y = Math.min(rectStart[1], sp[1]), wv = Math.abs(sp[0] - rectStart[0]), hv = Math.abs(sp[1] - rectStart[1]);
      if (wv && hv) s.commit("Draw shape", (pp) => pp.texts.push({ id: uid("t"), x, y, w: wv, h: hv, text: "", sheet, shape: "rect" }));
      setRectStart(null); return;
    }
    if (!d) return;
    if (d.mode === "band" && band) {
      const [x1, y1, x2, y2] = band; const bx = Math.min(x1, x2), by = Math.min(y1, y2), ex = Math.max(x1, x2), ey = Math.max(y1, y2);
      const inside = (x: number, y: number) => x >= bx && x <= ex && y >= by && y <= ey;
      if (ex - bx > 2 || ey - by > 2) {
        const ids = [
          ...comps.filter((c) => { const b = compBBox(c); return inside(b[0], b[1]) && inside(b[2], b[3]); }).map((c) => c.id),
          ...wires.filter((w) => inside(...w.a) && inside(...w.b)).map((w) => w.id),
          ...labels.filter((l) => inside(l.x, l.y)).map((l) => l.id),
          ...texts.filter((t) => inside(t.x, t.y)).map((t) => t.id),
          ...probes.filter((q) => inside(q.x, q.y) && q.kind !== "current" && q.kind !== "power").map((q) => q.id),
        ];
        s.select(ids, e.shiftKey);
      }
      setBand(null); return;
    }
    const [dx, dy] = delta; setDelta([0, 0]);
    if (!dx && !dy) return;
    if (d.mode === "end" && d.endRef) { const { id, end } = d.endRef; s.commit("Drag wire end", (pp) => { const w = pp.wires.find((x) => x.id === id); if (w) w[end] = [w[end][0] + dx, w[end][1] + dy]; }); return; }
    if (d.mode === "move") {
      s.commit(`Move ${selection.length} object(s)`, (pp) => {
        for (const c of pp.components) if (sel.has(c.id)) { c.x += dx; c.y += dy; }
        for (const w of pp.wires) if (sel.has(w.id)) { w.a = [w.a[0] + dx, w.a[1] + dy]; w.b = [w.b[0] + dx, w.b[1] + dy]; }
        for (const a of d.attached) { const w = pp.wires.find((x) => x.id === a.id); if (w) w[a.end] = [w[a.end][0] + dx, w[a.end][1] + dy]; }
        for (const l of pp.labels) if (sel.has(l.id)) { l.x += dx; l.y += dy; }
        for (const t of pp.texts) if (sel.has(t.id)) { t.x += dx; t.y += dy; }
        for (const q of pp.probes) if (sel.has(q.id)) { q.x += dx; q.y += dy; if (q.x2 != null) { q.x2 += dx; q.y2! += dy; } }
      });
    }
  };

  const onDbl = (e: React.MouseEvent) => {
    if (tool === "wire" || tool === "bus") { setWireStart(null); return; }
    const h = hit(toWorld(e));
    if (!h) return;
    s.select([h.id]);
    const c = h.kind === "comp" ? comps.find((x) => x.id === h.id) : null;
    if (c && LIBMAP[c.type]?.instrument) s.openWindow(c.id);
    else if (h.kind === "text") { const t = p.texts.find((x) => x.id === h.id); if (t && t.shape !== "rect") { const nt = window.prompt("Text", t.text); if (nt != null) s.commit("Edit text", (pp) => { pp.texts.find((x) => x.id === h.id)!.text = nt; }); } }
    else s.commit("Show inspector", (pp) => { pp.layout.right = true; });
  };

  const onWheel = (e: React.WheelEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const nz = Math.min(20, Math.max(0.2, zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    s.set({ zoom: nz, panX: mx - ((mx - panX) / zoom) * nz, panY: my - ((my - panY) / zoom) * nz });
  };

  // ---- rendering helpers ----
  const errComp = new Map<string, "error" | "warning">();
  const errNets = new Set<string>();
  for (const d of diags) { if (d.compId) errComp.set(d.compId, d.severity === "error" ? "error" : errComp.get(d.compId) ?? "warning"); if (d.net) errNets.add(d.net); }
  const moving = (id: string) => (drag.current?.mode === "move" && sel.has(id) ? delta : [0, 0]) as Pt;
  const attachedMap = new Map<string, Set<string>>();
  if (drag.current?.mode === "move") for (const a of drag.current.attached) { if (!attachedMap.has(a.id)) attachedMap.set(a.id, new Set()); attachedMap.get(a.id)!.add(a.end); }
  const wireDisp = (w: Wire): [Pt, Pt] => {
    let a = w.a, b = w.b;
    const [mx, my] = moving(w.id);
    a = [a[0] + mx, a[1] + my]; b = [b[0] + mx, b[1] + my];
    const at = attachedMap.get(w.id);
    if (at?.has("a")) a = [a[0] + delta[0], a[1] + delta[1]];
    if (at?.has("b")) b = [b[0] + delta[0], b[1] + delta[1]];
    if (drag.current?.mode === "end" && drag.current.endRef?.id === w.id) { if (drag.current.endRef.end === "a") a = [a[0] + delta[0], a[1] + delta[1]]; else b = [b[0] + delta[0], b[1] + delta[1]]; }
    return [a, b];
  };
  const lastVal = (sig: string) => { const arr = run?.signals[sig]; return arr?.length ? arr[arr.length - 1] : undefined; };

  const minor = L.snap * zoom;
  const gridStep = minor < 6 ? L.snap * Math.ceil(6 / minor) : L.snap;
  const major = 100;
  const cursor = tool === "select" ? (space.current ? "grab" : "default") : "crosshair";

  return (
    <div ref={wrap} className="relative h-full w-full overflow-hidden" style={{ background: "var(--cb-canvas)" }}>
      {L.rulers && <Rulers w={size.w} h={size.h} zoom={zoom} panX={panX} panY={panY} mouse={mouse} />}
      <svg
        ref={svgRef}
        data-testid="schematic"
        className="absolute select-none"
        style={{ left: RUL, top: RUL, width: size.w - RUL, height: size.h - RUL, cursor }}
        onMouseDown={onDown} onMouseMove={onMove} onMouseUp={onUp} onDoubleClick={onDbl} onWheel={onWheel}
        onContextMenu={(e) => { e.preventDefault(); if (tool !== "select") s.setTool("select"); }}
      >
        <defs>
          <pattern id="gminor" width={gridStep * zoom} height={gridStep * zoom} patternUnits="userSpaceOnUse" x={panX} y={panY}>
            <circle cx={0.5} cy={0.5} r={0.6} fill="var(--cb-grid)" />
          </pattern>
          <pattern id="gmajor" width={major * zoom} height={major * zoom} patternUnits="userSpaceOnUse" x={panX} y={panY}>
            <path d={`M ${major * zoom} 0 L 0 0 0 ${major * zoom}`} fill="none" stroke="var(--cb-grid-major)" strokeWidth={0.5} />
          </pattern>
        </defs>
        {L.grid && <rect width="100%" height="100%" fill="url(#gminor)" />}
        {L.grid && <rect width="100%" height="100%" fill="url(#gmajor)" />}
        <g transform={`translate(${panX},${panY}) scale(${zoom})`}>
          {L.pageBorder && <rect x={0} y={0} width={1100} height={850} fill="none" stroke="var(--cb-page)" strokeWidth={1 / zoom} strokeDasharray={`${6 / zoom} ${4 / zoom}`} />}
          {/* texts / shapes */}
          {texts.map((t) => {
            const [mx, my] = moving(t.id);
            return t.shape === "rect"
              ? <rect key={t.id} x={t.x + mx} y={t.y + my} width={t.w} height={t.h} fill="none" stroke={sel.has(t.id) ? "var(--cb-sel)" : "var(--cb-muted)"} strokeWidth={0.8} />
              : <text key={t.id} x={t.x + mx} y={t.y + my} fontSize={8} fill={sel.has(t.id) ? "var(--cb-sel)" : "var(--cb-sym)"}>{t.text}</text>;
          })}
          {/* wires */}
          {wires.map((w) => {
            const [a, b] = wireDisp(w);
            const net = cn.wireNet[w.id];
            const hl = net && net === s.highlightNet;
            const col = sel.has(w.id) ? "var(--cb-sel)" : net && errNets.has(net) ? "var(--cb-err)" : hl ? "var(--cb-hl)" : w.color || (w.bus ? "var(--cb-bus)" : "var(--cb-wire)");
            return <line key={w.id} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={col} strokeWidth={w.bus ? 3 : hl ? 1.8 : 1.1} strokeLinecap="round" />;
          })}
          {cn.junctions.filter((j) => j.sheet === sheet).map((j) => <circle key={`${j.x},${j.y}`} cx={j.x} cy={j.y} r={2} fill="var(--cb-wire)" />)}
          {/* components */}
          {comps.map((c) => <CompView key={c.id} c={c} off={moving(c.id)} selected={sel.has(c.id)} err={errComp.get(c.id)} showRef={L.showRefs} showVal={L.showValues} showPins={L.showPinNames} showInstr={L.showInstruments} lit={litState(c, cn.pinNet, lastVal)} />)}
          {/* labels */}
          {L.showLabels && labels.map((l) => {
            const [mx, my] = moving(l.id);
            const v = L.markers ? lastVal(`V(${cn.pointNet(sheet, l.x, l.y)})`) : undefined;
            const col = sel.has(l.id) ? "var(--cb-sel)" : "var(--cb-label)";
            const w = 6 + l.name.length * 5;
            return (
              <g key={l.id} transform={`translate(${l.x + mx},${l.y + my})`}>
                {l.kind === "local" && <path d={`M0,0 L0,-3 L2,-8 L${w},-8 L${w},-3`} fill="none" stroke={col} strokeWidth={0.6} />}
                {l.kind === "global" && <path d={`M0,0 L5,-4.5 L${w + 4},-4.5 L${w + 4},4.5 L5,4.5 Z`} fill="var(--cb-canvas)" stroke={col} strokeWidth={0.7} />}
                {l.kind === "port" && <path d={`M0,0 L5,-4.5 L${w + 4},-4.5 L${w + 8},0 L${w + 4},4.5 L5,4.5 Z`} fill="var(--cb-canvas)" stroke={col} strokeWidth={0.7} />}
                <text x={l.kind === "local" ? 3 : 7} y={l.kind === "local" ? -3.6 : 2.5} fontSize={6.5} fill={col} style={{ fontFamily: "ui-monospace,monospace" }}>{l.name}</text>
                {v != null && <text x={3} y={7} fontSize={5} fill="var(--cb-ok)" style={{ fontFamily: "ui-monospace,monospace" }}>{fmt(v, "V", 3)}</text>}
                <circle r={0.9} fill={col} />
              </g>
            );
          })}
          {/* probes */}
          {L.showProbes && probes.map((q) => {
            const [mx, my] = moving(q.id);
            const vals = run ? probeSeries(q, p, cn, run) : null;
            const v = L.markers && vals?.length ? vals[vals.length - 1] : undefined;
            const selC = sel.has(q.id) ? "var(--cb-sel)" : q.color;
            if (q.kind === "current" || q.kind === "power") {
              const c = comps.find((x) => x.id === q.compId); if (!c) return null;
              const pins = worldPins(c); if (pins.length < 2) return null;
              const [a, b] = [pins[0], pins[1]];
              const ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
              return (
                <g key={q.id} transform={`translate(${c.x},${c.y - 12})`}>
                  <g transform={`rotate(${ang})`}><line x1={-6} y1={0} x2={5} y2={0} stroke={selC} strokeWidth={1.2} /><path d="M6,0 L2,-2.5 L2,2.5 Z" fill={selC} /></g>
                  <text x={7} y={-3} fontSize={5.5} fill={selC} style={{ fontFamily: "ui-monospace,monospace" }}>{q.name}{v != null ? " " + fmt(v, probeUnit(q), 3) : ""}</text>
                </g>
              );
            }
            return (
              <g key={q.id}>
                {q.kind === "diff" && q.x2 != null && <line x1={q.x + mx} y1={q.y + my} x2={q.x2 + mx} y2={q.y2! + my} stroke={q.color} strokeWidth={0.5} strokeDasharray="2 2" />}
                {q.kind === "diff" && q.x2 != null && <text x={q.x2 + mx + 2} y={q.y2! + my - 2} fontSize={6} fill={q.color}>−</text>}
                <g transform={`translate(${q.x + mx},${q.y + my})`}>
                  <path d="M0,0 L4,-6 L12,-6 L12,-14 L4,-14 L4,-6" fill={q.color} fillOpacity={0.85} stroke={selC} strokeWidth={sel.has(q.id) ? 1.2 : 0.6} />
                  <text x={14} y={-8} fontSize={5.5} fill={selC} style={{ fontFamily: "ui-monospace,monospace" }}>{q.name}{v != null ? " " + fmt(v, "V", 3) : ""}</text>
                </g>
              </g>
            );
          })}
          {/* diagnostics markers */}
          {L.markers && diags.filter((d) => d.at && d.at.sheet === sheet).map((d) => (
            <circle key={d.id} cx={d.at!.x} cy={d.at!.y} r={3} fill="none" stroke={d.severity === "error" ? "var(--cb-err)" : "var(--cb-warn)"} strokeWidth={1} />
          ))}
          {/* previews */}
          {(tool === "wire" || tool === "bus") && wireStart && (() => {
            const corner: Pt = wireDir === "h" ? [mouse[0], wireStart[1]] : [wireStart[0], mouse[1]];
            return <polyline points={`${wireStart.join(",")} ${corner.join(",")} ${mouse.join(",")}`} fill="none" stroke="var(--cb-sel)" strokeWidth={tool === "bus" ? 3 : 1} strokeDasharray="3 2" />;
          })()}
          {tool === "place" && s.placeType && LIBMAP[s.placeType] && (
            <g opacity={0.55} transform={`translate(${mouse[0]},${mouse[1]}) rotate(${s.placeRot * 90}) scale(${s.placeMirror ? -1 : 1},1)`} style={{ color: "var(--cb-sel)" }}>
              <Prims prims={symbolOf(LIBMAP[s.placeType], {})} />
            </g>
          )}
          {tool === "probe-diff" && diffFirst && <line x1={diffFirst[0]} y1={diffFirst[1]} x2={mouse[0]} y2={mouse[1]} stroke="var(--cb-sel)" strokeDasharray="2 2" strokeWidth={0.6} />}
          {rectStart && <rect x={Math.min(rectStart[0], mouse[0])} y={Math.min(rectStart[1], mouse[1])} width={Math.abs(mouse[0] - rectStart[0])} height={Math.abs(mouse[1] - rectStart[1])} fill="none" stroke="var(--cb-sel)" strokeDasharray="3 2" strokeWidth={0.6} />}
          {tool !== "select" && <g stroke="var(--cb-sel)" strokeWidth={0.4}><line x1={mouse[0] - 4} y1={mouse[1]} x2={mouse[0] + 4} y2={mouse[1]} /><line x1={mouse[0]} y1={mouse[1] - 4} x2={mouse[0]} y2={mouse[1] + 4} /></g>}
          {band && <rect x={Math.min(band[0], band[2])} y={Math.min(band[1], band[3])} width={Math.abs(band[2] - band[0])} height={Math.abs(band[3] - band[1])} fill="var(--cb-sel)" fillOpacity={0.08} stroke="var(--cb-sel)" strokeWidth={0.6 / zoom * 2} />}
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-1 right-2 font-mono text-[10px]" style={{ color: "var(--cb-muted)" }}>
        X {mouse[0] * 10} mil · Y {mouse[1] * 10} mil · {Math.round(zoom * 50)}% · grid {L.snap * 10} mil {tool === "wire" ? `· route ${wireDir === "h" ? "H→V" : "V→H"} (/)` : ""}
      </div>
    </div>
  );
}

const PALETTE = ["#1f6feb", "#d1242f", "#1a7f37", "#9a6700", "#8250df", "#bf3989", "#0a7ea4", "#cf222e"];

function litState(c: Component, pinNet: Record<string, string>, lastVal: (s: string) => number | undefined): boolean | undefined {
  if (c.type !== "LOGIC_PROBE" && c.type !== "LED_IND" && c.type !== "LED") return undefined;
  if (c.type === "LED") { const v = lastVal(`I(${c.ref})`); return v != null ? v > 1e-3 : undefined; }
  const n = pinNet[c.id + ":IN"]; if (!n) return undefined;
  const v = lastVal(`V(${n})`); if (v == null) return undefined;
  return v > (parseFloat(c.props.threshold) || 2.5);
}

function CompView({ c, off, selected, err, showRef, showVal, showPins, showInstr, lit }: { c: Component; off: Pt; selected: boolean; err?: "error" | "warning"; showRef: boolean; showVal: boolean; showPins: boolean; showInstr: boolean; lit?: boolean }) {
  const def = LIBMAP[c.type];
  const cc = { ...c, x: c.x + off[0], y: c.y + off[1] };
  if (!def) {
    return <g><rect x={cc.x - 10} y={cc.y - 10} width={20} height={20} fill="none" stroke="var(--cb-err)" strokeDasharray="2 2" /><text x={cc.x} y={cc.y + 3} fontSize={6} textAnchor="middle" fill="var(--cb-err)">{c.ref}?</text></g>;
  }
  if (def.instrument && !showInstr) return null;
  const b = compBBox(cc);
  const col = selected ? "var(--cb-sel)" : c.color || (c.enabled === false ? "var(--cb-muted)" : "var(--cb-sym)");
  const val = def.valueKey ? c.props[def.valueKey] : "";
  const prims = symbolOf(def, c.props);
  return (
    <g>
      {lit !== undefined && <circle cx={xform(cc, c.type === "LED" ? 0 : 0, 0)[0]} cy={xform(cc, 0, 0)[1]} r={lit ? 7 : 0} fill={c.props.color || "#e0342f"} opacity={0.6} />}
      <g transform={`translate(${cc.x},${cc.y}) rotate(${c.rot * 90}) scale(${c.mirror ? -1 : 1},1)`} style={{ color: col }}>
        <Prims prims={prims} stroke={col} />
      </g>
      {err && <rect x={b[0] - 3} y={b[1] - 3} width={b[2] - b[0] + 6} height={b[3] - b[1] + 6} fill="none" stroke={err === "error" ? "var(--cb-err)" : "var(--cb-warn)"} strokeWidth={0.8} strokeDasharray="3 2" />}
      {showRef && c.showRef !== false && !c.ref.startsWith("#") && <text x={b[2] + 2} y={b[1] + 6} fontSize={6.5} fill={col} style={{ fontFamily: "ui-monospace,monospace" }}>{c.ref}</text>}
      {showVal && c.showValue !== false && val && def.model !== "" && <text x={b[2] + 2} y={b[1] + 13} fontSize={6} fill="var(--cb-muted)" style={{ fontFamily: "ui-monospace,monospace" }}>{val}{def.model === "PWR" ? "V" : ""}</text>}
      {def.model === "PWR" && <text x={cc.x} y={b[1] - 2} fontSize={6} textAnchor="middle" fill={col}>{c.props.net}</text>}
      {showPins && pinsOf(def, c.props).map((pn) => { const [x, y] = xform(cc, pn.x, pn.y); return <text key={pn.name} x={x + 1} y={y - 1} fontSize={4} fill="var(--cb-muted)">{pn.name}</text>; })}
    </g>
  );
}

function Rulers({ w, h, zoom, panX, panY, mouse }: { w: number; h: number; zoom: number; panX: number; panY: number; mouse: Pt }) {
  const R = 18;
  const step = zoom > 4 ? 10 : zoom > 1.5 ? 50 : 100; // units (10 mil)
  const ticksX: number[] = [], ticksY: number[] = [];
  for (let u = Math.floor(-panX / zoom / step) * step; u * zoom + panX < w; u += step) ticksX.push(u);
  for (let u = Math.floor(-panY / zoom / step) * step; u * zoom + panY < h; u += step) ticksY.push(u);
  const st = { background: "var(--cb-panel)", borderColor: "var(--cb-border)", color: "var(--cb-muted)" };
  return (
    <>
      <div className="absolute left-0 top-0 z-10 border-b border-r" style={{ ...st, width: R, height: R }} />
      <svg className="absolute top-0 z-10 border-b" style={{ ...st, left: R, width: w - R, height: R }}>
        {ticksX.map((u) => <g key={u}><line x1={u * zoom + panX} x2={u * zoom + panX} y1={u % 100 === 0 ? 6 : 12} y2={R} stroke="currentColor" strokeWidth={0.6} />{u % 100 === 0 && <text x={u * zoom + panX + 2} y={9} fontSize={8} fill="currentColor">{u / 100}&quot;</text>}</g>)}
        <line x1={mouse[0] * zoom + panX} x2={mouse[0] * zoom + panX} y1={0} y2={R} stroke="var(--cb-sel)" />
      </svg>
      <svg className="absolute left-0 z-10 border-r" style={{ ...st, top: R, width: R, height: h - R }}>
        {ticksY.map((u) => <g key={u}><line y1={u * zoom + panY} y2={u * zoom + panY} x1={u % 100 === 0 ? 6 : 12} x2={R} stroke="currentColor" strokeWidth={0.6} />{u % 100 === 0 && <text x={1} y={u * zoom + panY - 2} fontSize={8} fill="currentColor">{u / 100}</text>}</g>)}
        <line y1={mouse[1] * zoom + panY} y2={mouse[1] * zoom + panY} x1={0} x2={R} stroke="var(--cb-sel)" />
      </svg>
    </>
  );
}
