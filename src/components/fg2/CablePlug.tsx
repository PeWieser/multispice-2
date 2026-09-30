/**
 * Runde 22 (W48): BNC-Stecker auf einer gesteckten Buchse.
 *
 * Der Original-FG der Demo zeichnete sein Patchfeld selbst (Stecker, Kabel,
 * Durchhang) – im Port entfiel das, weil die Verdrahtung im Schaltplan lebt.
 * Damit am Gerät trotzdem sichtbar ist, wo eine Messleitung steckt, zeigt das
 * Panel hier einen Stecker mit kurzem Kabelstummel, wenn die Buchse laut
 * Netzliste verbunden ist. Reine Anzeige: `pointer-events: none`, der Klick
 * geht weiter an die Buchse darunter.
 */
export function CablePlug({
  x,
  y,
  size = 78,
  tint,
  idPrefix,
}: {
  /** Mittelpunkt der Buchse (gleiches Koordinatensystem wie `<Bnc>`) */
  x: number;
  y: number;
  size?: number;
  /** Aderfarbe (Kabelkennung des Kanals) */
  tint: string;
  /** eindeutige Präfixe für die SVG-Gradienten (mehrere Stecker je Gerät) */
  idPrefix: string;
}) {
  const metal = `${idPrefix}-metal`;
  const boot = `${idPrefix}-boot`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      <defs>
        <radialGradient id={metal} cx="34%" cy="28%" r="80%">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.45" stopColor="#ccd1d7" />
          <stop offset="1" stopColor="#767c84" />
        </radialGradient>
        <linearGradient id={boot} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0f1113" />
          <stop offset="0.35" stopColor="#3a4047" />
          <stop offset="0.7" stopColor="#212528" />
          <stop offset="1" stopColor="#101214" />
        </linearGradient>
      </defs>

      {/* Kabelstummel unter dem Stecker (läuft aus dem Gerät hinaus) */}
      <path
        d="M50 34 C50 74, 44 92, 40 116"
        fill="none"
        stroke="#0d0f11"
        strokeWidth="14"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path d="M50 34 C50 74, 44 92, 40 116" fill="none" stroke="#2c3036" strokeWidth="9" strokeLinecap="round" />
      <path
        d="M50 34 C50 74, 44 92, 40 116"
        fill="none"
        stroke={tint}
        strokeWidth="9"
        strokeLinecap="round"
        opacity="0.12"
      />

      {/* Knickschutz */}
      <path
        d="M37 40 Q34 60 32 72 L68 72 Q66 60 63 40 Z"
        fill={`url(#${boot})`}
        stroke="rgba(0,0,0,.55)"
        strokeWidth="1"
      />
      {[0.25, 0.5, 0.75].map((f) => (
        <line
          key={f}
          x1={36 + f * 2}
          x2={64 - f * 2}
          y1={42 + f * 28}
          y2={42 + f * 28}
          stroke="rgba(0,0,0,.45)"
          strokeWidth="1.4"
        />
      ))}

      {/* Steckergehäuse */}
      <circle cx="52" cy="54" r="43" fill="rgba(0,0,0,.4)" />
      <circle cx="50" cy="50" r="42" fill={`url(#${metal})`} stroke="#4a4f56" strokeWidth="1.2" />
      {Array.from({ length: 24 }, (_, i) => (i * 360) / 24).map((a) => {
        const rad = (a * Math.PI) / 180;
        return (
          <line
            key={a}
            x1={50 + Math.cos(rad) * 36}
            y1={50 + Math.sin(rad) * 36}
            x2={50 + Math.cos(rad) * 42}
            y2={50 + Math.sin(rad) * 42}
            stroke="rgba(0,0,0,.3)"
            strokeWidth="1.2"
          />
        );
      })}
      {/* Aderkennung */}
      <circle cx="50" cy="50" r="32" fill="none" stroke={tint} strokeWidth="5" opacity="0.92" />
      <circle cx="50" cy="50" r="27" fill="#2a2e33" stroke="#5c626a" strokeWidth="1" />
      <circle cx="50" cy="50" r="13" fill="#0b0c0e" />
      <circle cx="50" cy="50" r="6" fill={`url(#${metal})`} stroke="#5a3d08" strokeWidth="1" />
      <circle cx="39" cy="39" r="8" fill="rgba(255,255,255,.5)" />
    </svg>
  );
}
