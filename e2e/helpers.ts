import { expect, type Page } from "@playwright/test";

/** Führt `fn(state, ms)` im Browser aus; `ms` = window.__multispice. */
export async function msEval<T>(page: Page, fn: string): Promise<T> {
  return page.evaluate<T>(
    `((${fn}))((window).__multispice.useEditor.getState(), (window).__multispice)`,
  );
}

/** Ruft eine Store-Action im Browser auf, z. B. act(page, "loadPreset", "rc-tiefpass"). */
export async function act(page: Page, action: string, ...args: unknown[]): Promise<void> {
  await page.evaluate(
    `(() => { const ms = (window).__multispice; ms.useEditor.getState()[${JSON.stringify(action)}](...${JSON.stringify(args)}); })()`,
  );
}

/** App öffnen + auf Canvas warten; sammelt Console-/Page-Errors. */
export async function gotoApp(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 300)}`);
  });
  await page.goto("/");
  await expect(canvasApp(page)).toBeVisible();
  await expectHook(page);
  return errors;
}

export async function expectHook(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => typeof (window as unknown as { __multispice?: unknown }).__multispice))
    .toBe("object");
}

export function expectNoErrors(errors: string[]): void {
  expect(errors.filter((e) => !/favicon|manifest|apple-touch-icon/i.test(e))).toEqual([]);
}

/* ---------- Selektoren ---------- */

/** Canvas-Rahmen (role=application, stabiler Name). */
export function canvasApp(page: Page) {
  return page.getByRole("application", { name: /Schaltplan Canvas/ });
}

/** Das <canvas>-Element mit der Schaltungs-Zusammenfassung im aria-label. */
export function canvasEl(page: Page) {
  return page.locator('canvas[aria-label^="Schaltplan:"]');
}

/** „2× Widerstand, 5 Netze, ERC still“ o. ä. */
export async function expectSummary(page: Page, re: RegExp): Promise<void> {
  await expect(canvasEl(page)).toHaveAttribute("aria-label", re);
}

export async function menuOpen(page: Page, label: string): Promise<void> {
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(page.getByRole("menu", { name: label })).toBeVisible();
}

export async function menuClick(page: Page, menu: string, item: string | RegExp): Promise<void> {
  await menuOpen(page, menu);
  const plain = page.getByRole("menuitem", { name: item });
  if ((await plain.count()) === 0) {
    // Toggle-Einträge sind menuitemcheckbox statt menuitem.
    await page.getByRole("menuitemcheckbox", { name: item }).click();
  } else {
    await plain.click();
  }
}

/** Inline-Werteditor (öffnet nach R/C/L/VDC-Platzierung, autoFokussiert) sicher schließen:
 *  auf das Eingabefeld warten, dann Escape *hinein* — die Editor-Shell ignoriert
 *  Input-Escapes (keine Schließen-Rückfrage), ein blinder Escape träfe den Body.
 */
export async function closeInlineEditor(page: Page): Promise<void> {
  const input = page.locator("div.z-floating input");
  await input.waitFor({ state: "visible", timeout: 5000 });
  await input.press("Escape");
  await input.waitFor({ state: "hidden", timeout: 5000 });
}

/** Nativen Speicher-Picker deaktivieren → Export fällt deterministisch auf Download zurück
 *  (showSaveFilePicker hängt sonst vom transient-activation-Timing ab). */
export async function forceDownloadFallback(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as Record<string, unknown>).showSaveFilePicker = undefined;
  });
}

export async function loadPresetUI(page: Page, presetName: string): Promise<void> {
  await menuClick(page, "Vorlagen", presetName);
}

export function startButton(page: Page) {
  return page.locator('[data-spot="start-sim"]:visible').first();
}

export async function startSimUI(page: Page): Promise<void> {
  await startButton(page).click();
  await expect
    .poll(() => msEval<boolean>(page, `(s) => s.sim.running`))
    .toBe(true);
}

export async function stopSimUI(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Stoppen" }).click();
  await expect
    .poll(() => msEval<boolean>(page, `(s) => s.sim.running`))
    .toBe(false);
}

/** Bottom-Panel öffnen + Tab wählen („Konsole“, „Ergebnisse“, „SPICE-Netzliste“, „Prüfung“, „Sonden“, „Stückliste“). */
export async function openBottomTab(page: Page, tab: string): Promise<void> {
  const tabBtn = page.getByRole("button", { name: tab, exact: true });
  // Store-Wahrheit statt Sichtbarkeits-Race (Sim öffnet das Panel automatisch).
  const isOpen = await msEval<boolean>(page, `(s) => s.bottomOpen`);
  if (!isOpen) {
    await menuClick(page, "Ansicht", "Auswertung & Konsole");
  }
  await tabBtn.click();
  await expect(tabBtn).toHaveAttribute("data-active", "true");
}

export function consoleLog(page: Page) {
  return page.getByRole("log");
}

export async function expectLog(page: Page, re: RegExp | string): Promise<void> {
  await openBottomTab(page, "Konsole");
  await expect(consoleLog(page)).toContainText(re);
}

export async function expectToast(page: Page, re: RegExp | string): Promise<void> {
  await expect(page.locator('div.z-toast[role="status"]')).toContainText(re);
}

/* ---------- Canvas-Geometrie ---------- */

export interface View {
  x: number;
  y: number;
  zoom: number;
}

/** Weltkoordinaten → Seitenkoordinaten (exakte Umkehr von toScreen + Canvas-Box). */
export async function worldToPage(page: Page, x: number, y: number): Promise<{ x: number; y: number }> {
  const box = await canvasEl(page).boundingBox();
  if (!box) throw new Error("Canvas nicht vermessen");
  const view = await msEval<View>(page, `(s) => s.view`);
  return { x: box.x + (x - view.x) * view.zoom, y: box.y + (y - view.y) * view.zoom };
}

export async function clickWorld(page: Page, x: number, y: number): Promise<void> {
  const p = await worldToPage(page, x, y);
  await page.mouse.click(p.x, p.y);
}

/** Pin-Weltposition einer Instanz (Pin-Index laut Katalog-Reihenfolge). */
export async function pinWorld(page: Page, instanceId: string, pinIndex: number): Promise<{ x: number; y: number }> {
  return msEval(page, `(s, ms) => ms.pinPosition(s.doc.instances.find((i) => i.id === ${JSON.stringify(instanceId)}), ${pinIndex})`);
}

export async function instanceIds(page: Page): Promise<string[]> {
  return msEval(page, `(s) => s.doc.instances.map((i) => i.id)`);
}

/** Welt-Koordinate in die Canvas-Mitte holen (Zoom 1, Ansicht zentriert). */
export async function centerViewOn(page: Page, x: number, y: number): Promise<void> {
  const box = await canvasEl(page).boundingBox();
  if (!box) throw new Error("Canvas nicht vermessen");
  await page.evaluate(
    `(() => { const ms = (window).__multispice; ms.useEditor.getState().setView({ x: ${x} - ${box.width} / 2, y: ${y} - ${box.height} / 2, zoom: 1 }); })()`,
  );
}

/* ---------- Bibliothek ---------- */

export async function openLibrary(page: Page): Promise<void> {
  const search = page.locator("#lib-search");
  if (await search.isVisible()) return;
  await page.keyboard.press("ControlOrMeta+k");
  await expect(search).toBeVisible();
}

export async function placePartUI(page: Page, query: string, rowName: string | RegExp, atX: number, atY: number): Promise<string> {
  const before = await instanceIds(page);
  await openLibrary(page);
  const search = page.locator("#lib-search");
  await search.fill(query);
  // Zeile wählen (Klick) + Enter = Platzieren (W132), dann Canvas-Klick.
  await page.getByText(rowName, { exact: true }).first().click();
  await page.keyboard.press("Enter");
  // Enter→Platzieren läuft über einen Fenster-Keydown (Race unter Last):
  // auf den Modus warten, notfalls Enter wiederholen (S7-Flake).
  try {
    await expect.poll(() => msEval<string>(page, `(s) => s.tool`), { timeout: 3000 }).toBe("place");
  } catch {
    await page.keyboard.press("Enter");
    await expect.poll(() => msEval<string>(page, `(s) => s.tool`), { timeout: 5000 }).toBe("place");
  }
  await clickWorld(page, atX, atY);
  await expect
    .poll(() => msEval<number>(page, `(s) => s.doc.instances.length`))
    .toBe(before.length + 1);
  const after = await instanceIds(page);
  return after.find((id) => !before.includes(id)) as string;
}

/** Zahl aus Anzeigeformat („6.67 V“, „3.33 mA“, „2,5 V“) parsen. */
export function parseDe(text: string): number {
  const m = text.replace(/\u00a0/g, " ").match(/(-?[\d.,]+(?:e-?\d+)?)\s*([kMGTmunµpfa]?)(V|A|W|Hz|Ω|F|s|dB)?/);
  if (!m) return NaN;
  const raw = m[1].includes(",") ? m[1].replace(/\./g, "").replace(",", ".") : m[1];
  const num = parseFloat(raw);
  const mult =
    m[2] === "k" ? 1e3
    : m[2] === "M" ? 1e6
    : m[2] === "G" ? 1e9
    : m[2] === "T" ? 1e12
    : m[2] === "m" ? 1e-3
    : m[2] === "u" || m[2] === "µ" ? 1e-6
    : m[2] === "n" ? 1e-9
    : m[2] === "p" ? 1e-12
    : m[2] === "f" ? 1e-15
    : 1;
  return num * mult;
}

export function expectNear(actual: number, expected: number, tol: number): void {
  expect(Math.abs(actual - expected) <= tol, `erwartet ~${expected}, war ${actual}`).toBe(true);
}
