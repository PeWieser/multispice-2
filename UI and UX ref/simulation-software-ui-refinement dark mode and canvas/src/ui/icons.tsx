import type { SVGProps } from "react";

/**
 * Icon set — drawn on a 24×24 grid with 1.6px round strokes, optically balanced
 * like SF Symbols. All icons inherit `currentColor`.
 */
export type IconName =
  // ui
  | "cursor"
  | "wire"
  | "eraser"
  | "probe"
  | "tag"
  | "note"
  | "hand"
  | "zoomIn"
  | "zoomOut"
  | "fit"
  | "undo"
  | "redo"
  | "play"
  | "stop"
  | "pause"
  | "gear"
  | "library"
  | "chevronDown"
  | "chevronRight"
  | "chevronLeft"
  | "chevronUpDown"
  | "check"
  | "close"
  | "plus"
  | "minus"
  | "search"
  | "sun"
  | "moon"
  | "grid"
  | "magnet"
  | "rotate"
  | "flipH"
  | "trash"
  | "copy"
  | "info"
  | "warning"
  | "bolt"
  | "sidebarLeft"
  | "sidebarRight"
  | "more"
  | "lock"
  | "sparkle"
  | "download"
  | "share"
  | "folder"
  | "doc"
  | "swatch"
  | "ruler"
  | "layers"
  | "bell"
  | "keyboard"
  // schematic symbols
  | "resistor"
  | "capacitor"
  | "inductor"
  | "source"
  | "ground"
  | "diode"
  | "led"
  | "transistor"
  | "opamp"
  | "ic"
  | "switch"
  | "lamp"
  | "battery"
  | "potentiometer"
  // instruments
  | "oscilloscope"
  | "multimeter"
  | "funcgen"
  | "timer"
  | "bode"
  | "logicAnalyzer"
  | "logicConverter"
  | "wattmeter"
  | "spectrum"
  | "counter"
  | "distortion"
  | "signal";

