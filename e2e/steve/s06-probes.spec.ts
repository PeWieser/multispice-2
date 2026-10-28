import { expect, test } from "@playwright/test";
import {
  clickWorld,
  expectNoErrors,
  gotoApp,
  msEval,
  openBottomTab,
  startSimUI,
  stopSimUI,
  worldToPage,
} from "../helpers";
import { placeVoltageProbe, wizardDivider } from "../flows";
import { attachShot } from "./helpers";

type ProbePos = { x: number; y: number; net: string };

// S6.1: V-Sonde per Toolbar + Klick (Netz OUT). S6.2/S6.3/S6.8: visuell.
test("S6.1 V-Sonde setzen (Netz OUT)", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  await page.locator('button[title="Spannungs-Probe (V)"]').click();
  await expect.poll(() => msEval<string | null>(page, `(s) => s.placingProbeKind`)).toBe("voltage");
  await clickWorld(page, 360, 300);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.probes.length`)).toBe(1);
  const net = await msEval<string>(page, `(s) => s.doc.probes[0].net ?? ""`);
  expect(net).toBe("OUT");
  await startSimUI(page);
  await attachShot(page, testInfo, "probe.png");
  await stopSimUI(page);
  expectNoErrors(errors);
});

// S6.5: Alt+Hover zeigt Netz-Tooltip (erscheint + verschwindet).
test("S6.5 Alt+Hover (Netz-Tooltip)", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  await startSimUI(page);
  const p = await worldToPage(page, 360, 300);
  await page.keyboard.down("Alt");
  await page.mouse.move(p.x, p.y, { steps: 4 });
  await expect(page.getByText("Netz OUT")).toBeVisible({ timeout: 8000 });
  await expect(page.getByText(/V = /)).toBeVisible();
  await page.keyboard.up("Alt");
  await page.mouse.move(p.x + 60, p.y + 60, { steps: 4 });
  await expect(page.getByText("Netz OUT")).toBeHidden({ timeout: 8000 });
  await stopSimUI(page);
  expectNoErrors(errors);
});

// S6.6: REF zuweisen (Kontextmenü, REF-Liste).
test("S6.6 REF zuweisen (Kontextmenü)", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  const vId = await placeVoltageProbe(page, 360, 300);
  await page.getByRole("button", { name: /Weitere Messsonden/ }).click();
  await page.getByRole("menuitem", { name: /Referenz-Probe/ }).click();
  await expect.poll(() => msEval<string | null>(page, `(s) => s.placingProbeKind`)).toBe("ref");
  await clickWorld(page, 500, 400);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.probes.length`)).toBe(2);
  const refId = await msEval<string>(page, `(s) => s.doc.probes.find((p) => p.kind === "ref")?.id ?? ""`);
  expect(refId).not.toBe("");
  const vpos = await msEval<ProbePos>(
    page,
    `(s) => { const p = s.doc.probes.find((q) => q.id === ${JSON.stringify(vId)}); return { x: p.x, y: p.y, net: p.net ?? "" }; }`,
  );
  const p = await worldToPage(page, vpos.x, vpos.y);
  await page.mouse.click(p.x, p.y, { button: "right" });
  await page.getByRole("button", { name: /^REF .*\(.*\)$/ }).click();
  await expect
    .poll(
      () =>
        msEval<string>(
          page,
          `(s) => s.doc.probes.find((q) => q.id === ${JSON.stringify(vId)})?.ref ?? ""`,
        ),
    )
    .toBe(refId);
  expectNoErrors(errors);
});

// S6.7: Richtung umkehren (A-Sonde, direction flip + Pfeil-Screenshot).
test("S6.7 Richtung umkehren (A-Sonde)", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  await page.locator('button[title="Strom-Probe (A)"]').click();
  await expect.poll(() => msEval<string | null>(page, `(s) => s.placingProbeKind`)).toBe("current");
  await clickWorld(page, 360, 300);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.probes.length`)).toBe(1);
  const probe = await msEval<{ id: string; x: number; y: number }>(
    page,
    `(s) => ({ id: s.doc.probes[0].id, x: s.doc.probes[0].x, y: s.doc.probes[0].y })`,
  );
  const p = await worldToPage(page, probe.x, probe.y);
  await page.mouse.click(p.x, p.y, { button: "right" });
  await page.getByRole("button", { name: /Richtung umkehren/ }).click();
  await expect
    .poll(
      () =>
        msEval<number>(
          page,
          `(s) => s.doc.probes.find((q) => q.id === ${JSON.stringify(probe.id)})?.direction ?? 0`,
        ),
    )
    .toBe(1);
  await startSimUI(page);
  await attachShot(page, testInfo, "probe-reverse.png");
  await stopSimUI(page);
  expectNoErrors(errors);
});

// S6.9: Sonde verschieben (Position neu, Netz gleich).
test("S6.9 Sonde verschieben (Netz bleibt)", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  const id = await placeVoltageProbe(page, 360, 300);
  const posOf = () =>
    msEval<ProbePos>(
      page,
      `(s) => { const p = s.doc.probes.find((q) => q.id === ${JSON.stringify(id)}); return { x: p.x, y: p.y, net: p.net ?? "" }; }`,
    );
  const before = await posOf();
  const a = await worldToPage(page, before.x, before.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const b = await worldToPage(page, before.x + 60, before.y + 40);
  await page.mouse.move(b.x, b.y, { steps: 10 });
  await page.mouse.up();
  const after = await posOf();
  expect(after.x).not.toBe(before.x);
  expect(after.y).not.toBe(before.y);
  expect(after.net).toBe(before.net);
  expectNoErrors(errors);
});

// S6.10: Sonde löschen (Tabelle aktualisiert).
test("S6.10 Sonde löschen", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  await placeVoltageProbe(page, 360, 300);
  const pos = await msEval<ProbePos>(page, `(s) => ({ x: s.doc.probes[0].x, y: s.doc.probes[0].y, net: "" })`);
  await clickWorld(page, pos.x, pos.y);
  await page.keyboard.press("Delete");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.probes.length`)).toBe(0);
  await openBottomTab(page, "Sonden");
  await expect(page.getByText("V1")).toBeHidden();
  expectNoErrors(errors);
});
