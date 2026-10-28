import { expect, test, type Page } from "@playwright/test";
import * as fs from "node:fs";
import {
  act,
  clickWorld,
  closeInlineEditor,
  expectNoErrors,
  gotoApp,
  menuClick,
  openBottomTab,
} from "../helpers";

async function downloadText(page: Page, trigger: () => Promise<void>): Promise<{ name: string; text: string }> {
  const [dl] = await Promise.all([page.waitForEvent("download"), trigger()]);
  const path = await dl.path();
  if (!path) throw new Error("kein Download-Pfad");
  return { name: dl.suggestedFilename(), text: fs.readFileSync(path, "utf8") };
}

async function placeResistor(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await closeInlineEditor(page);
}

// S13.1: SPICE-Netzliste (.cir mit .tran-Karte).
test("S13.1 SPICE-Export (.cir)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placeResistor(page);
  const { name, text } = await downloadText(page, () => menuClick(page, "Datei", "Export SPICE (.cir)"));
  expect(name).toMatch(/\.cir$/);
  expect(text).toContain(".tran 10u 20m");
  expect(text).toMatch(/^R/m);
  expectNoErrors(errors);
});

// S13.2: Referenz L05 (Export/Import JSON Roundtrip, inkl. Download + Envelope).
// S13.3: Stückliste als Tabelle (CSV-Export existiert nicht – Matrix veraltet).
test("S13.3 Stückliste (Tabelle)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placeResistor(page);
  await openBottomTab(page, "Stückliste");
  for (const h of ["Referenz", "Bauteil", "Wert", "Footprint", "Montage", "Menge"]) {
    await expect(page.getByRole("columnheader", { name: h })).toBeVisible();
  }
  await expect(page.getByRole("cell", { name: "R1" })).toBeVisible();
  expectNoErrors(errors);
});

// S13.4: PNG-Export (echte PNG-Signatur).
test("S13.4 PNG-Export", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placeResistor(page);
  const [dl] = await Promise.all([page.waitForEvent("download"), menuClick(page, "Datei", "Export PNG")]);
  expect(dl.suggestedFilename()).toMatch(/\.png$/);
  const path = await dl.path();
  if (!path) throw new Error("kein Download-Pfad");
  const buf = fs.readFileSync(path);
  expect(buf.length).toBeGreaterThan(100);
  expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expectNoErrors(errors);
});

// S13.5: Sonden-CSV (Header + mindestens eine Zeile).
test("S13.5 Sonden-CSV-Export", async ({ page }) => {
  const errors = await gotoApp(page);
  await openBottomTab(page, "Sonden");
  const { name, text } = await downloadText(page, () =>
    page.getByRole("button", { name: /CSV Export/ }).click(),
  );
  expect(name).toBe("probes.csv");
  const lines = text.split("\n");
  expect(lines[0]).toBe("Name,Typ,Netz,REF,Vdc,Vrms,Vpp,Vavg,Freq");
  expect(lines.length).toBeGreaterThan(1);
  expectNoErrors(errors);
});
