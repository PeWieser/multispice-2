import { expect, test } from "@playwright/test";
import {
  act,
  centerViewOn,
  clickWorld,
  expectNoErrors,
  gotoApp,
  msEval,
  startSimUI,
  stopSimUI,
} from "./helpers";
import { wizardDivider } from "./flows";

// Die Schaltung ist ein bekannter 8-V-Schaltertest. Die Interaktion selbst
// erfolgt wie beim Nutzer über Start und einen echten Klick auf den Canvas.
test("Schalterklick verändert die Spannung trotz unterschiedlicher ID und Referenz", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await msEval<void>(page, `(s) => {
    const doc = structuredClone(s.doc);
    doc.instances = [
      { id: "v1", partId: "vdc", x: 200, y: 300, rot: 0, label: "V1", params: { dc: 8 } },
      { id: "inst_s1", partId: "switch_spst", x: 320, y: 270, rot: 0, label: "S1", params: {} },
      { id: "r1", partId: "resistor", x: 430, y: 270, rot: 0, label: "R1", params: { r: 1000 } },
      { id: "g1", partId: "gnd", x: 200, y: 400, rot: 0, label: "GND1", params: {} },
      { id: "g2", partId: "gnd", x: 460, y: 400, rot: 0, label: "GND2", params: {} },
    ];
    doc.wires = [
      { id: "w1", points: [{ x: 200, y: 270 }, { x: 290, y: 270 }] },
      { id: "w2", points: [{ x: 350, y: 270 }, { x: 400, y: 270 }] },
      { id: "w3", points: [{ x: 460, y: 270 }, { x: 460, y: 386 }] },
      { id: "w4", points: [{ x: 200, y: 330 }, { x: 200, y: 386 }] },
    ];
    doc.labels = [{ id: "l1", x: 375, y: 270, name: "SW" }];
    s.setDoc(doc, false);
  }`);
  await centerViewOn(page, 330, 320);
  await startSimUI(page);
  const voltage = () => msEval<number>(page, `(s, ms) => ms.engine.lastState.nets.SW ?? NaN`);
  await expect.poll(voltage).toBeCloseTo(0, 2);
  await clickWorld(page, 320, 270);
  await expect.poll(() => msEval<number>(page, `(s, ms) => ms.engine.controls.S1`)).toBe(1);
  await expect.poll(voltage).toBeCloseTo(8, 1);
  // Ein zweiter separater Klick öffnet den Schalter wieder.
  await page.waitForTimeout(600);
  await clickWorld(page, 320, 270);
  await expect.poll(() => msEval<number>(page, `(s, ms) => ms.engine.controls.S1`)).toBe(0);
  await expect.poll(voltage).toBeCloseTo(0, 2);
  await stopSimUI(page);
  expectNoErrors(errors);
});

test("Simulation läuft ausschließlich im aktiven Entwurfs-Tab", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  const firstId = await msEval<string>(page, `(s) => s.doc.id`);
  const tabs = page.getByRole("tablist", { name: "Entwürfe" });
  const sheet = (id: string) => tabs.locator(`[data-sheet-id="${id}"]`);
  const simState = () => msEval<{ ui: boolean; engine: boolean }>(page, `(s, ms) => ({ ui: s.sim.running, engine: ms.engine.running })`);
  const expectRunning = async (running: boolean) => {
    await expect.poll(simState).toEqual({ ui: running, engine: running });
  };
  const simTime = () => msEval<number>(page, `(s, ms) => ms.engine.lastState.time`);

  await startSimUI(page);
  await expectRunning(true);
  await expect.poll(simTime).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Neuer Entwurf" }).click();
  const secondId = await msEval<string>(page, `(s) => s.doc.id`);
  expect(secondId).not.toBe(firstId);
  await expectRunning(false);
  const pausedAt = await simTime();
  await page.waitForTimeout(250);
  expect(await simTime()).toBe(pausedAt);

  // Rückkehr setzt nur den ursprünglichen Lauf fort; die Simulationszeit läuft weiter.
  await sheet(firstId).getByRole("tab").click();
  await expectRunning(true);
  await expect.poll(simTime).toBeGreaterThan(pausedAt);

  // Start auf B entzieht A den Laufanspruch; Rückkehr zu A startet nichts.
  await sheet(secondId).getByRole("tab").click();
  await expectRunning(false);
  await startSimUI(page);
  await expectRunning(true);
  await expect(sheet(secondId).getByRole("status", { name: "Simulation läuft" })).toBeVisible();
  await expect(sheet(firstId).getByRole("status", { name: "Simulation läuft" })).toHaveCount(0);
  await expect(tabs.getByRole("status", { name: "Simulation läuft" })).toHaveCount(1);
  await sheet(firstId).getByRole("tab").click();
  await expectRunning(false);
  await sheet(secondId).getByRole("tab").click();
  await expectRunning(true);
  await stopSimUI(page);
  await expectRunning(false);
  await expect(tabs.getByRole("status", { name: "Simulation läuft" })).toHaveCount(0);
  expectNoErrors(errors);
});
