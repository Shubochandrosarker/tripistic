import { describe, expect, it } from "vitest";

import {
  SITE_SECTION_TYPES,
  siteSubdomainSchema,
  sitePagePathSchema,
  validatePageContent,
  validateSiteTheme,
  contrastRatio,
} from "@/lib/sites/schema";
import { SITE_TEMPLATES, findSiteTemplate, templatesForBusinessType } from "@/lib/sites/templates";

function page(sections: unknown[]) {
  return { version: 1, sections };
}

describe("site section schema", () => {
  it("exposes every section type in the union", () => {
    expect(SITE_SECTION_TYPES).toContain("hero");
    expect(SITE_SECTION_TYPES).toContain("bookingWidget");
    expect(SITE_SECTION_TYPES).toContain("footer");
    expect(new Set(SITE_SECTION_TYPES).size).toBe(SITE_SECTION_TYPES.length);
  });

  it("accepts a minimal valid page", () => {
    const content = validatePageContent(
      page([{ id: "hero-1", type: "hero", layout: {}, props: { title: "Walk with us" } }]),
    );
    expect(content.sections).toHaveLength(1);
    // Layout defaults are applied so the renderer never sees a partial layout.
    expect(content.sections[0].layout.paddingTop).toBe("lg");
    expect(content.sections[0].layout.visibleOn).toEqual(["desktop", "tablet", "mobile"]);
  });

  it("rejects an unknown section type", () => {
    expect(() =>
      validatePageContent(page([{ id: "x", type: "rawHtml", layout: {}, props: { html: "<b>" } }])),
    ).toThrow();
  });

  it("rejects duplicate section ids", () => {
    expect(() =>
      validatePageContent(
        page([
          { id: "same", type: "hero", layout: {}, props: { title: "One" } },
          { id: "same", type: "cta", layout: {}, props: { title: "Two" } },
        ]),
      ),
    ).toThrow(/Duplicate section id/);
  });

  it("bounds the number of sections on a page", () => {
    const sections = Array.from({ length: 61 }, (_, index) => ({
      id: `hero-${index}`,
      type: "hero",
      layout: {},
      props: { title: "Repeated" },
    }));
    expect(() => validatePageContent(page(sections))).toThrow();
  });

  /**
   * The property the whole schema exists for. Section props feed straight into
   * href/src attributes, so a scheme other than http(s) reaching the renderer
   * is a script-execution path on the operator's own hostname.
   */
  describe("url safety", () => {
    const dangerous = [
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "data:text/html;base64,PHNjcmlwdD4=",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
    ];

    for (const url of dangerous) {
      it(`rejects ${url} in an image src`, () => {
        expect(() =>
          validatePageContent(
            page([
              {
                id: "gallery-1",
                type: "gallery",
                layout: {},
                props: { images: [{ url, alt: "x" }] },
              },
            ]),
          ),
        ).toThrow();
      });

      it(`rejects ${url} in a CTA href`, () => {
        expect(() =>
          validatePageContent(
            page([
              {
                id: "cta-1",
                type: "cta",
                layout: {},
                props: { title: "Go", primaryCta: { label: "Go", href: url } },
              },
            ]),
          ),
        ).toThrow();
      });
    }

    it("accepts an internal path and an https url", () => {
      const content = validatePageContent(
        page([
          {
            id: "cta-1",
            type: "cta",
            layout: {},
            props: {
              title: "Go",
              primaryCta: { label: "Tours", href: "/tours" },
              secondaryCta: { label: "Partner", href: "https://example.com/x" },
            },
          },
        ]),
      );
      expect(content.sections).toHaveLength(1);
    });
  });

  it("requires alt text on images rather than defaulting it away", () => {
    expect(() =>
      validatePageContent(
        page([
          {
            id: "gallery-1",
            type: "gallery",
            layout: {},
            props: { images: [{ url: "https://cdn.example.com/a.jpg" }] },
          },
        ]),
      ),
    ).toThrow();
  });

  it("requires at least one visible breakpoint", () => {
    expect(() =>
      validatePageContent(
        page([{ id: "hero-1", type: "hero", layout: { visibleOn: [] }, props: { title: "Hi" } }]),
      ),
    ).toThrow();
  });
});

