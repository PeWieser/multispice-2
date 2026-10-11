import { test, expect } from "@playwright/test";
import { gotoApp, expectNoErrors, msEval, menuClick } from "./helpers";
import { wizardDivider } from "./flows";

// O01+O02: Assistenten-Liste + Teiler erzeugen.
test("O02 Spannungsteiler-Assistent", async ({ page }) => {
  const errors = await gotoApp(page);
  await menuClick(page, "Vorlagen", "Schaltungs-Assistenten …");
  const dlg = page.getByRole("dialog", { name: "Schaltungs-Assistent" });
  await expect(dlg.getByText("Spannungsteiler").first()).toBeVisible();
  await expect(dlg.getByText("RC-Tiefpass 1. Ordnung").first()).toBeVisible();
  await dlg.getByRole("button", { name: "Schaltung erzeugen" }).click();
  await expect(dlg).toBeHidden();
  const labels = await msEval<string[]>(page, `(s) => s.doc.labels.map((l) => l.name)`);
  expect(labels).toContain("IN");
  expect(labels).toContain("OUT");
  const r1 = await msEval<number>(page, `(s) => s.doc.instances.find((i) => i.label === "R1")?.params.r`);
  expect(r1).toBe(10000);
  expectNoErrors(errors);
});
