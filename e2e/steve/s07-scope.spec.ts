import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  centerViewOn,
  expectNoErrors,
  gotoApp,
  msEval,
  pinWorld,
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
  // Der Assistent zoomt auf den Teiler. Platzieren bei x=560 läge sonst
  // unter der rechten Geräte-Leiste statt auf dem Canvas.
  await centerViewOn(page, 430, 320);
  const id = await placePartUI(page, "oszi", "Oszilloskop (XSC)", 560, 300);
  await page.keyboard.press("Escape");
  const ch1 = await pinWorld(page, id, 0);
  const gnd = await pinWorld(page, id, 4);
  await dragWire(page, 360, 300, ch1.x, ch1.y);
  await dragWire(page, 360, 400, gnd.x, gnd.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(6);
  await expect.poll(() => msEval<string>(page, `(s) => s.netResult.pinNets[${JSON.stringify(id + ":0")}]`)).toBe("OUT");
  await expect.poll(() => msEval<string>(page, `(s) => s.netResult.pinNets[${JSON.stringify(id + ":4")}]`)).toBe("0");
  const p = await worldToPage(page, 560, 300);
  await page.mouse.dblclick(p.x, p.y);
  const dlg = page.getByRole("dialog", { name: /Oszilloskop/ });
  await expect(dlg).toBeVisible();
  return dlg;
}

// Das breite Gerät kann zunächst über den rechten Bildschirmrand ragen.
// Die Titelzeile wie ein Nutzer ziehen, statt Bedienelemente forciert zu klicken.
async function moveScopeIntoView(page: Page, dlg: Locator): Promise<void> {
  const rect = await dlg.boundingBox();
  expect(rect).not.toBeNull();
  if (!rect) throw new Error("Oszilloskopfenster hat keine sichtbare Fläche");
  await page.mouse.move(rect.x + 120, rect.y + 18);
  await page.mouse.down();
  await page.mouse.move(128, rect.y + 18, { steps: 12 });
  await page.mouse.up();
  await expect.poll(async () => (await dlg.boundingBox())?.x ?? Infinity).toBeLessThanOrEqual(10);
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

// S7.9: XY-Modus + FFT (Gerätezustand + Screenshots).
test("S7.9 XY-Modus + FFT", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  const dlg = await openScope(page);
  await moveScopeIntoView(page, dlg);
  await startSimUI(page);
  await dlg.getByRole("button", { name: "Acquire" }).click();
  // Das Menü steht auf dem Geräte-Canvas, nicht im DOM. Softkey 3 schaltet XY;
  // die persistierte Geräteeinstellung bestätigt die tatsächliche Wirkung.
  await dlg.getByTitle("Menütaste 3").click();
  await expect.poll(() => msEval<boolean | null>(page, `(s) => s.instruments.find((i) => i.kind === "scope")?.config.scope?.settings?.acq?.xy ?? null`)).toBe(true);
  await attachShot(page, testInfo, "scope-xy.png");
  await dlg.getByRole("button", { name: "FFT", exact: true }).click();
  await expect.poll(() => msEval<boolean | null>(page, `(s) => s.instruments.find((i) => i.kind === "scope")?.config.scope?.settings?.fft?.on ?? null`)).toBe(true);
  await attachShot(page, testInfo, "scope-fft.png");
  await stopSimUI(page);
  expectNoErrors(errors);
});

// S7.10: Run/Stop (LED grün ↔ rot).
test("S7.10 Run/Stop (LED)", async ({ page }) => {
  const errors = await gotoApp(page);
  const dlg = await openScope(page);
  await moveScopeIntoView(page, dlg);
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
