import {
  type Component,
  type Diagnostic,
  type Label,
  type NetGraph,
  type NetNode,
  type Sheet,
  type Vec,
  type Wire,
} from "./types";
import { componentValue, getDef } from "./library";

const EPS = 0.01;

export function pointKey(p: Vec): string {
  return `${Math.round(p.x * 100) / 100},${Math.round(p.y * 100) / 100}`;
}

function onSegment(p: Vec, a: Vec, b: Vec): boolean {
  const cross = (p.y - a.y) * (b.x - a.x) - (p.x - a.x) * (b.y - a.y);
  if (Math.abs(cross) > EPS) return false;
  const dot = (p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y);
  if (dot < -EPS) return false;
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  return dot <= len2 + EPS;
}

export function onPolyline(p: Vec, pts: Vec[]): boolean {
  for (let i = 0; i < pts.length - 1; i++) {
    if (onSegment(p, pts[i], pts[i + 1])) return true;
  }
  return pts.some((q) => Math.abs(q.x - p.x) < EPS && Math.abs(q.y - p.y) < EPS);
}

class UnionFind {
  parent = new Map<string, string>();
  find(a: string): string {
    let p = this.parent.get(a) ?? a;
    if (!this.parent.has(a)) this.parent.set(a, a);
    while ((p = this.parent.get(p) ?? p) !== a) {
      this.parent.set(a, p);
      a = p;
    }
    return a;
  }
  union(a: string, b: string) {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

interface PinItem {
  key: string;
  componentId: string;
  ref: string;
  pinId: string;
  pinName: string;
  type: string;
  x: number;
  y: number;
}

/**
 * Connectivity Resolver.
 *
 * Electrical connectivity is derived exclusively from exact geometry:
 *  - every vertex of a wire belongs to that wire's conductor,
 *  - a pin / label / wire vertex that lies exactly on another wire's
 *    segment joins that conductor (T junction),
 *  - two segments that merely cross in their interiors are NOT connected.
 */
export function resolveNetlist(sheet: Sheet): NetGraph {
  const uf = new UnionFind();
  const wireIds = sheet.wires.map((w) => `w:${w.id}`);
  wireIds.forEach((id) => uf.find(id));

  // ---- collect pin items -------------------------------------------
  const pins: PinItem[] = [];
  for (const comp of sheet.components) {
    const def = getDef(comp.defId);
    if (!def) continue;
    for (const p of def.pins) {
      const w = pinPos(comp, p);
      const key = `p:${comp.id}:${p.id}`;
      uf.find(key);
      pins.push({
        key,
        componentId: comp.id,
        ref: comp.ref,
        pinId: p.id,
        pinName: p.name,
        type: p.type,
        x: w.x,
        y: w.y,
      });
    }
  }

  // ---- wire <-> wire ------------------------------------------------
  for (let i = 0; i < sheet.wires.length; i++) {
    for (let j = i + 1; j < sheet.wires.length; j++) {
      const a = sheet.wires[i];
      const b = sheet.wires[j];
      let hit = false;
      for (const pa of a.points) {
        if (onPolyline(pa, b.points)) {
          hit = true;
          break;
        }
      }
      if (!hit) {
        for (const pb of b.points) {
          if (onPolyline(pb, a.points)) {
            hit = true;
            break;
          }
        }
      }
      if (hit) uf.union(`w:${a.id}`, `w:${b.id}`);
    }
  }

  // ---- pins / labels <-> wires -------------------------------------
  const attachPoints: { x: number; y: number; key: string }[] = [];
  for (const p of pins) attachPoints.push({ x: p.x, y: p.y, key: p.key });
  for (const l of sheet.labels) attachPoints.push({ x: l.x, y: l.y, key: `l:${l.id}` });

  for (const ap of attachPoints) {
    uf.find(ap.key);
    for (const w of sheet.wires) {
      if (onPolyline({ x: ap.x, y: ap.y }, w.points)) uf.union(ap.key, `w:${w.id}`);
    }
  }

  // ---- pin <-> pin (directly stacked) ------------------------------
  const byPoint = new Map<string, string[]>();
  for (const ap of attachPoints) {
    const k = pointKey({ x: ap.x, y: ap.y });
    const arr = byPoint.get(k) ?? [];
    arr.push(ap.key);
    byPoint.set(k, arr);
  }
  for (const [, arr] of byPoint) {
    for (let i = 1; i < arr.length; i++) uf.union(arr[0], arr[i]);
  }

  // ---- build nets ---------------------------------------------------
  const groups = new Map<string, string[]>();
  for (const key of [...uf.parent.keys()]) {
    const root = uf.find(key);
    const arr = groups.get(root) ?? [];
    arr.push(key);
    groups.set(root, arr);
  }

  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];
  const nets: NetNode[] = [];
  const pinToNet: Record<string, string> = {};
  const junctions: Vec[] = [];
  const junctionKeys = new Set<string>();

