import { test, expect } from "@playwright/test";
import {
  gotoApp, expectNoErrors, expectSummary, msEval, act, menuClick,
  clickWorld, centerViewOn, pinWorld, startSimUI, stopSimUI, expectLog,
} from "./helpers";
import { wizardDivider, dragWire, buildResistorMacro } from "./flows";

// M01: Öffnen, dirty-Rückfrage, Verwerfen.
test("M01 Editor öffnen + Verwerfen", async ({ page }) => {
  const errors = await gotoApp(page);
  const mainCount = await msEval<number>(page, `(s) => s.doc.instances.length`);
  await menuClick(page, "Datei", "Bauteile-Editor …");
  await expect(page.getByRole("button", { name: "Schaltung", exact: true })).toBeVisible();
  await centerViewOn(page, 400, 300);
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(1);
  await page.getByRole("button", { name: "Editor schließen", exact: true }).click();
  await page.getByRole("button", { name: "Verwerfen", exact: true }).click();
  await expect(page.getByRole("button", { name: "Schaltung", exact: true })).toBeHidden();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(mainCount);
  expectNoErrors(errors);
});

// M02+M03: Schaltung bauen + Testlauf starten/stoppen.
test("M03 Testlauf im Editor", async ({ page }) => {
  const errors = await gotoApp(page);
  await menuClick(page, "Datei", "Bauteile-Editor …");
  await centerViewOn(page, 400, 300);
  await page.getByRole("button", { name: "Port: Eingang", exact: true }).click();
  await clickWorld(page, 250, 300);
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await page.getByRole("button", { name: "Port: Ausgang", exact: true }).click();
  await clickWorld(page, 550, 300);
  const ids = await msEval<Record<string, string>>(page, `(s) => Object.fromEntries(s.doc.instances.map((i) => [i.partId, i.id]))`);
  const pIn = await pinWorld(page, ids["port_in"], 0);
  const rL = await pinWorld(page, ids["resistor"], 0);
  const rR = await pinWorld(page, ids["resistor"], 1);
  const pOut = await pinWorld(page, ids["port_out"], 0);
  await dragWire(page, pIn.x, pIn.y, rL.x, rL.y);
  await dragWire(page, rR.x, rR.y, pOut.x, pOut.y);
  await page.getByRole("button", { name: "Testlauf", exact: true }).click();
  await expect.poll(() => msEval<boolean>(page, `(s) => s.partEditor.testRunning`)).toBe(true);
  await expect(page.getByText(/Teile · .* Knoten/).first()).toBeVisible();
  await page.getByRole("button", { name: "Stopp", exact: true }).click();
  await expect.poll(() => msEval<boolean>(page, `(s) => s.partEditor.testRunning`)).toBe(false);
  await page.getByRole("button", { name: "Editor schließen", exact: true }).click();
  await page.getByRole("button", { name: "Verwerfen", exact: true }).click();
  expectNoErrors(errors);
});

// M04+M05: Speichern, aus Bibliothek platzieren, simulieren.
test("M05 Custom-Teil speichern + simulieren", async ({ page }) => {
  const errors = await gotoApp(page);
  const specId = await buildResistorMacro(page, "E2E-Nutz-R");
  await act(page, "newDocument");
  // VDC + Custom + GND aufbauen.
  await page.getByRole("button", { name: "DC-Spannungsquelle", exact: true }).click();
  await clickWorld(page, 250, 300);
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator("#lib-search").fill("E2E-Nutz-R");
  await page.getByText("E2E-Nutz-R", { exact: true }).first().click();
  await page.keyboard.press("Enter");
  await clickWorld(page, 450, 300);
  await page.getByRole("button", { name: "Masse (GND)", exact: true }).click();
  await clickWorld(page, 450, 420);
  const ids = await msEval<Record<string, string>>(page, `(s) => Object.fromEntries(s.doc.instances.map((i) => [i.partId, i.id]))`);
  expect(ids[specId]).toBeTruthy();
  const vTop = await pinWorld(page, ids["vdc"], 0);
  const m0 = await pinWorld(page, ids[specId], 0);
  const m1 = await pinWorld(page, ids[specId], 1);
  const gnd = await pinWorld(page, ids["gnd"], 0);
  const vBot = await pinWorld(page, ids["vdc"], 1);
  await dragWire(page, vTop.x, vTop.y, m0.x, m0.y);
  await dragWire(page, m1.x, m1.y, gnd.x, gnd.y);
  await dragWire(page, vBot.x, vBot.y, gnd.x, gnd.y);
  await startSimUI(page);
  await expectLog(page, /Simulation gestartet/);
  await stopSimUI(page);
  expectNoErrors(errors);
});

// N01–N04: Extrakt-Flow bis Ersetzen + Undo.
test("N Extrahieren → Ersetzen → Undo", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  const [r1, r2] = await msEval<string[]>(page, `(s) => ["R1", "R2"].map((l) => s.doc.instances.find((i) => i.label === l)?.id ?? "")`);
  await act(page, "setSelection", [r1, r2]);
  // Rechtsklick auf R1 (Welt 360, 240).
  const box = await page.locator('canvas[aria-label^="Schaltplan:"]').boundingBox();
  if (!box) throw new Error("Canvas nicht vermessen");
  const view = await msEval<{ x: number; y: number; zoom: number }>(page, `(s) => s.view`);
  await page.mouse.click(box.x + (360 - view.x) * view.zoom, box.y + (240 - view.y) * view.zoom, { button: "right" });
  await page.getByRole("button", { name: /Auswahl als Bauteil/ }).click();
  const dlg = page.getByRole("dialog", { name: /Auswahl als Bauteil übernehmen \(2 Elemente\)/ });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Im Editor öffnen" }).click();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(4);
  await page.getByLabel("Name", { exact: true }).first().fill("E2E-Teiler");
  await page.getByRole("button", { name: "Speichern & Ersetzen", exact: true }).click();
  // Ersetzt: 1 Custom statt R1/R2.
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(4);
  const parts = await msEval<string[]>(page, `(s) => s.doc.instances.map((i) => i.partId)`);
  expect(parts.filter((p) => p.startsWith("custom_")).length).toBe(1);
  expect(parts).not.toContain("resistor");
  await startSimUI(page);
  await expectLog(page, /Simulation gestartet/);
  await stopSimUI(page);
  // Ein Undo stellt alles her.
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(5);
  expectNoErrors(errors);
});
