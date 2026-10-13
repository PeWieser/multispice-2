import { expect, test, type Page } from "@playwright/test";
import { act, clickWorld, closeInlineEditor, expectNoErrors, gotoApp, menuClick, msEval } from "../helpers";

/** window.print stubben: zählt Aufrufe, öffnet keinen nativen Dialog. */
async function stubPrint(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __printCalls: number };
    w.__printCalls = 0;
    window.print = () => {
      w.__printCalls++;
    };
  });
}

async function printCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __printCalls?: number }).__printCalls ?? 0);
}

async function threePages(page: Page): Promise<void> {
  await act(page, "newDocument");
  await act(page, "addPage");
  await act(page, "addPage");
}

function printDialog(page: Page) {
  return page.getByRole("dialog", { name: "Drucken" });
}

// S17.1: Dialog über Menü öffnen — 3 Seiten → 4 Blätter mit Verzeichnis.
test("S17.1 Druck-Dialog (Menü, Blattvorschau)", async ({ page }) => {
  const errors = await gotoApp(page);
  await threePages(page);
  await menuClick(page, "Datei", "Drucken …");
  const dlg = printDialog(page);
  await expect(dlg).toBeVisible();
  await expect(dlg.getByText("4 Blätter · A4 quer · mit Verzeichnis")).toBeVisible();
  await expect(dlg.getByLabel("Sachnummer", { exact: true })).toBeVisible();
  await dlg.getByRole("button", { name: "Abbrechen" }).click();
  await expect(dlg).toHaveCount(0);
  expectNoErrors(errors);
});

// S17.2: Strg+P/Cmd+P öffnet den Dialog (statt Browser-Default), Esc schließt.
test("S17.2 Druck-Dialog per Tastatur", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("ControlOrMeta+p");
  const dlg = printDialog(page);
  await expect(dlg).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dlg).toHaveCount(0);
  expectNoErrors(errors);
});

// S17.3: Feld setzen → Drucken: Auftrag, Schriftfeld, 4 Bögen mit Blattnummern.
test("S17.3 Drucken mit Schriftfeld (4 Bögen)", async ({ page }) => {
  const errors = await gotoApp(page);
  await stubPrint(page);
  await threePages(page);
  await menuClick(page, "Datei", "Drucken …");
  const dlg = printDialog(page);
  await dlg.getByLabel("Sachnummer", { exact: true }).fill("MS-007");
  await dlg.getByRole("button", { name: "Drucken", exact: true }).click();
  expect(await printCalls(page)).toBe(1);
  await expect(dlg).toHaveCount(0);
  // Schriftfeld im Entwurf …
  expect(await msEval<string | undefined>(page, "(s) => s.doc.titleBlock?.docNo")).toBe("MS-007");
  // … und auf allen 4 Bögen (Verzeichnis + 3), mit Blattnummern.
  const sheets = page.locator(".print-sheet");
  await expect(sheets).toHaveCount(4);
  await expect(page.locator(".tblock")).toHaveCount(4);
  await expect(sheets.nth(0).getByText("1 / 4")).toBeAttached();
  await expect(sheets.nth(1).getByText("2 / 4")).toBeAttached();
  await expect(sheets.nth(3).getByText("4 / 4")).toBeAttached();
  await expect(sheets.nth(1).getByText("MS-007")).toBeAttached();
  await expect(sheets.nth(0).getByText("Gesamt:")).toBeAttached();
  // Druckeinstellung rechnerweit gemerkt.
  const setup = await page.evaluate(() => localStorage.getItem("multispice.printSetup"));
  expect(setup).toContain('"format":"a4l"');
  expectNoErrors(errors);
});

// S17.4: Umfang „Nur aktive Seite“ → genau 1 Blatt, 1/1.
test("S17.4 Nur aktive Seite drucken", async ({ page }) => {
  const errors = await gotoApp(page);
  await stubPrint(page);
  await threePages(page);
  await menuClick(page, "Datei", "Drucken …");
  const dlg = printDialog(page);
  await dlg.getByRole("button", { name: /^Nur „/ }).click();
  await expect(dlg.getByText("1 Blatt · A4 quer")).toBeVisible();
  await dlg.getByRole("button", { name: "Drucken", exact: true }).click();
  expect(await printCalls(page)).toBe(1);
  await expect(page.locator(".print-sheet")).toHaveCount(1);
  await expect(page.locator(".print-sheet").nth(0).getByText("1 / 1")).toBeAttached();
  expectNoErrors(errors);
});

