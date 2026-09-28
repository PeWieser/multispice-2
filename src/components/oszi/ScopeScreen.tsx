import { useEffect, useRef } from "react";
// W24: Port aus oszi/ – Signalquelle ist jetzt die Multispice-Engine (sample-Adapter)
import { formatFreq, formatTime, formatVolt } from "./units";

export interface ChannelState {
  enabled: boolean;
  voltsPerDiv: number;
  positionDiv: number; // vertical offset in divisions
  coupling: "DC" | "AC" | "GND";
  color: string;
  probe: number; // 1 or 10
}

export interface TriggerState {
  source: number; // 0 = CH1, 1 = CH2
  level: number; // volts
  edge: "rising" | "falling";
  mode: "auto" | "normal" | "single";
}

export interface ScreenState {
  /** Signalspannung für Kanal ch zur Zeit t (aus der Simulation interpoliert). */
  sample: (ch: number, t: number) => number;
  /** Geschätzte Signalfrequenz des Triggerkanals (Scan-/Messfenster). */
  freqHint: number;
  /** false = kein Signal angeschlossen. */
  active: boolean;
  /** Aktuelle Simulationszeit (Zeitbasis des Bildschirms). */
  simTime: number;
  channels: ChannelState[];
  timePerDiv: number;
  horizPosDiv: number; // horizontal position (divisions)
  trigger: TriggerState;
  running: boolean;
  showMeasure: boolean;
  measureChan: number;
}

const DIV_X = 10;
const DIV_Y = 8;

export interface Measurements {
  vpp: number;
  vmax: number;
  vmin: number;
  vmean: number;
  vrms: number;
  freq: number;
  period: number;
}

interface Props {
  getState: () => ScreenState;
  onMeasure?: (m: Measurements | null) => void;
  onSingleCaptured?: () => void;
}

