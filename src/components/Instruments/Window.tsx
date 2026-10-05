"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Activity, BarChart3, Binary, Gauge, LineChart, Minus, Radio, SlidersHorizontal, SquareActivity, Timer, Waves, Zap } from "lucide-react";
import dynamic from "next/dynamic";
import { spectrum } from "@/lib/sim/fft";
import { InstrumentKind, InstrumentWindow, WINDOW_SPECS, useEditor } from "@/state/editor";
import { DeviceFit, PanelProbe, WindowFitContext, type NaturalMeasure } from "../DeviceFit";
import { IconButton, WINDOW_SHELL, WindowTitleBar } from "../ui";
import { BENCH_PAD, CORNER_CURSOR, CORNER_STYLE, SCREEN_MARGIN, fitWindowSize, resizeRect, type Corner, type Rect, type Size } from "@/lib/windows/geometry";
import { FgScopeLazy, OsziScopeLazy, grid , InspectorBody } from "./shared";
import { FrequencyCounter, Multimeter, Wattmeter } from "./meters";
import { BodePlotter, DistortionAnalyzer, IvAnalyzer, LogicAnalyzer, NetworkAnalyzer, SpectrumAnalyzer } from "./analyzers";
import { LogicConverter, PatternGenerator } from "./sources";

/* ------------------------------------------------------------------ */
/* window chrome + dock                                                */
/* ------------------------------------------------------------------ */
export const TITLE_H = 36;
/** Runde 19 (W34): Sicherheitsnetz statt freiem Verlieren – Titelzeile und eine
 *  Greifbreite bleiben immer im Bild (Nutzer-Entscheidung R19). */
export function clampWindowPos(x: number, y: number, w: number): { x: number; y: number } {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1600;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1000;
  const grab = Math.min(220, Math.max(80, w));
  return {
    x: Math.min(Math.max(x, grab - w), Math.max(0, vw - grab)),
    y: Math.min(Math.max(y, 0), Math.max(0, vh - TITLE_H - 4)),
  };
}

/** Flächen, an denen ein Zug das Fenster verschiebt (Rahmen/Hintergrund) –
 *  Bedienelemente und das Gerät selbst bleiben unangetastet. */
export function isDragSurface(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  return !el.closest(
    "[data-no-drag],button,input,select,textarea,a,canvas,svg,[role='button'],.knob,.knob-wrap,.bnc,.sk-btn,.bezel-btn,.power-btn",
  );
}

/** Runde 19 (W34): Der laufende Fenster-Zug lebt modulweit – ein Zug an einem
 *  gedockten Fenster löst es (Container-Wechsel = React-Mount) und muss danach
 *  weiter am Zeiger kleben. */
/** Runde 19 (W34): Der laufende Fenster-Zug lebt modulweit – ein Zug an einem
 *  gedockten Fenster löst es (Container-Wechsel = React-Mount) und muss danach
 *  weiter am Zeiger kleben. */
let activeDrag: { id: string; x: number; y: number; wx: number; wy: number } | null = null;

/** Runde 21 (W43): Greiffläche der vier Eck-Griffe (oben etwas kleiner, damit
 *  die Titel-Knöpfe frei bleiben). */
export const GRIP_TOP = 14;
export const GRIP_BOTTOM = 18;
export const CORNERS: Corner[] = ["nw", "ne", "sw", "se"];
export const CORNER_ROT: Record<Corner, number> = { nw: 180, ne: 90, sw: 270, se: 0 };

/**
 * Runde 20/21 (W40/W42/W43): **Der** Fenstermanager. Jedes Instrumentenfenster –
 * Oszi, FG-2500 und alle Panels – läuft durch dieselbe Komponente:
 *
 * - Ziehen an Titelzeile und leerem Hintergrund (Transform + rAF, kein Ruckeln),
 * - Skalieren an **vier Ecken** (Geräte proportionsgesperrt, Panels frei),
 * - Docken, Minimieren, Fokus-Ebene, Klemme,
 * - Fenster = sichtbarer Inhalt + Chrome (passt sich knappen Bildschirmen an).
 *
 * Position und Größe laufen während des Ziehens ausschließlich über
 * `transform`/`width`/`height` im DOM; beim Loslassen wird **derselbe** Wert in
 * den Store übernommen. Dadurch gibt es keinen Zwischenframe mit anderer
 * Position („Aufblitzen" nach dem Loslassen, Befund Runde 20).
 */
