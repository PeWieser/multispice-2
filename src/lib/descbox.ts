/**
 * S5.6c: Live-Platzhalter der Beschreibungsbox — rein (Snapshots in sprint5test).
 * Syntax: {V(NETZ)} Spannung, {I(BAUTEIL)} Strom, {P(BAUTEIL)} Leistung.
 */
import { formatValue } from "./format";

export interface DescboxLiveValues {
  nets: Record<string, number>;
  currents: Record<string, number>;
  power?: Record<string, number>;
}

export function resolveLiveText(template: string, live: DescboxLiveValues | null): string {
  return template.replace(/\{(V|I|P)\(([^)]+)\)\}/g, (_m, kind: string, key: string) => {
    if (!live) return "—";
    const name = key.trim();
    if (kind === "V") {
      const v = live.nets[name];
      return v === undefined ? "—" : formatValue(v, "V");
    }
    if (kind === "I") {
      const v = live.currents[name];
      return v === undefined ? "—" : formatValue(v, "A");
    }
    const v = live.power?.[name];
    return v === undefined ? "—" : formatValue(v, "W");
  });
}