  // junction dots: a wire endpoint touching another wire's interior, or 3+ conductors at a point
  for (const w of sheet.wires) {
    for (const pt of w.points) {
      let touching = 0;
      for (const other of sheet.wires) {
        if (other.id === w.id) continue;
        if (onPolyline(pt, other.points)) touching++;
      }
      const pinHere = pins.filter((p) => Math.abs(p.x - pt.x) < EPS && Math.abs(p.y - pt.y) < EPS).length;
      if (touching + pinHere >= 2 && !junctionKeys.has(pointKey(pt))) {
        junctionKeys.add(pointKey(pt));
        junctions.push({ x: pt.x, y: pt.y });
      }
    }
  }

  let idx = 0;
  for (const [, members] of groups) {
    const netPins = members
      .filter((m) => m.startsWith("p:"))
      .map((m) => pins.find((p) => p.key === m)!)
      .filter(Boolean);
    const netLabels = sheet.labels.filter((l) => members.includes(`l:${l.id}`));
    const netWires = sheet.wires.filter((w) => members.includes(`w:${w.id}`));
    if (netPins.length === 0 && netLabels.length === 0) continue;

    // naming priority: ground > power symbol > global label > net label > auto
    let name = "";
    let kind: NetNode["kind"] = "unnamed";
    let isGround = false;

    for (const p of netPins) {
      const comp = sheet.components.find((c) => c.id === p.componentId)!;
      if (comp?.defId === "gnd" || p.type === "ground") {
        name = "GND";
        kind = "ground";
        isGround = true;
        break;
      }
    }
    if (!name) {
      for (const p of netPins) {
        const comp = sheet.components.find((c) => c.id === p.componentId)!;
        if (comp && (comp.defId === "vcc" || comp.defId === "vdd")) {
          name = componentValue(getDef(comp.defId)!, comp.props) || comp.ref;
          kind = "power";
          break;
        }
      }
    }
    if (!name) {
      const global = netLabels.find((l) => l.kind === "global");
      const local = netLabels.find((l) => l.kind === "net");
      const chosen = global ?? local;
      if (chosen) {
        name = chosen.text.trim().replace(/\s+/g, "_");
        kind = global ? "power" : "signal";
      }
    }
    if (!name) {
      const source = netPins.find((p) => {
        const def = getDef(sheet.components.find((c) => c.id === p.componentId)?.defId ?? "");
        return def?.kind === "source";
      });
      const ref = source?.ref ?? netPins[0]?.ref;
      name = ref ? `N$${ref}${source?.pinId ?? netPins[0]?.pinId}` : `N$${idx}`;
      kind = "signal";
    }

    // conflicting labels on one net
    const labelNames = new Set(netLabels.map((l) => l.text.trim()));
    if (labelNames.size > 1) {
      warnings.push({
        id: `netconflict_${name}`,
        severity: "warning",
        code: "NET-002",
        message: `Net carries conflicting labels: ${[...labelNames].join(", ")} — using "${name}".`,
        hint: "Remove or rename one of the net labels so the net has a single name.",
      });
    }

    const digital = netPins.some((p) => {
      const def = getDef(sheet.components.find((c) => c.id === p.componentId)?.defId ?? "");
      return def?.kind === "digital";
    });
    const analog = netPins.some((p) => {
      const def = getDef(sheet.components.find((c) => c.id === p.componentId)?.defId ?? "");
      return def?.kind === "analog" || def?.kind === "source";
    });

    const net: NetNode = {
      id: `net_${name}_${idx}`,
      name,
      kind,
      isGround,
      pins: netPins.map((p) => ({
        componentId: p.componentId,
        ref: p.ref,
        pinId: p.pinId,
        pinName: p.pinName,
        x: p.x,
        y: p.y,
      })),
      wireIds: netWires.map((w) => w.id),
      probeIds: [],
      signalType: kind === "power" ? "power" : digital && analog ? "mixed" : digital ? "digital" : analog ? "analog" : "unknown",
    };
    nets.push(net);
    for (const p of netPins) pinToNet[`${p.componentId}:${p.pinId}`] = net.id;
    idx++;
  }

