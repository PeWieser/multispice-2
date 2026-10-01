import type { CSSProperties, ReactNode } from 'react';

export type IconName = 'reset' | 'chevron' | 'arrow' | 'download' | 'help' | 'keyboard' | 'check' | 'close' | 'plug' | 'settings' | 'shield' | 'volume' | 'volumeOff' | 'sun' | 'flask' | 'info' | 'external' | 'swap' | 'power' | 'alert';

const paths: Record<IconName, ReactNode> = {
  reset: <><path d="M3 10a9 9 0 1 1 2.6 8.3" /><path d="M3 4v6h6" /></>,
  chevron: <path d="m6 9 6 6 6-6" />,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  download: <><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M4 16v4h16v-4" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.2 8.5a3 3 0 0 1 5.6 1.4c0 2-2.8 2.3-2.8 4" /><path d="M12 17h.01" /></>,
  keyboard: <><rect x="2" y="5" width="20" height="14" rx="3" /><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M10 13h.01M14 13h.01M18 13h.01M7 16h10" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  plug: <><path d="M8 3v5m8-5v5M6 8h12v3a6 6 0 0 1-12 0V8Zm6 9v4" /></>,
  settings: <><path d="M4 7h7m4 0h5M4 17h3m4 0h9" /><circle cx="13" cy="7" r="2" /><circle cx="9" cy="17" r="2" /></>,
  shield: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" /><path d="m8 12 3 3 5-6" /></>,
  volume: <><path d="m11 4-6 5H2v6h3l6 5V4Z" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></>,
  volumeOff: <><path d="m11 4-6 5H2v6h3l6 5V4Z" /><path d="m16 9 5 6m-5 0 5-6" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></>,
  flask: <><path d="M9 3h6m-5 0v7l-5 8a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-8V3M8 15h8" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10h.01" /></>,
  external: <><path d="M14 3h7v7m0-7-11 11" /><path d="M10 3H4v17h17v-6" /></>,
  swap: <><path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4" /></>,
  power: <><path d="M12 2v10" /><path d="M6 5a9 9 0 1 0 12 0" /></>,
  alert: <><path d="m12 3 10 18H2L12 3Z" /><path d="M12 9v5m0 3h.01" /></>,
};

export default function Icon({ name, size = 20, className = '', style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>{paths[name]}</svg>;
}