describe("page paths", () => {
  it.each([
    ["/", "/"],
    ["tours", "/tours"],
    ["/tours/day-trips", "/tours/day-trips"],
  ])("normalises %s", (input, expected) => {
    expect(sitePagePathSchema.parse(input)).toBe(expected);
  });

  it.each(["/Tours", "/tours/", "/tours//x", "/_tripistic/health", "/api/secret", "/tours?x=1"])(
    "rejects %s",
    (input) => {
      expect(() => sitePagePathSchema.parse(input)).toThrow();
    },
  );
});

describe("subdomains", () => {
  it("accepts a normal label", () => {
    expect(siteSubdomainSchema.parse("Bangkok-Food")).toBe("bangkok-food");
  });

  it.each(["ab", "-lead", "trail-", "has_underscore", "has.dot", "a".repeat(64)])(
    "rejects %s",
    (input) => {
      expect(() => siteSubdomainSchema.parse(input)).toThrow();
    },
  );

  it("rejects reserved operational names", () => {
    for (const reserved of ["www", "api", "admin", "preview"]) {
      expect(() => siteSubdomainSchema.parse(reserved)).toThrow(/reserved/);
    }
  });

  /**
   * Punycode is refused outright. Accepting it would let a tenant register a
   * homograph of another operator's hostname on the shared sites apex.
   */
  it("rejects a punycode label", () => {
    expect(() => siteSubdomainSchema.parse("xn--80ak6aa92e")).toThrow(/Internationalised/);
  });
});

describe("theme contrast", () => {
  it("accepts a readable palette", () => {
    const theme = validateSiteTheme({ textColor: "#111827", backgroundColor: "#ffffff" });
    expect(theme.textColor).toBe("#111827");
  });

  /**
   * Enforced at the schema, not as an editor warning: an AI-generated palette
   * is the likeliest source of unreadable text, and a warning publish can
   * ignore is how it reaches production.
   */
  it("refuses a palette below WCAG AA", () => {
    expect(() =>
      validateSiteTheme({ textColor: "#bbbbbb", backgroundColor: "#ffffff" }),
    ).toThrow(/contrast/i);
  });

  it("computes the known white-on-black ratio", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });
});

describe("templates", () => {
  it("has a unique key per template", () => {
    const keys = SITE_TEMPLATES.map((template) => template.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * Every template's own pages must survive the same validation an operator's
   * edits go through. A template that ships invalid content would fail at
   * create time, for the customer, on their first action.
   */
  it("produces valid content for every page of every template", () => {
    for (const template of SITE_TEMPLATES) {
      for (const templatePage of template.pages) {
        expect(() =>
          validatePageContent({ version: 1, sections: templatePage.sections }),
        ).not.toThrow();
        expect(() => sitePagePathSchema.parse(templatePage.path)).not.toThrow();
      }
      expect(() => validateSiteTheme(template.theme)).not.toThrow();
    }
  });

  it("gives every template a homepage, a tours page and the legal pages", () => {
    for (const template of SITE_TEMPLATES) {
      const paths = template.pages.map((templatePage) => templatePage.path);
      expect(paths).toContain("/");
      expect(paths).toContain("/tours");
      expect(paths).toContain("/contact");
      expect(paths).toContain("/privacy");
      expect(paths).toContain("/terms");
      expect(paths).toContain("/cancellation-policy");
    }
  });

  it("uses unique section ids within each page", () => {
    for (const template of SITE_TEMPLATES) {
      for (const templatePage of template.pages) {
        const ids = templatePage.sections.map((section) => section.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });

  it("orders templates suited to the business type first", () => {
    const ordered = templatesForBusinessType("agency");
    expect(ordered[0].suitedTo).toContain("agency");
    expect(ordered).toHaveLength(SITE_TEMPLATES.length);
  });

  it("returns undefined for an unknown key rather than throwing", () => {
    expect(findSiteTemplate("not-a-template")).toBeUndefined();
  });
});
