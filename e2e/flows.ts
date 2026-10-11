import { expect, type Page } from "@playwright/test";

/** Bauteile-Editor-Shell (Overlay) — Strip-Klicks immer hier hinein scopen,
 *  da die Hauptleiste dahinter weiter gemountet ist (strikte Locator-Eindeutigkeit). */
export function editorShell(page: Page) {
  return page.getByRole("dialog", { name: "Bauteile-Editor" });
}
import {
  menuClick, msEval, openBottomTab, parseDe, expectNear,
  centerViewOn, clickWorld, pinWorld, worldToPage, closeInlineEditor,
} from "./helpers";

/** Leitung per Maus von Welt-Punkt zu Welt-Punkt ziehen. */
export async function dragWire(page: Page, x1: number, y1: number, x2: number, y2: number): Promise<void> {
  const before = await msEval<number>(page, `(s) => s.doc.wires.length`);
  await page.keyboard.press("w");
  const a = await worldToPage(page, x1, y1);
  const b = await worldToPage(page, x2, y2);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 15 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.wires.length`)).toBe(before + 1);
}

/**
 * Minimal-Makro bauen (Port – R 1k – Port), speichern, schließen.
 * Gibt die Spec-ID zurück.
 */
export async function buildResistorMacro(page: Page, name: string): Promise<string> {
  await menuClick(page, "Datei", "Bauteile-Editor …");
  await expect(page.getByRole("button", { name: "Schaltung", exact: true })).toBeVisible();
  await centerViewOn(page, 400, 300);
  const shell = editorShell(page);
  await shell.getByRole("button", { name: "Port: Eingang", exact: true }).click();
  await clickWorld(page, 250, 300);
  await shell.getByRole("button", { name: "Widerstand", exact: true }).click();
  await clickWorld(page, 400, 300);
  await closeInlineEditor(page); // W91 hält ihn sonst offen → schluckt „w“
  await shell.getByRole("button", { name: "Port: Ausgang", exact: true }).click();
  await clickWorld(page, 550, 300);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(3);
  const ids = await msEval<Record<string, string>>(page, `(s) => Object.fromEntries(s.doc.instances.map((i) => [i.partId, i.id]))`);
  const pIn = await pinWorld(page, ids["port_in"], 0);
  const rL = await pinWorld(page, ids["resistor"], 0);
  const rR = await pinWorld(page, ids["resistor"], 1);
  const pOut = await pinWorld(page, ids["port_out"], 0);
  await dragWire(page, pIn.x, pIn.y, rL.x, rL.y);
  await dragWire(page, rR.x, rR.y, pOut.x, pOut.y);
  // Prüfung muss „Bereit“ melden (Defaults IN1/OUT1 sind eindeutig).
  await expect(shell.getByRole("button", { name: /Bereit/ })).toBeVisible();
  await shell.getByLabel("Name", { exact: true }).fill(name);
  // Tool-Escapes können die Schließen-Rückfrage (mit eigenem „Speichern“) geöffnet haben → erst wegklicken.
  const abortBtn = shell.getByRole("button", { name: "Abbrechen", exact: true });
  if ((await abortBtn.count()) > 0) await abortBtn.click();
  await shell.getByRole("button", { name: "Speichern", exact: true }).click();
  // „Speichern“ führt fort (schließt nicht) → explizit schließen (dirty=false → ohne Rückfrage).
  await shell.getByRole("button", { name: "Editor schließen", exact: true }).click();
  // Editor schließt, Teil ist in der Bibliothek.
  await expect(page.getByRole("button", { name: "Schaltung", exact: true })).toBeHidden();
  const specId = await msEval<string>(page, `(s, ms) => Object.values(ms.partMap).find((p) => p.name === ${JSON.stringify(name)})?.id ?? ""`);
  expect(specId).toMatch(/^custom_/);
  return specId;
}

/** Spannungsteiler per Assistent bauen (Defaults: 5 V, 10k/10k → OUT = 2,5 V). */
export async function wizardDivider(page: Page): Promise<void> {
  await menuClick(page, "Vorlagen", "Schaltungs-Assistenten …");
  const dlg = page.getByRole("dialog", { name: "Schaltungs-Assistent" });
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Schaltung erzeugen" }).click();
  await expect(dlg).toBeHidden();
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(5);
}

/** V-Sonde auf Weltkoordinate setzen; gibt Sonden-ID zurück. */
export async function placeVoltageProbe(page: Page, x: number, y: number): Promise<string> {
  const before = await msEval<string[]>(page, `(s) => s.doc.probes.map((p) => p.id)`);
  await page.locator('button[title="Spannungs-Probe (V)"]').click();
  const box = await page.locator('canvas[aria-label^="Schaltplan:"]').boundingBox();
  if (!box) throw new Error("Canvas nicht vermessen");
  const view = await msEval<{ x: number; y: number; zoom: number }>(page, `(s) => s.view`);
  await page.mouse.click(box.x + (x - view.x) * view.zoom, box.y + (y - view.y) * view.zoom);
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.probes.length`)).toBe(before.length + 1);
  const after = await msEval<string[]>(page, `(s) => s.doc.probes.map((p) => p.id)`);
  return after.find((id) => !before.includes(id)) as string;
}

/** Vdc der ersten Sonden-Zeile aus der Tabelle lesen (wartet auf Messwert). */
export async function readProbeVdc(page: Page): Promise<number> {
  await openBottomTab(page, "Sonden");
  const cell = page.locator("table.w-full tbody tr").first().locator("td").nth(4);
  await expect.poll(async () => cell.textContent()).not.toBe("");
  return parseDe((await cell.textContent()) ?? "");
}

/** Auf Vdc ≈ erwartet warten (Live-Sim braucht einen Moment). */
export async function expectProbeVdc(page: Page, expected: number, tol: number): Promise<void> {
  await openBottomTab(page, "Sonden");
  const cell = page.locator("table.w-full tbody tr").first().locator("td").nth(4);
  await expect
    .poll(async () => parseDe((await cell.textContent()) ?? ""), { timeout: 20_000 })
    .toBeGreaterThan(expected - tol);
  const v = parseDe((await cell.textContent()) ?? "");
  expectNear(v, expected, tol);
}
