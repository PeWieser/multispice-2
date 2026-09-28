"use client";

/* Runde 15 (W30): OTX2074 — das komplette oszi v2 des Users, funktional wie
 * optisch 1:1 übernommen (src/components/oszi2/). Einzige Änderungen laut
 * User-Vorgabe:
 *   1. USB-Port entfernt,
 *   2. Anschlüsse bilden die Schaltung ab: Messleitungen werden an die Pins
 *      CH1–CH4/GND des Oszi-Schaltzeichens verdrahtet. Ohne Leitung = offener
 *      Anschluss (BNC ohne Stecker/Kabel), der Kanal zeichnet eine 0-V-Linie.
 *      Kein Kabel → kein Signal, wie bei einem echten Oszi.
 * Die Testbench (Demo-Kippstufe/Generator) entfällt; die Signale liefert die
 * Multispice-Engine. Tastkopf-Aufnehmen und Probe-Comp-Klemmen funktionieren
 * weiter; Dämpfungsschalter + Abgleich-Trimmer sitzen im CH-Menü. */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Oscilloscope from "./oszi2/Oscilloscope";
import HelpOverlay from "./oszi2/HelpOverlay";
import { CH_COLORS, clamp, defaultSettings, type ChannelSettings, type Env, type ProbeState, type Settings } from "./oszi2/types";
import { engine as simEngine, useEditor, type InstrumentWindow } from "@/state/editor";

const NCH = 4;

/** Labortisch-Hintergrund aus oszi v2 (dort am <body>). */
const BENCH_BG: React.CSSProperties = {
  background:
    "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,.08), transparent 60%)," +
    "repeating-linear-gradient(90deg, rgba(0,0,0,.05) 0 2px, transparent 2px 7px)," +
    "linear-gradient(180deg, #5b4a3a 0%, #4a3b2e 100%)",
};

interface ProbeCfg {
  atten: 1 | 10;
  comp: number;
}

interface StoredScope {
  v: 3;
  settings?: Settings;
  probes?: ProbeCfg[];
}

const defaultProbeCfg = (): ProbeCfg[] =>
  Array.from({ length: NCH }, () => ({ atten: 10 as 1 | 10, comp: 0 }));

/** Gespeicherte Settings robust gegen Teilstrukturen mergen. */
function sanitizeSettings(raw: unknown): Settings {
  const def = defaultSettings();
  if (!raw || typeof raw !== "object") return def;
  const stored = raw as { v?: number; settings?: Record<string, unknown> };
  if (stored.v !== 3 || !stored.settings || typeof stored.settings !== "object") return def;
  const s = stored.settings;
  const merged = { ...def, ...s } as Settings;
  merged.ch = def.ch.map((c, i): ChannelSettings => {
    const o = Array.isArray(s.ch) ? (s.ch[i] as Partial<ChannelSettings> | undefined) : undefined;
    return o && typeof o === "object" ? { ...c, ...o } : { ...c };
  });
  const pick = <K extends "trig" | "acq" | "math" | "fft" | "meas" | "cursor" | "zoom" | "search" | "display">(k: K) => {
    const o = s[k];
    merged[k] = { ...def[k], ...(o && typeof o === "object" ? (o as object) : {}) } as Settings[K];
  };
  (["trig", "acq", "math", "fft", "meas", "cursor", "zoom", "search", "display"] as const).forEach(pick);
  if (!Array.isArray(merged.meas.list)) merged.meas.list = [];
  merged.meas.list = merged.meas.list.slice(0, 6);
  if (!Array.isArray(merged.search.marks)) merged.search.marks = [];
  if (!Array.isArray(merged.refShow) || merged.refShow.length !== 2) merged.refShow = def.refShow;
  merged.saveAssign = s.saveAssign === "csv" || s.saveAssign === "setup" ? s.saveAssign : "png";
  merged.menu = null;
  merged.lastMenu = null;
  merged.knobTarget = null;
  merged.fineMode = false;
  merged.run = s.run === "stop" || s.run === "single" ? s.run : "run";
  return merged;
}