const paths: Record<IconName, React.ReactNode> = {
  // ─── UI ───
  cursor: (
    <path d="M6 4.5 18.2 11.6a.5.5 0 0 1-.1.9l-5 1.6-2.7 4.5a.5.5 0 0 1-.9-.1L5.3 5.1a.5.5 0 0 1 .7-.6Z" />
  ),
  wire: (
    <>
      <path d="M4 18h6.5a3 3 0 0 0 3-3v-6a3 3 0 0 1 3-3H20" />
      <circle cx="4" cy="18" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="20" cy="6" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  eraser: (
    <>
      <path d="m7.5 19.5-3.6-3.6a1.5 1.5 0 0 1 0-2.1l9.3-9.3a1.5 1.5 0 0 1 2.1 0l4.7 4.7a1.5 1.5 0 0 1 0 2.1l-8.2 8.2" />
      <path d="M7.5 19.5H20M9.3 9.3l5.4 5.4" />
    </>
  ),
  probe: (
    <>
      <path d="m14 10 6-6M4 20l4.5-4.5" />
      <path d="M8.5 15.5 14 10l-3.5-3.5-5.5 5.5a2.5 2.5 0 0 0 3.5 3.5Z" />
    </>
  ),
  tag: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h5.4a2 2 0 0 1 1.4.6l7.3 7.3a1.5 1.5 0 0 1 0 2.1l-5.6 5.6a1.5 1.5 0 0 1-2.1 0L4.6 12.3A2 2 0 0 1 4 10.9V5.5Z" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  note: (
    <>
      <path d="M6 4.5h8.2L19 9.3V19.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" />
      <path d="M14 4.5V9.5h5M8.5 13h7M8.5 16.5h5" />
    </>
  ),
  hand: (
    <path d="M8 11.5V5.8a1.3 1.3 0 0 1 2.6 0V11m0-6.3V4.3a1.3 1.3 0 0 1 2.6 0V11m0-5.6a1.3 1.3 0 0 1 2.6 0V11m0-3.4a1.3 1.3 0 0 1 2.6 0v6.9A5.5 5.5 0 0 1 12.9 20h-1.2a5.5 5.5 0 0 1-4.4-2.2l-3-4a1.4 1.4 0 0 1 2.1-1.8L8 13.5" />
  ),
  zoomIn: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 4.5 4.5M10.5 8v5M8 10.5h5" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 4.5 4.5M8 10.5h5" />
    </>
  ),
  fit: (
    <>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
    </>
  ),
  undo: (
    <>
      <path d="M8.5 7 5 10.5 8.5 14" />
      <path d="M5 10.5h9a4.5 4.5 0 0 1 0 9h-3" />
    </>
  ),
  redo: (
    <>
      <path d="m15.5 7 3.5 3.5-3.5 3.5" />
      <path d="M19 10.5h-9a4.5 4.5 0 0 0 0 9h3" />
    </>
  ),
  play: <path d="M8 6.2v11.6a.8.8 0 0 0 1.2.7l9.3-5.8a.8.8 0 0 0 0-1.4L9.2 5.5A.8.8 0 0 0 8 6.2Z" fill="currentColor" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />,
  pause: (
    <>
      <rect x="6.5" y="6" width="3.6" height="12" rx="1" fill="currentColor" />
      <rect x="13.9" y="6" width="3.6" height="12" rx="1" fill="currentColor" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6" />
      <circle cx="12" cy="12" r="6.2" />
    </>
  ),
  library: (
    <>
      <path d="M5 5v14M9 5v14M13 5.5l4.5 13" />
      <path d="M4 19h12" />
    </>
  ),
  chevronDown: <path d="m7 10 5 5 5-5" />,
  chevronRight: <path d="m10 7 5 5-5 5" />,
  chevronLeft: <path d="m14 7-5 5 5 5" />,
  chevronUpDown: <path d="m8.5 9.5 3.5-3.5 3.5 3.5M8.5 14.5l3.5 3.5 3.5-3.5" />,
  check: <path d="m6 12.5 4 4 8-9" />,
  close: <path d="m7 7 10 10M17 7 7 17" />,
  plus: <path d="M12 6v12M6 12h12" />,
  minus: <path d="M6 12h12" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 4.5 4.5" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6" />
    </>
  ),
  moon: <path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7Z" />,
  grid: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9.3h16M4 14.7h16M9.3 4v16M14.7 4v16" />
    </>
  ),
  magnet: (
    <>
      <path d="M6 4v8a6 6 0 0 0 12 0V4" />
      <path d="M6 4h4v8a2 2 0 0 0 4 0V4h4" />
      <path d="M6 8h4M14 8h4" />
    </>
  ),
  rotate: (
    <>
      <path d="M19 12a7 7 0 1 1-2.3-5.2" />
      <path d="M19 4v4h-4" />
    </>
  ),
  flipH: (
    <>
      <path d="M12 3.5v17" strokeDasharray="2.5 2.5" />
      <path d="M9 7 4.5 12 9 17V7ZM15 7l4.5 5L15 17V7Z" />
    </>
  ),
  trash: (
    <>
      <path d="M5 7h14M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M7 7l.8 11.5A1.5 1.5 0 0 0 9.3 20h5.4a1.5 1.5 0 0 0 1.5-1.5L17 7" />
      <path d="M10.2 10.5v6M13.8 10.5v6" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  warning: (
    <>
      <path d="M10.7 4.8 3.4 17.6A1.5 1.5 0 0 0 4.7 20h14.6a1.5 1.5 0 0 0 1.3-2.4L13.3 4.8a1.5 1.5 0 0 0-2.6 0Z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="16.8" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  bolt: <path d="M13.5 3.5 5.5 13.5h6l-1 7 8-10h-6l1-7Z" />,
  sidebarLeft: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M9.5 5v14" />
    </>
  ),
  sidebarRight: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M14.5 5v14" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  sparkle: (
    <path d="M12 3.5c.6 4.4 2.1 5.9 6.5 6.5-4.4.6-5.9 2.1-6.5 6.5-.6-4.4-2.1-5.9-6.5-6.5 4.4-.6 5.9-2.1 6.5-6.5ZM18.5 15c.3 1.7.8 2.2 2.5 2.5-1.7.3-2.2.8-2.5 2.5-.3-1.7-.8-2.2-2.5-2.5 1.7-.3 2.2-.8 2.5-2.5Z" />
  ),
  download: <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19.5h14" />,
  share: <path d="M12 15V4m0 0 4 4m-4-4L8 8M6 12v6.5A1.5 1.5 0 0 0 7.5 20h9a1.5 1.5 0 0 0 1.5-1.5V12" />,
  folder: (
    <path d="M4 7.5A1.5 1.5 0 0 1 5.5 6h4l2 2h7A1.5 1.5 0 0 1 20 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-10Z" />
  ),
  doc: (
    <>
      <path d="M6 4.5h8.2L19 9.3V19.5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1Z" />
      <path d="M14 4.5V9.5h5" />
    </>
  ),
  swatch: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="8.5" cy="10" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="7.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10.5" r="1.2" fill="currentColor" stroke="none" />
      <path d="M12 20.5c-2-.5-2.5-2-1.5-3.2.9-1 2.5-.8 3.7-1.1 1.6-.4 2.3-1.8 2.1-3" />
    </>
  ),
  ruler: (
    <>
      <path d="m3.5 15.5 12-12 5 5-12 12-5-5Z" />
      <path d="m8 11 1.8 1.8M11 8l1.8 1.8M14 5l1.8 1.8M5.5 13.5l1.8 1.8" />
    </>
  ),
  layers: (
    <>
      <path d="m12 4 8 4.5-8 4.5-8-4.5L12 4Z" />
      <path d="m4 12.5 8 4.5 8-4.5M4 16.5l8 4.5 8-4.5" />
    </>
  ),
  bell: (
    <>
      <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14l1.5-2Z" />
      <path d="M10 20.5a2 2 0 0 0 4 0" />
    </>
  ),
  keyboard: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <path d="M7 10h.01M10.3 10h.01M13.7 10h.01M17 10h.01M7 14h10" />
    </>
  ),

  // ─── Schematic symbols (IEC) ───
  resistor: (
    <>
      <path d="M2.5 12H6M18 12h3.5" />
      <rect x="6" y="8.5" width="12" height="7" rx="1" />
    </>
  ),
  capacitor: (
    <>
      <path d="M2.5 12h7M14.5 12h7" />
      <path d="M9.5 6v12M14.5 6v12" strokeWidth="2" />
    </>
  ),
  inductor: (
    <>
      <path d="M2.5 12h2.5M19 12h2.5" />
      <path d="M5 12a1.75 1.75 0 0 1 3.5 0 1.75 1.75 0 0 1 3.5 0 1.75 1.75 0 0 1 3.5 0 1.75 1.75 0 0 1 3.5 0" />
    </>
  ),
  source: (
    <>
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2.5V5M12 19v2.5" />
      <path d="M12 7.5v4M10 9.5h4M10 15h4" />
    </>
  ),
  ground: (
    <>
      <path d="M12 4v7" />
      <path d="M5 11h14M7.5 14.5h9M10 18h4" />
    </>
  ),
  diode: (
    <>
      <path d="M2.5 12H8M16 12h5.5" />
      <path d="M8 6.5 16 12l-8 5.5v-11Z" />
      <path d="M16 6.5v11" />
    </>
  ),
  led: (
    <>
      <path d="M2.5 13.5H8M16 13.5h5.5" />
      <path d="M8 8.5 16 13.5 8 18.5v-10Z" />
      <path d="M16 8.5v10" />
      <path d="m13 6.5 3-3.5M16.5 5.5 19.5 2" />
      <path d="m16 3-.5 2.5 2.5-.5M19 2.5l-.5 2.5 2.5-.5" strokeWidth="1.2" />
    </>
  ),
  transistor: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 7.5v9M9 12H4M9 10l5.5-4V3.5M9 14l5.5 4v2.5" />
      <path d="m14.5 18-2.3-.5.8-2.3" strokeWidth="1.2" />
    </>
  ),
  opamp: (
    <>
      <path d="M5 4.5v15l14-7.5-14-7.5Z" />
      <path d="M2.5 9H5M2.5 15H5M19 12h2.5" />
      <path d="M7 9h2.5M8.25 7.75v2.5M7 15h2.5" />
    </>
  ),
  ic: (
    <>
      <rect x="6" y="4" width="12" height="16" rx="1.5" />
      <path d="M3.5 7.5H6M3.5 12H6M3.5 16.5H6M18 7.5h2.5M18 12h2.5M18 16.5h2.5" />
      <circle cx="9" cy="7" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  switch: (
    <>
      <path d="M2.5 12h5M16.5 12h5" />
      <path d="m7.5 12 8-4.5" />
      <circle cx="7.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  lamp: (
    <>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M2.5 12H5.5M18.5 12h3M7.4 7.4l9.2 9.2M16.6 7.4l-9.2 9.2" />
    </>
  ),
  battery: (
    <>
      <path d="M2.5 12H8M16 12h5.5" />
      <path d="M8 6v12M11 9v6M13 6v12M16 9v6" strokeWidth="1.8" />
    </>
  ),
  potentiometer: (
    <>
      <path d="M2.5 12H6M18 12h3.5" />
      <rect x="6" y="8.5" width="12" height="7" rx="1" />
      <path d="M12 3.5v5" />
      <path d="m10 6 2 2.5L14 6" strokeWidth="1.2" />
    </>
  ),

  // ─── Instruments ───
  oscilloscope: (
    <path d="M3 12h3l2.5-6 3 12 2.5-8 1.5 4 1.5-2H21" />
  ),
  multimeter: (
    <>
      <path d="M4.5 16a8 8 0 0 1 15 0" />
      <path d="m12 16 3.5-5" />
      <circle cx="12" cy="16" r="1.3" fill="currentColor" stroke="none" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  funcgen: (
    <>
      <path d="M3 8c1.5-2.5 3-2.5 4.5 0s3 2.5 4.5 0 3-2.5 4.5 0 3 2.5 4.5 0" />
      <path d="M3 13h3v-3h3v6h3v-3h3v3h3v-3h3" />
      <path d="M3 19 7.5 15 12 19l4.5-4L21 19" />
    </>
  ),
  timer: (
    <>
      <circle cx="12" cy="13" r="7.5" />
      <path d="M12 9.5V13l2.5 2M10 3h4M12 3v2.5M17.5 7.5 19 6" />
    </>
  ),
  bode: (
    <>
      <path d="M4 4v16h16" />
      <path d="M6.5 8h5c2 0 3 1 4 3s2 4.5 4 4.5" />
    </>
  ),
  logicAnalyzer: (
    <>
      <path d="M3 7h3v4h4V7h3v4h4V7h4" />
      <path d="M3 17h5v-4h4v4h5v-4h4" />
    </>
  ),
  logicConverter: (
    <>
      <path d="M3 8h5M3 16h5M16 12h5" />
      <path d="M8 5.5h3.5a6.5 6.5 0 0 1 0 13H8v-13Z" />
      <path d="M8 9h3M8 15h3" strokeDasharray="1.5 1.5" />
    </>
  ),
  wattmeter: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m7.5 9 1.6 6 1.9-5 1.9 5 1.6-6" />
      <path d="M3.5 12H6M18 12h2.5" />
    </>
  ),
  spectrum: (
    <>
      <path d="M4 20V11M8 20V6M12 20v-9M16 20V9M20 20v-6" />
    </>
  ),
  counter: (
    <>
      <rect x="3" y="7" width="18" height="10" rx="2" />
      <path d="M7 10v4M11.5 10v4M15 10h2v4h-2" />
    </>
  ),
  distortion: (
    <>
      <path d="M3 12c1.2-5 2.4-5 3.6 0s2.4 5 3.6 0c.8-3.3 1.6-4.5 2.4-3.5s1.6 4 2.4 4.5c.8.5 1.6-1.5 2.4-4s1.6-2 2.4 3" />
    </>
  ),
  signal: (
    <>
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
      <path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.7 18.3a9 9 0 0 1 0-12.6M18.3 5.7a9 9 0 0 1 0 12.6" />
    </>
  ),
};

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
  strokeWidth?: number;
}

