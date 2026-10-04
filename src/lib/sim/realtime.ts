/**
 * Interactive real-time simulation engine.
 * Runs the transient solver in wall-clock slices with an adjustable time scale,
 * feeds ring buffers for the virtual instruments and exposes live device state
 * (LED brightness, switch positions, meter readings).
 */

import { buildNets, SchematicDoc } from "@/lib/schematic/model";
import { Device, IntegrationMethod, Netlist, Simulator } from "./engine";

export class RingBuffer {
  t: Float64Array;
  v: Float64Array;
  head = 0;
  count = 0;
  constructor(public capacity: number) {
    this.t = new Float64Array(capacity);
    this.v = new Float64Array(capacity);
  }
  push(t: number, v: number): void {
    this.t[this.head] = t;
    this.v[this.head] = v;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }
  clear(): void {
    this.head = 0;
    this.count = 0;
  }
  /** Returns the newest `n` samples in chronological order. */
  window(n: number): { t: number[]; v: number[] } {
    const len = Math.min(n, this.count);
    const t: number[] = [];
    const v: number[] = [];
    for (let i = len - 1; i >= 0; i--) {
      const idx = (this.head - 1 - i + this.capacity * 2) % this.capacity;
      t.push(this.t[idx]);
      v.push(this.v[idx]);
    }
    return { t, v };
  }
  last(): number {
    if (!this.count) return 0;
    return this.v[(this.head - 1 + this.capacity) % this.capacity];
  }
}

export interface RealtimeOptions {
  sampleRate: number;
  timeScale: number;
  method: IntegrationMethod;
  temperature: number;
  maxStepsPerFrame: number;
}

export interface LiveState {
  time: number;
  nets: Record<string, number>;
  currents: Record<string, number>;
  power: Record<string, number>;
  ok: boolean;
  message?: string;
  stepsPerSecond: number;
  realtimeFactor: number;
  /** S2.2: OP-Konvergenz-Diagnose (nur bei ok:false belegt). */
  failure?: "singular" | "nonconvergent";
  suspects?: string[];
  /** S2.4: ehrliche Überlast-Anzeige (pro Tick aktualisiert). */
  overload?: boolean;
  effectiveSampleRate?: number;
  droppedSec?: number;
}

export class RealtimeEngine {
  sim: Simulator | null = null;
  netlist: Netlist = { devices: [] };
  buffers = new Map<string, RingBuffer>();
  /** Runde 16 (W31d): Langzeit-Tier für das Oszilloskop – ~3,3 kSa/s
   *  (jedes 12. Fast-Sample), 8192 Samples ≈ 2,5 s Historie, damit langsame
   *  Zeiteinstellungen nicht in geklammerte Randwerte laufen. */
  slowBuffers = new Map<string, RingBuffer>();
  private slowPushCounter = 0;
  /** R13: Zweigströme als Zeitreihe – pro Gerät ein Ringpuffer. */
  deviceBuffers = new Map<string, RingBuffer>();
  options: RealtimeOptions = {
    sampleRate: 200000,
    timeScale: 1,
    method: "trap",
    temperature: 27,
    maxStepsPerFrame: 3000,
  };
  controls: Record<string, number> = {};
  running = false;
  errors: string[] = [];
  warnings: string[] = [];
  lastState: LiveState = { time: 0, nets: {}, currents: {}, power: {}, ok: true, stepsPerSecond: 0, realtimeFactor: 0 };
  private stepAccumulator = 0;
  private stepsSinceSample = 0;
  private lastPerfTime = 0;
  private stepsThisSecond = 0;
  private simTimeThisSecond = 0;
  /** S2.4: adaptive Abtastrate (fällt bei Dauer-Überlast, erholt sich mit Hysterese). */
  private effectiveRate = 0;
  private clampStreak = 0;
  private calmStreak = 0;
  private droppedSec = 0;

