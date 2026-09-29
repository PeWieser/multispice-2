import { useEffect, useMemo, useRef, useState } from 'react';
import type { Channel, GenState, MenuItem } from '../generator/types';
import { ARB_WAVES, WAVE_NAMES, previewPoints } from '../generator/waveforms';
import { FIELDS } from '../generator/fields';
import { formatCompact, formatString, formatValue } from '../generator/format';
import { currentMenu, mainFields, MODE_LABEL } from '../generator/menu';

const MONO = "'Courier New', 'Liberation Mono', monospace";
const SANS = "'Trebuchet MS', 'DejaVu Sans', Arial, sans-serif";

export const LCD_W = 430;
export const LCD_H = 308;
const MENU_W = 86;
const LEFT_W = LCD_W - MENU_W;

function modLabel(c: Channel): string {
  switch (c.mode) {
    case 'AM': return `AM ${formatCompact(c.mod.freq, 'freq')} ${c.mod.depth.toFixed(0)}%`;
    case 'FM': return `FM ${formatCompact(c.mod.freq, 'freq')} ±${formatCompact(c.mod.devFreq, 'freq')}`;
    case 'PM': return `PM ${formatCompact(c.mod.freq, 'freq')} ±${c.mod.devPhase.toFixed(0)}°`;
    case 'FSK': return `FSK ${formatCompact(c.mod.rate, 'freq')} hop ${formatCompact(c.mod.hopFreq, 'freq')}`;
    case 'sweep': return `Sweep ${formatCompact(c.sweep.start, 'freq')}→${formatCompact(c.sweep.stop, 'freq')} ${c.sweep.type}`;
    case 'burst': return `Burst ${c.burst.cycles}Cyc / ${formatCompact(c.burst.period, 'time')}`;
    default: return '';
  }
}

