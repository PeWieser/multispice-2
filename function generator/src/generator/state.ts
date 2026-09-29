import type { Channel, GenState, Snapshot } from './types';

export function defaultChannel(): Channel {
  return {
    output: false,
    wave: 'sine',
    freq: 1000,
    amp: 1,
    offset: 0,
    phase: 0,
    duty: 50,
    symmetry: 50,
    width: 500e-6,
    delay: 0,
    arb: 0,
    freqView: 'freq',
    ampView: 'amp',
    offView: 'offset',
    load: 'highz',
    mode: 'off',
    mod: { shape: 'sine', freq: 100, depth: 100, devFreq: 100, devPhase: 90, hopFreq: 2000, rate: 10 },
    sweep: { start: 100, stop: 10000, time: 1, type: 'lin' },
    burst: { cycles: 3, period: 0.01 },
  };
}

export function initialState(mem?: (Snapshot | null)[]): GenState {
  const a = defaultChannel();
  a.output = true;
  return {
    active: 0,
    ch: [a, defaultChannel()],
    ui: {
      page: 'main',
      menuPage: 0,
      focus: 'freq',
      cursorExp: 3,
      edit: null,
      both: false,
      help: false,
      helpText: '',
      msg: '',
      msgId: 0,
    },
    sys: {
      power: true,
      beep: true,
      sync: true,
      brightness: 5,
      audio: false,
      coupleFreq: false,
      coupleAmp: false,
      slot: 0,
      mem: mem && mem.length === 4 ? mem : [null, null, null, null],
    },
  };
}
