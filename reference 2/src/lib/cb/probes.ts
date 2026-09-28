import type { Connectivity } from "./connectivity";
import type { Probe, Project, SavedRun } from "./types";
import { worldPins } from "./connectivity";

/** Signal expression name for a probe (resolved against a run). */
export function probeSeries(pr: Probe, p: Project, cn: Connectivity, run: SavedRun): number[] | null {
  const S = run.signals;
  const V = (n: string | null | undefined) => (n ? (n === "0" ? run.x.map(() => 0) : S[`V(${n})`]) : undefined);
  if (pr.kind === "voltage") return V(cn.probeNets[pr.id]?.pos) ?? null;
  if (pr.kind === "diff") {
    const a = V(cn.probeNets[pr.id]?.pos), b = V(cn.probeNets[pr.id]?.neg);
    return a && b ? a.map((v, i) => v - b[i]) : null;
  }
  const c = p.components.find((x) => x.id === pr.compId);
  if (!c) return null;
  const I = S[`I(${c.ref})`] ?? S[`I(${c.ref}.${worldPins(c)[0]?.name})`];
  if (!I) return null;
  if (pr.kind === "current") return I;
  const pins = worldPins(c);
  const va = V(cn.pinNet[c.id + ":" + pins[0]?.name]), vb = V(cn.pinNet[c.id + ":" + pins[1]?.name]);
  if (!va || !vb) return null;
  return I.map((i, k) => i * (va[k] - vb[k]));
}
export function probeUnit(pr: Probe) { return pr.kind === "current" ? "A" : pr.kind === "power" ? "W" : "V"; }

/** Resolve a signal by generic name: V(net), I(ref), probe name, or math expression over these. */
export function signalByName(name: string, p: Project, cn: Connectivity, run: SavedRun): number[] | null {
  if (run.signals[name]) return run.signals[name];
  const pr = p.probes.find((q) => q.name === name);
  if (pr) return probeSeries(pr, p, cn, run);
  return null;
}