  /** (Re)build the simulator from the schematic. Keeps interactive control state. */
  rebuild(doc: SchematicDoc): void {
    const built = buildNets(doc);
    this.errors = built.errors;
    this.warnings = built.warnings;
    this.netlist = built.netlist;
    this.sim = new Simulator(this.netlist, {
      method: this.options.method,
      temperature: this.options.temperature,
    });
    this.sim.controls = this.controls;
    this.buffers.clear();
    this.slowBuffers.clear();
    this.slowPushCounter = 0;
    this.deviceBuffers.clear();
    // S2.4: Neustart = volle Rate, leere Zähler (stale Akkumulator würde sonst
    // sofort als Überlast blinken).
    this.effectiveRate = this.options.sampleRate;
    this.clampStreak = 0;
    this.calmStreak = 0;
    this.droppedSec = 0;
    this.stepAccumulator = 0;
    // S2.4: Messfenster startet neu (0 würde Leerlauf vor dem Start einrechnen).
    this.lastPerfTime = typeof performance !== "undefined" ? performance.now() : Date.now();
    this.stepsThisSecond = 0;
    this.simTimeThisSecond = 0;
    const op = this.sim.operatingPoint();
    const nets = this.sim.snapshot();
    const currents: Record<string, number> = {};
    const power: Record<string, number> = {};
    for (const d of this.netlist.devices) {
      const i = this.sim.deviceCurrent(d);
      currents[d.id] = i;
      const va = this.sim.nodeVoltage(d.nodes[0] ?? "0");
      const vb = this.sim.nodeVoltage(d.nodes[1] ?? "0");
      power[d.id] = (va - vb) * i;
    }
    this.lastState = {
      time: 0,
      nets,
      currents,
      power,
      ok: op.ok,
      message: op.message,
      stepsPerSecond: 0,
      // S2.4: Echtzeit-Annahme bis zur ersten 500-ms-Messung — sonst meldete
      // jeder Start fälschlich Überlast (rtf 0 < 0,9 vor der ersten Messung).
      realtimeFactor: 1,
      failure: op.failure,
      suspects: op.suspects,
    };
    for (const name of this.sim.nodeNames) {
      this.buffers.set(name, new RingBuffer(16384));
      this.slowBuffers.set(name, new RingBuffer(8192));
    }
    this.buffers.set("0", new RingBuffer(64));
    this.slowBuffers.set("0", new RingBuffer(64));
    for (const d of this.netlist.devices) this.deviceBuffers.set(d.id, new RingBuffer(4096));
    this.sample();
  }

  setControl(id: string, value: number): void {
    this.controls[id] = value;
    if (this.sim) this.sim.controls = this.controls;
  }

  reset(doc: SchematicDoc): void {
    this.rebuild(doc);
  }

  private sample(): void {
    const sim = this.sim;
    if (!sim) return;
    // W31d: jedes 12. Fast-Sample zusätzlich in den Langzeit-Tier (≈3,3 kSa/s).
    const doSlow = this.slowPushCounter++ % 12 === 0;
    for (let i = 0; i < sim.nodeNames.length; i++) {
      const b = this.buffers.get(sim.nodeNames[i]);
      if (b) b.push(sim.time, sim.x[i]);
      if (doSlow) {
        const sb = this.slowBuffers.get(sim.nodeNames[i]);
        if (sb) sb.push(sim.time, sim.x[i]);
      }
    }
    if (this.deviceBuffers.size) {
      for (const d of this.netlist.devices) {
        const b = this.deviceBuffers.get(d.id);
        if (b) b.push(sim.time, sim.deviceCurrent(d));
      }
    }
  }

