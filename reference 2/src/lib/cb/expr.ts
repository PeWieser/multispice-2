// Elementwise math expressions over signals, e.g. "V(OUT)-V(IN)", "db(V(OUT)/V(IN))", "Probe1*I(R1)".
type Arr = number[];
const FN: Record<string, (a: number) => number> = {
  abs: Math.abs, sqrt: Math.sqrt, exp: Math.exp, ln: Math.log, log10: Math.log10, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  db: (v) => 20 * Math.log10(Math.max(Math.abs(v), 1e-30)),
};

export function evalExpr(src: string, lookup: (name: string) => Arr | null, n: number): Arr {
  let i = 0;
  const s = src.trim();
  const ws = () => { while (s[i] === " ") i++; };
  const bin = (a: Arr, b: Arr, f: (x: number, y: number) => number) => a.map((v, k) => f(v, b[k]));
  const num = (v: number) => new Array(n).fill(v);
  function primary(): Arr {
    ws();
    if (s[i] === "(") { i++; const v = expr(); ws(); if (s[i++] !== ")") throw new Error("Missing )"); return v; }
    if (s[i] === "-") { i++; return primary().map((v) => -v); }
    const m = s.slice(i).match(/^(\d+\.?\d*(?:e[-+]?\d+)?)([a-zA-Zµ]*)/i);
    if (m) {
      i += m[0].length;
      const mult: Record<string, number> = { f: 1e-15, p: 1e-12, n: 1e-9, u: 1e-6, µ: 1e-6, m: 1e-3, k: 1e3, meg: 1e6, g: 1e9 };
      return num(parseFloat(m[1]) * (mult[m[2].toLowerCase()] ?? 1));
    }
    const id = s.slice(i).match(/^[A-Za-z_][\w.]*/);
    if (!id) throw new Error(`Unexpected "${s[i] ?? "end"}" at ${i}`);
    i += id[0].length; ws();
    const name = id[0];
    if (s[i] === "(") {
      // signal like V(net) / I(ref) / VDB(net), or function call
      const close = s.indexOf(")", i);
      const inner = s.slice(i + 1, close);
      if (FN[name.toLowerCase()]) { i++; const a = expr(); ws(); if (s[i++] !== ")") throw new Error("Missing )"); return a.map(FN[name.toLowerCase()]); }
      const full = `${name}(${inner})`;
      const arr = lookup(full);
      if (!arr) throw new Error(`Unknown signal ${full}`);
      i = close + 1;
      return arr;
    }
    const arr = lookup(name);
    if (!arr) throw new Error(`Unknown signal ${name}`);
    return arr;
  }
  function pow(): Arr { let a = primary(); ws(); while (s[i] === "^") { i++; const b = primary(); a = bin(a, b, Math.pow); ws(); } return a; }
  function term(): Arr { let a = pow(); ws(); while (s[i] === "*" || s[i] === "/") { const op = s[i++]; const b = pow(); a = bin(a, b, op === "*" ? (x, y) => x * y : (x, y) => x / y); ws(); } return a; }
  function expr(): Arr { let a = term(); ws(); while (s[i] === "+" || s[i] === "-") { const op = s[i++]; const b = term(); a = bin(a, b, op === "+" ? (x, y) => x + y : (x, y) => x - y); ws(); } return a; }
  const r = expr(); ws();
  if (i < s.length) throw new Error(`Unexpected "${s[i]}"`);
  return r;
}

export function derivative(x: Arr, y: Arr): Arr { return y.map((_, i) => { const a = Math.max(0, i - 1), b = Math.min(y.length - 1, i + 1); return (y[b] - y[a]) / Math.max(x[b] - x[a], 1e-30); }); }
export function integral(x: Arr, y: Arr): Arr { let acc = 0; return y.map((v, i) => { if (i) acc += ((v + y[i - 1]) / 2) * (x[i] - x[i - 1]); return acc; }); }
