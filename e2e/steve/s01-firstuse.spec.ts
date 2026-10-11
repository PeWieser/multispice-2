import { expect, test } from "@playwright/test";
import { canvasApp, expectNoErrors, gotoApp } from "../helpers";

// S1.1: Boot ohne Begrüßungs-Hinweis (Referenz A01 für Schaltung/Fehler).
// S1.2: Referenz B01-B08 (Vorlagen). S1.3/S1.5: Referenz F01. S1.4: Referenz F03.
test("S1.1 Boot ohne Begrüßungs-Hinweis", async ({ page }) => {
  const errors = await gotoApp(page);
  await expect(canvasApp(page)).toBeVisible();
  await expect(page.locator("#workspace")).toBeVisible();
  // ScreenReaderStatus (role=status) ist permanent; Toast (UndoToast) darf nicht da sein.
  await expect(page.locator("div.z-toast")).toHaveCount(0);
  expectNoErrors(errors);
});
