import { expect, test } from "@playwright/test";
import {
  act,
  canvasEl,
  clickWorld,
  closeInlineEditor,
  expectNoErrors,
  gotoApp,
  msEval,
  worldToPage,
} from "../helpers";

type Pt = { x: number; y: number };

async function placeResistor(page: Parameters<typeof clickWorld>[0], x: number, y: number): Promise<void> {
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, x, y);
  await closeInlineEditor(page);
}

// S4.1: W aktiviert Wire-Tool mit Stift-Cursor (Matrix „Fadenkreuz“ veraltet).
test("S4.1 Wire-Tool (W → Stift-Cursor)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  await expect.poll(() => msEval<string>(page, `(s) => s.tool`)).toBe("wire");
  const cursor = await canvasEl(page).evaluate((el) => (el as HTMLElement).style.cursor);
  expect(cursor).toContain("url(");
  expectNoErrors(errors);
});

// S4.2: Polyline per Klicks, Doppelklick beendet; Esc verwirft Entwurf.
test("S4.2 Polyline (Klicks + Doppelklick, Esc-Abbruch)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  // Klick-Abstand > Doppelklick-Fenster (e.detail>=2 wird sonst gefressen).
  await clickWorld(page, 400, 300);
  await page.waitForTimeout(600);
  await clickWorld(page, 500, 300);
  await page.waitForTimeout(600);
  await clickWorld(page, 500, 400);
  await page.waitForTimeout(600);
  const p = await worldToPage(page, 500, 400);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  const pts = await msEval<Pt[]>(page, `(s) => s.doc.wires[0].points`);
  expect(pts.length).toBeGreaterThanOrEqual(3);
  await expect.poll(() => msEval<string>(page, `(s) => s.tool`)).toBe("select");
  await page.keyboard.press("w");
  await clickWorld(page, 300, 300);
  await page.keyboard.press("Escape");
  await expect.poll(() => msEval<string>(page, `(s) => s.tool`)).toBe("select");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  expectNoErrors(errors);
});

// S4.4: Hover über Punkt/Mitte zeigt Handle-Cursor (grab/copy).
test("S4.4 Wire-Hover (Handle-Cursor)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  await clickWorld(page, 400, 300);
  const p = await worldToPage(page, 500, 300);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  const cursor = () => canvasEl(page).evaluate((el) => (el as HTMLElement).style.cursor);
  await page.mouse.move(p.x, p.y);
  await expect.poll(cursor).toBe("grab");
  const mid = await worldToPage(page, 450, 300);
  await page.mouse.move(mid.x, mid.y);
  await expect.poll(cursor).toBe("copy");
  expectNoErrors(errors);
});

// S4.5: Klick aufs Segment selektiert die Leitung.
test("S4.5 Wire selektieren (Klick auf Segment)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  await clickWorld(page, 400, 300);
  const p = await worldToPage(page, 500, 300);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  const id = await msEval<string>(page, `(s) => s.doc.wires[0].id`);
  await clickWorld(page, 450, 300);
  await expect.poll(() => msEval<string[]>(page, `(s) => s.selection`)).toEqual([id]);
  expectNoErrors(errors);
});

