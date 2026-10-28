import { expect, test } from "@playwright/test";
import {
  act,
  clickWorld,
  closeInlineEditor,
  expectNoErrors,
  gotoApp,
  menuClick,
  msEval,
  openLibrary,
  placePartUI,
  worldToPage,
} from "../helpers";

// S3.2: Platzieren aus Library, Esc bricht ab (nichts platziert).
test("S3.2 Platzieren aus Library + Esc bricht ab", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await openLibrary(page);
  await page.locator("#lib-search").fill("mosfet");
  await page.getByText("N-Kanal MOSFET (allg.)", { exact: true }).first().click();
  await page.keyboard.press("Enter");
  await expect.poll(() => msEval<string | null>(page, `(s) => s.placingPartId`)).not.toBe(null);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(0);
  await page.keyboard.press("Escape");
  await expect.poll(() => msEval<string | null>(page, `(s) => s.placingPartId`)).toBe(null);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(0);
  expectNoErrors(errors);
});

// S3.3: Single-Shot ohne Shift, Shift hält den Platziermodus.
test("S3.3 Mehrfach platzieren (Shift hält Modus)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  const strip = page.getByRole("button", { name: "Widerstand", exact: true });
  await strip.click();
  await clickWorld(page, 400, 300);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(1);
  await closeInlineEditor(page);
  await expect.poll(() => msEval<string | null>(page, `(s) => s.placingPartId`)).toBe(null);
  await strip.click();
  await page.keyboard.down("Shift");
  await clickWorld(page, 500, 300);
  await closeInlineEditor(page);
  await clickWorld(page, 600, 300);
  await closeInlineEditor(page);
  await page.keyboard.up("Shift");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(3);
  await expect.poll(() => msEval<string | null>(page, `(s) => s.placingPartId`)).not.toBe(null);
  // S5.3-Esc-Kette: 1× Auswahl weg (Modus bleibt), 2× Modus weg.
  await page.keyboard.press("Escape");
  await expect.poll(() => msEval<string[]>(page, `(s) => s.selection`)).toEqual([]);
  expect(await msEval<string | null>(page, `(s) => s.placingPartId`)).not.toBe(null);
  await page.keyboard.press("Escape");
  await expect.poll(() => msEval<string | null>(page, `(s) => s.placingPartId`)).toBe(null);
  expectNoErrors(errors);
});

