import { test, expect, type Page } from "@playwright/test";
import {
  gotoApp, expectNoErrors, msEval, act, menuClick, openBottomTab,
  expectLog, expectNear,
} from "./helpers";
import { wizardDivider } from "./flows";

async function waitAnalysisDone(page: Page): Promise<void> {
  await expect.poll(() => msEval<boolean>(page, `(s) => s.analysis.running`), { timeout: 60_000 }).toBe(false);
}

// I03: OP direkt, OUT = 2,5 V.
test("I03 DC-Arbeitspunkt am Teiler", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  await menuClick(page, "Analysen", "DC-Arbeitspunkt");
  await waitAnalysisDone(page);
  const out = await msEval<number>(page, `(s) => s.analysis.data.nodes.OUT`);
  expectNear(out, 2.5, 1e-6);
  await expectLog(page, /Analyse »op« beendet/);
  expectNoErrors(errors);
});

// I04+J02: TRAN am RC-Tiefpass, Kurven + Stats.
test("I04 Transiente am RC-Tiefpass", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "loadPreset", "rc-lowpass");
  await menuClick(page, "Analysen", "Transientenanalyse");
  const dlg = page.getByRole("dialog", { name: /Transientenanalyse/ });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("checkbox", { name: "OUT" }).check();
  await dlg.getByRole("button", { name: "Ausführen" }).click();
  await waitAnalysisDone(page);
  const nPts = await msEval<number>(page, `(s) => s.analysis.data?.time?.length ?? 0`);
  expect(nPts).toBeGreaterThan(10);
  const sigLen = await msEval<number>(page, `(s) => (s.analysis.data?.signals?.OUT ?? []).length`);
  expect(sigLen).toBe(nPts);
  await openBottomTab(page, "Ergebnisse");
  const tab = page.getByRole("button", { name: "Ergebnisse", exact: true });
  void tab;
  await expect(page.getByText("Max", { exact: true }).first()).toBeVisible();
  expectNoErrors(errors);
});

// I05: AC am RC-Tiefpass, f−3dB ≈ 995 Hz.
test("I05 AC-Analyse, f−3dB", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "loadPreset", "rc-lowpass");
  await menuClick(page, "Analysen", "AC-Analyse");
  const dlg = page.getByRole("dialog", { name: /AC-Analyse/ });
  await dlg.getByRole("checkbox", { name: "OUT" }).check();
  await dlg.getByRole("button", { name: "Ausführen" }).click();
  await waitAnalysisDone(page);
  await openBottomTab(page, "Ergebnisse");
  const row = page.getByText("f−3dB", { exact: true });
  await expect(row.first()).toBeVisible();
  // Wert steht in der Stats-Tabelle (gleiche Zeile/Gruppe).
  const panel = page.locator("div", { has: row.first() }).last();
  void panel;
  const f3 = await msEval<number>(page, `(s) => {
    const d = s.analysis.data;
    const xs = d.freq; const ys = d.magDb.OUT ?? [];
    for (let i = 1; i < ys.length; i++) {
      if (ys[i - 1] > -3 && ys[i] <= -3) return Math.sqrt(xs[i - 1] * xs[i]);
    }
    return NaN;
  }`);
  expectNear(f3, 995, 120);
  expectNoErrors(errors);
});

// I02: Validierung ohne Ausgangsknoten.
test("I02 Analyse ohne Ausgang verweigert", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "loadPreset", "rc-lowpass");
  // Netze erst settlen lassen (der Dialog initialisiert aus netResult).
  await expect.poll(() => msEval<string[]>(page, `(s) => s.netResult.nets.map((n) => n.name)`)).toContain("OUT");
  await menuClick(page, "Analysen", "Transientenanalyse");
  const dlg = page.getByRole("dialog", { name: /Transientenanalyse/ });
  await expect(dlg).toBeVisible();
  // Alle vorausgewählten Ausgänge abwählen → erst dann greift die Validierung.
  const boxes = dlg.getByRole("checkbox");
  for (let i = (await boxes.count()) - 1; i >= 0; i--) {
    if (await boxes.nth(i).isChecked()) await boxes.nth(i).uncheck();
  }
  // Exakt „0 gewählt“ (Substring würde auch „10 gewählt“ matchen).
  await expect(dlg.getByText("0 gewählt", { exact: true })).toBeVisible();
  await dlg.getByRole("button", { name: "Ausführen" }).click();
  // Diagnose-fähig: DOM-Status als Text pollen (Received landet in CI-Annotations).
  await expect.poll(async () => {
    const dom = await page.evaluate(() => {
      const ds = document.querySelectorAll('[role="dialog"]');
      const st = ds[0]?.querySelector('[role="status"]');
      const checked = ds[0]?.querySelectorAll('input[type="checkbox"]:checked').length ?? -1;
      return `dialogs=${ds.length} checked=${checked} status=${st ? JSON.stringify(st.textContent) : "<kein>"}`;
    });
    const running = await msEval<boolean>(page, `(s) => s.analysis.running`);
    return `${dom} running=${running}`;
  }).toContain("Mindestens einen Ausgangsknoten");
  await expect(dlg).toBeVisible();
  await expect.poll(() => msEval<boolean>(page, `(s) => s.analysis.running`)).toBe(false);
  expectNoErrors(errors);
});
