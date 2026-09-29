import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Knob from './Knob';
import Button from './Button';
import type { Env, ProbeState, RefWave, Settings } from './types';
import { CH_COLORS, MEAS_TYPES, clamp, defaultSettings, step125 } from './types';
import { Engine, NPTS, acquire, autoset, measure } from './engine';
import type { Acq } from './engine';
import { H, W, SLOT_H, GY, drawBoot, drawGraticule, drawOverlay, drawWaves, MAIN, OVERVIEW, ZOOMR, searchMarks, srcData, srcName, srcScale } from './render';
import { MENU_TITLES, applyKnob, buildMenu, cursorSels, defaultKnob } from './menus';
import type { MenuItem } from './menus';
import { sourceLabel } from './signals';
import { engine as simEngine } from '@/state/editor';

interface Props {
  envRef: React.MutableRefObject<Env>;
  probes: ProbeState[];
  heldProbe: number | null;
  onTargetClick: (id: string) => void;
  onPickProbe: (ch: number) => void;
  onHelp: () => void;
  /** W30 (Multispice): Settings-Persistenz + physische Tastkopf-Bedienelemente. */
  initialSettings?: Settings;
  onSettings?: (s: Settings) => void;
  onToggleAtten?: (ch: number) => void;
  onProbeComp?: (ch: number, d: number) => void;
}

