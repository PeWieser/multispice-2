import type { CSSProperties, ReactNode } from 'react';

interface KeyProps {
  x: number;
  y: number;
  w: number;
  h: number;
  onClick: () => void;
  variant?: 'light' | 'red' | 'blue' | 'wave' | 'power';
  lit?: boolean;
  led?: boolean;
  title: string;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Physische Drucktaste (absolut im Gehäuse positioniert) */
export function Key({ x, y, w, h, onClick, variant = 'light', lit, led, title, children, className = '', style }: KeyProps) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={`fg-key fg-key--${variant} ${lit ? 'is-lit' : ''} ${className}`}
      style={{ left: x, top: y, width: w, height: h, ...style }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
      {led !== undefined && <span className={`fg-led ${led ? 'on' : ''}`} />}
    </button>
  );
}