// S3.4: 4× Drehen = 360°.
test("S3.4 Drehen 4× = 360°", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  const id = await placePartUI(page, "mosfet", "N-Kanal MOSFET (allg.)", 400, 300);
  await page.keyboard.press("Escape");
  await clickWorld(page, 400, 300);
  await expect.poll(() => msEval<string[]>(page, `(s) => s.selection`)).toEqual([id]);
  for (let i = 0; i < 4; i++) await page.keyboard.press("r");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances[0].rot ?? 0`)).toBe(0);
  expectNoErrors(errors);
});

// S3.5: Spiegeln toggelt (M).
test("S3.5 Spiegeln (M)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  const id = await placePartUI(page, "mosfet", "N-Kanal MOSFET (allg.)", 400, 300);
  await page.keyboard.press("Escape");
  await clickWorld(page, 400, 300);
  await expect.poll(() => msEval<string[]>(page, `(s) => s.selection`)).toEqual([id]);
  await page.keyboard.press("m");
  await expect.poll(() => msEval<boolean>(page, `(s) => s.doc.instances[0].mirror ?? false`)).toBe(true);
  await page.keyboard.press("m");
  await expect.poll(() => msEval<boolean>(page, `(s) => s.doc.instances[0].mirror ?? false`)).toBe(false);
  expectNoErrors(errors);
});

// S3.6: Verschieben per Drag, Snap rundet auf 10.
test("S3.6 Verschieben mit Snap", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placePartUI(page, "mosfet", "N-Kanal MOSFET (allg.)", 400, 300);
  await page.keyboard.press("Escape");
  const p = await worldToPage(page, 400, 300);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  const q = await worldToPage(page, 463, 377);
  await page.mouse.move(q.x, q.y, { steps: 12 });
  await page.mouse.up();
  const pos = await msEval<{ x: number; y: number }>(page, `(s) => ({ x: s.doc.instances[0].x, y: s.doc.instances[0].y })`);
  expect(pos).toEqual({ x: 460, y: 380 });
  expectNoErrors(errors);
});

// S3.7: Bezeichner via Inspector (Feld hat zugänglichen Namen).
test("S3.7 Bezeichner via Inspector", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await closeInlineEditor(page);
  const id = await msEval<string>(page, `(s) => s.doc.instances[0].id`);
  await clickWorld(page, 400, 300);
  await expect.poll(() => msEval<string[]>(page, `(s) => s.selection`)).toEqual([id]);
  await menuClick(page, "Ansicht", "Inspector");
  const label = page.getByRole("textbox", { name: "Bezeichner" });
  await expect(label).toBeVisible();
  await label.fill("R99");
  await expect.poll(() => msEval<string>(page, `(s) => s.doc.instances[0].label`)).toBe("R99");
  expectNoErrors(errors);
});

// S3.8: Wert per Doppelklick, Einheiten-Parser (10k → 10000).
test("S3.8 Wert per Doppelklick (10k → 10000)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await closeInlineEditor(page);
  const p = await worldToPage(page, 400, 330);
  await page.mouse.dblclick(p.x, p.y);
  const input = page.locator("div.z-floating input");
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill("10k");
  await input.press("Enter");
  await expect.poll(() => msEval<unknown>(page, `(s) => s.doc.instances[0].params.r`)).toBe(10000);
  expectNoErrors(errors);
});

// S3.11: Kopieren/Einfügen legt versetztes Duplikat an.
test("S3.11 Kopieren/Einfügen (versetzt)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placePartUI(page, "mosfet", "N-Kanal MOSFET (allg.)", 400, 300);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("ControlOrMeta+c");
  await page.keyboard.press("ControlOrMeta+v");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(2);
  const pts = await msEval<Array<{ x: number; y: number }>>(page, `(s) => s.doc.instances.map((i) => ({ x: i.x, y: i.y }))`);
  expect(pts[0]).not.toEqual(pts[1]);
  expectNoErrors(errors);
});

// S3.13: Alles auswählen erfasst alle Bauteile.
test("S3.13 Alles auswählen", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  const id1 = await placePartUI(page, "mosfet", "N-Kanal MOSFET (allg.)", 400, 300);
  const id2 = await placePartUI(page, "mosfet", "N-Kanal MOSFET (allg.)", 520, 300);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+a");
  await expect.poll(() => msEval<string[]>(page, `(s) => s.selection`)).toEqual(expect.arrayContaining([id1, id2]));
  expectNoErrors(errors);
});

// S3.14: Gruppe bewegt sich gemeinsam (gleiches Delta).
test("S3.14 Gruppe gemeinsam verschieben", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placePartUI(page, "mosfet", "N-Kanal MOSFET (allg.)", 400, 300);
  await placePartUI(page, "mosfet", "N-Kanal MOSFET (allg.)", 520, 300);
  await page.keyboard.press("Escape");
  await page.keyboard.press("ControlOrMeta+a");
  const before = await msEval<Array<{ x: number; y: number }>>(page, `(s) => s.doc.instances.map((i) => ({ x: i.x, y: i.y }))`);
  const p = await worldToPage(page, 400, 300);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  const q = await worldToPage(page, 460, 360);
  await page.mouse.move(q.x, q.y, { steps: 12 });
  await page.mouse.up();
  const after = await msEval<Array<{ x: number; y: number }>>(page, `(s) => s.doc.instances.map((i) => ({ x: i.x, y: i.y }))`);
  const dx0 = after[0].x - before[0].x;
  const dx1 = after[1].x - before[1].x;
  const dy0 = after[0].y - before[0].y;
  const dy1 = after[1].y - before[1].y;
  expect(dx0).toBe(dx1);
  expect(dy0).toBe(dy1);
  expect(dx0).toBe(60);
  expect(dy0).toBe(60);
  expectNoErrors(errors);
});

// S3.20: Entwurfs-Tabs über dem Canvas — Neu per Button/Shortcut, Wechsel per Klick.
test("S3.20 Entwurfs-Tabs: Neu + Wechseln", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  const tabs = page.getByRole("tablist", { name: "Entwürfe" });
  await expect.poll(() => tabs.getByRole("tab").count()).toBe(1);
  // Entwurf nicht-leer machen (leere Entwürfe werden nur umbenannt, nicht neu angelegt).
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await closeInlineEditor(page);
  const firstId = await msEval<string>(page, `(s) => s.doc.id`);
  await page.getByRole("button", { name: "Neuer Entwurf" }).click();
  await expect.poll(() => tabs.getByRole("tab").count()).toBe(2);
  const secondId = await msEval<string>(page, `(s) => s.doc.id`);
  expect(secondId).not.toBe(firstId);
  // Zurück zum ersten Entwurf: Inhalt ist erhalten.
  await tabs.getByRole("tab").first().click();
  await expect.poll(() => msEval<string>(page, `(s) => s.doc.id`)).toBe(firstId);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(1);
  // Shortcut Strg+Alt+N legt aus nicht-leerem Entwurf einen dritten an.
  await tabs.getByRole("tab").nth(1).click();
  await expect.poll(() => msEval<string>(page, `(s) => s.doc.id`)).toBe(secondId);
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 500, 300);
  await closeInlineEditor(page);
  await page.keyboard.press("Control+Alt+n");
  await expect.poll(() => tabs.getByRole("tab").count()).toBe(3);
  expectNoErrors(errors);
});

// S3.21: Doppelklick auf Reiter benennt den Entwurf um (Tab + Dokumentname).
test("S3.21 Entwurf umbenennen (Doppelklick)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  const tabs = page.getByRole("tablist", { name: "Entwürfe" });
  const tab = tabs.getByRole("tab").first();
  await tab.dblclick();
  await page.getByLabel("Entwurf umbenennen").fill("Stromversorgung");
  await page.keyboard.press("Enter");
  await expect.poll(() => msEval<string>(page, `(s) => s.doc.name`)).toBe("Stromversorgung");
  await expect(tabs.getByRole("tab", { name: "Stromversorgung (aktiv)" })).toBeVisible();
  expectNoErrors(errors);
});

// S3.22: Kontextmenü am Reiter — Duplizieren kopiert tief, Schließen entfernt.
test("S3.22 Entwurf duplizieren + schließen (Kontextmenü)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await closeInlineEditor(page);
  const tabs = page.getByRole("tablist", { name: "Entwürfe" });
  await tabs.getByRole("tab").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Duplizieren" }).click();
  await expect.poll(() => tabs.getByRole("tab").count()).toBe(2);
  // Tiefe Kopie: Duplikat enthält den Widerstand unter neuer Entwurfs-ID.
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(1);
  await expect.poll(() => msEval<string>(page, `(s) => s.doc.name`)).toMatch(/Kopie/);
  await tabs.getByRole("tab").nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Schließen" }).click();
  await expect.poll(() => tabs.getByRole("tab").count()).toBe(1);
  expectNoErrors(errors);
});

// S3.23: Seiten-Navigator — anlegen, wechseln, umbenennen, löschen.
test("S3.23 Seiten anlegen + wechseln + löschen", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  // Eine Seite: nur "+ Seite"-Knopf in der Tab-Leiste.
  await page.getByRole("button", { name: "Neue Seite" }).click();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.pages?.length ?? 0`)).toBe(2);
  // Inhalt auf Seite 2 legen.
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await closeInlineEditor(page);
  // Wechsel per Dropdown auf Seite 1 (leer), zurück auf Seite 2 (Inhalt da).
  await page.getByRole("button", { name: "Seite wechseln" }).click();
  await page.getByRole("menuitemradio", { name: /Seite 1 öffnen/ }).click();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(0);
  await page.getByRole("button", { name: "Seite wechseln" }).click();
  await page.getByRole("menuitemradio", { name: /Seite 2 öffnen/ }).click();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(1);
  // Umbenennen, dann löschen (Menü bleibt offen).
  await page.getByRole("button", { name: "Seite wechseln" }).click();
  await page.getByRole("button", { name: "Seite Seite 2 umbenennen" }).click();
  await page.getByLabel("Seite umbenennen").fill("Endstufe");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Seite Endstufe löschen" }).click();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.pages?.length ?? 0`)).toBe(1);
  expectNoErrors(errors);
});
