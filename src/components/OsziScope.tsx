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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Oscilloscope from "./oszi2/Oscilloscope";
import HelpOverlay from "./oszi2/HelpOverlay";
import { click } from "./oszi2/sound";
import { CH_COLORS, clamp, defaultSettings, type ChannelSettings, type Env, type ProbeState, type Settings } from "./oszi2/types";
import { engine as simEngine, useEditor, type InstrumentWindow } from "@/state/editor";
import { DeviceFit, useReportNatural } from "./DeviceFit";
import { LeadBanner } from "./LeadBanner";

const NCH = 4;

/** Runde 20 (W38): Chassis-Maße des OTX2074 als Startwert für den Fenster-Fit
 *  (gemessen wird danach echt; die Werte kommen aus dem 1:1-Port). */
const OSZI_CHASSIS = { w: 1420, h: 688 };

/** Labortisch-Hintergrund aus oszi v2 (dort am <body>). */
/* Runde 20 (W38): Der braune Labortisch-Hintergrund aus oszi v2 ist raus. Er
 *  war im Fenster als Streifen links/rechts neben dem Gehäuse zu sehen, weil
 *  Fenster-Chrome zu großzügig gerechnet war. Jetzt gilt: Fenster = Gerät +
 *  Chrome – das Gehäuse füllt die Fläche bündig aus. */
const WINDOW_BG: React.CSSProperties = { background: "transparent" };
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

export default function OsziScope({ win }: { win: InstrumentWindow }) {
  const netResult = useEditor((s) => s.netResult);
  // Runde 19 (W35): Fenster klebt beim Öffnen exakt am Chassis (1420 breit,
  // Höhe gemessen) – Fit skaliert nur herunter, wenn der Platz nicht reicht.
  // Runde 20 (W40): Das natürliche Gerätemaß geht an den globalen Fenstermanager.
  const reportNatural = useReportNatural();

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
  // Runde 17 (W32c): „in der Hand" lebt im Store – die Canvas weiß dann,
  // welcher Kanal auf eine Leitung/einen Pin im Schaltplan wartet.
  const armed = useEditor((s) => s.leadArmed);
  const held = armed && armed.instanceId === win.instanceId ? armed.pinIndex : null;
  const [parked, setParked] = useState<(null | "comp" | "gnd")[]>([null, null, null, null]);
  const [help, setHelp] = useState(false);

  const onPickProbe = useCallback(
    (k: number) => {
      const instId = win.instanceId;
      if (!instId) return;
      const st = useEditor.getState();
      const cur = st.leadArmed;
      if (cur && cur.instanceId === instId && cur.pinIndex === k) {
        st.setLeadArmed(null); // zurück auf die BNC → Messung laut Verdrahtung
        return;
      }
      setParked((p) => p.map((v, i) => (i === k ? null : v))); // von ⎍/⏚ abziehen
      click('plug');
      st.setLeadArmed({ instanceId: instId, pinIndex: k, name: `CH${k + 1}`, color: CH_COLORS[k] });
    },
    [win.instanceId],
  );
  const onTargetClick = useCallback(
    (id: string) => {
      const st = useEditor.getState();
      const cur = st.leadArmed;
      if (!cur || cur.instanceId !== win.instanceId || (id !== "comp" && id !== "gnd")) return;
      setParked((p) => p.map((v, i) => (i === cur.pinIndex ? id : v)));
      click('plug');
      st.setLeadArmed(null);
    },
    [win.instanceId],
  );
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

  // Escape schließt die Anleitung; das Zurücklegen der Messleitung macht die
  // Instrumenten-Ebene (Runde 19, gilt für Oszi und FG).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") setHelp(false);
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
  // Runde 16 (W31c): Simulation angehalten = tote Schaltung → 0 V + Grund-
  // rauschen (User-Entscheidung: „Simulation an = Signal an; Simulation stopp =
  // keine Spannung"). comp/GND laufen als Geräte-Eigensignale weiter.
  // W31d: zweistufiger Lookup – Fast-Tier (≈40 kSa/s, ~0,41 s), sonst
  // Langzeit-Tier (≈3,3 kSa/s, ~2,5 s); vor Sim-Start 0 V, verjüngte Historie
  // = Hold am Rand.
  const bufCache = useRef<{ frame: number; fast: Map<string, Buf | null>; slow: Map<string, Buf | null> }>({
    frame: -1,
    fast: new Map(),
    slow: new Map(),
  });
  const sampler = useCallback((net: string, t: number): number => {
    if (!simEngine.running) return 0;
    const frame = Math.floor(performance.now() / 16);
    const c = bufCache.current;
    if (c.frame !== frame) {
      c.frame = frame;
      c.fast.clear();
      c.slow.clear();
    }
    let f = c.fast.get(net);
    if (f === undefined) {
      f = simEngine.channel(net, 16384);
      c.fast.set(net, f);
    }
    if (f && f.t.length > 0 && t >= f.t[0]) return interpAt(f, t);
    let s = c.slow.get(net);
    if (s === undefined) {
      s = simEngine.channelSlow(net, 8192);
      c.slow.set(net, s);
    }
    if (!s || s.t.length === 0) return 0;
    if (t >= s.t[0]) return interpAt(s, t);
    return t < 0 ? 0 : s.v[0];
  }, []);

  const envRef = useRef<Env>({ probes, gndRef, sampler });
  useEffect(() => {
    envRef.current = { probes, gndRef, sampler };
  });

  const onSettings = useCallback((s: Settings) => saveScope(s), [saveScope]);
  const onHelp = useCallback(() => setHelp(true), []);

  return (
    <div
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{ ...WINDOW_BG, cursor: held !== null ? "crosshair" : undefined }}
    >
      {held !== null && (
        <LeadBanner
          color={CH_COLORS[held]}
          title={`Tastkopf CH${held + 1} in der Hand –`}
          hint="klicke auf eine Leitung oder einen Pin im Schaltplan (die Messleitung wird hingelegt), auf die Klemmen ⎍/⏚ am Gerät oder zurück auf die BNC-Buchse."
          onCancel={() => useEditor.getState().setLeadArmed(null)}
        />
      )}
      <div className="flex min-h-0 flex-1 flex-col" style={{ userSelect: "none" }}>
        <DeviceFit natural={OSZI_CHASSIS} onMeasure={reportNatural}>
          <div className="otx-scope" data-no-drag>
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
        </DeviceFit>
      </div>

      {help && <HelpOverlay onClose={() => setHelp(false)} />}
    </div>
  );
}
