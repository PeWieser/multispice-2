import type { Acq, MeasResult } from './engine';
import { HDIV, NPTS, VDIV, counterFreq, fftDb, mathTrace, measure } from './engine';
import type { RefWave, Settings } from './types';
import { CH_COLORS, MATH_COLOR, MEAS_TYPES, REF_COLORS, TRIG_COLOR, fmt } from './types';
import type { StatEntry, AcqStatus } from './engine';

export const W = 800;
export const H = 480;
export const GX = 25;
export const GY = 28;
export const D = 50;
export const GW = HDIV * D;
export const GH = VDIV * D;
export const MENU_X = 642;
export const SLOT_H = GH / 6;

export interface Rect { x: number; y: number; w: number; h: number }
export const MAIN: Rect = { x: GX, y: GY, w: GW, h: GH };
export const OVERVIEW: Rect = { x: GX, y: GY, w: GW, h: 118 };
export const ZOOMR: Rect = { x: GX, y: GY + 126, w: GW, h: GH - 126 };

export interface MenuItemView { label: string; value?: string; knob?: boolean; active?: boolean; disabled?: boolean }

export interface RenderInput {
  s: Settings;
  acq: Acq | null;
  zoomAcq: Acq | null;
  refs: (RefWave | null)[];
  status: AcqStatus;
  wall: number;
  message: { text: string; until: number } | null;
  menuTitle: string | null;
  menuItems: MenuItemView[];
  lastLevelChange: number;
  stats: Map<string, StatEntry>;
  avgN: number;
  calib: number | null; // 0..1
  info: boolean;
}

const FONT = (px: number, w = 600) => `${w} ${px}px "Segoe UI", Arial, Helvetica, sans-serif`;

// ---------- graticule ----------
export function drawGraticule(ctx: CanvasRenderingContext2D, r: Rect, type: Settings['display']['graticule'], hdiv = HDIV, vdiv = VDIV) {
  const dx = r.w / hdiv, dy = r.h / vdiv;
  ctx.save();
  ctx.strokeStyle = 'rgba(150,150,150,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  if (type === 'frame') { ctx.restore(); return; }
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ctx.fillStyle = 'rgba(140,140,140,0.55)';
  if (type === 'full' || type === 'grid') {
    // dotted grid
    for (let i = 1; i < hdiv; i++) {
      const x = Math.round(r.x + i * dx);
      for (let y = r.y; y < r.y + r.h; y += dy / 5) ctx.fillRect(x, Math.round(y), 1, 1);
    }
    for (let j = 1; j < vdiv; j++) {
      const y = Math.round(r.y + j * dy);
      for (let x = r.x; x < r.x + r.w; x += dx / 5) ctx.fillRect(Math.round(x), y, 1, 1);
    }
  }
  if (type === 'full' || type === 'cross') {
    ctx.strokeStyle = 'rgba(150,150,150,0.5)';
    ctx.beginPath();
    ctx.moveTo(r.x, Math.round(cy) + 0.5); ctx.lineTo(r.x + r.w, Math.round(cy) + 0.5);
    ctx.moveTo(Math.round(cx) + 0.5, r.y); ctx.lineTo(Math.round(cx) + 0.5, r.y + r.h);
    ctx.stroke();
    // minor ticks
    for (let x = r.x; x <= r.x + r.w; x += dx / 5) { ctx.fillRect(Math.round(x), Math.round(cy) - 3, 1, 7); }
    for (let y = r.y; y <= r.y + r.h; y += dy / 5) { ctx.fillRect(Math.round(cx) - 3, Math.round(y), 7, 1); }
    // edge ticks
    for (let x = r.x; x <= r.x + r.w; x += dx / 5) { ctx.fillRect(Math.round(x), r.y, 1, 4); ctx.fillRect(Math.round(x), r.y + r.h - 4, 1, 4); }
    for (let y = r.y; y <= r.y + r.h; y += dy / 5) { ctx.fillRect(r.x, Math.round(y), 4, 1); ctx.fillRect(r.x + r.w - 4, Math.round(y), 4, 1); }
  }
  ctx.restore();
}

// ---------- traces ----------
function traceAlpha(s: Settings) { return 0.35 + 0.65 * (s.display.intensity / 100); }

