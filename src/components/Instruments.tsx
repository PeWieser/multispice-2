"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, BarChart3, Binary, Gauge, LineChart, Minus, Radio, SquareActivity, Timer, Waves, X, Zap,
} from "lucide-react";
import { formatValue } from "@/lib/library/catalog";
import { spectrum } from "@/lib/sim/fft";
import { estimateFrequency, mean, peakToPeak, rms } from "@/lib/sim/realtime";
import { InstrumentKind, InstrumentWindow, engine, useEditor } from "@/state/editor";

const CH_COLORS = ["var(--ch1)", "var(--ch2)", "var(--ch3)", "var(--ch4)"];
const SCOPE_COLORS = ["#4ade80", "#38bdf8", "#fbbf24", "#f472b6"];

const cssVar = (n: string, f: string) => {
  if (typeof window === "undefined") return f;
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim() || f;
};

/* ------------------------------------------------------------------ */
/* generic animated plot surface                                       */
/* ------------------------------------------------------------------ */
function Plot({ render, className }: { render: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const c = ref.current;
      const wrap = wrapRef.current;
      if (c && wrap) {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = wrap.clientWidth;
        const h = wrap.clientHeight;
        if (c.width !== w * dpr || c.height !== h * dpr) {
          c.width = w * dpr;
          c.height = h * dpr;
          c.style.width = w + "px";
          c.style.height = h + "px";
        }
        const ctx = c.getContext("2d");
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, w, h);
          render(ctx, w, h);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [render]);
  return (
    <div ref={wrapRef} className={className ?? "relative h-full w-full"}>
      <canvas ref={ref} className="block h-full w-full" />
    </div>
  );
}

function grid(ctx: CanvasRenderingContext2D, w: number, h: number, cols = 10, rows = 8) {
  ctx.save();
  ctx.fillStyle = cssVar("--canvas", "#0d1017");
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = cssVar("--grid", "rgba(255,255,255,.06)");
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < cols; i++) {
    ctx.moveTo((w * i) / cols, 0);
    ctx.lineTo((w * i) / cols, h);
  }
  for (let i = 1; i < rows; i++) {
    ctx.moveTo(0, (h * i) / rows);
    ctx.lineTo(w, (h * i) / rows);
  }
  ctx.stroke();
  ctx.strokeStyle = cssVar("--grid-strong", "rgba(255,255,255,.12)");
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w, h / 2);
  ctx.moveTo(w / 2, 0);
  ctx.lineTo(w / 2, h);
  ctx.stroke();
  ctx.restore();
}

