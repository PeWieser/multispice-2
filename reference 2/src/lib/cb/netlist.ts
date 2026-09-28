import { LIBMAP, defaultProps } from "./library";
import { resolve, worldPins } from "./connectivity";
import type { Component, Label, Project, Wire } from "./types";
import { emptyProject, uid } from "./types";
import { parseValue } from "./units";

const nn = (s: string | undefined) => (s ? s.replace(/[^\w]/g, "_") : "NC");

/** Export a SPICE3/ngspice-compatible netlist. */
export function exportNetlist(p: Project): string {
  const cn = resolve(p);
  const L: string[] = [`* CircuitBench netlist — ${p.meta.name}`, `* generated ${new Date().toISOString()}`];
  const pwr = new Set<string>();
  const net = (c: Component, pin: string) => nn(cn.pinNet[c.id + ":" + pin]);
  for (const c of p.components) {
    const d = LIBMAP[c.type]; if (!d || c.enabled === false) continue;
    const pins = worldPins(c).map((x) => net(c, x.name));
    const pr = c.props;
    switch (d.model) {
      case "R": L.push(`${c.ref} ${pins[0]} ${pins[1]} ${pr.value}`); break;
      case "C": L.push(`${c.ref} ${pins[0]} ${pins[1]} ${pr.value}${pr.ic ? ` IC=${pr.ic}` : ""}`); break;
      case "L": L.push(`${c.ref} ${pins[0]} ${pins[1]} ${pr.value}${pr.ic ? ` IC=${pr.ic}` : ""}`); break;
      case "POT": { const R = parseValue(pr.value), f = parseValue(pr.pos) / 100; L.push(`${c.ref}a ${pins[0]} ${pins[2]} ${R * f}`, `${c.ref}b ${pins[2]} ${pins[1]} ${R * (1 - f)}`); break; }
      case "SW": L.push(`${c.ref} ${pins[0]} ${pins[1]} ${pr.state === "closed" ? pr.ron : pr.roff} ; switch ${pr.state}`); break;
      case "V": {
        const n2 = d.key === "CLOCK" ? "0" : pins[1];
        let spec = `DC ${pr.dc ?? 0}`;
        if (pr.wave === "sine") spec = `SIN(${pr.offset} ${pr.ampl} ${pr.freq} 0 0 ${pr.phase})`;
        if (pr.wave === "pulse") spec = `PULSE(${pr.v1} ${pr.v2} ${pr.delay} ${pr.rise} ${pr.fall} ${pr.width} ${pr.period})`;
        if (pr.wave === "pwl") spec = `PWL(${pr.pwl.replace(/,/g, " ")})`;
        if (d.key === "CLOCK") { const f = parseValue(pr.freq); spec = `PULSE(0 ${pr.vdd} 0 1n 1n ${(parseValue(pr.duty) / 100) / f} ${1 / f})`; }
        L.push(`V${c.ref.replace(/^V/, "")} ${pins[0]} ${n2} ${spec}${pr.ac && parseValue(pr.ac) ? ` AC ${pr.ac}` : ""}`);
        break;
      }
      case "I": L.push(`${c.ref} ${pins[1]} ${pins[0]} DC ${pr.dc}${pr.ac && parseValue(pr.ac) ? ` AC ${pr.ac}` : ""}`); break;
      case "PWR": { const n = nn(pr.net || c.type); if (pwr.has(n)) break; pwr.add(n); L.push(`V_${n} ${n} 0 DC ${pr.voltage}`); break; }
      case "D": L.push(`${c.ref} ${pins[0]} ${pins[1]} ${nn(pr.modelName)}`, `.model ${nn(pr.modelName)} D(IS=${pr.is} N=${pr.n} RS=${pr.rs} BV=${pr.bv})`); break;
      case "BJT": L.push(`${c.ref} ${pins[1]} ${pins[0]} ${pins[2]} ${nn(pr.modelName)}`, `.model ${nn(pr.modelName)} ${d.key}(IS=${pr.is} BF=${pr.bf} BR=${pr.br})`); break;
      case "MOS": L.push(`${c.ref} ${pins[1]} ${pins[0]} ${pins[2]} ${pins[2]} ${nn(pr.modelName)}`, `.model ${nn(pr.modelName)} ${d.key}(VTO=${pr.vto} KP=${pr.kp} LAMBDA=${pr.lambda})`); break;
      case "OPAMP": L.push(`E${c.ref} ${pins[2]} 0 ${pins[1]} ${pins[0]} ${pr.gain} ; ideal op amp (rails not modelled in SPICE export)`); break;
      case "COMP": L.push(`B${c.ref} ${pins[2]} 0 V=${pr.vol}+(${pr.voh}-${pr.vol})*(V(${pins[1]})>V(${pins[0]}))`); break;
      case "XFMR": L.push(`* ${c.ref}: ideal transformer ratio ${pr.ratio}`, `E${c.ref} ${pins[2]} ${pins[3]} ${pins[0]} ${pins[1]} ${pr.ratio}`, `F${c.ref} ${pins[0]} ${pins[1]} VX${c.ref} ${pr.ratio}`); break;
      case "FGEN": L.push(`V${c.ref} ${pins[0]} ${pins[1]} SIN(${pr.offset} ${pr.ampl} ${pr.freq}) AC ${pr.ac} ; function generator (${pr.wave})`); break;
      default: if (d.model && !d.instrument && d.model !== "HIZ") L.push(`* ${c.ref} (${d.name}): behavioral digital model, CircuitBench engine only`);
    }
  }
  const s = p.sim;
  L.push(`.temp ${s.temp}`);
  if (s.analysis === "tran") L.push(`.tran ${s.tran.tstop / 1000} ${s.tran.tstop} ${s.tran.tstart}${s.tran.tmax ? " " + s.tran.tmax : ""}${s.tran.uic ? " UIC" : ""}`);
  if (s.analysis === "ac") L.push(`.ac ${s.ac.scale} ${s.ac.points} ${s.ac.fstart} ${s.ac.fstop}`);
  if (s.analysis === "dc") L.push(`.dc ${s.dc.source} ${s.dc.start} ${s.dc.stop} ${s.dc.step}`);
  if (s.analysis === "op") L.push(".op");
  L.push(".end");
  return L.join("\n");
}

