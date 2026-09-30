/**
 * Runde 21 (W42/W43): Fenster-Geometrie – Startgröße am Inhalt (auch bei
 * knappem Bildschirm), Vier-Ecken-Skalierung mit Anker und Proportionen,
 * Mindest-/Höchstgrenzen und Bildschirmklemme.
 *
 * Läuft ohne DOM über die reinen Funktionen aus `src/lib/windows/geometry.ts`.
 */
import { fitWindowSize, resizeRect, type Rect } from "../src/lib/windows/geometry";

let failed = 0;
function check(name: string, ok: boolean, info = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${info ? ` – ${info}` : ""}`);
  if (!ok) failed++;
}
const near = (a: number, b: number, eps = 0.6) => Math.abs(a - b) <= eps;

/* ---------- Startgröße: Fenster = Inhalt + Chrome ---------- */
const oszi = { natural: { w: 1420, h: 688 }, slack: { w: 2, h: 38 }, min: { w: 320, h: 240 }, viewport: { w: 1600, h: 1000 } };
const big = fitWindowSize({ ...oszi, disp: { w: 1420, h: 688 } });
check("Oszi auf großem Bildschirm: 1422×726", big.w === 1422 && big.h === 726, `${big.w}×${big.h}`);

// Knapper Bildschirm: Höhe begrenzt die Skalierung → Breite muss mitgehen
// (sonst stehen links/rechts große Lücken neben dem Gehäuse).
const tight = fitWindowSize({
  ...oszi,
  disp: { w: 1350.2, h: 654 },
  viewport: { w: 1600, h: 700 },
});
check("knapper Bildschirm: Breite folgt der Skalierung", tight.w === 1352 && tight.h <= 692, `${tight.w}×${tight.h}`);
check("knapper Bildschirm: Höhe bleibt im Bild", tight.h <= 692, `${tight.h}`);

// Werkbank-Rahmen (W44): Geräte sitzen mit schmalem Hintergrund-Rahmen im Fenster.
const bench = fitWindowSize({ ...oszi, disp: { w: 1420, h: 688 }, pad: 12 });
check("Werkbank-Rahmen: Fenster = Gerät + 2×12 + Chrome", bench.w === 1446 && bench.h === 750, `${bench.w}×${bench.h}`);

// Sehr kleiner Bildschirm: Mindestmaß greift, nie über den Bildschirm hinaus.
const tiny = fitWindowSize({ ...oszi, disp: { w: 320, h: 160 }, viewport: { w: 500, h: 400 } });
check("kleiner Bildschirm: nie über den Bildschirm hinaus", tiny.w <= 492 && tiny.h <= 392, `${tiny.w}×${tiny.h}`);

/* ---------- Vier-Ecken-Skalierung: Geräte behalten Proportionen ---------- */
const dev: Rect = { x: 100, y: 60, w: 1422, h: 726 };
const ratio = dev.w / dev.h;
const noMax = null;

// Südost: Vergrößern wird bei der Startgröße gedeckelt („nur verkleinern, max = Gerät“).
const seGrow = resizeRect({ rect: dev, corner: "se", dx: 300, dy: 300, aspect: ratio, min: { w: 320, h: 240 }, max: { w: dev.w, h: dev.h }, viewport: { w: 1600, h: 1000 } });
check("SE vergrößern: Deckel = Startgröße", seGrow.w === 1422 && seGrow.h === 726 && seGrow.x === 100 && seGrow.y === 60, `${seGrow.w}×${seGrow.h}`);

// Nordwest: Verkleinern – die gegenüberliegende (Südost-)Ecke bleibt stehen.
const nwShrink = resizeRect({ rect: dev, corner: "nw", dx: 300, dy: 150, aspect: ratio, min: { w: 320, h: 240 }, max: noMax, viewport: { w: 1600, h: 1000 } });
check("NW verkleinern: Proportion bleibt", near(nwShrink.w / nwShrink.h, ratio, 0.005), `${(nwShrink.w / nwShrink.h).toFixed(4)} vs ${ratio.toFixed(4)}`);
check("NW verkleinern: Südost-Ecke bleibt stehen", near(nwShrink.x + nwShrink.w, dev.x + dev.w) && near(nwShrink.y + nwShrink.h, dev.y + dev.h), `${nwShrink.x + nwShrink.w},${nwShrink.y + nwShrink.h}`);

// Kleiner ziehen muss deutlich möglich sein (Kritik R20: „Geräte bleiben riesig“).
const deep = resizeRect({ rect: dev, corner: "se", dx: -1200, dy: -1200, aspect: ratio, min: { w: 320, h: 240 }, max: { w: dev.w, h: dev.h }, viewport: { w: 1600, h: 1000 } });
check("SE: weit verkleinerbar (≈ 320×240 … 726 hoch)", deep.w <= 500 && deep.h <= 300, `${deep.w}×${deep.h}`);

// Nordost: Breite wächst, Höhe schrumpft – Anker unten links.
const ne = resizeRect({ rect: dev, corner: "ne", dx: -400, dy: 200, aspect: ratio, min: { w: 320, h: 240 }, max: noMax, viewport: { w: 1600, h: 1000 } });
check("NE: Anker unten links", near(ne.x, dev.x) && near(ne.y + ne.h, dev.y + dev.h) && near(ne.w / ne.h, ratio, 0.005), `${ne.x},${ne.y} ${ne.w}×${ne.h}`);

// Südwest: Anker oben rechts.
const sw = resizeRect({ rect: dev, corner: "sw", dx: 200, dy: -300, aspect: ratio, min: { w: 320, h: 240 }, max: noMax, viewport: { w: 1600, h: 1000 } });
check("SW: Anker oben rechts", near(sw.y, dev.y) && near(sw.x + sw.w, dev.x + dev.w) && near(sw.w / sw.h, ratio, 0.005), `${sw.x},${sw.y} ${sw.w}×${sw.h}`);

// Bildschirmklemme: Ein Zug nach außen darf das Fenster nicht aus dem Bild schieben.
const out = resizeRect({ rect: { x: 1200, y: 700, w: 400, h: 300 }, corner: "se", dx: 5000, dy: 5000, aspect: null, min: { w: 240, h: 180 }, max: null, viewport: { w: 1600, h: 1000 } });
check("Bildschirmklemme: rechte/untere Kante bleibt im Bild", out.x + out.w <= 1592 && out.y + out.h <= 992, `${out.x + out.w},${out.y + out.h}`);

/* ---------- Panels: frei skalierbar ---------- */
const panel: Rect = { x: 200, y: 120, w: 322, h: 318 };
const free = resizeRect({ rect: panel, corner: "se", dx: 78, dy: 122, aspect: null, min: { w: 240, h: 180 }, max: null, viewport: { w: 1600, h: 1000 } });
check("Panel: frei vergrößerbar (kein Zwangsverhältnis)", free.w === 400 && free.h === 440, `${free.w}×${free.h}`);
const freeSmall = resizeRect({ rect: panel, corner: "se", dx: -500, dy: -500, aspect: null, min: { w: 240, h: 180 }, max: null, viewport: { w: 1600, h: 1000 } });
check("Panel: bis zum Mindestmaß verkleinerbar", freeSmall.w === 240 && freeSmall.h === 180, `${freeSmall.w}×${freeSmall.h}`);

console.log(failed === 0 ? "Fenster-Geometrie: alle Prüfungen bestanden." : `Fenster-Geometrie: ${failed} Prüfung(en) fehlgeschlagen.`);
process.exit(failed === 0 ? 0 : 1);