function sanitizeProbes(raw: unknown): ProbeCfg[] {
  const def = defaultProbeCfg();
  const stored = raw as { v?: number; probes?: unknown } | undefined;
  if (!stored || stored.v !== 3) return def;
  const arr = stored.probes;
  if (!Array.isArray(arr)) return def;
  return def.map((d, i) => {
    const p = arr[i] as { atten?: unknown; comp?: unknown } | undefined;
    if (!p || typeof p !== "object") return d;
    return {
      atten: p.atten === 1 ? (1 as const) : (10 as const),
      comp: typeof p.comp === "number" ? clamp(+p.comp.toFixed(2), -0.6, 0.6) : 0,
    };
  });
}

type Buf = { t: number[]; v: number[] };

/** Lineare Interpolation im Engine-Buffer (binäre Suche). */
function interpAt(b: Buf | null, t: number): number {
  if (!b || b.t.length === 0) return 0;
  const arr = b.t;
  if (t <= arr[0]) return b.v[0];
  const n = arr.length - 1;
  if (t >= arr[n]) return b.v[n];
  let lo = 0;
  let hi = n;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (arr[m] <= t) lo = m;
    else hi = m;
  }
  const f = (t - arr[lo]) / (arr[hi] - arr[lo] || 1);
  return b.v[lo] + (b.v[hi] - b.v[lo]) * f;
}

/** Skaliert das 1420px-Chassis auf die Fensterbreite (aus oszi v2 App.tsx,
 *  aber gegen den Container statt das Browserfenster gemessen). */