// S4.6: Punkt-Handle draggen (Router-Knick als Griff, Ortho bleibt).
test("S4.6 Wire-Punkt draggen (Rest bleibt)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  // Klick-Dreieck (Drag ab Leitungsmitte startet keinen Draft — nur Pin-Starts).
  await page.keyboard.press("w");
  // Klick-Abstand > Doppelklick-Fenster (e.detail>=2 wird sonst gefressen).
  await clickWorld(page, 400, 300);
  await page.waitForTimeout(600);
  await clickWorld(page, 600, 300);
  await page.waitForTimeout(600);
  await clickWorld(page, 600, 400);
  await page.waitForTimeout(600);
  const e = await worldToPage(page, 600, 400);
  await page.mouse.dblclick(e.x, e.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  const before = await msEval<Pt[]>(page, `(s) => s.doc.wires[0].points`);
  expect(before).toEqual([
    { x: 400, y: 300 },
    { x: 600, y: 300 },
    { x: 600, y: 400 },
  ]);
  // Auswahl-Werkzeug sicherstellen (Doppelklick beendet den Draft bereits).
  await page.keyboard.press("Escape");
  await expect.poll(() => msEval<string>(page, `(s) => s.tool`)).toBe("select");
  const h = await worldToPage(page, 600, 300);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  const q = await worldToPage(page, 640, 340);
  await page.mouse.move(q.x, q.y, { steps: 10 });
  await page.mouse.up();
  const after = await msEval<Pt[]>(page, `(s) => s.doc.wires[0].points`);
  expect(after.length).toBe(before.length);
  expect(after[1]).toEqual({ x: 640, y: 340 });
  // Ortho-Drag: Nachbarn folgen, damit alle Segmente achsparallel bleiben.
  for (let i = 1; i < after.length; i++) {
    const ortho = after[i].x === after[i - 1].x || after[i].y === after[i - 1].y;
    expect(ortho, `Segment ${i}`).toBe(true);
  }
  expectNoErrors(errors);
});

// S4.8: Auto-Route weicht Hindernis aus (diagonaler Drag, Knick untenrum).
test("S4.8 Auto-Route (Umweg um Hindernis)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placeResistor(page, 400, 300);
  await placeResistor(page, 500, 300);
  await page.keyboard.press("Escape");
  // Pin-Start + diagonaler Drag über R3 hinweg ins Freie (beide Knicks
  // blockiert → A*-Umweg; reine Leitungsmitte startet keinen Draft).
  await page.keyboard.press("w");
  const a = await worldToPage(page, 430, 300);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const b = await worldToPage(page, 620, 360);
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  const pts = await msEval<Pt[]>(page, `(s) => s.doc.wires[0].points`);
  // Anker exakt am Pin, Ende exakt am Ziel, dazwischen ein echter Umweg
  // (mehr als der 3-Punkt-Knick), alles streng achsparallel.
  expect(pts[0]).toEqual({ x: 430, y: 300 });
  expect(pts[pts.length - 1]).toEqual({ x: 620, y: 360 });
  expect(pts.length).toBeGreaterThanOrEqual(4);
  for (let i = 1; i < pts.length; i++) {
    const ortho = pts[i].x === pts[i - 1].x || pts[i].y === pts[i - 1].y;
    expect(ortho, `Segment ${i}`).toBe(true);
  }
  expectNoErrors(errors);
});

// S4.9: Snap rastet Endpunkt auf Grid (ausgeschaltet: frei).
test("S4.9 Snap (Endpunkt rastet auf Grid)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  await clickWorld(page, 400, 300);
  const p = await worldToPage(page, 463, 377);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  const pts1 = await msEval<Pt[]>(page, `(s) => s.doc.wires[0].points`);
  expect(pts1[pts1.length - 1]).toEqual({ x: 460, y: 380 });
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "Einstellungen" });
  await dlg.getByRole("button", { name: "Arbeitsfläche", exact: true }).click();
  await dlg.getByRole("switch", { name: "Am Raster ausrichten" }).click();
  await expect.poll(() => msEval<boolean>(page, `(s) => s.snap`)).toBe(false);
  await page.keyboard.press("Escape");
  // Snap aus → Bauteil-Drag landet frei (nicht auf Grid). Freie Stelle:
  // (400,300) ist der Drahtanfang aus Teil 1 und würde den Vertex treffen.
  await placeResistor(page, 200, 200);
  await page.keyboard.press("Escape");
  const d = await worldToPage(page, 200, 200);
  await page.mouse.move(d.x, d.y);
  await page.mouse.down();
  const g = await worldToPage(page, 247, 263);
  await page.mouse.move(g.x, g.y, { steps: 12 });
  await page.mouse.up();
  const pos = await msEval<Pt>(page, `(s) => ({ x: s.doc.instances[0].x, y: s.doc.instances[0].y })`);
  expect(Math.abs(pos.x - 247)).toBeLessThan(0.6);
  expect(Math.abs(pos.y - 263)).toBeLessThan(0.6);
  expect(Math.abs(pos.x - 240)).toBeGreaterThan(2);
  expectNoErrors(errors);
});
