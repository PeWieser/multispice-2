/**
 * Event driven digital co-simulation layer.
 *  - combinational primitives (74xx / 4000 series behaviour)
 *  - sequential primitives (flip flops, counters, shift registers, 7-seg decoders)
 *  - a tiny Arduino-flavoured C interpreter used for MCU co-simulation
 */

export interface DigitalPort {
  /** node index in device.nodes */
  pin: number;
  /** -1 = hi-Z, otherwise logical level 0..1 */
  level: number;
  /**
   * S5.32: optional raw analog output voltage. When present, the engine
   * stamps `volts` instead of `level * vdd` (DACs, analog muxes, drivers).
   */
  volts?: number;
}

export interface DigitalDeviceLike {
  id: string;
  type: string;
  nodes: string[];
  params: Record<string, number>;
  model?: string;
  text?: string;
}

export interface DigitalContext {
  time: number;
  dt: number;
  /** analog node voltages for every pin of the device */
  pinVoltages: number[];
  vdd: number;
  vth: number;
  /** persistent per-device memory */
  mem: Record<string, number>;
  /** program memory for MCU devices */
  program?: McuProgram;
}

const hi = (v: number, vth: number): number => (v > vth ? 1 : 0);

/* ------------------------------------------------------------------ */
/* combinational + sequential primitives                               */
/* ------------------------------------------------------------------ */

