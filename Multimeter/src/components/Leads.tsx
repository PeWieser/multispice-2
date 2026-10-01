import { useRef, useState, type PointerEvent } from 'react';
import { METER_POSITION, SOCKET_X, SOCKET_Y } from './Multimeter';
import type { Connections, NodeId } from '../lib/multimeter';
import { panAt, sound } from '../lib/sound';

type LeadColor = 'red' | 'black';
type Point = { x: number; y: number };

function probePose(color: LeadColor, node: NodeId | null, sameNode: boolean, freePosition?: Point) {
  const x = freePosition?.x ?? (node === 'positive' ? 655 : node === 'negative' ? 555 : color === 'red' ? 663 : 543);
  const y = freePosition?.y ?? (node ? 322 : 386);
  const angle = color === 'red' ? -14 : 21;
  const offset = sameNode && node ? color === 'red' ? 4 : -4 : 0;
  return { x: x + offset, y, angle, endX: x + offset - Math.sin(angle * Math.PI / 180) * 155, endY: y + Math.cos(angle * Math.PI / 180) * 155 };
}

function Cable({ path, color }: { path: string; color: 'red' | 'black' }) {
  return <g fill="none" strokeLinecap="round" strokeLinejoin="round" className="measurement-cable" filter="url(#wireShadow)" pointerEvents="none">
    <path d={path} stroke={color === 'red' ? '#8d2624' : '#242b22'} strokeWidth="8.6" />
    <path d={path} stroke={color === 'red' ? '#ce4138' : '#3d443a'} strokeWidth="6.3" />
    <path d={path} stroke={color === 'red' ? '#ed6b5e' : '#737a6b'} strokeWidth="1.8" transform="translate(-.7,-1.2)" opacity=".64" />
  </g>;
}

function BananaPlug({ x, color }: { x: number; color: 'red' | 'black' }) {
  return <g transform={`translate(${x}, ${METER_POSITION.y + SOCKET_Y})`} pointerEvents="none" filter="url(#wireShadow)">
    <rect x="-10" y="-6" width="20" height="27" rx="6" fill={`url(#${color}Plug)`} stroke={color === 'red' ? '#77231f' : '#191f17'} strokeWidth=".8" />
    <ellipse cy="-3" rx="10" ry="5.5" fill={color === 'red' ? '#d95449' : '#5c6455'} stroke={color === 'red' ? '#9c342c' : '#232b1f'} />
    <ellipse cy="-3" rx="5" ry="2.5" fill={color === 'red' ? '#98352f' : '#2b3325'} opacity=".8" />
    <path d="M-8 8h16m-16 4h16m-14 4h12" stroke={color === 'red' ? '#9b2c26' : '#232b1f'} strokeWidth="1.3" opacity=".7" />
    <path d="M-6 2v9" stroke={color === 'red' ? '#f7836d' : '#8b947f'} strokeWidth="1.3" opacity=".65" />
    <rect x="-5" y="18" width="10" height="9" rx="3" fill={`url(#${color}Plug)`} />
  </g>;
}

function Probe({ color, pose, active, onSelect, onPointerDown, onPointerMove, onPointerUp, onPointerCancel }: {
  color: LeadColor; pose: ReturnType<typeof probePose>; active: boolean; onSelect: () => void;
  onPointerDown: (event: PointerEvent<SVGGElement>) => void;
  onPointerMove: (event: PointerEvent<SVGGElement>) => void;
  onPointerUp: (event: PointerEvent<SVGGElement>) => void;
  onPointerCancel: () => void;
}) {
  const surface = `${color}ProbeLight`;
  return <g transform={`translate(${pose.x}, ${pose.y})`} className={`probe-control ${active ? 'active' : ''}`} role="button" tabIndex={0} aria-label={`${color === 'red' ? 'Rote' : 'Schwarze'} Messspitze auswaehlen oder an einen Testpunkt ziehen`} aria-pressed={active} onClick={onSelect} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!event.repeat) { sound.probePickup(panAt(pose.x)); onSelect(); } } }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
    <title>{`${color === 'red' ? 'Rote' : 'Schwarze'} Messspitze ausw\u00e4hlen, dann Testpunkt anklicken`}</title>
    <defs><linearGradient id={surface} gradientUnits="userSpaceOnUse" x1="-13" y1="0" x2="13" y2="0"><stop stopColor={color === 'red' ? '#862920' : '#20291b'} /><stop offset={.25 + Math.sin(pose.angle * Math.PI / 180) * .08} stopColor={color === 'red' ? '#d66754' : '#68765a'} /><stop offset=".55" stopColor={color === 'red' ? '#c14a39' : '#47563c'} /><stop offset="1" stopColor={color === 'red' ? '#8b2920' : '#242f1b'} /></linearGradient></defs>
    <g transform={`rotate(${pose.angle})`}><rect className="probe-focus" x="-21" y="41" width="42" height="117" rx="12" fill="transparent" /></g>
    <g filter="url(#wireShadow)"><g transform={`rotate(${pose.angle})`}>
      <path d="M-1 0h2l1.5 12V41h-5V12Z" fill="url(#metal)" stroke="#8b9584" strokeWidth=".3" pointerEvents="none" />
      <path d="M-4 34h8l3 20H-7Z" fill={`url(#${surface})`} />
      <rect x="-10" y="48" width="20" height="87" rx="9" fill={`url(#${surface})`} stroke={color === 'red' ? '#922b24' : '#20281b'} strokeWidth=".8" />
      <ellipse cy="52" rx="17" ry="5.5" fill={`url(#${surface})`} stroke={color === 'red' ? '#9c3028' : '#242c1e'} strokeWidth=".8" />
      {[72, 79, 86, 93, 100].map((y) => <path key={y} d={`M2 ${y}h6`} stroke={color === 'red' ? '#8e2721' : '#242c1e'} strokeWidth="1.2" opacity=".6" />)}
      <rect x="-6" y="131" width="12" height="25" rx="5" fill={`url(#${surface})`} />
      {[138, 143, 148].map((y) => <path key={y} d={`M-5 ${y}h10`} stroke={color === 'red' ? '#8b2b23' : '#242d1e'} strokeWidth="1.1" />)}
    </g></g>
  </g>;
}

