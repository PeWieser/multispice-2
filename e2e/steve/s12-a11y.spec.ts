import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  act,
  expectNoErrors,
  gotoApp,
  menuOpen,
  msEval,
  openBottomTab,
  placePartUI,
  startButton,
  startSimUI,
  stopSimUI,
} from "../helpers";
import { placeVoltageProbe, wizardDivider } from "../flows";
import {
  activeLabel,
  attachJson,
  attachShot,
  contrastRatio,
  elementColors,
  focusStops,
  parseRgb,
  unnamedControls,
} from "./helpers";

async function gotoThemed(page: Page, scheme: "dark" | "light"): Promise<string[]> {
  await page.emulateMedia({ colorScheme: scheme });
  return gotoApp(page);
}

// S12.1: Text- und Muted-Kontrast ≥ 4.5:1 (AA) in beiden Themes.
test("S12.1 Kontrast AA (hell + dunkel)", async ({ page }, testInfo) => {
  const ratios: Record<string, number> = {};
  for (const scheme of ["dark", "light"] as const) {
    const errors = await gotoThemed(page, scheme);
    await menuOpen(page, "Vorlagen"); // Muted-Sample (Sektions-Header) einblenden
    const body = await elementColors(page, "body");
    const muted = await elementColors(page, ".text-ink-3");
    ratios[`${scheme}/text`] = contrastRatio(parseRgb(body.fg), parseRgb(body.bg));
    ratios[`${scheme}/muted`] = contrastRatio(parseRgb(muted.fg), parseRgb(muted.bg));
    expect(ratios[`${scheme}/text`], `Text ${scheme}`).toBeGreaterThanOrEqual(4.5);
    expect(ratios[`${scheme}/muted`], `Muted ${scheme}`).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press("Escape");
    expectNoErrors(errors);
  }
  await attachJson(testInfo, "kontrast.json", ratios);
});

// S12.2: Primäre Touch-Targets ≥ 24px (WCAG 2.2); Voll-Audit als Anhang.
test("S12.2 Touch-Targets Desktop (≥24px)", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await openBottomTab(page, "Konsole"); // Tab-Leiste einblenden
  const samples: Array<[string, Locator]> = [];
  for (const m of ["Datei", "Bearbeiten", "Ansicht", "Vorlagen", "Analysen", "Geräte", "Hilfe"]) {
    samples.push([`Menü ${m}`, page.getByRole("button", { name: m, exact: true })]);
  }
  for (const b of ["Rückgängig", "Wiederholen", "Start", "Stoppen", "Einstellungen"]) {
    samples.push([`Toolbar ${b}`, page.getByRole("button", { name: b, exact: true })]);
  }
  const tools = page.getByRole("toolbar", { name: "Zeichenwerkzeuge" });
  for (const t of ["Auswahl", "Stift", "Radiergummi", "Knotenpunkt", "Netzname", "Notiz"]) {
    samples.push([`Werkzeug ${t}`, tools.getByRole("button", { name: t, exact: true })]);
  }
  for (const t of ["Konsole", "Ergebnisse", "SPICE-Netzliste", "Prüfung", "Sonden", "Stückliste"]) {
    samples.push([`Tab ${t}`, page.getByRole("button", { name: t, exact: true })]);
  }
  const sizes: Record<string, { w: number; h: number; n: number }> = {};
  for (const [name, loc] of samples) {
    // Alle Treffer messen (Zwillinge wie Toast-Buttons nicht übersehen).
    const hits = await loc.evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        const cs = getComputedStyle(e);
        return { w: r.width, h: r.height, cls: ((e as HTMLElement).className || "").toString().slice(0, 70), hCss: cs.height, minh: cs.minHeight };
      }),
    );
    const vis = hits.filter((b) => b.w > 0 && b.h > 0);
    expect(vis.length, `${name}: sichtbare Treffer`).toBeGreaterThan(0);
    for (const b of vis) {
      expect(Math.min(b.w, b.h), `${name} [${b.cls}] ${Math.round(b.w)}x${Math.round(b.h)}`).toBeGreaterThanOrEqual(24);
    }
    sizes[name] = { w: Math.round(vis[0].w), h: Math.round(vis[0].h), n: vis.length };
  }
  const audit = await page.evaluate(() =>
    Array.from(document.querySelectorAll("button"))
      .filter((b) => b.getClientRects().length > 0)
      .map((b) => {
        const r = b.getBoundingClientRect();
        const raw = b.getAttribute("aria-label") ?? b.textContent ?? "";
        return { name: raw.trim().slice(0, 40).replace(/\s+/g, " "), w: Math.round(r.width), h: Math.round(r.height) };
      }),
  );
  await attachJson(testInfo, "targets.json", { samples: sizes, alleButtons: audit });
  expectNoErrors(errors);
});