export function evalDigital(dev: DigitalDeviceLike, ctx: DigitalContext): DigitalPort[] {
  const model = (dev.model ?? "and2").toLowerCase();
  const v = ctx.pinVoltages;
  const vth = ctx.vth;
  const mem = ctx.mem;
  const inputs = v.map((x) => hi(x, vth));
  const out: DigitalPort[] = [];
  const last = dev.nodes.length - 1;

  const gate = (fn: (a: number[]) => number, inv = false) => {
    const ins = inputs.slice(0, last);
    const r = fn(ins);
    out.push({ pin: last, level: inv ? 1 - r : r });
  };

  const rising = (key: string, val: number) => {
    const prev = mem[key] ?? 0;
    mem[key] = val;
    return prev === 0 && val === 1;
  };

  // S5.33: fallende Flanke (4020/4040/4060 zählen negativ).
  const falling = (key: string, val: number) => {
    const prev = mem[key] ?? 0;
    mem[key] = val;
    return prev === 1 && val === 0;
  };

  switch (model) {
    case "and2":
    case "and3":
    case "and4":
      gate((a) => (a.every((x) => x === 1) ? 1 : 0));
      break;
    case "nand2":
    case "nand3":
    case "nand4":
    case "nand8": // S5.32 (7430 fiel zuvor in default = AND!)
      gate((a) => (a.every((x) => x === 1) ? 1 : 0), true);
      break;
    case "or2":
    case "or3":
    case "or4":
      gate((a) => (a.some((x) => x === 1) ? 1 : 0));
      break;
    case "nor2":
    case "nor3":
    case "nor4": // S5.32 (4002 fiel zuvor in default = AND!)
    case "nor8": // S5.33 (4078)
      gate((a) => (a.some((x) => x === 1) ? 1 : 0), true);
      break;
    case "xor2":
      gate((a) => (a.reduce((s, x) => s ^ x, 0) ? 1 : 0));
      break;
    case "xnor2":
      gate((a) => (a.reduce((s, x) => s ^ x, 0) ? 1 : 0), true);
      break;
    case "not":
    case "inverter":
      gate((a) => a[0] ?? 0, true);
      break;
    case "buffer":
      gate((a) => a[0] ?? 0);
      break;
    case "schmitt": {
      const prev = mem.q ?? 0;
      const vin = v[0] ?? 0;
      const q = vin > ctx.vdd * 0.66 ? 1 : vin < ctx.vdd * 0.33 ? 0 : prev;
      mem.q = q;
      out.push({ pin: last, level: 1 - q });
      break;
    }
    case "dff": {
      // pins: D, CLK, RST, SET, Q, /Q
      const [d, clk, rst, set] = inputs;
      let q = mem.q ?? 0;
      if (rising("clk", clk)) q = d;
      if (rst === 1) q = 0;
      if (set === 1) q = 1;
      mem.q = q;
      out.push({ pin: 4, level: q }, { pin: 5, level: 1 - q });
      break;
    }
    case "jkff": {
      const [j, k, clk, rst] = inputs;
      let q = mem.q ?? 0;
      if (rising("clk", clk)) {
        if (j === 1 && k === 1) q = 1 - q;
        else if (j === 1) q = 1;
        else if (k === 1) q = 0;
      }
      if (rst === 1) q = 0;
      mem.q = q;
      out.push({ pin: 4, level: q }, { pin: 5, level: 1 - q });
      break;
    }
    case "tff": {
      const [t, clk] = inputs;
      let q = mem.q ?? 0;
      if (rising("clk", clk) && t === 1) q = 1 - q;
      mem.q = q;
      out.push({ pin: 3, level: q });
      break;
    }
    case "srlatch": {
      const [s, r] = inputs;
      let q = mem.q ?? 0;
      if (s === 1) q = 1;
      if (r === 1) q = 0;
      mem.q = q;
      out.push({ pin: 2, level: q }, { pin: 3, level: 1 - q });
      break;
    }
    case "counter4": {
      // pins: CLK, RST, EN, Q0..Q3
      const [clk, rst, en] = inputs;
      let cnt = mem.cnt ?? 0;
      if (rising("clk", clk) && en !== 0) cnt = (cnt + 1) & 0xf;
      if (rst === 1) cnt = 0;
      mem.cnt = cnt;
      for (let i = 0; i < 4; i++) out.push({ pin: 3 + i, level: (cnt >> i) & 1 });
      break;
    }
    case "counter8": {
      const [clk, rst, en] = inputs;
      let cnt = mem.cnt ?? 0;
      if (rising("clk", clk) && en !== 0) cnt = (cnt + 1) & 0xff;
      if (rst === 1) cnt = 0;
      mem.cnt = cnt;
      for (let i = 0; i < 8; i++) out.push({ pin: 3 + i, level: (cnt >> i) & 1 });
      break;
    }
    case "shift8": {
      // pins: CLK, DATA, RST, Q0..Q7
      const [clk, data, rst] = inputs;
      let reg = mem.reg ?? 0;
      if (rising("clk", clk)) reg = ((reg << 1) | data) & 0xff;
      if (rst === 1) reg = 0;
      mem.reg = reg;
      for (let i = 0; i < 8; i++) out.push({ pin: 3 + i, level: (reg >> i) & 1 });
      break;
    }
    case "mux4": {
      // pins: I0..I3, S0, S1, Y
      const sel = (inputs[4] ?? 0) | ((inputs[5] ?? 0) << 1);
      // S5.32: params.analog=1 schaltet echte Spannungs-Weitergabe (405x).
      if ((dev.params.analog ?? 0) === 1) out.push({ pin: 6, level: inputs[sel] ?? 0, volts: v[sel] ?? 0 });
      else out.push({ pin: 6, level: inputs[sel] ?? 0 });
      break;
    }
    case "demux4": {
      const sel = (inputs[1] ?? 0) | ((inputs[2] ?? 0) << 1);
      for (let i = 0; i < 4; i++) out.push({ pin: 3 + i, level: i === sel ? inputs[0] ?? 0 : 0 });
      break;
    }
    case "decoder38": {
      const sel = (inputs[0] ?? 0) | ((inputs[1] ?? 0) << 1) | ((inputs[2] ?? 0) << 2);
      for (let i = 0; i < 8; i++) out.push({ pin: 3 + i, level: i === sel ? 1 : 0 });
      break;
    }
    case "bcd7seg": {
      // pins: A,B,C,D (BCD in), a..g (out)
      const val = (inputs[0] ?? 0) | ((inputs[1] ?? 0) << 1) | ((inputs[2] ?? 0) << 2) | ((inputs[3] ?? 0) << 3);
      const table = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];
      const seg = table[val & 0xf];
      for (let i = 0; i < 7; i++) out.push({ pin: 4 + i, level: (seg >> i) & 1 });
      break;
    }
    case "alu4": {
      // pins: A0..A3, B0..B3, OP0, OP1, F0..F3, COUT
      const a = inputs.slice(0, 4).reduce((s, b, i) => s | (b << i), 0);
      const b = inputs.slice(4, 8).reduce((s, x, i) => s | (x << i), 0);
      const op = (inputs[8] ?? 0) | ((inputs[9] ?? 0) << 1);
      let r = 0;
      if (op === 0) r = a + b;
      else if (op === 1) r = a - b;
      else if (op === 2) r = a & b;
      else r = a | b;
      for (let i = 0; i < 4; i++) out.push({ pin: 10 + i, level: (r >> i) & 1 });
      out.push({ pin: 14, level: r > 15 ? 1 : 0 });
      break;
    }
    case "clockgen": {
      const freq = dev.params.freq ?? 1000;
      const phase = (ctx.time * freq) % 1;
      out.push({ pin: 0, level: phase < 0.5 ? 1 : 0 });
      break;
    }
    // ---- extended counters ----
    case "counter10": {
      const [clk, rst, en] = inputs;
      let cnt = mem.cnt ?? 0;
      if (rising("clk", clk) && en !== 0) cnt = (cnt + 1) % 10;
      if (rst === 1) cnt = 0;
      mem.cnt = cnt;
      for (let i = 0; i < 4; i++) out.push({ pin: 3 + i, level: (cnt >> i) & 1 });
      break;
    }
    case "counter12": {
      // S5.33: 4040 — fallende Flanke, kein EN (war: steigend + Phantom-EN auf Q0!).
      // pins: CLK, RST, Q0..Q11
      const clk = inputs[0] ?? 0, rst = inputs[1] ?? 0;
      let cnt = mem.cnt ?? 0;
      if (falling("clk", clk)) cnt = (cnt + 1) & 0xfff;
      if (rst === 1) cnt = 0;
      mem.cnt = cnt;
      for (let i = 0; i < 12; i++) out.push({ pin: 2 + i, level: (cnt >> i) & 1 });
      break;
    }
    case "counter14": {
      const [clk, rst] = inputs;
      let cnt = mem.cnt ?? 0;
      if (rising("clk", clk)) cnt = (cnt + 1) & 0x3fff;
      if (rst === 1) cnt = 0;
      mem.cnt = cnt;
      for (let i = 0; i < 14; i++) out.push({ pin: 2 + i, level: (cnt >> i) & 1 });
      break;
    }
    case "counter16": {
      const [clk, rst] = inputs;
      let cnt = mem.cnt ?? 0;
      if (rising("clk", clk)) cnt = (cnt + 1) & 0xffff;
      if (rst === 1) cnt = 0;
      mem.cnt = cnt;
      for (let i = 0; i < 16; i++) out.push({ pin: 2 + i, level: (cnt >> i) & 1 });
      break;
    }
    case "mux8": {
      // pins: I0..I7, S0, S1, S2, Y (74151 digital, 4051 mit params.analog=1)
      const sel = (inputs[8] ?? 0) | ((inputs[9] ?? 0) << 1) | ((inputs[10] ?? 0) << 2);
      if ((dev.params.analog ?? 0) === 1) out.push({ pin: 11, level: inputs[sel] ?? 0, volts: v[sel] ?? 0 });
      else out.push({ pin: 11, level: inputs[sel] ?? 0 });
      break;
    }
    case "mux2": {
      // pins: I0, I1, S, Y
      const sel = inputs[2] ?? 0;
      const inIdx = sel ? 1 : 0;
      if ((dev.params.analog ?? 0) === 1) out.push({ pin: 3, level: inputs[inIdx] ?? 0, volts: v[inIdx] ?? 0 });
      else out.push({ pin: 3, level: inputs[inIdx] ?? 0 });
      break;
    }
    case "demux8": {
      const sel = (inputs[1] ?? 0) | ((inputs[2] ?? 0) << 1) | ((inputs[3] ?? 0) << 2);
      for (let i = 0; i < 8; i++) out.push({ pin: 4 + i, level: i === sel ? inputs[0] ?? 0 : 0 });
      break;
    }
    case "decoder416": {
      const sel = (inputs[0] ?? 0) | ((inputs[1] ?? 0) << 1) | ((inputs[2] ?? 0) << 2) | ((inputs[3] ?? 0) << 3);
      for (let i = 0; i < 16; i++) out.push({ pin: 4 + i, level: i === sel ? 1 : 0 });
      break;
    }
    case "decoder24": {
      // pins: A0, A1, Y0..Y3 (+ params.low=1 für 4556 aktiv-low)
      const sel = (inputs[0] ?? 0) | ((inputs[1] ?? 0) << 1);
      const low = (dev.params.low ?? 0) === 1; // S5.33
      for (let i = 0; i < 4; i++) out.push({ pin: 2 + i, level: low ? (i === sel ? 0 : 1) : i === sel ? 1 : 0 });
      break;
    }
    case "encoder42": {
      // 4 to 2 priority encoder
      let code = 0;
      for (let i = 3; i >=0; i--) if (inputs[i]) { code = i; break; }
      out.push({ pin: 4, level: (code>>0)&1 }, { pin:5, level:(code>>1)&1 });
      break;
    }
    case "switch4": {
      // quad analog switch (4066/4016): pins I,O,C ×4 — offen = hi-Z, ein = echte Spannung
      for (let i=0;i<4;i++) {
        const inIdx = i*3;
        const ctrl = inputs[i*3+2] ?? 0;
        // S5.32: war digital (aus = 0 V getrieben); 4066-offen ist hochohmig.
        if (ctrl) out.push({ pin: i*3+1, level: inputs[inIdx] ?? 0, volts: v[inIdx] ?? 0 });
        else out.push({ pin: i*3+1, level: -1 });
      }
      break;
    }
    case "dac8": {
      // 8-bit DAC: Vout = (digital/255)*Vref; pins D0..D7, VOUT
      const bits = inputs.slice(0,8).reduce((s,b,i)=>s|(b<<i),0);
      const vref = dev.params.vref ?? ctx.vdd;
      const vout = (bits/255)*vref;
      // S5.32: echte Spannung statt Engine-Sonderfall (mem.vout entfällt).
      out.push({ pin: 8, level: vout > ctx.vth ? 1 : 0, volts: vout });
      break;
    }
    case "adc8": {
      const vin = v[0] ?? 0;
      const vref = dev.params.vref ?? ctx.vdd;
      const code = Math.max(0, Math.min(255, Math.round((vin/vref)*255)));
      for (let i=0;i<8;i++) out.push({ pin: 1+i, level: (code>>i)&1 });
      break;
    }
    case "bcdcounter": {
      const [clk, rst, en] = inputs;
      let cnt = mem.cnt ?? 0;
      if (rising("clk", clk) && en !== 0) cnt = (cnt + 1) % 10;
      if (rst === 1) cnt = 0;
      mem.cnt = cnt;
      for (let i=0;i<4;i++) out.push({ pin: 3+i, level: (cnt>>i)&1 });
      break;
    }
    case "7seg_common": {
      const val = (inputs[0] ?? 0) | ((inputs[1] ?? 0) << 1) | ((inputs[2] ?? 0) << 2) | ((inputs[3] ?? 0) << 3);
      const table = [0x3f,0x06,0x5b,0x4f,0x66,0x6d,0x7d,0x07,0x7f,0x6f];
      const seg = table[val%10] ?? 0;
      for (let i=0;i<7;i++) out.push({ pin: 4+i, level: (seg>>i)&1 });
      break;
    }
    case "pll4046": {
      // S5.33: 4046 voll — PC1 (XOR), PC2 (flanken-D-FF-Näherung), VCO mit Phasen-Akku.
      // pins: SIG, COMP, PC1, PC2, VCOIN, VCOUT, INH
      const sig = inputs[0] ?? 0, comp = inputs[1] ?? 0;
      out.push({ pin: 2, level: sig ^ comp });
      if (rising("pcsig", sig)) mem.pc2 = 1;
      if (rising("pccomp", comp)) mem.pc2 = 0;
      out.push({ pin: 3, level: mem.pc2 ?? 0 });
      const inh = inputs[6] ?? 0;
      const vco = v[4] ?? 0;
      const fmax = dev.params.fmax ?? 10000, fmin = dev.params.fmin ?? 0;
      const f = Math.max(0, fmin + Math.max(0, Math.min(vco / ctx.vdd, 1)) * (fmax - fmin));
      const lastT = mem.lastT ?? ctx.time;
      mem.phase = ((mem.phase ?? 0) + f * Math.max(0, ctx.time - lastT)) % 1;
      mem.lastT = ctx.time;
      out.push({ pin: 5, level: inh ? 0 : (mem.phase ?? 0) < 0.5 ? 1 : 0 });
      break;
    }
    case "monostable": {
      const [trig, rst] = inputs;
      let q = mem.q ?? 0;
      let t0 = mem.t0 ?? 0;
      const pw = dev.params.pw ?? 0.001;
      if (rst === 1) { q=0; }
      else if (trig === 1 && q===0) { q=1; t0=ctx.time; }
      else if (q===1 && ctx.time - t0 > pw) q=0;
      mem.q=q; mem.t0=t0;
      out.push({ pin: 2, level: q }, { pin:3, level: 1-q });
      break;
    }
    case "latch4": {
      // quad D latch
      for (let i=0;i<4;i++) {
        const d = inputs[i*2] ?? 0;
        const en = inputs[i*2+1] ?? 0;
        if (en===1) mem["q"+i]=d;
        out.push({ pin: 8+i, level: mem["q"+i] ?? 0 });
      }
      break;
    }
    case "ram8": {
      // simple 256x8 RAM – address 8 bits, data 8 bits, WE, OE, CS
      const addr = inputs.slice(0,8).reduce((s,b,i)=>s|(b<<i),0);
      const we = inputs[8] ?? 0;
      const oe = inputs[9] ?? 0;
      const cs = inputs[10] ?? 1;
      (mem as any).ram ??= {};
      const ram = (mem as any).ram as Record<number,number>;
      if (cs===0 && we===1) {
        // write: data pins are inputs 11..18
        const data = inputs.slice(11,19).reduce((s,b,i)=>s|(b<<i),0);
        ram[addr]=data;
      }
      if (cs===0 && oe===0) {
        const data = ram[addr] ?? 0;
        for (let i=0;i<8;i++) out.push({ pin: 11+i, level: (data>>i)&1 });
      } else {
        for (let i=0;i<8;i++) out.push({ pin: 11+i, level: -1 });
      }
      break;
    }
    // ---- S5.32: MSI/treiber-korrekte Modelle (Pin-Konvention im Kommentar) ----
    case "nand2s": {
      // Schmitt-NAND (4093, 74132): pins A, B, Y
      const st2 = (idx: number): number => {
        const key = "sn" + idx;
        const prev = mem[key] ?? 0;
        const vin = v[idx] ?? 0;
        const r = vin > ctx.vdd * 0.66 ? 1 : vin < ctx.vdd * 0.33 ? 0 : prev;
        mem[key] = r;
        return r;
      };
      out.push({ pin: last, level: st2(0) && st2(1) ? 0 : 1 });
      break;
    }
    case "tbuf": {
      // Tri-State-Buffer (1/4 74125 mit oeLow=1, 1/4 74126): pins I, OE, Y
      const oeRaw = inputs[1] ?? 0;
      const oe = (dev.params.oeLow ?? 0) === 1 ? 1 - oeRaw : oeRaw;
      out.push({ pin: 2, level: oe ? inputs[0] ?? 0 : -1 });
      break;
    }
    case "piso8": {
      // 74165 PISO: pins P0..P7, CLK, SHLD, SER, Q, /Q (SHLD=L: laden, H: schieben)
      const shld = inputs[9] ?? 1;
      let reg = mem.reg ?? 0;
      if (shld === 0) reg = inputs.slice(0, 8).reduce((s, b, i) => s | (b << i), 0);
      else if (rising("clk", inputs[8] ?? 0)) reg = ((reg << 1) | (inputs[10] ?? 0)) & 0xff;
      mem.reg = reg;
      const q = (reg >> 7) & 1;
      out.push({ pin: 11, level: q }, { pin: 12, level: 1 - q });
      break;
    }
    case "buf8": {
      // 74244 Octal-Buffer: pins I0..I7, /OE1, /OE2, Y0..Y7
      const oe1 = inputs[8] ?? 0, oe2 = inputs[9] ?? 0;
      for (let i = 0; i < 8; i++) out.push({ pin: 10 + i, level: (i < 4 ? oe1 : oe2) ? -1 : inputs[i] ?? 0 });
      break;
    }
    case "latch8": {
      // 74373 Octal-Latch: pins D0..D7, LE, /OE, Q0..Q7 (LE=H: transparent)
      const le = inputs[8] ?? 0, oe = inputs[9] ?? 0;
      for (let i = 0; i < 8; i++) {
        if (le === 1) mem["q" + i] = inputs[i] ?? 0;
        out.push({ pin: 10 + i, level: oe ? -1 : mem["q" + i] ?? 0 });
      }
      break;
    }
    case "ff8": {
      // 74273 Octal-D-FF: pins D0..D7, CLK, /CLR, Q0..Q7
      const edge = rising("clk", inputs[8] ?? 0);
      const clr = inputs[9] ?? 1;
      for (let i = 0; i < 8; i++) {
        if (clr === 0) mem["q" + i] = 0;
        else if (edge) mem["q" + i] = inputs[i] ?? 0;
        out.push({ pin: 10 + i, level: mem["q" + i] ?? 0 });
      }
      break;
    }
    case "transceiver8": {
      // 74245: pins A0..A7, B0..B7, DIR, /OE — DIR=H: A→B (Nexperia-Tabelle)
      const dir = inputs[16] ?? 1, oe = inputs[17] ?? 0;
      for (let i = 0; i < 8; i++) {
        if (oe === 1) out.push({ pin: i, level: -1 }, { pin: 8 + i, level: -1 });
        else if (dir === 1) out.push({ pin: i, level: -1 }, { pin: 8 + i, level: inputs[i] ?? 0 });
        else out.push({ pin: i, level: inputs[8 + i] ?? 0 }, { pin: 8 + i, level: -1 });
      }
      break;
    }
    case "add4": {
      // 7483/4008 4-Bit-Addierer: pins A0..A3, B0..B3, CIN, S0..S3, COUT
      const a = inputs.slice(0, 4).reduce((s, b, i) => s | (b << i), 0);
      const b = inputs.slice(4, 8).reduce((s, x, i) => s | (x << i), 0);
      const r = a + b + (inputs[8] ?? 0);
      for (let i = 0; i < 4; i++) out.push({ pin: 9 + i, level: (r >> i) & 1 });
      out.push({ pin: 13, level: r > 15 ? 1 : 0 });
      break;
    }
    case "magcomp4": {
      // 7485 4-Bit-Komparator: A0..A3, B0..B3, IAGTB, IAEQB, IALTB, OAGTB, OAEQB, OALTB
      const a = inputs.slice(0, 4).reduce((s, b, i) => s | (b << i), 0);
      const b = inputs.slice(4, 8).reduce((s, x, i) => s | (x << i), 0);
      let gt = 0, eq = 0, lt = 0;
      if (a > b) gt = 1;
      else if (a < b) lt = 1;
      else { gt = inputs[8] ?? 0; eq = inputs[9] ?? 0; lt = inputs[10] ?? 0; }
      out.push({ pin: 11, level: gt }, { pin: 12, level: eq }, { pin: 13, level: lt });
      break;
    }
    case "bcddec": {
      // BCD→Dezimal (7442 low=1 aktiv-low, 4028 aktiv-high): pins A,B,C,D, Y0..Y9
      // params: low (7442), oc (offen = hi-Z statt Pegel). Ungültiges BCD: alles aus.
      const val = (inputs[0] ?? 0) | ((inputs[1] ?? 0) << 1) | ((inputs[2] ?? 0) << 2) | ((inputs[3] ?? 0) << 3);
      const low = (dev.params.low ?? 0) === 1;
      const oc = (dev.params.oc ?? 0) === 1;
      for (let i = 0; i < 10; i++) {
        const sel = val < 10 && i === val;
        const lvl = low ? (sel ? 0 : oc ? -1 : 1) : sel ? 1 : 0;
        out.push({ pin: 4 + i, level: lvl });
      }
      break;
    }
    case "bcd7seglow": {
      // 7447/7448 aktiv-low: pins A,B,C,D, LT, RBI, BI, a..g (LT/RBI/BI aktiv-low)
      const val = (inputs[0] ?? 0) | ((inputs[1] ?? 0) << 1) | ((inputs[2] ?? 0) << 2) | ((inputs[3] ?? 0) << 3);
      const table = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];
      let seg = table[val & 0xf];
      const lt = inputs[4] ?? 1, rbi = inputs[5] ?? 1, bi = inputs[6] ?? 1;
      if (lt === 0) seg = 0x7f;
      else if (bi === 0 || (rbi === 0 && val === 0)) seg = 0x00;
      const oc = (dev.params.oc ?? 0) === 1;
      for (let i = 0; i < 7; i++) out.push({ pin: 7 + i, level: (seg >> i) & 1 ? 0 : oc ? -1 : 1 });
      break;
    }
    case "bcd7seglatch": {
      // 4511 mit Latch: pins A,B,C,D, LE, /BI, /LT, a..g — LE=H: halten (verifiziert)
      const val = (inputs[0] ?? 0) | ((inputs[1] ?? 0) << 1) | ((inputs[2] ?? 0) << 2) | ((inputs[3] ?? 0) << 3);
      const table = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];
      const le = inputs[4] ?? 0, bi = inputs[5] ?? 1, lt = inputs[6] ?? 1;
      if (le === 0) mem.val = val;
      const held = mem.val ?? 0;
      let seg = held > 9 ? 0x00 : table[held]; // 4511 blankt A–F
      if (lt === 0) seg = 0x7f;
      else if (bi === 0) seg = 0x00;
      for (let i = 0; i < 7; i++) out.push({ pin: 7 + i, level: (seg >> i) & 1 });
      break;
    }
    case "encoder83": {
      // 74148 Priority-Encoder, alles aktiv-low: /I0../I7, /EI, /A0,/A1,/A2, /GS, /EO
      const ei = inputs[8] ?? 0;
      let pri = -1;
      for (let i = 7; i >= 0; i--) if ((inputs[i] ?? 1) === 0) { pri = i; break; }
      let code: number, gs: number, eo: number;
      if (ei !== 0) { code = 7; gs = 1; eo = 1; }
      else if (pri < 0) { code = 7; gs = 1; eo = 0; }
      else { code = (~pri) & 7; gs = 0; eo = 1; }
      out.push({ pin: 9, level: (code >> 0) & 1 }, { pin: 10, level: (code >> 1) & 1 }, { pin: 11, level: (code >> 2) & 1 }, { pin: 12, level: gs }, { pin: 13, level: eo });
      break;
    }
    case "shift8latch": {
      // 74595: pins SER, SRCLK, RCLK, /SRCLR, /OE, QA..QH, QH'
      const ser = inputs[0] ?? 0;
      let sr = mem.sr ?? 0, lat = mem.lat ?? 0;
      if ((inputs[3] ?? 1) === 0) sr = 0;
      else if (rising("srclk", inputs[1] ?? 0)) sr = ((sr << 1) | ser) & 0xff;
      if (rising("rclk", inputs[2] ?? 0)) lat = sr;
      mem.sr = sr; mem.lat = lat;
      const oe = inputs[4] ?? 0;
      for (let i = 0; i < 8; i++) out.push({ pin: 5 + i, level: oe ? -1 : (lat >> i) & 1 });
      out.push({ pin: 13, level: (sr >> 7) & 1 });
      break;
    }
    case "counter4ud": {
      // 4-Bit auf/ab (74191/4029/4516-Stil, behavioral aktiv-high): P0..P3, CLK, LOAD, UD, EN, Q0..Q3
      const load = inputs[5] ?? 0, ud = inputs[6] ?? 1, en = inputs[7] ?? 1;
      let cnt = mem.cnt ?? 0;
      if (load === 1) cnt = inputs.slice(0, 4).reduce((s, b, i) => s | (b << i), 0);
      else if (en === 1 && rising("clk", inputs[4] ?? 0)) cnt = ud ? (cnt + 1) & 0xf : (cnt + 15) & 0xf;
      mem.cnt = cnt;
      for (let i = 0; i < 4; i++) out.push({ pin: 8 + i, level: (cnt >> i) & 1 });
      break;
    }
    case "counter8dec": {
      // S5.33: 4022 ÷8-Johnson: pins CLK, RST, INH, Q0..Q7, COUT (steigend, INH=H sperrt)
      const clk = inputs[0] ?? 0, rst = inputs[1] ?? 0, inh = inputs[2] ?? 0;
      let cnt = mem.cnt ?? 0;
      if (inh === 0 && rising("clk", clk)) cnt = (cnt + 1) % 8;
      if (rst === 1) cnt = 0;
      mem.cnt = cnt;
      for (let i = 0; i < 8; i++) out.push({ pin: 3 + i, level: i === cnt ? 1 : 0 });
      out.push({ pin: 11, level: cnt < 4 ? 1 : 0 }); // COUT: HIGH 0–3 (4017-Analogie)
      break;
    }
    case "bcd7seglcd": {
      // 4543 LCD-Treiber: pins A,B,C,D, LD, PH, BI, a..g (LD=H: halten, BI=H: aus, seg^PH)
      const val = (inputs[0] ?? 0) | ((inputs[1] ?? 0) << 1) | ((inputs[2] ?? 0) << 2) | ((inputs[3] ?? 0) << 3);
      const table = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];
      const ld = inputs[4] ?? 1, ph = inputs[5] ?? 0, bi = inputs[6] ?? 0;
      if (ld === 0) mem.val = val;
      const held = mem.val ?? 0;
      const seg = held > 9 || bi === 1 ? 0x00 : table[held];
      for (let i = 0; i < 7; i++) out.push({ pin: 7 + i, level: ((seg >> i) & 1) ^ ph });
      break;
    }
    case "mux16": {
      // 4067 16-Kanal: pins I0..I15, S0..S3, COM, /EN (+ params.analog)
      const sel = (inputs[16] ?? 0) | ((inputs[17] ?? 0) << 1) | ((inputs[18] ?? 0) << 2) | ((inputs[19] ?? 0) << 3);
      if ((inputs[21] ?? 0) === 1) { out.push({ pin: 20, level: -1 }); break; }
      if ((dev.params.analog ?? 0) === 1) out.push({ pin: 20, level: inputs[sel] ?? 0, volts: v[sel] ?? 0 });
      else out.push({ pin: 20, level: inputs[sel] ?? 0 });
      break;
    }
    case "mux4dual": {
      // 4052 Dual-4-Kanal: IA0..IA3, IB0..IB3, S0, S1, COMA, COMB, /EN (analog default)
      const sel = (inputs[8] ?? 0) | ((inputs[9] ?? 0) << 1);
      const dis = (inputs[12] ?? 0) === 1;
      const ana = (dev.params.analog ?? 1) === 1;
      for (let ch = 0; ch < 2; ch++) {
        const inIdx = ch * 4 + sel;
        if (dis) { out.push({ pin: 10 + ch, level: -1 }); continue; }
        if (ana) out.push({ pin: 10 + ch, level: inputs[inIdx] ?? 0, volts: v[inIdx] ?? 0 });
        else out.push({ pin: 10 + ch, level: inputs[inIdx] ?? 0 });
      }
      break;
    }
    case "mux2triple": {
      // 4053 Triple-2-Kanal: IA0,IA1, IB0,IB1, IC0,IC1, SA,SB,SC, COMA,COMB,COMC, /EN
      const dis = (inputs[12] ?? 0) === 1;
      const ana = (dev.params.analog ?? 1) === 1;
      for (let ch = 0; ch < 3; ch++) {
        const inIdx = ch * 2 + (inputs[6 + ch] ?? 0);
        if (dis) { out.push({ pin: 9 + ch, level: -1 }); continue; }
        if (ana) out.push({ pin: 9 + ch, level: inputs[inIdx] ?? 0, volts: v[inIdx] ?? 0 });
        else out.push({ pin: 9 + ch, level: inputs[inIdx] ?? 0 });
      }
      break;
    }
    case "hbridge": {
      // L293D/L298 Brückenpaar: pins IN1, IN2, EN, OUT1, OUT2 — EN=L: Z (TI-Tabelle)
      // params: vs (Motorspannung, default vdd), vdrop (Sättigung, default 1,4)
      const en = inputs[2] ?? 0;
      if (en === 0) { out.push({ pin: 3, level: -1 }, { pin: 4, level: -1 }); break; }
      const vs = dev.params.vs ?? ctx.vdd;
      const drop = dev.params.vdrop ?? 1.4;
      for (let ch = 0; ch < 2; ch++) {
        const on = (inputs[ch] ?? 0) === 1;
        out.push({ pin: 3 + ch, level: on ? 1 : 0, volts: on ? vs - drop : drop * 0.25 });
      }
      break;
    }
    case "uln2003": {
      // ULN2003 7× Darlington (invertierend, OC): pins I0..I6, O0..O6
      for (let i = 0; i < 7; i++) {
        if ((inputs[i] ?? 0) === 1) out.push({ pin: 7 + i, level: 0, volts: 1.0 });
        else out.push({ pin: 7 + i, level: -1 });
      }
      break;
    }
    case "uln2803": {
      // ULN2803 8× Darlington: pins I0..I7, O0..O7
      for (let i = 0; i < 8; i++) {
        if ((inputs[i] ?? 0) === 1) out.push({ pin: 8 + i, level: 0, volts: 1.0 });
        else out.push({ pin: 8 + i, level: -1 });
      }
      break;
    }
    case "max232": {
      // MAX232 behavioral: T1IN,T2IN,R1IN,R2IN, T1OUT,T2OUT,R1OUT,R2OUT (Treiber ±V invertierend)
      const vrs = dev.params.vrs ?? 9;
      for (let ch = 0; ch < 2; ch++) {
        const tin = (inputs[ch] ?? 0) === 1;
        out.push({ pin: 4 + ch, level: tin ? 0 : 1, volts: tin ? -vrs : vrs });
      }
      for (let ch = 0; ch < 2; ch++) {
        const rin = v[2 + ch] ?? 0;
        out.push({ pin: 6 + ch, level: rin > 1.5 ? 0 : 1 });
      }
      break;
    }
    // ---- S5.33: Reparatur-Modelle (Pin-Konvention im Kommentar) ----
    case "dffn": {
      // 7474-Hälfte: pins D, CLK, /RST, /SET, Q, /Q
      const [d, clk, rst, set] = inputs;
      let q = mem.q ?? 0;
      if (rising("clk", clk)) q = d;
      if (rst === 0) q = 0;
      if (set === 0) q = 1;
      mem.q = q;
      out.push({ pin: 4, level: q }, { pin: 5, level: 1 - q });
      break;
    }
    case "jkffn": {
      // 7476-Hälfte: pins J, K, CLK, /RST, /SET, Q, /Q
      const [j, k, clk, rst, set] = inputs;
      let q = mem.q ?? 0;
      if (rising("clk", clk)) {
        if (j === 1 && k === 1) q = 1 - q;
        else if (j === 1) q = 1;
        else if (k === 1) q = 0;
      }
      if (rst === 0) q = 0;
      if (set === 0) q = 1;
      mem.q = q;
      out.push({ pin: 5, level: q }, { pin: 6, level: 1 - q });
      break;
    }
    case "shift8dual": {
      // 74164 (SER = A·B): pins A, B, CLK, /CLR, Q0..Q7
      const ser = (inputs[0] ?? 0) && (inputs[1] ?? 0) ? 1 : 0;
      let reg = mem.reg ?? 0;
      if ((inputs[3] ?? 1) === 0) reg = 0;
      else if (rising("clk", inputs[2] ?? 0)) reg = ((reg << 1) | ser) & 0xff;
      mem.reg = reg;
      for (let i = 0; i < 8; i++) out.push({ pin: 4 + i, level: (reg >> i) & 1 });
      break;
    }
    case "shift4": {
      // 4015-Hälfte: pins CLK, DATA, RST, Q0..Q3
      let reg = mem.reg ?? 0;
      if ((inputs[2] ?? 0) === 1) reg = 0;
      else if (rising("clk", inputs[0] ?? 0)) reg = ((reg << 1) | (inputs[1] ?? 0)) & 0xf;
      mem.reg = reg;
      for (let i = 0; i < 4; i++) out.push({ pin: 3 + i, level: (reg >> i) & 1 });
      break;
    }
    case "shift18": {
      // 4006 18-Bit-Verzögerung (Anzapfungen entfallen): pins CLK, DATA, Q
      let reg = mem.reg ?? 0;
      if (rising("clk", inputs[0] ?? 0)) reg = ((reg << 1) | (inputs[1] ?? 0)) & 0x3ffff;
      mem.reg = reg;
      out.push({ pin: 2, level: (reg >> 17) & 1 });
      break;
    }
    case "shift64": {
      // 4031 64-Bit-Verzögerung: pins CLK, DATA, Q (zwei 32-Bit-Hälften)
      let lo = mem.lo ?? 0, hi = mem.hi ?? 0;
      if (rising("clk", inputs[0] ?? 0)) {
        const carry = (lo >>> 31) & 1;
        lo = ((lo << 1) | (inputs[1] ?? 0)) >>> 0;
        hi = ((hi << 1) | carry) >>> 0;
      }
      mem.lo = lo; mem.hi = hi;
      out.push({ pin: 2, level: (hi >>> 31) & 1 });
      break;
    }
    case "counter7": {
      // 4024 7-Bit-Ripple (fallend): pins CLK, RST, Q0..Q6
      let cnt = mem.cnt ?? 0;
      if (falling("clk", inputs[0] ?? 0)) cnt = (cnt + 1) & 0x7f;
      if ((inputs[1] ?? 0) === 1) cnt = 0;
      mem.cnt = cnt;
      for (let i = 0; i < 7; i++) out.push({ pin: 2 + i, level: (cnt >> i) & 1 });
      break;
    }
    case "counter10dec": {
      // 4017 Dekade dekodiert: pins CLK, RST, INH, Q0..Q9, COUT (COUT=H bei 0–4)
      let cnt = mem.cnt ?? 0;
      if ((inputs[1] ?? 0) === 1) cnt = 0;
      else if ((inputs[2] ?? 0) === 0 && rising("clk", inputs[0] ?? 0)) cnt = (cnt + 1) % 10;
      mem.cnt = cnt;
      for (let i = 0; i < 10; i++) out.push({ pin: 3 + i, level: i === cnt ? 1 : 0 });
      out.push({ pin: 13, level: cnt < 5 ? 1 : 0 });
      break;
    }
    case "counter4020": {
      // 4020: nur Q0,Q3–Q13 herausgeführt (Q1,Q2 fehlen!), fallend
      // pins: CLK, RST, Q0, Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q11, Q12, Q13
      let cnt = mem.cnt ?? 0;
      if (falling("clk", inputs[0] ?? 0)) cnt = (cnt + 1) & 0x3fff;
      if ((inputs[1] ?? 0) === 1) cnt = 0;
      mem.cnt = cnt;
      out.push({ pin: 2, level: cnt & 1 });
      for (let b = 3; b <= 13; b++) out.push({ pin: b, level: (cnt >> b) & 1 });
      break;
    }
    case "counter4060": {
      // 4060: Q3–Q9,Q11–Q13 (0-basiert), fallend, Oszillator extern takten
      // pins: CLK, RST, Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q11, Q12, Q13
      const bits13 = [3, 4, 5, 6, 7, 8, 9, 11, 12, 13];
      let cnt = mem.cnt ?? 0;
      if (falling("clk", inputs[0] ?? 0)) cnt = (cnt + 1) & 0x3fff;
      if ((inputs[1] ?? 0) === 1) cnt = 0;
      mem.cnt = cnt;
      bits13.forEach((b, i) => out.push({ pin: 2 + i, level: (cnt >> b) & 1 }));
      break;
    }
    case "johnson4018": {
      // 4018 ÷N-Johnson (5 Stufen): pins CLK, RST, DATA, PE, J0..J4, Q0..Q4
      let reg = mem.reg ?? 0;
      if ((inputs[1] ?? 0) === 1) reg = 0;
      else if ((inputs[3] ?? 0) === 1) reg = inputs.slice(4, 9).reduce((s, b, i) => s | (b << i), 0);
      else if (rising("clk", inputs[0] ?? 0)) reg = ((reg << 1) | (inputs[2] ?? 0)) & 0x1f;
      mem.reg = reg;
      for (let i = 0; i < 5; i++) out.push({ pin: 9 + i, level: (reg >> i) & 1 });
      break;
    }
    case "dec4026": {
      // 4026 Dekade + 7-Segment: pins CLK, RST, INH, DEI, COUT, a..g (COUT=H bei 0–4)
      const table = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];
      let cnt = mem.cnt ?? 0;
      if ((inputs[1] ?? 0) === 1) cnt = 0;
      else if ((inputs[2] ?? 0) === 0 && rising("clk", inputs[0] ?? 0)) cnt = (cnt + 1) % 10;
      mem.cnt = cnt;
      out.push({ pin: 4, level: cnt < 5 ? 1 : 0 });
      const seg = (inputs[3] ?? 1) === 1 ? table[cnt] : 0x00;
      for (let i = 0; i < 7; i++) out.push({ pin: 5 + i, level: (seg >> i) & 1 });
      break;
    }
    case "ud4029": {
      // 4029 auf/ab voreinstellbar (Kaskade entfällt): pins J0..J3, CLK, /PE, UD, BD, Q0..Q3
      // UD=H: auf, BD=H: binär (÷16), BD=L: BCD (÷10); /PE=L: asynchron laden
      let cnt = mem.cnt ?? 0;
      const mod = (inputs[7] ?? 1) === 1 ? 16 : 10;
      if ((inputs[5] ?? 1) === 0) cnt = inputs.slice(0, 4).reduce((s, b, i) => s | (b << i), 0) % mod;
      else if (rising("clk", inputs[4] ?? 0)) cnt = (inputs[6] ?? 1) ? (cnt + 1) % mod : (cnt + mod - 1) % mod;
      mem.cnt = cnt;
      for (let i = 0; i < 4; i++) out.push({ pin: 8 + i, level: (cnt >> i) & 1 });
      break;
    }
    case "ud193": {
      // 40193 Doppel-Takt auf/ab (TCU/TCD entfallen): pins J0..J3, CPU, CPD, /PL, Q0..Q3
      let cnt = mem.cnt ?? 0;
      if ((inputs[6] ?? 1) === 0) cnt = inputs.slice(0, 4).reduce((s, b, i) => s | (b << i), 0);
      else {
        const cpu = inputs[4] ?? 1, cpd = inputs[5] ?? 1;
        if (cpd === 1 && rising("cpu", cpu)) cnt = (cnt + 1) & 0xf;
        else if (cpu === 1 && rising("cpd", cpd)) cnt = (cnt + 15) & 0xf;
      }
      mem.cnt = cnt;
      for (let i = 0; i < 4; i++) out.push({ pin: 7 + i, level: (cnt >> i) & 1 });
      break;
    }
    case "reg4034": {
      // 4034 Bus-Register (vereinfacht): pins P0..P7, SER, CLK, PS, Q0..Q7 (PS=H: laden)
      let reg = mem.reg ?? 0;
      if ((inputs[10] ?? 0) === 1) reg = inputs.slice(0, 8).reduce((s, b, i) => s | (b << i), 0);
      else if (rising("clk", inputs[9] ?? 0)) reg = ((reg << 1) | (inputs[8] ?? 0)) & 0xff;
      mem.reg = reg;
      for (let i = 0; i < 8; i++) out.push({ pin: 11 + i, level: (reg >> i) & 1 });
      break;
    }
    case "sr4035": {
      // 4035 4-Bit-Shift (SER = J·/K): pins P0..P3, CLK, PS, J, K, Q0..Q3 (PS=H: laden)
      let reg = mem.reg ?? 0;
      if ((inputs[5] ?? 0) === 1) reg = inputs.slice(0, 4).reduce((s, b, i) => s | (b << i), 0);
      else if (rising("clk", inputs[4] ?? 0)) {
        const ser = (inputs[6] ?? 0) && !(inputs[7] ?? 0) ? 1 : 0;
        reg = ((reg << 1) | ser) & 0xf;
      }
      mem.reg = reg;
      for (let i = 0; i < 4; i++) out.push({ pin: 8 + i, level: (reg >> i) & 1 });
      break;
    }
    case "bidir194": {
      // 40194 universal (74194-Modi): pins P0..P3, S0, S1, CLK, /CLR, DSL, DSR, Q0..Q3
      let reg = mem.reg ?? 0;
      if ((inputs[7] ?? 1) === 0) reg = 0;
      else if (rising("clk", inputs[6] ?? 0)) {
        const mode = (inputs[4] ?? 0) | ((inputs[5] ?? 0) << 1);
        if (mode === 1) reg = ((reg << 1) | (inputs[9] ?? 0)) & 0xf; // rechts (DSR→Q0)
        else if (mode === 2) reg = (reg >> 1) | ((inputs[8] ?? 0) << 3); // links (DSL→Q3)
        else if (mode === 3) reg = inputs.slice(0, 4).reduce((s, b, i) => s | (b << i), 0);
      }
      mem.reg = reg;
      for (let i = 0; i < 4; i++) out.push({ pin: 10 + i, level: (reg >> i) & 1 });
      break;
    }
    case "sr40195": {
      // 40195 4-Bit-Shift: pins P0..P3, CLK, PS, SER, Q0..Q3 (PS=H: laden)
      let reg = mem.reg ?? 0;
      if ((inputs[5] ?? 0) === 1) reg = inputs.slice(0, 4).reduce((s, b, i) => s | (b << i), 0);
      else if (rising("clk", inputs[4] ?? 0)) reg = ((reg << 1) | (inputs[6] ?? 0)) & 0xf;
      mem.reg = reg;
      for (let i = 0; i < 4; i++) out.push({ pin: 7 + i, level: (reg >> i) & 1 });
      break;
    }
    case "latch4042": {
      // 4042 Quad-Latch mit Polarität: pins D0..D3, CLK, POL, Q0..Q3 (folgt wenn CLK=POL)
      const clk = inputs[4] ?? 0, pol = inputs[5] ?? 1;
      for (let i = 0; i < 4; i++) {
        if (clk === pol) mem["q" + i] = inputs[i] ?? 0;
        out.push({ pin: 6 + i, level: mem["q" + i] ?? 0 });
      }
      break;
    }
    case "latch43": {
      // 4043/4044 Quad-RS + OE: pins S0,R0,..,S3,R3, OE, Q0..Q3 (+ low=1 für 4044)
      const low = (dev.params.low ?? 0) === 1;
      const oe = inputs[8] ?? 1;
      for (let i = 0; i < 4; i++) {
        let s = inputs[i * 2] ?? 0, r = inputs[i * 2 + 1] ?? 0;
        if (low) { s = 1 - s; r = 1 - r; }
        if (s && r) mem["q" + i] = 0;
        else if (s) mem["q" + i] = 1;
        else if (r) mem["q" + i] = 0;
        out.push({ pin: 9 + i, level: oe ? mem["q" + i] ?? 0 : -1 });
      }
      break;
    }
    case "reg4076": {
      // 4076 Quad-D-Register + OE: pins D0..D3, CLK, OE, Q0..Q3
      const edge = rising("clk", inputs[4] ?? 0);
      const oe = inputs[5] ?? 1;
      for (let i = 0; i < 4; i++) {
        if (edge) mem["q" + i] = inputs[i] ?? 0;
        out.push({ pin: 6 + i, level: oe ? mem["q" + i] ?? 0 : -1 });
      }
      break;
    }
    case "sr4094": {
      // 4094 Shift + Latch + OE: pins SER, CLK, STR, OE, Q0..Q7, QS
      let sr = mem.sr ?? 0, lat = mem.lat ?? 0;
      if (rising("clk", inputs[1] ?? 0)) sr = ((sr << 1) | (inputs[0] ?? 0)) & 0xff;
      if (rising("str", inputs[2] ?? 0)) lat = sr;
      mem.sr = sr; mem.lat = lat;
      const oe = inputs[3] ?? 1;
      for (let i = 0; i < 8; i++) out.push({ pin: 4 + i, level: oe ? (lat >> i) & 1 : -1 });
      out.push({ pin: 12, level: (sr >> 7) & 1 });
      break;
    }
    case "mux4512": {
      // 4512 8-Kanal + Latch + Sperre: pins I0..I7, S0, S1, S2, STR, INH, Y
      // STR=H: Auswahl halten; INH=H: Y=0
      const str = inputs[11] ?? 0;
      if (str === 0) mem.sel = (inputs[8] ?? 0) | ((inputs[9] ?? 0) << 1) | ((inputs[10] ?? 0) << 2);
      const sel = mem.sel ?? 0;
      out.push({ pin: 13, level: (inputs[12] ?? 0) === 1 ? 0 : inputs[sel] ?? 0 });
      break;
    }
    case "dec4514": {
      // 4514/4515 4:16 + Latch: pins A0..A3, STR, INH, Y0..Y15 (+ low=1 für 4515)
      const str = inputs[4] ?? 0;
      if (str === 0) mem.sel = (inputs[0] ?? 0) | ((inputs[1] ?? 0) << 1) | ((inputs[2] ?? 0) << 2) | ((inputs[3] ?? 0) << 3);
      const sel = mem.sel ?? 0;
      const low = (dev.params.low ?? 0) === 1;
      const inh = (inputs[5] ?? 0) === 1;
      for (let i = 0; i < 16; i++) {
        const active = !inh && i === sel;
        out.push({ pin: 6 + i, level: low ? (active ? 0 : 1) : active ? 1 : 0 });
      }
      break;
    }
    case "piso4014": {
      // 4014/4021 PISO (PS=H: laden): pins P0..P7, CLK, PS, SER, Q6, Q7, Q8
      let reg = mem.reg ?? 0;
      if ((inputs[9] ?? 0) === 1) reg = inputs.slice(0, 8).reduce((s, b, i) => s | (b << i), 0);
      else if (rising("clk", inputs[8] ?? 0)) reg = ((reg << 1) | (inputs[10] ?? 0)) & 0xff;
      mem.reg = reg;
      out.push({ pin: 11, level: (reg >> 5) & 1 }, { pin: 12, level: (reg >> 6) & 1 }, { pin: 13, level: (reg >> 7) & 1 });
      break;
    }
    default:
      gate((a) => (a.every((x) => x === 1) ? 1 : 0));
      break;
  }
  return out;
}

