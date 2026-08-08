import { expect, test } from "@playwright/test";

/**
 * Above-the-fold content must be visible without scrolling, with or without
 * JavaScript.
 *
 * Every marketing reveal renders at `opacity: 0` and is animated in by Framer
 * Motion. That is fine while scripting works. With scripting off — or when the
 * motion chunk fails to load, or hydration throws — nothing ever removes the
 * inline `opacity:0`, and the server HTML that Google and every simple crawler
 * reads describes a headline, two CTAs and a pricing table that are all
 * invisible.
 *
 * Measured before the fix on a production build: `/` hid its H1 and both
 * hero CTAs, `/pricing` hid all four plan CTAs, `/features` hid the whole
 * top row of cards. The `<noscript>` rule in the root layout plus the
 * `data-reveal` marker on every opacity-from-zero primitive is what closes it.
 *
 * The subtle part, and the reason this file exists rather than a one-off
 * script: `getComputedStyle(el).opacity` on an `<h1>` inside an `opacity: 0`
 * wrapper returns **"1"**. A check written the obvious way passes on a
 * completely invisible page. `effectiveOpacity` multiplies up the ancestor
 * chain instead, which is what actually decides whether a human sees it.
 */

const PAGES = ["/", "/pricing", "/features"];

/**
 * Runs in the browser. Returns above-the-fold elements whose *effective*
 * opacity — the product of every ancestor's — is below 0.9.
 *
 * Passed to `page.evaluate` as a function, not a string: Playwright evaluates
 * a string as an *expression*, so `"() => {…}"` yields a function object that
 * serialises to `undefined` and every assertion below throws on it.
 */
function auditAboveTheFold() {
  const effectiveOpacity = (el: Element) => {
    let value = 1;
    for (
      let node: Element | null = el;
      node && node !== document.documentElement;
      node = node.parentElement
    ) {
      value *= Number.parseFloat(getComputedStyle(node).opacity || "1");
    }
    return value;
  };

  // Only the *first screen*, not "anything whose top edge is one pixel
  // inside the viewport". An element just peeking in at the bottom edge is
  // supposed to animate as the visitor scrolls to it — flagging those would
  // make the threshold a function of the window height rather than of
  // whether a human can read the page.
  const foldLine = window.innerHeight * 0.8;

  const hidden: string[] = [];
  let examined = 0;
  document.querySelectorAll("h1, h2, [data-reveal], a[href]").forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.top > foldLine) return;
    if (rect.height === 0 && rect.width === 0) return;
    examined += 1;
    if (effectiveOpacity(el) < 0.9) {
      hidden.push(`${el.tagName} :: ${(el.textContent || "").trim().slice(0, 45)}`);
    }
  });
  return { examined, hidden };
}

test.describe("above-the-fold visibility", () => {
  for (const path of PAGES) {
    test(`${path} paints its first screen with JavaScript enabled`, async ({ page }) => {
      await page.goto(path, { waitUntil: "networkidle" });
      // Deliberately no scrolling anywhere in this file: the bug is precisely
      // that content only appears once you scroll.
      await page.waitForTimeout(1500);

      const result = await page.evaluate(auditAboveTheFold);
      // Guards against the check silently becoming vacuous if a page fails to
      // render — "nothing hidden" and "nothing there" must not look alike.
      expect(result.examined, `${path} rendered no above-fold content`).toBeGreaterThan(5);
      expect(result.hidden, `${path} hid above-fold content`).toEqual([]);
    });
  }
});

test.describe("above-the-fold visibility without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  for (const path of PAGES) {
    test(`${path} paints its first screen with JavaScript disabled`, async ({ page }) => {
      await page.goto(path, { waitUntil: "domcontentloaded" });

      const result = await page.evaluate(auditAboveTheFold);
      expect(result.examined, `${path} rendered no above-fold content`).toBeGreaterThan(5);
      expect(result.hidden, `${path} hid above-fold content with scripting off`).toEqual([]);
    });
  }
});

test("the homepage headline is in the server HTML, not only after hydration", async ({ request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain("The modern operating system for tour operators.");
});
