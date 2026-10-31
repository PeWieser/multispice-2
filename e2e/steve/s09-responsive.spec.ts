import { expect, test } from "@playwright/test";
import { canvasApp, expectNoErrors, gotoApp } from "../helpers";
import { attachShot } from "./helpers";

test.describe("S9 Mobil (390×844)", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  // S9.1: MobileTopBar 48px, Hamburger-Drawer, Library-BottomSheet 80vh.
  test("S9.1 Mobile Portrait (TopBar + Drawer + Sheet)", async ({ page }, testInfo) => {
    const errors = await gotoApp(page);
    const bar = page
      .getByRole("button", { name: "Menü", exact: true })
      .locator("xpath=ancestor::div[contains(@class,'h-[48px]')]");
    await expect(bar).toBeVisible();
    const box = await bar.boundingBox();
    expect(box?.height).toBe(48);
    await attachShot(page, testInfo, "mobile.png");
    await page.getByRole("button", { name: "Menü", exact: true }).click();
    await expect(page.getByText("Menü", { exact: true }).first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Menü schließen" })).toBeHidden();
    await page.getByRole("button", { name: "Bibliothek", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Bibliothek" });
    await expect(sheet).toBeVisible();
    const inner = sheet.locator("div").nth(1);
    const h = await inner.evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(h - 844 * 0.8)).toBeLessThan(60);
    await expect(sheet.locator("div.h-1.w-8")).toBeVisible();
    expectNoErrors(errors);
  });

  test("Mobil: Esc schließt zuerst den Dialog und dann das Menü", async ({ page }) => {
    const errors = await gotoApp(page);
    await page.getByRole("button", { name: "Menü", exact: true }).click();
    await page.getByRole("button", { name: "Einstellungen …", exact: true }).click();
    const settings = page.getByRole("dialog", { name: "Einstellungen" });
    await expect(settings).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(settings).toBeHidden();
    await expect(page.getByRole("button", { name: "Menü schließen" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Menü schließen" })).toBeHidden();
    expectNoErrors(errors);
  });

  // S9.4: Touch-Targets Mobil (TopBar-Buttons ≥36px; Matrix-44px veraltet).
  test("S9.4 Touch-Targets Mobil (≥36px)", async ({ page }) => {
    const errors = await gotoApp(page);
    const bar = page
      .getByRole("button", { name: "Menü", exact: true })
      .locator("xpath=ancestor::div[contains(@class,'h-[48px]')]");
    // Auch bei schmalem Viewport und breiter System-Fallbackschrift dürfen
    // Flexbox und Markenname die tatsächlichen Touchflächen nicht verkleinern.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      const hits = await bar.getByRole("button").evaluateAll((els) =>
        els.map((e) => {
          const r = e.getBoundingClientRect();
          return { w: r.width, h: r.height, left: r.left, right: r.right, n: e.getAttribute("aria-label") ?? "" };
        }),
      );
      expect(hits.length).toBeGreaterThan(0);
      for (const b of hits) {
        expect(Math.min(b.w, b.h), `${width}px: ${b.n}`).toBeGreaterThanOrEqual(36);
        expect(b.left, `${width}px: ${b.n} links`).toBeGreaterThanOrEqual(0);
        expect(b.right, `${width}px: ${b.n} rechts`).toBeLessThanOrEqual(width);
      }
    }
    expectNoErrors(errors);
  });

  // S9.9: Volle Höhe (100dvh; headless = Viewport-Höhe).
  test("S9.9 Volle Höhe (dvh)", async ({ page }) => {
    const errors = await gotoApp(page);
    // Next kann vor dem App-Root unsichtbare Metadaten-/Hydration-Knoten einfügen.
    const root = page.locator('div[class~="h-[100dvh]"]');
    await expect(root).toHaveCount(1);
    const h = await root.evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBe(844);
    expectNoErrors(errors);
  });
});

test.describe("S9 Tablet (820×1180)", () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  // S9.3: Tablet = Desktop-ähnlich ohne Hamburger (Inspector-Drawer fehlt – Lücke).
  test("S9.3 Tablet (MenuBar + Canvas, kein Hamburger)", async ({ page }, testInfo) => {
    const errors = await gotoApp(page);
    await expect(page.getByRole("button", { name: "Datei" })).toBeVisible();
    await expect(canvasApp(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Menü", exact: true })).toHaveCount(0);
    await attachShot(page, testInfo, "tablet.png");
    expectNoErrors(errors);
  });
});

test.describe("S9 Landscape (844×390)", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  // S9.2: Landscape rendert (kein Spezial-Layout – Matrix veraltet).
  test("S9.2 Landscape (rendert, kein Spezial-Layout)", async ({ page }, testInfo) => {
    const errors = await gotoApp(page);
    await expect(canvasApp(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Datei" })).toBeVisible();
    await attachShot(page, testInfo, "landscape.png");
    expectNoErrors(errors);
  });
});