export function Icon({ name, size = 18, strokeWidth = 1.6, className, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ flexShrink: 0 }}
      {...rest}
    >
      {paths[name]}
    </svg>
  );
}

export const ICON_GROUPS: { title: string; icons: IconName[] }[] = [
  {
    title: "Werkzeuge & Steuerung",
    icons: [
      "cursor", "wire", "eraser", "probe", "tag", "note", "hand", "zoomIn", "zoomOut", "fit",
      "undo", "redo", "play", "stop", "pause", "gear", "library", "search", "rotate", "flipH",
      "magnet", "grid", "trash", "copy", "lock", "sparkle", "download", "share", "folder", "doc",
      "layers", "ruler", "swatch", "bell", "keyboard", "sun", "moon", "sidebarLeft", "sidebarRight",
      "more", "info", "warning", "bolt", "check", "close", "plus", "minus", "chevronDown",
      "chevronRight", "chevronLeft", "chevronUpDown",
    ],
  },
  {
    title: "Schaltzeichen (IEC)",
    icons: [
      "resistor", "potentiometer", "capacitor", "inductor", "source", "battery", "ground", "diode",
      "led", "transistor", "opamp", "ic", "switch", "lamp",
    ],
  },
  {
    title: "Messgeräte",
    icons: [
      "oscilloscope", "multimeter", "funcgen", "timer", "bode", "logicAnalyzer", "logicConverter",
      "wattmeter", "spectrum", "counter", "distortion", "signal",
    ],
  },
];
