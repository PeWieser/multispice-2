/** Patchfeld-Modell: welche Generator-Buchse steckt an welchem Oszilloskop-Eingang */

export type OutJack = 'out1' | 'out2';
export type InJack = 'scopeA' | 'scopeB';
export type JackId = OutJack | InJack;

export interface CableLink { out: OutJack; inp: InJack }
export interface Pt { x: number; y: number }
export interface JackGeo extends Pt { r: number }

export const OUT_JACKS: OutJack[] = ['out1', 'out2'];
export const IN_JACKS: InJack[] = ['scopeA', 'scopeB'];

export const isOut = (j: JackId): j is OutJack => j === 'out1' || j === 'out2';
export const chOf = (j: OutJack): 0 | 1 => (j === 'out1' ? 0 : 1);

/** Kabelfarbe (Aderkennung) nach Quellkanal */
export const CABLE_TINT: Record<OutJack, string> = { out1: '#d24450', out2: '#3a86d8' };

export const JACK_LABEL: Record<JackId, string> = {
  out1: 'OUT1', out2: 'OUT2', scopeA: 'Scope CH A', scopeB: 'Scope CH B',
};

export function cableOf(cables: CableLink[], j: JackId): CableLink | undefined {
  return cables.find((c) => (isOut(j) ? c.out === j : c.inp === j));
}

export function otherEnd(c: CableLink, j: JackId): JackId {
  return isOut(j) ? c.inp : c.out;
}

/** Freie Gegenstellen für ein Kabelende */
export function freeTargets(cables: CableLink[], fixed: JackId): JackId[] {
  const pool: JackId[] = isOut(fixed) ? IN_JACKS : OUT_JACKS;
  return pool.filter((j) => !cableOf(cables, j));
}
