import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { MODES, rangeLabel, type Connections, type DisplayReading, type MinMaxMode, type ModeId, type RedJack, type VoltageKind } from '../lib/multimeter';
import { panAt, sound } from '../lib/sound';

export const METER_POSITION = { x: 84, y: 24 };
export const SOCKET_X = { COM: 174, V: 247 };
export const SOCKET_Y = 546;
export const DIAL = { x: 139, y: 392, radius: 92, labelRadius: 111 };
const GRIP_PATH = 'M124 306Q139 300 154 306L162 472Q140 483 117 472Z';

function activate(event: KeyboardEvent<SVGGElement>, action: () => void) {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) action(); }
}

export function SceneDefinitions() {
  return <defs>
    <linearGradient id="rubber" x1="0" y1="0" x2="1" y2=".18"><stop stopColor="#ffe35c" /><stop offset=".13" stopColor="#ffcf28" /><stop offset=".65" stopColor="#ffc620" /><stop offset=".95" stopColor="#e7a811" /><stop offset="1" stopColor="#ffc93b" /></linearGradient>
    <linearGradient id="rubberEdge" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#fff19a" /><stop offset=".16" stopColor="#ffd348" /><stop offset=".83" stopColor="#f1b51b" /><stop offset="1" stopColor="#c18b0b" /></linearGradient>
    <linearGradient id="face" x1="0" y1="0" x2=".85" y2="1"><stop stopColor="#373a38" /><stop offset=".35" stopColor="#303431" /><stop offset="1" stopColor="#252825" /></linearGradient>
    <linearGradient id="bezel" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#101512" /><stop offset=".14" stopColor="#2a312b" /><stop offset=".82" stopColor="#434c43" /><stop offset="1" stopColor="#717d70" /></linearGradient>
    <linearGradient id="lcd" x1="0" y1="0" x2=".13" y2="1"><stop stopColor="#b7c9c9" /><stop offset=".37" stopColor="#d0dfdf" /><stop offset="1" stopColor="#c0d2d3" /></linearGradient>
    <linearGradient id="lcdLit" x1="0" y1="0" x2=".1" y2="1"><stop stopColor="#c9dddd" /><stop offset=".4" stopColor="#e3efee" /><stop offset="1" stopColor="#d1e4e5" /></linearGradient>
    <linearGradient id="lcdRecess" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#243d3a" stopOpacity=".23" /><stop offset=".11" stopColor="#314643" stopOpacity=".02" /><stop offset=".87" stopColor="#fff" stopOpacity="0" /><stop offset="1" stopColor="#f5ffff" stopOpacity=".18" /></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".18" /><stop offset=".4" stopColor="#fff" stopOpacity=".02" /><stop offset="1" stopColor="#fff" stopOpacity=".05" /></linearGradient>
    <radialGradient id="knob" gradientUnits="userSpaceOnUse" cx="105" cy="342" r="157"><stop stopColor="#555952" /><stop offset=".49" stopColor="#40443e" /><stop offset="1" stopColor="#282d27" /></radialGradient>
    <linearGradient id="gripWorld" gradientUnits="userSpaceOnUse" x1="88" y1="298" x2="178" y2="477"><stop stopColor="#61675c" /><stop offset=".2" stopColor="#4b5146" /><stop offset=".74" stopColor="#363d32" /><stop offset="1" stopColor="#292f25" /></linearGradient>
    <linearGradient id="gripReflection" gradientUnits="userSpaceOnUse" x1="51" y1="315" x2="212" y2="448"><stop stopColor="#e8eddf" stopOpacity=".2" /><stop offset=".3" stopColor="#c3cab7" stopOpacity=".06" /><stop offset=".7" stopColor="#fff" stopOpacity="0" /></linearGradient>
    <radialGradient id="pointer"><stop stopColor="#ecf1e9" /><stop offset=".76" stopColor="#dce4d7" /><stop offset="1" stopColor="#afbeaa" /></radialGradient>
    <linearGradient id="button" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#686f66" /><stop offset=".13" stopColor="#484f45" /><stop offset="1" stopColor="#2b3229" /></linearGradient>
    <linearGradient id="blueButton" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#91a8ac" /><stop offset=".19" stopColor="#55767e" /><stop offset="1" stopColor="#36515b" /></linearGradient>
    <linearGradient id="yellowButton" x1="0" y1="0" x2="0" y2="1"><stop stopColor="#ffe977" /><stop offset=".16" stopColor="#ffcd36" /><stop offset="1" stopColor="#dca515" /></linearGradient>
    <radialGradient id="socket"><stop stopColor="#040704" /><stop offset=".53" stopColor="#0f150f" /><stop offset=".62" stopColor="#78806e" /><stop offset=".79" stopColor="#242b22" /><stop offset="1" stopColor="#0d130c" /></radialGradient>
    <linearGradient id="redPlug" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#842825" /><stop offset=".22" stopColor="#dc6051" /><stop offset=".55" stopColor="#c44337" /><stop offset="1" stopColor="#8b2721" /></linearGradient>
    <linearGradient id="blackPlug" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#151c12" /><stop offset=".25" stopColor="#606956" /><stop offset=".56" stopColor="#3d4733" /><stop offset="1" stopColor="#1b2316" /></linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#657065" /><stop offset=".28" stopColor="#eef3e8" /><stop offset=".55" stopColor="#bbc4b6" /><stop offset="1" stopColor="#65705e" /></linearGradient>
    <linearGradient id="board" x1="0" y1="0" x2=".6" y2="1"><stop stopColor="#fff" /><stop offset=".75" stopColor="#eeeee8" /><stop offset="1" stopColor="#dcded5" /></linearGradient>
    <filter id="meterShadow" x="-25%" y="-15%" width="160%" height="150%"><feDropShadow dx="10" dy="13" stdDeviation="10" floodColor="#494636" floodOpacity=".19" /><feDropShadow dx="2" dy="3" stdDeviation="2" floodColor="#544725" floodOpacity=".2" /></filter>
    <filter id="knobShadow" x="-25%" y="-25%" width="165%" height="165%"><feDropShadow dx="3" dy="5" stdDeviation="3.5" floodColor="#090f08" floodOpacity=".5" /></filter>
    <filter id="gripShadow" filterUnits="userSpaceOnUse" x="25" y="276" width="240" height="244"><feDropShadow dx="3" dy="4" stdDeviation="1.7" floodColor="#070c05" floodOpacity=".6" /></filter>
    <filter id="wireShadow" x="-45%" y="-30%" width="200%" height="175%"><feDropShadow dx="2" dy="4" stdDeviation="2.2" floodColor="#303a26" floodOpacity=".21" /></filter>
    <filter id="boardShadow" x="-30%" y="-30%" width="180%" height="180%"><feDropShadow dx="3" dy="5" stdDeviation="4" floodColor="#4f584c" floodOpacity=".13" /></filter>
    <filter id="lcdInk" x="-5%" y="-5%" width="110%" height="110%"><feDropShadow dx=".3" dy=".5" stdDeviation=".3" floodColor="#586e6a" floodOpacity=".16" /></filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" stitchTiles="stitch" /><feColorMatrix type="saturate" values="0" /><feComponentTransfer><feFuncA type="linear" slope=".08" /></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light" /></filter>
    <clipPath id="lcdWindow"><rect x="50" y="83" width="240" height="133" rx="3.5" /></clipPath>
  </defs>;
}