export default function Oscilloscope({ envRef, probes, heldProbe, onTargetClick, onPickProbe, onHelp, initialSettings, onSettings, onToggleAtten, onProbeComp }: Props) {
  const [s, setS] = useState<Settings>(() => initialSettings ?? defaultSettings());
  const sRef = useRef(s);
  const [power, setPower] = useState(true);
  const powerRef = useRef(true);
  const bootStart = useRef(-10);
  // W30: Boot-Sperre als State + Timer statt Ref-Lesen in Render-Closures.
  const [booting, setBooting] = useState(false);
  const bootTimer = useRef<number | null>(null);
  useEffect(() => () => { if (bootTimer.current !== null) window.clearTimeout(bootTimer.current); }, []);
  const engine = useRef(new Engine());
  const [refs, setRefs] = useState<(RefWave | null)[]>([null, null]);
  const refsRef = useRef(refs);
  // W30: Ref-Synchronisation im Effekt (react-hooks: keine Ref-Writes im Render).
  useEffect(() => { sRef.current = s; }, [s]);
  useEffect(() => { refsRef.current = refs; }, [refs]);
  // W30: Settings debounced in das gebundene Gerätefenster persistieren.
  const onSettingsRef = useRef(onSettings);
  useEffect(() => { onSettingsRef.current = onSettings; }, [onSettings]);
  useEffect(() => {
    const t = window.setTimeout(() => onSettingsRef.current?.(s), 600);
    return () => window.clearTimeout(t);
  }, [s]);
  const msgRef = useRef<{ text: string; until: number } | null>(null);
  const calibStart = useRef<number | null>(null);
  const infoUntil = useRef(0);
  const lastLevelChange = useRef(-10);
  const clearPersistFlag = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const itemsRef = useRef<MenuItem[]>([]);
  const [, force] = useState(0);
  const [searchCount, setSearchCount] = useState(0);

  const now = () => performance.now() / 1000;
  const set = useCallback((fn: (s: Settings) => Settings) => setS((x) => fn(x)), []);
  const msg = useCallback((text: string) => { msgRef.current = { text, until: now() + 2.6 }; }, []);

  // ---------- actions ----------
  const guard = (fn: () => void) => () => { if (power && !booting) fn(); };

  const screenshot = () => {
    const c = canvasRef.current; if (!c) return;
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = `OTX2074_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
    a.click();
    msg('Bildschirmfoto gespeichert');
  };
  const csv = () => {
    const acq = engine.current.display; if (!acq) { msg('Keine Daten vorhanden'); return; }
    const x = sRef.current;
    const chs = [0, 1, 2, 3].filter((c) => x.ch[c].on);
    let out = 'Zeit (s),' + chs.map((c) => `CH${c + 1} (V)`).join(',') + '\n';
    for (let i = 0; i < NPTS; i++) out += (acq.t0 + i * acq.dt).toExponential(6) + ',' + chs.map((c) => acq.data[c][i].toFixed(5)).join(',') + '\n';
    const blob = new Blob([out], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'OTX2074_Signaldaten.csv';
    a.click();
    msg('Signaldaten (CSV) gespeichert');
  };
  const saveSetup = () => {
    const { menu, lastMenu, knobTarget, ...rest } = sRef.current;
    void menu; void lastMenu; void knobTarget;
    localStorage.setItem('otx2074-setup', JSON.stringify(rest));
    msg('Setup gespeichert');
  };
  const loadSetup = () => {
    const raw = localStorage.getItem('otx2074-setup');
    if (!raw) { msg('Kein gespeichertes Setup vorhanden'); return; }
    try {
      const p = JSON.parse(raw);
      set((x) => ({ ...defaultSettings(), ...p, menu: x.menu, lastMenu: x.lastMenu, knobTarget: null }));
      msg('Setup abgerufen');
    } catch { msg('Setup beschädigt'); }
  };
  const defaultSetup = () => {
    set(() => defaultSettings());
    engine.current.stats.clear();
    msg('Standard-Setup geladen');
  };
  const level50 = () => {
    const x = sRef.current;
    const acq = engine.current.display;
    if (!acq || x.trig.source > 3) return;
    const d = acq.data[x.trig.source];
    let mx = -Infinity, mn = Infinity;
    for (let i = 0; i < d.length; i++) { if (d[i] > mx) mx = d[i]; if (d[i] < mn) mn = d[i]; }
    set((y) => ({ ...y, trig: { ...y.trig, level: +((mx + mn) / 2).toPrecision(3) } }));
    lastLevelChange.current = now();
  };
  const saveRef = (k: number) => {
    const acq = engine.current.display; const x = sRef.current;
    if (!acq) { msg('Keine Daten vorhanden'); return; }
    const d = srcData(acq, x, x.refSource);
    if (!d) { msg('Quelle nicht aktiv'); return; }
    const { vdiv, pos } = srcScale(x, x.refSource);
    const divs = new Float32Array(NPTS);
    for (let i = 0; i < NPTS; i++) divs[i] = d[i] / vdiv + pos;
    setRefs((r) => r.map((v, i) => (i === k ? { divs, label: srcName(x.refSource), vdiv, tdiv: x.tdiv } : v)));
    set((y) => ({ ...y, refShow: y.refShow.map((v, i) => (i === k ? true : v)) }));
    msg(`${srcName(x.refSource)} → R${k + 1} gespeichert`);
  };
  const resetStats = () => engine.current.stats.clear();

  const api = {
    set, msg, saveRef,
    clearRefs: () => { setRefs([null, null]); set((y) => ({ ...y, refShow: [false, false] })); msg('Referenzen gelöscht'); },
    hasRef: (k: number) => !!refs[k],
    screenshot, csv, saveSetup, loadSetup,
    calib: () => { calibStart.current = now(); },
    toggleInfo: () => { infoUntil.current = infoUntil.current > now() ? 0 : now() + 6; },
    defaultSetup, level50, resetStats,
    clearPersist: () => { clearPersistFlag.current = true; },
    searchCount,
    // W30: physische Tastkopf-Bedienung (Schalter/Trimmer) im CH-Menü
    probeAtten: (k: number) => probes[k]?.atten ?? 10,
    probeComp: (k: number) => probes[k]?.comp ?? 0,
    toggleProbeAtten: (k: number) => onToggleAtten?.(k),
  };
  // W30: Menü-Items im Effekt bauen (kein Ref-Write im Render).
  useEffect(() => {
    itemsRef.current = buildMenu(s, api);
  });

  // ---------- main loop ----------
  useEffect(() => {
    const canvas = canvasRef.current!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr; canvas.height = H * dpr;
    const ctx = canvas.getContext('2d')!;
    const layer = document.createElement('canvas');
    layer.width = W * dpr; layer.height = H * dpr;
    const lctx = layer.getContext('2d')!;
    let raf = 0;
    let lastT = now();
    let lastSearchCount = -1;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const t = now();
      const dtFrame = t - lastT; lastT = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!powerRef.current) { ctx.fillStyle = '#030404'; ctx.fillRect(0, 0, W, H); return; }
      const bootP = (t - bootStart.current) / 2.2;
      if (bootP < 1) { drawBoot(ctx, Math.max(0, bootP)); return; }
      // Simulationszeit holen (für Datenakquise, Trigger, Autoset)
      const simT = simEngine.lastState?.time ?? 0;
      const eng = engine.current;
      const st = sRef.current;
      const env = envRef.current;
      if (simT < eng.lastTT) {
        // Simulation zurückgesetzt → Trigger-Suchzustand neu synchronisieren.
        eng.pendingTT = null;
        eng.searchStart = simT;
        eng.lastAcqTime = simT - 1;
        eng.singleStartWall = null;
      }
      const wallT = now(); // Wall-Time für UI/Trigger-Timeouts
      const res = eng.step(simT, t, st, env);
      if (res.singleDone) setS((x) => ({ ...x, run: 'stop' }));
      let zoomAcq: Acq | null = null;
      if (st.zoom.on && eng.display && !st.acq.xy) {
        zoomAcq = acquire(eng.lastTT, st.hDelay + st.zoom.pos * st.tdiv, st.tdiv / st.zoom.factor, st, env, eng.acMean, true);
      }
      // statistics
      if (res.newAcq && st.meas.stats && eng.display) {
        st.meas.list.forEach((m, idx) => {
          const v = measure(m.type, srcData(eng.display!, st, m.src), eng.display!.dt).value;
          if (!isFinite(v)) return;
          const key = `${idx}:${m.type}:${m.src}`;
          const e = eng.stats.get(key) ?? { n: 0, sum: 0, min: Infinity, max: -Infinity };
          e.n++; e.sum += v; e.min = Math.min(e.min, v); e.max = Math.max(e.max, v);
          eng.stats.set(key, e);
        });
      }
      if (st.search.on && res.newAcq) {
        const n = searchMarks(eng.display, st).length;
        if (n !== lastSearchCount) { lastSearchCount = n; setSearchCount(n); }
      }
      // calibration
      let calib: number | null = null;
      if (calibStart.current !== null) {
        calib = (t - calibStart.current) / 4;
        if (calib >= 1) { calibStart.current = null; calib = null; msgRef.current = { text: 'Selbstkalibrierung erfolgreich', until: t + 2.5 }; }
      }
      // background + graticule
      ctx.fillStyle = '#05070a';
      ctx.fillRect(0, 0, W, H);
      if (st.zoom.on && !st.acq.xy) {
        drawGraticule(ctx, OVERVIEW, st.display.graticule);
        drawGraticule(ctx, ZOOMR, st.display.graticule);
      } else drawGraticule(ctx, MAIN, st.display.graticule);
      // persistence layer
      const persist = st.display.persistence;
      if (persist === 0 || clearPersistFlag.current) {
        lctx.clearRect(0, 0, W, H);
        clearPersistFlag.current = false;
      } else if (persist > 0 && st.run !== 'stop') {
        lctx.save();
        lctx.globalCompositeOperation = 'destination-out';
        lctx.fillStyle = `rgba(0,0,0,${Math.min(1, 1 - Math.exp(-dtFrame / persist))})`;
        lctx.fillRect(0, 0, W, H);
        lctx.restore();
      }
      const inp = {
        s: st, acq: eng.display, zoomAcq, refs: refsRef.current, status: eng.status, wall: t,
        message: msgRef.current, menuTitle: st.menu ? MENU_TITLES[st.menu] : null,
        menuItems: itemsRef.current, lastLevelChange: lastLevelChange.current, stats: eng.stats,
        avgN: eng.avgN, calib, info: infoUntil.current > t,
      };
      if (persist === 0 || res.newAcq || st.zoom.on) drawWaves(lctx, inp);
      ctx.drawImage(layer, 0, 0, W, H);
      drawOverlay(ctx, inp);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [envRef]);

  // ---------- control handlers ----------
  const openMenu = (m: Settings['menu']) => set((x) => ({ ...x, menu: x.menu === m ? null : m, lastMenu: m ?? x.lastMenu, knobTarget: null }));

  const chButton = (k: number) => set((x) => {
    const menu = `ch${k}` as Settings['menu'];
    const c = x.ch[k];
    if (!c.on) return { ...x, ch: x.ch.map((cc, i) => (i === k ? { ...cc, on: true } : cc)), menu, lastMenu: menu, knobTarget: null };
    if (x.menu === menu) return { ...x, ch: x.ch.map((cc, i) => (i === k ? { ...cc, on: false } : cc)), menu: null, knobTarget: null };
    return { ...x, menu, lastMenu: menu, knobTarget: null };
  });

  const vScale = (k: number, d: number) => set((x) => {
    const c = x.ch[k];
    if (!c.on) { msg(`Kanal ${k + 1} ist ausgeschaltet`); return x; }
    const v = c.fine ? clamp(c.vdiv * Math.pow(1.02, -d), 1e-3 * c.probe, 10 * c.probe) : step125(c.vdiv, -d, 1e-3 * c.probe, 10 * c.probe);
    return { ...x, ch: x.ch.map((cc, i) => (i === k ? { ...cc, vdiv: +v.toPrecision(3) } : cc)) };
  });
  const vPos = (k: number, d: number) => set((x) => {
    if (!x.ch[k].on) { msg(`Kanal ${k + 1} ist ausgeschaltet`); return x; }
    return applyKnob(`ch${k}pos`, d, x);
  });
  const hScale = (d: number) => set((x) => ({ ...x, tdiv: x.hFine ? +clamp(x.tdiv * Math.pow(1.03, -d), 2e-9, 100).toPrecision(3) : step125(x.tdiv, -d, 2e-9, 100) }));
  const hPos = (d: number) => set((x) => applyKnob('hDelay', d, x));
  const trigLevel = (d: number) => { lastLevelChange.current = now(); set((x) => applyKnob('trigLevel', d, x)); };
  const multi = (d: number) => {
    // W30: Der Abgleich-Trimmer des Tastkopfs lebt nicht in den Settings –
    // Knob-Ziel „probeComp<k>“ geht direkt an den Adapter.
    const id = defaultKnob(sRef.current);
    if (id && id.startsWith('probeComp')) {
      const k = Number(id.slice(9));
      if (k >= 0 && k < 4) onProbeComp?.(k, d);
      return;
    }
    set((x) => {
      const id2 = defaultKnob(x);
      if (!id2) { msg('Mehrzweckknopf: keine Funktion zugewiesen'); return x; }
      if (id2 === 'trigLevel') lastLevelChange.current = now();
      return applyKnob(id2, d, x);
    });
  };
  const multiPush = () => set((x) => {
    if (x.cursor.mode !== 'off' && (!x.knobTarget || x.knobTarget === 'cursor')) {
      return { ...x, cursor: { ...x.cursor, sel: cursorSels(x.cursor.mode)[(cursorSels(x.cursor.mode).indexOf(x.cursor.sel) + 1) % cursorSels(x.cursor.mode).length] } };
    }
    if (x.knobTarget === 'measType' || x.knobTarget === 'measSrc') {
      if (x.meas.list.length >= 6) return x;
      return { ...x, meas: { ...x.meas, list: [...x.meas.list, { type: MEAS_TYPES[x.meas.selType].id, src: x.meas.selSrc }] } };
    }
    if (x.knobTarget) return { ...x, knobTarget: null };
    return x;
  });

  const cursorsBtn = () => set((x) => {
    if (x.cursor.mode === 'off') return { ...x, cursor: { ...x.cursor, mode: 'time', sel: 'a' }, menu: 'cursor', lastMenu: 'cursor', knobTarget: null };
    if (x.menu !== 'cursor') return { ...x, menu: 'cursor', lastMenu: 'cursor', knobTarget: null };
    return { ...x, cursor: { ...x.cursor, mode: 'off' }, menu: null, knobTarget: null };
  });
  const toggleFeature = (key: 'math' | 'fft', menu: 'math' | 'fft') => set((x) => {
    const f = x[key];
    if (!f.on) return { ...x, [key]: { ...f, on: true }, menu, lastMenu: menu, knobTarget: null } as Settings;
    if (x.menu !== menu) return { ...x, menu, lastMenu: menu, knobTarget: null };
    return { ...x, [key]: { ...f, on: false }, menu: null, knobTarget: null } as Settings;
  });
  const zoomBtn = () => set((x) => {
    if (!x.zoom.on) return { ...x, zoom: { ...x.zoom, on: true }, menu: 'zoom', lastMenu: 'zoom', knobTarget: 'zoomFactor' };
    if (x.menu !== 'zoom') return { ...x, menu: 'zoom', lastMenu: 'zoom', knobTarget: 'zoomFactor' };
    return { ...x, zoom: { ...x.zoom, on: false }, menu: null, knobTarget: null };
  });
  const searchBtn = () => set((x) => {
    if (!x.search.on) return { ...x, search: { ...x.search, on: true, src: x.trig.source < 4 ? x.trig.source : 0, level: x.trig.level }, menu: 'search', lastMenu: 'search', knobTarget: null };
    if (x.menu !== 'search') return { ...x, menu: 'search', lastMenu: 'search' };
    return { ...x, search: { ...x.search, on: false }, menu: null };
  });
  const markNav = (dir: number) => {
    const x = sRef.current;
    const all = [...searchMarks(engine.current.display, x), ...x.search.marks].sort((a, b) => a - b);
    const eps = x.tdiv * 0.05;
    const target = dir < 0 ? [...all].reverse().find((t) => t < x.hDelay - eps) : all.find((t) => t > x.hDelay + eps);
    if (target === undefined) { msg(all.length ? 'Keine weitere Marke' : 'Keine Marken – Suche aktivieren oder Set/Clear'); return; }
    set((y) => ({ ...y, hDelay: target }));
  };
  const markSet = () => set((x) => {
    const near = x.search.marks.findIndex((t) => Math.abs(t - x.hDelay) < x.tdiv * 0.2);
    const marks = near >= 0 ? x.search.marks.filter((_, i) => i !== near) : [...x.search.marks, x.hDelay];
    return { ...x, search: { ...x.search, marks } };
  });
  const runStop = () => {
    const x = sRef.current;
    engine.current.searchStart = simEngine.lastState.time;
    engine.current.pendingTT = null;
    set((y) => ({ ...y, run: x.run === 'stop' ? 'run' : 'stop' }));
  };
  const single = () => {
    engine.current.searchStart = simEngine.lastState.time;
    engine.current.pendingTT = null;
    engine.current.avg = null;
    set((y) => ({ ...y, run: 'single' }));
  };
  const doAutoset = () => {
    const r = autoset(sRef.current, envRef.current, simEngine.lastState.time);
    set(() => r.settings);
    engine.current.stats.clear();
    msg(r.msg);
  };
  const saveKey = () => {
    const a = sRef.current.saveAssign;
    if (a === 'png') screenshot(); else if (a === 'csv') csv(); else saveSetup();
  };
  const togglePower = () => {
    const p = !powerRef.current;
    powerRef.current = p;
    setPower(p);
    if (p) {
      bootStart.current = now();
      engine.current = new Engine();
      setBooting(true);
      if (bootTimer.current !== null) window.clearTimeout(bootTimer.current);
      bootTimer.current = window.setTimeout(() => { bootTimer.current = null; setBooting(false); }, 2400);
    }
    force((n) => n + 1);
  };

  const g = guard;
  const bezelTops = useMemo(() => {
    const arr: number[] = [12 / H];
    for (let i = 0; i < 6; i++) arr.push((GY + (i + 0.5) * SLOT_H) / H);
    arr.push(454 / H);
    return arr;
  }, []);

  const lit = (b: boolean, c = '#8dff6a') => (b && power ? c : null);
  const heldColor = heldProbe !== null ? CH_COLORS[heldProbe] : null;

  return (
    <div className="case select-none" style={{ width: 1420, padding: '20px 24px 26px' }}>
      <div className="flex gap-5">
        {/* ============ LEFT: screen ============ */}
        <div style={{ width: 900 }}>
          <div className="flex items-end justify-between px-2 pb-2" style={{ height: 44 }}>
            <div className="text-[30px] font-black italic tracking-tight text-[#1e3f8f]" style={{ textShadow: '0 1px 0 #fff' }}>
              OSZITRON
            </div>
            <div className="text-[13px] tracking-wide text-[#333]">
              <b>OTX 2000 SERIES</b>&nbsp; DIGITALES OSZILLOSKOP
            </div>
          </div>
          <div className="bezel flex p-[14px] gap-3">
            <div className="screen-glass" style={{ width: W, height: H }}>
              <canvas ref={canvasRef} style={{ width: W, height: H, display: 'block', filter: `brightness(${s.display.backlight})` }} />
            </div>
            <div className="relative" style={{ width: 50, height: H }}>
              {bezelTops.map((top, i) => (
                <button
                  key={i}
                  className="bezel-btn absolute"
                  style={{ left: '50%', top: `${top * 100}%`, transform: 'translate(-50%,-50%)' }}
                  title={i === 0 ? 'Save (Schnellspeichern)' : i === 7 ? 'Menü ein/aus' : `Menütaste ${i}`}
                  onClick={() => {
                    if (!power || booting) return;
                    if (i === 0) saveKey();
                    else if (i === 7) set((x) => ({ ...x, menu: x.menu ? null : x.lastMenu, knobTarget: null }));
                    else itemsRef.current[i - 1]?.press?.();
                  }}
                >
                  {i === 0 ? 'Save' : i === 7 ? <span>Menu<br />On/Off</span> : ''}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-8 px-4 pt-4" style={{ height: 76 }}>
            <div className="flex flex-col items-center gap-1">
              <button className="power-btn" onClick={togglePower} title="Netzschalter">
                <svg width="24" height="24" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="11" fill={power ? '#3cff5c' : '#9aa'} style={{ filter: power ? 'drop-shadow(0 0 6px #3cff5c)' : undefined }} />
                  <path d="M12 5v7M8 7.5a6 6 0 1 0 8 0" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            {/* W30: USB-Port entfernt (User-Vorgabe) */}
            <div className="flex-1" />
            <div className="rounded border border-[#999] bg-gradient-to-b from-[#f7f7f7] to-[#d9d9d9] px-3 py-1 text-center shadow-inner">
              <div className="text-[15px] font-bold text-[#333]">OTX2074</div>
              <div className="flex gap-2 text-[9px] text-[#555]"><span>70 MHz</span><span>|</span><span>1 GS/s</span><span>|</span><span>4 CH</span></div>
            </div>
          </div>
        </div>

        {/* ============ RIGHT: controls ============ */}
        <div className="flex flex-col" style={{ width: 452 }}>
          <div className="panel p-3" style={{ height: 520 }}>
            {/* top row */}
            <div className="flex justify-between">
              <Button onClick={() => onHelp()}>Help</Button>
              <Button onClick={g(() => openMenu('display'))} title="Anzeige-Einstellungen">Function</Button>
              <Button onClick={() => { if (power && !booting) doAutoset(); }} dark>Autoset</Button>
              <Button onClick={() => { if (power && !booting) single(); }} led={lit(s.run === 'single', '#ffc23a')}>Single</Button>
              <Button onClick={() => { if (power && !booting) runStop(); }} w={72} led={power ? (s.run === 'stop' ? '#ff4a3a' : '#5dff5a') : null}>Run/Stop</Button>
            </div>
            <div className="mt-3 flex gap-2">
              {/* multipurpose block */}
              <div className="flex flex-col" style={{ width: 196 }}>
                <div className="flex items-start gap-2">
                  <div className="mt-2 flex flex-col gap-3">
                    <Button onClick={g(zoomBtn)} w={52} led={lit(s.zoom.on, '#8fd0ff')}>Zoom</Button>
                    <Button onClick={g(searchBtn)} w={52} led={lit(s.search.on, '#8fd0ff')}>Search</Button>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="silk-dark">Mehrzweck</span>
                    <Knob size={62} variant="light" onTurn={(d) => power && multi(d)} onPush={g(multiPush)} pushLabel="" title="Mehrzweckknopf (drücken = Auswahl)" />
                    <span className="silk-dark text-[8px]">drücken: Auswahl</span>
                  </div>
                  <div className="mt-2 flex flex-col gap-3">
                    <Button onClick={g(cursorsBtn)} w={52} led={lit(s.cursor.mode !== 'off', '#8fd0ff')}>Cursors</Button>
                    <Button onClick={g(() => set((x) => ({ ...x, fineMode: !x.fineMode })))} w={52} led={lit(s.fineMode, '#ffe07a')}>Fine</Button>
                  </div>
                </div>
                <div className="mt-2 text-center silk-dark">Mark</div>
                <div className="mt-1 flex justify-center gap-2">
                  <Button onClick={() => { if (power && !booting) markNav(-1); }} w={40}>←</Button>
                  <Button onClick={g(markSet)} w={64} small>Set/Clear</Button>
                  <Button onClick={() => { if (power && !booting) markNav(1); }} w={40}>→</Button>
                </div>
              </div>
              {/* menu buttons */}
              <div className="flex flex-col gap-[9px] pt-1">
                <Button onClick={g(() => openMenu('measure'))} w={62} h={30} led={lit(s.menu === 'measure', '#bfe3ff')}>Measure</Button>
                <Button onClick={g(() => openMenu('save'))} w={62} h={30} small led={lit(s.menu === 'save', '#bfe3ff')}>Save/<br />Recall</Button>
                <Button onClick={() => { if (power && !booting) defaultSetup(); }} w={62} h={30} small>Default<br />Setup</Button>
                <Button onClick={g(() => openMenu('utility'))} w={62} h={30} led={lit(s.menu === 'utility', '#bfe3ff')}>Utility</Button>
              </div>
              {/* horizontal & trigger */}
              <div className="panel-dark flex flex-1 gap-1 p-2">
                <div className="flex flex-1 flex-col items-center">
                  <span className="silk font-bold">HORIZONTAL</span>
                  <span className="silk mt-1">Position</span>
                  <Knob size={34} onTurn={(d) => power && hPos(d)} onPush={g(() => set((x) => ({ ...x, hDelay: 0 })))} title="Horizontale Position (drücken = 0)" />
                  <span className="silk text-[8px]">drücken: Mitte</span>
                  <Button onClick={g(() => openMenu('acquire'))} w={56} small className="my-1" led={lit(s.menu === 'acquire', '#bfe3ff')}>Acquire</Button>
                  <span className="silk">Scale</span>
                  <Knob size={46} onTurn={(d) => power && hScale(d)} onPush={g(() => set((x) => ({ ...x, hFine: !x.hFine })))} title="Zeitbasis s/div (drücken = fein)" />
                </div>
                <div className="w-px bg-white/10" />
                <div className="flex flex-1 flex-col items-center">
                  <span className="silk font-bold">TRIGGER</span>
                  <Button onClick={g(() => openMenu('trigger'))} w={50} small className="mt-2" led={lit(s.menu === 'trigger', '#bfe3ff')}>Menu</Button>
                  <span className="silk mt-2">Level</span>
                  <Knob size={40} onTurn={(d) => power && trigLevel(d)} onPush={() => { if (power && !booting) level50(); }} title="Triggerpegel (drücken = 50%)" />
                  <span className="silk text-[8px]">drücken: 50%</span>
                  <Button onClick={() => { if (power && !booting) engine.current.forceTrig = true; }} w={56} small className="mt-2">Force<br />Trig</Button>
                </div>
              </div>
            </div>

            {/* vertical */}
            <div className="panel-dark mt-3 px-2 pb-2 pt-1">
              <div className="silk text-center font-bold tracking-widest">VERTIKAL</div>
              <div className="flex gap-2">
                <div className="flex flex-col gap-[10px] pt-2">
                  <Button onClick={g(() => toggleFeature('math', 'math'))} w={46} h={28} frame={s.math.on ? '#ff7a3a' : undefined} frameLit={s.math.on}>Math</Button>
                  <Button onClick={g(() => openMenu('ref'))} w={46} h={28} frame={s.refShow.some(Boolean) ? '#f0f0f0' : undefined} frameLit={s.refShow.some(Boolean)}>Ref</Button>
                  <Button onClick={g(() => toggleFeature('fft', 'fft'))} w={46} h={28} frame={s.fft.on ? '#ff7a3a' : undefined} frameLit={s.fft.on}>FFT</Button>
                  <Button onClick={() => { if (power && !booting) msg('Bus-Dekodierung: Option DPO-BUS nicht installiert'); }} w={46} h={28}>Bus</Button>
                </div>
                {[0, 1, 2, 3].map((k) => (
                  <div key={k} className="flex flex-1 flex-col items-center">
                    <span className="silk text-[9px]">Position</span>
                    <Knob size={34} ring={CH_COLORS[k]} onTurn={(d) => power && vPos(k, d)} onPush={g(() => set((x) => ({ ...x, ch: x.ch.map((c, i) => (i === k ? { ...c, pos: 0 } : c)) })))} title={`CH${k + 1} Position (drücken = 0)`} />
                    <Button onClick={g(() => chButton(k))} w={50} h={30} frame={CH_COLORS[k]} frameLit={s.ch[k].on && power} className="my-2 text-[14px]">
                      {k + 1}
                    </Button>
                    <span className="silk text-[9px]">Scale</span>
                    <Knob size={48} ring={CH_COLORS[k]} onTurn={(d) => power && vScale(k, d)} onPush={g(() => set((x) => ({ ...x, ch: x.ch.map((c, i) => (i === k ? { ...c, fine: !c.fine } : c)) })))} title={`CH${k + 1} V/div (drücken = fein)`} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* BNC row */}
          <div className="relative mt-3 flex items-start gap-[26px] pl-[62px]" style={{ height: 110 }}>
            {[0, 1, 2, 3].map((k) => {
              // W30: Anschlüsse bilden die Verdrahtung ab – Stecker + Kabel
              // hängen nur an der BNC, wenn der Kanal ein Netz misst und der
              // Tastkopf weder „in der Hand“ noch an den Comp-Klemmen steckt.
              const p = probes[k];
              const held = heldProbe === k;
              const parked = p.target === 'comp' || p.target === 'gnd';
              const plugged = !held && !parked && Boolean(p.target);
              const title = held
                ? `CH${k + 1}: Tastkopf in der Hand – Klick steckt ihn zurück auf die BNC-Buchse`
                : parked
                  ? `CH${k + 1}: Tastkopf steckt an der ${p.target === 'comp' ? 'Probe-Comp-Klemme (⎍ 5V/1kHz)' : 'Masse-Klemme (⏚)'} – Klick nimmt ihn auf`
                  : p.target
                    ? `CH${k + 1}: verbunden mit Netz „${p.target}“ – Klick nimmt den Tastkopf auf`
                    : `CH${k + 1}: offener Anschluss – Messleitung an Pin CH${k + 1} des Oszi-Symbols auf dem Schaltplan verdrahten`;
              return (
                <div key={k} className="relative flex flex-col items-center">
                  <div className="mb-1 flex items-center gap-1">
                    <span className="text-[12px] font-bold text-[#333]">{k + 1}</span>
                    <span className="h-[3px] w-8 rounded" style={{ background: CH_COLORS[k] }} />
                  </div>
                  <div className="bnc cursor-pointer" onClick={() => onPickProbe(k)} title={title}>
                    {plugged && (
                      <>
                        {/* probe plug */}
                        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
                          <div className="h-[40px] w-[40px] rounded-full" style={{ background: 'radial-gradient(circle at 40% 35%, #555, #151515 70%)', boxShadow: `0 0 0 3px ${CH_COLORS[k]}, 0 4px 8px rgba(0,0,0,.6)` }} />
                        </div>
                        <div className="absolute left-1/2 top-[40px] z-0 -translate-x-1/2" style={{ width: 12, height: 110, background: 'linear-gradient(90deg,#111,#3a3a3a 45%,#111)', borderRadius: 6 }} />
                      </>
                    )}
                  </div>
                  <div className="mt-1 text-[8px] text-[#555]">
                    {held ? 'in der Hand' : sourceLabel(p.target)} · {p.atten}X
                  </div>
                  {held && <div className="absolute -top-4 text-[9px] font-bold" style={{ color: '#1e3f8f' }}>in der Hand</div>}
                </div>
              );
            })}
            {/* probe comp */}
            <div className="ml-1 flex flex-col items-center gap-1 pt-1">
              <span className="text-[8px] leading-tight text-[#444] text-center">Probe Comp<br />⎍ 5V 1kHz</span>
              <div className="flex gap-3">
                {(['comp', 'gnd'] as const).map((id) => {
                  const attached = probes.map((p, i) => (p.target === id ? i : -1)).filter((i) => i >= 0);
                  return (
                    <div key={id} className="flex flex-col items-center">
                      <button
                        onClick={() => onTargetClick(id)}
                        className="relative h-[26px] w-[14px] rounded-sm"
                        title={id === 'comp' ? 'Abgleichsignal 5V / 1kHz' : 'Masse'}
                        style={{ background: 'linear-gradient(90deg,#8b8f94,#f2f3f4 50%,#8b8f94)', boxShadow: heldColor ? `0 0 0 2px ${heldColor}, 0 0 8px ${heldColor}` : '0 2px 3px rgba(0,0,0,.5)' }}
                      >
                        {attached.map((i, j) => (
                          <span key={i} className="absolute left-1/2 h-2 w-2 -translate-x-1/2 rounded-full" style={{ top: 3 + j * 6, background: CH_COLORS[i], boxShadow: '0 0 2px #000' }} />
                        ))}
                      </button>
                      <span className="text-[8px] text-[#444]">{id === 'comp' ? '⎍' : '⏚'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="absolute bottom-1 left-[62px] text-[8px] text-[#666]">1 MΩ ‖ 13 pF · 300 V RMS CAT II · Eingänge 1–4</div>
          </div>
        </div>
      </div>
      {!power && <div className="pointer-events-none absolute left-[46px] top-[90px] text-[11px] text-white/30">Gerät aus – Netzschalter drücken</div>}
    </div>
  );
}