export function drawTrace(
  ctx: CanvasRenderingContext2D, r: Rect, d: ArrayLike<number>, vdiv: number, pos: number, color: string,
  s: Settings, i0 = 0, i1 = d.length - 1,
) {
  const dy = r.h / VDIV;
  const cy = r.y + r.h / 2;
  const n = i1 - i0;
  if (n <= 0) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.globalAlpha = traceAlpha(s);
  const X = (i: number) => r.x + ((i - i0) / n) * r.w;
  const Y = (v: number) => cy - (v / vdiv + pos) * dy;
  if (s.display.dots) {
    ctx.fillStyle = color;
    for (let i = Math.max(0, Math.floor(i0)); i <= Math.min(d.length - 1, Math.ceil(i1)); i++) ctx.fillRect(X(i) - 0.8, Y(d[i]) - 0.8, 1.8, 1.8);
  } else {
    const path = new Path2D();
    let first = true;
    const a = Math.max(0, Math.floor(i0)), b = Math.min(d.length - 1, Math.ceil(i1));
    for (let i = a; i <= b; i++) {
      const x = X(i), y = Y(d[i]);
      if (first) { path.moveTo(x, y); first = false; } else path.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    ctx.globalAlpha = traceAlpha(s) * 0.25;
    ctx.lineWidth = 4;
    ctx.stroke(path);
    ctx.globalAlpha = traceAlpha(s);
    ctx.lineWidth = 1.4;
    ctx.stroke(path);
  }
  ctx.restore();
}

function drawEnvelope(ctx: CanvasRenderingContext2D, r: Rect, mn: Float32Array, mx: Float32Array, vdiv: number, pos: number, color: string, s: Settings) {
  const dy = r.h / VDIV, cy = r.y + r.h / 2;
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.globalAlpha = traceAlpha(s);
  ctx.fillStyle = color;
  const n = mn.length - 1;
  for (let i = 0; i <= n; i++) {
    const x = r.x + (i / n) * r.w;
    const y1 = cy - (mx[i] / vdiv + pos) * dy, y2 = cy - (mn[i] / vdiv + pos) * dy;
    ctx.fillRect(x - 0.4, y1 - 0.6, 1.1, Math.max(1.2, y2 - y1 + 1.2));
  }
  ctx.restore();
}

function drawAcqTraces(ctx: CanvasRenderingContext2D, r: Rect, a: Acq, s: Settings, refs: (RefWave | null)[], i0 = 0, i1 = NPTS - 1) {
  // refs
  refs.forEach((rf, k) => {
    if (rf && s.refShow[k]) drawTrace(ctx, r, rf.divs, 1, 0, REF_COLORS[k], s, i0, i1);
  });
  const showCh = (ch: number) => s.ch[ch].on && !(s.fft.on && !s.fft.showSource && s.fft.source === ch);
  for (let ch = 3; ch >= 0; ch--) {
    if (!showCh(ch)) continue;
    const c = s.ch[ch];
    if (s.acq.mode === 'peak' && a.min[ch] && a.max[ch] && i0 === 0 && i1 === NPTS - 1) drawEnvelope(ctx, r, a.min[ch]!, a.max[ch]!, c.vdiv, c.pos, CH_COLORS[ch], s);
    else drawTrace(ctx, r, a.data[ch], c.vdiv, c.pos, CH_COLORS[ch], s, i0, i1);
  }
  if (s.math.on) drawTrace(ctx, r, mathTrace(s, a), s.math.vdiv, s.math.pos, MATH_COLOR, s, i0, i1);
}

function drawXY(ctx: CanvasRenderingContext2D, a: Acq, s: Settings) {
  const r = MAIN;
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  const c1 = s.ch[0], c2 = s.ch[1];
  const X = a.data[0], Y = a.data[1];
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.globalAlpha = traceAlpha(s);
  ctx.strokeStyle = CH_COLORS[0];
  ctx.fillStyle = CH_COLORS[0];
  if (s.display.dots) {
    for (let i = 0; i < NPTS; i++) ctx.fillRect(cx + (X[i] / c1.vdiv + c1.pos) * D - 0.8, cy - (Y[i] / c2.vdiv + c2.pos) * D - 0.8, 1.8, 1.8);
  } else {
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < NPTS; i++) {
      const x = cx + (X[i] / c1.vdiv + c1.pos) * D, y = cy - (Y[i] / c2.vdiv + c2.pos) * D;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function drawFFT(ctx: CanvasRenderingContext2D, a: Acq, s: Settings) {
  const src = s.fft.source === 4 ? mathTrace(s, a) : a.data[s.fft.source];
  const db = fftDb(src, s.fft.window);
  const r = MAIN;
  const nBins = Math.floor(db.length / s.fft.zoom);
  ctx.save();
  ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); ctx.clip();
  ctx.strokeStyle = MATH_COLOR;
  ctx.globalAlpha = traceAlpha(s);
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let k = 0; k < nBins; k++) {
    const x = r.x + (k / (nBins - 1)) * r.w;
    const y = r.y + ((s.fft.level - db[k]) / s.fft.dbdiv) * D;
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  ctx.restore();
}

/** Draw all waveform content into (layer) ctx */
export function drawWaves(ctx: CanvasRenderingContext2D, inp: RenderInput) {
  const { s, acq } = inp;
  if (!acq) return;
  if (s.acq.xy) { drawXY(ctx, acq, s); return; }
  if (s.zoom.on) {
    drawAcqTraces(ctx, OVERVIEW, acq, s, inp.refs);
    if (inp.zoomAcq) drawAcqTraces(ctx, ZOOMR, inp.zoomAcq, s, []);
  } else {
    drawAcqTraces(ctx, MAIN, acq, s, inp.refs);
  }
  if (s.fft.on) drawFFT(ctx, acq, s);
}

// ---------- helpers ----------
function badge(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, bg: string, text: string, fg = '#000') {
  ctx.fillStyle = bg;
  roundRect(ctx, x, y, w, h, 3); ctx.fill();
  ctx.fillStyle = fg;
  ctx.font = FONT(11, 700);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x + w / 2, y + h / 2 + 0.5);
  ctx.textAlign = 'left';
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function slopeIcon(ctx: CanvasRenderingContext2D, x: number, y: number, slope: Settings['trig']['slope'], color: string) {
  ctx.save();
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (slope === 'rise') { ctx.moveTo(x, y + 5); ctx.lineTo(x + 4, y + 5); ctx.lineTo(x + 7, y - 5); ctx.lineTo(x + 11, y - 5); }
  else if (slope === 'fall') { ctx.moveTo(x, y - 5); ctx.lineTo(x + 4, y - 5); ctx.lineTo(x + 7, y + 5); ctx.lineTo(x + 11, y + 5); }
  else { ctx.moveTo(x, y + 5); ctx.lineTo(x + 5, y - 5); ctx.lineTo(x + 10, y + 5); }
  ctx.stroke();
  ctx.restore();
}

export function srcData(a: Acq, s: Settings, src: number): Float32Array | null {
  if (src === 4) return s.math.on ? mathTrace(s, a) : null;
  return a.data[src] ?? null;
}
export function srcName(src: number) { return src === 4 ? 'MATH' : `CH${src + 1}`; }
export function srcColor(src: number) { return src === 4 ? MATH_COLOR : CH_COLORS[src]; }
export function srcScale(s: Settings, src: number) { return src === 4 ? { vdiv: s.math.vdiv, pos: s.math.pos } : { vdiv: s.ch[src].vdiv, pos: s.ch[src].pos }; }

export function searchMarks(a: Acq | null, s: Settings): number[] {
  if (!a || !s.search.on) return [];
  const d = a.data[s.search.src];
  const L = s.search.level;
  const out: number[] = [];
  let last = -1e9;
  for (let i = 1; i < d.length; i++) {
    const r = d[i - 1] < L && d[i] >= L, f = d[i - 1] > L && d[i] <= L;
    if ((s.search.slope === 'rise' && r) || (s.search.slope === 'fall' && f)) {
      if (i - last > 6) out.push(a.t0 + i * a.dt);
      last = i;
    }
  }
  return out;
}

// ---------- overlay ----------
export function drawOverlay(ctx: CanvasRenderingContext2D, inp: RenderInput) {
  const { s, acq } = inp;
  const r = s.zoom.on && !s.acq.xy ? ZOOMR : MAIN;
  const dyMain = r.h / VDIV;
  const cyR = r.y + r.h / 2;

  // zoom box on overview
  if (s.zoom.on && !s.acq.xy) {
    const zw = GW / s.zoom.factor;
    const zx = GX + GW / 2 + s.zoom.pos * D - zw / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(zx, OVERVIEW.y, zw, OVERVIEW.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(zx + 0.5, OVERVIEW.y + 0.5, zw, OVERVIEW.h - 1);
    ctx.restore();
    ctx.fillStyle = '#ccc'; ctx.font = FONT(11);
    ctx.fillText(`Zoom ×${s.zoom.factor}  ${fmt(s.tdiv / s.zoom.factor, 's')}/div`, ZOOMR.x + 6, ZOOMR.y + 14);
  }

  // ground markers
  if (!s.acq.xy) {
    const markers: { y: number; color: string; label: string }[] = [];
    for (let ch = 0; ch < 4; ch++) if (s.ch[ch].on) markers.push({ y: cyR - s.ch[ch].pos * dyMain, color: CH_COLORS[ch], label: String(ch + 1) });
    if (s.math.on) markers.push({ y: cyR - s.math.pos * dyMain, color: MATH_COLOR, label: 'M' });
    for (const m of markers) {
      const y = Math.max(r.y + 6, Math.min(r.y + r.h - 6, m.y));
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.moveTo(2, y - 7); ctx.lineTo(16, y - 7); ctx.lineTo(23, y); ctx.lineTo(16, y + 7); ctx.lineTo(2, y + 7); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = FONT(11, 800); ctx.textBaseline = 'middle';
      ctx.fillText(m.label, 6, y + 0.5);
      if (m.y < r.y || m.y > r.y + r.h) {
        ctx.fillStyle = m.color;
        ctx.beginPath();
        const up = m.y < r.y;
        ctx.moveTo(8, up ? y - 12 : y + 12); ctx.lineTo(4, up ? y - 8 : y + 8); ctx.lineTo(12, up ? y - 8 : y + 8); ctx.fill();
      }
    }

    // trigger level marker
    if (s.trig.source < 4 && s.ch[s.trig.source]) {
      const tc = s.ch[s.trig.source];
      const yl = cyR - (s.trig.level / tc.vdiv + tc.pos) * dyMain;
      const y = Math.max(r.y + 6, Math.min(r.y + r.h - 6, yl));
      ctx.fillStyle = tc.on ? CH_COLORS[s.trig.source] : TRIG_COLOR;
      ctx.beginPath();
      ctx.moveTo(W - 2, y - 7); ctx.lineTo(W - 14, y - 7); ctx.lineTo(W - 22, y); ctx.lineTo(W - 14, y + 7); ctx.lineTo(W - 2, y + 7); ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#000'; ctx.font = FONT(10, 800); ctx.fillText('T', W - 12, y + 0.5);
      if (inp.wall - inp.lastLevelChange < 1.8) {
        ctx.save();
        ctx.strokeStyle = TRIG_COLOR; ctx.globalAlpha = 0.9; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(r.x, yl); ctx.lineTo(r.x + r.w, yl); ctx.stroke();
        ctx.restore();
      }
    }

    // trigger position marker
    const trX = GX + GW / 2 - (s.hDelay / s.tdiv) * D;
    const tx = Math.max(GX + 6, Math.min(GX + GW - 6, trX));
    ctx.fillStyle = TRIG_COLOR;
    ctx.beginPath();
    ctx.moveTo(tx - 7, GY - 1 - 14); ctx.lineTo(tx + 7, GY - 1 - 14); ctx.lineTo(tx + 7, GY - 6); ctx.lineTo(tx, GY - 1); ctx.lineTo(tx - 7, GY - 6); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#000'; ctx.font = FONT(10, 800); ctx.textAlign = 'center';
    ctx.fillText(trX < GX ? '◂' : trX > GX + GW ? '▸' : 'T', tx, GY - 8);
    ctx.textAlign = 'left';

    // search marks
    const marks = searchMarks(acq, s);
    const all = [...marks.map((t) => ({ t, user: false })), ...s.search.marks.map((t) => ({ t, user: true }))];
    for (const m of all) {
      const x = GX + GW / 2 + ((m.t - s.hDelay) / s.tdiv) * D;
      if (x < GX || x > GX + GW) continue;
      ctx.beginPath();
      ctx.moveTo(x - 5, GY + 1); ctx.lineTo(x + 5, GY + 1); ctx.lineTo(x, GY + 9); ctx.closePath();
      if (m.user) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke(); } else { ctx.fillStyle = '#fff'; ctx.fill(); }
    }
  }

  // cursors
  if (s.cursor.mode !== 'off' && acq && !s.acq.xy) drawCursors(ctx, inp);

  // FFT readout
  if (s.fft.on && acq) {
    const fs = 1 / acq.dt;
    const span = fs / 2 / s.fft.zoom;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(GX + GW - 250, GY + 4, 244, 34);
    ctx.fillStyle = MATH_COLOR; ctx.font = FONT(11);
    ctx.fillText(`FFT ${srcName(s.fft.source)}  ${s.fft.dbdiv} dB/div   Ref ${s.fft.level} dBV`, GX + GW - 244, GY + 16);
    ctx.fillText(`${fmt(span / HDIV, 'Hz')}/div   0 … ${fmt(span, 'Hz')}  (${winName(s.fft.window)})`, GX + GW - 244, GY + 31);
  }

  // measurements
  drawMeasurements(ctx, inp);

  // math/ref readouts
  {
    const items: { color: string; text: string }[] = [];
    if (s.math.on) items.push({ color: MATH_COLOR, text: `M  ${srcName(s.math.a)}${s.math.op === '*' ? '×' : s.math.op}${srcName(s.math.b)}  ${fmt(s.math.vdiv, s.math.op === '*' ? 'V²' : 'V')}` });
    inp.refs.forEach((rf, k) => { if (rf && s.refShow[k]) items.push({ color: REF_COLORS[k], text: `R${k + 1}  ${rf.label}  ${fmt(rf.vdiv, 'V')} ${fmt(rf.tdiv, 's')}` }); });
    let y = GY + GH - 8;
    ctx.font = FONT(11);
    for (const it of items) {
      const w = ctx.measureText(it.text).width + 12;
      const x = (s.menu ? MENU_X - 8 : GX + GW - 6) - w;
      ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(x, y - 13, w, 16);
      ctx.fillStyle = it.color; ctx.fillText(it.text, x + 6, y - 1);
      y -= 18;
    }
  }

  drawStatusBar(ctx, inp);
  drawBottomBar(ctx, inp);
  if (s.menu) drawMenu(ctx, inp);

  // info / calibration / messages
  if (inp.calib !== null) {
    centerBox(ctx, 'Selbstkalibrierung läuft …', 'Bitte alle Tastköpfe abklemmen', inp.calib);
  } else if (inp.info) {
    centerBox(ctx, 'OSZITRON OTX2074  ·  70 MHz  ·  1 GS/s', 'Firmware v2.14.7  ·  SN C010472  ·  4 Kanäle  ·  2000 Punkte', null);
  }
  if (inp.message && inp.message.until > inp.wall) {
    ctx.font = FONT(13);
    const w = ctx.measureText(inp.message.text).width + 36;
    const x = GX + GW / 2 - w / 2, y = GY + GH - 70;
    ctx.fillStyle = 'rgba(20,40,90,0.92)';
    roundRect(ctx, x, y, w, 30, 5); ctx.fill();
    ctx.strokeStyle = '#6d9cff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
    ctx.fillText(inp.message.text, x + 18, y + 15.5);
  }
}

function winName(w: string) { return w === 'hann' ? 'Hanning' : w === 'rect' ? 'Rechteck' : w === 'hamming' ? 'Hamming' : 'Blackman'; }

function centerBox(ctx: CanvasRenderingContext2D, t1: string, t2: string, progress: number | null) {
  const w = 440, h = progress !== null ? 96 : 74;
  const x = GX + GW / 2 - w / 2, y = GY + GH / 2 - h / 2;
  ctx.fillStyle = 'rgba(15,30,70,0.95)';
  roundRect(ctx, x, y, w, h, 6); ctx.fill();
  ctx.strokeStyle = '#6d9cff'; ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = FONT(14); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(t1, x + w / 2, y + 24);
  ctx.font = FONT(12, 400); ctx.fillStyle = '#c9d6ff';
  ctx.fillText(t2, x + w / 2, y + 48);
  if (progress !== null) {
    ctx.fillStyle = '#223';
    ctx.fillRect(x + 30, y + 66, w - 60, 12);
    ctx.fillStyle = '#6dff8a';
    ctx.fillRect(x + 30, y + 66, (w - 60) * progress, 12);
  }
  ctx.textAlign = 'left';
}

function drawCursors(ctx: CanvasRenderingContext2D, inp: RenderInput) {
  const { s, acq } = inp;
  if (!acq) return;
  const c = s.cursor;
  const col = srcColor(c.src);
  const { vdiv, pos } = srcScale(s, c.src);
  const data = srcData(acq, s, c.src);
  const cx = GX + GW / 2, cy = GY + GH / 2;
  const showT = c.mode === 'time' || c.mode === 'both';
  const showV = c.mode === 'amp' || c.mode === 'both';
  const selA = c.sel === 'a' || c.sel === 'ab' || c.sel === 'ta';
  const selB = c.sel === 'b' || c.sel === 'ab' || c.sel === 'tb';
  const selVA = c.mode === 'amp' ? selA : c.sel === 'va';
  const selVB = c.mode === 'amp' ? selB : c.sel === 'vb';
  const selTA = c.mode === 'time' ? selA : c.sel === 'ta';
  const selTB = c.mode === 'time' ? selB : c.sel === 'tb';
  ctx.save();
  ctx.strokeStyle = col;
  ctx.lineWidth = 1;
  const line = (x1: number, y1: number, x2: number, y2: number, solid: boolean) => {
    ctx.setLineDash(solid ? [] : [5, 4]);
    ctx.globalAlpha = solid ? 1 : 0.75;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  };
  const valAt = (divX: number) => {
    if (!data) return NaN;
    const i = Math.round(((divX + HDIV / 2) / HDIV) * (NPTS - 1));
    return i >= 0 && i < NPTS ? data[i] : NaN;
  };
  const lines: string[] = [];
  if (showT) {
    const xa = cx + c.ta * D, xb = cx + c.tb * D;
    line(xa, GY, xa, GY + GH, selTA);
    line(xb, GY, xb, GY + GH, selTB);
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.font = FONT(10, 800);
    ctx.fillText('a', xa + 3, GY + GH - 5); ctx.fillText('b', xb + 3, GY + GH - 5);
    const ta = c.ta * s.tdiv + s.hDelay, tb = c.tb * s.tdiv + s.hDelay;
    const dt = tb - ta;
    lines.push(`a: ${fmt(ta, 's')}  ${fmt(valAt(c.ta), 'V')}`);
    lines.push(`b: ${fmt(tb, 's')}  ${fmt(valAt(c.tb), 'V')}`);
    lines.push(`Δt: ${fmt(dt, 's')}   1/Δt: ${fmt(1 / Math.abs(dt), 'Hz')}`);
    if (!showV) lines.push(`ΔV: ${fmt(valAt(c.tb) - valAt(c.ta), 'V')}`);
  }
  if (showV) {
    const ya = cy - c.va * D, yb = cy - c.vb * D;
    line(GX, ya, GX + GW, ya, selVA);
    line(GX, yb, GX + GW, yb, selVB);
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.fillStyle = col; ctx.font = FONT(10, 800);
    ctx.fillText('a', GX + 4, ya - 3); ctx.fillText('b', GX + 4, yb - 3);
    const va = (c.va - pos) * vdiv, vb = (c.vb - pos) * vdiv;
    lines.push(`a: ${fmt(va, 'V')}   b: ${fmt(vb, 'V')}`);
    lines.push(`ΔV: ${fmt(vb - va, 'V')}`);
  }
  ctx.restore();
  // readout box
  ctx.font = FONT(11);
  const w = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 16;
  const x = GX + 6, y = GY + 14;
  ctx.fillStyle = 'rgba(0,0,0,0.72)';
  ctx.fillRect(x, y, w, lines.length * 15 + 20);
  ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.strokeRect(x + 0.5, y + 0.5, w, lines.length * 15 + 20);
  ctx.fillStyle = col; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`Cursor ${srcName(c.src)}`, x + 8, y + 14);
  ctx.fillStyle = '#eee';
  lines.forEach((l, i) => ctx.fillText(l, x + 8, y + 30 + i * 15));
}

// W32d: Messwerte aktualisieren wie am echten Gerät in Ruhe (~3 Hz) – die
// Zahlen bleiben ruhig lesbar, während das Bild lebt. Schlüssel = Zeilenindex,
// ungültig bei geändertem Typ/Quelle.
const measHold = new Map<string, { res: MeasResult; t: number; key: string }>();

function drawMeasurements(ctx: CanvasRenderingContext2D, inp: RenderInput) {
  const { s, acq } = inp;
  if (!acq || s.meas.list.length === 0) return;
  const rowH = 17;
  const stats = s.meas.stats;
  const w = stats ? 520 : 250;
  const h = s.meas.list.length * rowH + (stats ? rowH + 4 : 6);
  const x = GX + 4, y = GY + GH - h - 4;
  ctx.fillStyle = 'rgba(8,12,22,0.82)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  ctx.font = FONT(11); ctx.textBaseline = 'middle';
  let yy = y + 3;
  if (stats) {
    ctx.fillStyle = '#aaa';
    ctx.fillText('Wert', x + 150, yy + rowH / 2); ctx.fillText('Mittel', x + 240, yy + rowH / 2);
    ctx.fillText('Min', x + 330, yy + rowH / 2); ctx.fillText('Max', x + 410, yy + rowH / 2); ctx.fillText('n', x + 485, yy + rowH / 2);
    yy += rowH;
  }
  s.meas.list.forEach((m, idx) => {
    const d = srcData(acq, s, m.src);
    const hkey = String(idx);
    const mkey = `${m.type}:${m.src}`;
    const held = measHold.get(hkey);
    let res: MeasResult;
    if (!held || held.key !== mkey || inp.wall - held.t > 0.333) {
      res = measure(m.type, d, acq.dt);
      measHold.set(hkey, { res, t: inp.wall, key: mkey });
    } else res = held.res;
    const col = srcColor(m.src);
    badge(ctx, x + 4, yy + 2, 38, rowH - 3, col, srcName(m.src).replace('CH', 'CH'), '#000');
    ctx.font = FONT(11); ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ddd';
    ctx.fillText(MEAS_TYPES.find((t) => t.id === m.type)!.label, x + 48, yy + rowH / 2 + 1);
    ctx.fillStyle = '#fff';
    const val = res.unit === '%' ? (isFinite(res.value) ? res.value.toFixed(2) + '%' : '?') : fmt(res.value, res.unit, 4);
    ctx.fillText(val, x + (stats ? 150 : 170), yy + rowH / 2 + 1);
    if (stats) {
      const st = inp.stats.get(`${idx}:${m.type}:${m.src}`);
      const f = (v: number) => (res.unit === '%' ? (isFinite(v) ? v.toFixed(2) + '%' : '?') : fmt(v, res.unit, 4));
      if (st && st.n > 0) {
        ctx.fillStyle = '#ccc';
        ctx.fillText(f(st.sum / st.n), x + 240, yy + rowH / 2 + 1);
        ctx.fillText(f(st.min), x + 330, yy + rowH / 2 + 1);
        ctx.fillText(f(st.max), x + 410, yy + rowH / 2 + 1);
        ctx.fillText(String(st.n), x + 485, yy + rowH / 2 + 1);
      }
    }
    yy += rowH;
  });
}

function drawStatusBar(ctx: CanvasRenderingContext2D, inp: RenderInput) {
  const { s } = inp;
  const g = ctx.createLinearGradient(0, 0, 0, 24);
  g.addColorStop(0, '#1c2433'); g.addColorStop(1, '#10151f');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, 24);
  // logo
  ctx.fillStyle = '#e8e8e8';
  ctx.font = 'italic 800 14px Arial';
  ctx.textBaseline = 'middle';
  ctx.fillText('Otx', 8, 12);
  // run state
  const st = inp.status;
  const map: Record<string, [string, string]> = {
    run: ['Getrg', '#5bff7a'], 'trig?': ['Trig?', '#ffb03a'], auto: ['Auto', '#ffd84a'], stop: ['Stopp', '#ff4a4a'], roll: ['Roll', '#5bff7a'], ready: ['Bereit', '#ffb03a'],
  };
  const [label, col] = map[st];
  ctx.font = FONT(12, 700);
  ctx.fillStyle = col;
  ctx.fillText(label, 46, 12);
  ctx.fillStyle = '#bbb'; ctx.font = FONT(11, 500);
  const acqLabel = s.acq.mode === 'sample' ? 'Abtastung' : s.acq.mode === 'peak' ? 'Spitzenwert' : s.acq.mode === 'hires' ? 'Hohe Aufl.' : `Mittelw. ${inp.avgN}/${s.acq.avgCount}`;
  ctx.fillText(acqLabel, 96, 12);
  if (s.run === 'single') { ctx.fillStyle = '#ffb03a'; ctx.fillText('Einzel', 186, 12); }

  // record bar
  const bx = 250, bw = 280;
  ctx.strokeStyle = '#8a8a8a'; ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, 7.5, bw, 9);
  const frac = Math.max(0, Math.min(1, 0.5 + s.hDelay / (HDIV * s.tdiv * 4)));
  const win = bw / 4;
  ctx.fillStyle = 'rgba(230,230,230,0.35)';
  ctx.fillRect(bx + frac * (bw - win), 8, win, 9);
  ctx.fillStyle = TRIG_COLOR;
  const tpos = bx + bw / 2;
  ctx.beginPath(); ctx.moveTo(tpos - 4, 4); ctx.lineTo(tpos + 4, 4); ctx.lineTo(tpos, 10); ctx.fill();
  if (s.zoom.on) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx + frac * (bw - win) + win / 2 + (s.zoom.pos / HDIV) * win - win / s.zoom.factor / 2, 18, Math.max(2, win / s.zoom.factor), 3);
  } else {
    // W32d: Pre-/Post-Trigger-Zeiten sichtbar am Datenspeicher-Balken.
    const span = HDIV * s.tdiv;
    ctx.fillStyle = '#8fa0b8'; ctx.font = FONT(9.5, 500);
    ctx.fillText(`Pre ${fmt(Math.max(0, span / 2 - s.hDelay), 's')} · Post ${fmt(Math.max(0, span / 2 + s.hDelay), 's')}`, bx, 24);
  }
  // menu title
  if (s.menu && inp.menuTitle) {
    ctx.fillStyle = '#2a4f9e';
    ctx.fillRect(MENU_X, 2, W - MENU_X - 2, 20);
    ctx.fillStyle = '#fff'; ctx.font = FONT(12, 700); ctx.textAlign = 'center';
    ctx.fillText(inp.menuTitle, (MENU_X + W) / 2, 12.5);
    ctx.textAlign = 'left';
  } else {
    ctx.fillStyle = '#9ab'; ctx.font = FONT(11, 500);
    ctx.fillText(s.acq.xy ? 'XY-Modus' : `${s.fineMode ? 'Fein  ' : ''}`, 560, 12);
  }
}

