// Test-signal engine. Simulates a small demo board that the scope probes
// are connected to. Default demo is a classic astable multivibrator whose
// two collector outputs (Q1 / Q2) feed CH1 and CH2.

export type SourceType = "astable" | "sine" | "triangle" | "square" | "off";

export interface CircuitState {
  source: SourceType;
  freq: number; // Hz
  amplitude: number; // Vpp
  offset: number; // V DC offset
}

const VCC = 5;
const VSAT = 0.12;

// Astable multivibrator collector output.
// `chanPhase` = 0 for Q1, 0.5 for Q2 (complementary).
function astable(t: number, freq: number, chanPhase: number): number {
  const T = 1 / freq;
  let ph = ((t * freq) % 1 + 1 + chanPhase) % 1; // 0..1
  const half = 0.5;
  // rounded rising edge time constant relative to half period
  const tau = half * T * 0.14;
  if (ph < half) {
    // "high" half: collector rises from ~0 up towards VCC (rounded leading edge)
    const tl = ph * T;
    return VSAT + (VCC - VSAT) * (1 - Math.exp(-tl / tau));
  }
  // "low" half: transistor conducting -> saturated near 0V (sharp fall)
  return VSAT;
}

// Return voltage at time t for a given channel (0 = CH1, 1 = CH2)
export function signalAt(c: CircuitState, channel: number, t: number): number {
  if (c.source === "off") return 0;
  const w = 2 * Math.PI * c.freq;
  const half = c.amplitude / 2;

  if (c.source === "astable") {
    // Q1 and Q2 outputs of the multivibrator (fixed 0..5V logic swing)
    return astable(t, c.freq, channel === 0 ? 0 : 0.5);
  }

  // Function-generator style sources. CH2 is phase shifted 90deg to show
  // two distinct traces on the screen.
  const phase = channel === 0 ? 0 : Math.PI / 2;
  const x = w * t + phase;

  switch (c.source) {
    case "sine":
      return c.offset + half * Math.sin(x);
    case "square":
      return c.offset + half * (Math.sin(x) >= 0 ? 1 : -1);
    case "triangle": {
      const p = ((x / (2 * Math.PI)) % 1 + 1) % 1;
      const tri = p < 0.5 ? 4 * p - 1 : 3 - 4 * p;
      return c.offset + half * tri;
    }
    default:
      return 0;
  }
}

// Human readable description of the demo circuit / expected values
export function circuitInfo(c: CircuitState) {
  switch (c.source) {
    case "astable":
      return {
        title: "Astabile Kippstufe",
        detail: "2× BC547 · Q1→CH1 · Q2→CH2 · Vcc 5 V",
      };
    case "sine":
      return { title: "Sinusgenerator", detail: "CH1 0° · CH2 90°" };
    case "triangle":
      return { title: "Dreieckgenerator", detail: "CH1 · CH2 90°" };
    case "square":
      return { title: "Rechteck / Probe-Cal", detail: "CH1 · CH2 90°" };
    default:
      return { title: "Kein Signal", detail: "Eingänge offen" };
  }
}