export function Window({ win }: { win: InstrumentWindow }) {
  // Okt-26: Gezielte Selektoren statt Voll-Abo — vorher renderte jedes Fenster
  // bei JEDEM Store-Update neu (auch Tastatur/Realtime), was Flackern begünstigt.
  const updateInstrument = useEditor((s) => s.updateInstrument);
  const closeInstrument = useEditor((s) => s.closeInstrument);
  const focusInstrument = useEditor((s) => s.focusInstrument);
  const winRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [measure, setMeasure] = useState<NaturalMeasure | null>(null);
  const resize = useRef<{ id: string; rect: Rect; corner: Corner; ratio: number | null; max: Size | null; x: number; y: number } | null>(null);
  const liveSize = useRef<Size | null>(null);
  const livePos = useRef<{ x: number; y: number } | null>(null);

  // Geräte (Oszi, FG-2500) bringen ihr Maß selbst mit; Panels werden gemessen.
  const isDevice = win.kind === "scope" || win.kind === "funcgen";
  const spec = WINDOW_SPECS[win.kind];

  /** Inhalt meldet sein natürliches Maß (Gerät bzw. Panel-Bedarf). */
  const reportNatural = useCallback(
    (size: NaturalMeasure) => {
      const w = isDevice ? size.w : Math.max(size.w, spec.w);
      const h = isDevice ? size.h : Math.max(size.h, spec.h);
      const dispW = isDevice ? size.dispW : w;
      const dispH = isDevice ? size.dispH : h;
      setMeasure((p) =>
        p && p.w === w && p.h === h && p.dispW === dispW && p.dispH === dispH ? p : { w, h, dispW, dispH },
      );
    },
    [isDevice, spec.w, spec.h],
  );

  /**
   * Runde 21 (W42): Fenster = **sichtbarer** Inhalt + Chrome. Wird die
   * Skalierung von der Bildschirmhöhe begrenzt, geht die Breite mit – sonst
   * klaffen links und rechts Lücken neben dem Gehäuse. Sobald der Nutzer selbst
   * an der Größe zieht, fasst der Fit nichts mehr an.
   */
  useLayoutEffect(() => {
    const st = useEditor.getState();
    const w = st.instruments.find((i) => i.id === win.id);
    const el = winRef.current;
    const body = bodyRef.current;
    if (!w || !el || !body || !measure) return;
    const er = el.getBoundingClientRect();
    const br = body.getBoundingClientRect();
    const slack = { w: Math.max(0, er.width - br.width), h: Math.max(0, er.height - br.height) };
    const viewport = {
      w: typeof window !== "undefined" ? window.innerWidth : 1600,
      h: typeof window !== "undefined" ? window.innerHeight : 1000,
    };
    const min = { w: Number(w.config.minW ?? 320), h: Number(w.config.minH ?? 240) };
    // W44: Geräte sitzen auf der Werkbank (schmaler Hintergrund-Rahmen), Panels nicht.
    const pad = isDevice ? BENCH_PAD * 2 : 0;
    const target = fitWindowSize({
      natural: { w: measure.w, h: measure.h },
      disp: { w: measure.dispW, h: measure.dispH },
      slack,
      viewport,
      min,
      pad: pad / 2,
    });
    const maxW = Math.round(Math.min(measure.w + pad + slack.w, viewport.w - SCREEN_MARGIN));
    const maxH = Math.round(Math.min(measure.h + pad + slack.h, viewport.h - SCREEN_MARGIN));
    // Nutzer hat selbst gezogen (Größe ≠ gemerkte Fit-Größe)? Dann nur noch die
    // Grenzen pflegen, nicht mehr nachmessen.
    const touched =
      w.config.deviceFit === 1 &&
      (Math.abs(w.w - Number(w.config.fitWinW ?? 0)) > 2 || Math.abs(w.h - Number(w.config.fitWinH ?? 0)) > 2);
    const nextW = touched ? w.w : target.w;
    const nextH = touched ? w.h : target.h;
    const aspect = isDevice ? maxW / Math.max(maxH, 1) : undefined;
    const unchanged =
      Math.abs(w.w - nextW) <= 2 &&
      Math.abs(w.h - nextH) <= 2 &&
      w.config.deviceFit === 1 &&
      Math.abs(Number(w.config.fitWinW ?? 0) - nextW) <= 2 &&
      Math.abs(Number(w.config.fitWinH ?? 0) - nextH) <= 2 &&
      Math.abs(Number(w.config.fitMaxW ?? 0) - (isDevice ? maxW : 0)) <= 2 &&
      Math.abs(Number(w.config.fitMaxH ?? 0) - (isDevice ? maxH : 0)) <= 2 &&
      Math.abs(Number(w.config.fitAspect ?? 0) - (aspect ?? 0)) <= 0.001;
    if (unchanged) return;
    st.updateInstrument(win.id, {
      w: nextW,
      h: nextH,
      config: {
        ...w.config,
        deviceFit: 1,
        fitWinW: nextW,
        fitWinH: nextH,
        fitMaxW: isDevice ? maxW : undefined,
        fitMaxH: isDevice ? maxH : undefined,
        fitAspect: aspect,
        fitW: measure.w,
        fitH: measure.h,
      },
    });
  });

  // Runde 17/21: Nach jedem Render die Live-Werte wiederherstellen – Store-
  // Updates während des Ziehens dürfen die DOM-Schreibvorgänge nicht zurücksetzen.
  useLayoutEffect(() => {
    const el = winRef.current;
    if (!el) return;
    const s = liveSize.current;
    if (s) {
      el.style.width = s.w + "px";
      el.style.height = s.h + "px";
    }
    const p = livePos.current;
    if (p) el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
  });

  useEffect(() => {
    let raf = 0;
    const live = () => useEditor.getState().instruments.find((i) => i.id === win.id);
    const apply = () => {
      raf = 0;
      const el = winRef.current;
      if (!el) return;
      const p = livePos.current;
      if (p) el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
      const s = liveSize.current;
      if (s) {
        el.style.width = s.w + "px";
        el.style.height = s.h + "px";
      }
    };
    const clearDragFlag = () => {
      const el = winRef.current;
      // Eintritts-Animation („win-in") endgültig abstreifen: Sie ist beim
      // Öffnen längst abgespielt — ließe man sie dran, würde das Lösen von
      // data-windrag sie neu starten (Fenster blinzelt kurz aus und ein).
      el?.classList.remove("win-in");
      // CSS-Schutz erst nach dem nächsten Paint lösen (Commit ist dann sichtbar).
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          winRef.current?.removeAttribute("data-windrag");
        }),
      );
    };
    const up = () => {
      const el = winRef.current;
      // Nur das Fenster, das gerade gezogen wird, committet und räumt auf –
      // die Listener aller Fenster hängen am selben Pointer-Event.
      if (activeDrag?.id === win.id) {
        const p = livePos.current;
        if (p && el) {
          // Endwerte direkt ins DOM schreiben, DANN synchron committen: React
          // schreibt denselben Wert noch vor dem Paint — kein Zwischenframe
          // mit anderer Position („Aufblitzen" nach dem Loslassen).
          el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
          flushSync(() => {
            updateInstrument(win.id, { x: p.x, y: p.y });
          });
        }
        activeDrag = null;
        livePos.current = null;
        clearDragFlag();
      }
      if (resize.current?.id === win.id) {
        const p = livePos.current;
        const size = liveSize.current;
        if (el && size) {
          el.style.width = size.w + "px";
          el.style.height = size.h + "px";
        }
        if (el && p) el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
        flushSync(() => {
          updateInstrument(win.id, { ...(size ?? {}), ...(p ? { x: p.x, y: p.y } : {}) });
        });
        resize.current = null;
        livePos.current = null;
        liveSize.current = null;
        clearDragFlag();
      }
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    const move = (e: PointerEvent) => {
      // Taste schon los (Up ging außerhalb verloren)? Anstandslos beenden,
      // statt dem Zeiger ohne Taste zu folgen (Zombie-Drag).
      if ((activeDrag?.id === win.id || resize.current?.id === win.id) && e.buttons === 0) {
        up();
        return;
      }
      if (activeDrag && activeDrag.id === win.id) {
        // W34: kontinuierlich klemmen – das Fenster kann nicht mehr aus dem
        // Bild rutschen (Rückholhilfe bleibt als zweites Netz bestehen).
        const w = live()?.w ?? 0;
        livePos.current = clampWindowPos(
          activeDrag.wx + e.clientX - activeDrag.x,
          activeDrag.wy + e.clientY - activeDrag.y,
          w,
        );
        if (!raf) raf = requestAnimationFrame(apply);
      }
      const r = resize.current;
      if (r && r.id === win.id) {
        // W43: Vier Ecken, Geräte mit Anker in der Gegenecke und Proportionen.
        const cfg = live()?.config ?? {};
        const res = resizeRect({
          rect: r.rect,
          corner: r.corner,
          dx: e.clientX - r.x,
          dy: e.clientY - r.y,
          aspect: r.ratio,
          min: { w: Number(cfg.minW ?? 320), h: Number(cfg.minH ?? 240) },
          max: r.max,
          viewport: { w: window.innerWidth, h: window.innerHeight },
        });
        livePos.current = { x: res.x, y: res.y };
        liveSize.current = { w: res.w, h: res.h };
        if (!raf) raf = requestAnimationFrame(apply);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [updateInstrument, win.id]);

  /** W34/W133: Zug starten – aus dem Titel oder aus dem leeren Hintergrund. */
  const beginDrag = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const cur = useEditor.getState().instruments.find((i) => i.id === win.id) ?? win;
    activeDrag = { id: win.id, x: e.clientX, y: e.clientY, wx: cur.x, wy: cur.y };
    // Zombie-Status aus abgebrochenen Gesten (Up außerhalb des Fensters) vergessen.
    livePos.current = null;
    liveSize.current = null;
    winRef.current?.setAttribute("data-windrag", "");
  };

  /** W43/W135: Skalieren an einer der vier Ecken starten – Seitenverhältnis
   *  bei allen Messgeräten fest gesperrt (wie im Browser für Oszi/FG). */
  const beginResize = (e: React.PointerEvent, corner: Corner) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = winRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cur = useEditor.getState().instruments.find((i) => i.id === win.id);
    const cfgAspect = Number(cur?.config.fitAspect);
    const localAspect = r.width / Math.max(r.height, 1);
    const keepAspect = win.kind !== "inspector";
    livePos.current = null;
    liveSize.current = null;
    winRef.current?.setAttribute("data-windrag", "");
    resize.current = {
      id: win.id,
      rect: { x: r.left, y: r.top, w: r.width, h: r.height },
      corner,
      // W135: Alle Geräte-Fenster halten streng ihr Seitenverhältnis.
      ratio: keepAspect ? (Number.isFinite(cfgAspect) && cfgAspect > 0 ? cfgAspect : localAspect) : null,
      // Obergrenze ist die Startgröße am Gerät („nur verkleinern"); Panels frei.
      max: isDevice
        ? {
            w: Number(cur?.config.fitMaxW ?? Math.round(r.width)),
            h: Number(cur?.config.fitMaxH ?? Math.round(r.height)),
          }
        : null,
      x: e.clientX,
      y: e.clientY,
    };
  };

  const body = () => {
    switch (win.kind) {
      case "scope":
        return <OsziScopeLazy win={win} />;
      case "dmm":
        return <Multimeter win={win} />;
      case "funcgen":
        return <FgScopeLazy win={win} />;
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
      case "inspector":
        return <InspectorBody />;
      default:
        return null;
    }
  };

  return (
    <WindowFitContext.Provider value={reportNatural}>
      <div
        ref={winRef}
        role="dialog"
        aria-label={win.title}
        className={`win-in pointer-events-auto absolute left-0 top-0 will-change-transform ${WINDOW_SHELL}`}
        style={{
          transform: `translate3d(${win.x}px, ${win.y}px, 0)`,
          width: win.w,
          height: win.minimized ? TITLE_H : win.h,
          zIndex: win.z,
        }}
        onPointerDown={() => focusInstrument(win.id)}
      >
        <WindowTitleBar
          icon={iconFor(win.kind)}
          title={win.title}
          hint="Ziehen (auch am Fensterhintergrund) bewegt das Fenster"
          grab
          onPointerDown={(e) => beginDrag(e)}
          actions={
            <IconButton
              size="sm"
              aria-label={win.minimized ? "Wiederherstellen" : "Minimieren"}
              onClick={() => updateInstrument(win.id, { minimized: !win.minimized })}
            >
              <Minus size={14} />
            </IconButton>
          }
          onClose={() => closeInstrument(win.id)}
        />
        {!win.minimized && (
          <div
            ref={bodyRef}
            className="relative min-h-0 flex-1"
            onPointerDown={(e) => {
              // W34: „überall greifbar" – leere Flächen bewegen das Fenster,
              // Gerät und Bedienelemente behalten ihre eigene Bedienung.
              if (isDragSurface(e.target)) beginDrag(e);
            }}
          >
            {/* W40: Panels melden ihren Höhenbedarf nicht selbst – der Manager
                rendert sie einmal offscreen mit der Entwurfsbreite (PanelProbe
                entfernt sich nach der Messung selbst). Oszi/FG messen im Gerät
                (DeviceFit) und brauchen die Probe nicht. */}
            {!isDevice && win.config.deviceFit !== 1 && (
              <PanelProbe width={spec.w} onMeasure={reportNatural}>
                {body()}
              </PanelProbe>
            )}
            {body()}
          </div>
        )}
        {/* W43: vier Eck-Griffe – Geräte halten ihre Proportionen, Panels sind frei. */}
        {!win.minimized &&
          CORNERS.map((c) => {
            const top = c === "nw" || c === "ne";
            const size = top ? GRIP_TOP : GRIP_BOTTOM;
            return (
              <div
                key={c}
                role="button"
                aria-label="Fenstergröße ziehen"
                data-corner={c}
                data-no-drag
                title="Größe ziehen – Geräte behalten ihre Proportionen, größer als das Gerät geht nicht"
                className="absolute grid place-items-center rounded-md"
                style={{
                  ...CORNER_STYLE[c],
                  width: size,
                  height: size,
                  cursor: CORNER_CURSOR[c],
                  touchAction: "none",
                  zIndex: 5,
                }}
                onPointerDown={(e) => beginResize(e, c)}
              >
                {!top && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 18 18"
                    aria-hidden
                    style={{ transform: `rotate(${CORNER_ROT[c]}deg)`, color: "var(--ink-3)", opacity: 0.8 }}
                  >
                    <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none">
                      <path d="M15 7 L7 15" />
                      <path d="M15 11 L11 15" />
                      <path d="M15 14.5 L14.5 15" />
                    </g>
                  </svg>
                )}
              </div>
            );
          })}
      </div>
    </WindowFitContext.Provider>
  );
}

export function iconFor(kind: InstrumentKind, s = 12) {
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
    case "inspector":
      return <SlidersHorizontal size={s} />;
    default:
      return <Radio size={s} />;
  }
}