const SEGMENTS = {
  a: 'M7 1H28L31 4.5L28 8H7L3.5 4.5Z',
  b: 'M30 10L33.5 6.5L37 10V25L33.5 28.5L30 25Z',
  c: 'M30 34L33.5 30.5L37 34V49L33.5 52.5L30 49Z',
  d: 'M7 52H28L31 55.5L28 59H7L3.5 55.5Z',
  e: 'M1 34L4.5 30.5L8 34V49L4.5 52.5L1 49Z',
  f: 'M1 10L4.5 6.5L8 10V25L4.5 28.5L1 25Z',
  g: 'M7 26.5H28L31.5 30L28 33.5H7L3.5 30Z',
};
const GLYPHS: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg', '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg', O: 'abcdef', L: 'def', E: 'adefg', r: 'eg' };

function SevenSegment({ text, powered }: { text: string; powered: boolean }) {
  const negative = text.startsWith('-');
  const characters = [...text.replace(/[-.]/g, '')].slice(-4);
  const offset = 4 - characters.length;
  const decimalAfter = text.includes('.') ? text.replace('-', '').indexOf('.') - 1 + offset : -1;
  const slots = [...Array<string>(offset).fill(' '), ...characters];
  return <g fill="#344347" filter="url(#lcdInk)" aria-hidden="true">
    {powered && negative && <path d="M53 147h9v4h-9Z" opacity=".9" />}
    <g transform="translate(61,107) scale(1.13,1.26)">
      {slots.map((character, index) => <g key={index} transform={`translate(${index * 44},0)`}>
        {Object.entries(SEGMENTS).map(([segment, d]) => <path key={segment} d={d} opacity={powered && GLYPHS[character]?.includes(segment) ? .94 : powered ? .016 : 0} />)}
        <rect x="39" y="53" width="4.8" height="5.8" rx=".5" opacity={powered && index === decimalAfter ? .94 : 0} />
      </g>)}
    </g>
  </g>;
}