  // ---- probe attachment --------------------------------------------
  for (const probe of sheet.probes) {
    let target: NetNode | undefined;
    if (probe.type === "voltage" || probe.type === "differential" || probe.type === "power") {
      for (const w of sheet.wires) {
        if (onPolyline({ x: probe.x, y: probe.y }, w.points)) {
          target = nets.find((n) => n.wireIds.includes(w.id));
          if (target) break;
        }
      }
      if (!target) {
        const near = pins.find(
          (p) => Math.abs(p.x - probe.x) < 12 && Math.abs(p.y - probe.y) < 12,
        );
        if (near) target = nets.find((n) => n.id === pinToNet[`${near.componentId}:${near.pinId}`]);
      }
      if (target) {
        probe.netId = target.id;
        target.probeIds.push(probe.id);
      } else if (probe.netId) {
        const byId = nets.find((n) => n.id === probe.netId);
        if (byId) {
          byId.probeIds.push(probe.id);
        } else {
          errors.push({
            id: `probe_${probe.id}`,
            severity: "error",
            code: "PRB-001",
            message: `Probe "${probe.name}" is not attached to a net.`,
            hint: "Move the probe onto a wire or a pin so it can measure a node voltage.",
            x: probe.x,
            y: probe.y,
          });
        }
      } else {
        errors.push({
          id: `probe_${probe.id}`,
          severity: "error",
          code: "PRB-001",
          message: `Probe "${probe.name}" is not attached to a net.`,
          hint: "Move the probe onto a wire or a pin so it can measure a node voltage.",
          x: probe.x,
          y: probe.y,
        });
      }
    } else {
      // current / power probe on a component
      if (!probe.componentId) {
        let best: Component | undefined;
        let bestD = 70;
        for (const c of sheet.components) {
          const d = Math.hypot(c.x - probe.x, c.y - probe.y);
          if (d < bestD) {
            bestD = d;
            best = c;
          }
        }
        if (best) probe.componentId = best.id;
      }
      const comp = sheet.components.find((c) => c.id === probe.componentId);
      if (!comp) {
        errors.push({
          id: `probe_${probe.id}`,
          severity: "error",
          code: "PRB-002",
          message: `Current probe "${probe.name}" has no target component.`,
          hint: "Attach the probe to a two-terminal component so its branch current can be measured.",
          x: probe.x,
          y: probe.y,
        });
      }
    }
  }

  // ---- ERC ----------------------------------------------------------
  const refs = new Map<string, number>();
  for (const c of sheet.components) {
    const def = getDef(c.defId);
    if (def?.kind === "power" && def.fixedValue) continue; // power symbols share a name by design
    refs.set(c.ref, (refs.get(c.ref) ?? 0) + 1);
  }
  for (const [ref, count] of refs) {
    if (count > 1 && ref) {
      errors.push({
        id: `dupref_${ref}`,
        severity: "error",
        code: "ERC-003",
        message: `Reference "${ref}" is used ${count} times.`,
        hint: "Run Tools ▸ Annotation to renumber the designators.",
      });
    }
  }

  const hasGround = nets.some((n) => n.isGround);
  const needsGround = sheet.components.some((c) => {
    const def = getDef(c.defId);
    return def && def.kind !== "instrument" && def.kind !== "virtual";
  });
  if (needsGround && !hasGround) {
    errors.push({
      id: "nognd",
      severity: "error",
      code: "ERC-001",
      message: "No ground reference in the design.",
      hint: "Place ▸ Ground (GND) so the solver has a node 0 reference.",
    });
  }

