import { useRef } from "react";

interface KnobProps {
  size?: number;
  label?: string;
  sublabel?: string;
  color?: string; // accent ring color
  // Called with +1 / -1 detents as the user turns the knob
  onTurn: (dir: number) => void;
  // sensitivity: pixels per detent
  sensitivity?: number;
  ticks?: boolean;
}

export function Knob({
  size = 62,
  label,
  sublabel,
  color = "#c9ccd2",
  onTurn,
  sensitivity = 9,
  ticks = true,
}: KnobProps) {
  const angleRef = useRef(0);
  const accRef = useRef(0);
  const lastRef = useRef(0);
  const knobRef = useRef<HTMLDivElement>(null);

  const spin = (delta: number) => {
    angleRef.current += delta * 0.9;
    if (knobRef.current) {
      knobRef.current.style.transform = `rotate(${angleRef.current}deg)`;
    }
  };

  const handleMove = (clientY: number) => {
    const delta = lastRef.current - clientY; // up = positive
    lastRef.current = clientY;
    accRef.current += delta;
    spin(delta);
    while (Math.abs(accRef.current) >= sensitivity) {
      const dir = accRef.current > 0 ? 1 : -1;
      onTurn(dir);
      accRef.current -= dir * sensitivity;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    lastRef.current = e.clientY;
    accRef.current = 0;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (e.buttons !== 1) return;
    handleMove(e.clientY);
  };
  const onWheel = (e: React.WheelEvent) => {
    const dir = e.deltaY < 0 ? 1 : -1;
    onTurn(dir);
    spin(dir * sensitivity);
  };

  return (
    <div className="flex select-none flex-col items-center gap-1">
      <div
        className="relative touch-none"
        style={{ width: size, height: size }}
        onWheel={onWheel}
      >
        {/* base ring / accent */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `conic-gradient(from 0deg, ${color}, #6b6e74, ${color}, #6b6e74, ${color})`,
            boxShadow:
              "0 3px 6px rgba(0,0,0,0.55), inset 0 1px 1px rgba(255,255,255,0.25)",
          }}
        />
        {/* tick marks */}
        {ticks && (
          <div className="absolute inset-0">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="absolute left-1/2 top-1/2 h-[3px] w-[3px] rounded-full bg-black/50"
                style={{
                  transform: `rotate(${i * 30}deg) translateY(-${size / 2 - 3}px)`,
                }}
              />
            ))}
          </div>
        )}
        {/* rotating cap */}
        <div
          ref={knobRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          className="absolute cursor-grab rounded-full active:cursor-grabbing"
          style={{
            inset: size * 0.13,
            background:
              "radial-gradient(circle at 35% 30%, #55585e 0%, #3a3c41 45%, #232427 100%)",
            boxShadow:
              "0 4px 8px rgba(0,0,0,0.6), inset 0 2px 3px rgba(255,255,255,0.18), inset 0 -3px 5px rgba(0,0,0,0.6)",
          }}
        >
          {/* pointer indicator */}
          <div
            className="absolute left-1/2 top-[10%] h-[28%] w-[5px] -translate-x-1/2 rounded-full"
            style={{
              background: "linear-gradient(#fff, #d7d9dd)",
              boxShadow: "0 0 4px rgba(255,255,255,0.6)",
            }}
          />
          {/* knurled center */}
          <div
            className="absolute inset-[26%] rounded-full"
            style={{
              background:
                "radial-gradient(circle at 40% 35%, #4a4c51, #26272a)",
              boxShadow: "inset 0 1px 2px rgba(255,255,255,0.2)",
            }}
          />
        </div>
      </div>
      {label && (
        <div className="text-center leading-none">
          <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-300">
            {label}
          </div>
          {sublabel && (
            <div className="text-[8px] uppercase tracking-wide text-zinc-500">
              {sublabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