  /** Advance the simulation by `wallDt` seconds of wall clock time. */
  tick(wallDt: number): LiveState {
    const sim = this.sim;
    if (!sim || !this.running) return this.lastState;
    // S2.4: adaptive Zeitschrittweite — bei Dauer-Überlast wird dt gröber
    // (statt stiller Schritt-Verwerfung), mit Hysterese zurück.
    if (!(this.effectiveRate > 0)) this.effectiveRate = this.options.sampleRate;
    // Laufzeit-Änderung der Abtastrate (Inspector) sofort übernehmen.
    if (this.effectiveRate > this.options.sampleRate) this.effectiveRate = this.options.sampleRate;
    const dt = 1 / this.effectiveRate;
    const target = wallDt * this.options.timeScale;
    this.stepAccumulator += target;
    const wanted = Math.floor(this.stepAccumulator / dt);
    let steps = wanted;
    const clamped = wanted > this.options.maxStepsPerFrame;
    if (clamped) {
      steps = this.options.maxStepsPerFrame;
      this.clampStreak++;
      this.calmStreak = 0;
    } else {
      this.clampStreak = 0;
      this.calmStreak++;
    }
    if (this.clampStreak >= 30 && this.effectiveRate > 5000) {
      this.effectiveRate = Math.max(5000, Math.floor(this.effectiveRate / 2));
      this.clampStreak = 0;
    } else if (this.calmStreak >= 240 && this.effectiveRate < this.options.sampleRate) {
      this.effectiveRate = Math.min(this.options.sampleRate, this.effectiveRate * 2);
      this.calmStreak = 0;
    }
    this.stepAccumulator -= steps * dt;
    if (this.stepAccumulator > 1) {
      // S2.4: Verworfenes wird gezählt statt verschwiegen.
      this.droppedSec += this.stepAccumulator;
      this.stepAccumulator = 0;
    }

    let ok = true;
    let message: string | undefined;
    const t0 = sim.time;
    for (let i = 0; i < steps; i++) {
      let r = sim.step(dt);
      if (!r.ok) {
        // adaptive recovery: retry the interval with smaller sub-steps
        let sub = dt / 2;
        let remaining = dt;
        let recovered = true;
        for (let k = 0; k < 6 && remaining > 1e-15; k++) {
          const rr = sim.step(Math.min(sub, remaining));
          if (rr.ok) {
            remaining -= Math.min(sub, remaining);
          } else {
            sub /= 4;
            if (sub < dt / 4096) {
              recovered = false;
              break;
            }
          }
        }
        if (!recovered) {
          ok = false;
          message = r.message;
          break;
        }
        r = { ok: true, iterations: 0 };
      }
      this.stepsSinceSample++;
      const decim = Math.max(1, Math.floor(this.options.sampleRate / 40000));
      if (this.stepsSinceSample >= decim) {
        this.stepsSinceSample = 0;
        this.sample();
      }
    }
    this.stepsThisSecond += steps;
    this.simTimeThisSecond += sim.time - t0;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    let sps = this.lastState.stepsPerSecond;
    let rtf = this.lastState.realtimeFactor;
    if (now - this.lastPerfTime > 500) {
      const secs = (now - this.lastPerfTime) / 1000;
      sps = this.stepsThisSecond / secs;
      rtf = this.simTimeThisSecond / secs;
      this.stepsThisSecond = 0;
      this.simTimeThisSecond = 0;
      this.lastPerfTime = now;
    }

    const nets = sim.snapshot();
    const currents: Record<string, number> = {};
    const power: Record<string, number> = {};
    for (const d of this.netlist.devices) {
      const i = sim.deviceCurrent(d);
      currents[d.id] = i;
      const va = sim.nodeVoltage(d.nodes[0] ?? "0");
      const vb = sim.nodeVoltage(d.nodes[1] ?? "0");
      power[d.id] = (va - vb) * i;
    }
    // S2.4: Überlast = Schritt-Clamp oder geglätteter Echtzeitfaktor < 0,9.
    const overload = clamped || rtf < 0.9;
    this.lastState = {
      time: sim.time,
      nets,
      currents,
      power,
      ok,
      message,
      stepsPerSecond: sps,
      realtimeFactor: rtf,
      overload,
      effectiveSampleRate: this.effectiveRate,
      droppedSec: this.droppedSec,
    };
    return this.lastState;
  }

  /** Values for a scope channel. */
  channel(net: string, samples: number): { t: number[]; v: number[] } {
    const b = this.buffers.get(net);
    if (!b) return { t: [], v: [] };
    return b.window(samples);
  }

  /** W31d: Langzeit-Historie (≈3,3 kSa/s) für langsame Zeiteinstellungen. */
  channelSlow(net: string, samples: number): { t: number[]; v: number[] } {
    const b = this.slowBuffers.get(net);
    if (!b) return { t: [], v: [] };
    return b.window(samples);
  }

  /** R13: Strom durch ein Gerät als Zeitreihe (für die Hover-Sparkline). */
  deviceChannel(deviceId: string, samples: number): { t: number[]; v: number[] } {
    const b = this.deviceBuffers.get(deviceId);
    if (!b) return { t: [], v: [] };
    return b.window(samples);
  }

  netNames(): string[] {
    return this.sim ? [...this.sim.nodeNames].sort() : [];
  }

  deviceById(id: string): Device | undefined {
    return this.netlist.devices.find((d) => d.id === id);
  }
}

/** Simple RMS/mean helpers used by the DMM and wattmeter. */
export function rms(values: number[]): number {
  if (!values.length) return 0;
  return Math.sqrt(values.reduce((a, b) => a + b * b, 0) / values.length);
}
export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}
export function peakToPeak(values: number[]): number {
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}
export function estimateFrequency(t: number[], v: number[]): number {
  if (t.length < 8) return 0;
  const avg = mean(v);
  let crossings = 0;
  let firstT = 0;
  let lastT = 0;
  for (let i = 1; i < v.length; i++) {
    if (v[i - 1] <= avg && v[i] > avg) {
      const frac = (avg - v[i - 1]) / Math.max(v[i] - v[i - 1], 1e-18);
      const tc = t[i - 1] + frac * (t[i] - t[i - 1]);
      if (!crossings) firstT = tc;
      lastT = tc;
      crossings++;
    }
  }
  if (crossings < 2 || lastT <= firstT) return 0;
  return (crossings - 1) / (lastT - firstT);
}
