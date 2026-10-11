import { test, expect } from "@playwright/test";
import {
  gotoApp, expectNoErrors, expectSummary, msEval, act, openLibrary,
  placePartUI, clickWorld, centerViewOn, menuClick, worldToPage,
} from "./helpers";

// C01+C02: Bibliothek suchen + NMOS platzieren.
test("C02 Bibliothek: suchen + platzieren", async ({ page }) => {
  const errors = await gotoApp(page);
  await openLibrary(page);
  const search = page.locator("#lib-search");
  await search.fill("nmos");
  await expect(page.getByText("NMOS-Transistor", { exact: true }).first()).toBeVisible();
  const id = await placePartUI(page, "nmos", /NMOS-Transistor/, 400, 300);
  const part = await msEval<string>(page, `(s) => s.doc.instances.find((i) => i.id === ${JSON.stringify(id)})?.partId ?? ""`);
  expect(part).toMatch(/nmos/i);
  await expectSummary(page, /1× /);
  expectNoErrors(errors);
});

// C04+D01+D03+D05+D06+D07: Schnellplatzierung, Auswahl, Drehen, Löschen, Undo/Redo, Clipboard.
test("D Editieren: platzieren, drehen, löschen, undo/redo", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  // R per Schnellleiste.
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(1);
  const id = await msEval<string>(page, `(s) => s.doc.instances[0].id`);
  // Auswahl per Klick.
  await clickWorld(page, 400, 300);
  await expect.poll(() => msEval<string[]>(page, `(s) => s.selection`)).toEqual([id]);
  // Drehen.
  await page.keyboard.press("r");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances[0].rot ?? 0`)).toBe(90);
  // Duplizieren + Löschen + Undo/Redo.
  await page.keyboard.press("ControlOrMeta+d");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(2);
  await act(page, "selectAll");
  await page.keyboard.press("Delete");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(0);
  await page.getByRole("button", { name: "Rückgängig", exact: true }).click();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(2);
  await page.getByRole("button", { name: "Wiederholen", exact: true }).click();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(2);
  expectNoErrors(errors);
});

// E01+E06: Leitung Pin-zu-Pin ziehen + löschen.
test("E01 Leitung Pin-zu-Pin ziehen", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await centerViewOn(page, 500, 300);
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await clickWorld(page, 600, 300);
  await page.keyboard.press("Escape");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(2);
  // R1 Pin 2 (430,300) → R2 Pin 1 (570,300): Loslassen auf Pin schließt an.
  const a = await worldToPage(page, 430, 300);
  const b = await worldToPage(page, 570, 300);
  await page.keyboard.press("w");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 15 });
  await page.mouse.up();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  // Leitung per Klick auf Mitte wählen + löschen.
  const mid = await worldToPage(page, 500, 300);
  await page.mouse.click(mid.x, mid.y);
  await page.keyboard.press("Delete");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(0);
  expectNoErrors(errors);
});

// K01: Inspector-Param ändern.
test("K01 Widerstandswert im Inspector ändern", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "loadPreset", "rc-lowpass");
  await menuClick(page, "Ansicht", "Inspector");
  const r1 = await msEval<string>(page, `(s) => s.doc.instances.find((i) => i.label === "R1")?.id ?? ""`);
  expect(r1).not.toBe("");
  await act(page, "setSelection", [r1]);
  const field = page.getByLabel(/Widerstand/);
  await expect(field.first()).toBeVisible();
  await field.first().fill("2000");
  await field.first().press("Enter");
  await expect.poll(() => msEval<unknown>(page, `(s) => s.doc.instances.find((i) => i.label === "R1")?.params.r`)).toBe(2000);
  expectNoErrors(errors);
});