export function ScopeScreen({ getState, onMeasure, onSingleCaptured }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frozenTRef = useRef(0);
  const lastFrameRef = useRef(0);
  const singleArmedRef = useRef(false);
  const singleCapturedRef = useRef(false);
  const prevRunningRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let raf = 0;
    lastFrameRef.current = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let measTimer = 0;

    const draw = () => {
      const st = getState();
      const rect = canvas.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      const now = performance.now();
      const dt = (now - lastFrameRef.current) / 1000;
      lastFrameRef.current = now;

      // Handle single-shot arming transition
      if (st.trigger.mode === "single") {
        if (!prevRunningRef.current && st.running) {
          singleArmedRef.current = true;
          singleCapturedRef.current = false;
        }
      } else {
        singleArmedRef.current = false;
        singleCapturedRef.current = false;
      }
      prevRunningRef.current = st.running;

      // W24: Zeitbasis = Simulationszeit; Stop/Single friert das Bild ein
      const advancing =
        st.running &&
        !(st.trigger.mode === "single" && singleCapturedRef.current);
      let t: number;
      if (advancing) {
        t = st.simTime;
        frozenTRef.current = t;
      } else {
        t = frozenTRef.current;
      }

      // geometry
      const padL = 8;
      const padR = 8;
      const padT = 8;
      const padB = 8;
      const gx = padL;
      const gy = padT;
      const gw = W - padL - padR;
      const gh = H - padT - padB;
      const divPxX = gw / DIV_X;
      const divPxY = gh / DIV_Y;
      const midX = gx + gw / 2;
      const midY = gy + gh / 2;

      // background CRT
      ctx.clearRect(0, 0, W, H);
      const bg = ctx.createRadialGradient(midX, midY, 20, midX, midY, gw * 0.7);
      bg.addColorStop(0, "#0a1410");
      bg.addColorStop(1, "#04080a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // graticule
      ctx.save();
      ctx.beginPath();
      ctx.rect(gx, gy, gw, gh);
      ctx.clip();

      // minor ticks along center axes
      ctx.strokeStyle = "rgba(90,150,120,0.20)";
      ctx.lineWidth = 1;
      for (let i = 0; i <= DIV_X; i++) {
        const x = gx + i * divPxX;
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.lineTo(x, gy + gh);
        ctx.stroke();
      }
      for (let i = 0; i <= DIV_Y; i++) {
        const y = gy + i * divPxY;
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx + gw, y);
        ctx.stroke();
      }
      // center cross + subdivisions (5 per div)
      ctx.strokeStyle = "rgba(120,190,150,0.5)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(midX, gy);
      ctx.lineTo(midX, gy + gh);
      ctx.moveTo(gx, midY);
      ctx.lineTo(gx + gw, midY);
      ctx.stroke();
      ctx.strokeStyle = "rgba(120,190,150,0.35)";
      ctx.lineWidth = 1;
      const minor = divPxX / 5;
      for (let i = 0; i * minor <= gw; i++) {
        const x = gx + i * minor;
        ctx.beginPath();
        ctx.moveTo(x, midY - 4);
        ctx.lineTo(x, midY + 4);
        ctx.stroke();
      }
      const minorY = divPxY / 5;
      for (let i = 0; i * minorY <= gh; i++) {
        const y = gy + i * minorY;
        ctx.beginPath();
        ctx.moveTo(midX - 4, y);
        ctx.lineTo(midX + 4, y);
        ctx.stroke();
      }
      ctx.restore();

      const window = st.timePerDiv * DIV_X;

      // ---- trigger detection ----
      const trigCh = st.trigger.source;
      const trigChanState = st.channels[trigCh];
      const period = 1 / Math.max(st.freqHint, 1e-9);
      const scanRange = Math.max(window * 1.5, period * 1.3);
      let tTrig = NaN;
      if (st.active && trigChanState.enabled) {
        const steps = 2400;
        const step = scanRange / steps;
        let prevV = st.sample(trigCh, t - scanRange);
        for (let i = 1; i <= steps; i++) {
          const tt = t - scanRange + i * step;
          const v = st.sample(trigCh, tt);
          const lvl = st.trigger.level;
          const crossed =
            st.trigger.edge === "rising"
              ? prevV < lvl && v >= lvl
              : prevV > lvl && v <= lvl;
          if (crossed) tTrig = tt; // keep last (nearest to now)
          prevV = v;
        }
      }

      const triggered = !isNaN(tTrig);
      // In single mode, latch capture on first trigger
      if (st.trigger.mode === "single" && singleArmedRef.current && triggered) {
        singleCapturedRef.current = true;
        singleArmedRef.current = false;
        onSingleCaptured?.();
      }

      // display start time
      const trigScreenDiv = 5 + st.horizPosDiv; // where trigger sits (divs from left)
      let displayStart: number;
      if (triggered) {
        displayStart = tTrig - trigScreenDiv * st.timePerDiv;
      } else {
        // free run (auto) — moving trace
        displayStart = t - window + st.horizPosDiv * st.timePerDiv;
      }

      // helper: coupling mean for AC
      const computeMean = (ch: number) => {
        let s = 0;
        const N = 200;
        for (let i = 0; i < N; i++) {
          s += st.sample(ch, displayStart + (i / N) * window);
        }
        return s / N;
      };

      // ---- draw traces ----
      const samples = Math.max(240, Math.floor(gw));
      st.channels.forEach((chs, ch) => {
        if (!chs.enabled) return;
        const mean = chs.coupling === "AC" ? computeMean(ch) : 0;

        ctx.save();
        ctx.beginPath();
        ctx.rect(gx, gy, gw, gh);
        ctx.clip();

        // glow pass
        const drawPath = () => {
          ctx.beginPath();
          for (let i = 0; i <= samples; i++) {
            const frac = i / samples;
            const tt = displayStart + frac * window;
            let v =
              chs.coupling === "GND" ? 0 : st.sample(ch, tt) - mean;
            // tiny realistic noise
            if (st.running) v += (Math.random() - 0.5) * chs.voltsPerDiv * 0.012;
            const yDiv = v / chs.voltsPerDiv + chs.positionDiv;
            const x = gx + frac * gw;
            const y = midY - yDiv * divPxY;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
        };

        ctx.strokeStyle = chs.color;
        ctx.shadowColor = chs.color;
        ctx.shadowBlur = 12;
        ctx.lineWidth = 3.2;
        ctx.globalAlpha = 0.35;
        drawPath();
        ctx.stroke();

        ctx.shadowBlur = 6;
        ctx.lineWidth = 1.7;
        ctx.globalAlpha = 1;
        drawPath();
        ctx.stroke();
        ctx.restore();

        // ground marker (left arrow)
        const gyPix = midY - chs.positionDiv * divPxY;
        ctx.fillStyle = chs.color;
        ctx.beginPath();
        ctx.moveTo(gx, Math.max(gy, Math.min(gy + gh, gyPix)));
        ctx.lineTo(gx + 9, Math.max(gy, Math.min(gy + gh, gyPix)) - 5);
        ctx.lineTo(gx + 9, Math.max(gy, Math.min(gy + gh, gyPix)) + 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#04080a";
        ctx.font = "bold 8px monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(
          String(ch + 1),
          gx + 4.5,
          Math.max(gy, Math.min(gy + gh, gyPix))
        );
      });

      // trigger level marker (right, orange)
      if (st.channels[trigCh].enabled && st.active) {
        const lvlDiv =
          st.trigger.level / st.channels[trigCh].voltsPerDiv +
          st.channels[trigCh].positionDiv;
        const ly = midY - lvlDiv * divPxY;
        const cy = Math.max(gy, Math.min(gy + gh, ly));
        ctx.fillStyle = "#ff9d2e";
        ctx.beginPath();
        ctx.moveTo(gx + gw, cy);
        ctx.lineTo(gx + gw - 9, cy - 5);
        ctx.lineTo(gx + gw - 9, cy + 5);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = "#000";
        ctx.font = "bold 8px monospace";
        ctx.fillText("T", gx + gw - 4.5, cy);
      }

      // trigger position marker (top)
      const tpx = gx + trigScreenDiv * divPxX;
      if (tpx >= gx && tpx <= gx + gw) {
        ctx.fillStyle = "#ff9d2e";
        ctx.beginPath();
        ctx.moveTo(tpx, gy);
        ctx.lineTo(tpx - 5, gy - 0);
        ctx.lineTo(tpx, gy + 7);
        ctx.lineTo(tpx + 5, gy);
        ctx.closePath();
        ctx.fill();
      }

      // status text top-left
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = "bold 11px monospace";
      ctx.fillStyle = triggered ? "#7ddc4b" : "#ffcf4b";
      const stat = !st.running
        ? "Stop"
        : st.trigger.mode === "single"
          ? singleCapturedRef.current
            ? "Stop (Single)"
            : "Ready"
          : triggered
            ? "Trig'd"
            : "Auto";
      ctx.fillText(stat, gx + 14, gy + 3);

      // vignette / scanline overlay for CRT feel
      ctx.fillStyle = "rgba(120,255,180,0.02)";
      for (let y = gy; y < gy + gh; y += 3) {
        ctx.fillRect(gx, y, gw, 1);
      }

      // ---- measurements (throttled) ----
      measTimer += dt;
      if (measTimer > 0.15) {
        measTimer = 0;
        if (st.showMeasure && st.active) {
          const ch = st.measureChan;
          if (st.channels[ch].enabled) {
            const N = 1600;
            const span = period * 3;
            let vmax = -Infinity,
              vmin = Infinity,
              sum = 0,
              sumsq = 0;
            for (let i = 0; i < N; i++) {
              const v = st.sample(ch, t - span + (i / N) * span);
              vmax = Math.max(vmax, v);
              vmin = Math.min(vmin, v);
              sum += v;
              sumsq += v * v;
            }
            const mean = sum / N;
            // Frequenz aus den Daten schätzen (Nulldurchgänge um die Mitte)
            const mid = (vmax + vmin) / 2;
            let crossings = 0;
            let prevBelow: boolean | null = null;
            for (let i = 0; i < N; i++) {
              const v = st.sample(ch, t - span + (i / N) * span);
              const below = v < mid;
              if (prevBelow !== null && !below && prevBelow) crossings++;
              prevBelow = below;
            }
            const freqEst = crossings >= 2 ? crossings / span : st.freqHint;
            onMeasure?.({
              vpp: vmax - vmin,
              vmax,
              vmin,
              vmean: mean,
              vrms: Math.sqrt(sumsq / N),
              freq: freqEst,
              period: 1 / Math.max(freqEst, 1e-9),
            });
          } else onMeasure?.(null);
        } else onMeasure?.(null);
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="h-full w-full rounded-[3px]"
      style={{ display: "block" }}
    />
  );
}

// expose formatters for reuse
export { formatVolt, formatTime, formatFreq };
