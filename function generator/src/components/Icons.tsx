import type { WaveId } from '../generator/types';

const paths: Record<WaveId, string> = {
  sine: 'M2 10 C6 -3 10 -3 14 10 S22 23 26 10',
  square: 'M2 14 V5 H9 V14 H16 V5 H23 V14 H27',
  ramp: 'M2 14 L8 5 L14 14 L20 5 L26 14',
  pulse: 'M2 14 H8 V5 H12 V14 H27',
  noise: 'M2 10 L4 5 L6 14 L8 7 L10 12 L12 4 L14 13 L16 8 L18 15 L20 6 L22 12 L24 7 L26 10',
  arb: 'M2 12 Q6 -2 10 10 T17 9 T22 4 T27 12',
};

export function WaveIcon({ wave }: { wave: WaveId }) {
  return (
    <svg width="30" height="20" viewBox="0 0 29 19" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[wave]} />
    </svg>
  );
}

export function PowerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
      <path d="M12 3v9" />
      <path d="M6.3 6.8a8 8 0 1 0 11.4 0" />
    </svg>
  );
}
