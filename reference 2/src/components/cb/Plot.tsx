"use client";
import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from "react";
import { fmt } from "@/lib/cb/units";

export interface Trace { name: string; color: string; x: number[]; y: number[]; dashed?: boolean; unit?: string }
export interface PlotHandle { svg: () => SVGSVGElement | null; autoscale: () => void }

function niceTicks(a: number, b: number, n = 6, log = false): number[] {
  if (log) {
    const out: number[] = [];
    for (let e = Math.floor(Math.log10(a)); e <= Math.ceil(Math.log10(b)); e++) { const v = 10 ** e; if (v >= a * 0.999 && v <= b * 1.001) out.push(v); }
    return out;
  }
  const span = b - a || 1, raw = span / n, mag = 10 ** Math.floor(Math.log10(raw)), f = raw / mag;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return out;
}

export const Plot = forwardRef<PlotHandle, {
  traces: Trace[]; xLog?: boolean; yLog?: boolean; xUnit?: string; yUnit?: string; cursors?: boolean;
  onCursor?: (c: [number, number]) => void; height?: number | string; title?: string;
}>(function Plot({ traces, xLog, yLog, xUnit = "", yUnit = "", cursors, onCursor, height = "100%", title }, ref) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [sz, setSz] = useState({ w: 600, h: 300 });
  const [view, setView] = useState<[number, number, number, number] | null>(null);
  const [cur, setCur] = useState<[number, number] | null>(null);
  const [zoomBox, setZoomBox] = useState<[number, number, number, number] | null>(null);
  const dragRef = useRef<null | { kind: "zoom" | "pan" | "c0" | "c1"; x: number; y: number; v: [number, number, number, number] }>(null);

  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setSz({ w: el.clientWidth, h: el.clientHeight })); ro.observe(el); return () => ro.disconnect(); }, []);

  const auto = (): [number, number, number, number] => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const t of traces) for (let i = 0; i < t.x.length; i++) {
      const xv = t.x[i], yv = t.y[i];
      if (!isFinite(xv) || !isFinite(yv) || (xLog && xv <= 0) || (yLog && yv <= 0)) continue;
      x0 = Math.min(x0, xv); x1 = Math.max(x1, xv); y0 = Math.min(y0, yv); y1 = Math.max(y1, yv);
    }
    if (!isFinite(x0)) return [0, 1, -1, 1];
    if (x0 === x1) { x0 -= 0.5; x1 += 0.5; }
    if (y0 === y1) { const d = Math.abs(y0) * 0.1 || 1; y0 -= d; y1 += d; }
    if (!yLog) { const m = (y1 - y0) * 0.06; y0 -= m; y1 += m; }
    return [x0, x1, y0, y1];
  };
  const traceKey = traces.map((t) => t.name + t.x.length).join("|");
  useEffect(() => { setView(null); }, [traceKey, xLog, yLog]);
  useImperativeHandle(ref, () => ({ svg: () => svg.current, autoscale: () => setView(null) }));

  const v = view ?? auto();
  const M = { l: 58, r: 10, t: title ? 18 : 8, b: 26 };
  const W = Math.max(50, sz.w - M.l - M.r), H = Math.max(40, sz.h - M.t - M.b);
  const fx = (x: number) => M.l + (xLog ? (Math.log10(x) - Math.log10(v[0])) / (Math.log10(v[1]) - Math.log10(v[0])) : (x - v[0]) / (v[1] - v[0])) * W;
  const fy = (y: number) => M.t + H - (yLog ? (Math.log10(y) - Math.log10(v[2])) / (Math.log10(v[3]) - Math.log10(v[2])) : (y - v[2]) / (v[3] - v[2])) * H;
  const ix = (px: number) => { const f = (px - M.l) / W; return xLog ? 10 ** (Math.log10(v[0]) + f * (Math.log10(v[1]) - Math.log10(v[0]))) : v[0] + f * (v[1] - v[0]); };
  const iy = (py: number) => { const f = (M.t + H - py) / H; return yLog ? 10 ** (Math.log10(v[2]) + f * (Math.log10(v[3]) - Math.log10(v[2]))) : v[2] + f * (v[3] - v[2]); };
  const c = cursors ? (cur ?? [v[0] + (v[1] - v[0]) * 0.25, v[0] + (v[1] - v[0]) * 0.75]) : null;
  useEffect(() => { if (c && onCursor) onCursor(c); }, [c?.[0], c?.[1]]); // eslint-disable-line react-hooks/exhaustive-deps

  const pos = (e: React.MouseEvent) => { const r = svg.current!.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const down = (e: React.MouseEvent) => {
    const [px, py] = pos(e);
    if (c) for (const k of [0, 1] as const) if (Math.abs(fx(c[k]) - px) < 5) { dragRef.current = { kind: k ? "c1" : "c0", x: px, y: py, v }; return; }
    dragRef.current = { kind: e.shiftKey || e.button === 1 ? "pan" : "zoom", x: px, y: py, v };
  };
  const move = (e: React.MouseEvent) => {
    const d = dragRef.current; if (!d) return;
    const [px, py] = pos(e);
    if (d.kind === "c0" || d.kind === "c1") { const nv = ix(px); const cc: [number, number] = [...(c as [number, number])]; cc[d.kind === "c0" ? 0 : 1] = nv; setCur(cc); return; }
    if (d.kind === "zoom") { setZoomBox([d.x, d.y, px, py]); return; }
    const dxf = (px - d.x) / W, dyf = (py - d.y) / H;
    if (xLog) { const lx = Math.log10(d.v[1] / d.v[0]) * dxf; setView([d.v[0] / 10 ** lx, d.v[1] / 10 ** lx, ...(yLog ? [d.v[2] * 10 ** (Math.log10(d.v[3] / d.v[2]) * dyf), d.v[3] * 10 ** (Math.log10(d.v[3] / d.v[2]) * dyf)] : [d.v[2] + (d.v[3] - d.v[2]) * dyf, d.v[3] + (d.v[3] - d.v[2]) * dyf])] as [number, number, number, number]); }
    else setView([d.v[0] - (d.v[1] - d.v[0]) * dxf, d.v[1] - (d.v[1] - d.v[0]) * dxf, d.v[2] + (d.v[3] - d.v[2]) * dyf, d.v[3] + (d.v[3] - d.v[2]) * dyf]);
  };
  const up = () => {
    const d = dragRef.current; dragRef.current = null;
    if (d?.kind === "zoom" && zoomBox) {
      const [a, b, cc, dd] = zoomBox;
      if (Math.abs(cc - a) > 6 && Math.abs(dd - b) > 6) setView([ix(Math.min(a, cc)), ix(Math.max(a, cc)), iy(Math.max(b, dd)), iy(Math.min(b, dd))]);
    }
    setZoomBox(null);
  };
  const wheel = (e: React.WheelEvent) => {
    const [px] = pos(e); const k = e.deltaY < 0 ? 0.8 : 1.25; const x = ix(px);
    if (xLog) setView([x / (x / v[0]) ** k, x * (v[1] / x) ** k, v[2], v[3]]);
    else setView([x - (x - v[0]) * k, x + (v[1] - x) * k, v[2], v[3]]);
  };

  const xt = niceTicks(v[0], v[1], Math.max(3, W / 90), xLog), yt = niceTicks(v[2], v[3], Math.max(3, H / 45), yLog);
  const path = (t: Trace) => {
    let d = ""; let pen = false;
    const step = Math.max(1, Math.floor(t.x.length / (W * 2)));
    for (let i = 0; i < t.x.length; i += step) {
      const xv = t.x[i], yv = t.y[i];
      if (!isFinite(yv) || (xLog && xv <= 0) || (yLog && yv <= 0) || xv < v[0] - (v[1] - v[0]) || xv > v[1] + (v[1] - v[0])) { pen = false; continue; }
      const X = fx(xv), Y = Math.max(-1e4, Math.min(1e4, fy(yv)));
      d += (pen ? "L" : "M") + X.toFixed(1) + "," + Y.toFixed(1); pen = true;
    }
    return d;
  };
  return (
    <div ref={wrap} style={{ height, width: "100%", position: "relative" }}>
      <svg ref={svg} width={sz.w} height={sz.h} onMouseDown={down} onMouseMove={move} onMouseUp={up} onMouseLeave={up} onWheel={wheel} onDoubleClick={() => setView(null)} style={{ display: "block", background: "var(--cb-plot)", cursor: "crosshair" }} xmlns="http://www.w3.org/2000/svg" fontFamily="ui-monospace,monospace">
        <rect x={0} y={0} width={sz.w} height={sz.h} fill="var(--cb-plot)" />
        {title && <text x={M.l} y={12} fontSize={10} fill="var(--cb-text)">{title}</text>}
        <defs><clipPath id={"clip" + traceKey.length}><rect x={M.l} y={M.t} width={W} height={H} /></clipPath></defs>
        {xt.map((t) => <g key={"x" + t}><line x1={fx(t)} x2={fx(t)} y1={M.t} y2={M.t + H} stroke="var(--cb-plotgrid)" /><text x={fx(t)} y={M.t + H + 12} fontSize={9} textAnchor="middle" fill="var(--cb-muted)">{fmt(t, xUnit, 3)}</text></g>)}
        {yt.map((t) => <g key={"y" + t}><line x1={M.l} x2={M.l + W} y1={fy(t)} y2={fy(t)} stroke="var(--cb-plotgrid)" /><text x={M.l - 4} y={fy(t) + 3} fontSize={9} textAnchor="end" fill="var(--cb-muted)">{fmt(t, yUnit, 3)}</text></g>)}
        <rect x={M.l} y={M.t} width={W} height={H} fill="none" stroke="var(--cb-border)" />
        <g clipPath={`url(#clip${traceKey.length})`}>
          {traces.map((t, i) => <path key={i} d={path(t)} fill="none" stroke={t.color} strokeWidth={1.3} strokeDasharray={t.dashed ? "4 3" : undefined} />)}
          {c && c.map((cx, k) => <g key={k}><line x1={fx(cx)} x2={fx(cx)} y1={M.t} y2={M.t + H} stroke={k ? "#9a6700" : "#8250df"} strokeDasharray="4 2" /><text x={fx(cx) + 3} y={M.t + 10} fontSize={9} fill={k ? "#9a6700" : "#8250df"}>{k + 1}</text></g>)}
        </g>
        {zoomBox && <rect x={Math.min(zoomBox[0], zoomBox[2])} y={Math.min(zoomBox[1], zoomBox[3])} width={Math.abs(zoomBox[2] - zoomBox[0])} height={Math.abs(zoomBox[3] - zoomBox[1])} fill="var(--cb-sel)" fillOpacity={0.1} stroke="var(--cb-sel)" />}
      </svg>
    </div>
  );
});

