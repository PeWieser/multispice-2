import { expect, test, type Page } from "@playwright/test";
import {
  act,
  canvasEl,
  clickWorld,
  closeInlineEditor,
  expectLog,
  expectNoErrors,
  gotoApp,
  msEval,
  openLibrary,
  placePartUI,
  startSimUI,
  stopSimUI,
  worldToPage,
} from "../helpers";
import { placeVoltageProbe, wizardDivider } from "../flows";
import { attachShot } from "./helpers";

type Pt = { x: number; y: number };

async function placeResistor(page: Page, x: number, y: number): Promise<void> {
  await page.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, x, y);
  await closeInlineEditor(page);
}

async function rightClickWorld(page: Page, x: number, y: number): Promise<void> {
  const p = await worldToPage(page, x, y);
  await page.mouse.click(p.x, p.y, { button: "right" });
}

// 16.1: Kontextmenü Bauteil (Zeilen + Icons visuell).
test("16.1 Kontextmenü Bauteil", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placeResistor(page, 400, 300);
  await rightClickWorld(page, 400, 300);
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: /Duplizieren/ }).first()).toBeVisible();
  await expect(menu.getByRole("button", { name: "Eigenschaften…" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Löschen" })).toBeVisible();
  await attachShot(page, testInfo, "ctx-instance.png");
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  expectNoErrors(errors);
});

// 16.2: Kontextmenü Wire (Begradigen, Farbe, Bus).
test("16.2 Kontextmenü Wire", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  await clickWorld(page, 400, 300);
  await page.waitForTimeout(600);
  const p = await worldToPage(page, 600, 300);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  await rightClickWorld(page, 500, 300);
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByText("Leitung begradigen (Raster + rechte Winkel)")).toBeVisible();
  await expect(menu.getByText("Leitungsfarbe")).toBeVisible();
  await expect(menu.getByRole("button", { name: /Als Bus markieren/ })).toBeVisible();
  await attachShot(page, testInfo, "ctx-wire.png");
  await page.keyboard.press("Escape");
  expectNoErrors(errors);
});

// 16.3: Kontextmenü Probe (Richtung, Typ, REF).
test("16.3 Kontextmenü Probe", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  const id = await placeVoltageProbe(page, 360, 300);
  const pos = await msEval<Pt>(page, `(s) => { const p = s.doc.probes.find((q) => q.id === ${JSON.stringify(id)}); return { x: p.x, y: p.y }; }`);
  await rightClickWorld(page, pos.x, pos.y);
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: /Richtung umkehren/ })).toBeVisible();
  await attachShot(page, testInfo, "ctx-probe.png");
  await page.keyboard.press("Escape");
  expectNoErrors(errors);
});

// 16.4: Kontextmenü Leer (Einfügen, Netzname, Einpassen).
test("16.4 Kontextmenü Leer", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await rightClickWorld(page, 200, 200);
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("button", { name: "Einfügen" })).toBeVisible();
  await expect(menu.getByRole("button", { name: "Netzname hinzufügen" })).toBeVisible();
  await expect(menu.getByRole("button", { name: /Einpassen/ })).toBeVisible();
  await attachShot(page, testInfo, "ctx-empty.png");
  await page.keyboard.press("Escape");
  expectNoErrors(errors);
});

// 16.5: Wire-Farbe Rot + Undo.
test("16.5 Wire-Farbe Rot + Undo", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  await clickWorld(page, 400, 300);
  await page.waitForTimeout(600);
  const p = await worldToPage(page, 600, 300);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  const id = await msEval<string>(page, `(s) => s.doc.wires[0].id`);
  await rightClickWorld(page, 500, 300);
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByTitle("Rot").click();
  await expect
    .poll(() => msEval<string>(page, `(s) => (s.doc.wires.find((w) => w.id === ${JSON.stringify(id)}) as { color?: string }).color ?? ""`))
    .toBe("#ef4444");
  await page.keyboard.press("ControlOrMeta+z");
  await expect
    .poll(() => msEval<string>(page, `(s) => (s.doc.wires.find((w) => w.id === ${JSON.stringify(id)}) as { color?: string }).color ?? ""`))
    .toBe("");
  expectNoErrors(errors);
});

