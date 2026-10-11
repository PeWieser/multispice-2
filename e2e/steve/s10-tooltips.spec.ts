import { expect, test } from "@playwright/test";
import { act, expectNoErrors, gotoApp, menuOpen, msEval, placePartUI } from "../helpers";
import { attachJson, tooltipText } from "./helpers";

// S10.7a: Menüleisten-Knöpfe zeigen Tooltip mit Name (+ Kürzel).
test("S10.7a Toolbar-Tooltips (Menüleiste)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument"); // Boot-Beispiel raus (F04-Muster)
  // Beide Undo-Richtungen enablen (Hover auf disabled ist unsicher).
  await placePartUI(page, "mosfet", "N-Kanal MOSFET (allg.)", 400, 300);
  await placePartUI(page, "mosfet", "N-Kanal MOSFET (allg.)", 520, 300);
  await page.keyboard.press("Escape"); // Bibliothek zu
  await page.keyboard.press("ControlOrMeta+z");
  await expect.poll(() => msEval<number>(page, `(s) => s.doc.instances.length`)).toBe(1);
  await expect(page.getByRole("button", { name: "Rückgängig", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Wiederholen", exact: true })).toBeEnabled();
  for (const name of ["Rückgängig", "Wiederholen", "Start", "Stoppen", "Einstellungen"]) {
    const text = await tooltipText(page, page.getByRole("button", { name, exact: true }));
    expect(text, `Tooltip ${name}`).toContain(name);
  }
  expectNoErrors(errors);
});

// S10.7b: Zeichenwerkzeuge zeigen Tooltip mit Name + Erklärung.
test("S10.7b ToolButton-Tooltips (Zeichenwerkzeuge)", async ({ page }) => {
  const errors = await gotoApp(page);
  const bar = page.getByRole("toolbar", { name: "Zeichenwerkzeuge" });
  const cases: Array<[string, string]> = [
    ["Auswahl", "wählen"],
    ["Stift", "Netz zeichnen"],
    ["Radiergummi", "Löschen"],
    ["Knotenpunkt", "Knoten"],
    ["Netzname", "Netznamen"],
    ["Notiz", "Notiz"],
  ];
  for (const [label, snippet] of cases) {
    const text = await tooltipText(page, bar.getByRole("button", { name: label, exact: true }));
    expect(text, `Tooltip ${label}`).toContain(label);
    expect(text, `Erklärung ${label}`).toContain(snippet);
  }
  expectNoErrors(errors);
});

// S10.1–10.6: Menüstruktur + Kürzel-Hinweise stehen; Erklär-Tooltips pro Item
// existieren im Code nicht (Lücke, siehe Coverage) — hier Struktur + Statistik.
test("S10.1-6 Menüs: Struktur + Kürzel", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  const stats: Array<{ menu: string; items: number; withHint: number; withTooltip: number }> = [];
  for (const menu of ["Datei", "Bearbeiten", "Ansicht", "Vorlagen", "Analysen", "Geräte", "Hilfe"]) {
    await menuOpen(page, menu);
    const counts = await page.evaluate((label: string) => {
      const menus = Array.from(document.querySelectorAll('[role="menu"]'));
      const m = menus.find((el) => el.getAttribute("aria-label") === label) ?? null;
      if (!m) return null;
      const items = Array.from(m.querySelectorAll('[role="menuitem"],[role="menuitemcheckbox"]'));
      return {
        items: items.length,
        withHint: items.filter((i) => i.querySelector(".mono")).length,
        withTooltip: items.filter((i) => i.querySelector("span.z-popover")).length,
      };
    }, menu);
    if (!counts) throw new Error(`Menü ${menu} nicht gefunden`);
    stats.push({ menu, ...counts });
    expect(counts.items, `Einträge ${menu}`).toBeGreaterThan(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu", { name: menu })).toBeHidden();
  }
  // Spot: Speichern zeigt sein Kürzel.
  await menuOpen(page, "Datei");
  const save = page.getByRole("menu", { name: "Datei" }).getByRole("menuitem").filter({ hasText: "Speichern" }).first();
  await expect(save.locator(".mono")).toBeVisible();
  await page.keyboard.press("Escape");
  await attachJson(testInfo, "menu-stats.json", stats);
  expectNoErrors(errors);
});