// S12.3: Alle sichtbaren Buttons/Inputs haben einen zugänglichen Namen.
test("S12.3 ARIA-Namen vollständig", async ({ page }) => {
  const errors = await gotoApp(page);
  await openBottomTab(page, "Konsole");
  const missing = await unnamedControls(page);
  expect(missing.buttons, "Buttons ohne Name").toEqual([]);
  expect(missing.inputs, "Inputs ohne Label").toEqual([]);
  expectNoErrors(errors);
});

// S12.4a: Tab-Reihenfolge läuft ohne Fallen vor und zurück.
test("S12.4a Tab-Reihenfolge ohne Fallen", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  const stops = await focusStops(page, 12);
  expect(stops).toHaveLength(12);
  for (const s of stops) {
    expect(s.visible, `sichtbar ${s.tag} ${s.name}`).toBe(true);
    expect(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "CANVAS"].includes(s.tag) || s.role !== "").toBe(true);
  }
  for (let i = 1; i < stops.length; i++) {
    expect(`${stops[i].tag}#${stops[i].name}`, "Fokus läuft weiter").not.toBe(`${stops[i - 1].tag}#${stops[i - 1].name}`);
  }
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Shift+Tab");
  expect(await activeLabel(page)).toBe(`${stops[9].tag}#${stops[9].name}`);
  await attachJson(testInfo, "tabstops.json", stops);
  expectNoErrors(errors);
});

// S12.4b: Enter aktiviert, Esc schließt Menü und Dialog.
test("S12.4b Enter aktiviert, Esc schließt", async ({ page }) => {
  const errors = await gotoApp(page);
  await startButton(page).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => msEval<boolean>(page, `(s) => s.sim.running`)).toBe(true);
  await stopSimUI(page);
  await menuOpen(page, "Datei");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu", { name: "Datei" })).toBeHidden();
  await page.getByRole("button", { name: "Einstellungen", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  expectNoErrors(errors);
});

// S12.4c: Kürzel Wire, Löschen, Undo/Redo.
test("S12.4c Kürzel: Wire, Löschen, Undo/Redo", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument"); // Boot-Beispiel raus (F04-Muster)
  await page.keyboard.press("w");
  await expect.poll(() => msEval<string>(page, `(s) => s.tool`)).toBe("wire");
  await page.keyboard.press("Escape");
  await expect.poll(() => msEval<string>(page, `(s) => s.tool`)).toBe("select");
  await placePartUI(page, "mosfet", "N-Kanal MOSFET (allg.)", 400, 300);
  await page.keyboard.press("Escape"); // Bibliothek zu (+ Abwahl)
  await page.keyboard.press("ControlOrMeta+a");
  await expect.poll(() => msEval<number>(page, `(s) => s.selection.length`)).toBe(1);
  await page.keyboard.press("Delete");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(0);
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(1);
  await page.keyboard.press("ControlOrMeta+y");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(0);
  expectNoErrors(errors);
});

