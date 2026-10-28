import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";

/* Steve-Matrix-Helfer (TEST_MATRIX.md): Kontrast, Fokus, ARIA, Tooltips, Anhänge. */

export type Rgb = { r: number; g: number; b: number };

export function parseRgb(css: string): Rgb {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) throw new Error(`kein rgb(): ${css}`);
  const parts = m[1].split(",").map((v) => Number(v.trim()));
  return { r: parts[0], g: parts[1], b: parts[2] };
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function luminance(c: Rgb): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG-Kontrast zweier Farben (1–21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
}

/** Vorder-/Hintergrund eines Elements (Hintergrund = erste deckende Ebene nach oben). */
export async function elementColors(page: Page, selector: string): Promise<{ fg: string; bg: string }> {
  return page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`fehlt: ${sel}`);
    const fg = getComputedStyle(el).color;
    let bg = "rgb(255, 255, 255)";
    let cur: Element | null = el;
    while (cur) {
      const c = getComputedStyle(cur).backgroundColor;
      if (c !== "rgba(0, 0, 0, 0)" && c !== "transparent") {
        bg = c;
        break;
      }
      cur = cur.parentElement;
    }
    return { fg, bg };
  }, selector);
}

export type FocusStop = { tag: string; role: string; name: string; visible: boolean };

/** Aktives Element als „TAG#Name“ (Tab-Vergleiche). */
export async function activeLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    const ae = document.activeElement as HTMLElement | null;
    const raw = ae?.getAttribute("aria-label") ?? ae?.innerText ?? "";
    return `${ae?.tagName}#${raw.trim().slice(0, 50).replace(/\s+/g, " ")}`;
  });
}

/** Tab-Reihenfolge aufzeichnen (n Stopps ab aktuellem Fokus). */
export async function focusStops(page: Page, n: number): Promise<FocusStop[]> {
  const stops: FocusStop[] = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    stops.push(
      await page.evaluate(() => {
        const ae = document.activeElement as HTMLElement | null;
        const raw = ae?.getAttribute("aria-label") ?? ae?.innerText ?? "";
        return {
          tag: ae ? ae.tagName : "?",
          role: ae?.getAttribute("role") ?? "",
          name: raw.trim().slice(0, 50).replace(/\s+/g, " "),
          visible: !!ae && ae.getClientRects().length > 0,
        };
      }),
    );
  }
  return stops;
}

/** Sichtbare Buttons/Inputs ohne zugänglichen Namen (soll leer sein). */
export async function unnamedControls(page: Page): Promise<{ buttons: string[]; inputs: string[] }> {
  return page.evaluate(() => {
    const vis = (el: Element): boolean => el.getClientRects().length > 0;
    const buttons: string[] = [];
    document.querySelectorAll("button").forEach((b) => {
      if (!vis(b)) return;
      const name = (b.getAttribute("aria-label") ?? b.textContent ?? "").trim();
      if (!name && !b.getAttribute("aria-labelledby") && !b.title) buttons.push(b.outerHTML.slice(0, 140));
    });
    const inputs: string[] = [];
    document.querySelectorAll("input").forEach((el) => {
      if (!vis(el) || el.getAttribute("type") === "hidden") return;
      const id = el.id;
      const labelled =
        el.getAttribute("aria-label") ||
        el.getAttribute("aria-labelledby") ||
        el.title ||
        (id !== "" && document.querySelector(`label[for="${id}"]`)) ||
        el.closest("label");
      if (!labelled) inputs.push(el.outerHTML.slice(0, 140));
    });
    return { buttons, inputs };
  });
}

/** Hover-Tooltip (role=tooltip, 400 ms Delay) lesen; Maus danach weg. */
export async function tooltipText(page: Page, target: Locator): Promise<string> {
  await target.hover();
  const tip = page.getByRole("tooltip");
  await expect(tip).toBeVisible({ timeout: 5000 });
  const text = (await tip.textContent()) ?? "";
  await page.mouse.move(4, 4);
  await expect(tip).toBeHidden({ timeout: 5000 });
  return text;
}

/** Screenshot als Report-Anhang (Sichtprüfung visueller Matrix-Items). */
export async function attachShot(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, { body: await page.screenshot({ fullPage: false }), contentType: "image/png" });
}

/** JSON als Report-Anhang (Messwerte: Kontraste, Größen, Statistik). */
export async function attachJson(info: TestInfo, name: string, data: unknown): Promise<void> {
  await info.attach(name, { body: Buffer.from(JSON.stringify(data, null, 1), "utf8"), contentType: "application/json" });
}