function drawBottomBar(ctx: CanvasRenderingContext2D, inp: RenderInput) {
  const { s, acq } = inp;
  const y0 = GY + GH + 1;
  const g = ctx.createLinearGradient(0, y0, 0, H);
  g.addColorStop(0, '#1f4f99'); g.addColorStop(1, '#173c78');
  ctx.fillStyle = g;
  ctx.fillRect(0, y0, W, H - y0);
  const rowH = (H - y0) / 2;
  ctx.textBaseline = 'middle';
  // channels
  for (let ch = 0; ch < 4; ch++) {
    const col = ch % 2, row = Math.floor(ch / 2);
    const x = 6 + col * 142, y = y0 + row * rowH + 3;
    const c = s.ch[ch];
    badge(ctx, x, y, 34, rowH - 6, c.on ? CH_COLORS[ch] : '#3a5a8a', `CH${ch + 1}`, c.on ? '#000' : '#9bb');
    ctx.fillStyle = c.on ? '#fff' : '#8fa6c8'; ctx.font = FONT(12, 600);
    let t = c.on ? fmt(c.vdiv, 'V') : '––';
    if (c.on) {
      if (c.coupling === 'AC') t += ' ∿';
      if (c.coupling === 'GND') t += ' ⏚';
      if (c.bwLimit) t += ' BW';
      if (c.invert) t += ' ↕';
      if (c.fine) t += ' f';
    }
    ctx.fillText(t, x + 40, y + (rowH - 6) / 2 + 1);
  }
  // divider
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ctx.fillRect(290, y0 + 4, 1, H - y0 - 8);
  ctx.font = FONT(12, 600); ctx.fillStyle = '#fff';
  const r1 = y0 + rowH / 2 + 1, r2 = y0 + rowH * 1.5 + 1;
  ctx.fillText(fmt(s.tdiv, 's') + (s.hFine ? ' f' : ''), 300, r1);
  ctx.fillText('▸ ' + fmt(s.hDelay, 's'), 300, r2);
  const sr = Math.min(NPTS / (HDIV * s.tdiv), 1e9);
  ctx.fillText(fmt(sr, 'S/s'), 380, r1);
  ctx.fillText(`${NPTS} Punkte`, 380, r2);
  // trigger
  const src = s.trig.source;
  badge(ctx, 470, y0 + 3, 34, rowH - 6, src === 4 ? '#bbb' : CH_COLORS[src], src === 4 ? 'Netz' : `CH${src + 1}`);
  slopeIcon(ctx, 510, r1, s.trig.slope, '#fff');
  ctx.fillStyle = '#fff';
  ctx.fillText(src === 4 ? '' : fmt(s.trig.level, 'V'), 528, r1);
  const tsrc = acq && src < 4 ? acq.data[src] : null;
  const f = src === 4 ? 50 : counterFreq(tsrc, acq ? acq.dt : 1, s.trig.level);
  ctx.fillText(isFinite(f) ? fmt(f, 'Hz', 4) : '< 10Hz', 472, r2);
  ctx.fillStyle = '#b8c8e8'; ctx.font = FONT(10, 500);
  ctx.fillText(s.trig.mode === 'auto' ? 'Auto' : 'Normal', 580, r2);
  if (s.display.showClock) {
    const d = new Date();
    ctx.font = FONT(12, 600); ctx.fillStyle = '#fff'; ctx.textAlign = 'right';
    ctx.fillText(d.toLocaleTimeString('de-DE'), W - 8, r1);
    ctx.fillText(d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' }), W - 8, r2);
    ctx.textAlign = 'left';
  }
}

function drawMenu(ctx: CanvasRenderingContext2D, inp: RenderInput) {
  const items = inp.menuItems;
  for (let i = 0; i < 6; i++) {
    const it = items[i];
    const x = MENU_X, y = GY + i * SLOT_H + 3, w = W - MENU_X - 3, h = SLOT_H - 6;
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (!it) {
      g.addColorStop(0, 'rgba(22,28,40,0.85)'); g.addColorStop(1, 'rgba(15,20,30,0.85)');
      ctx.fillStyle = g; roundRect(ctx, x, y, w, h, 4); ctx.fill();
      continue;
    }
    if (it.active) { g.addColorStop(0, '#3767c9'); g.addColorStop(1, '#244a98'); }
    else { g.addColorStop(0, '#303a4f'); g.addColorStop(1, '#1d2433'); }
    ctx.fillStyle = g;
    roundRect(ctx, x, y, w, h, 4); ctx.fill();
    ctx.strokeStyle = it.active ? '#8fb2ff' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = it.disabled ? '#777' : '#fff';
    ctx.font = FONT(12, 700); ctx.textBaseline = 'middle';
    ctx.fillText(it.label, x + 8, y + (it.value !== undefined ? 18 : h / 2));
    if (it.value !== undefined) {
      ctx.fillStyle = it.disabled ? '#777' : '#ffd94a';
      ctx.font = FONT(12, 600);
      ctx.fillText(it.value, x + 8, y + 39);
    }
    if (it.knob) {
      ctx.fillStyle = '#3aa0ff';
      ctx.beginPath(); ctx.arc(x + w - 14, y + 14, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = FONT(11, 800); ctx.textAlign = 'center';
      ctx.fillText('a', x + w - 14, y + 14.5); ctx.textAlign = 'left';
    }
  }
}

export function drawBoot(ctx: CanvasRenderingContext2D, p: number) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#fff';
  ctx.font = 'italic 800 54px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('OSZITRON', W / 2, H / 2 - 30);
  ctx.font = FONT(15, 500); ctx.fillStyle = '#aab';
  ctx.fillText('OTX 2000 SERIES  ·  DIGITAL OSCILLOSCOPE', W / 2, H / 2 + 14);
  ctx.fillStyle = '#222'; ctx.fillRect(W / 2 - 150, H / 2 + 50, 300, 6);
  ctx.fillStyle = '#4b8bff'; ctx.fillRect(W / 2 - 150, H / 2 + 50, 300 * p, 6);
  ctx.font = FONT(11, 400); ctx.fillStyle = '#667';
  ctx.fillText(p < 0.5 ? 'Selbsttest …' : 'Lade Einstellungen …', W / 2, H / 2 + 74);
  ctx.textAlign = 'left';
}