function DeviceButton({ x, y, label, action, pressed = false, available = true, powered, color = 'normal', children, small = false, shortcut }: {
  x: number; y: number; label: string; action: () => void; pressed?: boolean; available?: boolean; powered: boolean;
  color?: 'normal' | 'blue' | 'yellow'; children?: ReactNode; small?: boolean; shortcut?: string;
}) {
  // The rubber key always clicks on press and release; the meter decides whether it beeps.
  const down = useRef(false);
  const pan = panAt(METER_POSITION.x + x + (small ? 0 : 24));
  const press = () => { if (!down.current) { down.current = true; sound.buttonDown(pan); } };
  const release = () => { if (down.current) { down.current = false; sound.buttonUp(pan); } };
  const unavailable = !powered || !available;
  return <g transform={`translate(${x},${y})`} role="button" tabIndex={powered ? 0 : -1} aria-label={label} aria-pressed={pressed} aria-disabled={unavailable || undefined} aria-keyshortcuts={shortcut} className={`device-control ${unavailable ? 'is-disabled' : ''}`}
    onPointerDown={(event) => { if (event.button === 0) press(); }} onPointerUp={release} onPointerLeave={release} onPointerCancel={release} onBlur={release}
    onClick={(event) => { if (event.detail === 0) sound.buttonTap(pan); action(); }}
    onKeyDown={(event) => { if (event.key !== 'Enter' && event.key !== ' ') return; event.preventDefault(); if (!event.repeat) { press(); action(); } }}
    onKeyUp={(event) => { if (event.key === 'Enter' || event.key === ' ') release(); }}>
    <title>{label}</title>
    <rect className="control-focus" x={small ? -22 : -3} y="-7" width={small ? 44 : 54} height="42" rx="5" fill="transparent" />
    {small ? <><circle cy="11" r="15" fill="#141a12" /><circle cy="10" r="13" fill="url(#button)" stroke="#777e6e" strokeWidth=".7" /></> : <>
      <rect x="-1" y="1" width="50" height="28" rx="4" fill="#131a10" />
      <rect width="48" height="25" rx="3.4" fill={`url(#${color === 'blue' ? 'blueButton' : color === 'yellow' ? 'yellowButton' : 'button'})`} stroke={color === 'yellow' ? '#a17a13' : '#777d6e'} strokeWidth=".7" />
      <path d="M5 2h38" stroke={color === 'yellow' ? '#fff18f' : '#bdc3b4'} strokeOpacity=".32" />
    </>}
    {children}
  </g>;
}

