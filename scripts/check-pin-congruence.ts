/* W3-Regressionstest: Jeder elektrische Pin jedes Katalogteils muss exakt auf
 * einem Symbol-Element liegen (Linienpunkt/-segment, Rect-Kante, Kreisrand).
 * Visuelles Symbol und elektrischer Anschluss sind EINE Quelle der Wahrheit.
 * Run: tsx scripts/check-pin-congruence.ts (Teil von npm test). */
import { PARTS, SymbolPrim, PinDef } from "../src/lib/library/catalog";

const EPS = 0.001;

function onSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): boolean {
  const dx = x2 - x1, dy = y2 - y1;
  if (Math.abs(dx) < EPS && Math.abs(dy) < EPS) return Math.abs(px - x1) < EPS && Math.abs(py - y1) < EPS;
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
  if (t < -EPS || t > 1 + EPS) return false;
  return Math.abs(px - (x1 + t * dx)) < EPS && Math.abs(py - (y1 + t * dy)) < EPS;
}

function pinTouchesSymbol(pin: PinDef, symbol: SymbolPrim[]): boolean {
  for (const pr of symbol) {
    if (pr.t === "line") {
      const p = pr.pts;
      for (let i = 0; i + 2 < p.length; i += 2) {
        if (onSegment(pin.x, pin.y, p[i], p[i + 1], p[i + 2], p[i + 3])) return true;
      }
    } else if (pr.t === "rect") {
      const { x, y, w, h } = pr;
      if ((Math.abs(pin.x - x) < EPS || Math.abs(pin.x - (x + w)) < EPS) && pin.y >= y - EPS && pin.y <= y + h + EPS) return true;
      if ((Math.abs(pin.y - y) < EPS || Math.abs(pin.y - (y + h)) < EPS) && pin.x >= x - EPS && pin.x <= x + w + EPS) return true;
    } else if (pr.t === "circle") {
      if (Math.abs(Math.hypot(pin.x - pr.x, pin.y - pr.y) - pr.r) < EPS) return true;
    }
  }
  return false;
}

let checked = 0;
const fails: string[] = [];
for (const part of PARTS) {
  if (!part.pins || !part.symbol) continue;
  for (const pin of part.pins) {
    checked++;
    if (!pinTouchesSymbol(pin, part.symbol)) fails.push(`${part.id} · ${pin.name} (${pin.x},${pin.y})`);
  }
}
console.log(`Pin-Kongruenz: ${PARTS.length} Teile, ${checked} Pins geprüft`);
if (fails.length) {
  console.error(`FAIL – ${fails.length} Pins nicht deckungsgleich:\n${fails.join("\n")}`);
  process.exit(1);
}
console.log("PASS alle Pins deckungsgleich");
