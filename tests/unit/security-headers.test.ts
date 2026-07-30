import { describe, expect, it } from "vitest";

import nextConfig from "@/next.config";

/**
 * Phase 12 — the header policy, guarded at the config level.
 *
 * The production smoke test found the application serving no security headers
 * at all. They are now set in `next.config.ts`, and this pins the one property
 * that a future security sweep is most likely to break by accident.
 *
 * `/embed/**` is intentionally iframe-embeddable: it exists to be placed on an
 * operator's own website. Adding a blanket `X-Frame-Options: DENY` or
 * `frame-ancestors 'none'` is exactly the kind of change that looks like an
 * improvement in review and silently breaks every embedded booking widget in
 * production — a failure nobody sees until an operator reports their booking
 * form is blank.
 */

async function headerRules() {
  const rules = await nextConfig.headers?.();
  if (!rules) throw new Error("next.config defines no headers()");
  return rules;
}

function valueOf(headers: { key: string; value: string }[], key: string) {
  return headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;
}

describe("baseline security headers", () => {
  it("are applied to application routes", async () => {
    const appRule = (await headerRules()).find((rule) => !rule.source.startsWith("/embed"));
    expect(appRule, "no rule covers application routes").toBeDefined();

    expect(valueOf(appRule!.headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(valueOf(appRule!.headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(valueOf(appRule!.headers, "Permissions-Policy")).toBeDefined();
  });

  it("are applied to embed routes too", async () => {
    // The embed exemption is about framing only. Dropping the other headers
    // there would leave the most-embedded surface the least protected.
    const embedRule = (await headerRules()).find((rule) => rule.source.startsWith("/embed"));
    expect(embedRule, "no rule covers /embed").toBeDefined();

    expect(valueOf(embedRule!.headers, "X-Content-Type-Options")).toBe("nosniff");
    expect(valueOf(embedRule!.headers, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("do not set HSTS from the application", async () => {
    // HSTS is a commitment that outlives the response: once a browser sees it,
    // that host is https-only for the whole max-age. Set from here it would
    // also apply to operators' custom domains, whose TLS this deployment does
    // not control. It belongs on the proxy that terminates TLS.
    for (const rule of await headerRules()) {
      expect(valueOf(rule.headers, "Strict-Transport-Security")).toBeUndefined();
    }
  });
});

describe("embed routes stay iframe-embeddable", () => {
  it("carry no X-Frame-Options", async () => {
    const embedRule = (await headerRules()).find((rule) => rule.source.startsWith("/embed"));
    expect(valueOf(embedRule!.headers, "X-Frame-Options")).toBeUndefined();
  });

  it("carry no frame-ancestors restriction", async () => {
    const embedRule = (await headerRules()).find((rule) => rule.source.startsWith("/embed"));
    const csp = valueOf(embedRule!.headers, "Content-Security-Policy") ?? "";
    expect(csp).not.toMatch(/frame-ancestors\s+'none'/i);
    expect(csp).not.toMatch(/frame-ancestors\s+'self'\s*;?\s*$/i);
  });

  it("are excluded from the application rule that does restrict framing", async () => {
    // The app rule sets SAMEORIGIN. Its source must genuinely exclude /embed,
    // or the exemption above is decorative — both rules would apply and the
    // restrictive one would win.
    const appRule = (await headerRules()).find((rule) => !rule.source.startsWith("/embed"));
    expect(valueOf(appRule!.headers, "X-Frame-Options")).toBe("SAMEORIGIN");
    expect(appRule!.source).toContain("embed");

    // Compiled the way Next does, the app rule must not match an embed path.
    const pattern = new RegExp(`^(?:/((?!embed).*))(?:/)?$`);
    expect(pattern.test("/embed/acme/tour")).toBe(false);
    expect(pattern.test("/dashboard")).toBe(true);
    expect(pattern.test("/book/acme")).toBe(true);
  });
});