function ModeGlyph({ mode }: { mode: ModeId }) {
  if (mode === 'autoVoltage') return <g textAnchor="middle" fill="#dde2d6" fontFamily="Arial, sans-serif" fontWeight="600"><text y="1" fontSize="9.5">AUTO-V</text><text y="12" fontSize="10">LoZ</text></g>;
  if (mode === 'continuity') return <g fill="none" stroke="#d7ded0" strokeWidth="1.5" strokeLinecap="round"><path d="M-10-3v6m4-8a8 8 0 0 1 0 10m4-13a12 12 0 0 1 0 16m4-19a16 16 0 0 1 0 22" /></g>;
  return <g textAnchor="middle" fill="#dde2d7" fontFamily="Arial, sans-serif">
    <text y="6" fontSize={mode === 'off' ? 11 : mode === 'millivolts' ? 16 : 20} fontWeight={mode === 'off' ? 700 : 500}>{mode === 'off' ? 'OFF' : mode === 'resistance' ? '\u03a9' : mode === 'millivolts' ? 'mV' : 'V'}</text>
    {(mode === 'acVoltage' || mode === 'millivolts') && <path d="M-7-10q3-6 7 0t7 0" fill="none" stroke="#dde2d7" strokeWidth="1.2" />}
    {mode === 'dcVoltage' && <g stroke="#dde2d7" strokeWidth="1.1"><path d="M-6-13H6M-6-9h3m2 0h3m2 0h2" /></g>}
    {mode === 'millivolts' && <g transform="translate(22,0)" stroke="#e0bc54" strokeWidth="1.1"><path d="M-5-2H5M-5 2h2m2 0h2m2 0h2" /></g>}
  </g>;
}

export interface InstrumentProps {
  mode: ModeId;
  reading: DisplayReading;
  voltageKind?: VoltageKind;
  highVoltage: boolean;
  secondary: boolean;
  hold: boolean;
  minMax: MinMaxMode;
  backlight: boolean;
  autoRange: boolean;
  connections: Connections;
  onModeChange: (mode: ModeId) => void;
  onHold: () => void;
  onMinMax: () => void;
  onRange: () => void;
  onAutoRange: () => void;
  onSecondary: () => void;
  onBacklight: () => void;
  onPort: (port: RedJack | 'COM') => void;
}