// 16.6: Leitung begradigen (Punkte schrumpfen, Manhattan, Undo).
test("16.6 Leitung begradigen", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  await clickWorld(page, 400, 300);
  await page.waitForTimeout(600);
  await clickWorld(page, 500, 300);
  await page.waitForTimeout(600);
  await clickWorld(page, 500, 400);
  await page.waitForTimeout(600);
  await clickWorld(page, 600, 400);
  await page.waitForTimeout(600);
  const p = await worldToPage(page, 600, 400);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  const before = await msEval<Pt[]>(page, `(s) => s.doc.wires[0].points`);
  expect(before.length).toBe(4);
  await rightClickWorld(page, 450, 300);
  await page.getByRole("button", { name: /Leitung begradigen/ }).click();
  const after = await msEval<Pt[]>(page, `(s) => s.doc.wires[0].points`);
  expect(after.length).toBeLessThan(4);
  for (let i = 1; i < after.length; i++) {
    expect(after[i].x === after[i - 1].x || after[i].y === after[i - 1].y, `Segment ${i}`).toBe(true);
  }
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires[0].points.length`)).toBe(4);
  expectNoErrors(errors);
});

// 16.7: ISO/ANSI-Umschaltung (Store + Persistenz + Vorschau-Screenshot).
test("16.7 Symbolstil ANSI (Store + Persistenz)", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  const dlg = page.getByRole("dialog", { name: "Einstellungen" });
  await dlg.getByRole("button", { name: "Allgemein", exact: true }).click();
  await dlg.getByRole("button", { name: "ANSI (US)", exact: true }).click();
  await expect.poll(() => msEval<string>(page, `(s) => s.symbolStyle`)).toBe("ansi");
  expect(await page.evaluate(() => localStorage.getItem("multispice.symbolStyle"))).toBe("ansi");
  await attachShot(page, testInfo, "symbols-ansi.png");
  await dlg.getByRole("button", { name: "Auto", exact: true }).click();
  await expect.poll(() => msEval<string>(page, `(s) => s.symbolStyle`)).toBe("auto");
  await page.keyboard.press("Escape");
  expectNoErrors(errors);
});

// 16.8: Library-Fenster draggen (Position folgt).
test("16.8 Library draggen (Position folgt)", async ({ page }) => {
  const errors = await gotoApp(page);
  await openLibrary(page);
  const search = page.locator("#lib-search");
  const posOf = () =>
    search.evaluate((el) => {
      let p: HTMLElement | null = el.parentElement;
      while (p && getComputedStyle(p).position !== "fixed") p = p.parentElement;
      if (!p) return { x: 0, y: 0 };
      const r = p.getBoundingClientRect();
      return { x: Math.round(r.left), y: Math.round(r.top) };
    });
  const before = await posOf();
  const bar = page.getByTitle("Ziehen bewegt das Fenster");
  const box = await bar.boundingBox();
  if (!box) throw new Error("kein Titelbalken");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2 + 60, { steps: 10 });
  await page.mouse.up();
  const after = await posOf();
  expect(Math.abs(after.x - before.x - 100)).toBeLessThan(8);
  expect(Math.abs(after.y - before.y - 60)).toBeLessThan(8);
  await expect(search).toBeVisible();
  expectNoErrors(errors);
});

// 16.13: Doppelklick auf Handle löscht Punkt (Log + Undo).
test("16.13 Doppelklick Handle löscht Punkt", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  await clickWorld(page, 400, 300);
  await page.waitForTimeout(600);
  const p = await worldToPage(page, 600, 300);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  await page.keyboard.press("w");
  const a = await worldToPage(page, 500, 300);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const b = await worldToPage(page, 600, 400);
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(2);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires[1].points.length`)).toBe(3);
  const h = await worldToPage(page, 600, 300);
  await page.mouse.dblclick(h.x, h.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires[1].points.length`)).toBe(2);
  await expectLog(page, /gelöscht/);
  expectNoErrors(errors);
});

// 16.14: Doppelklick auf Segment startet Abzweig (kein Punkt – Matrix veraltet).
test("16.14 Doppelklick Segment startet Abzweig", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  await clickWorld(page, 400, 300);
  await page.waitForTimeout(600);
  const p = await worldToPage(page, 600, 300);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  const mid = await worldToPage(page, 500, 300);
  await page.mouse.dblclick(mid.x, mid.y);
  await expectLog(page, /Abzweig ab/);
  const c = await worldToPage(page, 600, 400);
  await page.mouse.dblclick(c.x, c.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(2);
  expectNoErrors(errors);
});

// 16.15: Netz-Highlight bei Hover (visuell).
test("16.15 Netz-Highlight bei Hover", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await page.keyboard.press("w");
  await clickWorld(page, 400, 300);
  await page.waitForTimeout(600);
  const p = await worldToPage(page, 600, 300);
  await page.mouse.dblclick(p.x, p.y);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(1);
  const mid = await worldToPage(page, 500, 300);
  await page.mouse.move(mid.x, mid.y);
  await page.waitForTimeout(400);
  await attachShot(page, testInfo, "net-highlight.png");
  expectNoErrors(errors);
});

// 16.17: Instrument-Fenster draggen (Oszi-Position folgt).
test("16.17 Oszi-Fenster draggen", async ({ page }) => {
  const errors = await gotoApp(page);
  await wizardDivider(page);
  await placePartUI(page, "oszi", "Oszilloskop (XSC)", 560, 300);
  await page.keyboard.press("Escape");
  const p = await worldToPage(page, 560, 300);
  await page.mouse.dblclick(p.x, p.y);
  const dlg = page.getByRole("dialog", { name: /Oszilloskop/ });
  await expect(dlg).toBeVisible();
  const posOf = () =>
    msEval<{ x: number; y: number }>(page, `(s) => { const w = s.instruments.find((i) => i.kind === "scope"); return { x: w?.x ?? 0, y: w?.y ?? 0 }; }`);
  const before = await posOf();
  const box = await dlg.boundingBox();
  if (!box) throw new Error("kein Fenster");
  await page.mouse.move(box.x + 120, box.y + 14);
  await page.mouse.down();
  await page.mouse.move(box.x + 220, box.y + 74, { steps: 10 });
  await page.mouse.up();
  const after = await posOf();
  expect(Math.abs(after.x - before.x - 100)).toBeLessThan(8);
  expect(Math.abs(after.y - before.y - 60)).toBeLessThan(8);
  expectNoErrors(errors);
});

// 16.18: Undo/Redo-Toast (Gegenaktion funktioniert).
test("16.18 Undo/Redo-Toast", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placeResistor(page, 400, 300);
  await page.keyboard.press("Escape");
  await clickWorld(page, 400, 300);
  await page.keyboard.press("Delete");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(1);
  const toast = page.locator("div.z-toast");
  await expect(toast).toContainText("Rückgängig gemacht.");
  await toast.getByRole("button", { name: "Wiederholen" }).click();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(0);
  await expect(toast).toContainText("Wiederholt.");
  expectNoErrors(errors);
});

// 16.19: Alignment-Guides (Snap auf Kante + Screenshot).
test("16.19 Alignment-Snap (Kante rastet ein)", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placeResistor(page, 400, 300);
  await placeResistor(page, 520, 400);
  await page.keyboard.press("Escape");
  const a = await worldToPage(page, 400, 300);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const b = await worldToPage(page, 517, 300);
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await attachShot(page, testInfo, "align-guides.png");
  await page.mouse.up();
  const x = await msEval<number>(page, `(s) => s.doc.instances[0].x`);
  expect(Math.abs(x - 520)).toBeLessThanOrEqual(1);
  expectNoErrors(errors);
});

// 16.21: Marquee-Auswahl (2 Teile + Badge-Screenshot).
test("16.21 Marquee-Auswahl", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placeResistor(page, 400, 300);
  await placeResistor(page, 600, 300);
  await page.keyboard.press("Escape");
  const a = await worldToPage(page, 350, 250);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  const b = await worldToPage(page, 650, 350);
  await page.mouse.move(b.x, b.y, { steps: 12 });
  await attachShot(page, testInfo, "marquee.png");
  await page.mouse.up();
  await expect.poll(() => msEval<number>(page, `(s) => s.selection.length`)).toBe(2);
  expectNoErrors(errors);
});

// 16.22: Leerer Plan ohne Onboarding-Karte (kein Hinweis-Design).
test("16.22 Leerer Plan ohne Onboarding-Karte", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await expect(canvasEl(page)).toBeVisible();
  await expect(page.getByText("Leere Leinwand")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expectNoErrors(errors);
});

// 16.23: Kurzbefehl-Übersicht (? öffnet, Esc schließt).
test("16.23 Kurzbefehl-Übersicht", async ({ page }) => {
  const errors = await gotoApp(page);
  await page.keyboard.press("?");
  const dlg = page.getByRole("dialog", { name: "Kurzbefehle" });
  await expect(dlg).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  expectNoErrors(errors);
});
