/**
 * S5.6d: Lehrer-Modus — 4-stelliger Zahlencode, Werte/Faults verstecken +
 * Plan sperren. Ehrlichkeits-Schloss für den Unterricht (FNV-Hash, kein
 * Sicherheits-Code): Der Code liegt nur gehasht in localStorage.
 */

export function isTeacherCodeFormat(code: string): boolean {
  return /^\d{4}$/.test(code);
}

export function hashTeacherCode(code: string): string {
  let h = 0x811c9dc5;
  const s = `multispice-teacher:${code}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function verifyTeacherCode(code: string, hash: string): boolean {
  if (!isTeacherCodeFormat(code)) return false;
  return hashTeacherCode(code) === hash;
}

export interface TeacherLockState {
  locked: boolean;
  codeHash: string | null;
}

const KEY = "multispice.teacher";

export function loadTeacherLock(): TeacherLockState {
  try {
    if (typeof window === "undefined") return { locked: false, codeHash: null };
    const raw = localStorage.getItem(KEY);
    if (!raw) return { locked: false, codeHash: null };
    const p = JSON.parse(raw) as Partial<TeacherLockState>;
    const codeHash = typeof p.codeHash === "string" ? p.codeHash : null;
    // Gesperrt nur mit gültigem Code-Hash (sonst wäre nie entsperrbar).
    return { locked: p.locked === true && codeHash !== null, codeHash };
  } catch {
    return { locked: false, codeHash: null };
  }
}

export function saveTeacherLock(s: TeacherLockState): void {
  try {
    if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* Voller/blockierter Storage darf das Sperren nicht verhindern. */
  }
}