// S12.5+S12.9: Log-Rolle live + Sonden-Tabelle (Caption, Scope, Typ als Text).
test("S12.5+S12.9 Log-Rolle + Sonden-Tabelle", async ({ page }) => {
  const errors = await gotoApp(page);
  await openBottomTab(page, "Konsole");
  const log = page.getByRole("log");
  await expect(log).toBeVisible();
  await expect(log).toHaveAttribute("aria-live", "polite");
  await wizardDivider(page);
  await placeVoltageProbe(page, 360, 300);
  await openBottomTab(page, "Sonden");
  const table = page.locator("table.w-full");
  await expect(table).toBeVisible();
  await expect(page.locator("table.sr-only caption")).toBeAttached();
  await expect(page.locator("table.sr-only caption")).toContainText("Messwerte");
  const scopes = await table.locator("thead th").evaluateAll((ths) => ths.map((th) => th.getAttribute("scope")));
  expect(scopes.length).toBeGreaterThan(0);
  expect(scopes.every((s) => s === "col")).toBe(true);
  const firstRow = table.locator("tbody tr").first();
  await expect(firstRow).toContainText("OUT");
  await expect(firstRow.locator("td").nth(1)).toContainText("voltage");
  expectNoErrors(errors);
});

// S12.6: Reduced Motion stoppt CSS-Animationen; App bleibt bedienbar.
test("S12.6 Reduced Motion (CSS still)", async ({ browser }, testInfo) => {
  const ctx = await browser.newContext({
    baseURL: "http://127.0.0.1:3100",
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  try {
    const errors = await gotoApp(page);
    const mq = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    expect(mq).toBe(true);
    await startButton(page).hover();
    const tip = page.getByRole("tooltip");
    await expect(tip).toBeVisible({ timeout: 5000 });
    const dur = await tip.evaluate((el) => getComputedStyle(el).animationDuration);
    const secs = dur.split(",").map((d) => (d.trim().endsWith("ms") ? parseFloat(d) / 1000 : parseFloat(d)));
    expect(Math.max(...secs)).toBeLessThan(0.05);
    await page.mouse.move(4, 4);
    await startSimUI(page);
    await stopSimUI(page);
    await attachShot(page, testInfo, "reduced-motion.png");
    expectNoErrors(errors);
  } finally {
    await ctx.close();
  }
});

// S12.7: Zahlen stehen tabellarisch (kein Springen).
test("S12.7 Tabellarische Zahlen", async ({ page }) => {
  const errors = await gotoApp(page);
  await openBottomTab(page, "Konsole");
  const fv = await page.evaluate(() => {
    const el = document.querySelector(".mono");
    return el ? getComputedStyle(el).fontVariantNumeric : "";
  });
  expect(fv).toContain("tabular-nums");
  expectNoErrors(errors);
});

// S12.8: Focus-Ring nur bei Tastatur, nicht bei Maus.
test("S12.8 Focus-Ring nur bei Tastatur", async ({ page }) => {
  const errors = await gotoApp(page);
  await page.keyboard.press("Tab");
  const kb = await page.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null;
    if (!ae) return "?";
    const cs = getComputedStyle(ae);
    return `${cs.outlineWidth}|${cs.outlineStyle}`;
  });
  expect(kb).toBe("2px|solid");
  await startButton(page).click();
  // Stil (nicht Breite) entscheidet: outline:none lässt width=medium („3px“) stehen.
  const mouse = await page.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null;
    if (!ae) return "?";
    return `${ae.tagName}|${getComputedStyle(ae).outlineStyle}`;
  });
  expect(mouse).toBe("BUTTON|none");
  await stopSimUI(page);
  expectNoErrors(errors);
});

// S12.10: 200%-Zoom (CSS) bleibt bedienbar — Tastatur/Store statt Koordinaten-Klicks
// (CSS-Zoom verzerrt Klick-Koordinaten), kein Über-Overflow über den Zoom hinaus.
test("S12.10 200%-Zoom bedienbar (CSS-Zoom)", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await act(page, "loadPreset", "rc-lowpass");
  await page.evaluate(() => {
    document.body.style.zoom = "200%";
  });
  await startButton(page).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => msEval<boolean>(page, `(s) => s.sim.running`)).toBe(true);
  await page.getByRole("button", { name: "Stoppen", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => msEval<boolean>(page, `(s) => s.sim.running`)).toBe(false);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth / window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(2.1);
  await attachShot(page, testInfo, "zoom-200.png");
  expectNoErrors(errors);
});