/**
 * S5.32: Pinzahl-Register — jedes DIGITAL/GATE-Modell (kleingeschrieben)
 * mit seiner exakten Knotenzahl. Der Katalog-Konsistenztest erzwingt
 * Modell ∈ Register und nodes.length === Registerwert (S5.33).
 */
export const DIGITAL_MODEL_PINS: Record<string, number> = {
  and2: 3, and3: 4, and4: 5,
  nand2: 3, nand3: 4, nand4: 5, nand8: 9, nand2s: 3,
  or2: 3, or3: 4, or4: 5, nor2: 3, nor3: 4, nor4: 5, nor8: 9,
  xor2: 3, xnor2: 3, not: 2, inverter: 2, buffer: 2, schmitt: 2, tbuf: 3,
  dff: 6, dffn: 6, jkff: 6, jkffn: 7, tff: 4, srlatch: 4,
  counter4: 7, counter8: 11, counter10: 7, counter12: 14, counter14: 16, counter16: 18,
  counter4ud: 12, counter8dec: 12, counter7: 9, counter10dec: 14, counter4020: 14, counter4060: 12,
  bcdcounter: 7, johnson4018: 14, dec4026: 12, ud4029: 12, ud193: 11,
  shift8: 11, shift8dual: 12, shift4: 7, shift18: 3, shift64: 3,
  piso8: 13, piso4014: 14, shift8latch: 14, sr4094: 13, sr4035: 12, sr40195: 11,
  bidir194: 14, reg4034: 19,
  mux2: 4, mux4: 7, mux8: 12, mux16: 22, mux4dual: 13, mux2triple: 13, mux4512: 14,
  demux4: 7, demux8: 12,
  decoder24: 6, decoder38: 11, decoder416: 20, bcddec: 14, dec4514: 22,
  encoder42: 6, encoder83: 14,
  bcd7seg: 11, bcd7seglow: 14, bcd7seglatch: 14, bcd7seglcd: 14, "7seg_common": 11,
  alu4: 15, add4: 14, magcomp4: 14,
  buf8: 18, latch4: 12, latch8: 18, latch4042: 10, latch43: 13, ff8: 18, reg4076: 10,
  transceiver8: 18,
  switch4: 12, dac8: 9, adc8: 9,
  pll4046: 7, monostable: 4, clockgen: 1, ram8: 19,
  hbridge: 5, uln2003: 14, uln2803: 18, max232: 8,
};