export default function Multimeter(props: InstrumentProps) {
  const { mode, reading, hold, minMax, backlight, autoRange, connections, onModeChange } = props;
  const gripClipId = `grip-${useId().replace(/:/g, '')}`;
  const [dragging, setDragging] = useState(false);
  const overshoot = useRef(false);
  const dialPan = panAt(METER_POSITION.x + DIAL.x);
  const powered = mode !== 'off';
  const modeIndex = MODES.findIndex((item) => item.id === mode);
  const angle = MODES[modeIndex].angle;
  const rotorStyle: CSSProperties = { transform: `rotate(${angle}deg)`, transformOrigin: `${DIAL.x}px ${DIAL.y}px` };
  const voltageKind = props.voltageKind ?? (mode === 'acVoltage' || (mode === 'millivolts' && !props.secondary) ? 'AC' : 'DC');
  const shellPath = 'M45 7Q170-4 293 8Q321 10 322 43L306 545Q305 586 275 603Q170 624 66 604Q31 592 30 550L16 45Q15 13 45 7Z';
  const facePath = 'M52 31Q170 19 288 31Q305 35 304 56L291 533Q290 566 266 578Q170 596 74 578Q48 566 47 536L33 56Q32 35 52 31Z';
  const canRange = powered && mode !== 'autoVoltage' && mode !== 'continuity';
  const canMinMax = canRange;

  function moveDial(event: PointerEvent<SVGGElement>) {
    const svg = event.currentTarget.ownerSVGElement, matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const local = point.matrixTransform(matrix.inverse());
    const dx = local.x - METER_POSITION.x - DIAL.x, dy = local.y - METER_POSITION.y - DIAL.y;
    if (Math.hypot(dx, dy) < 18) return;
    const pointerAngle = Math.atan2(dx, -dy) * 180 / Math.PI;
    const nearest = MODES.reduce((best, item) => {
      const difference = Math.abs(((pointerAngle - item.angle + 540) % 360) - 180);
      return difference < best.difference ? { mode: item.id, difference } : best;
    }, { mode, difference: Infinity });
    // Hard stops at both ends: pushing further only gives a dull knock.
    const pushing = nearest.difference > 14 && (nearest.mode === MODES[0].id || nearest.mode === MODES[MODES.length - 1].id);
    if (pushing && nearest.mode === mode && !overshoot.current) sound.rotaryEndStop(dialPan);
    overshoot.current = pushing;
    if (nearest.mode !== mode) onModeChange(nearest.mode);
  }

  function dialKey(event: KeyboardEvent<SVGGElement>) {
    const direction = ['ArrowRight', 'ArrowUp'].includes(event.key) ? 1 : ['ArrowLeft', 'ArrowDown'].includes(event.key) ? -1 : 0;
    if (direction) {
      event.preventDefault();
      const target = MODES[modeIndex + direction];
      if (target) onModeChange(target.id); else sound.rotaryEndStop(dialPan);
    }
    else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      const target = event.key === 'Home' ? MODES[0].id : MODES[MODES.length - 1].id;
      if (target === mode) sound.rotaryEndStop(dialPan); else onModeChange(target);
    }
  }

  return <g transform={`translate(${METER_POSITION.x},${METER_POSITION.y})`} className="meter-instrument" data-dragging={dragging}>
    <defs><clipPath id={gripClipId} clipPathUnits="userSpaceOnUse"><path d={GRIP_PATH} className="dial-rotor" style={rotorStyle} /></clipPath></defs>
    <path d={shellPath} fill="url(#rubberEdge)" filter="url(#meterShadow)" stroke="#d5a120" strokeWidth="1" />
    <path d="M48 13Q169 1 291 14Q314 16 315 45L300 542Q300 579 272 596Q171 616 70 597Q37 583 37 546L22 46Q21 18 48 13Z" fill="url(#rubber)" />
    <path d="M42 27Q30 33 30 54L42 537Q43 567 61 581" fill="none" stroke="#ffe680" strokeWidth="4.5" strokeLinecap="round" opacity=".72" />
    <path d="M304 52 289 537Q289 575 270 583" fill="none" stroke="#bd850e" strokeWidth="4" strokeLinecap="round" opacity=".35" />
    <path d={facePath} fill="#151b15" stroke="#b18414" strokeWidth="2.7" />
    <path d={facePath} fill="url(#face)" filter="url(#grain)" stroke="#60665a" strokeWidth=".9" />
    <path d="M51 35Q170 24 288 35" stroke="#91967e" fill="none" strokeOpacity=".3" />

    <rect x="49" y="44" width="109" height="23" rx="1.2" fill="#f7cc47" stroke="#192116" strokeWidth="1.6" />
    <text x="55" y="60" fill="#293022" fontFamily="Arial, sans-serif" fontSize="13.4" fontWeight="900" letterSpacing="1.05">VOLTWERK</text>
    <text x="166" y="59" fill="#e0e5d6" fontSize="10.5" fontFamily="Arial, sans-serif" fontWeight="600">VM-114</text>
    <text x="215" y="59" fill="#c4cbbc" fontSize="7.6" fontFamily="Arial, sans-serif" fontStyle="italic">TRUE RMS</text>

    <g role="img" aria-label={`Anzeige: ${powered ? `${reading.text} ${reading.unit}${reading.unit === 'V' || reading.unit === 'mV' ? ` ${voltageKind}` : ''}` : 'ausgeschaltet'}`}>
      <rect x="42" y="73" width="257" height="154" rx="7" fill="#141b15" stroke="#6c7868" strokeWidth="1.1" />
      <rect x="46" y="77" width="249" height="146" rx="5" fill="url(#bezel)" />
      <path d="M47 80h247M48 79v138" fill="none" stroke="#111d14" strokeWidth="2" />
      <rect x="50" y="83" width="240" height="133" rx="3.5" fill={backlight && powered ? 'url(#lcdLit)' : 'url(#lcd)'} stroke="#92a7a6" strokeWidth=".9" className="lcd-surface" />
      <g clipPath="url(#lcdWindow)">
        {powered && <g fill="#425556" fontFamily="Arial, sans-serif" fontSize="8.5" fontWeight="600">
          {props.highVoltage && <path d="m59 108-5 10h4l-5 10 10-14h-5l5-6Z" />}
          {hold && <text x="64" y="98">HOLD</text>}
          {minMax !== 'off' && <text x="116" y="98">{minMax.toUpperCase()}</text>}
          {mode === 'autoVoltage' && <text x="261" y="98" textAnchor="end">LoZ</text>}
          {mode === 'continuity' && <path d="M269 91a8 8 0 0 1 0 8m-3-6a4 4 0 0 1 0 4" stroke="#425556" fill="none" strokeWidth="1" />}
        </g>}
        <SevenSegment text={reading.text} powered={powered} />
        {powered && <g fill="#394c4e" fontFamily="Arial, sans-serif">
          <text x="279" y="148" textAnchor="end" fontSize={reading.unit.length > 1 ? 13 : 16} fontWeight="600">{reading.unit}</text>
          {(reading.unit === 'V' || reading.unit === 'mV') && <text x="279" y="167" textAnchor="end" fontSize="9" fontWeight="600">{voltageKind}</text>}
          <text x="68" y="195" fontSize="7.2">{autoRange ? 'Auto' : 'Manual'}</text>
          <text x="267" y="195" textAnchor="end" fontSize="7.2">{rangeLabel(reading.range)}</text>
          {Array.from({ length: 40 }, (_, index) => <rect key={index} x={68 + index * 5.05} y="202" width="2.9" height={index % 5 === 0 ? 6 : 4.8} rx=".3" opacity={index < Math.ceil(reading.fraction * 40) ? .79 : .065} />)}
          <path d="M67 209h202m-201 0v3m100-3v3m101-3v3" fill="none" stroke="#4e6261" strokeWidth=".55" strokeOpacity=".7" />
        </g>}
        <rect x="50" y="83" width="240" height="133" fill="url(#lcdRecess)" pointerEvents="none" />
        <path d="M50 83h240v34L50 160Z" fill="url(#glass)" pointerEvents="none" />
      </g>
      <path d="M52 219h236" stroke="#c0cbb4" strokeWidth="1" strokeOpacity=".62" />
    </g>

    <DeviceButton x={54} y={238} label="Messwert halten (H)" shortcut="H" action={props.onHold} pressed={hold} powered={powered} color="blue"><text x="24" y="16" textAnchor="middle" className="device-button-text">HOLD</text></DeviceButton>
    <DeviceButton x={111} y={238} label="Maximum, Minimum, Mittelwert oder Livewert (M)" shortcut="M" action={props.onMinMax} pressed={minMax !== 'off'} powered={powered} available={canMinMax}><text x="24" y="16" textAnchor="middle" className="device-button-text">MIN MAX</text></DeviceButton>
    <g onDoubleClick={props.onAutoRange}><DeviceButton x={168} y={238} label="Messbereich wechseln (R). Doppelklick: Automatik." shortcut="R" action={props.onRange} pressed={!autoRange} powered={powered} available={canRange && !hold && minMax === 'off'}><text x="24" y="16" textAnchor="middle" className="device-button-text">RANGE</text></DeviceButton></g>
    <DeviceButton x={225} y={238} label="Millivolt AC / DC wechseln (S)" shortcut="S" action={props.onSecondary} pressed={props.secondary} powered={powered} available={mode === 'millivolts'} color="yellow" />

    {MODES.map((item) => {
      const radians = item.angle * Math.PI / 180;
      const x = DIAL.x + Math.sin(radians) * DIAL.labelRadius, y = DIAL.y - Math.cos(radians) * DIAL.labelRadius;
      return <g key={item.id} transform={`translate(${x},${y})`} role="button" tabIndex={0} aria-label={`${item.label} einstellen`} aria-pressed={mode === item.id} className="mode-control" onClick={() => onModeChange(item.id)} onKeyDown={(event) => activate(event, () => onModeChange(item.id))}>
        <title>{item.label}</title><rect className="control-focus" x="-23" y="-22" width={item.id === 'millivolts' ? 53 : 46} height="44" rx="4" fill="transparent" /><ModeGlyph mode={item.id} />
      </g>;
    })}

    <DeviceButton x={273} y={282} label="Displaybeleuchtung ein- oder ausschalten (L)" shortcut="L" action={props.onBacklight} pressed={backlight} powered={powered} small><g transform="translate(-8,2)" fill="none" stroke="#dce3d3" strokeWidth="1.1"><circle cx="8" cy="8" r="3" /><path d="M8 0v2m0 12v2M0 8h2m12 0h2M2 2l2 2m8 8 2 2M2 14l2-2m8-8 2-2" /></g></DeviceButton>

    <g role="slider" tabIndex={0} aria-label="Drehschalter: Messfunktion" aria-valuemin={0} aria-valuemax={MODES.length - 1} aria-valuenow={modeIndex} aria-valuetext={MODES[modeIndex].label} aria-orientation="horizontal" className="dial-control" onKeyDown={dialKey} onPointerDown={(event) => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); moveDial(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) moveDial(event); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); setDragging(false); overshoot.current = false; }} onPointerCancel={() => { setDragging(false); overshoot.current = false; }}>
      <title>Drehen oder mit den Pfeiltasten einstellen</title>
      <circle cx={DIAL.x} cy={DIAL.y} r="96" fill="#191f17" stroke="#69715f" strokeWidth=".7" />
      <circle cx={DIAL.x} cy={DIAL.y} r={DIAL.radius} fill="url(#knob)" filter="url(#knobShadow)" stroke="#747b6b" strokeWidth=".7" />
      {Array.from({ length: 70 }, (_, index) => {
        const rad = index * Math.PI * 2 / 70;
        return <path key={index} d={`M${DIAL.x + Math.sin(rad) * 88} ${DIAL.y - Math.cos(rad) * 88}L${DIAL.x + Math.sin(rad) * 92} ${DIAL.y - Math.cos(rad) * 92}`} stroke="#22291e" strokeWidth="2.2" />;
      })}
      <circle cx={DIAL.x} cy={DIAL.y} r="86" fill="url(#knob)" filter="url(#grain)" />
      <path d="M75 336a85 85 0 0 1 111-24" fill="none" stroke="#8d9383" strokeWidth=".75" strokeOpacity=".37" />
      {/* Only the silhouette rotates. Lighting and cast shadows stay in device coordinates. */}
      <g filter="url(#gripShadow)"><g clipPath={`url(#${gripClipId})`}><rect x="36" y="289" width="208" height="206" fill="url(#gripWorld)" /><rect x="36" y="289" width="208" height="206" fill="url(#gripReflection)" /></g></g>
      <g className="dial-rotor" style={rotorStyle}>
        <path d={GRIP_PATH} fill="none" stroke="#20271c" strokeWidth=".9" />
        <circle cx={DIAL.x} cy="310" r="5.5" fill="#172110" />
        <circle cx={DIAL.x} cy="310" r="4" fill="url(#pointer)" />
      </g>
      <circle className="dial-focus" cx={DIAL.x} cy={DIAL.y} r="99" fill="transparent" />
    </g>

    {(['COM', 'V'] as const).map((port) => {
      const connected = port === 'COM' ? connections.blackConnected : connections.redJack === 'V';
      return <g key={port} transform={`translate(${SOCKET_X[port]},${SOCKET_Y})`} role="button" tabIndex={0} aria-label={`${port === 'COM' ? 'COM' : 'Plus'}-Buchse. ${connected ? 'Leitung trennen' : 'Leitung anschliessen'}.`} aria-pressed={connected} className="socket-control" onClick={() => props.onPort(port)} onKeyDown={(event) => activate(event, () => props.onPort(port))}>
        <title>{`${port === 'COM' ? 'COM' : '+'}: ${connected ? 'trennen' : 'verbinden'}`}</title>
        <rect className="control-focus" x="-25" y="-38" width="50" height="68" rx="5" fill="transparent" />
        <text y="-24" textAnchor="middle" fill="#d7dece" fontFamily="Arial, sans-serif" fontSize="12" fontWeight="500">{port === 'COM' ? 'COM' : '+'}</text>
        <circle cy="1" r="17" fill="#151d12" stroke="#737c65" strokeWidth=".6" />
        <circle r="13" fill="url(#socket)" stroke={port === 'COM' ? '#10190c' : '#b54a3b'} strokeWidth="3.2" />
        <circle r="7.4" fill="#070f03" /><circle cx="-.6" cy="-.7" r="3.8" fill="#2c3721" stroke="#898d5c" strokeWidth=".7" />
      </g>;
    })}
    <g fill="#b9c4ab" fontFamily="Arial, sans-serif" textAnchor="middle">
      <path d="m211 538 7 12h-14Z" fill="none" stroke="#b9c4ab" strokeWidth="1" /><text x="211" y="548" fontSize="8">!</text>
      <text x="211" y="568" fontSize="8">CAT III</text><text x="211" y="579" fontSize="9">600 V</text>
      <path d="M168 566v6h22m41 0h22v-6M203 586h16m-13 3h10m-7 3h4" fill="none" stroke="#a9b79a" strokeWidth=".9" />
    </g>
  </g>;
}