function WavePlot({ c, w, h, color = '#ff3f6c' }: { c: Channel; w: number; h: number; color?: string }) {
  const d = useMemo(() => {
    const pts = previewPoints(c, Math.max(120, Math.floor(w * 1.5)));
    const amp = h / 2 - 6;
    return pts.map((v, i) => `${i ? 'L' : 'M'}${((i * w) / (pts.length - 1)).toFixed(1)} ${(h / 2 - v * amp).toFixed(1)}`).join('');
  }, [c, w, h]);
  return (
    <svg width={w} height={h} style={{ display: 'block' }}>
      {[0.25, 0.75].map((f) => (
        <line key={f} x1={0} x2={w} y1={h * f} y2={h * f} stroke="#2a2f3a" strokeDasharray="2 4" />
      ))}
      <line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="#e8e8e8" strokeWidth={1} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.7} strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 2px ${color})` }} />
    </svg>
  );
}

function Value({ s, size = 36 }: { s: GenState; size?: number }) {
  const c = s.ch[s.active];
  const f = FIELDS[s.ui.focus];
  if (s.ui.edit) {
    return (
      <span>
        {s.ui.edit.text}
        <span className="lcd-blink" style={{ color: '#fff' }}>_</span>
      </span>
    );
  }
  const fm = formatValue(f.get(c), f.kind);
  return (
    <span style={{ fontSize: size }}>
      {fm.parts.map((p, i) =>
        p.exp !== undefined && p.exp === s.ui.cursorExp ? (
          <span key={i} style={{ background: '#e21fd6', color: '#000', borderRadius: 2, padding: '0 1px' }}>{p.c}</span>
        ) : (
          <span key={i}>{p.c}</span>
        ),
      )}
      <span>{fm.unit}</span>
    </span>
  );
}

function MenuSlot({ it, index }: { it: MenuItem | null; index: number }) {
  const base: React.CSSProperties = {
    height: 55, boxSizing: 'border-box', borderTop: '2px solid #1a4a55', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 3, fontFamily: MONO, fontWeight: 700, fontSize: 12, color: '#06303a',
  };
  if (!it) return <div key={index} style={{ ...base, background: 'linear-gradient(180deg,#4f8f9b,#437f8b)' }} />;
  return (
    <div style={{ ...base, background: it.selected ? 'linear-gradient(180deg,#e4f0fb,#bcd4ec)' : 'linear-gradient(180deg,#69bcc0,#55a7ae)' }}>
      {it.lines.map((l, i) => {
        const hot = it.hi !== undefined ? it.hi === i : it.lines.length === 1 && it.selected;
        return (
          <div key={i} style={{ padding: '0 4px', borderRadius: 2, background: hot ? '#ff9de8' : 'transparent', lineHeight: '15px', maxWidth: 80, overflow: 'hidden', whiteSpace: 'nowrap' }}>{l}</div>
        );
      })}
    </div>
  );
}

function Splash() {
  return (
    <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#8fd3ff', fontFamily: MONO }}>
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 4 }}>SimTech</div>
      <div style={{ fontSize: 14, marginTop: 4 }}>FG-2500 Arbitrary Waveform Generator</div>
      <div style={{ width: 200, height: 8, border: '1px solid #8fd3ff', marginTop: 22 }}>
        <div style={{ height: '100%', background: '#8fd3ff', animation: 'lcd-boot 1.3s linear forwards' }} />
      </div>
      <div style={{ fontSize: 11, marginTop: 8, opacity: 0.8 }}>Self test ...</div>
    </div>
  );
}

export function Lcd({ state: s }: { state: GenState }) {
  const [boot, setBoot] = useState(true);
  const [showMsg, setShowMsg] = useState(true);
  const power = s.sys.power;

  // Netzeinschalten: Umschalten WÄHREND des Renderns, damit nie ein Frame
  // des eigentlichen Displays vor dem Splash durchblitzt (React-Render-Update).
  const prevPower = useRef(power);
  if (power !== prevPower.current) {
    prevPower.current = power;
    setBoot(power); // an: Splash ab dem ersten Bild; aus: kein Boot mehr
  }

  useEffect(() => {
    if (!power) return;
    const t = setTimeout(() => setBoot(false), 1400);
    return () => clearTimeout(t);
  }, [power]);
  useEffect(() => {
    setShowMsg(true);
    const t = setTimeout(() => setShowMsg(false), 2600);
    return () => clearTimeout(t);
  }, [s.ui.msgId]);

  const glare = (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'linear-gradient(125deg, rgba(255,255,255,.16) 0%, rgba(255,255,255,.04) 32%, transparent 33%)' }} />
  );
  const frame: React.CSSProperties = {
    position: 'absolute', left: 20, top: 16, width: LCD_W, height: LCD_H, background: '#000', overflow: 'hidden',
    borderRadius: 5, boxShadow: '0 0 0 4px #121418, 0 0 0 5px #4a4f57, inset 0 0 12px rgba(0,0,0,.9)',
  };

  if (!power) return <div className="lcd-select" style={frame}>{glare}</div>;
  if (boot) return <div className="lcd-select" style={{ ...frame, background: '#000' }}><Splash />{glare}</div>;

  const c = s.ch[s.active];
  const menu = currentMenu(s);
  const hasFields = menu.fields.length > 0;
  const f = FIELDS[s.ui.focus];

  let name = menu.title;
  let subValue = '';
  if (!hasFields) {
    if (s.ui.page === 'utility') subValue = `CH${s.active + 1} Setup`;
    else if (s.ui.page === 'save') subValue = `Slot M${s.sys.slot + 1}`;
    else if (s.ui.page === 'arb') subValue = ARB_WAVES[c.arb].name;
    name = s.ui.page === 'arb' ? 'Arbitrary Waveform' : menu.title;
  } else name = f.name;

  // untere Parameterboxen
  const cand = [...menu.fields, ...mainFields(c)].filter((id, i, a) => a.indexOf(id) === i && id !== s.ui.focus);
  const boxes = hasFields
    ? cand.slice(0, 2).map((id) => ({ label: FIELDS[id].name, value: formatString(FIELDS[id].get(c), FIELDS[id].kind, true) }))
    : [
        { label: 'Channel', value: `CH${s.active + 1}` },
        { label: 'Output', value: c.output ? 'ON' : 'OFF' },
      ];

  const ampText = formatString(c.amp, 'vpp');
  const offText = formatString(c.offset, 'volt');
  const freqText = c.mode === 'off' || c.mode === 'burst' ? formatString(c.freq, 'freq', true) : modLabel(c);

  let mid: React.ReactNode;
  if (s.ui.help) {
    mid = (
      <div style={{ padding: 10, fontFamily: MONO, fontSize: 13, color: '#fff', lineHeight: 1.35 }}>
        <div style={{ color: '#ffd93b', fontWeight: 700, marginBottom: 6 }}>? HELP</div>
        {s.ui.helpText}
      </div>
    );
  } else if (s.ui.both) {
    mid = (
      <div>
        {[0, 1].map((i) => {
          const ch = s.ch[i];
          return (
            <div key={i} style={{ height: 83, borderBottom: i === 0 ? '1px solid #333' : 'none', position: 'relative', outline: s.active === i ? '1px solid #ffb02e' : 'none', outlineOffset: -1 }}>
              <div style={{ position: 'absolute', left: 6, top: 3, fontFamily: MONO, fontSize: 11, color: '#fff', lineHeight: '13px' }}>
                <b style={{ color: i === 0 ? '#ffb02e' : '#5cc8ff' }}>CH{i + 1}</b> {ch.output ? 'ON' : 'OFF'}<br />
                {WAVE_NAMES[ch.wave]}<br />
                {ch.mode !== 'off' ? MODE_LABEL[ch.mode] : ''}
              </div>
              <div style={{ position: 'absolute', left: 92, top: 3, fontFamily: MONO, fontSize: 11, color: '#ffe14d', whiteSpace: 'nowrap' }}>
                {ch.wave === 'noise' ? 'White noise' : formatString(ch.freq, 'freq', true)}  {formatString(ch.amp, 'vpp')}  {formatString(ch.offset, 'volt')}
              </div>
              <div style={{ position: 'absolute', left: 92, top: 18 }}>
                <WavePlot c={ch} w={LEFT_W - 100} h={62} color={i === 0 ? '#ff3f6c' : '#37c6ff'} />
              </div>
            </div>
          );
        })}
      </div>
    );
  } else if (!hasFields && menu.info) {
    mid = (
      <div style={{ padding: '8px 10px', fontFamily: MONO, fontSize: 12.5, color: '#fff', lineHeight: '19px', whiteSpace: 'pre' }}>
        {menu.info.map((l, i) => (
          <div key={i} style={{ background: menu.infoHi === i ? '#274f9c' : 'transparent', padding: '0 4px', color: menu.infoHi === i ? '#ffe14d' : '#dfe8ff' }}>{l}</div>
        ))}
      </div>
    );
  } else if (!hasFields) {
    mid = <div style={{ padding: 10, fontFamily: MONO, fontSize: 12, color: '#fff' }}>Select an arbitrary waveform with F1–F4.</div>;
  } else {
    mid = (
      <>
        <div style={{ position: 'absolute', left: 6, top: 4, fontFamily: MONO, fontSize: 12, color: '#fff' }}>Load:{c.load === '50' ? '50 Ω' : 'High Z'}</div>
        <div style={{ position: 'absolute', left: 86, right: 6, top: 4, display: 'flex', alignItems: 'center', gap: 4, fontFamily: MONO, fontSize: 12, color: '#fff' }}>
          <span style={{ flex: 1, borderTop: '1px solid #fff', position: 'relative', height: 0 }}><i style={{ position: 'absolute', left: -1, top: -5, fontStyle: 'normal', fontSize: 9 }}>◂</i></span>
          <span style={{ whiteSpace: 'nowrap' }}>{freqText}</span>
          <span style={{ flex: 1, borderTop: '1px solid #fff', position: 'relative', height: 0 }}><i style={{ position: 'absolute', right: -1, top: -5, fontStyle: 'normal', fontSize: 9 }}>▸</i></span>
        </div>
        <div style={{ position: 'absolute', left: 6, top: 60, fontFamily: MONO, fontSize: 12, color: '#fff', lineHeight: '16px' }}>
          {c.wave === 'noise' ? <>Noise<br /></> : null}{ampText}<br />{offText}
        </div>
        <div style={{ position: 'absolute', left: 84, top: 24 }}>
          <WavePlot c={c} w={LEFT_W - 90} h={136} />
        </div>
      </>
    );
  }

  const chColor = s.active === 0 ? '#f7a823' : '#43b7f5';

  return (
    <div className="lcd-select lcd-fade" style={{ ...frame, filter: `brightness(${0.5 + s.sys.brightness * 0.1}) contrast(1.05)` }}>
      {/* Kopfzeile */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: LEFT_W, height: 64, background: 'linear-gradient(180deg,#14238a,#0c1770)' }}>
        <div style={{ position: 'absolute', left: 6, top: 5, width: 40, height: 54, background: chColor, borderRadius: 4, color: '#000', fontFamily: MONO, fontWeight: 700, textAlign: 'center', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,.25)' }}>
          <div style={{ fontSize: 10, lineHeight: '11px', marginTop: 2 }}>CH</div>
          <div style={{ fontSize: 28, lineHeight: '30px', fontFamily: SANS }}>{s.active + 1}</div>
          <div style={{ fontSize: 10, lineHeight: '12px', margin: '1px 3px 0', borderRadius: 2, background: c.output ? '#1fbf4f' : '#555', color: c.output ? '#000' : '#ddd' }}>{c.output ? 'ON' : 'OFF'}</div>
        </div>
        <div style={{ position: 'absolute', left: 52, right: 0, top: 3, textAlign: 'center', fontFamily: MONO, fontSize: 15, color: '#e6ecff', letterSpacing: 1 }}>{name}</div>
        <div style={{ position: 'absolute', left: 52, right: 0, top: 18, textAlign: 'center', fontFamily: SANS, fontSize: 36, lineHeight: '42px', fontWeight: 600, color: '#ffe93b', whiteSpace: 'nowrap', textShadow: '0 0 6px rgba(255,230,60,.35)' }}>
          {hasFields ? <Value s={s} /> : <span style={{ fontSize: 30 }}>{subValue}</span>}
        </div>
      </div>

      {/* Mitte */}
      <div style={{ position: 'absolute', left: 0, top: 64, width: LEFT_W, height: 166, background: '#000', overflow: 'hidden' }}>
        {mid}
        {s.ui.msg && showMsg && (
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, background: 'rgba(255,214,60,.94)', color: '#111', fontFamily: MONO, fontSize: 12, fontWeight: 700, padding: '3px 8px' }}>{s.ui.msg}</div>
        )}
      </div>

      {/* Unten: Parameterboxen */}
      <div style={{ position: 'absolute', left: 0, top: 230, width: LEFT_W, height: 78, display: 'flex', gap: 2, background: '#0b1354' }}>
        {[0, 1].map((i) => {
          const b = boxes[i];
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div style={{ height: 22, background: '#16288f', color: '#e8eeff', fontFamily: MONO, fontSize: 13, padding: '2px 5px', boxSizing: 'border-box', borderTop: '1px solid #4a5bd0' }}>{b?.label ?? ''}</div>
              <div style={{ flex: 1, background: 'linear-gradient(180deg,#3389b0,#2a6f96)', color: '#ffe93b', fontFamily: SANS, fontWeight: 600, fontSize: 27, display: 'flex', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap' }}>{b?.value ?? ''}</div>
            </div>
          );
        })}
      </div>

      {/* Menüspalte */}
      <div style={{ position: 'absolute', left: LEFT_W, top: 0, width: MENU_W, height: LCD_H, background: '#2b6e78', borderLeft: '2px solid #0a0f30' }}>
        <div style={{ height: 33, background: 'linear-gradient(180deg,#ffb52e,#f09a10)', color: '#000', fontFamily: MONO, fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', boxSizing: 'border-box' }}>{menu.title}</div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 33 }}>
          {menu.slots.map((it, i) => <MenuSlot key={i} it={it} index={i} />)}
        </div>
      </div>
      <div className="lcd-scan" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
      {glare}
    </div>
  );
}