function Fit({ width, children }: { width: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const upd = () => {
      const avail = (outer.current?.clientWidth ?? width) - 8;
      setScale(Math.min(1, avail / width));
      if (inner.current) setH(inner.current.offsetHeight);
    };
    upd();
    const ro = new ResizeObserver(upd);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={outer} className="w-full">
      <div style={{ width: width * scale, height: h * scale, margin: "0 auto" }}>
        <div ref={inner} style={{ width, transform: `scale(${scale})`, transformOrigin: "top left" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function OsziScope({ win }: { win: InstrumentWindow }) {
  const netResult = useEditor((s) => s.netResult);

  // ---- Verdrahtung: Pins CH1–CH4 (0–3) und GND (4) am Oszi-Symbol ----
  // Freie Pins trägt das Modell als „<instanz>_nc<i>“ → Kanal bleibt offen.
  const nets = useMemo(() => {
    if (!win.instanceId) return ["", "", "", ""];
    return Array.from({ length: NCH }, (_, i) => {
      const n = netResult.pinNets[`${win.instanceId}:${i}`] ?? "";
      return n === `${win.instanceId}_nc${i}` ? "" : n;
    });
  }, [win.instanceId, netResult.pinNets]);
  const gndNet = useMemo(() => {
    if (!win.instanceId) return "";
    const n = netResult.pinNets[`${win.instanceId}:4`] ?? "";
    return n === `${win.instanceId}_nc4` ? "" : n;
  }, [win.instanceId, netResult.pinNets]);
  const gndRef = gndNet && gndNet !== "0" ? gndNet : "";

  // ---- Persistenz (Settings + physische Tastkopf-Zustände) ----
  const [initialSettings] = useState<Settings>(() => sanitizeSettings(win.config.scope));
  const [probeCfg, setProbeCfg] = useState<ProbeCfg[]>(() => sanitizeProbes(win.config.scope));
  const probeCfgRef = useRef(probeCfg);
  useEffect(() => { probeCfgRef.current = probeCfg; }, [probeCfg]);

  const saveScope = useCallback(
    (settings?: Settings, probes?: ProbeCfg[]) => {
      const st = useEditor.getState();
      const w = st.instruments.find((x) => x.id === win.id);
      const cfg = w?.config ?? {};
      const prev = (cfg.scope && typeof cfg.scope === "object" && (cfg.scope as StoredScope).v === 3 ? cfg.scope : {}) as StoredScope;
      const next: StoredScope = { v: 3, settings: settings ?? prev.settings, probes: probes ?? prev.probes };
      st.updateInstrument(win.id, { config: { ...cfg, scope: next } });
    },
    [win.id],
  );

  // ---- Tastkopf-Handling: aufnehmen, auf ⎍/⏚ stecken, zurück auf die BNC ----
  const [held, setHeld] = useState<number | null>(null);
  const [parked, setParked] = useState<(null | "comp" | "gnd")[]>([null, null, null, null]);
  const [help, setHelp] = useState(false);
  const heldRef = useRef(held);
  useEffect(() => { heldRef.current = held; }, [held]);

  const onPickProbe = useCallback((k: number) => {
    if (heldRef.current === k) {
      setHeld(null); // zurück auf die BNC → Messung laut Verdrahtung
      return;
    }
    setParked((p) => p.map((v, i) => (i === k ? null : v))); // von ⎍/⏚ abziehen
    setHeld(k);
  }, []);
  const onTargetClick = useCallback((id: string) => {
    const k = heldRef.current;
    if (k === null || (id !== "comp" && id !== "gnd")) return;
    setParked((p) => p.map((v, i) => (i === k ? id : v)));
    setHeld(null);
  }, []);
  const onToggleAtten = useCallback(
    (k: number) => {
      const next = probeCfgRef.current.map((p, i) => (i === k ? { ...p, atten: (p.atten === 10 ? 1 : 10) as 1 | 10 } : p));
      setProbeCfg(next);
      saveScope(undefined, next);
    },
    [saveScope],
  );
  const onProbeComp = useCallback(
    (k: number, d: number) => {
      const next = probeCfgRef.current.map((p, i) => (i === k ? { ...p, comp: +clamp(p.comp + d * 0.03, -0.6, 0.6).toFixed(2) } : p));
      setProbeCfg(next);
      saveScope(undefined, next);
    },
    [saveScope],
  );

  // Escape: Tastkopf ablegen / Anleitung schließen (aus oszi v2 App.tsx)
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHeld(null);
        setHelp(false);
      }
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, []);

  // ---- Effektive Tastköpfe: Verdrahtung bestimmt das Ziel ----
  const probes = useMemo<ProbeState[]>(
    () =>
      Array.from({ length: NCH }, (_, k) => ({
        target: held === k ? null : parked[k] ?? (nets[k] || null),
        atten: probeCfg[k].atten,
        comp: probeCfg[k].comp,
      })),
    [held, parked, nets, probeCfg],
  );

  // ---- Sampler: Netzspannung aus der laufenden Simulation (Frame-Cache) ----
  const bufCache = useRef<{ frame: number; map: Map<string, Buf | null> }>({ frame: -1, map: new Map() });
  const sampler = useCallback((net: string, t: number): number => {
    const frame = Math.floor(performance.now() / 16);
    const c = bufCache.current;
    if (c.frame !== frame) {
      c.frame = frame;
      c.map.clear();
    }
    let b = c.map.get(net);
    if (b === undefined) {
      b = simEngine.channel(net, 8192);
      c.map.set(net, b);
    }
    return interpAt(b, t);
  }, []);

  const envRef = useRef<Env>({ probes, gndRef, sampler });
  useEffect(() => {
    envRef.current = { probes, gndRef, sampler };
  });

  const onSettings = useCallback((s: Settings) => saveScope(s), [saveScope]);
  const onHelp = useCallback(() => setHelp(true), []);

  return (
    <div className="h-full w-full overflow-auto" style={BENCH_BG}>
      <div className="min-h-full pb-[170px] pt-4" style={{ userSelect: "none" }}>
        {held !== null && (
          <div
            className="fixed left-1/2 top-3 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/85 px-5 py-2 text-[13px] text-white shadow-xl"
            style={{ boxShadow: `0 0 0 2px ${CH_COLORS[held]}` }}
          >
            <span className="h-3 w-3 rounded-full" style={{ background: CH_COLORS[held] }} />
            Tastkopf CH{held + 1} in der Hand – klicke auf die Klemmen ⎍/⏚ am Gerät oder zurück auf die BNC-Buchse {held + 1}
            <button className="rounded-full bg-white/15 px-3 py-0.5 text-[12px] hover:bg-white/25" onClick={() => setHeld(null)}>
              Zurückstecken
            </button>
          </div>
        )}

        <Fit width={1420}>
          <div className="otx-scope">
            <Oscilloscope
              envRef={envRef}
              probes={probes}
              heldProbe={held}
              onTargetClick={onTargetClick}
              onPickProbe={onPickProbe}
              onHelp={onHelp}
              initialSettings={initialSettings}
              onSettings={onSettings}
              onToggleAtten={onToggleAtten}
              onProbeComp={onProbeComp}
            />
          </div>
        </Fit>

        {help && <HelpOverlay onClose={() => setHelp(false)} />}
      </div>
    </div>
  );
}
