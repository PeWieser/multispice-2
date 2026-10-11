import { expect, test } from "@playwright/test";
import {
  act,
  canvasApp,
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
  const cursor = await canvasApp(page).evaluate((el) => (el as HTMLElement).style.cursor);
  expect(cursor).toContain("url(");
  expectNoErrors(errors);
});

// S4.2: Polyline per Klicks, Doppelklick beendet; Esc verwirft Entwurf.
test("S4.2 Polyline (Klicks + Doppelklick, Esc-Abbruch)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  await clickWorld(page, 400, 300);
  await clickWorld(page, 500, 300);
  await clickWorld(page, 500, 400);
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
  const cursor = () => canvasApp(page).evaluate((el) => (el as HTMLElement).style.cursor);
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

// S4.6: Punkt-Handle draggen bewegt nur diesen Punkt.
test("S4.6 Wire-Punkt draggen (Rest bleibt)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  await clickWorld(page, 400, 300);
  await clickWorld(page, 500, 300);
  const p = await worldToPage(page, 500, 400);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  const before = await msEval<Pt[]>(page, `(s) => s.doc.wires[0].points`);
  const idx = before.findIndex((q) => q.x === 500 && q.y === 300);
  expect(idx).toBeGreaterThanOrEqual(0);
  const h = await worldToPage(page, 500, 300);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  const q = await worldToPage(page, 540, 340);
  await page.mouse.move(q.x, q.y, { steps: 10 });
  await page.mouse.up();
  const after = await msEval<Pt[]>(page, `(s) => s.doc.wires[0].points`);
  expect(after.length).toBe(before.length);
  expect(after[idx]).toEqual({ x: 540, y: 340 });
  for (let i = 0; i < before.length; i++) {
    if (i !== idx) expect(after[i]).toEqual(before[i]);
  }
  expectNoErrors(errors);
});

// S4.8: Auto-Route führt um Hindernis (Bauteil zwischen den Pins).
test("S4.8 Auto-Route (Umweg um Hindernis)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placeResistor(page, 400, 300);
  await placeResistor(page, 600, 300);
  await placeResistor(page, 500, 300);
  await page.keyboard.press("w");
  await clickWorld(page, 430, 300);
  await clickWorld(page, 570, 300);
  const p = await worldToPage(page, 570, 300);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  const pts = await msEval<Pt[]>(page, `(s) => s.doc.wires[0].points`);
  expect(pts.some((q) => q.y !== 300)).toBe(true);
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
  await page.keyboard.press("w");
  await clickWorld(page, 400, 300);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(2);
  const pts2 = await msEval<Pt[]>(page, `(s) => s.doc.wires[1].points`);
  const last = pts2[pts2.length - 1];
  expect(Math.abs(last.x - 463)).toBeLessThan(0.6);
  expect(Math.abs(last.y - 377)).toBeLessThan(0.6);
  expectNoErrors(errors);
});
