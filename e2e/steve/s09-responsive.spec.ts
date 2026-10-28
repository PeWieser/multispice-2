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
    await page.getByRole("button", { name: "Bibliothek", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Bibliothek" });
    await expect(sheet).toBeVisible();
    const inner = sheet.locator("div").nth(1);
    const h = await inner.evaluate((el) => el.getBoundingClientRect().height);
    expect(Math.abs(h - 844 * 0.8)).toBeLessThan(60);
    await expect(sheet.locator("div.h-1.w-8")).toBeVisible();
    expectNoErrors(errors);
  });

  // S9.4: Touch-Targets Mobil (TopBar-Buttons ≥36px; Matrix-44px veraltet).
  test("S9.4 Touch-Targets Mobil (≥36px)", async ({ page }) => {
    const errors = await gotoApp(page);
    const bar = page
      .getByRole("button", { name: "Menü", exact: true })
      .locator("xpath=ancestor::div[contains(@class,'h-[48px]')]");
    const hits = await bar.getByRole("button").evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { w: r.width, h: r.height, n: e.getAttribute("aria-label") ?? "" };
      }),
    );
    expect(hits.length).toBeGreaterThan(0);
    for (const b of hits) {
      expect(Math.min(b.w, b.h), b.n).toBeGreaterThanOrEqual(36);
    }
    expectNoErrors(errors);
  });

  // S9.9: Volle Höhe (100dvh; headless = Viewport-Höhe).
  test("S9.9 Volle Höhe (dvh)", async ({ page }) => {
    const errors = await gotoApp(page);
    const h = await page.evaluate(() => document.body.firstElementChild?.getBoundingClientRect().height ?? 0);
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