function NetSelect({ value, onChange, allowNone }: { value: string; onChange: (v: string) => void; allowNone?: boolean }) {
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  return (
    <select className="input py-0.5 text-[11px]" value={value} onChange={(e) => onChange(e.target.value)}>
      {allowNone && <option value="">—</option>}
      {nets.map((n) => (
        <option key={n} value={n}>
          {n}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* oscilloscope – SKEUOMORPHIC CRT + METAL + KNOBS                     */
/* ------------------------------------------------------------------ */
interface ScopeConfig {
  channels: string[];
  timebase: number;
  volts: number[];
  offsets: number[];
  trigger: { source: number; level: number; edge: "rising" | "falling"; mode: "auto" | "normal" };
  mode: "yt" | "xy" | "fft" | "math";
  math: "a+b" | "a-b" | "a*b";
  cursors?: { enabled: boolean; mode: "time" | "voltage" | "both"; ax: number; bx: number; ay: number; by: number };
  intensity?: number;
  focus?: number;
  runMode?: "run" | "stop" | "single";
}

const TIMEBASES = [5e-9,1e-8,2e-8,5e-8,1e-7,2e-7,5e-7,1e-6,2e-6,5e-6,1e-5,2e-5,5e-5,1e-4,2e-4,5e-4,1e-3,2e-3,5e-3,1e-2,2e-2,5e-2,1e-1,2e-1,5e-1,1,2];
const VOLTS = [0.001,0.002,0.005,0.01,0.02,0.05,0.1,0.2,0.5,1,2,5,10,20,50];

function nearestIdx(arr: number[], v: number) {
  let best=0, bd=Infinity;
  arr.forEach((x,i)=>{ const d=Math.abs(Math.log10(x)-Math.log10(Math.max(v,1e-12))); if(d<bd){bd=d;best=i;}});
  return best;
}

function SkeuKnob({ value, options, onChange, label, unit, size=56, continuous, min, max, log }: { value: number; options?: number[]; onChange: (v:number)=>void; label: string; unit?: string; size?: number; continuous?: boolean; min?: number; max?: number; log?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(value);
  const idx = options ? nearestIdx(options, value) : 0;
  const angle = options ? -135 + (idx/(options.length-1))*270 : (()=>{ const mn=min??0, mx=max??1; const norm = log ? (Math.log10(Math.max(value,mn||1e-9))-Math.log10(Math.max(mn,1e-9)))/(Math.log10(mx)-Math.log10(Math.max(mn,1e-9))) : (value-mn)/(mx-mn||1); return -135 + Math.max(0,Math.min(1,norm))*270; })();
  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current=true; startY.current=e.clientY; startVal.current=value;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if(!dragging.current) return;
    const dy = startY.current - e.clientY;
    if(options){
      const steps = Math.round(dy/12);
      let ni = Math.max(0, Math.min(options.length-1, nearestIdx(options, startVal.current)+steps));
      if(ni!==idx) onChange(options[ni]);
    } else if(continuous){
      const mn=min??-10, mx=max??10;
      let nv: number;
      if(log){
        const logMn=Math.log10(Math.max(mn,1e-12)), logMx=Math.log10(mx), logStart=Math.log10(Math.max(startVal.current,1e-12));
        const delta = dy*0.02;
        nv = Math.pow(10, Math.max(logMn, Math.min(logMx, logStart+delta)));
      } else {
        const range=mx-mn; nv = Math.max(mn, Math.min(mx, startVal.current + dy*range*0.005));
      }
      onChange(nv);
    }
  };
  const onPointerUp = () => { dragging.current=false; };
  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        ref={ref}
        className="relative rounded-full cursor-ns-resize"
        style={{ width:size, height:size, background:`radial-gradient(120% 120% at 30% 20%, #4a4e5a 0%, #2a2d36 18%, #1a1d24 45%, #0f1116 100%)`, boxShadow:`inset 0 1px 1px rgba(255,255,255,0.25), inset 0 -2px 6px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,0,0,0.8)`, border:"1px solid #000" }}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
        title={`${label}: ${formatValue(value, unit??"")} – Ziehen zum Drehen`}
      >
        {/* tick marks */}
        <svg width={size} height={size} className="absolute inset-0 pointer-events-none">
          {Array.from({length: options ? Math.min(options.length, 11) : 9}).map((_,i)=>{
            const total=options? Math.min(options.length,11):9;
            const a=-135 + (i/(total-1))*270;
            const r1=size*0.42, r2=size*0.48;
            const cx=size/2, cy=size/2;
            const x1=cx+Math.cos(a*Math.PI/180)*r1, y1=cy+Math.sin(a*Math.PI/180)*r1;
            const x2=cx+Math.cos(a*Math.PI/180)*r2, y2=cy+Math.sin(a*Math.PI/180)*r2;
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i===Math.floor(total/2)?"#fbbf24":"rgba(255,255,255,0.3)"} strokeWidth={i===Math.floor(total/2)?1.5:0.8} />;
          })}
        </svg>
        {/* knob face */}
        <div className="absolute rounded-full" style={{ inset:5, background:`conic-gradient(from ${angle}deg at 50% 50%, #2a2e39 0deg, #3a3f4f 60deg, #1e212a 120deg, #2f3442 200deg, #1a1d26 300deg, #2a2e39 360deg)`, boxShadow:"inset 0 1px 2px rgba(255,255,255,0.2)" }} />
        {/* center cap */}
        <div className="absolute rounded-full" style={{ left:"50%", top:"50%", width:size*0.32, height:size*0.32, transform:"translate(-50%,-50%)", background:"radial-gradient(100% 100% at 35% 30%, #5a5e6a, #2a2d36)", border:"1px solid rgba(0,0,0,0.6)", boxShadow:"inset 0 1px 1px rgba(255,255,255,0.2)" }} />
        {/* pointer */}
        <div className="absolute" style={{ left:"50%", top:"50%", width:2, height:size*0.38, background:"linear-gradient(to top, #fbbf24, #f59e0b)", transformOrigin:"bottom center", transform:`translate(-50%,-100%) rotate(${angle}deg)`, boxShadow:"0 0 4px #fbbf24", borderRadius:1 }} />
        <div className="absolute rounded-full" style={{ left:"50%", top:"50%", width:6, height:6, background:"#fbbf24", transform:"translate(-50%,-50%)", boxShadow:"0 0 6px #fbbf24" }} />
      </div>
      <div className="text-center leading-none">
        <div className="text-[8px] uppercase tracking-wider text-mute font-semibold">{label}</div>
        <div className="mono text-[9px] text-dim mt-0.5 tabular-nums">{formatValue(value, unit??"")}</div>
      </div>
    </div>
  );
}

function TactileButton({ active, onClick, children, color, title }: { active?: boolean; onClick: ()=>void; children: React.ReactNode; color?: string; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="relative rounded-[4px] px-2 py-1 text-[10px] font-semibold tracking-wide transition-all select-none"
      style={{
        background: active ? `linear-gradient(to bottom, ${color||"#3a3f4f"}, #1e212a)` : "linear-gradient(to bottom, #3a3f4f, #232630)",
        border:`1px solid ${active ? (color||"#fbbf24") : "#0a0a0a"}`,
        boxShadow: active ? `inset 0 1px 2px rgba(0,0,0,0.8), inset 0 0 0 1px ${color||"#fbbf24"}40, 0 0 8px ${color||"#fbbf24"}30` : "inset 0 1px 0 rgba(255,255,255,0.15), inset 0 -1px 0 rgba(0,0,0,0.8), 0 1px 2px rgba(0,0,0,0.6)",
        color: active ? (color||"#fbbf24") : "var(--text-dim)",
        minHeight:24,
      }}
    >
      <span className="relative z-10">{children}</span>
      {active && <span className="absolute inset-0 rounded-[3px] pointer-events-none" style={{ background:`radial-gradient(100% 100% at 50% 0%, ${color||"#fbbf24"}18, transparent 70%)` }} />}
    </button>
  );
}

function CrtScreen({ render, cursors, setCursors, trigger, timebase, volts, onTriggerDrag }: { render: (ctx: CanvasRenderingContext2D, w:number,h:number)=>void; cursors: NonNullable<ScopeConfig["cursors"]>; setCursors: (c:any)=>void; trigger: ScopeConfig["trigger"]; timebase:number; volts:number[]; onTriggerDrag:(y:number)=>void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<null | {kind:"ax"|"bx"|"ay"|"by"|"trig"}>(null);

  const draw = useCallback((ctx: CanvasRenderingContext2D, w:number, h:number)=>{
    // CRT background radial
    const grad = ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,Math.max(w,h)*0.9);
    grad.addColorStop(0, "#0e1a14");
    grad.addColorStop(0.4, "#0a1510");
    grad.addColorStop(0.8, "#070e0c");
    grad.addColorStop(1, "#04080a");
    ctx.fillStyle=grad;
    ctx.fillRect(0,0,w,h);
    // vignette
    const vig = ctx.createRadialGradient(w/2,h/2,w*0.3,w/2,h/2,w);
    vig.addColorStop(0,"transparent");
    vig.addColorStop(0.7,"rgba(0,0,0,0.15)");
    vig.addColorStop(1,"rgba(0,0,0,0.65)");
    ctx.fillStyle=vig;
    ctx.fillRect(0,0,w,h);
    // grid phosphor
    ctx.save();
    ctx.strokeStyle="rgba(60,255,100,0.09)";
    ctx.lineWidth=0.6;
    for(let i=1;i<10;i++){ ctx.beginPath(); ctx.moveTo(w*i/10,0); ctx.lineTo(w*i/10,h); ctx.stroke(); }
    for(let i=1;i<8;i++){ ctx.beginPath(); ctx.moveTo(0,h*i/8); ctx.lineTo(w,h*i/8); ctx.stroke(); }
    ctx.strokeStyle="rgba(80,255,130,0.18)";
    ctx.lineWidth=0.9;
    ctx.beginPath(); ctx.moveTo(0,h/2); ctx.lineTo(w,h/2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w/2,0); ctx.lineTo(w/2,h); ctx.stroke();
    // minor dots
    ctx.fillStyle="rgba(70,255,110,0.12)";
    for(let x=0;x<=10;x++) for(let y=0;y<=8;y++){ ctx.beginPath(); ctx.arc(w*x/10, h*y/8, 0.8,0,Math.PI*2); ctx.fill(); }
    ctx.restore();
    // user render with glow
    ctx.save();
    ctx.shadowBlur=14;
    ctx.shadowColor="rgba(74,222,128,0.35)";
    render(ctx,w,h);
    ctx.restore();
    // second pass faint persistence
    ctx.save();
    ctx.globalAlpha=0.55;
    ctx.shadowBlur=6;
    render(ctx,w,h);
    ctx.restore();
    // scanlines
    ctx.save();
    ctx.globalAlpha=0.07;
    ctx.fillStyle="repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.5) 2px, rgba(0,0,0,0.5) 3px)";
    // canvas pattern via lines
    for(let y=0;y<h;y+=3){ ctx.fillRect(0,y,w,1); }
    ctx.restore();
    // trigger marker
    if(trigger){
      const ty = h/2 - (trigger.level / volts[trigger.source]) * (h/8);
      ctx.save();
      ctx.strokeStyle="#fbbf24";
      ctx.setLineDash([6,4]);
      ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(0,ty); ctx.lineTo(w,ty); ctx.stroke();
      ctx.setLineDash([]);
      // triangle handle on right edge
      ctx.fillStyle="#fbbf24";
      ctx.shadowBlur=8; ctx.shadowColor="#fbbf24";
      ctx.beginPath(); ctx.moveTo(w-2, ty-7); ctx.lineTo(w-2, ty+7); ctx.lineTo(w-12, ty); ctx.closePath(); ctx.fill();
      ctx.fillStyle="#000"; ctx.font="8px monospace"; ctx.fillText("T", w-10, ty+2.5);
      ctx.restore();
    }
    // cursors
    if(cursors.enabled){
      ctx.save();
      ctx.strokeStyle="rgba(167,139,250,0.9)";
      ctx.setLineDash([4,3]);
      ctx.lineWidth=1;
      if(cursors.mode!=="voltage"){
        const ax=cursors.ax*w, bx=cursors.bx*w;
        ctx.beginPath(); ctx.moveTo(ax,0); ctx.lineTo(ax,h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx,0); ctx.lineTo(bx,h); ctx.stroke();
        // handles
        ctx.fillStyle="#a78bfa"; ctx.fillRect(ax-1,0,2,12); ctx.fillRect(bx-1,0,2,12);
      }
      if(cursors.mode!=="time"){
        const ay=cursors.ay*h, by=cursors.by*h;
        ctx.beginPath(); ctx.moveTo(0,ay); ctx.lineTo(w,ay); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0,by); ctx.lineTo(w,by); ctx.stroke();
        ctx.fillStyle="#a78bfa"; ctx.fillRect(0,ay-1,12,2); ctx.fillRect(0,by-1,12,2);
      }
      ctx.restore();
    }
    // bottom info
    ctx.fillStyle="rgba(180,255,180,0.7)";
    ctx.font="10px ui-monospace, monospace";
    ctx.fillText(`${formatValue(timebase,"s")}/DIV`, 8, h-8);
    ctx.fillText(`10 DIV`, w/2-20, h-8);
  }, [render, cursors, trigger, timebase, volts]);

  const plotRender = useCallback((ctx: CanvasRenderingContext2D, w:number,h:number)=>{ draw(ctx,w,h); }, [draw]);

  useEffect(()=>{
    const wrap=wrapRef.current; if(!wrap) return;
    const onMove=(e:PointerEvent)=>{
      if(!dragRef.current) return;
      const rect=wrap.getBoundingClientRect();
      const x=(e.clientX-rect.left)/rect.width;
      const y=(e.clientY-rect.top)/rect.height;
      if(dragRef.current.kind==="ax") setCursors({...cursors, ax:Math.max(0,Math.min(1,x))});
      if(dragRef.current.kind==="bx") setCursors({...cursors, bx:Math.max(0,Math.min(1,x))});
      if(dragRef.current.kind==="ay") setCursors({...cursors, ay:Math.max(0,Math.min(1,y))});
      if(dragRef.current.kind==="by") setCursors({...cursors, by:Math.max(0,Math.min(1,y))});
      if(dragRef.current.kind==="trig") onTriggerDrag(y);
    };
    const onUp=()=>{ dragRef.current=null; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return ()=>{ window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [cursors, setCursors, onTriggerDrag]);

  const onDown=(e: React.PointerEvent, kind:"ax"|"bx"|"ay"|"by"|"trig")=>{
    dragRef.current={kind}; (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full overflow-hidden rounded-[10px]" style={{ background:"#04080a", boxShadow:"inset 0 0 0 1px #000, inset 0 0 40px rgba(0,0,0,0.9), inset 0 0 120px rgba(10,40,20,0.2)" }}>
      <Plot render={plotRender} className="h-full w-full" />
      {/* invisible drag handles */}
      {cursors.enabled && (
        <>
          {cursors.mode!=="voltage" && (
            <>
              <div className="absolute top-0 bottom-0 w-4 -ml-2 cursor-ew-resize z-10" style={{ left:`${cursors.ax*100}%` }} onPointerDown={(e)=>onDown(e,"ax")} title="Cursor A – ziehen für ΔT" />
              <div className="absolute top-0 bottom-0 w-4 -ml-2 cursor-ew-resize z-10" style={{ left:`${cursors.bx*100}%` }} onPointerDown={(e)=>onDown(e,"bx")} title="Cursor B – ziehen für ΔT" />
            </>
          )}
          {cursors.mode!=="time" && (
            <>
              <div className="absolute left-0 right-0 h-4 -mt-2 cursor-ns-resize z-10" style={{ top:`${cursors.ay*100}%` }} onPointerDown={(e)=>onDown(e,"ay")} />
              <div className="absolute left-0 right-0 h-4 -mt-2 cursor-ns-resize z-10" style={{ top:`${cursors.by*100}%` }} onPointerDown={(e)=>onDown(e,"by")} />
            </>
          )}
        </>
      )}
      {/* trigger drag */}
      <div className="absolute right-0 top-0 bottom-0 w-6 cursor-ns-resize z-10" onPointerDown={(e)=>onDown(e,"trig")} title="Trigger Level ziehen" />
      {/* CRT curvature overlay */}
      <div className="pointer-events-none absolute inset-0 rounded-[10px]" style={{ background:"radial-gradient(120% 100% at 50% 50%, transparent 60%, rgba(0,0,0,0.35) 100%)", boxShadow:"inset 0 0 80px rgba(0,0,0,0.8)" }} />
    </div>
  );
}

function Oscilloscope({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const cfg = (win.config.scope as ScopeConfig) ?? {
    channels: [nets.find((n) => n !== "0") ?? "", "", "", ""],
    timebase: 0.002,
    volts: [2,2,2,2],
    offsets: [0,0,0,0],
    trigger: { source:0, level:0.5, edge:"rising", mode:"auto" },
    mode:"yt",
    math:"a-b",
    cursors: { enabled:false, mode:"time", ax:0.25, bx:0.75, ay:0.25, by:0.75 },
    intensity:0.8,
    focus:0.5,
    runMode:"run",
  };
  const cursors = cfg.cursors ?? { enabled:false, mode:"time" as const, ax:0.25, bx:0.75, ay:0.25, by:0.75 };
  const set = (patch: Partial<ScopeConfig>) => update(win.id, { config: { ...win.config, scope: { ...cfg, ...patch } } });

  const render = useCallback((ctx: CanvasRenderingContext2D, w:number,h:number)=>{
    const span = cfg.timebase*10;
    const samples = Math.max(64, Math.round(span*40000));
    const chans = cfg.channels.map((net)=> net ? engine.channel(net, samples) : { t:[], v:[] });

    if(cfg.mode==="fft"){
      const ch=chans[0];
      if(ch.v.length>32){
        const dt=(ch.t[ch.t.length-1]-ch.t[0])/Math.max(ch.t.length-1,1);
        const sp=spectrum(ch.v, 1/Math.max(dt,1e-12), "hann");
        const maxF=Math.min(sp.freq[sp.freq.length-1]??1, 1/(cfg.timebase*2)*50);
        ctx.strokeStyle=SCOPE_COLORS[0];
        ctx.lineWidth=1.8;
        ctx.shadowBlur=10; ctx.shadowColor=SCOPE_COLORS[0];
        ctx.beginPath();
        sp.freq.forEach((f,i)=>{
          if(f>maxF) return;
          const x=(f/maxF)*w;
          const y=h - ((sp.magDb[i]+120)/120)*h;
          if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        });
        ctx.stroke();
        ctx.shadowBlur=0;
      }
      return;
    }
    if(cfg.mode==="xy"){
      const a=chans[0], b=chans[1];
      const n=Math.min(a.v.length,b.v.length);
      ctx.strokeStyle=SCOPE_COLORS[2];
      ctx.lineWidth=1.6; ctx.shadowBlur=12; ctx.shadowColor=SCOPE_COLORS[2];
      ctx.beginPath();
      for(let i=0;i<n;i++){
        const x=w/2 + (a.v[i]/cfg.volts[0])*(w/10);
        const y=h/2 - (b.v[i]/cfg.volts[1])*(h/8);
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
      return;
    }

    let startIdx=0;
    const trig=chans[cfg.trigger.source];
    if(trig && trig.v.length>4 && cfg.trigger.mode!=="auto"){
      for(let i=trig.v.length-2;i>1;i--){
        const rising=trig.v[i-1]<cfg.trigger.level && trig.v[i]>=cfg.trigger.level;
        const falling=trig.v[i-1]>cfg.trigger.level && trig.v[i]<=cfg.trigger.level;
        if((cfg.trigger.edge==="rising"&&rising)||(cfg.trigger.edge==="falling"&&falling)){ startIdx=Math.max(0,i-Math.floor(trig.v.length/2)); break; }
      }
    }

    chans.forEach((ch,idx)=>{
      if(!ch.v.length || !cfg.channels[idx]) return;
      ctx.strokeStyle=SCOPE_COLORS[idx];
      ctx.lineWidth=2; ctx.shadowBlur=10; ctx.shadowColor=SCOPE_COLORS[idx];
      ctx.beginPath();
      const t0=ch.t[startIdx]??ch.t[0]??0;
      for(let i=startIdx;i<ch.v.length;i++){
        const x=((ch.t[i]-t0)/span)*w;
        if(x>w) break;
        const y=h/2 - ((ch.v[i]+cfg.offsets[idx])/cfg.volts[idx])*(h/8);
        if(i===startIdx) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    });

    if(cfg.mode==="math" && chans[0].v.length && chans[1].v.length){
      ctx.strokeStyle="#a78bfa";
      ctx.lineWidth=1.6; ctx.shadowBlur=12; ctx.shadowColor="#a78bfa";
      ctx.setLineDash([6,4]);
      ctx.beginPath();
      const n=Math.min(chans[0].v.length, chans[1].v.length);
      const t0=chans[0].t[0]??0;
      for(let i=0;i<n;i++){
        const val=cfg.math==="a+b"?chans[0].v[i]+chans[1].v[i]:cfg.math==="a-b"?chans[0].v[i]-chans[1].v[i]:chans[0].v[i]*chans[1].v[i];
        const x=((chans[0].t[i]-t0)/span)*w;
        const y=h/2 - (val/cfg.volts[0])*(h/8);
        if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke(); ctx.setLineDash([]);
    }
  }, [cfg]);

  const measure = (idx:number)=>{
    const net=cfg.channels[idx];
    if(!net) return null;
    const ch=engine.channel(net, Math.max(64, Math.round(cfg.timebase*10*40000)));
    if(!ch.v.length) return null;
    return { vpp:peakToPeak(ch.v), vrms:rms(ch.v), vavg:mean(ch.v), f:estimateFrequency(ch.t,ch.v), vmax:Math.max(...ch.v), vmin:Math.min(...ch.v) };
  };

  const deltaT = (cursors.bx - cursors.ax) * cfg.timebase * 10;
  const deltaV = (cursors.by - cursors.ay) * 8 * (cfg.volts[0]||1) * -1;

  const handleTriggerDrag = (yNorm:number)=>{
    const hVolts = cfg.volts[cfg.trigger.source]||1;
    const level = (0.5 - yNorm)*8*hVolts;
    set({ trigger:{ ...cfg.trigger, level }});
  };

  return (
    <div className="flex h-full flex-col select-none" style={{ background:"linear-gradient(180deg, #2e323e 0%, #232630 8%, #1a1d26 100%)" }}>
      {/* top metal bar with branding */}
      <div className="flex h-9 shrink-0 items-center gap-2 px-3" style={{ background:"linear-gradient(to bottom, #3b3f4d, #252830)", borderBottom:"1px solid #000", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.15)" }}>
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-sm grid place-items-center" style={{ background:"radial-gradient(at 30% 30%, #5a5e6a, #1a1d24)", border:"1px solid #000" }}><span className="text-[10px] font-bold text-[#fbbf24]">◉</span></div>
          <span className="text-[11px] font-bold tracking-widest text-[#cbd5e1]">MSO-4000</span>
          <span className="text-[8px] px-1 py-0.5 rounded bg-black/40 text-mute">4CH • 200MHz • 1GSa/s</span>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          {(["yt","xy","fft","math"] as const).map(m=>(
            <TactileButton key={m} active={cfg.mode===m} onClick={()=>set({mode:m})} color="#4ade80" title={`${m.toUpperCase()} Modus – YT Zeit/Spannung, XY Lissajous, FFT Spektrum, MATH A±B`}>{m.toUpperCase()}</TactileButton>
          ))}
        </div>
        <div className="mx-2 h-4 w-px bg-black/60" />
        <div className="flex items-center gap-1">
          <TactileButton active={cfg.runMode==="run"} onClick={()=>set({runMode:"run"})} color="#22c55e" title="Run – kontinuierlich">RUN</TactileButton>
          <TactileButton active={cfg.runMode==="stop"} onClick={()=>set({runMode:"stop"})} color="#ef4444" title="Stop – hält Bild an">STOP</TactileButton>
          <TactileButton active={cursors.enabled} onClick={()=>set({cursors:{...cursors, enabled:!cursors.enabled}})} color="#a78bfa" title="Cursors – Mess-Cursor ein/aus, ziehen auf CRT">CURS</TactileButton>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* left channel strips – vertical metal */}
        <div className="flex w-[168px] shrink-0 flex-col gap-2 p-2 overflow-y-auto" style={{ background:"linear-gradient(90deg, #252830, #1e212a)", borderRight:"1px solid #000", boxShadow:"inset -1px 0 0 rgba(255,255,255,0.06)" }}>
          {[0,1,2,3].map(i=>{
            const m=measure(i);
            const enabled=!!cfg.channels[i];
            const col=SCOPE_COLORS[i];
            return (
              <div key={i} className="rounded-md p-2" style={{ background: enabled ? `linear-gradient(180deg, ${col}14, rgba(0,0,0,0.3))` : "linear-gradient(180deg, #2a2e39, #1a1d24)", border:`1px solid ${enabled? col+"60" : "#000"}`, boxShadow: enabled ? `0 0 10px ${col}30, inset 0 1px 0 rgba(255,255,255,0.08)` : "inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <div className="h-2.5 w-2.5 rounded-full" style={{ background: enabled?col:"#444", boxShadow: enabled?`0 0 6px ${col}`:"none", border:"1px solid #000" }} />
                    <span className="mono text-[10px] font-bold" style={{ color: enabled?col:"#888" }}>CH{i+1}</span>
                  </div>
                  <TactileButton active={enabled} onClick={()=>{ const ch=[...cfg.channels]; if(enabled) ch[i]=""; else ch[i]=nets.find(n=>n!=="0")??""; set({channels:ch}); }} color={col} title={`CH${i+1} ein/aus`}>{enabled?"ON":"OFF"}</TactileButton>
                </div>
                <div className="mb-1">
                  <NetSelect value={cfg.channels[i]} allowNone onChange={(v)=>{ const ch=[...cfg.channels]; ch[i]=v; set({channels:ch}); }} />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="flex flex-col items-center">
                    <SkeuKnob size={42} label="V/DIV" value={cfg.volts[i]} options={VOLTS} unit="V" onChange={(v)=>{ const vv=[...cfg.volts]; vv[i]=v; set({volts:vv}); }} />
                  </div>
                  <div className="flex flex-col items-center">
                    <SkeuKnob size={36} label="POS" value={cfg.offsets[i]} continuous min={-10} max={10} onChange={(v)=>{ const oo=[...cfg.offsets]; oo[i]=v; set({offsets:oo}); }} />
                  </div>
                </div>
                {m && enabled && (
                  <div className="mt-1.5 rounded bg-black/50 p-1 mono text-[8.5px] leading-tight border border-white/5" style={{ color:col }}>
                    <div className="flex justify-between"><span>Vpp</span><span className="tabular-nums">{formatValue(m.vpp,"V")}</span></div>
                    <div className="flex justify-between"><span>Vrms</span><span>{formatValue(m.vrms,"V")}</span></div>
                    <div className="flex justify-between"><span>Freq</span><span>{formatValue(m.f,"Hz")}</span></div>
                  </div>
                )}
              </div>
            );
          })}
          {/* math */}
          {cfg.mode==="math" && (
            <div className="rounded-md p-2" style={{ background:"linear-gradient(180deg, #2a2e39, #1a1d24)", border:"1px solid #a78bfa60" }}>
              <div className="text-[9px] uppercase text-mute mb-1">MATH</div>
              <div className="flex gap-1">
                {(["a+b","a-b","a*b"] as const).map(op=>(
                  <TactileButton key={op} active={cfg.math===op} onClick={()=>set({math:op})} color="#a78bfa">{op.toUpperCase()}</TactileButton>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* center CRT */}
        <div className="flex min-w-0 flex-1 flex-col p-2 gap-2" style={{ background:"linear-gradient(180deg, #1a1d26, #12141c)" }}>
          <div className="relative flex-1 rounded-[14px] p-2" style={{ background:"linear-gradient(180deg, #0a0a0a, #000)", border:"1px solid #000", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 12px rgba(0,0,0,0.8)" }}>
            {/* bezel screws */}
            <div className="absolute left-2 top-2 h-2 w-2 rounded-full" style={{ background:"radial-gradient(at 30% 30%, #6a6e7a, #2a2d36)", border:"1px solid #000" }} />
            <div className="absolute right-2 top-2 h-2 w-2 rounded-full" style={{ background:"radial-gradient(at 30% 30%, #6a6e7a, #2a2d36)", border:"1px solid #000" }} />
            <div className="absolute left-2 bottom-2 h-2 w-2 rounded-full" style={{ background:"radial-gradient(at 30% 30%, #6a6e7a, #2a2d36)", border:"1px solid #000" }} />
            <div className="absolute right-2 bottom-2 h-2 w-2 rounded-full" style={{ background:"radial-gradient(at 30% 30%, #6a6e7a, #2a2d36)", border:"1px solid #000" }} />
            <div className="h-full w-full p-1">
              <CrtScreen render={render} cursors={cursors} setCursors={(c:any)=>set({cursors:c})} trigger={cfg.trigger} timebase={cfg.timebase} volts={cfg.volts} onTriggerDrag={handleTriggerDrag} />
            </div>
            {/* CRT label */}
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-2 text-[8px] mono text-mute/60">
              <span>10 x 8 DIV</span>
              <span>•</span>
              <span>{formatValue(cfg.timebase,"s")}/DIV</span>
              <span>•</span>
              <span>INTEN {Math.round((cfg.intensity??0.8)*100)}%</span>
            </div>
          </div>

          {/* measurements bar below CRT – phosphor style */}
          <div className="flex gap-1.5 overflow-x-auto">
            {[0,1,2,3].map(i=>{
              const m=measure(i);
              if(!m) return null;
              return (
                <div key={i} className="shrink-0 rounded px-2 py-1 mono text-[9px] flex items-center gap-2" style={{ background:"rgba(0,0,0,0.6)", border:`1px solid ${SCOPE_COLORS[i]}40`, color:SCOPE_COLORS[i] }}>
                  <span className="font-bold">CH{i+1}</span>
                  <span>Vpp {formatValue(m.vpp,"V")}</span>
                  <span>Vmax {formatValue(m.vmax,"V")}</span>
                  <span>Vmin {formatValue(m.vmin,"V")}</span>
                  <span>f {formatValue(m.f,"Hz")}</span>
                </div>
              );
            })}
            {cursors.enabled && (
              <div className="shrink-0 rounded px-2 py-1 mono text-[9px] flex items-center gap-3" style={{ background:"rgba(0,0,0,0.6)", border:"1px solid #a78bfa60", color:"#a78bfa" }}>
                <span>CURS</span>
                {cursors.mode!=="voltage" && <span>ΔT {formatValue(Math.abs(deltaT),"s")}  1/ΔT {formatValue(deltaT?1/Math.abs(deltaT):0,"Hz")}</span>}
                {cursors.mode!=="time" && <span>ΔV {formatValue(Math.abs(deltaV),"V")}</span>}
                <div className="flex gap-1 ml-2">
                  {(["time","voltage","both"] as const).map(md=>(
                    <button key={md} className="px-1 py-0.5 rounded text-[8px] border" style={{ background: cursors.mode===md ? "#a78bfa30" : "transparent", borderColor: cursors.mode===md ? "#a78bfa" : "#333", color: cursors.mode===md ? "#a78bfa" : "#666" }} onClick={()=>set({cursors:{...cursors, mode:md}})}>{md.toUpperCase()}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* right controls – horizontal + trigger */}
        <div className="flex w-[156px] shrink-0 flex-col gap-3 p-2 overflow-y-auto" style={{ background:"linear-gradient(90deg, #1e212a, #252830)", borderLeft:"1px solid #000" }}>
          <div className="rounded-md p-2" style={{ background:"linear-gradient(180deg, #2a2e39, #1a1d24)", border:"1px solid #000", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.06)" }}>
            <div className="text-[9px] uppercase tracking-wider text-mute font-bold mb-2">HORIZONTAL</div>
            <div className="flex justify-center">
              <SkeuKnob label="TIMEBASE" value={cfg.timebase} options={TIMEBASES} unit="s" size={56} onChange={(v)=>set({timebase:v})} />
            </div>
            <div className="mt-2 flex justify-center">
              <SkeuKnob label="H-POS" value={0} continuous min={-5} max={5} size={36} onChange={()=>{}} />
            </div>
          </div>

          <div className="rounded-md p-2" style={{ background:"linear-gradient(180deg, #2a2e39, #1a1d24)", border:"1px solid #000" }}>
            <div className="text-[9px] uppercase tracking-wider text-mute font-bold mb-2">TRIGGER</div>
            <div className="flex flex-wrap gap-1 mb-2">
              {[0,1,2,3].map(i=>(
                <TactileButton key={i} active={cfg.trigger.source===i} onClick={()=>set({trigger:{...cfg.trigger, source:i}})} color={SCOPE_COLORS[i]} title={`Trigger Quelle CH${i+1}`}>CH{i+1}</TactileButton>
              ))}
            </div>
            <div className="flex gap-1 mb-2">
              <TactileButton active={cfg.trigger.edge==="rising"} onClick={()=>set({trigger:{...cfg.trigger, edge:"rising"}})} color="#fbbf24" title="Steigende Flanke">↗︎ RISE</TactileButton>
              <TactileButton active={cfg.trigger.edge==="falling"} onClick={()=>set({trigger:{...cfg.trigger, edge:"falling"}})} color="#fbbf24" title="Fallende Flanke">↘︎ FALL</TactileButton>
            </div>
            <div className="flex gap-1 mb-3">
              <TactileButton active={cfg.trigger.mode==="auto"} onClick={()=>set({trigger:{...cfg.trigger, mode:"auto"}})} color="#22c55e" title="Auto – triggert automatisch">AUTO</TactileButton>
              <TactileButton active={cfg.trigger.mode==="normal"} onClick={()=>set({trigger:{...cfg.trigger, mode:"normal"}})} color="#eab308" title="Normal – wartet auf Trigger">NORM</TactileButton>
            </div>
            <div className="flex justify-center">
              <SkeuKnob label="LEVEL" value={cfg.trigger.level} continuous min={-10} max={10} size={52} onChange={(v)=>set({trigger:{...cfg.trigger, level:v}})} />
            </div>
            <div className="mt-2 text-center mono text-[9px] text-mute">{cfg.trigger.level.toFixed(2)} V • {cfg.trigger.edge==="rising"?"↑":"↓"} {cfg.trigger.mode.toUpperCase()}</div>
          </div>

          <div className="rounded-md p-2" style={{ background:"linear-gradient(180deg, #2a2e39, #1a1d24)", border:"1px solid #000" }}>
            <div className="text-[9px] uppercase tracking-wider text-mute font-bold mb-2">DISPLAY</div>
            <div className="flex gap-2 justify-center">
              <SkeuKnob label="INTEN" value={cfg.intensity??0.8} continuous min={0.1} max={1.5} size={38} onChange={(v)=>set({intensity:v})} />
              <SkeuKnob label="FOCUS" value={cfg.focus??0.5} continuous min={0} max={1} size={38} onChange={(v)=>set({focus:v})} />
            </div>
          </div>

          <div className="text-[8px] mono text-mute/60 leading-tight p-1">
            <div>Tipp: Ziehe Trigger-Dreieck am rechten Rand.</div>
            <div className="mt-1">Cursors: A/B ziehen für ΔT/ΔV.</div>
            <div className="mt-1">Knöpfe: Vertikal ziehen zum Drehen.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* digital multimeter                                                  */
/* ------------------------------------------------------------------ */
function Multimeter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const running = useEditor((s) => s.sim.running);
  const tick = useEditor((s) => s.sim.tick);
  const cfg = (win.config.dmm as { a: string; b: string; mode: string; range: string }) ?? {
    a: nets.find((n) => n !== "0") ?? "",
    b: "0",
    mode: "vdc",
    range: "auto",
  };
  const set = (p: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, dmm: { ...cfg, ...p } } });

  let value = 0;
  let unit = "V";
  const ca = engine.channel(cfg.a, 4000);
  const cb = engine.channel(cfg.b, 4000);
  const diff = ca.v.map((v, i) => v - (cb.v[i] ?? 0));
  if (cfg.mode === "vdc") value = mean(diff);
  else if (cfg.mode === "vac") {
    const m = mean(diff);
    value = rms(diff.map((v) => v - m));
  } else if (cfg.mode === "adc" || cfg.mode === "aac") {
    const currents = engine.lastState.currents;
    const first = Object.keys(currents)[0];
    value = currents[first] ?? 0;
    unit = "A";
  } else if (cfg.mode === "ohm") {
    const v = mean(diff);
    const currents = Object.values(engine.lastState.currents);
    const i = currents.length ? currents[0] : 1e-9;
    value = Math.abs(v / (i || 1e-12));
    unit = "Ω";
  } else if (cfg.mode === "db") {
    const m = mean(diff);
    value = 20 * Math.log10(Math.max(rms(diff.map((v) => v - m)) / 0.7746, 1e-12));
    unit = "dBu";
  } else if (cfg.mode === "hz") {
    value = estimateFrequency(ca.t, ca.v);
    unit = "Hz";
  }
  void tick;

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="rounded-xl p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
        <div className="mono text-right text-[34px] font-semibold leading-none tabular-nums" style={{ color: running ? "var(--ok)" : "var(--text-mute)" }}>
          {running ? formatValue(value, "") : "– – –"}
        </div>
        <div className="mono mt-1 text-right text-[12px] text-mute">{unit}</div>
      </div>
      <div className="grid grid-cols-3 gap-1">
        {[
          ["vdc", "V⎓"],
          ["vac", "V~"],
          ["adc", "A⎓"],
          ["aac", "A~"],
          ["ohm", "Ω"],
          ["db", "dB"],
          ["hz", "Hz"],
        ].map(([m, label]) => (
          <button key={m} className="tab text-center" data-active={cfg.mode === m} onClick={() => set({ mode: m })}>
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10.5px] text-mute">
          Messpunkt +
          <NetSelect value={cfg.a} onChange={(v) => set({ a: v })} />
        </label>
        <label className="text-[10.5px] text-mute">
          Messpunkt −
          <NetSelect value={cfg.b} onChange={(v) => set({ b: v })} />
        </label>
      </div>
      <div className="flex gap-1">
        {["auto", "200m", "2", "20", "200"].map((r) => (
          <button key={r} className="tab flex-1 text-center" data-active={cfg.range === r} onClick={() => set({ range: r })}>
            {r}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* function generator (controls the XFG / AC source instances)         */
/* ------------------------------------------------------------------ */
function FunctionGenerator() {
  const doc = useEditor((s) => s.doc);
  const setParam = useEditor((s) => s.setParam);
  const sources = doc.instances.filter((i) => i.partId === "funcgen" || i.partId === "vac" || i.partId === "vpulse");
  const [sel, setSel] = useState(sources[0]?.id ?? "");
  const inst = sources.find((s) => s.id === sel) ?? sources[0];
  if (!inst) {
    return <div className="p-4 text-[12px] text-mute">Keine Signalquelle im Schaltplan. Platziere »Funktionsgenerator (XFG)« oder »AC-Quelle«.</div>;
  }
  const p = inst.params;
  const num = (k: string, d: number) => Number(p[k] ?? d);
  return (
    <div className="flex h-full flex-col gap-2 overflow-y-auto p-2.5">
      <select className="input" value={inst.id} onChange={(e) => setSel(e.target.value)}>
        {sources.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label} — {s.partId}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-4 gap-1">
        {[
          ["sine", "∿"],
          ["square", "⎍"],
          ["triangle", "△"],
          ["sawtooth", "◺"],
          ["pulse", "⊓"],
          ["am", "AM"],
          ["fm", "FM"],
          ["noise", "≋"],
        ].map(([v, label]) => (
          <button key={v} className="tab text-center text-[13px]" data-active={String(p.wave ?? "sine") === v} onClick={() => setParam(inst.id, "wave", v)}>
            {label}
          </button>
        ))}
      </div>
      <Knob label="Frequenz" unit="Hz" value={num("freq", 1000)} min={0.1} max={1e7} log onChange={(v) => setParam(inst.id, "freq", v)} />
      <Knob label="Amplitude" unit="V" value={num("amplitude", 5)} min={0} max={30} onChange={(v) => setParam(inst.id, "amplitude", v)} />
      <Knob label="DC-Offset" unit="V" value={num("offset", 0)} min={-15} max={15} onChange={(v) => setParam(inst.id, "offset", v)} />
      <Knob label="Tastgrad" unit="%" value={num("duty", 50)} min={1} max={99} onChange={(v) => setParam(inst.id, "duty", v)} />
      <Knob label="Phase" unit="°" value={num("phase", 0)} min={-180} max={180} onChange={(v) => setParam(inst.id, "phase", v)} />
      {(p.wave === "am" || p.wave === "fm") && (
        <>
          <Knob label="Mod.-Index" unit="" value={num("modIndex", 0.5)} min={0} max={10} onChange={(v) => setParam(inst.id, "modIndex", v)} />
          <Knob label="Mod.-Frequenz" unit="Hz" value={num("modFreq", 100)} min={0.1} max={1e5} log onChange={(v) => setParam(inst.id, "modFreq", v)} />
        </>
      )}
    </div>
  );
}

function Knob({ label, unit, value, min, max, log, onChange }: { label: string; unit: string; value: number; min: number; max: number; log?: boolean; onChange: (v: number) => void }) {
  const toSlider = (v: number) => (log ? Math.log10(Math.max(v, min || 1e-6)) : v);
  const fromSlider = (v: number) => (log ? Math.pow(10, v) : v);
  return (
    <label className="block">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="text-dim">{label}</span>
        <span className="mono text-mute">{formatValue(value, unit)}</span>
      </div>
      <input
        type="range"
        className="mt-1 w-full"
        min={toSlider(min || 0.1)}
        max={toSlider(max)}
        step={log ? 0.01 : (max - min) / 400}
        value={toSlider(value)}
        onChange={(e) => onChange(fromSlider(Number(e.target.value)))}
      />
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* bode plotter                                                        */
/* ------------------------------------------------------------------ */
function BodePlotter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const runAnalysis = useEditor((s) => s.runAnalysis);
  const analysis = useEditor((s) => s.analysis);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const cfg = (win.config.bode as { out: string; fmin: number; fmax: number }) ?? { out: nets.find((n) => n !== "0") ?? "", fmin: 1, fmax: 1e6 };
  const set = (p: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, bode: { ...cfg, ...p } } });
  const data = analysis.kind === "ac" ? (analysis.data as { freq: number[]; magDb: Record<string, number[]>; phase: Record<string, number[]> } | undefined) : undefined;

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      grid(ctx, w, h, 12, 8);
      if (!data || !data.freq.length) {
        ctx.fillStyle = cssVar("--text-mute", "#64708c");
        ctx.font = "11px ui-sans-serif";
        ctx.fillText("AC-Sweep starten …", 12, 20);
        return;
      }
      const mags = data.magDb[cfg.out] ?? [];
      const phases = data.phase[cfg.out] ?? [];
      const f0 = Math.log10(data.freq[0]);
      const f1 = Math.log10(data.freq[data.freq.length - 1]);
      const maxDb = Math.max(...mags, 6);
      const minDb = Math.min(...mags, -60);
      const xOf = (f: number) => ((Math.log10(f) - f0) / (f1 - f0)) * w;
      ctx.strokeStyle = cssVar("--ch1", "#38bdf8");
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      mags.forEach((m, i) => {
        const x = xOf(data.freq[i]);
        const y = h - ((m - minDb) / (maxDb - minDb)) * h;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.strokeStyle = cssVar("--ch2", "#f472b6");
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      phases.forEach((p, i) => {
        const x = xOf(data.freq[i]);
        const y = h / 2 - (p / 180) * (h / 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = cssVar("--text-mute", "#64708c");
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`${maxDb.toFixed(0)} dB`, 4, 11);
      ctx.fillText(`${minDb.toFixed(0)} dB`, 4, h - 4);
      ctx.fillText(formatValue(data.freq[0], "Hz"), 4, h - 16);
      ctx.fillText(formatValue(data.freq[data.freq.length - 1], "Hz"), w - 56, h - 16);
    },
    [data, cfg.out],
  );

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-mute">
        <span>Ausgang</span>
        <NetSelect value={cfg.out} onChange={(v) => set({ out: v })} />
        <span>f</span>
        <input className="input w-20 py-0.5 text-[11px] mono" value={cfg.fmin} onChange={(e) => set({ fmin: Number(e.target.value) })} />
        <span>…</span>
        <input className="input w-24 py-0.5 text-[11px] mono" value={cfg.fmax} onChange={(e) => set({ fmax: Number(e.target.value) })} />
        <button
          className="btn btn-primary ml-auto"
          onClick={() => runAnalysis("ac", { outputs: [cfg.out], sweep: { start: cfg.fmin, stop: cfg.fmax, points: 24, type: "dec" } })}
          disabled={analysis.running}
        >
          {analysis.running ? "läuft …" : "Sweep starten"}
        </button>
      </div>
      <div className="flex-1 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <Plot render={render} />
      </div>
      <div className="flex gap-3 text-[10.5px] text-mute">
        <span style={{ color: "var(--ch1)" }}>— Amplitude (dB)</span>
        <span style={{ color: "var(--ch2)" }}>-- Phase (°)</span>
        {data && <span className="ml-auto mono">{data.freq.length} Punkte</span>}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* logic analyzer                                                      */
/* ------------------------------------------------------------------ */
function LogicAnalyzer({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name).filter((n) => n !== "0"), [netResult.nets]);
  const cfg = (win.config.logic as { channels: string[]; span: number; threshold: number; radix: "hex" | "bin" }) ?? {
    channels: nets.slice(0, 8),
    span: 0.05,
    threshold: 2.5,
    radix: "hex",
  };
  const set = (p: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, logic: { ...cfg, ...p } } });

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      ctx.fillStyle = cssVar("--canvas", "#0d1017");
      ctx.fillRect(0, 0, w, h);
      const rows = Math.max(cfg.channels.length, 1);
      const rowH = h / rows;
      const samples = Math.max(64, Math.round(cfg.span * 40000));
      cfg.channels.forEach((net, i) => {
        const ch = engine.channel(net, samples);
        const y0 = i * rowH + rowH * 0.78;
        const y1 = i * rowH + rowH * 0.22;
        ctx.strokeStyle = cssVar("--grid", "rgba(255,255,255,.06)");
        ctx.beginPath();
        ctx.moveTo(0, i * rowH);
        ctx.lineTo(w, i * rowH);
        ctx.stroke();
        if (!ch.v.length) return;
        const t0 = ch.t[0];
        const span = Math.max(ch.t[ch.t.length - 1] - t0, 1e-9);
        ctx.strokeStyle = CH_COLORS[i % 4];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let prevHigh = ch.v[0] > cfg.threshold;
        ctx.moveTo(0, prevHigh ? y1 : y0);
        for (let k = 1; k < ch.v.length; k++) {
          const x = ((ch.t[k] - t0) / span) * w;
          const high = ch.v[k] > cfg.threshold;
          if (high !== prevHigh) {
            ctx.lineTo(x, prevHigh ? y1 : y0);
            ctx.lineTo(x, high ? y1 : y0);
            prevHigh = high;
          } else ctx.lineTo(x, high ? y1 : y0);
        }
        ctx.stroke();
        ctx.fillStyle = cssVar("--text-mute", "#64708c");
        ctx.font = "9.5px ui-monospace, monospace";
        ctx.fillText(net, 4, i * rowH + 11);
      });
      // bus value
      let word = 0;
      cfg.channels.forEach((net, i) => {
        const v = engine.lastState.nets[net] ?? 0;
        if (v > cfg.threshold) word |= 1 << i;
      });
      ctx.fillStyle = cssVar("--accent-2", "#22d3ee");
      ctx.font = "600 12px ui-monospace, monospace";
      const text = cfg.radix === "hex" ? `0x${word.toString(16).toUpperCase().padStart(2, "0")}` : `0b${word.toString(2).padStart(cfg.channels.length, "0")}`;
      ctx.fillText(text, w - 90, 14);
    },
    [cfg],
  );

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center gap-1.5 text-[10.5px] text-mute">
        <span>Kanäle</span>
        <select
          className="input w-auto py-0.5 text-[11px]"
          multiple={false}
          value=""
          onChange={(e) => {
            if (e.target.value) set({ channels: [...cfg.channels, e.target.value].slice(0, 16) });
          }}
        >
          <option value="">+ hinzufügen</option>
          {nets.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => set({ channels: [] })}>
          leeren
        </button>
        <span className="ml-2">Schwelle</span>
        <input className="input w-16 py-0.5 text-[11px] mono" value={cfg.threshold} onChange={(e) => set({ threshold: Number(e.target.value) })} />
        <select className="input w-auto py-0.5 text-[11px]" value={cfg.radix} onChange={(e) => set({ radix: e.target.value as "hex" | "bin" })}>
          <option value="hex">HEX</option>
          <option value="bin">BIN</option>
        </select>
      </div>
      <div className="flex-1 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <Plot render={render} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* wattmeter                                                           */
/* ------------------------------------------------------------------ */
function Wattmeter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const doc = useEditor((s) => s.doc);
  const tick = useEditor((s) => s.sim.tick);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const cfg = (win.config.watt as { vnet: string; gnd: string; device: string }) ?? {
    vnet: nets.find((n) => n !== "0") ?? "",
    gnd: "0",
    device: doc.instances[0]?.label ?? "",
  };
  const set = (p: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, watt: { ...cfg, ...p } } });
  void tick;

  const vch = engine.channel(cfg.vnet, 4000);
  const gch = engine.channel(cfg.gnd, 4000);
  const v = vch.v.map((x, i) => x - (gch.v[i] ?? 0));
  const i = engine.lastState.currents[cfg.device] ?? 0;
  const vrms = rms(v);
  const irms = Math.abs(i);
  const p = mean(v.map((x) => x * i));
  const s = vrms * irms;
  const pf = s > 0 ? p / s : 0;
  const q = Math.sqrt(Math.max(s * s - p * p, 0));

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="grid grid-cols-2 gap-1.5">
        <label className="text-[10.5px] text-mute">
          Spannung an
          <NetSelect value={cfg.vnet} onChange={(x) => set({ vnet: x })} />
        </label>
        <label className="text-[10.5px] text-mute">
          Bezug
          <NetSelect value={cfg.gnd} onChange={(x) => set({ gnd: x })} />
        </label>
      </div>
      <label className="text-[10.5px] text-mute">
        Strom durch Bauteil
        <select className="input py-0.5 text-[11px]" value={cfg.device} onChange={(e) => set({ device: e.target.value })}>
          {doc.instances.map((x) => (
            <option key={x.id} value={x.label}>
              {x.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Wirkleistung P" value={formatValue(p, "W")} color="var(--ok)" />
        <Stat label="Scheinleistung S" value={formatValue(s, "VA")} color="var(--accent-2)" />
        <Stat label="Blindleistung Q" value={formatValue(q, "var")} color="var(--accent-3)" />
        <Stat label="Leistungsfaktor" value={pf.toFixed(3)} color="var(--warn)" />
        <Stat label="U rms" value={formatValue(vrms, "V")} />
        <Stat label="I rms" value={formatValue(irms, "A")} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg p-2" style={{ background: "var(--panel-2)" }}>
      <div className="text-[9.5px] text-mute">{label}</div>
      <div className="mono text-[15px] font-semibold" style={{ color: color ?? "var(--text)" }}>
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* IV analyzer                                                         */
/* ------------------------------------------------------------------ */
function IvAnalyzer() {
  const doc = useEditor((s) => s.doc);
  const runAnalysis = useEditor((s) => s.runAnalysis);
  const analysis = useEditor((s) => s.analysis);
  const [device, setDevice] = useState(doc.instances.find((i) => ["D", "Q", "M", "J"].includes(i.label[0]))?.label ?? "");
  const [source, setSource] = useState(doc.instances.find((i) => i.partId.startsWith("v"))?.label ?? "");
  const data = analysis.kind === "iv" ? (analysis.data as { curves: Array<{ label: string; x: number[]; y: number[] }> } | undefined) : undefined;

  const render = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      grid(ctx, w, h, 10, 8);
      if (!data?.curves?.length) {
        ctx.fillStyle = cssVar("--text-mute", "#64708c");
        ctx.font = "11px ui-sans-serif";
        ctx.fillText("Kennlinie aufnehmen …", 12, 20);
        return;
      }
      const allY = data.curves.flatMap((c) => c.y);
      const allX = data.curves.flatMap((c) => c.x);
      const maxY = Math.max(...allY.map(Math.abs), 1e-9);
      const minX = Math.min(...allX);
      const maxX = Math.max(...allX);
      data.curves.forEach((c, i) => {
        ctx.strokeStyle = CH_COLORS[i % 4];
        ctx.lineWidth = 1.7;
        ctx.beginPath();
        c.x.forEach((x, k) => {
          const px = ((x - minX) / Math.max(maxX - minX, 1e-9)) * w;
          const py = h - (Math.abs(c.y[k]) / maxY) * h * 0.92;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.stroke();
      });
      ctx.fillStyle = cssVar("--text-mute", "#64708c");
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`${formatValue(maxY, "A")}`, 4, 11);
      ctx.fillText(`${formatValue(minX, "V")}`, 4, h - 4);
      ctx.fillText(`${formatValue(maxX, "V")}`, w - 50, h - 4);
    },
    [data],
  );

  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex flex-wrap items-center gap-1.5 text-[10.5px] text-mute">
        <span>Bauteil</span>
        <select className="input w-auto py-0.5 text-[11px]" value={device} onChange={(e) => setDevice(e.target.value)}>
          {doc.instances.map((i) => (
            <option key={i.id} value={i.label}>
              {i.label}
            </option>
          ))}
        </select>
        <span>Sweep-Quelle</span>
        <select className="input w-auto py-0.5 text-[11px]" value={source} onChange={(e) => setSource(e.target.value)}>
          {doc.instances.map((i) => (
            <option key={i.id} value={i.label}>
              {i.label}
            </option>
          ))}
        </select>
        <button
          className="btn btn-primary ml-auto"
          disabled={analysis.running}
          onClick={() =>
            runAnalysis("iv", {
              sourceId: source,
              measureDeviceId: device,
              sweep: { start: 0, stop: 5, points: 80, type: "lin" },
            })
          }
        >
          {analysis.running ? "misst …" : "Kennlinie"}
        </button>
      </div>
      <div className="flex-1 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <Plot render={render} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* spectrum analyzer                                                   */
/* ------------------------------------------------------------------ */
function SpectrumAnalyzer({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const cfg = (win.config.spec as { net: string }) ?? { net: nets.find((n) => n !== "0") ?? "" };
  const render = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      grid(ctx, w, h, 10, 6);
      const ch = engine.channel(cfg.net, 8192);
      if (ch.v.length < 64) return;
      const dt = (ch.t[ch.t.length - 1] - ch.t[0]) / Math.max(ch.t.length - 1, 1);
      const sp = spectrum(ch.v, 1 / Math.max(dt, 1e-12), "blackman");
      const n = sp.freq.length;
      const barW = w / n;
      for (let i = 0; i < n; i++) {
        const db = Math.max(sp.magDb[i], -120);
        const bh = ((db + 120) / 120) * h;
        ctx.fillStyle = `hsl(${200 - (db + 120) * 0.9}, 85%, 58%)`;
        ctx.fillRect(i * barW, h - bh, Math.max(barW - 0.4, 0.6), bh);
      }
      ctx.fillStyle = cssVar("--text-mute", "#64708c");
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillText(`0 … ${formatValue(sp.freq[n - 1] ?? 0, "Hz")}`, 6, h - 5);
    },
    [cfg.net],
  );
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center gap-2 text-[10.5px] text-mute">
        <span>Signal</span>
        <NetSelect value={cfg.net} onChange={(v) => update(win.id, { config: { ...win.config, spec: { net: v } } })} />
      </div>
      <div className="flex-1 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <Plot render={render} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* pattern generator                                                   */
/* ------------------------------------------------------------------ */
function PatternGenerator() {
  const doc = useEditor((s) => s.doc);
  const setParam = useEditor((s) => s.setParam);
  const clocks = doc.instances.filter((i) => i.partId === "clockgen" || i.partId === "vpulse");
  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="text-[11px] text-mute">
        Treibt digitale Taktquellen und Pulsgeneratoren. Platziere »Taktgenerator (digital)« oder »Pulsquelle« im Schaltplan.
      </div>
      {clocks.map((c) => (
        <div key={c.id} className="rounded-lg p-2" style={{ background: "var(--panel-2)" }}>
          <div className="mb-1 flex justify-between text-[11px]">
            <span className="mono" style={{ color: "var(--accent-2)" }}>
              {c.label}
            </span>
            <span className="mono text-mute">{formatValue(Number(c.params.freq ?? 1000), "Hz")}</span>
          </div>
          <input
            type="range"
            className="w-full"
            min={-1}
            max={6}
            step={0.02}
            value={Math.log10(Number(c.params.freq ?? 1000))}
            onChange={(e) => setParam(c.id, "freq", Math.pow(10, Number(e.target.value)))}
          />
          {c.partId === "vpulse" && (
            <input
              type="range"
              className="mt-1 w-full"
              min={1}
              max={99}
              value={Number(c.params.duty ?? 50)}
              onChange={(e) => setParam(c.id, "duty", Number(e.target.value))}
            />
          )}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* frequency counter                                                   */
/* ------------------------------------------------------------------ */
function FrequencyCounter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = useMemo(() => netResult.nets.map((n) => n.name), [netResult.nets]);
  const running = useEditor((s) => s.sim.running);
  const tick = useEditor((s) => s.sim.tick);
  void tick;
  const cfg = (win.config.counter as { net: string }) ?? { net: nets.find((n) => n !== "0") ?? "" };

  const ch = engine.channel(cfg.net, 8192);
  const f = ch.v.length > 32 ? estimateFrequency(ch.t, ch.v) : 0;
  const avg = ch.v.length ? mean(ch.v) : 0;
  const duty = ch.v.length ? (ch.v.filter((v) => v > avg).length / ch.v.length) * 100 : 0;

  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="rounded-xl p-3" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
        <div className="mono text-right text-[30px] font-semibold leading-none tabular-nums" style={{ color: running && f > 0 ? "var(--text)" : "var(--text-mute)" }}>
          {running && f > 0 ? formatValue(f, "") : "– – –"}
        </div>
        <div className="mono mt-1 text-right text-[12px] text-mute">Hz</div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Periode" value={f > 0 ? formatValue(1 / f, "s") : "—"} />
        <Stat label="Tastgrad" value={f > 0 ? `${duty.toFixed(1)} %` : "—"} />
      </div>
      <label className="text-[10.5px] text-mute">
        Messknoten
        <NetSelect value={cfg.net} onChange={(v) => update(win.id, { config: { ...win.config, counter: { net: v } } })} />
      </label>
      {!running && <div className="text-[11px] text-mute">Zählt, sobald die Simulation läuft.</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* logic converter – Multisim iconic                                    */
/* ------------------------------------------------------------------ */
function LogicConverter({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const cfg = (win.config.logicconv as { inputs: number; table: number[]; expr: string }) ?? { inputs: 3, table: Array(8).fill(0).map((_,i)=> (i%2)), expr: "" };
  const set = (patch: Partial<typeof cfg>) => update(win.id, { config: { ...win.config, logicconv: { ...cfg, ...patch } } });

  const inputs = cfg.inputs;
  const rows = 1 << inputs;
  const table = cfg.table.length === rows ? cfg.table : Array(rows).fill(0);

  // Generate Boolean expression via Quine-McCluskey (simplified)
  const generateExpr = () => {
    // Collect minterms
    const minterms: number[] = [];
    for (let r=0; r<rows; r++) if (table[r]) minterms.push(r);
    if (!minterms.length) { set({ expr: "0" }); return; }
    if (minterms.length === rows) { set({ expr: "1" }); return; }

    // Quine-McCluskey – group by ones count
    type Imp = { bits: string; minterms: number[]; used: boolean };
    let groups: Map<number, Imp[]> = new Map();
    for (const m of minterms) {
      const bits = m.toString(2).padStart(inputs, "0");
      const ones = bits.split("").filter(b=>b==="1").length;
      const arr = groups.get(ones) ?? [];
      arr.push({ bits, minterms: [m], used: false });
      groups.set(ones, arr);
    }

    const primeImplicants: Imp[] = [];
    let hasCombined = true;
    while (hasCombined) {
      hasCombined = false;
      const nextGroups = new Map<number, Imp[]>();
      const keys = Array.from(groups.keys()).sort((a,b)=>a-b);
      for (let k=0; k<keys.length-1; k++) {
        const g1 = groups.get(keys[k]) ?? [];
        const g2 = groups.get(keys[k+1]) ?? [];
        for (const a of g1) {
          for (const b of g2) {
            let diff = 0;
            let diffPos = -1;
            for (let i=0; i<inputs; i++) {
              if (a.bits[i] !== b.bits[i]) { diff++; diffPos = i; }
            }
            if (diff === 1) {
              hasCombined = true;
              a.used = true;
              b.used = true;
              const newBits = a.bits.substring(0,diffPos) + "-" + a.bits.substring(diffPos+1);
              const newMinterms = Array.from(new Set([...a.minterms, ...b.minterms])).sort((x,y)=>x-y);
              const ones = newBits.split("").filter(ch=>ch==="1").length;
              const arr = nextGroups.get(ones) ?? [];
              if (!arr.some(x=>x.bits===newBits)) arr.push({ bits: newBits, minterms: newMinterms, used: false });
              nextGroups.set(ones, arr);
            }
          }
        }
      }
      // Collect unused as prime
      for (const [, imps] of groups) {
        for (const imp of imps) if (!imp.used) primeImplicants.push(imp);
      }
      groups = nextGroups;
    }
    for (const [, imps] of groups) for (const imp of imps) primeImplicants.push(imp);

    // Essential prime selection – simple greedy covering
    const covered = new Set<number>();
    const selected: Imp[] = [];
    // First essential
    for (const m of minterms) {
      const covering = primeImplicants.filter(pi=> pi.minterms.includes(m));
      if (covering.length === 1 && !selected.includes(covering[0])) {
        selected.push(covering[0]);
        covering[0].minterms.forEach(x=> covered.add(x));
      }
    }
    // Greedy for rest
    let remaining = minterms.filter(m=> !covered.has(m));
    while (remaining.length) {
      let best: Imp | null = null;
      let bestCover = 0;
      for (const pi of primeImplicants) {
        if (selected.includes(pi)) continue;
        const cover = pi.minterms.filter(m=> remaining.includes(m)).length;
        if (cover > bestCover) { bestCover = cover; best = pi; }
      }
      if (!best) break;
      selected.push(best);
      best.minterms.forEach(x=> covered.add(x));
      remaining = minterms.filter(m=> !covered.has(m));
    }

    // Convert to expression
    const terms = selected.map(imp=>{
      const lits: string[] = [];
      for (let i=0; i<inputs; i++) {
        const ch = imp.bits[i];
        if (ch === "-") continue;
        const varName = String.fromCharCode(65+i);
        lits.push(ch==="1" ? varName : `~${varName}`);
      }
      if (!lits.length) return "1";
      return lits.length===1 ? lits[0] : `(${lits.join(" & ")})`;
    });
    const expr = terms.length ? terms.join(" | ") : "0";
    set({ expr });
  };

  // Generate circuit – for demo, create text description
  const generateCircuit = () => {
    const doc = useEditor.getState().doc;
    // Simple: place AND/OR gates for SOP – for MVP just log
    useEditor.getState().log("ok", `Logic Converter: ${inputs} Eingänge, ${table.filter(v=>v).length} Minterme → ${cfg.expr || "kein Ausdruck"} – Schaltung würde ${table.filter(v=>v).length} ANDs + 1 OR generieren`);
  };

  return (
    <div className="flex h-full flex-col gap-2 p-2.5 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="text-mute">Eingänge</span>
        <select className="input w-20 py-0.5" value={inputs} onChange={e=> set({ inputs: Number(e.target.value), table: Array(1<<Number(e.target.value)).fill(0) })}>
          {[2,3,4,5,6,7,8].map(n=> <option key={n} value={n}>{n}</option>)}
        </select>
        <button className="btn btn-primary ml-auto" onClick={generateExpr}>→ Boolean</button>
        <button className="btn" onClick={generateCircuit}>→ Schaltung</button>
      </div>
      <div className="grid gap-1 overflow-auto rounded-lg p-2" style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
        <div className="grid text-[10px] font-medium text-mute" style={{ gridTemplateColumns: `repeat(${inputs}, 24px) 32px` }}>
          {Array.from({length: inputs}).map((_,i)=> <span key={i} className="text-center">{String.fromCharCode(65+i)}</span>)}
          <span className="text-center">F</span>
        </div>
        {Array.from({length: rows}).map((_,r)=>{
          const bits = r.toString(2).padStart(inputs,"0");
          return (
            <div key={r} className="grid items-center" style={{ gridTemplateColumns: `repeat(${inputs}, 24px) 32px` }}>
              {bits.split("").map((b,i)=> <span key={i} className="text-center mono">{b}</span>)}
              <button className="h-6 rounded text-[11px] font-bold" style={{ background: table[r] ? "var(--ok)" : "var(--panel)", color: table[r] ? "#fff" : "var(--text-mute)", border: "1px solid var(--border)" }} onClick={()=>{
                const nt = [...table];
                nt[r] = nt[r] ? 0 : 1;
                set({ table: nt });
              }}>{table[r]}</button>
            </div>
          );
        })}
      </div>
      <div>
        <div className="text-[10px] text-mute mb-1">Boolescher Ausdruck (SOP)</div>
        <div className="rounded-lg p-2 mono text-[11px]" style={{ background: "var(--panel)", border: "1px solid var(--border)" }}>{cfg.expr || "– klicke → Boolean –"}</div>
      </div>
      <div className="text-[10px] text-mute">Multisim-like: Truth Table ↔ Boolean ↔ Circuit. Für MVP: SOP via Quine-McCluskey light, Schaltung als AND/OR/NOT. Vollversion würde Gates platzieren.</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* distortion analyzer                                                  */
/* ------------------------------------------------------------------ */
function DistortionAnalyzer({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = netResult.nets.map(n=>n.name);
  const cfg = (win.config.distortion as { net: string; fund: number }) ?? { net: nets.find(n=>n!=="0") ?? "", fund: 1000 };
  const ch = engine.channel(cfg.net, 8192);
  const f = cfg.fund;
  // Simple THD calc: estimate via FFT
  let thd = 0;
  let sinad = 0;
  if (ch.v.length > 128) {
    const sp = spectrum(ch.v, 1 / (ch.t[1]-ch.t[0] || 1e-6), "blackman");
    // Find fundamental bin
    const fundIdx = sp.freq.findIndex(freq=> Math.abs(freq - f) < f*0.1);
    if (fundIdx >=0) {
      const fundMag = sp.mag[fundIdx] || 1e-12;
      let harmPower = 0;
      for (let h=2; h<=5; h++) {
        const idx = sp.freq.findIndex(freq=> Math.abs(freq - f*h) < f*0.2);
        if (idx>=0) harmPower += (sp.mag[idx]||0)**2;
      }
      thd = Math.sqrt(harmPower) / fundMag * 100;
      sinad = 20*Math.log10(fundMag / Math.sqrt(harmPower + 1e-12));
    }
  }
  return (
    <div className="flex h-full flex-col gap-2 p-2.5">
      <div className="flex items-center gap-2 text-[10.5px] text-mute">
        <span>Signal</span>
        <NetSelect value={cfg.net} onChange={v=> update(win.id, { config: { ...win.config, distortion: { ...cfg, net: v } } })} />
        <span>Grund</span>
        <input className="input w-20 py-0.5 mono" value={cfg.fund} onChange={e=> update(win.id, { config: { ...win.config, distortion: { ...cfg, fund: Number(e.target.value) } } })} />
        <span>Hz</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="THD" value={`${thd.toFixed(2)} %`} color="var(--warn)" />
        <Stat label="SINAD" value={`${sinad.toFixed(1)} dB`} color="var(--ok)" />
      </div>
      <div className="text-[10px] text-mute">Multisim Distortion Analyzer – misst THD und SINAD via FFT. Für Lehre: Klirr bei Verstärkern.</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* network analyzer – RF S-Parameter (basic)                           */
/* ------------------------------------------------------------------ */
function NetworkAnalyzer({ win }: { win: InstrumentWindow }) {
  const update = useEditor((s) => s.updateInstrument);
  const netResult = useEditor((s) => s.netResult);
  const nets = netResult.nets.map(n=>n.name);
  const cfg = (win.config.network as { inNet: string; outNet: string }) ?? { inNet: nets.find(n=>n!=="0") ?? "", outNet: nets[1] ?? "" };
  const render = (ctx: CanvasRenderingContext2D, w:number, h:number) => {
    grid(ctx,w,h,10,6);
    // Simple: show gain vs freq from AC analysis if available, else dummy
    const analysis = useEditor.getState().analysis;
    if (analysis.kind === "ac" && (analysis.data as any)?.curves) {
      const curves = (analysis.data as any).curves as Array<{ x:number[]; y:number[] }>;
      const curve = curves[0];
      if (curve) {
        ctx.strokeStyle = "#a78bfa";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        curve.x.forEach((fx,i)=>{
          const px = (Math.log10(fx) - Math.log10(curve.x[0])) / Math.log10(curve.x[curve.x.length-1]/curve.x[0]) * w;
          const py = h - (curve.y[i] + 40)/80 * h;
          if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
        });
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = "var(--text-mute)";
      ctx.font = "11px ui-sans-serif";
      ctx.fillText("Führe AC-Analyse aus für S11/S21", 12, 20);
    }
  };
  return (
    <div className="flex h-full flex-col gap-2 p-2">
      <div className="flex items-center gap-2 text-[10.5px] text-mute">
        <span>In</span>
        <NetSelect value={cfg.inNet} onChange={v=> update(win.id, { config: { ...win.config, network: { ...cfg, inNet: v } } })} />
        <span>Out</span>
        <NetSelect value={cfg.outNet} onChange={v=> update(win.id, { config: { ...win.config, network: { ...cfg, outNet: v } } })} />
      </div>
      <div className="flex-1 overflow-hidden rounded-lg" style={{ border: "1px solid var(--border)" }}>
        <Plot render={render} />
      </div>
      <div className="text-[10px] text-mute">Network Analyzer – RF, S-Parameter, Gain/Phase. Für MVP zeigt AC-Kurve, voll: S11/S21.</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* window chrome + dock                                                */
/* ------------------------------------------------------------------ */
function Window({ win }: { win: InstrumentWindow }) {
  const { updateInstrument, closeInstrument, focusInstrument } = useEditor();
  const drag = useRef<{ x: number; y: number; wx: number; wy: number } | null>(null);
  const resize = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const winRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let pendingPos: { x: number; y: number } | null = null;
    let pendingSize: { w: number; h: number } | null = null;
    const apply = () => {
      raf = 0;
      if (winRef.current) {
        if (pendingPos) {
          winRef.current.style.left = pendingPos.x + "px";
          winRef.current.style.top = pendingPos.y + "px";
        }
        if (pendingSize) {
          winRef.current.style.width = pendingSize.w + "px";
          winRef.current.style.height = pendingSize.h + "px";
        }
      }
    };
    const move = (e: PointerEvent) => {
      if (drag.current) {
        pendingPos = {
          x: Math.max(0, drag.current.wx + e.clientX - drag.current.x),
          y: Math.max(48, drag.current.wy + e.clientY - drag.current.y),
        };
        if (!raf) raf = requestAnimationFrame(apply);
      }
      if (resize.current) {
        pendingSize = {
          w: Math.max(300, resize.current.w + e.clientX - resize.current.x),
          h: Math.max(220, resize.current.h + e.clientY - resize.current.y),
        };
        if (!raf) raf = requestAnimationFrame(apply);
      }
    };
    const up = () => {
      if (drag.current && pendingPos) {
        updateInstrument(win.id, pendingPos);
      }
      if (resize.current && pendingSize) {
        updateInstrument(win.id, pendingSize);
      }
      drag.current = null;
      resize.current = null;
      pendingPos = null;
      pendingSize = null;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [updateInstrument, win.id]);

  const body = () => {
    switch (win.kind) {
      case "scope":
        return <Oscilloscope win={win} />;
      case "dmm":
        return <Multimeter win={win} />;
      case "funcgen":
        return <FunctionGenerator />;
      case "bode":
        return <BodePlotter win={win} />;
      case "logic":
        return <LogicAnalyzer win={win} />;
      case "logicconv":
        return <LogicConverter win={win} />;
      case "watt":
        return <Wattmeter win={win} />;
      case "iv":
        return <IvAnalyzer />;
      case "spectrum":
        return <SpectrumAnalyzer win={win} />;
      case "pattern":
        return <PatternGenerator />;
      case "counter":
        return <FrequencyCounter win={win} />;
      case "distortion":
        return <DistortionAnalyzer win={win} />;
      case "network":
        return <NetworkAnalyzer win={win} />;
      default:
        return null;
    }
  };

  return (
    <div
      ref={winRef}
      className="rise pointer-events-auto absolute flex flex-col overflow-hidden rounded-xl will-change-transform"
      style={{ left: win.x, top: win.y, width: win.w, height: win.minimized ? 36 : win.h, zIndex: win.z, background: "var(--panel-solid)", border: "1px solid var(--border-strong)", boxShadow: "var(--shadow)" }}
      onPointerDown={() => focusInstrument(win.id)}
    >
      <div
        className="flex h-9 shrink-0 cursor-grab items-center gap-2 px-3"
        style={{ borderBottom: "1px solid var(--border)" }}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, wx: win.x, wy: win.y };
        }}
      >
        <span className="grid h-5 w-5 place-items-center rounded-md" style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)" }}>
          {iconFor(win.kind)}
        </span>
        <span className="flex-1 text-[12px] font-medium">{win.title}</span>
        <button className="btn px-1 py-0.5" onClick={() => updateInstrument(win.id, { minimized: !win.minimized })}>
          <Minus size={13} />
        </button>
        <button className="btn px-1 py-0.5" onClick={() => closeInstrument(win.id)}>
          <X size={13} />
        </button>
      </div>
      {!win.minimized && <div className="min-h-0 flex-1">{body()}</div>}
      {!win.minimized && (
        <div
          className="absolute bottom-0 right-0 h-3.5 w-3.5 cursor-nwse-resize"
          onPointerDown={(e) => {
            resize.current = { x: e.clientX, y: e.clientY, w: win.w, h: win.h };
          }}
          style={{ background: "linear-gradient(135deg, transparent 50%, var(--border-strong) 50%)" }}
        />
      )}
    </div>
  );
}

function iconFor(kind: InstrumentKind) {
  const s = 12;
  switch (kind) {
    case "scope":
      return <Activity size={s} />;
    case "dmm":
      return <Gauge size={s} />;
    case "funcgen":
      return <Waves size={s} />;
    case "bode":
      return <LineChart size={s} />;
    case "logic":
      return <Binary size={s} />;
    case "logicconv":
      return <Binary size={s} />;
    case "watt":
      return <Zap size={s} />;
    case "iv":
      return <SquareActivity size={s} />;
    case "spectrum":
      return <BarChart3 size={s} />;
    case "counter":
      return <Timer size={s} />;
    case "distortion":
      return <Activity size={s} />;
    case "network":
      return <Radio size={s} />;
    default:
      return <Radio size={s} />;
  }
}

export function InstrumentLayer() {
  const instruments = useEditor((s) => s.instruments);
  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {instruments.map((w) => (
        <Window key={w.id} win={w} />
      ))}
    </div>
  );
}

export function InstrumentDock() {
  const open = useEditor((s) => s.openInstrument);
  const items: Array<[InstrumentKind, string]> = [
    ["scope", "Oszilloskop"],
    ["dmm", "Multimeter"],
    ["funcgen", "Funktionsgenerator"],
    ["counter", "Frequenzzähler"],
    ["bode", "Bode-Plotter"],
    ["logic", "Logikanalysator"],
    ["logicconv", "Logic Converter"],
    ["watt", "Wattmeter"],
    ["iv", "IV-Analyzer"],
    ["spectrum", "Spektrum"],
    ["pattern", "Mustergenerator"],
    ["distortion", "Distortion Analyzer"],
    ["network", "Network Analyzer"],
  ];
  return (
    <div className="panel flex w-[52px] shrink-0 flex-col items-center gap-1 py-2" style={{ borderWidth: "0 0 0 1px" }}>
      <div className="mb-1 text-[8.5px] uppercase tracking-wider text-mute">Geräte</div>
      {items.map(([kind, title]) => (
        <button key={kind} className="btn h-9 w-9 justify-center p-0" title={title} onClick={() => open(kind)}>
          {iconFor(kind)}
        </button>
      ))}
    </div>
  );
}