export function valueAt(x: number[], y: number[], t: number) {
  if (!x.length) return NaN;
  let lo = 0, hi = x.length - 1;
  if (t <= x[0]) return y[0]; if (t >= x[hi]) return y[hi];
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (x[m] < t) lo = m; else hi = m; }
  const f = (t - x[lo]) / (x[hi] - x[lo]); return y[lo] + (y[hi] - y[lo]) * f;
}

export function svgString(el: SVGSVGElement): string {
  const clone = el.cloneNode(true) as SVGSVGElement;
  const cs = getComputedStyle(el);
  const vars = ["--cb-plot", "--cb-plotgrid", "--cb-muted", "--cb-border", "--cb-text", "--cb-sel", "--cb-canvas", "--cb-grid", "--cb-grid-major", "--cb-sym", "--cb-wire", "--cb-label", "--cb-page", "--cb-err", "--cb-warn", "--cb-ok", "--cb-hl", "--cb-bus"];
  let str = new XMLSerializer().serializeToString(clone);
  for (const v of vars) str = str.split(`var(${v})`).join(cs.getPropertyValue(v).trim() || "#000");
  if (!str.includes("xmlns=")) str = str.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  return str;
}
export function download(name: string, data: string | Blob, type = "text/plain") {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function exportSVG(el: SVGSVGElement, name: string) { download(name + ".svg", svgString(el), "image/svg+xml"); }
export function exportPNG(el: SVGSVGElement, name: string) {
  const str = svgString(el); const w = el.clientWidth || el.width.baseVal.value, h = el.clientHeight || el.height.baseVal.value;
  const img = new Image();
  img.onload = () => { const c = document.createElement("canvas"); c.width = w * 2; c.height = h * 2; const g = c.getContext("2d")!; g.scale(2, 2); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h); c.toBlob((b) => b && download(name + ".png", b)); };
  img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(str);
}
export function exportPDF(el: SVGSVGElement, title: string) {
  const win = window.open("", "_blank"); if (!win) return;
  win.document.write(`<html><head><title>${title}</title><style>@page{size:landscape;margin:12mm}body{margin:0;font-family:sans-serif}svg{max-width:100%;height:auto}</style></head><body><h3 style="font-size:12px">${title}</h3>${svgString(el)}<script>setTimeout(()=>{print();},300)<\/script></body></html>`);
  win.document.close();
}
