
import { SchematicDoc } from "@/lib/schematic/model";
import { RealtimeEngine } from "@/lib/sim/realtime";
export const engine = new RealtimeEngine();

export const clone = (doc: SchematicDoc): SchematicDoc => JSON.parse(JSON.stringify(doc)) as SchematicDoc;

/** W79: Bündelt alle Änderungen innerhalb einer Zieh-Geste zu einem einzigen Undo-Schritt. */
export const gesture = { active: false, pushed: false };

export const cloneJson = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export const newId = (prefix: string) => `${prefix}_` + Math.random().toString(36).slice(2, 10);

let logId = 1;
export const nextLogId = () => logId++;
export const now = () => new Date().toLocaleTimeString("de-DE", { hour12: false });
