import { expect, test } from "@playwright/test";
import { act, expectNoErrors, gotoApp, msEval, openLibrary, placePartUI } from "../helpers";
import { attachShot } from "./helpers";

// S2.1: Öffnen via Strg+K, floating Palette, Esc schließt.
test("S2.1 Bibliothek öffnen (Strg+K, floating, Esc)", async ({ page }) => {
  const errors = await gotoApp(page);
  await page.keyboard.press("ControlOrMeta+k");
  const search = page.locator("#lib-search");
  await expect(search).toBeVisible();
  await expect(page.getByTitle("Ziehen bewegt das Fenster")).toBeVisible();
  await expect(page.getByText("Bibliothek", { exact: true }).first()).toBeVisible();
  const pos = await search.evaluate((el) => {
    let p: HTMLElement | null = el.parentElement;
    while (p && getComputedStyle(p).position !== "fixed") p = p.parentElement;
    return p ? "fixed" : "none";
  });
  expect(pos).toBe("fixed");
  await page.keyboard.press("Escape");
  await expect(search).toBeHidden();
  expectNoErrors(errors);
});

// S2.2: Schnellsuche "r 10k" (Treffer + Wert-Banner im Detail).
test("S2.2 Schnellsuche 'r 10k'", async ({ page }) => {
  const errors = await gotoApp(page);
  await openLibrary(page);
  const search = page.locator("#lib-search");
  await search.fill("r 10k");
  await expect(page.getByText(/Treffer für/)).toBeVisible();
  await page.getByText("Widerstand", { exact: true }).first().click();
  await expect(page.getByText(/wird als .* platziert/)).toBeVisible();
  expectNoErrors(errors);
});

// S2.3: Suche "555" (NE555-Karte). S2.10: Icons nur visuell (Screenshot).
test("S2.3 Suche '555' (NE555-Karte)", async ({ page }, testInfo) => {
  const errors = await gotoApp(page);
  await openLibrary(page);
  await page.locator("#lib-search").fill("555");
  await expect(page.getByText("NE555 Timer", { exact: true }).first()).toBeVisible();
  await attachShot(page, testInfo, "library.png");
  expectNoErrors(errors);
});

// S2.4: Kategorie filtern (Passive Bauteile: R da, NE555 weg).
test("S2.4 Kategorie filtern", async ({ page }) => {
  const errors = await gotoApp(page);
  await openLibrary(page);
  await page.getByRole("button", { name: /Passive Bauteile/ }).click();
  await expect(page.getByText("Widerstand", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("NE555 Timer", { exact: true })).toBeHidden();
  expectNoErrors(errors);
});

// S2.5: Detail-Panel (Name, Parameter, Platzieren-Button).
test("S2.5 Detail-Panel", async ({ page }) => {
  const errors = await gotoApp(page);
  await openLibrary(page);
  await page.locator("#lib-search").fill("555");
  await page.getByText("NE555 Timer", { exact: true }).first().click();
  await expect(page.getByRole("button", { name: /platzieren \(Enter\)/i })).toBeVisible();
  await expect(page.getByText("Parameter", { exact: true })).toBeVisible();
  await expect(page.getByText("Versorgungsspannung")).toBeVisible();
  expectNoErrors(errors);
});

// S2.6: Datenblatt-Links (gültige URLs, neuer Tab).
test("S2.6 Datenblatt-Links", async ({ page }) => {
  const errors = await gotoApp(page);
  await openLibrary(page);
  await page.locator("#lib-search").fill("555");
  await page.getByText("NE555 Timer", { exact: true }).first().click();
  const all = page.getByRole("link", { name: "AllDatasheet" });
  await expect(all).toBeVisible();
  const href = await all.getAttribute("href");
  expect(href).toMatch(/^https?:\/\//);
  if (!href) throw new Error("Datenblatt-Link ohne Ziel");
  expect(await all.getAttribute("target")).toBe("_blank");
  const oct = page.getByRole("link", { name: "Octopart" });
  expect(await oct.getAttribute("href")).toMatch(/^https?:\/\//);
  // Den ausgehenden Link wirklich anklicken, ohne die Verfügbarkeit einer
  // externen Webseite oder den Internetzugang des Test-Runners vorauszusetzen.
  await page.context().route((url) => url.href === href, (route) =>
    route.fulfill({ status: 200, contentType: "text/html", body: "Datenblatt" }),
  );
  const [popup] = await Promise.all([page.waitForEvent("popup"), all.click()]);
  await expect(popup).toHaveURL(href);
  await popup.close();
  expectNoErrors(errors);
});

// S2.7: Favorit (Stern toggelt, Persistenz). Toast fehlt (Matrix 🔄) – Doku.
test("S2.7 Favorit (Stern + Persistenz)", async ({ page }) => {
  const errors = await gotoApp(page);
  await openLibrary(page);
  await page.locator("#lib-search").fill("555");
  await page.getByTitle("Favorit hinzufügen").first().click();
  await expect(page.getByTitle("Favorit entfernen").first()).toBeVisible();
  await expect.poll(() => msEval<string[]>(page, `(s) => s.favorites`)).toContain("ne555");
  const stored = await page.evaluate(() => localStorage.getItem("multispice.favorites"));
  expect(JSON.parse(stored as string)).toContain("ne555");
  expectNoErrors(errors);
});

// S2.8: Zuletzt (platziertes Teil erscheint in Recent).
test("S2.8 Zuletzt (Recent nach Platzieren)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await placePartUI(page, "mosfet", "N-Kanal MOSFET (allg.)", 400, 300);
  await page.keyboard.press("Escape");
  await openLibrary(page);
  await page.getByRole("button", { name: /Zuletzt/ }).click();
  await expect(page.getByText("N-Kanal MOSFET (allg.)", { exact: true }).first()).toBeVisible();
  expectNoErrors(errors);
});

// S2.11: Tastatur-Navigation (Pfeile + Enter platziert).
test("S2.11 Tastatur-Navigation (Pfeile + Enter)", async ({ page }) => {
  const errors = await gotoApp(page);
  await act(page, "newDocument");
  await openLibrary(page);
  await page.locator("#lib-search").fill("r");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect.poll(() => msEval<string | null>(page, `(s) => s.placingPartId`)).not.toBe(null);
  await expect(page.locator("#lib-search")).toBeHidden();
  expectNoErrors(errors);
});
