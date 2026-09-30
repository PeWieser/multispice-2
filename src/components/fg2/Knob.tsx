import { useEffect, useRef, useState } from 'react';

interface KnobProps {
  x: number;
  y: number;
  size: number;
  onTurn: (steps: number) => void;
  onPress: () => void;
}

const STEP = (Math.PI / 180) * 14; // eine Raste alle 14°

/**
 * Drehgeber: mit der Maus im Kreis ziehen, Mausrad oder Pfeil hoch/runter (bei Fokus).
 * Ein kurzer Klick ohne Drehung entspricht dem Drücken des Knopfs.
 */
export function Knob({ x, y, size, onTurn, onPress }: KnobProps) {
  const [angle, setAngle] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ last: number; acc: number; moved: number } | null>(null);
  // W47: gebündelte Rasten aus dem Mausrad (ein Update/ Geräusch pro Frame).
  const wheelAcc = useRef(0);
  const wheelRaf = useRef(0);
  const turn = useRef(onTurn);
  const press = useRef(onPress);
  // W18: Ref-Writes im Effekt statt im Render (react-hooks/purity).
  useEffect(() => {
    turn.current = onTurn;
    press.current = onPress;
  }, [onTurn, onPress]);

  const ang = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
  };

  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // W47: Mausrad/Trackpad liefern pro Ereignis große Deltas. Statt pro Event
      // zu rendern (das ruckelt) werden die Rasten gesammelt und einmal pro Frame
      // verrechnet: ein sauberer Zug am Drehknopf und ein Tick-Geräusch je Frame.
      const steps = e.deltaY < 0 ? 1 : -1;
      wheelAcc.current += steps;
      if (wheelRaf.current === 0) {
        wheelRaf.current = requestAnimationFrame(() => {
          wheelRaf.current = 0;
          const n = wheelAcc.current;
          wheelAcc.current = 0;
          if (!n) return;
          setAngle((a) => a + n * 14);
          turn.current(n);
        });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    // Tastatursteuerung (Pfeil hoch/runter) dreht den Knopf optisch mit
    const onKey = (e: Event) => setAngle((a) => a + (e as CustomEvent<number>).detail * 14);
    window.addEventListener('fg-knob-visual', onKey);
    return () => {
      el.removeEventListener('wheel', onWheel);
      window.removeEventListener('fg-knob-visual', onKey);
      if (wheelRaf.current) cancelAnimationFrame(wheelRaf.current);
      wheelRaf.current = 0;
    };
  }, []);

  return (
    <>
      <div className="fg-knob-shadow" style={{ left: x - size / 2 + 4, top: y - size / 2 + 10, width: size, height: size }} />
      <div
        ref={ref}
        className="fg-knob"
        role="slider"
        aria-label="Drehknopf"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(((angle % 360) + 360) % 360)}
        title="Drehknopf: ziehen oder Mausrad = Wert ändern, Klick = Enter"
        tabIndex={0}
        style={{ left: x - size / 2, top: y - size / 2, width: size, height: size }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { last: ang(e), acc: 0, moved: 0 };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const cur = ang(e);
          let delta = cur - d.last;
          if (delta > Math.PI) delta -= 2 * Math.PI;
          if (delta < -Math.PI) delta += 2 * Math.PI;
          d.last = cur;
          d.moved += Math.abs(delta);
          d.acc += delta;
          setAngle((a) => a + (delta * 180) / Math.PI);
          // W47: alle Rasten dieses Frames in EINEM turn()-Aufruf bündeln – beim
          // schnellen Drehen gab es sonst mehrere Updates (und mehrere gleichzeitige
          // Rastgeräusche) pro Frame.
          let steps = 0;
          while (d.acc >= STEP) { steps++; d.acc -= STEP; }
          while (d.acc <= -STEP) { steps--; d.acc += STEP; }
          if (steps) turn.current(steps);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (d && d.moved < 0.12) press.current();
        }}
        onPointerCancel={() => { drag.current = null; }}
      >
        {/* Rändelung dreht mit … */}
        <div className="fg-knob-rotor" style={{ transform: `rotate(${angle}deg)` }}>
          <div className="fg-knob-ring" />
        </div>
        {/* … die Kappe samt Licht/Schatten steht still … */}
        <div className="fg-knob-cap" />
        {/* … nur der Markierungspunkt wandert um den Mittelpunkt */}
        <div className="fg-knob-rotor" style={{ transform: `rotate(${angle}deg)` }}>
          <div className="fg-knob-dot" />
        </div>
      </div>
    </>
  );
}