/* ------------------------------------------------------------------ */
/* MCU co-simulation                                                   */
/* ------------------------------------------------------------------ */

type Tok = { t: "num" | "id" | "op" | "str"; v: string };

export interface McuProgram {
  setup: Stmt[];
  loop: Stmt[];
  functions: Record<string, { args: string[]; body: Stmt[] }>;
}

type Expr =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "bin"; op: string; a: Expr; b: Expr }
  | { k: "un"; op: string; a: Expr }
  | { k: "call"; name: string; args: Expr[] };

type Stmt =
  | { k: "expr"; e: Expr }
  | { k: "let"; name: string; e: Expr }
  | { k: "assign"; name: string; op: string; e: Expr }
  | { k: "if"; cond: Expr; then: Stmt[]; else?: Stmt[] }
  | { k: "while"; cond: Expr; body: Stmt[] }
  | { k: "for"; init?: Stmt; cond?: Expr; post?: Stmt; body: Stmt[] };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  const re = /\s*(\/\/[^\n]*|\/\*[\s\S]*?\*\/|[A-Za-z_]\w*|0[xX][0-9a-fA-F]+|\d+\.?\d*|"[^"]*"|[<>=!+\-*/%&|^]=?|&&|\|\||[{}();,])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const v = m[1];
    if (v.startsWith("//") || v.startsWith("/*")) continue;
    if (/^[A-Za-z_]/.test(v)) toks.push({ t: "id", v });
    else if (/^["]/.test(v)) toks.push({ t: "str", v: v.slice(1, -1) });
    else if (/^[\d.]/.test(v) || /^0[xX]/.test(v)) toks.push({ t: "num", v });
    else toks.push({ t: "op", v });
  }
  return toks;
}

