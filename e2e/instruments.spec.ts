import { test, expect } from "@playwright/test";
import { gotoApp, expectNoErrors, msEval, menuClick, startSimUI, stopSimUI, parseDe, expectNear } from "./helpers";
import { wizardDivider } from "./flows";

// H01: Alle 13 Instrumente öffnen (Dialog oder Platziermodus) + schließen.
test("H01 alle Instrumente öffnen", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  const dialogs: Array<[string, string]> = [
    ["Digitalmultimeter", "Digitalmultimeter"],
    ["Frequenzzähler", "Frequenzzähler"],
    ["Bode-Plotter", "Bode-Plotter"],
    ["Logikanalysator", "Logikanalysator"],
    ["Logic Converter", "Logic Converter"],
    ["Wattmeter", "Wattmeter"],
    ["IV-Analyzer", "IV-Analyzer"],
    ["Spektrumanalysator", "Spektrumanalysator"],
    ["Mustergenerator", "Mustergenerator"],
    ["Distortion Analyzer", "Distortion Analyzer"],
    ["Network Analyzer", "Network Analyzer"],
  ];
  for (const [item, title] of dialogs) {
    await menuClick(page, "Geräte", item);
    const dlg = page.getByRole("dialog", { name: title });
    await expect(dlg).toBeVisible();
    await dlg.getByRole("button", { name: "Schließen", exact: true }).click();
    await expect(dlg).toBeHidden();
  }
  // Oszi + FuncGen starten stattdessen den Platziermodus.
  for (const [item, partId] of [["Oszilloskop", "oscilloscope"], ["Funktionsgenerator", "funcgen"]]) {
    await menuClick(page, "Geräte", item);
    await expect.poll(() => msEval<string | null>(page, `(s) => s.placingPartId`)).toBe(partId);
    await page.keyboard.press("Escape");
    await expect.poll(() => msEval<string | null>(page, `(s) => s.placingPartId`)).toBe(null);
  }
  expectNoErrors(errors);
});

// H02: DMM misst OUT = 2,5 V.
test("H02 DMM misst Teiler-OUT", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  await menuClick(page, "Geräte", "Digitalmultimeter");
  const dlg = page.getByRole("dialog", { name: "Digitalmultimeter" });
  await expect(dlg).toBeVisible();
  await dlg.getByLabel("Messpunkt +").selectOption("OUT");
  await startSimUI(page);
  const display = dlg.locator("div.text-\\[34px\\]");
  await expect.poll(async () => parseDe((await display.textContent()) ?? ""), { timeout: 20_000 }).toBeGreaterThan(2.4);
  const v = parseDe((await display.textContent()) ?? "");
  expectNear(v, 2.5, 0.05);
  await stopSimUI(page);
  expectNoErrors(errors);
});
