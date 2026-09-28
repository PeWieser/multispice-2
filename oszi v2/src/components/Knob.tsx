import { useEffect, useRef, useState } from 'react';

interface KnobProps {
  size?: number;
  ring?: string; // colored ring
  onTurn: (steps: number) => void;
  onPush?: () => void;
  title?: string;
  variant?: 'dark' | 'light' | 'metal';
  disabled?: boolean;
  pushLabel?: string;
}

/**
 * Rotary encoder: drag (up/right = clockwise), mouse wheel, click = push.
 */
export default function Knob({ size = 48, ring, onTurn, onPush, title, variant = 'dark', disabled, pushLabel }: KnobProps) {
  const [angle, setAngle] = useState(0);
  const [pressed, setPressed] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; acc: number; moved: boolean; ang: number | null } | null>(null);
  const turnRef = useRef(onTurn);
  turnRef.current = onTurn;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (disabledRef.current) return;
      const d = e.deltaY < 0 ? 1 : -1;
      setAngle((a) => a + d * 15);
      turnRef.current(d);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const centerAngle = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const dx = e.clientX - cx, dy = e.clientY - cy;
    if (Math.hypot(dx, dy) < r.width * 0.18) return null;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
  };

  const onDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, acc: 0, moved: false, ang: centerAngle(e) };
    setPressed(true);
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < 4) return;
    d.moved = true;
    // combine: rotational drag around the center + linear drag
    const a = centerAngle(e);
    let deg = 0;
    if (a !== null && d.ang !== null) {
      deg = a - d.ang;
      if (deg > 180) deg -= 360;
      if (deg < -180) deg += 360;
      d.ang = a;
    } else {
      deg = (dx - dy) * 2.2;
      d.ang = a;
    }
    d.x = e.clientX; d.y = e.clientY;
    d.acc += deg;
    setAngle((x) => x + deg);
    const STEP = 15;
    while (Math.abs(d.acc) >= STEP) {
      const s = Math.sign(d.acc);
      d.acc -= s * STEP;
      turnRef.current(s);
    }
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    setPressed(false);
    if (d && !d.moved && onPush) onPush();
  };

  const body =
    variant === 'light'
      ? 'radial-gradient(circle at 35% 30%, #fbfbfb 0%, #d7d9dc 45%, #a9adb2 100%)'
      : variant === 'metal'
      ? 'radial-gradient(circle at 35% 30%, #f0f0f0 0%, #b9bcc0 40%, #6f7378 100%)'
      : 'radial-gradient(circle at 35% 30%, #8a8e94 0%, #55595f 45%, #2b2e33 100%)';
  const ridges =
    variant === 'dark'
      ? 'repeating-conic-gradient(from 0deg, #3b3e43 0deg 5deg, #6a6e74 5deg 10deg)'
      : 'repeating-conic-gradient(from 0deg, #8d9197 0deg 5deg, #d9dbde 5deg 10deg)';

  return (
    <div className="knob-wrap" style={{ width: size + 14, height: size + 14 }} title={title}>
      {ring && (
        <div
          className="knob-ring"
          style={{ background: `radial-gradient(circle, ${ring} 58%, color-mix(in srgb, ${ring} 55%, #000) 72%, transparent 73%)` }}
        />
      )}
      <div
        ref={ref}
        className={`knob ${disabled ? 'opacity-60' : ''}`}
        style={{ width: size, height: size, transform: pressed ? 'scale(0.97)' : undefined }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div className="knob-skirt" style={{ background: ridges, transform: `rotate(${angle}deg)` }} />
        <div className="knob-cap" style={{ background: body }}>
          <div className="knob-rot" style={{ transform: `rotate(${angle}deg)` }}>
            <div className="knob-dot" style={{ background: variant === 'dark' ? '#e9e9e9' : '#333' }} />
          </div>
          {pushLabel && <div className="knob-push">{pushLabel}</div>}
        </div>
      </div>
    </div>
  );
}
