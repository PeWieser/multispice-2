import type { CSSProperties, ReactNode } from 'react';
import { click } from './sound';

interface Props {
  children?: ReactNode;
  onClick?: () => void;
  w?: number;
  h?: number;
  led?: string | null; // backlight color when lit
  frame?: string; // colored frame (channel buttons)
  frameLit?: boolean;
  dark?: boolean;
  title?: string;
  className?: string;
  style?: CSSProperties;
  small?: boolean;
}

export default function Button({ children, onClick, w = 58, h = 26, led, frame, frameLit, dark, title, className = '', style, small }: Props) {
  const lit = !!led;
  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        // W32d: Klick-Geräusch jeder Frontplatte-Taste (Mikroschalter).
        click('key');
        onClick?.();
      }}
      className={`sk-btn ${dark ? 'sk-btn-dark' : ''} ${lit ? 'sk-btn-lit' : ''} ${small ? 'text-[9.5px]' : 'text-[11px]'} ${className}`}
      style={{
        width: w,
        height: h,
        ...(lit
          ? {
              background: `linear-gradient(180deg, color-mix(in srgb, ${led} 70%, #fff) 0%, ${led} 55%, color-mix(in srgb, ${led} 75%, #000) 100%)`,
              boxShadow: `0 0 14px 2px color-mix(in srgb, ${led} 60%, transparent), 0 2px 0 color-mix(in srgb, ${led} 40%, #000), inset 0 1px 0 rgba(255,255,255,.7)`,
              color: '#102010',
            }
          : {}),
        ...(frame
          ? {
              outline: `2.5px solid ${frame}`,
              outlineOffset: -5,
              ...(frameLit
                ? { boxShadow: `0 0 12px 1px color-mix(in srgb, ${frame} 70%, transparent), 0 2px 0 #6d7075, 0 3px 6px rgba(0,0,0,.5), inset 0 1px 0 #fff`, background: `linear-gradient(180deg, #fff, color-mix(in srgb, ${frame} 35%, #e6e6e6))` }
                : {}),
            }
          : {}),
        ...style,
      }}
    >
      {children}
    </button>
  );
}
