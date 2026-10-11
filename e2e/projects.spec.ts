import { test, expect } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  gotoApp, expectNoErrors, expectSummary, msEval, act, menuClick,
  clickWorld, expectLog, forceDownloadFallback,
} from "./helpers";
import { wizardDivider, buildResistorMacro } from "./flows";

// L01: Auto-Save → Reload stellt her.
test("L01 Reload stellt Arbeitskopie her", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(1);
  await page.waitForTimeout(2500); // Auto-Save-Debounce 1,5 s + Puffer
  await page.reload();
  await expect(page.getByRole("application", { name: /Schaltplan Canvas/ })).toBeVisible();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(1);
  await expectSummary(page, /1× Widerstand/);
  expectNoErrors(errors);
});

// L05+L06: Export JSON → Import stellt her.
test("L05 Export/Import JSON Roundtrip", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  await forceDownloadFallback(page);
  const dl = page.waitForEvent("download");
  await menuClick(page, "Datei", "Export JSON");
  const download = await dl;
  const file = await download.path();
  if (!file) throw new Error("kein Download-Pfad");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { doc: { instances: unknown[] } };
  expect(raw.doc.instances.length).toBe(5);
  // Neues Blatt + Re-Import.
  await act(page, "newDocument");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(0);
  const chooser = page.waitForEvent("filechooser");
  await menuClick(page, "Datei", "Öffnen / Importieren …");
  await (await chooser).setFiles(file);
  // Diagnose-fähig: Instanzen + Log-Tail (Received landet in CI-Annotations).
  await expect.poll(async () => {
    const n = await msEval<number>(page, `(s) => s.doc.instances.length`);
    const tail = await msEval<string>(page, `(s) => s.logs.slice(-2).map((l) => l.level + ":" + l.message).join(" // ")`);
    return `instances=${n} logs=[${tail}]`;
  }).toContain("instances=5");
  expectNoErrors(errors);
});

// L08: Kaputter Import scheitert ehrlich.
test("L08 ungültiger Import", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  const bad = path.join(__dirname, "fixtures", "bad.json");
  const chooser = page.waitForEvent("filechooser");
  await menuClick(page, "Datei", "Öffnen / Importieren …");
  await (await chooser).setFiles(bad);
  await expectLog(page, /Import fehlgeschlagen/i);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(0);
  expectNoErrors(errors);
});

// L03+L04: Projekt-Slots speichern/laden/löschen.
test("L03 Projekt-Slots", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  await menuClick(page, "Datei", "Projekte …");
  const dlg = page.getByRole("dialog", { name: "Projekte" });
  await dlg.getByPlaceholder(/Name für aktuellen Stand/).fill("E2E-Slot");
  await dlg.getByRole("button", { name: /Aktuellen Stand speichern/ }).click();
  await expect(dlg.getByText("E2E-Slot")).toBeVisible();
  await act(page, "newDocument");
  await dlg.getByRole("button", { name: /Projekt öffnen/ }).click();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(5);
  // Öffnen schließt den Dialog → erneut öffnen, dann löschen.
  await menuClick(page, "Datei", "Projekte …");
  await expect(dlg.getByText("E2E-Slot")).toBeVisible();
  await dlg.getByRole("button", { name: "Löschen", exact: true }).click();
  await dlg.getByRole("button", { name: "Wirklich?", exact: true }).click();
  await expect(dlg.getByText("E2E-Slot")).toBeHidden();
  expectNoErrors(errors);
});

// L14: Eigenes Teil reist im Projekt mit (Export enthält Spec, Reload löst auf).
test("L14 Custom-Teil im Projekt", async ({ page }) => {
  const errors = await gotoApp(page);
  const specId = await buildResistorMacro(page, "E2E-Reise-R");
  await act(page, "newDocument");
  // Teil aus Bibliothek platzieren.
  await page.keyboard.press("ControlOrMeta+k");
  await page.locator("#lib-search").fill("E2E-Reise-R");
  await page.getByText("E2E-Reise-R", { exact: true }).first().click();
  await page.keyboard.press("Enter");
  await clickWorld(page, 400, 300);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(1);
  // Export enthält die Spec.
  await forceDownloadFallback(page);
  const dl = page.waitForEvent("download");
  await menuClick(page, "Datei", "Export JSON");
  const file = await (await dl).path();
  if (!file) throw new Error("kein Download-Pfad");
  const raw = JSON.parse(fs.readFileSync(file, "utf8")) as { customParts?: Array<{ id: string }> };
  expect((raw.customParts ?? []).map((c) => c.id)).toContain(specId);
  // Reload OHNE Bibliothek: nur die eingebettete Spec stellt das Teil wieder her.
  await page.waitForTimeout(2500);
  await page.evaluate(() => localStorage.removeItem("multispice.customParts.v1"));
  await page.reload();
  await expect(page.getByRole("application", { name: /Schaltplan Canvas/ })).toBeVisible();
  await expectSummary(page, /1× E2E-Reise-R/);
  expectNoErrors(errors);
});
