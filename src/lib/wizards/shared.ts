import type { Instance, SchematicDoc } from "../schematic/model";

let uidSeq = 0;
export function nid(prefix: string): string {
  uidSeq += 1;
  return `${prefix}_${Date.now().toString(36)}_${uidSeq.toString(36)}`;
}

export function makeInst(
  partId: string,
  label: string,
  x: number,
  y: number,
  params: Record<string, number | string | boolean> = {},
  rot: 0 | 90 | 180 | 270 = 0,
): Instance {
  return { id: nid("i"), partId, label, x, y, rot, params };
}

export function makeWire(...pts: number[]): SchematicDoc["wires"][number] {
  const points = [];
  for (let i = 0; i < pts.length; i += 2) {
    points.push({ x: pts[i], y: pts[i + 1] });
  }
  return { id: nid("w"), points };
}

