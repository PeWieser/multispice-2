import { LIBMAP, defaultProps } from "./library";
import type { Component, Project, Pt, Probe } from "./types";
import { emptyProject, uid } from "./types";

class B {
  p: Project;
  n: Record<string, number> = {};
  constructor(name: string) { this.p = emptyProject(name); }
  c(type: string, x: number, y: number, props: Record<string, string> = {}, rot: 0 | 1 | 2 | 3 = 0, ref?: string): Component {
    const d = LIBMAP[type];
    const pre = d.prefix;
    this.n[pre] = (this.n[pre] ?? 0) + 1;
    const c: Component = { id: uid("c"), type, ref: ref ?? (pre.startsWith("#") ? pre + this.n[pre] : pre + this.n[pre]), x, y, rot, mirror: false, sheet: "s1", props: { ...defaultProps(d), ...props } };
    this.p.components.push(c);
    return c;
  }
  w(...pts: Pt[]) { for (let i = 1; i < pts.length; i++) this.p.wires.push({ id: uid("w"), a: pts[i - 1], b: pts[i], sheet: "s1" }); }
  l(name: string, x: number, y: number) { this.p.labels.push({ id: uid("l"), name, x, y, kind: "local", sheet: "s1" }); }
  probe(name: string, x: number, y: number, color: string, extra: Partial<Probe> = {}) { this.p.probes.push({ id: uid("p"), kind: "voltage", name, x, y, color, sheet: "s1", visible: true, ...extra }); }
}

export function exampleRC(): Project {
  const b = new B("RC Low-pass");
  b.c("VPULSE", 100, 200, { v1: "0", v2: "5", period: "2m", width: "1m", rise: "1u", fall: "1u" });
  b.c("R", 160, 160, { value: "1k" });
  b.c("C", 220, 200, { value: "100n" }, 1);
  b.c("GND", 100, 240); b.c("GND", 220, 240);
  b.w([100, 180], [100, 160], [140, 160]); b.w([180, 160], [220, 160], [220, 180]); b.w([100, 220], [100, 240]); b.w([220, 220], [220, 240]);
  b.l("IN", 100, 160); b.l("OUT", 220, 160);
  b.c("SCOPE", 360, 120);
  b.w([330, 150], [330, 170]); b.l("OUT", 330, 170);
  b.w([350, 150], [350, 180]); b.l("IN", 350, 180);
  b.probe("Vout", 220, 160, "#1f6feb");
  b.p.sim.analysis = "tran"; b.p.sim.tran.tstop = 0.004;
  b.p.instrumentState[b.p.components.find((c) => c.type === "SCOPE")!.id] = { tdiv: 0.0005, vdiv: [1, 1, 1, 1] };
  return b.p;
}

export function exampleDiode(): Project {
  const b = new B("Diode DC Sweep");
  b.c("VDC", 100, 200, { dc: "5" });
  b.c("R", 160, 160, { value: "100" });
  b.c("D", 220, 200, {}, 1);
  b.c("GND", 100, 240); b.c("GND", 220, 240);
  b.w([100, 180], [100, 160], [140, 160]); b.w([180, 160], [220, 160], [220, 180]); b.w([100, 220], [100, 240]); b.w([220, 220], [220, 240]);
  b.l("VD", 220, 160);
  b.probe("Vdiode", 220, 160, "#d1242f");
  b.p.probes.push({ id: uid("p"), kind: "current", name: "Id", compId: b.p.components[2].id, x: 0, y: 0, color: "#1a7f37", sheet: "s1", visible: true });
  b.p.sim.analysis = "dc"; b.p.sim.dc = { source: "V1", start: 0, stop: 5, step: 0.05 };
  return b.p;
}

export function exampleParamSweep(): Project {
  const p = exampleRC();
  p.meta.name = "RC Parameter Sweep";
  p.sim.param = { analysis: "tran", dims: [{ target: "R1.value", mode: "list", start: 500, stop: 4000, points: 4, list: "500, 1k, 2k, 4k" }] };
  return p;
}

export function exampleOpAmp(): Project {
  const b = new B("Inverting Op-Amp");
  b.c("VSIN", 100, 200, { ampl: "1", freq: "1k" });
  b.c("R", 160, 160, { value: "10k" });
  b.c("OPAMP5", 260, 170);
  b.c("R", 260, 120, { value: "47k" });
  b.c("VCC", 260, 140, { voltage: "12" }); b.c("VEE", 260, 200, { voltage: "-12" });
  b.c("GND", 100, 240); b.c("GND", 230, 200);
  b.w([100, 180], [100, 160], [140, 160]); b.w([180, 160], [230, 160]); b.w([200, 160], [200, 120], [240, 120]);
  b.w([280, 120], [300, 120], [300, 170]); b.w([290, 170], [300, 170], [330, 170]);
  b.w([230, 180], [230, 200]); b.w([260, 140], [260, 150]); b.w([260, 190], [260, 200]); b.w([100, 220], [100, 240]);
  b.l("IN", 100, 160); b.l("OUT", 330, 170);
  b.probe("Vin", 100, 160, "#1f6feb"); b.probe("Vout", 330, 170, "#d1242f");
  b.c("SCOPE", 460, 120);
  b.w([430, 150], [430, 170]); b.l("IN", 430, 170); b.w([450, 150], [450, 180]); b.l("OUT", 450, 180);
  b.p.sim.analysis = "tran"; b.p.sim.tran.tstop = 0.003;
  return b.p;
}

export function exampleDigital(): Project {
  const b = new B("Digital Counter");
  b.c("CLOCK", 100, 200, { freq: "1k" });
  b.c("CNT4", 200, 200);
  b.w([120, 200], [170, 200]); b.l("CLK", 140, 200);
  ["Q0", "Q1", "Q2", "Q3"].forEach((q, i) => { b.w([230, 185 + i * 10], [250, 185 + i * 10]); b.l(q, 250, 185 + i * 10); });
  b.c("DFF", 200, 300);
  b.w([230, 310], [250, 310]); b.l("QN", 250, 310);
  b.w([170, 290], [150, 290]); b.l("QN", 150, 290);
  b.w([170, 310], [150, 310]); b.l("CLK", 150, 310);
  b.w([230, 290], [250, 290]); b.l("DIV2", 250, 290);
  b.c("LA", 360, 240);
  ["CLK", "Q0", "Q1", "Q2", "Q3", "DIV2"].forEach((n, i) => { const y = 240 - 35 + i * 10; b.w([330, y], [310, y]); b.l(n, 310, y); });
  b.c("LOGIC_PROBE", 300, 380); b.w([280, 380], [260, 380]); b.l("Q3", 260, 380);
  b.c("GND", 100, 260);
  b.p.sim.analysis = "tran"; b.p.sim.tran.tstop = 0.04;
  return b.p;
}

export const EXAMPLES: { key: string; name: string; make: () => Project }[] = [
  { key: "rc", name: "RC Low-pass (Transient + Scope)", make: exampleRC },
  { key: "diode", name: "Diode DC Sweep", make: exampleDiode },
  { key: "sweep", name: "RC Parameter Sweep", make: exampleParamSweep },
  { key: "opamp", name: "Inverting Op-Amp", make: exampleOpAmp },
  { key: "digital", name: "Digital Counter + Logic Analyzer", make: exampleDigital },
];