export function parseMcuProgram(src: string): McuProgram {
  const toks = tokenize(src);
  let i = 0;
  const peek = () => toks[i];
  const eat = (v?: string) => {
    const t = toks[i];
    if (v && (!t || t.v !== v)) throw new Error(`Erwartet '${v}' bei Token ${i} (${t?.v ?? "EOF"})`);
    i++;
    return t;
  };

  const parsePrimary = (): Expr => {
    const t = peek();
    if (!t) throw new Error("Unerwartetes Programmende");
    if (t.t === "num") {
      i++;
      return { k: "num", v: t.v.startsWith("0x") || t.v.startsWith("0X") ? parseInt(t.v, 16) : parseFloat(t.v) };
    }
    if (t.t === "id") {
      i++;
      if (peek()?.v === "(") {
        eat("(");
        const args: Expr[] = [];
        while (peek() && peek().v !== ")") {
          args.push(parseExpr());
          if (peek()?.v === ",") eat(",");
        }
        eat(")");
        return { k: "call", name: t.v, args };
      }
      return { k: "var", name: t.v };
    }
    if (t.v === "(") {
      eat("(");
      const e = parseExpr();
      eat(")");
      return e;
    }
    if (t.v === "-" || t.v === "!") {
      i++;
      return { k: "un", op: t.v, a: parsePrimary() };
    }
    i++;
    return { k: "num", v: 0 };
  };

  const prec: Record<string, number> = {
    "*": 7, "/": 7, "%": 7,
    "+": 6, "-": 6,
    "<": 5, ">": 5, "<=": 5, ">=": 5,
    "==": 4, "!=": 4,
    "&": 3, "^": 3, "|": 3,
    "&&": 2, "||": 1,
  };

  function parseBin(minPrec: number): Expr {
    let left = parsePrimary();
    for (;;) {
      const t = peek();
      if (!t || t.t !== "op") break;
      const pr = prec[t.v];
      if (pr === undefined || pr < minPrec) break;
      i++;
      const right = parseBin(pr + 1);
      left = { k: "bin", op: t.v, a: left, b: right };
    }
    return left;
  }

  const parseExpr = (): Expr => parseBin(1);

  const parseBlock = (): Stmt[] => {
    const body: Stmt[] = [];
    eat("{");
    while (peek() && peek().v !== "}") body.push(parseStmt());
    eat("}");
    return body;
  };

  function parseStmt(): Stmt {
    const t = peek();
    if (!t) throw new Error("Unerwartetes Programmende");
    if (t.v === "{") return { k: "if", cond: { k: "num", v: 1 }, then: parseBlock() };
    if (t.v === "if") {
      eat("if");
      eat("(");
      const cond = parseExpr();
      eat(")");
      const then = peek()?.v === "{" ? parseBlock() : [parseStmt()];
      let els: Stmt[] | undefined;
      if (peek()?.v === "else") {
        eat("else");
        els = peek()?.v === "{" ? parseBlock() : [parseStmt()];
      }
      return { k: "if", cond, then, else: els };
    }
    if (t.v === "while") {
      eat("while");
      eat("(");
      const cond = parseExpr();
      eat(")");
      return { k: "while", cond, body: peek()?.v === "{" ? parseBlock() : [parseStmt()] };
    }
    if (t.v === "for") {
      eat("for");
      eat("(");
      const init = peek()?.v === ";" ? undefined : parseStmt();
      if (peek()?.v === ";") eat(";");
      const cond = peek()?.v === ";" ? undefined : parseExpr();
      eat(";");
      const post = peek()?.v === ")" ? undefined : parseSimple();
      eat(")");
      return { k: "for", init, cond, post, body: peek()?.v === "{" ? parseBlock() : [parseStmt()] };
    }
    const s = parseSimple();
    if (peek()?.v === ";") eat(";");
    return s;
  }

  function parseSimple(): Stmt {
    const t = peek();
    if (t && t.t === "id" && ["int", "float", "long", "byte", "bool", "unsigned", "char", "double"].includes(t.v)) {
      i++;
      if (peek()?.v === "int" || peek()?.v === "char") i++;
      const name = eat().v;
      if (peek()?.v === "=") {
        eat("=");
        return { k: "let", name, e: parseExpr() };
      }
      return { k: "let", name, e: { k: "num", v: 0 } };
    }
    if (t && t.t === "id" && toks[i + 1] && ["=", "+=", "-=", "*=", "/="].includes(toks[i + 1].v)) {
      const name = eat().v;
      const op = eat().v;
      return { k: "assign", name, op, e: parseExpr() };
    }
    if (t && t.t === "id" && toks[i + 1] && (toks[i + 1].v === "+" || toks[i + 1].v === "-") && toks[i + 2]?.v === toks[i + 1].v) {
      const name = eat().v;
      const op = eat().v;
      eat();
      return { k: "assign", name, op: op + "=", e: { k: "num", v: 1 } };
    }
    return { k: "expr", e: parseExpr() };
  }

  const program: McuProgram = { setup: [], loop: [], functions: {} };
  const globals: Stmt[] = [];
  while (i < toks.length) {
    const t = toks[i];
    if (
      t.t === "id" &&
      ["void", "int", "float", "long", "byte", "bool"].includes(t.v) &&
      toks[i + 1]?.t === "id" &&
      toks[i + 2]?.v === "("
    ) {
      i++;
      const name = eat().v;
      eat("(");
      const args: string[] = [];
      while (peek() && peek().v !== ")") {
        const a = eat();
        if (a.t === "id" && peek()?.t === "id") args.push(eat().v);
        else if (a.t === "id") args.push(a.v);
        if (peek()?.v === ",") eat(",");
      }
      eat(")");
      const body = parseBlock();
      if (name === "setup") program.setup = body;
      else if (name === "loop") program.loop = body;
      else program.functions[name] = { args, body };
    } else {
      // globals
      const s = parseSimple();
      if (peek()?.v === ";") eat(";");
      globals.push(s);
    }
  }
  program.setup = [...globals, ...program.setup];
  return program;
}

