import { expect, test, type Locator, type Page } from "@playwright/test";
import { canvasApp, expectHook, expectNoErrors, gotoApp, menuClick, msEval } from "../helpers";
import { attachShot, luminance, parseRgb } from "./helpers";

async function openSettingsToolbar(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dlg).toBeVisible();
  return dlg;
}

// S11.5a: Öffnen via Toolbar, 5 Bereiche, Esc schließt.
test("S11.5a Einstellungen via Toolbar (Bereiche + Esc)", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  const dlg = await openSettingsToolbar(page);
  for (const tab of ["Allgemein", "Arbeitsfläche", "Simulation", "Messsonden", "Lehrer-Modus"]) {
    await expect(dlg.getByRole("button", { name: tab, exact: true })).toBeVisible();
  }
  const box = await dlg.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(500);
  await attachShot(page, testInfo, "settings.png");
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  expectNoErrors(errors);
});

// S11.5b: Öffnen via Menü, Klick-außen schließt.
test("S11.5b Einstellungen via Menü (Klick-außen schließt)", async ({ page }) => {
  const errors = await gotoApp(page);
  await menuClick(page, "Ansicht", "Einstellungen …");
  const dlg = page.getByRole("dialog", { name: "Einstellungen" });
  await expect(dlg).toBeVisible();
  await page.mouse.click(10, 10);
  await expect(dlg).toBeHidden();
  expectNoErrors(errors);
});

// S11.4: Erscheinungsbild (System/Dunkel/Hell + Persistenz).
test("S11.4 Erscheinungsbild (Theme + Persistenz)", async ({ page }) => {
  const errors = await gotoApp(page);
  const dlg = await openSettingsToolbar(page);
  await dlg.getByRole("button", { name: "Allgemein", exact: true }).click();
  for (const label of ["System", "Dunkel", "Hell"]) {
    await expect(dlg.getByRole("button", { name: label, exact: true })).toBeVisible();
  }
  await dlg.getByRole("button", { name: "Dunkel", exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem("multispice.theme"))).toBe("dark");
  const bgDark = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(luminance(parseRgb(bgDark))).toBeLessThan(0.25);
  await page.reload();
  await expect(canvasApp(page)).toBeVisible();
  await expectHook(page);
  expect(await page.evaluate(() => localStorage.getItem("multispice.theme"))).toBe("dark");
  const bgDark2 = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(luminance(parseRgb(bgDark2))).toBeLessThan(0.25);
  expectNoErrors(errors);
});

// S11.3: Arbeitsfläche (Raster/Snap/Ortho → Store).
test("S11.3 Arbeitsfläche (Raster/Snap/Ortho)", async ({ page }) => {
  const errors = await gotoApp(page);
  const dlg = await openSettingsToolbar(page);
  await dlg.getByRole("button", { name: "Arbeitsfläche", exact: true }).click();
  const cases: Array<[string, string]> = [
    ["Raster einblenden", "showGrid"],
    ["Am Raster ausrichten", "snap"],
    ["Orthogonale Leitungsführung", "autoRoute"],
  ];
  for (const [label, key] of cases) {
    const sw = dlg.getByRole("switch", { name: label });
    const before = await sw.getAttribute("aria-checked");
    await sw.click();
    await expect(sw).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
    await expect.poll(() => msEval<boolean>(page, `(s) => s.${key}`)).toBe(before !== "true");
  }
  await page.keyboard.press("Escape");
  expectNoErrors(errors);
});

// S11.1: Messsonden (Anzeige-Schalter + Persistenz).
test("S11.1 Messsonden (Anzeige + Persistenz)", async ({ page }) => {
  const errors = await gotoApp(page);
  const dlg = await openSettingsToolbar(page);
  await dlg.getByRole("button", { name: "Messsonden", exact: true }).click();
  for (const label of ["Netzname", "Spannung (V)", "Stromstärke (I)", "Leistung (P)", "Frequenz (f)"]) {
    await expect(dlg.getByRole("switch", { name: label })).toBeVisible();
  }
  const sw = dlg.getByRole("switch", { name: "Frequenz (f)" });
  const before = await sw.getAttribute("aria-checked");
  await sw.click();
  const flipped = before !== "true";
  await expect(sw).toHaveAttribute("aria-checked", flipped ? "true" : "false");
  const cfg = await page.evaluate(() => localStorage.getItem("multispice.probeHover"));
  expect(cfg).not.toBeNull();
  expect((JSON.parse(cfg as string) as Record<string, unknown>).showFreq).toBe(flipped);
  await page.reload();
  await expect(canvasApp(page)).toBeVisible();
  await expectHook(page);
  const dlg2 = await openSettingsToolbar(page);
  await dlg2.getByRole("button", { name: "Messsonden", exact: true }).click();
  await expect(dlg2.getByRole("switch", { name: "Frequenz (f)" })).toHaveAttribute(
    "aria-checked",
    flipped ? "true" : "false",
  );
  expectNoErrors(errors);
});

// S11.x: Simulation (Stromfluss-Schalter kippt).
test("S11.x Simulation (Stromfluss-Schalter)", async ({ page }) => {
  const errors = await gotoApp(page);
  const dlg = await openSettingsToolbar(page);
  await dlg.getByRole("button", { name: "Simulation", exact: true }).click();
  const sw = dlg.getByRole("switch", { name: "Stromfluss animieren" });
  const before = await sw.getAttribute("aria-checked");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", before === "true" ? "false" : "true");
  await page.keyboard.press("Escape");
  expectNoErrors(errors);
});