/** Import a basic SPICE netlist (R, C, L, V, I, D). Components are auto-placed and connected with net labels. */
export function importNetlist(text: string, name = "Imported"): Project {
  const p = emptyProject(name);
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("*") && !l.startsWith("."));
  let i = 0;
  const wires: Wire[] = [], labels: Label[] = [];
  for (const line of lines) {
    const tok = line.split(/\s+/);
    const ref = tok[0], ch = ref[0].toUpperCase();
    let type = ""; const props: Record<string, string> = {};
    if (ch === "R") { type = "R"; props.value = tok[3]; }
    else if (ch === "C") { type = "C"; props.value = tok[3]; }
    else if (ch === "L") { type = "L"; props.value = tok[3]; }
    else if (ch === "D") type = "D";
    else if (ch === "I") { type = "IDC"; props.dc = tok[tok.length - 1]; }
    else if (ch === "V") {
      const rest = tok.slice(3).join(" ");
      const sin = rest.match(/SIN\s*\(([^)]*)\)/i), pul = rest.match(/PULSE\s*\(([^)]*)\)/i);
      if (sin) { type = "VSIN"; const a = sin[1].trim().split(/\s+/); Object.assign(props, { offset: a[0] ?? "0", ampl: a[1] ?? "1", freq: a[2] ?? "1k" }); }
      else if (pul) { type = "VPULSE"; const a = pul[1].trim().split(/\s+/); Object.assign(props, { v1: a[0], v2: a[1], delay: a[2] ?? "0", rise: a[3] ?? "1n", fall: a[4] ?? "1n", width: a[5] ?? "1m", period: a[6] ?? "2m" }); }
      else { type = "VDC"; const m = rest.match(/(?:DC\s+)?([-\d.eE+]+[a-zA-Z]*)/); props.dc = m ? m[1] : "0"; }
    } else continue;
    const def = LIBMAP[type];
    const col = i % 6, row = Math.floor(i / 6);
    const c: Component = { id: uid("c"), type, ref, x: 100 + col * 120, y: 100 + row * 120, rot: 0, mirror: false, sheet: "s1", props: { ...defaultProps(def), ...props } };
    p.components.push(c);
    let nodes = [tok[1], tok[2]];
    if (type === "IDC") nodes = [tok[2], tok[1]];
    worldPins(c).forEach((pin, k) => {
      const nodeName = nodes[k]; if (!nodeName) return;
      const dx = pin.x === c.x ? 0 : Math.sign(pin.x - c.x) * 20, dy = pin.y === c.y ? 0 : Math.sign(pin.y - c.y) * 20;
      const end: [number, number] = [pin.x + dx, pin.y + dy];
      wires.push({ id: uid("w"), a: [pin.x, pin.y], b: end, sheet: "s1" });
      if (nodeName === "0") p.components.push({ id: uid("c"), type: "GND", ref: "#GND" + i + k, x: end[0], y: end[1], rot: 0, mirror: false, sheet: "s1", props: {} });
      else labels.push({ id: uid("l"), x: end[0], y: end[1], name: nodeName, kind: "local", sheet: "s1" });
    });
    i++;
  }
  p.wires = wires; p.labels = labels;
  const tran = text.match(/^\.tran\s+(\S+)\s+(\S+)/im);
  if (tran) { p.sim.analysis = "tran"; p.sim.tran.tstop = parseValue(tran[2]); }
  return p;
}
