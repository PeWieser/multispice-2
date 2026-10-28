/**
 * S5.5: Link-Teilen — Schaltung als deflate+base64url im URL-Hash.
 * Isomorph (Browser + Node): kein Buffer/btoa, eigenes base64url.
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate";

/** Hash-Format: `#s=<payload>`. */
export const SHARE_HASH_KEY = "s";
/** Ehrliches Limit: längerer Payload → Datei statt Link (etwa 100 kB URL). */
export const SHARE_URL_LIMIT = 100_000;

const B64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function bytesToB64url(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += B64URL[(n >> 18) & 63] + B64URL[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += B64URL[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += B64URL[n & 63];
  }
  return out;
}

export function b64urlToBytes(s: string): Uint8Array {
  if (s.length % 4 === 1) throw new Error("Share-Link beschädigt (Länge).");
  const out: number[] = [];
  for (let i = 0; i < s.length; i += 4) {
    const c0 = B64URL.indexOf(s[i]);
    const c1 = B64URL.indexOf(s[i + 1] ?? "A");
    const c2 = i + 2 < s.length ? B64URL.indexOf(s[i + 2]) : 0;
    const c3 = i + 3 < s.length ? B64URL.indexOf(s[i + 3]) : 0;
    if (c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0) throw new Error("Share-Link beschädigt (Zeichen).");
    const n = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    out.push((n >> 16) & 255);
    if (i + 2 < s.length) out.push((n >> 8) & 255);
    if (i + 3 < s.length) out.push(n & 255);
  }
  return Uint8Array.from(out);
}

/** JSON-Envelope → kompakter Hash-Payload (deflate, Stufe 9). */
export function encodeSharePayload(json: string): string {
  return bytesToB64url(deflateSync(strToU8(json), { level: 9 }));
}

/** Payload → JSON-Envelope. Wirft bei beschädigten Links. */
export function decodeSharePayload(payload: string): string {
  return strFromU8(inflateSync(b64urlToBytes(payload)));
}

/** Extrahiert den Payload aus `location.hash` (null = kein Share-Link). */
export function parseShareHash(hash: string): string | null {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!h.startsWith(`${SHARE_HASH_KEY}=`)) return null;
  const payload = h.slice(SHARE_HASH_KEY.length + 1);
  return payload.length > 0 ? payload : null;
}

export function buildShareUrl(base: string, payload: string): string {
  return `${base}#${SHARE_HASH_KEY}=${payload}`;
}
