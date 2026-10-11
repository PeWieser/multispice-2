import { expect, test, type Page } from "@playwright/test";
import {
  clickWorld,
  expectNoErrors,
  gotoApp,
  msEval,
  placePartUI,
  startSimUI,
  stopSimUI,
  worldToPage,
} from "../helpers";
import { wizardDivider } from "../flows";
import { attachShot } from "./helpers";

async function dragWire(page: Page, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  const a = await worldToPage(page, x1, y1);
  const b = await worldToPage(page, x2, y2);
  await page.keyboard.press("w");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

// Teiler + XSC verdrahtet (CH1=OUT, GND), Scope-Fenster offen.
async function openScope(page: Page) {
  await wizardDivider(page);
  await placePartUI(page, "oszi", "Oszilloskop (XSC)", 560, 300);
  await page.keyboard.press("Escape");
  await dragWire(page, 360, 300, 520, 270);
  await dragWire(page, 360, 400, 560, 340);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(6);
  const p = await worldToPage(page, 560, 300);
  await page.mouse.dblclick(p.x, p.y);
  const dlg = page.getByRole("dialog", { name: /Oszilloskop/ });
  await expect(dlg).toBeVisible();
  return dlg;
}

// S7.1: XSC verdrahten + Fenster öffnen (CRT + Trace visuell).
test("S7.1 Oszilloskop öffnen (verdrahtet, Trace)", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  const dlg = await openScope(page);
  await expect(dlg.locator("canvas").first()).toBeVisible();
  await startSimUI(page);
  await page.waitForTimeout(1200);
  await attachShot(page, testInfo, "scope.png");
  await stopSimUI(page);
  expectNoErrors(errors);
});

// S7.8: Cursors einschalten (LED + Linien-Screenshot).
test("S7.8 Cursors (LED + Screenshot)", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  const dlg = await openScope(page);
  await startSimUI(page);
  const btn = dlg.getByRole("button", { name: "Cursors" });
  await btn.click();
  await expect
    .poll(() => btn.evaluate((el) => getComputedStyle(el).backgroundImage))
    .toMatch(/143,\s*208,\s*255/);
  await attachShot(page, testInfo, "scope-cursors.png");
  await stopSimUI(page);
  expectNoErrors(errors);
});

// S7.9: XY-Modus + FFT (Menü-Wert + Screenshots).
test("S7.9 XY-Modus + FFT", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  const dlg = await openScope(page);
  await startSimUI(page);
  await dlg.getByRole("button", { name: "Acquire" }).click();
  await expect(dlg.getByText("Aus (YT)")).toBeVisible();
  await dlg.getByText("XY-Anzeige").click();
  await expect(dlg.getByText("Ein (CH1/CH2)")).toBeVisible();
  await attachShot(page, testInfo, "scope-xy.png");
  await dlg.getByRole("button", { name: "FFT" }).click();
  await page.waitForTimeout(600);
  await attachShot(page, testInfo, "scope-fft.png");
  await stopSimUI(page);
  expectNoErrors(errors);
});

// S7.10: Run/Stop (LED grün ↔ rot).
test("S7.10 Run/Stop (LED)", async ({ page }) => {
  const errors = await gotoApp(page);
  const dlg = await openScope(page);
  await startSimUI(page);
  const btn = dlg.getByRole("button", { name: "Run/Stop" });
  await expect.poll(() => btn.evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/93,\s*255,\s*90/);
  await btn.click();
  await expect
    .poll(() => btn.evaluate((el) => getComputedStyle(el).backgroundImage))
    .toMatch(/255,\s*74,\s*58/);
  await btn.click();
  await expect.poll(() => btn.evaluate((el) => getComputedStyle(el).backgroundImage)).toMatch(/93,\s*255,\s*90/);
  await stopSimUI(page);
  expectNoErrors(errors);
});
