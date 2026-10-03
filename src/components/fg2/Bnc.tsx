interface BncProps {
  x: number;
  y: number;
  size?: number;
  live?: boolean;
  title?: string;
  /** Kennung für das Patchfeld (Kabel-Ebene misst darüber die Position) */
  jackId?: string;
  /** Runde 19 (W36): Kabel an dieser Buchse aufgenommen (Multispice). */
  held?: boolean;
  /** Runde 19 (W36): Klick nimmt das Kabel auf / steckt es zurück. */
  onClick?: () => void;
}

/** BNC-Buchse (SVG), Mittelpunkt bei (x, y) */
export function Bnc({ x, y, size = 78, live = false, title, jackId, held = false, onClick }: BncProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      data-jack={jackId}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onPointerDown={
        onClick
          ? (e) => {
              if (e.button === 0) {
                e.stopPropagation();
                onClick();
              }
            }
          : undefined
      }
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      style={{
        position: 'absolute',
        left: x - size / 2,
        top: y - size / 2,
        overflow: 'visible',
        cursor: onClick ? 'pointer' : undefined,
        filter: held ? 'drop-shadow(0 0 6px rgba(255,238,150,.95))' : undefined,
      }}
    >
      <title>{title}</title>
      <defs>
        <radialGradient id="bnc-nut" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#fdfdfd" />
          <stop offset="0.45" stopColor="#c9ced4" />
          <stop offset="1" stopColor="#7d838b" />
        </radialGradient>
        <radialGradient id="bnc-inner" cx="50%" cy="45%" r="60%">
          <stop offset="0" stopColor="#f0f2f4" />
          <stop offset="0.6" stopColor="#aab0b8" />
          <stop offset="1" stopColor="#6c727a" />
        </radialGradient>
        <radialGradient id="bnc-pin" cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset="0.6" stopColor="#c8952a" />
          <stop offset="1" stopColor="#7a5410" />
        </radialGradient>
      </defs>
      <ellipse cx="52" cy="58" rx="46" ry="44" fill="rgba(0,0,0,.35)" />
      {/* Bajonett-Zapfen */}
      <rect x="0" y="43" width="14" height="14" rx="5" fill="url(#bnc-nut)" stroke="#5c6168" strokeWidth="1" />
      <rect x="86" y="43" width="14" height="14" rx="5" fill="url(#bnc-nut)" stroke="#5c6168" strokeWidth="1" />
      <circle cx="50" cy="50" r="45" fill="url(#bnc-nut)" stroke="#565b62" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="38" fill="none" stroke="rgba(0,0,0,.22)" strokeWidth="2" />
      <circle cx="50" cy="50" r="33" fill="url(#bnc-inner)" stroke="#5a5f66" strokeWidth="1.2" />
      <circle cx="50" cy="50" r="24" fill="#15171a" stroke="#000" strokeWidth="1" />
      <circle cx="50" cy="50" r="22" fill="#26292e" />
      <circle cx="50" cy="50" r="15" fill="#0b0c0e" />
      <circle cx="50" cy="50" r="7" fill="url(#bnc-pin)" stroke="#5a3d08" strokeWidth="1" />
      <circle cx="48" cy="48" r="2" fill="rgba(255,255,255,.75)" />
      {live && <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(120,255,160,.55)" strokeWidth="2" />}
      {held && <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,238,150,.95)" strokeWidth="3" strokeDasharray="6 5" />}
    </svg>
  );
}
