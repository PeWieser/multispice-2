// Regression test suite — runs in browser (Help ▸ Run Self-Tests), via GET /api/selftest, or `npx tsx scripts/test.ts`.
import { exampleRC, exampleDiode, exampleParamSweep, exampleOpAmp, exampleDigital } from "./examples";
import { runTransient, runDC, runParamSweep, prepare, measure } from "./analyses";
import { migrateProject, uid, type Project } from "./types";
import { defaultProps, LIBMAP } from "./library";

export interface TestResult { name: string; ok: boolean; detail: string }

function at(x: number[], y: number[], t: number) { let i = 0; while (i < x.length - 1 && x[i + 1] < t) i++; return y[i]; }
function codes(p: Project) { return prepare(p).diags.map((d) => d.code); }

export function runTests(): TestResult[] {
  const out: TestResult[] = [];
  const T = (name: string, fn: () => string) => { try { out.push({ name, ok: true, detail: fn() }); } catch (e) { out.push({ name, ok: false, detail: (e as Error).message }); } };
  const expect = (c: boolean, m: string) => { if (!c) throw new Error(m); };

  T("1 RC low-pass transient (tau = 100 µs)", () => {
    const p = exampleRC();
    const r = runTransient(p, p.sim.tran);
    const y = r.signals["V(OUT)"];
    expect(!!y, "V(OUT) missing");
    const v1 = at(r.x, y, 1e-4), v5 = at(r.x, y, 9.5e-4);
    expect(Math.abs(v1 - 5 * (1 - Math.exp(-1))) < 0.12, `V(OUT)@tau=${v1.toFixed(3)} expected ≈3.16`);
    expect(Math.abs(v5 - 5) < 0.05, `V(OUT)@0.95ms=${v5.toFixed(3)}`);
    const cn = prepare(p).cn; const pr = p.probes[0];
    expect(cn.probeNets[pr.id].pos === "OUT", "probe not attached to OUT");
    const sc = p.components.find((c) => c.type === "SCOPE")!;
    expect(cn.pinNet[sc.id + ":A"] === "OUT", "scope channel A not on OUT");
    return `V(tau)=${v1.toFixed(3)} V, V(end)=${v5.toFixed(3)} V`;
  });
  T("2 Diode DC sweep", () => {
    const p = exampleDiode();
    const [r] = runDC(p, p.sim.dc);
    const vd = r.signals["V(VD)"]; const last = vd[vd.length - 1];
    expect(last > 0.6 && last < 1.0, `Vd@5V=${last}`);
    expect(vd[0] < 1e-3, "Vd@0V not 0");
    const id = r.signals["I(D1)"]; expect(Math.abs(id[id.length - 1] - (5 - last) / 100) < 1e-3, "diode current mismatch");
    return `Vd(5V)=${last.toFixed(3)} V, ${r.x.length} points`;
  });
  T("3 Parameter sweep R1 (4 overlaid runs)", () => {
    const p = exampleParamSweep();
    const runs = runParamSweep(p);
    expect(runs.length === 4, `runs=${runs.length}`);
    expect(runs.every((r) => r.label.startsWith("R1.value=")), "labels missing parameter");
    const v = runs.map((r) => at(r.x, r.signals["V(OUT)"], 2e-4));
    expect(v[0] > v[1] && v[1] > v[2] && v[2] > v[3], "larger R must charge slower: " + v.map((q) => q.toFixed(2)).join(","));
    return runs.map((r, i) => `${r.label}: ${v[i].toFixed(2)}V`).join(" | ");
  });
  T("4 Inverting op-amp gain −4.7", () => {
    const p = exampleOpAmp();
    const r = runTransient(p, p.sim.tran);
    const m = measure(r.x, r.signals["V(OUT)"]);
    expect(Math.abs(m.pp / 2 - 4.7) < 0.1, `Vout amplitude=${(m.pp / 2).toFixed(3)}`);
    const vin = at(r.x, r.signals["V(IN)"], 2.5e-4), vout = at(r.x, r.signals["V(OUT)"], 2.5e-4);
    expect(vin > 0.9 && vout < -4.2, "phase not inverted");
    return `Vout pk=${(m.pp / 2).toFixed(3)} V`;
  });
  T("5 Digital counter + DFF", () => {
    const p = exampleDigital();
    const r = runTransient(p, p.sim.tran);
    const f0 = measure(r.x, r.signals["V(Q0)"]).freq, f3 = measure(r.x, r.signals["V(Q3)"]).freq, fd = measure(r.x, r.signals["V(DIV2)"]).freq;
    expect(Math.abs(f0 - 500) < 10, `Q0 f=${f0}`);
    expect(Math.abs(f3 - 62.5) < 5, `Q3 f=${f3}`);
    expect(Math.abs(fd - 500) < 10, `DFF div2 f=${fd}`);
    return `Q0=${f0.toFixed(1)}Hz Q3=${f3.toFixed(1)}Hz DIV2=${fd.toFixed(1)}Hz`;
  });
  T("6a ERC: no ground", () => { const p = exampleRC(); p.components = p.components.filter((c) => c.type !== "GND"); expect(codes(p).includes("NO_GND"), "NO_GND not reported"); return "ok"; });
  T("6b ERC: unconnected pin", () => { const p = exampleRC(); p.wires = p.wires.filter((w) => !(w.a[0] === 220 && w.a[1] === 220)); expect(codes(p).includes("UNCONNECTED"), "UNCONNECTED not reported"); return "ok"; });
  T("6c ERC: missing model", () => { const p = exampleRC(); p.components.push({ id: uid(), type: "XYZ_UNKNOWN", ref: "U9", x: 0, y: 0, rot: 0, mirror: false, sheet: "s1", props: {} }); expect(codes(p).includes("NO_MODEL"), "NO_MODEL not reported"); return "ok"; });
  T("6d ERC: duplicate reference", () => { const p = exampleRC(); p.components.find((c) => c.type === "C")!.ref = "R1"; expect(codes(p).includes("DUP_REF"), "DUP_REF not reported"); return "ok"; });
  T("6e ERC: floating node", () => {
    const p = exampleRC();
    const c = { id: uid(), type: "C", ref: "C9", x: 500, y: 400, rot: 0 as const, mirror: false, sheet: "s1", props: defaultProps(LIBMAP.C) };
    p.components.push(c); p.wires.push({ id: uid(), a: [480, 400], b: [480, 380], sheet: "s1" }); p.labels.push({ id: uid(), name: "OUT", x: 480, y: 380, kind: "local", sheet: "s1" });
    p.wires.push({ id: uid(), a: [520, 400], b: [540, 400], sheet: "s1" }); p.labels.push({ id: uid(), name: "FLOAT", x: 540, y: 400, kind: "local", sheet: "s1" });
    expect(codes(p).includes("FLOATING"), "FLOATING not reported"); return "ok";
  });
  T("6f ERC: invalid value", () => { const p = exampleRC(); p.components.find((c) => c.type === "R")!.props.value = "abc"; expect(codes(p).includes("BAD_VALUE"), "BAD_VALUE not reported"); return "ok"; });
  T("6g Crossing wires do not connect", () => {
    const p = exampleRC();
    p.wires.push({ id: uid(), a: [160, 100], b: [160, 300], sheet: "s1" });
    const cn = prepare(p).cn; const w = p.wires[p.wires.length - 1];
    expect(cn.wireNet[w.id] !== cn.pinNet[p.components[1].id + ":1"], "crossing connected");
    return "ok";
  });
  T("7 Persistence round-trip (JSON + migration)", () => {
    const p = exampleOpAmp();
    const back = migrateProject(JSON.parse(JSON.stringify(p)));
    expect(JSON.stringify(back.components) === JSON.stringify(p.components), "components differ");
    expect(JSON.stringify(back.wires) === JSON.stringify(p.wires), "wires differ");
    expect(JSON.stringify(back.probes) === JSON.stringify(p.probes), "probes differ");
    expect(JSON.stringify(back.sim) === JSON.stringify(p.sim), "sim settings differ");
    const v1 = migrateProject({ schemaVersion: 1, components: [], wires: [], labels: [], probes: [], sheets: [{ id: "s1", name: "S" }] });
    expect(v1.schemaVersion === 2 && Array.isArray(v1.texts), "v1 migration failed");
    return "ok";
  });
  return out;
}
