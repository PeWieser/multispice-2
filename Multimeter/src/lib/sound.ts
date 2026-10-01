/**
 * Procedural sound design for the virtual meter (Web Audio API, no audio files).
 * Every sound is layered from filtered noise transients and damped resonances,
 * slightly randomised and placed in the stereo field of the scene.
 */
export interface SoundSettings {
  enabled: boolean;
  volume: number;
  beeper: boolean;
}

interface Layer { gain: number; attack?: number; hold?: number; decay: number; pan?: number }
interface NoiseLayer extends Layer { filter: BiquadFilterType; freq: number; freqTo?: number; q?: number }
interface ToneLayer extends Layer { freq: number; freqTo?: number; wave?: OscillatorType }

const STORAGE_KEY = 'voltwerk-sound';
const DEFAULT_SETTINGS: SoundSettings = { enabled: true, volume: .7, beeper: true };
const SCENE_WIDTH = 760;
/** Typical resonance of the piezo disc in a handheld meter. */
const PIEZO_HZ = 3150;
/** Inharmonic partials of a steel probe tip striking a terminal: ratio, gain, decay. */
const PROBE_PARTIALS: ReadonlyArray<readonly [number, number, number]> = [[1, .085, .07], [1.69, .05, .045], [2.47, .03, .03], [3.31, .015, .02]];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const vary = (value: number, spread: number) => value * (1 + (Math.random() * 2 - 1) * spread);

/** Maps an x coordinate of the SVG scene to a subtle stereo position. */
export function panAt(x: number) {
  return clamp((x / SCENE_WIDTH * 2 - 1) * .7, -.65, .65);
}