export default function Leads({ connections, activeLead, onSelect, onNodeChange }: {
  connections: Connections; activeLead: LeadColor; onSelect: (lead: LeadColor) => void;
  onNodeChange: (lead: LeadColor, node: NodeId | null) => void;
}) {
  const [freePositions, setFreePositions] = useState<Record<LeadColor, Point>>({ red: { x: 663, y: 386 }, black: { x: 543, y: 386 } });
  const drag = useRef<{ color: LeadColor; start: Point; origin: Point; latest: Point; moved: boolean; last: Point; time: number } | null>(null);
  const sameNode = connections.redNode === connections.blackNode;
  const black = probePose('black', connections.blackNode, sameNode, connections.blackNode ? undefined : freePositions.black);
  const red = probePose('red', connections.redNode, sameNode, connections.redNode ? undefined : freePositions.red);
  const blackX = METER_POSITION.x + SOCKET_X.COM;
  const redX = METER_POSITION.x + SOCKET_X[connections.redJack ?? 'V'];
  const startY = METER_POSITION.y + SOCKET_Y + 23;
  const blackPath = `M${blackX} ${startY}C${blackX} 632 410 659 476 612C519 581 526 519 ${black.endX} ${black.endY}`;
  const redPath = `M${redX} ${startY}C${redX + 6} 651 616 663 684 614C733 579 744 515 ${red.endX} ${red.endY}`;

  function svgPoint(event: PointerEvent<SVGGElement>): Point | null {
    const svg = event.currentTarget.ownerSVGElement, matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return null;
    const point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    return { x: transformed.x, y: transformed.y };
  }

  function startDrag(event: PointerEvent<SVGGElement>, color: LeadColor) {
    if (event.button !== 0) return;
    const start = svgPoint(event);
    if (!start) return;
    const pose = color === 'red' ? red : black;
    onSelect(color); event.preventDefault(); event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    sound.probePickup(panAt(pose.x));
    drag.current = { color, start, origin: { x: pose.x, y: pose.y }, latest: { x: pose.x, y: pose.y }, moved: false, last: start, time: event.timeStamp };
  }

  function moveDrag(event: PointerEvent<SVGGElement>) {
    const current = drag.current, point = svgPoint(event);
    if (!current || !point || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    const dx = point.x - current.start.x, dy = point.y - current.start.y;
    if (!current.moved && Math.hypot(dx, dy) < 4) return;
    if (!current.moved) { current.moved = true; onNodeChange(current.color, null); }
    const next = { x: Math.max(70, Math.min(690, current.origin.x + dx)), y: Math.max(60, Math.min(465, current.origin.y + dy)) };
    // The cable rustles louder the faster the hand moves.
    const speed = Math.hypot(point.x - current.last.x, point.y - current.last.y) / Math.max(8, event.timeStamp - current.time);
    current.last = point;
    current.time = event.timeStamp;
    sound.cableRustle(speed / 1.2, panAt(next.x));
    current.latest = next;
    setFreePositions((previous) => ({ ...previous, [current.color]: next }));
  }

  function finishDrag(event: PointerEvent<SVGGElement>) {
    const current = drag.current;
    if (current?.moved) {
      const candidates = [{ id: 'negative', x: 555, y: 322 }, { id: 'positive', x: 655, y: 322 }];
      const target = candidates.find((node) => Math.hypot(node.x - current.latest.x, node.y - current.latest.y) <= 32);
      // Contact with a terminal is voiced by App; a probe set down on the bench is voiced here.
      if (!target) sound.probeDrop(panAt(current.latest.x));
      onNodeChange(current.color, target?.id ?? null);
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  }

  const probeEvents = (color: LeadColor) => ({
    onPointerDown: (event: PointerEvent<SVGGElement>) => startDrag(event, color),
    onPointerMove: moveDrag, onPointerUp: finishDrag, onPointerCancel: () => { drag.current = null; },
  });

  return <g className="meter-leads">
    {connections.blackConnected && <><Cable color="black" path={blackPath} /><BananaPlug color="black" x={blackX} /></>}
    {connections.redJack && <><Cable color="red" path={redPath} /><BananaPlug color="red" x={redX} /></>}
    {connections.blackConnected && <Probe color="black" pose={black} active={activeLead === 'black'} onSelect={() => onSelect('black')} {...probeEvents('black')} />}
    {connections.redJack && <Probe color="red" pose={red} active={activeLead === 'red'} onSelect={() => onSelect('red')} {...probeEvents('red')} />}
  </g>;
}
