import { test, expect } from "@playwright/test";
import {
  gotoApp, expectNoErrors, startSimUI, stopSimUI, msEval, menuClick,
  expectLog, startButton, act,
} from "./helpers";
import { wizardDivider, placeVoltageProbe, expectProbeVdc } from "./flows";

// F01+F02: Start/Pause/Stop + Konsolen-Log.
test("F01 Start, Pause, Stop, Log", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  await startSimUI(page);
  await expectLog(page, /Simulation gestartet/);
  // Sim-Takt läuft (tick steigt pro Frame; es gibt kein s.sim.time im Store).
  const t1 = await msEval<number>(page, `(s) => s.sim.tick`);
  await page.waitForTimeout(800);
  const t2 = await msEval<number>(page, `(s) => s.sim.tick`);
  expect(t2).toBeGreaterThan(t1);
  // Pause per Leertaste (Fokus vorher vom Button nehmen — Space auf Buttons toggelt per Design nicht).
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press(" ");
  await expect.poll(() => msEval<boolean>(page, `(s) => s.sim.running`)).toBe(false);
  await expect(startButton(page)).toContainText("Start");
  // Weiter + Stop per Button.
  await startSimUI(page);
  await stopSimUI(page);
  expectNoErrors(errors);
});

// F03+G01+G02: Teiler-Sim + V-Sonde misst 2,5 V.
test("F03 Teiler OUT = 2,5 V per Sonde", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  // OUT-Abzweig des Assistenten: Welt (360, 300).
  const id = await placeVoltageProbe(page, 360, 300);
  const net = await msEval<string>(page, `(s) => s.doc.probes.find((p) => p.id === ${JSON.stringify(id)})?.net ?? ""`);
  expect(net).toBe("OUT");
  await startSimUI(page);
  await expectProbeVdc(page, 2.5, 0.05);
  await stopSimUI(page);
  expectNoErrors(errors);
});

// F04: Leerer Plan startet ehrlich mit 0 Bauteilen.
test("F04 leerer Plan", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await startButton(page).click();
  await expectLog(page, /0 Bauteile/);
  expectNoErrors(errors);
});

// F06: Spannungsfarben toggeln.
test("F06 Spannungsfarben", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  await startSimUI(page);
  await menuClick(page, "Ansicht", "Spannungsfarben");
  await expect.poll(() => msEval<boolean>(page, `(s) => s.showVoltageColors`)).toBe(true);
  await menuClick(page, "Ansicht", "Spannungsfarben");
  await expect.poll(() => msEval<boolean>(page, `(s) => s.showVoltageColors`)).toBe(false);
  await stopSimUI(page);
  expectNoErrors(errors);
});
