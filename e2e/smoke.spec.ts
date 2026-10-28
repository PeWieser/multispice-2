import { test, expect } from "@playwright/test";
import { gotoApp, expectNoErrors, expectSummary, menuOpen, loadPresetUI, msEval } from "./helpers";

// A01: App lädt sauber (Erststart = 555-Blinker-Beispiel).
test("A01 boot ohne Fehler, Beispielschaltung", async ({ page }) => {
  const errors = await gotoApp(page);
  const n = await msEval<number>(page, `(s) => s.doc.instances.length`);
  expect(n).toBeGreaterThan(0);
  await expectSummary(page, /Widerstand/);
  await expectSummary(page, /Netze/);
  await expect(page.getByRole("button", { name: "Datei", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeVisible();
  expectNoErrors(errors);
});

// A02: Alle Top-Menüs listen Einträge.
test("A02 alle Menüs öffnen", async ({ page }) => {
  const errors = await gotoApp(page);
  for (const m of ["Datei", "Bearbeiten", "Ansicht", "Vorlagen", "Analysen", "Geräte", "Hilfe"]) {
    await menuOpen(page, m);
    await expect(page.getByRole("menu", { name: m }).getByRole("menuitem").first()).toBeVisible();
    await page.keyboard.press("Escape");
  }
  expectNoErrors(errors);
});

// B01–B08: Alle Presets laden, ERC still.
test("B01-B08 presets laden", async ({ page }) => {
  const errors = await gotoApp(page);
  const presets = [
    "RC-Tiefpass",
    "Einweg-Gleichrichter",
    "555 Astabiler Multivibrator",
    "Emitterschaltung (NPN)",
    "Nichtinvertierender OPV",
    "Arduino Blink (Co-Simulation)",
    "Digitaler 4-Bit-Zähler",
    "Schaltregler (Buck)",
  ];
  for (const p of presets) {
    await loadPresetUI(page, p);
    const n = await msEval<number>(page, `(s) => s.doc.instances.length`);
    expect(n, `${p}: Bauteile`).toBeGreaterThan(0);
  }
  // Letztes Preset steht, ERC ruhig (außer Co-Sim-Sonderfällen).
  await expectSummary(page, /ERC still/);
  expectNoErrors(errors);
});