  for (const net of nets) {
    if (net.pins.length === 1 && !net.isGround && net.kind !== "power") {
      const p = net.pins[0];
      const def = getDef(sheet.components.find((c) => c.id === p.componentId)?.defId ?? "");
      const isPowerPin = def?.kind === "power";
      if (!isPowerPin) {
        warnings.push({
          id: `single_${net.id}`,
          severity: "warning",
          code: "ERC-004",
          message: `Pin ${p.ref}.${p.pinName} is unconnected (net ${net.name}).`,
          hint: "Draw a wire from this pin, or place a no-connect marker if it is intentional.",
          ref: p.ref,
          x: p.x,
          y: p.y,
        });
      }
    }
    if (net.pins.length >= 1 && net.wireIds.length === 0 && net.pins.length === 1 && !net.isGround) {
      // already covered above
    }
    const hasDcPath = net.pins.some((p) => {
      const def = getDef(sheet.components.find((c) => c.id === p.componentId)?.defId ?? "");
      return def && ["resistor", "inductor", "vsource", "isource", "diode", "zener", "led", "switch", "transformer", "potentiometer", "npn", "pnp", "nmos", "pmos", "opamp", "comparator", "vcc", "vdd", "gnd", "led_ind", "testpoint", "port"].includes(def.id);
    });
    if (!hasDcPath && net.pins.length > 0) {
      // capacitor-only or logic-only nets: report as floating for analog solve
      const onlyCaps = net.pins.every((p) => {
        const def = getDef(sheet.components.find((c) => c.id === p.componentId)?.defId ?? "");
        return def?.id === "capacitor";
      });
      if (onlyCaps && net.pins.length > 0 && !net.isGround) {
        warnings.push({
          id: `float_${net.id}`,
          severity: "warning",
          code: "ERC-005",
          message: `Floating node ${net.name}: no DC path to ground.`,
          hint: "Add a resistor to ground or another DC reference to make the operating point solvable.",
          x: net.pins[0].x,
          y: net.pins[0].y,
        });
      }
    }
  }

  for (const c of sheet.components) {
    const def = getDef(c.defId);
    if (!def) {
      errors.push({
        id: `model_${c.id}`,
        severity: "error",
        code: "ERC-002",
        message: `Component ${c.ref} has no library model (${c.defId}).`,
        hint: "Delete the component or restore the missing library entry.",
      });
      continue;
    }
    const value = componentValue(def, c.props);
    if (def.valueProp && def.model === "simulated") {
      const raw = c.props[def.valueProp] ?? "";
      const num = Number.parseFloat(raw.replace(/[a-zA-ZµΩ%°/]+/g, ""));
      if (raw.trim() === "" || (Number.isFinite(num) && num <= 0 && def.id !== "vpwl")) {
        errors.push({
          id: `value_${c.id}`,
          severity: "error",
          code: "ERC-006",
          message: `Invalid value for ${c.ref}: "${value || raw}"`,
          hint: "Enter a positive engineering value, e.g. 10k, 100n, 2.2µ.",
          ref: c.ref,
          x: c.x,
          y: c.y,
        });
      }
    }
    for (const p of def.pins) {
      const net = nets.find((n) => n.id === pinToNet[`${c.id}:${p.id}`]);
      if (!net && p.type !== "nc") {
        const pw = pinPos(c, p);
        if (def.id === "opamp" || def.kind === "instrument") continue;
        warnings.push({
          id: `unconn_${c.id}_${p.id}`,
          severity: "warning",
          code: "ERC-004",
          message: `Pin ${c.ref}.${p.name} is not connected.`,
          hint: "Draw a wire that ends exactly on the pin.",
          ref: c.ref,
          x: pw.x,
          y: pw.y,
        });
      }
    }
  }

  const floatingNodes = nets
    .filter((n) => n.pins.length === 1 && !n.isGround && n.kind !== "power")
    .map((n) => n.name);

  return {
    nets,
    pinToNet,
    netById: Object.fromEntries(nets.map((n) => [n.id, n])),
    junctions,
    floatingNodes,
    errors,
    warnings,
    stats: {
      components: sheet.components.length,
      wires: sheet.wires.length,
      nets: nets.length,
      pins: pins.length,
    },
  };
}

export function pinPos(comp: Component, p: { x: number; y: number }): Vec {
  let x = comp.mirror ? -p.x : p.x;
  let y = p.y;
  switch (comp.rot) {
    case 90:
      [x, y] = [-y, x];
      break;
    case 180:
      [x, y] = [-x, -y];
      break;
    case 270:
      [x, y] = [y, -x];
      break;
  }
  return { x: comp.x + x, y: comp.y + y };
}

/** Orthogonal wire routing between two points (L or Z shape, grid snapped). */
export function routeOrthogonal(a: Vec, b: Vec, mode: "auto" | "h" | "v" = "auto"): Vec[] {
  if (a.x === b.x || a.y === b.y) return [a, b];
  if (mode === "h") return [a, { x: b.x, y: a.y }, b];
  if (mode === "v") return [a, { x: a.x, y: b.y }, b];
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  if (dx > dy) return [a, { x: b.x, y: a.y }, b];
  return [a, { x: a.x, y: b.y }, b];
}

export function labelPoints(): Label[] {
  return [];
}

export type { Wire };
