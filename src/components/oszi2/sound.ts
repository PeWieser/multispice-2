/* W32d: Klick-Geräusche – Web-Audio-Synthese ohne Assets. Ein gemeinsamer
 * AudioContext entsteht beim ersten Klick (Autoplay-Richtlinie der Browser);
 * jeder Klang ist kurz und leise (Geräte-Zimmer, keine Soundeffekt-Show).
 * 'key'      – Frontplatten-Tasten (harter Mikroschalter)
 * 'knob'     – Encoder-Rastung (leises Tick, drosselt automatisch)
 * 'plug'     – BNC-Stecker (zwei Transienten + weicher Thunk)
 * 'relay'    – Netzschalter (doppeltes Klicken eines Relais)
 */

type Kind = 'key' | 'knob' | 'plug' | 'relay';

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let lastKnob = 0;

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function noise(a: AudioContext): AudioBuffer {
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, Math.floor(a.sampleRate * 0.12), a.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return noiseBuf;
}

/** Ein Transient: gefiltertes Rauschen mit schneller Ausblendung. */
function burst(a: AudioContext, t: number, freq: number, q: number, gain: number, dur: number, type: BiquadFilterType = 'bandpass') {
  const src = a.createBufferSource();
  src.buffer = noise(a);
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
  src.stop(t + dur + 0.02);
}

/** Ein „Ton"-Transient: schnelles Sinus-Tick mit Ausklang. */
function tick(a: AudioContext, t: number, freq: number, gain: number, dur: number) {
  const o = a.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 0.55, t + dur);
  const g = a.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function click(kind: Kind = 'key'): void {
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  if (kind === 'knob') {
    const now = performance.now();
    if (now - lastKnob < 65) return; // Rastung: nicht mehr als ~15 Hz
    lastKnob = now;
    burst(a, t, 3200, 2.5, 0.05, 0.012);
    tick(a, t, 1750, 0.028, 0.012);
  } else if (kind === 'key') {
    burst(a, t, 2400, 1.6, 0.1, 0.018);
    tick(a, t, 950, 0.06, 0.03);
  } else if (kind === 'plug') {
    burst(a, t, 1800, 1.2, 0.11, 0.02);
    burst(a, t + 0.045, 1100, 1.4, 0.09, 0.025);
    tick(a, t + 0.05, 140, 0.1, 0.09);
  } else {
    // relay – Doppelklick mit etwas Gehäuse-Summen
    burst(a, t, 420, 1.1, 0.16, 0.03, 'lowpass');
    tick(a, t, 110, 0.13, 0.05);
    burst(a, t + 0.085, 380, 1.1, 0.13, 0.035, 'lowpass');
    tick(a, t + 0.085, 95, 0.11, 0.06);
    tick(a, t + 0.12, 70, 0.05, 0.18);
  }
}
