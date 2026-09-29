import { useEffect } from 'react';
import type { GeneratorCore } from '../generator/core';
import { normalized } from '../generator/waveforms';

let beepCtx: AudioContext | null = null;

/** Kurzer Tastenton (Utility → Beep) */
export function beep() {
  try {
    beepCtx = beepCtx ?? new AudioContext();
    const o = beepCtx.createOscillator();
    const g = beepCtx.createGain();
    o.frequency.value = 1900;
    g.gain.setValueAtTime(0.06, beepCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, beepCtx.currentTime + 0.05);
    o.connect(g).connect(beepCtx.destination);
    o.start();
    o.stop(beepCtx.currentTime + 0.06);
  } catch { /* Audio nicht verfügbar */ }
}

/**
 * Audio-Monitor: macht die aktiven Ausgänge hörbar (nur < 20 kHz, feste Lautstärke).
 * Dient nur der Demonstration und ist für die Portierung irrelevant.
 */
export function useAudioMonitor(core: GeneratorCore, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let ctx: AudioContext;
    try { ctx = new AudioContext(); } catch { return; }
    const proc = ctx.createScriptProcessor(2048, 0, 1);
    let t = 0;
    proc.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      const st = core.getState();
      for (let i = 0; i < out.length; i++) {
        const tt = t + i / ctx.sampleRate;
        let v = 0;
        for (const k of [0, 1] as const) {
          const c = st.ch[k];
          if (!c.output || !st.sys.power) continue;
          const audible = c.wave === 'noise' || c.mode === 'sweep' || c.mode === 'burst' || c.freq <= 20000;
          if (audible) v += normalized(c, tt) * 0.18;
        }
        out[i] = Math.max(-1, Math.min(1, v));
      }
      t += out.length / ctx.sampleRate;
    };
    proc.connect(ctx.destination);
    void ctx.resume();
    return () => {
      proc.disconnect();
      void ctx.close();
    };
  }, [core, enabled]);
}
