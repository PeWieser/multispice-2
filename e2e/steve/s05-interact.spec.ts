import { expect, test, type Page } from "@playwright/test";
import {
  act,
  clickWorld,
  closeInlineEditor,
  expectLog,
  expectNoErrors,
  gotoApp,
  msEval,
  placePartUI,
  startSimUI,
  stopSimUI,
  worldToPage,
} from "../helpers";
import { expectProbeVdc, placeVoltageProbe, wizardDivider } from "../flows";
import { attachShot } from "./helpers";

function controlsOf(page: Page, id: string): Promise<number> {
  return msEval<number>(page, `(s, ms) => ms.engine.controls[${JSON.stringify(id)}] ?? -1`);
}

async function dragWire(page: Page, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  const a = await worldToPage(page, x1, y1);
  const b = await worldToPage(page, x2, y2);
  await page.keyboard.press("w");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
}

// S5.1: Schalter platzieren.
test("S5.1 Schalter platzieren", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  const id = await placePartUI(page, "switch", "Schalter (SPST)", 400, 300);
  await page.keyboard.press("Escape");
  const partId = await msEval<string>(
    page,
    `(s) => s.doc.instances.find((i) => i.id === ${JSON.stringify(id)})?.partId ?? ""`,
  );
  expect(partId).toBe("switch_spst");
  expectNoErrors(errors);
});

// S5.2: Schalter toggelt im Run (Steuerung 1/0 + Log).
test("S5.2 Schalter toggelt im Run", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  const id = await placePartUI(page, "switch", "Schalter (SPST)", 500, 400);
  await page.keyboard.press("Escape");
  await startSimUI(page);
  await clickWorld(page, 500, 400);
  await expect.poll(() => controlsOf(page, id)).toBe(1);
  // Doppelklick-Fenster abwarten (e.detail>=2 wird nicht getoggelt).
  // Log-Asserts erst nach beiden Klicks: expectLog öffnet das Panel und
  // würde das Canvas-Koordinatenmapping dazwischen verschieben.
  await page.waitForTimeout(600);
  await clickWorld(page, 500, 400);
  await expect.poll(() => controlsOf(page, id)).toBe(0);
  await expectLog(page, /geschlossen/);
  await expectLog(page, /geöffnet/);
  await stopSimUI(page);
  expectNoErrors(errors);
});

// S5.3: Poti-Schieber draggen (params.pos folgt).
test("S5.3 Poti-Schieber draggen", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  const id = await placePartUI(page, "poti", "Potentiometer", 400, 300);
  await page.keyboard.press("Escape");
  const posOf = () =>
    msEval<number>(page, `(s) => s.doc.instances.find((i) => i.id === ${JSON.stringify(id)})?.params.pos ?? 0.5`);
  const pos0 = await posOf();
  const a = await worldToPage(page, 443, 300);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const b = await worldToPage(page, 443, 280);
  await page.mouse.move(b.x, b.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(posOf).not.toBe(pos0);
  const pos1 = await posOf();
  expect(pos1).toBeGreaterThanOrEqual(0);
  expect(pos1).toBeLessThanOrEqual(1);
  expectNoErrors(errors);
});

// S5.4: Taster momentan (1 solange gedrückt, 0 nach Loslassen).
test("S5.4 Taster momentan", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  const id = await placePartUI(page, "taster", "Taster (Schließer)", 500, 400);
  await page.keyboard.press("Escape");
  await startSimUI(page);
  const p = await worldToPage(page, 500, 400);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await expect.poll(() => controlsOf(page, id)).toBe(1);
  await page.mouse.up();
  await expect.poll(() => controlsOf(page, id)).toBe(0);
  await expectLog(page, /gedrückt/);
  await stopSimUI(page);
  expectNoErrors(errors);
});

// S5.5: Relais zieht an (Spule an 12 V, NO schließt → Sonde 0 V).
test("S5.5 Relais zieht an", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placePartUI(page, "dc", "DC-Spannungsquelle", 400, 300);
  await closeInlineEditor(page);
  await placePartUI(page, "relais", "Relais (SPDT)", 560, 300);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 480, 230);
  await closeInlineEditor(page);
  await dragWire(page, 400, 270, 450, 230);
  await dragWire(page, 510, 230, 600, 280);
  await dragWire(page, 600, 320, 400, 330);
  await dragWire(page, 400, 270, 520, 280);
  await dragWire(page, 400, 330, 520, 320);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(5);
  await placeVoltageProbe(page, 555, 255);
  await startSimUI(page);
  await expectProbeVdc(page, 0, 0.5);
  await attachShot(page, testInfo, "relay.png");
  await stopSimUI(page);
  expectNoErrors(errors);
});