function loadSettings(): SoundSettings {
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<SoundSettings> | null;
    return {
      enabled: typeof stored?.enabled === 'boolean' ? stored.enabled : DEFAULT_SETTINGS.enabled,
      volume: typeof stored?.volume === 'number' ? clamp(stored.volume, 0, 1) : DEFAULT_SETTINGS.volume,
      beeper: typeof stored?.beeper === 'boolean' ? stored.beeper : DEFAULT_SETTINGS.beeper,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

class SoundEngine {
  settings: SoundSettings = loadSettings();
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private unlocked = false;
  private continuity: { oscillator: OscillatorNode; gain: GainNode } | null = null;
  private continuityWanted = false;
  private continuityPan = 0;
  private readonly lastPlayed = new Map<string, number>();

  constructor() {
    document.addEventListener('visibilitychange', () => this.syncPower());
  }

  configure(settings: SoundSettings) {
    this.settings = { enabled: settings.enabled, volume: clamp(settings.volume, 0, 1), beeper: settings.beeper };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings)); } catch { /* storage blocked */ }
    if (this.context && this.output) this.output.gain.setTargetAtTime(this.level(), this.context.currentTime, .02);
    this.syncPower();
  }

  /** Call from a user gesture: browsers keep audio locked until the first one. */
  unlock() {
    if (!this.settings.enabled || !this.createContext()) return;
    this.unlocked = true;
    this.syncPower();
  }

  /** Suspends audio while muted or hidden, so nothing keeps sounding in a background tab. */
  private syncPower() {
    const context = this.context;
    if (context && context.state !== 'closed') {
      const active = this.settings.enabled && this.unlocked && !document.hidden;
      if (active && context.state === 'suspended') void context.resume().catch(() => undefined);
      if (!active && context.state === 'running') void context.suspend().catch(() => undefined);
    }
    this.updateContinuity();
  }

  private level() {
    return this.settings.volume ** 2 * .85;
  }

  private createContext() {
    if (this.context && this.context.state !== 'closed') return this.context;
    const Context: typeof AudioContext | undefined = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return null;
    try {
      const context = new Context({ latencyHint: 'interactive' });
      const output = context.createGain();
      output.gain.value = this.level();
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.knee.value = 10;
      compressor.ratio.value = 4;
      compressor.attack.value = .002;
      compressor.release.value = .15;
      // A short, dark room response puts the device on a desk instead of inside the headphones.
      const room = context.createConvolver();
      room.buffer = this.roomResponse(context);
      const wet = context.createGain();
      wet.gain.value = .14;
      output.connect(compressor);
      output.connect(room);
      room.connect(wet);
      wet.connect(compressor);
      compressor.connect(context.destination);
      const noise = context.createBuffer(1, Math.floor(context.sampleRate * 2), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let index = 0; index < samples.length; index += 1) samples[index] = Math.random() * 2 - 1;
      this.context = context;
      this.output = output;
      this.noise = noise;
      return context;
    } catch {
      return null;
    }
  }

  private roomResponse(context: AudioContext) {
    const length = Math.floor(context.sampleRate * .3);
    const response = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < 2; channel += 1) {
      const samples = response.getChannelData(channel);
      let smooth = 0;
      for (let index = 0; index < length; index += 1) {
        smooth = smooth * .55 + (Math.random() * 2 - 1) * .45;
        samples[index] = smooth * (1 - index / length) ** 4;
      }
    }
    return response;
  }

  /** Audio time for a new sound, or null while muted, hidden or still locked. */
  private schedule(delay = 0) {
    const context = this.context;
    if (!this.settings.enabled || !this.unlocked || !context || !this.output || context.state === 'closed' || document.hidden) return null;
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    return context.currentTime + .005 + Math.max(0, delay);
  }

  private throttle(key: string, interval: number) {
    const now = performance.now();
    if (now - (this.lastPlayed.get(key) ?? -Infinity) < interval) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private route(node: AudioNode, pan: number, nodes: AudioNode[]) {
    const context = this.context!, output = this.output!;
    if (pan !== 0 && typeof context.createStereoPanner === 'function') {
      const panner = context.createStereoPanner();
      panner.pan.value = clamp(pan, -1, 1);
      node.connect(panner);
      panner.connect(output);
      nodes.push(panner);
    } else node.connect(output);
  }

  private envelope(param: AudioParam, time: number, { gain, attack = .0008, hold = 0, decay }: Layer) {
    param.setValueAtTime(.0001, time);
    param.linearRampToValueAtTime(gain, time + attack);
    if (hold > 0) param.setValueAtTime(gain, time + attack + hold);
    param.exponentialRampToValueAtTime(.0001, time + attack + hold + decay);
    return attack + hold + decay;
  }

  private noiseLayer(time: number, layer: NoiseLayer) {
    const context = this.context!, buffer = this.noise!;
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = layer.filter;
    filter.Q.value = layer.q ?? 1;
    const amp = context.createGain();
    const length = this.envelope(amp.gain, time, layer);
    filter.frequency.setValueAtTime(layer.freq, time);
    if (layer.freqTo) filter.frequency.exponentialRampToValueAtTime(layer.freqTo, time + length);
    const nodes: AudioNode[] = [source, filter, amp];
    source.connect(filter);
    filter.connect(amp);
    this.route(amp, layer.pan ?? 0, nodes);
    source.onended = () => nodes.forEach((node) => node.disconnect());
    source.start(time, Math.random() * Math.max(0, buffer.duration - length - .1));
    source.stop(time + length + .02);
  }

  private toneLayer(time: number, layer: ToneLayer) {
    const context = this.context!;
    const oscillator = context.createOscillator();
    oscillator.type = layer.wave ?? 'sine';
    const amp = context.createGain();
    const length = this.envelope(amp.gain, time, layer);
    oscillator.frequency.setValueAtTime(layer.freq, time);
    if (layer.freqTo) oscillator.frequency.exponentialRampToValueAtTime(layer.freqTo, time + length);
    const nodes: AudioNode[] = [oscillator, amp];
    oscillator.connect(amp);
    this.route(amp, layer.pan ?? 0, nodes);
    oscillator.onended = () => nodes.forEach((node) => node.disconnect());
    oscillator.start(time);
    oscillator.stop(time + length + .02);
  }

  /** Square drive through the disc resonance: the slightly harsh timbre of a piezo beeper. */
  private piezo(pan: number) {
    const context = this.context!;
    const oscillator = context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.value = vary(PIEZO_HZ, .003);
    const resonance = context.createBiquadFilter();
    resonance.type = 'bandpass';
    resonance.frequency.value = PIEZO_HZ;
    resonance.Q.value = 1.6;
    const gain = context.createGain();
    gain.gain.value = .0001;
    const nodes: AudioNode[] = [oscillator, resonance, gain];
    oscillator.connect(resonance);
    resonance.connect(gain);
    this.route(gain, pan, nodes);
    oscillator.onended = () => nodes.forEach((node) => node.disconnect());
    return { oscillator, gain };
  }

  // Rotary switch

  /** One audible detent per switch position passed. */
  rotarySwitch(steps: number, pan = 0) {
    const time = this.schedule();
    if (time === null || steps < 1) return;
    const count = Math.min(steps, 8);
    const spacing = count === 1 ? 0 : clamp(.19 / count, .026, .046);
    for (let step = 0; step < count; step += 1) this.detent(time + step * spacing + Math.random() * .004, pan);
  }

  private detent(time: number, pan: number) {
    this.noiseLayer(time, { filter: 'bandpass', freq: vary(5200, .1), q: .8, gain: .09, decay: .006, pan });
    const snap = time + vary(.011, .25);
    this.noiseLayer(snap, { filter: 'bandpass', freq: vary(2500, .08), q: 1.15, gain: .5, decay: .024, pan });
    this.noiseLayer(snap, { filter: 'highpass', freq: 6500, q: .7, gain: .15, decay: .004, pan });
    this.toneLayer(snap, { freq: vary(1150, .05), gain: .07, decay: .035, pan });
    this.toneLayer(snap, { freq: vary(215, .05), freqTo: 135, gain: .26, decay: .05, pan });
  }

  /** Dull knock against the hard stop at either end of the switch. */
  rotaryEndStop(pan = 0) {
    const time = this.schedule();
    if (time === null || !this.throttle('end-stop', 180)) return;
    this.toneLayer(time, { freq: 150, freqTo: 92, gain: .3, decay: .07, pan });
    this.noiseLayer(time, { filter: 'lowpass', freq: 850, gain: .24, decay: .022, pan });
    this.noiseLayer(time, { filter: 'bandpass', freq: 1700, q: 1.3, gain: .07, decay: .012, pan });
  }

  // Rubber keys and beeper

  buttonDown(pan = 0) {
    const time = this.schedule();
    if (time !== null) this.domeDown(time, pan);
  }

  buttonUp(pan = 0) {
    const time = this.schedule();
    if (time !== null) this.domeUp(time, pan);
  }

  buttonTap(pan = 0) {
    const time = this.schedule();
    if (time === null) return;
    this.domeDown(time, pan);
    this.domeUp(time + vary(.075, .15), pan);
  }

  private domeDown(time: number, pan: number) {
    this.noiseLayer(time, { filter: 'bandpass', freq: vary(1900, .08), q: .9, gain: .3, decay: .016, pan });
    this.noiseLayer(time, { filter: 'highpass', freq: 4200, gain: .06, decay: .003, pan });
    this.toneLayer(time, { freq: vary(310, .05), freqTo: 190, gain: .14, decay: .03, pan });
  }

  private domeUp(time: number, pan: number) {
    this.noiseLayer(time, { filter: 'bandpass', freq: vary(2900, .08), q: 1.2, gain: .15, decay: .011, pan });
    this.toneLayer(time, { freq: vary(460, .05), freqTo: 330, gain: .05, decay: .02, pan });
  }

  keyBeep(pan = 0) {
    this.beep(.045, pan);
  }

  /** Two short beeps: the meter rejects the key, e.g. RANGE during HOLD. */
  invalidBeep(pan = 0) {
    this.beep(.035, pan);
    this.beep(.035, pan, .085);
  }

  /** MIN MAX AVG has recorded a new high or low. */
  extremeBeep(pan = 0) {
    if (this.throttle('extreme', 280)) this.beep(.03, pan);
  }

  private beep(duration: number, pan: number, delay = 0) {
    const time = this.schedule(delay);
    if (time === null || !this.settings.beeper) return;
    const { oscillator, gain } = this.piezo(pan);
    this.envelope(gain.gain, time, { gain: .085, attack: .002, hold: duration, decay: .008 });
    oscillator.start(time);
    oscillator.stop(time + duration + .03);
  }

  /** Continuous continuity tone; the caller applies the meter's hysteresis. */
  setContinuity(active: boolean, pan = 0) {
    this.continuityWanted = active;
    this.continuityPan = pan;
    this.updateContinuity();
  }

  private updateContinuity() {
    const context = this.context;
    const play = this.continuityWanted && this.settings.enabled && this.settings.beeper && this.unlocked && !document.hidden;
    if (play && !this.continuity && context && this.output && context.state !== 'closed') {
      const time = context.currentTime + .005;
      const tone = this.piezo(this.continuityPan);
      tone.gain.gain.setValueAtTime(.0001, time);
      tone.gain.gain.linearRampToValueAtTime(.075, time + .003);
      tone.oscillator.start(time);
      this.continuity = tone;
    } else if (!play && this.continuity && context) {
      const { oscillator, gain } = this.continuity;
      const time = context.currentTime;
      gain.gain.cancelScheduledValues(time);
      gain.gain.setValueAtTime(gain.gain.value, time);
      gain.gain.linearRampToValueAtTime(.0001, time + .008);
      oscillator.stop(time + .02);
      this.continuity = null;
    }
  }

  // Banana plugs

  plugIn(pan = 0, delay = 0) {
    const time = this.schedule(delay);
    if (time === null) return;
    const slide = vary(.11, .12);
    // Spring lamellae scrape along the socket wall, then the shroud seats.
    this.noiseLayer(time, { filter: 'bandpass', freq: 1500, freqTo: 3100, q: 1.8, gain: .11, attack: .015, hold: slide - .03, decay: .02, pan });
    for (let ridge = 0; ridge < 5; ridge += 1) {
      this.noiseLayer(time + .012 + ridge * slide / 5.5, { filter: 'bandpass', freq: vary(2300 + ridge * 280, .05), q: 2.4, gain: vary(.09, .25), decay: .012, pan });
    }
    this.toneLayer(time + .02, { freq: vary(5200, .04), gain: .012, attack: .01, hold: slide - .04, decay: .03, pan });
    const seat = time + slide;
    this.toneLayer(seat, { freq: vary(185, .06), freqTo: 105, gain: .4, decay: .08, pan });
    this.noiseLayer(seat, { filter: 'lowpass', freq: 1100, gain: .3, decay: .026, pan });
    this.noiseLayer(seat, { filter: 'bandpass', freq: 3400, q: 1, gain: .13, decay: .006, pan });
  }

  plugOut(pan = 0, delay = 0) {
    const time = this.schedule(delay);
    if (time === null) return;
    // The contacts let go, the plug slides out and the tip leaves the socket.
    this.noiseLayer(time, { filter: 'bandpass', freq: 1300, q: 1, gain: .25, decay: .014, pan });
    this.toneLayer(time, { freq: 275, freqTo: 170, gain: .15, decay: .035, pan });
    const slide = vary(.085, .15), start = time + .018;
    this.noiseLayer(start, { filter: 'bandpass', freq: 3000, freqTo: 1500, q: 1.8, gain: .1, attack: .006, hold: slide - .02, decay: .015, pan });
    for (let ridge = 0; ridge < 4; ridge += 1) {
      this.noiseLayer(start + .008 + ridge * slide / 4.5, { filter: 'bandpass', freq: vary(3100 - ridge * 320, .05), q: 2.4, gain: vary(.07, .25), decay: .01, pan });
    }
    this.toneLayer(start + slide, { freq: vary(4800, .06), gain: .03, decay: .03, pan });
    this.noiseLayer(start + slide, { filter: 'highpass', freq: 5000, gain: .05, decay: .004, pan });
  }

  // Probes

  probeContact(pan = 0, delay = 0) {
    const time = this.schedule(delay);
    if (time === null) return;
    this.noiseLayer(time, { filter: 'highpass', freq: 3500, gain: .18, decay: .003, pan });
    const base = vary(2950, .06);
    for (const [ratio, gain, decay] of PROBE_PARTIALS) this.toneLayer(time, { freq: base * ratio, gain, decay, pan });
    this.toneLayer(time, { freq: vary(430, .05), freqTo: 300, gain: .07, decay: .02, pan });
  }

  probeLift(pan = 0, delay = 0) {
    const time = this.schedule(delay);
    if (time === null) return;
    this.noiseLayer(time, { filter: 'bandpass', freq: 4600, q: 1.5, gain: .06, attack: .004, decay: .025, pan });
    this.toneLayer(time, { freq: vary(3200, .05), gain: .012, decay: .015, pan });
  }

  probePickup(pan = 0) {
    const time = this.schedule();
    if (time === null || !this.throttle('pickup', 120)) return;
    this.noiseLayer(time, { filter: 'lowpass', freq: 1400, gain: .08, attack: .01, decay: .06, pan });
    this.noiseLayer(time + .01, { filter: 'bandpass', freq: vary(2400, .2), q: .7, gain: .035, attack: .01, decay: .05, pan });
  }

  /** Plastic probe laid down on the bench, with a small bounce. */
  probeDrop(pan = 0) {
    const time = this.schedule();
    if (time === null) return;
    this.toneLayer(time, { freq: vary(560, .06), freqTo: 400, gain: .15, decay: .04, pan });
    this.noiseLayer(time, { filter: 'bandpass', freq: 1900, q: .8, gain: .19, decay: .012, pan });
    const bounce = time + vary(.05, .15);
    this.toneLayer(bounce, { freq: vary(610, .06), freqTo: 450, gain: .055, decay: .025, pan });
    this.noiseLayer(bounce, { filter: 'bandpass', freq: 2100, q: .8, gain: .065, decay: .008, pan });
  }

  /** Cable rustle while a probe moves; intensity follows the hand speed. */
  cableRustle(intensity: number, pan = 0) {
    if (intensity < .08 || !this.throttle('rustle', 55)) return;
    const time = this.schedule();
    if (time === null) return;
    this.noiseLayer(time, { filter: 'bandpass', freq: vary(2200, .3), q: .7, gain: .045 * Math.min(1, intensity), attack: .012, decay: .05, pan });
  }

  // Test bench

  /** Rocker switch of the bench source, followed by its output relay. */
  rockerSwitch(on: boolean, pan = 0, delay = 0) {
    const time = this.schedule(delay);
    if (time === null) return;
    this.noiseLayer(time, { filter: 'bandpass', freq: on ? 2300 : 1950, q: 1, gain: .42, decay: .018, pan });
    this.noiseLayer(time, { filter: 'highpass', freq: 5000, gain: .09, decay: .003, pan });
    this.toneLayer(time, { freq: on ? 140 : 122, freqTo: 85, gain: .28, decay: .06, pan });
    this.toneLayer(time, { freq: vary(950, .05), gain: .05, decay: .03, pan });
    const relay = time + vary(.035, .2);
    this.noiseLayer(relay, { filter: 'bandpass', freq: 3800, q: 2, gain: .11, decay: .008, pan });
    this.toneLayer(relay, { freq: vary(1600, .05), gain: .025, decay: .015, pan });
  }

  /** Small slide switch that opens or closes the test connection. */
  slideSwitch(pan = 0, delay = 0) {
    const time = this.schedule(delay);
    if (time === null) return;
    this.noiseLayer(time, { filter: 'bandpass', freq: 2600, freqTo: 3400, q: 1.4, gain: .08, attack: .006, decay: .03, pan });
    const snap = time + .03;
    this.noiseLayer(snap, { filter: 'bandpass', freq: vary(3000, .08), q: 1.2, gain: .24, decay: .012, pan });
    this.toneLayer(snap, { freq: vary(700, .05), freqTo: 520, gain: .06, decay: .025, pan });
  }

  /** Test board placed on the bench. */
  boardPlace(pan = 0, delay = 0) {
    const time = this.schedule(delay);
    if (time === null) return;
    this.toneLayer(time, { freq: 240, freqTo: 170, gain: .2, decay: .07, pan });
    this.noiseLayer(time, { filter: 'lowpass', freq: 1300, gain: .2, decay: .03, pan });
    this.noiseLayer(time, { filter: 'bandpass', freq: 3200, q: 1.5, gain: .05, decay: .02, pan });
    const corner = time + vary(.028, .2);
    this.toneLayer(corner, { freq: 300, freqTo: 210, gain: .09, decay: .05, pan });
    this.noiseLayer(corner, { filter: 'lowpass', freq: 1600, gain: .09, decay: .02, pan });
  }

  /** Detent of the source's adjustment knob. */
  encoderTick(pan = 0) {
    if (!this.throttle('encoder', 45)) return;
    const time = this.schedule();
    if (time === null) return;
    this.noiseLayer(time, { filter: 'bandpass', freq: vary(3600, .1), q: 1.6, gain: .06, decay: .006, pan });
    this.toneLayer(time, { freq: vary(1900, .05), gain: .012, decay: .012, pan });
  }

  /** Volume preview: one key press with its confirmation beep. */
  preview(pan = 0) {
    this.buttonTap(pan);
    this.beep(.045, pan, .14);
  }
}

export const sound = new SoundEngine();