export interface McuState {
  vars: Record<string, number>;
  pinModes: Record<number, number>;
  pinOut: Record<number, number>;
  pwm: Record<number, number>;
  pc: { phase: "setup" | "loop"; index: number };
  /** number of delay() calls already served in the current loop pass */
  delaysDone: number;
  sleepUntil: number;
  serial: string[];
  started: boolean;
}

export function createMcuState(): McuState {
  return {
    vars: {},
    pinModes: {},
    pinOut: {},
    pwm: {},
    pc: { phase: "setup", index: 0 },
    delaysDone: 0,
    sleepUntil: 0,
    serial: [],
    started: false,
  };
}

class SleepSignal {
  constructor(public until: number) {}
}

/**
 * Executes the MCU program until it blocks on delay() or runs out of its
 * instruction budget for this timestep. Returns digital pin levels.
 */
export function runMcu(
  state: McuState,
  program: McuProgram,
  ctx: { time: number; pinVoltages: number[]; vdd: number; analogPins: number[] },
  budget = 4000,
): void {
  if (state.sleepUntil > ctx.time) return;
  let ops = 0;
  /** fast-forward mode: replay the loop body up to the delay we were sleeping on */
  let ff = state.delaysDone > 0;
  let delayCounter = 0;

  const readPin = (pin: number): number => {
    const v = ctx.pinVoltages[pin] ?? 0;
    return v > ctx.vdd * 0.5 ? 1 : 0;
  };

  const call = (name: string, args: number[]): number => {
    switch (name) {
      case "pinMode":
        if (!ff) state.pinModes[args[0]] = args[1];
        return 0;
      case "digitalWrite":
        if (!ff) state.pinOut[args[0]] = args[1] ? 1 : 0;
        return 0;
      case "digitalRead":
        return readPin(args[0]);
      case "analogWrite":
        if (!ff) {
          state.pwm[args[0]] = Math.max(0, Math.min(255, args[1]));
          state.pinOut[args[0]] = args[1] > 127 ? 1 : 0;
        }
        return 0;
      case "analogRead": {
        const v = ctx.pinVoltages[args[0]] ?? 0;
        return Math.round((v / ctx.vdd) * 1023);
      }
      case "delay":
      case "delayMicroseconds": {
        const secs = name === "delay" ? args[0] / 1000 : args[0] / 1e6;
        delayCounter++;
        if (delayCounter <= state.delaysDone) {
          if (delayCounter === state.delaysDone) ff = false;
          return 0;
        }
        state.delaysDone = delayCounter;
        throw new SleepSignal(ctx.time + Math.max(secs, 1e-9));
      }
      case "millis":
        return ctx.time * 1000;
      case "micros":
        return ctx.time * 1e6;
      case "random":
        return args.length > 1
          ? args[0] + Math.floor(Math.random() * (args[1] - args[0]))
          : Math.floor(Math.random() * (args[0] ?? 100));
      case "map":
        return ((args[0] - args[1]) * (args[4] - args[3])) / Math.max(args[2] - args[1], 1e-9) + args[3];
      case "constrain":
        return Math.max(args[1], Math.min(args[2], args[0]));
      case "abs":
        return Math.abs(args[0]);
      case "min":
        return Math.min(args[0], args[1]);
      case "max":
        return Math.max(args[0], args[1]);
      case "sin":
        return Math.sin(args[0]);
      case "cos":
        return Math.cos(args[0]);
      case "HIGH":
        return 1;
      case "LOW":
        return 0;
      default: {
        const fn = program.functions[name];
        if (!fn) return 0;
        const saved = { ...state.vars };
        fn.args.forEach((a, idx) => (state.vars[a] = args[idx] ?? 0));
        execBlock(fn.body);
        state.vars = saved;
        return 0;
      }
    }
  };

  const evalExpr = (e: Expr): number => {
    switch (e.k) {
      case "num":
        return e.v;
      case "var": {
        if (e.name === "HIGH" || e.name === "true") return 1;
        if (e.name === "LOW" || e.name === "false") return 0;
        if (e.name === "OUTPUT") return 1;
        if (e.name === "INPUT") return 0;
        if (e.name === "INPUT_PULLUP") return 2;
        if (/^A\d+$/.test(e.name)) return ctx.analogPins[Number(e.name.slice(1))] ?? 0;
        return state.vars[e.name] ?? 0;
      }
      case "un":
        return e.op === "-" ? -evalExpr(e.a) : evalExpr(e.a) ? 0 : 1;
      case "call":
        return call(e.name, e.args.map(evalExpr));
      case "bin": {
        const a = evalExpr(e.a);
        const b = evalExpr(e.b);
        switch (e.op) {
          case "+": return a + b;
          case "-": return a - b;
          case "*": return a * b;
          case "/": return b === 0 ? 0 : a / b;
          case "%": return b === 0 ? 0 : a % b;
          case "<": return a < b ? 1 : 0;
          case ">": return a > b ? 1 : 0;
          case "<=": return a <= b ? 1 : 0;
          case ">=": return a >= b ? 1 : 0;
          case "==": return a === b ? 1 : 0;
          case "!=": return a !== b ? 1 : 0;
          case "&&": return a && b ? 1 : 0;
          case "||": return a || b ? 1 : 0;
          case "&": return (a | 0) & (b | 0);
          case "|": return (a | 0) | (b | 0);
          case "^": return (a | 0) ^ (b | 0);
          default: return 0;
        }
      }
      default:
        return 0;
    }
  };

  function execStmt(s: Stmt): void {
    if (ops++ > budget) throw new SleepSignal(ctx.time);
    switch (s.k) {
      case "expr":
        evalExpr(s.e);
        break;
      case "let":
        state.vars[s.name] = evalExpr(s.e);
        break;
      case "assign": {
        const cur = state.vars[s.name] ?? 0;
        const val = evalExpr(s.e);
        if (ff) break;
        state.vars[s.name] =
          s.op === "=" ? val : s.op === "+=" ? cur + val : s.op === "-=" ? cur - val : s.op === "*=" ? cur * val : cur / (val || 1);
        break;
      }
      case "if":
        if (evalExpr(s.cond)) execBlock(s.then);
        else if (s.else) execBlock(s.else);
        break;
      case "while": {
        let guard = 0;
        while (evalExpr(s.cond) && guard++ < 10000) execBlock(s.body);
        break;
      }
      case "for": {
        if (s.init) execStmt(s.init);
        let guard = 0;
        while ((s.cond ? evalExpr(s.cond) : 1) && guard++ < 10000) {
          execBlock(s.body);
          if (s.post) execStmt(s.post);
        }
        break;
      }
    }
  }

  function execBlock(b: Stmt[]): void {
    for (const s of b) execStmt(s);
  }

  try {
    if (!state.started) {
      execBlock(program.setup);
      state.started = true;
    }
    let loops = 0;
    while (ops < budget && loops++ < 50) {
      delayCounter = 0;
      ff = state.delaysDone > 0;
      execBlock(program.loop);
      state.delaysDone = 0;
      ff = false;
    }
  } catch (err) {
    if (err instanceof SleepSignal) state.sleepUntil = err.until;
    else state.serial.push(String(err));
  }
}

export const DEFAULT_MCU_SKETCH = `// Arduino (ATmega328P) Co-Simulation
int led = 13;
int counter = 0;

void setup() {
  pinMode(led, OUTPUT);
  pinMode(12, OUTPUT);
}

void loop() {
  digitalWrite(led, HIGH);
  delay(200);
  digitalWrite(led, LOW);
  delay(200);
  counter = counter + 1;
  digitalWrite(12, counter % 2);
}
`;
