"use client";

import { useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/state/store";
import { derivative, fftSpectrum, fmt, integral, measure, evalExpression } from "@/lib/sim/measure";
import { Icon } from "@/components/ui";

const PALETTE = [
  "var(--trace-1)",
  "var(--trace-2)",
  "var(--trace-3)",
  "var(--trace-4)",
  "var(--trace-5)",
  "var(--trace-6)",
];

function niceTicks(min: number, max: number, count = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  const step = (norm >= 5 ? 5 : norm >= 2 ? 2 : 1) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 0.001; v += step) out.push(v);
  return out;
}

export default function Grapher() {
  const results = useApp((s) => s.results);
  const activeRunId = useApp((s) => s.activeRunId);
  const setActiveRun = useApp((s) => s.setActiveRun);
  const run = results.find((r) => r.id === activeRunId) ?? results[results.length - 1];

  const [xLog, setXLog] = useState(false);
  const [yLog, setYLog] = useState(false);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [cursor1, setCursor1] = useState<number | null>(null);
  const [cursor2, setCursor2] = useState<number | null>(null);
  const [selectedTrace, setSelectedTrace] = useState<string | null>(null);
  const [mathOpen, setMathOpen] = useState(false);
  const [mathExpr, setMathExpr] = useState("V(OUT) / V(IN)");
  const [extra, setExtra] = useState<{ name: string; label: string; values: number[]; unit: string }[]>([]);
  const [autoScale, setAutoScale] = useState(true);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const x = run?.result.x ?? [];
  const allTraces = useMemo(() => {
    if (!run) return [];
    return [
      ...run.result.traces.map((t, i) => ({ ...t, colorIndex: i })),
      ...extra.map((t, i) => ({ ...t, kind: "math" as const, colorIndex: run.result.traces.length + i })),
    ];
  }, [run, extra]);

  const visible = allTraces.filter((t) => !hidden[t.name]);
  const active = visible.find((t) => t.name === selectedTrace) ?? visible[0];

  const view = useMemo(() => {
    const xs = x.length ? x : [0, 1];
    let x0 = Math.min(...xs);
    let x1 = Math.max(...xs);
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const t of visible) {
      for (const v of t.values) {
        if (!Number.isFinite(v)) continue;
        if (yLog && v <= 0) continue;
        y0 = Math.min(y0, v);
        y1 = Math.max(y1, v);
      }
    }
    if (!Number.isFinite(y0)) {
      y0 = -1;
      y1 = 1;
    }
    if (y0 === y1) {
      y0 -= 1;
      y1 += 1;
    }
    const pad = (y1 - y0) * 0.08;
    if (autoScale) {
      y0 -= pad;
      y1 += pad;
      if (xLog && x0 <= 0) x0 = Math.max(xs.find((v) => v > 0) ?? 1) * 0.5;
    }
    return { x0, x1, y0, y1 };
  }, [x, visible, yLog, xLog, autoScale]);

  const W = 1000;
  const H = 380;
  const M = { l: 66, r: 16, t: 16, b: 34 };

  const sx = (v: number) => {
    const { x0, x1 } = view;
    if (xLog && v > 0 && x0 > 0) {
      return M.l + ((Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0))) * (W - M.l - M.r);
    }
    return M.l + ((v - x0) / (x1 - x0 || 1)) * (W - M.l - M.r);
  };
  const sy = (v: number) => {
    const { y0, y1 } = view;
    if (yLog && v > 0 && y0 > 0) {
      return H - M.b - ((Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0))) * (H - M.t - M.b);
    }
    return H - M.b - ((v - y0) / (y1 - y0 || 1)) * (H - M.t - M.b);
  };

  const idxOfX = (xv: number) => {
    if (!x.length) return 0;
    let best = 0;
    let bd = Infinity;
    x.forEach((v, i) => {
      const d = Math.abs(v - xv);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

  const cursorAt = (px: number) => {
    const { x0, x1 } = view;
    const t =
      xLog && x0 > 0
        ? Math.pow(10, Math.log10(x0) + ((px - M.l) / (W - M.l - M.r)) * (Math.log10(x1) - Math.log10(x0)))
        : x0 + ((px - M.l) / (W - M.l - M.r)) * (x1 - x0);
    return idxOfX(t);
  };

  const stats = active ? measure(x, active.values) : [];
  const c1 = cursor1 ?? null;
  const c2 = cursor2 ?? null;

  const exportCsv = () => {
    if (!run) return;
    const head = ["x", ...allTraces.map((t) => t.name)].join(",");
    const rows = x.map((xv, i) =>
      [xv, ...allTraces.map((t) => (t.values[i] ?? "").toString())].join(","),
    );
    download(`${run.label.replace(/\s+/g, "_")}.csv`, [head, ...rows].join("\n"), "text/csv");
  };

  const exportSvg = () => {
    const el = svgRef.current;
    if (!el) return;
    const clone = el.cloneNode(true) as SVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    download(`${run?.label.replace(/\s+/g, "_") ?? "plot"}.svg`, clone.outerHTML, "image/svg+xml");
  };

  const exportPng = () => {
    const el = svgRef.current;
    if (!el) return;
    const svg = el.outerHTML;
    const img = new Image();
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = W * 2;
      canvas.height = H * 2;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `${run?.label.replace(/\s+/g, "_") ?? "plot"}.png`;
      a.click();
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const addMath = () => {
    const traces: Record<string, number[]> = {};
    for (const t of allTraces) traces[t.name] = t.values;
    const res = evalExpression(mathExpr, traces);
    if (!res) {
      useApp.getState().addLog("error", `Math expression could not be evaluated: ${mathExpr}`);
      return;
    }
    setExtra((e) => [...e, { name: `M${e.length + 1}(${mathExpr})`, label: mathExpr, values: res, unit: "" }]);
    setMathOpen(false);
    useApp.getState().addLog("ok", `Math trace added: ${mathExpr}`);
  };

  return (
    <div className="flex flex-col h-full min-h-0" style={{ background: "var(--panel)" }}>
      <div className="panel-head">
        <Icon name="chart" />
        <span className="sc" style={{ color: "var(--ink)" }}>
          Grapher
        </span>
        <select
          className="inp"
          style={{ width: 190, height: 22, marginLeft: 8 }}
          value={run?.id ?? ""}
          onChange={(e) => setActiveRun(e.target.value)}
        >
          {results.length === 0 && <option value="">No simulation results</option>}
          {results.map((r) => (
            <option key={r.id} value={r.id}>
              {new Date(r.createdAt).toLocaleTimeString("en-GB", { hour12: false })} · {r.label}
              {r.sweepValue ? ` (${r.sweepValue})` : ""}
            </option>
          ))}
        </select>
        <div className="tsep" />
        <button className={`tbtn ${xLog ? "active" : ""}`} onClick={() => setXLog(!xLog)} title="Logarithmic X axis">
          log X
        </button>
        <button className={`tbtn ${yLog ? "active" : ""}`} onClick={() => setYLog(!yLog)} title="Logarithmic Y axis">
          log Y
        </button>
        <button
          className={`tbtn ${autoScale ? "active" : ""}`}
          onClick={() => setAutoScale(!autoScale)}
          title="Auto scale"
        >
          auto
        </button>
        <div className="tsep" />
        <button
          className="tbtn"
          title="Derivative of the selected trace"
          disabled={!active}
          onClick={() =>
            active &&
            setExtra((e) => [
              ...e,
              {
                name: `d/dt ${active.name}`,
                label: `d/dt(${active.label})`,
                values: derivative(x, active.values),
                unit: `${active.unit}/s`,
              },
            ])
          }
        >
          d/dt
        </button>
        <button
          className="tbtn"
          title="Integral of the selected trace"
          disabled={!active}
          onClick={() =>
            active &&
            setExtra((e) => [
              ...e,
              {
                name: `∫ ${active.name}`,
                label: `∫(${active.label})`,
                values: integral(x, active.values),
                unit: `${active.unit}·s`,
              },
            ])
          }
        >
          ∫
        </button>
        <button
          className="tbtn"
          title="FFT magnitude spectrum of the selected trace"
          disabled={!active || x.length < 8}
          onClick={() => {
            if (!active) return;
            const spec = fftSpectrum(x, active.values);
            useApp.getState().addLog("info", `FFT computed for ${active.name} — ${spec.x.length} bins`);
            setExtra((e) => [
              ...e,
              {
                name: `FFT ${active.name}`,
                label: `FFT(${active.label})`,
                values: spec.y,
                unit: active.unit,
              },
            ]);
            setFftX(spec.x);
          }}
        >
          FFT
        </button>
        <button className="tbtn" onClick={() => setMathOpen((v) => !v)} title="Math expression">
          f(x)
        </button>
        <div className="tsep" />
        <button className="tbtn" onClick={exportCsv} title="Export CSV" disabled={!run}>
          CSV
        </button>
        <button className="tbtn" onClick={exportSvg} title="Export SVG" disabled={!run}>
          SVG
        </button>
        <button className="tbtn" onClick={exportPng} title="Export PNG" disabled={!run}>
          PNG
        </button>
      </div>

      {mathOpen && (
        <div className="rule-b flex items-center gap-2 px-3 py-2" style={{ background: "var(--panel-2)" }}>
          <span className="sc">Math</span>
          <input
            className="inp"
            style={{ flex: 1 }}
            value={mathExpr}
            onChange={(e) => setMathExpr(e.target.value)}
            placeholder="V(OUT) / V(IN) · I(R1) * V(OUT) · pi * 2"
          />
          <button className="btn primary" onClick={addMath}>
            Add trace
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 scroll p-2">
          {!run ? (
            <div className="h-full flex flex-col items-center justify-center gap-2" style={{ color: "var(--ink-3)" }}>
              <Icon name="chart" size={30} />
              <div style={{ fontSize: 12 }}>No results yet — run a simulation to plot real data.</div>
            </div>
          ) : (
            <svg
              ref={svgRef}
              viewBox={`0 0 ${W} ${H}`}
              width="100%"
              style={{ background: "var(--paper)", border: "1px solid var(--rule)", borderRadius: 4 }}
              onPointerDown={(e) => {
                const rect = (e.target as SVGElement).ownerSVGElement?.getBoundingClientRect();
                if (!rect) return;
                const px = ((e.clientX - rect.left) / rect.width) * W;
                const idx = cursorAt(px);
                if (e.shiftKey) setCursor2(idx);
                else setCursor1(idx);
              }}
            >
              {/* grid + axes */}
              {niceTicks(view.x0, view.x1).map((t, i) => (
                <g key={`x${i}`}>
                  <line x1={sx(t)} y1={M.t} x2={sx(t)} y2={H - M.b} stroke="var(--grid)" strokeWidth={0.8} />
                  <text x={sx(t)} y={H - M.b + 15} fontSize={10} textAnchor="middle" fill="var(--ink-3)" fontFamily="var(--font-mono)">
                    {fmt(t, "", 3)}
                  </text>
                </g>
              ))}
              {niceTicks(view.y0, view.y1).map((t, i) => (
                <g key={`y${i}`}>
                  <line x1={M.l} y1={sy(t)} x2={W - M.r} y2={sy(t)} stroke="var(--grid)" strokeWidth={0.8} />
                  <text x={M.l - 8} y={sy(t) + 3} fontSize={10} textAnchor="end" fill="var(--ink-3)" fontFamily="var(--font-mono)">
                    {fmt(t, "", 3)}
                  </text>
                </g>
              ))}
              <line x1={M.l} y1={M.t} x2={M.l} y2={H - M.b} stroke="var(--ink-2)" strokeWidth={1} />
              <line x1={M.l} y1={H - M.b} x2={W - M.r} y2={H - M.b} stroke="var(--ink-2)" strokeWidth={1} />
              <text x={W - M.r} y={H - 6} fontSize={10} textAnchor="end" fill="var(--ink-2)">
                {run.result.xLabel} [{run.result.xUnit}]
              </text>

              {visible.map((t) => (
                <path
                  key={t.name}
                  d={t.values
                    .map((v, i) => {
                      if (!Number.isFinite(v)) return "";
                      return `${i === 0 ? "M" : "L"} ${sx(x[i] ?? i).toFixed(2)} ${sy(v).toFixed(2)}`;
                    })
                    .join(" ")}
                  fill="none"
                  stroke={PALETTE[(t.colorIndex ?? 0) % PALETTE.length]}
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                  opacity={active && active.name === t.name ? 1 : 0.86}
                />
              ))}

              {c1 !== null && (
                <line x1={sx(x[c1] ?? 0)} y1={M.t} x2={sx(x[c1] ?? 0)} y2={H - M.b} stroke="var(--blue)" strokeWidth={1} strokeDasharray="4 3" />
              )}
              {c2 !== null && (
                <line x1={sx(x[c2] ?? 0)} y1={M.t} x2={sx(x[c2] ?? 0)} y2={H - M.b} stroke="var(--amber)" strokeWidth={1} strokeDasharray="4 3" />
              )}
            </svg>
          )}
        </div>

        {/* legend / measurement rail */}
        <div className="rule-l flex flex-col" style={{ width: 268, background: "var(--panel-2)" }}>
          <div className="panel-head" style={{ background: "transparent" }}>
            <span className="sc">Traces</span>
            <span className="ml-auto mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>
              {visible.length}/{allTraces.length}
            </span>
          </div>
          <div className="scroll flex-1 min-h-0">
            {allTraces.map((t) => {
              const on = !hidden[t.name];
              return (
                <div
                  key={t.name}
                  className={`row ${selectedTrace === t.name ? "sel" : ""}`}
                  onClick={() => setSelectedTrace(t.name)}
                >
                  <button
                    className="tbtn"
                    style={{ width: 18, minWidth: 18, height: 18 }}
                    title={on ? "Hide trace" : "Show trace"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setHidden((h) => ({ ...h, [t.name]: !h[t.name] }));
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 3,
                        background: PALETTE[(t.colorIndex ?? 0) % PALETTE.length],
                        opacity: on ? 1 : 0.25,
                        display: "inline-block",
                      }}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="mono truncate" style={{ fontSize: 10.5 }}>
                      {t.label}
                    </div>
                    <div className="truncate" style={{ fontSize: 9.5, color: "var(--ink-3)" }}>
                      {t.kind} · {t.unit || "—"}
                    </div>
                  </div>
                </div>
              );
            })}
            {allTraces.length === 0 && <div className="hint px-3 py-2">No traces.</div>}
          </div>

          <div className="panel-head" style={{ background: "transparent", borderTop: "1px solid var(--rule)" }}>
            <span className="sc">Measurements {active ? `— ${active.name}` : ""}</span>
          </div>
          <div className="scroll" style={{ maxHeight: 176 }}>
            <table className="tbl">
              <tbody>
                {stats.map((m) => (
                  <tr key={m.key}>
                    <td style={{ color: "var(--ink-2)" }}>{m.label}</td>
                    <td className="num">{m.text}</td>
                  </tr>
                ))}
                {c1 !== null && active && (
                  <tr>
                    <td style={{ color: "var(--ink-2)" }}>Cursor 1</td>
                    <td className="num">
                      {fmt(x[c1] ?? 0, run?.result.xUnit ?? "", 3)} · {fmt(active.values[c1] ?? NaN)}
                    </td>
                  </tr>
                )}
                {c2 !== null && active && (
                  <tr>
                    <td style={{ color: "var(--ink-2)" }}>Cursor 2</td>
                    <td className="num">
                      {fmt(x[c2] ?? 0, run?.result.xUnit ?? "", 3)} · {fmt(active.values[c2] ?? NaN)}
                    </td>
                  </tr>
                )}
                {c1 !== null && c2 !== null && active && (
                  <tr>
                    <td style={{ color: "var(--ink)" }}>Δ</td>
                    <td className="num">
                      {fmt((x[c1] ?? 0) - (x[c2] ?? 0), run?.result.xUnit ?? "", 3)} ·{" "}
                      {fmt((active.values[c1] ?? 0) - (active.values[c2] ?? 0))}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="hint px-3 py-2 rule-t">
            Click the plot to place cursor 1, shift-click for cursor 2.
          </div>
        </div>
      </div>
    </div>
  );
}

function download(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

let fftXStore: number[] = [];
function setFftX(x: number[]) {
  fftXStore = x;
}
export function getFftX() {
  return fftXStore;
}