// S17.5: Schriftfeld überlebt Reload (Auto-Save → Boot-Restore).
test("S17.5 Schriftfeld ist reload-fest", async ({ page }) => {
  const errors = await gotoApp(page);
  await stubPrint(page);
  await threePages(page);
  await menuClick(page, "Datei", "Drucken …");
  const dlg = printDialog(page);
  await dlg.getByLabel("Sachnummer", { exact: true }).fill("MS-042");
  await dlg.getByRole("button", { name: "Drucken", exact: true }).click();
  expect(await printCalls(page)).toBe(1);
  // Auto-Save debounced (1,5 s) abwarten, dann neu laden.
  await page.waitForTimeout(3000);
  await page.reload();
  await expect(page.locator('canvas[aria-label^="Schaltplan:"]')).toBeVisible();
  expect(await msEval<string | undefined>(page, "(s) => s.doc.titleBlock?.docNo")).toBe("MS-042");
  expect(await msEval<number>(page, "(s) => s.doc.pages?.length ?? 1")).toBe(3);
  expectNoErrors(errors);
});

// S17.6: Browser-„Export PDF“ nutzt den Druckkanal (window.print, Ticket-Bögen).
test("S17.6 Export PDF (Browser) druckt Ticket-Bögen", async ({ page }) => {
  const errors = await gotoApp(page);
  await stubPrint(page);
  await threePages(page);
  await menuClick(page, "Datei", "Export PDF");
  expect(await printCalls(page)).toBe(1);
  // Gedruckt wird der Portal-Stand: 4 Bögen mit Blattnummern.
  await expect(page.locator(".print-sheet")).toHaveCount(4);
  await expect(page.locator(".print-sheet").nth(3).getByText("4 / 4")).toBeAttached();
  expectNoErrors(errors);
});

// S17.7: Stückliste mit Fundstellen, Zonenraster, Faltmarken (A3).
test("S17.7 Stückliste, Zonen, Faltmarken", async ({ page }) => {
  const errors = await gotoApp(page);
  await stubPrint(page);
  await threePages(page);
  // Je ein Bauteil auf Seite 1 und 2 (Fundstellen über Blätter).
  const ids = await msEval<string[]>(page, "(s) => s.doc.pages.map((p) => p.id)");
  await act(page, "openPage", ids[0]);
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await closeInlineEditor(page);
  await act(page, "openPage", ids[1]);
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 600, 400);
  await closeInlineEditor(page);
  await menuClick(page, "Datei", "Drucken …");
  const dlg = printDialog(page);
  await expect(dlg.getByText("5 Blätter · A4 quer · mit Verzeichnis · mit Stückliste")).toBeVisible();
  await dlg.getByRole("button", { name: "Drucken", exact: true }).click();
  expect(await printCalls(page)).toBe(1);
  const sheets = page.locator(".print-sheet");
  await expect(sheets).toHaveCount(5);
  // Zonenraster: 6 Teilungslinien auf jedem Schaltblatt.
  await expect(sheets.nth(1).locator('line[stroke-dasharray="4 3"]')).toHaveCount(6);
  // Stückliste: gruppierte Position mit Fundstellen auf Blatt 2 und 3.
  const bom = sheets.nth(4);
  await expect(bom.getByText("Stückliste")).toBeAttached();
  await expect(bom.getByText("R1, R2")).toBeAttached();
  await expect(bom.getByText(/2·[A-D][1-4], 3·[A-D][1-4]/)).toBeAttached();
  await expect(bom.getByText("5 / 5")).toBeAttached();
  // A3: Faltmarken auf jedem Bogen (Druck-CSS aktiv schalten zum Prüfen).
  await menuClick(page, "Datei", "Drucken …");
  await dlg.getByRole("button", { name: "A3 quer" }).click();
  await dlg.getByRole("button", { name: "Drucken", exact: true }).click();
  expect(await printCalls(page)).toBe(2);
  await expect(page.locator(".foldmark-top")).toHaveCount(5);
  await page.emulateMedia({ media: "print" });
  await expect(sheets.nth(0)).toBeVisible();
  await expect(page.locator(".foldmark-top").first()).toBeVisible();
  expectNoErrors(errors);
});
