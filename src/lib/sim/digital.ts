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

  switch (model) {
    case "and2":
    case "and3":
    case "and4":
      gate((a) => (a.every((x) => x === 1) ? 1 : 0));
      break;
    case "nand2":
    case "nand3":
    case "nand4":
      gate((a) => (a.every((x) => x === 1) ? 1 : 0), true);
      break;
    case "or2":
    case "or3":
    case "or4":
      gate((a) => (a.some((x) => x === 1) ? 1 : 0));
      break;
    case "nor2":
    case "nor3":
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
      out.push({ pin: 6, level: inputs[sel] ?? 0 });
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
      const [clk, rst, en] = inputs;
      let cnt = mem.cnt ?? 0;
      if (rising("clk", clk) && en !== 0) cnt = (cnt + 1) & 0xfff;
      if (rst === 1) cnt = 0;
      mem.cnt = cnt;
      for (let i = 0; i < 12; i++) out.push({ pin: 3 + i, level: (cnt >> i) & 1 });
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
      const sel = (inputs[8] ?? 0) | ((inputs[9] ?? 0) << 1) | ((inputs[10] ?? 0) << 2);
      out.push({ pin: 11, level: inputs[sel] ?? 0 });
      break;
    }
    case "mux2": {
      const sel = inputs[2] ?? 0;
      out.push({ pin: 3, level: sel ? inputs[1] ?? 0 : inputs[0] ?? 0 });
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
      const sel = (inputs[0] ?? 0) | ((inputs[1] ?? 0) << 1);
      for (let i = 0; i < 4; i++) out.push({ pin: 2 + i, level: i === sel ? 1 : 0 });
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
      // quad analog switch – if control high, output = input
      for (let i=0;i<4;i++) {
        const inp = inputs[i*3] ?? 0;
        const ctrl = inputs[i*3+2] ?? 0;
        out.push({ pin: i*3+1, level: ctrl ? inp : 0 });
      }
      break;
    }
    case "dac8": {
      // 8-bit DAC: Vout = (digital/255)*Vref
      const bits = inputs.slice(0,8).reduce((s,b,i)=>s|(b<<i),0);
      const vref = dev.params.vref ?? ctx.vdd;
      const vout = (bits/255)*vref;
      // We push analog as level? For behavioral we store vout in mem
      mem.vout = vout;
      // Digital output not used, but we can output analog via special pin handling in engine – for now output high if vout > vth
      out.push({ pin: 8, level: vout > ctx.vth ? 1 : 0 });
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
      // simple VCO: output freq proportional to Vin
      const vin = v[0] ?? 0;
      const f = (vin/ctx.vdd)* (dev.params.fmax ?? 10000);
      const phase = (ctx.time * f) % 1;
      out.push({ pin: 1, level: phase < 0.5 ? 1 : 0 });
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
    default:
      gate((a) => (a.every((x) => x === 1) ? 1 : 0));
      break;
  }
  return out;
}

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
