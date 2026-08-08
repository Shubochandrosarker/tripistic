import { describe, expect, it } from "vitest";

import { renderBundle } from "@/lib/sites/publish";
import { esc, renderPage, tourSlotToken } from "@/lib/sites/render";
import { pageSeoSchema, siteSeoSchema, siteThemeSchema, validatePageContent } from "@/lib/sites/schema";
import { buildWorkerModule } from "@/lib/sites/worker-runtime";

const theme = siteThemeSchema.parse({});
const siteSeo = siteSeoSchema.parse({ organizationName: "Acme Walks" });

const context = {
  navigation: { primary: [{ label: "Tours", href: "/tours" }], footer: [] },
  brandName: "Acme Walks",
  bookingBaseUrl: "https://app.tripistic.com",
  workspaceSlug: "acme-walks",
  logoUrl: "",
  requireAttribution: true,
};

function render(sections: unknown[], overrides: Partial<Parameters<typeof renderPage>[0]> = {}) {
  return renderPage({
    page: {
      path: "/",
      title: "Home",
      content: validatePageContent({ version: 1, sections }),
      seo: pageSeoSchema.parse({}),
    },
    theme,
    siteSeo,
    context,
    canonicalOrigin: "https://acme.tripistic.site",
    forceNoindex: false,
    ...overrides,
  });
}

describe("esc", () => {
  it("escapes every character that can break out of markup or an attribute", () => {
    expect(esc(`<script>"'&`)).toBe("&lt;script&gt;&quot;&#39;&amp;");
  });

  it("renders null and undefined as empty rather than as the words", () => {
    expect(esc(null)).toBe("");
    expect(esc(undefined)).toBe("");
  });
});

describe("renderPage", () => {
  it("emits a complete document with the page title and canonical", () => {
    const { html } = render([{ id: "hero-1", type: "hero", layout: {}, props: { title: "Walk with us" } }]);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("<h1>Walk with us</h1>");
    expect(html).toContain('<link rel="canonical" href="https://acme.tripistic.site">');
    expect(html).toContain('<meta name="robots" content="index, follow">');
  });

  /**
   * The single most important test in the Site Builder. Section props are
   * operator- and LLM-authored, and they render onto a hostname that also
   * carries the booking flow. Nothing tenant-supplied may reach the output
   * unescaped.
   */
  describe("escaping", () => {
    const payload = `</h1><script>alert(document.cookie)</script>`;

    it("escapes a script payload in a heading", () => {
      const { html } = render([
        { id: "hero-1", type: "hero", layout: {}, props: { title: payload } },
      ]);
      expect(html).not.toContain("<script>alert");
      expect(html).toContain("&lt;script&gt;");
    });

    it("escapes a payload in prose", () => {
      const { html } = render([
        { id: "about-1", type: "about", layout: {}, props: { title: "About", body: payload } },
      ]);
      expect(html).not.toContain("<script>alert");
    });

    it("escapes a payload in image alt text, which lands in an attribute", () => {
      const { html } = render([
        {
          id: "gallery-1",
          type: "gallery",
          layout: {},
          props: { images: [{ url: "https://cdn.example.com/a.jpg", alt: `" onerror="alert(1)` }] },
        },
      ]);
      expect(html).not.toContain('onerror="alert(1)"');
      expect(html).toContain("&quot; onerror=&quot;alert(1)");
    });

    it("escapes a payload in a link label and href", () => {
      const { html } = render([
        {
          id: "cta-1",
          type: "cta",
          layout: {},
          props: {
            title: "Go",
            primaryCta: { label: payload, href: "https://example.com/a\"onmouseover=\"x" },
          },
        },
      ]);
      expect(html).not.toContain('onmouseover="x"');
      expect(html).not.toContain("<script>alert");
    });

    /**
     * `</script>` inside JSON-LD would close the tag early and turn the rest
     * of the operator's FAQ answer into executable markup.
     */
    it("escapes a script-closing sequence inside structured data", () => {
      const { html } = render([
        {
          id: "faq-1",
          type: "faq",
          layout: {},
          props: {
            emitStructuredData: true,
            items: [{ question: "Q?", answer: `</script><script>alert(1)</script>` }],
          },
        },
      ]);
      const ldStart = html.indexOf('<script type="application/ld+json">');
      const ldEnd = html.indexOf("</script>", ldStart);
      const block = html.slice(ldStart, ldEnd);
      expect(block).not.toContain("</script>");
      expect(block).toContain("\\u003c");
    });
  });

  describe("structured data", () => {
    it("always emits Organization", () => {
      const { html } = render([{ id: "hero-1", type: "hero", layout: {}, props: { title: "Hi" } }]);
      expect(html).toContain('"@type":"Organization"');
      expect(html).toContain("Acme Walks");
    });

    /**
     * FAQPage markup on a page that is not really an FAQ is schema spam, so
     * it requires an explicit opt-in per section rather than being inferred.
     */
    it("emits FAQPage only when the section opted in", () => {
      const off = render([
        {
          id: "faq-1",
          type: "faq",
          layout: {},
          props: { items: [{ question: "Q?", answer: "A." }] },
        },
      ]);
      expect(off.html).not.toContain("FAQPage");

      const on = render([
        {
          id: "faq-1",
          type: "faq",
          layout: {},
          props: { emitStructuredData: true, items: [{ question: "Q?", answer: "A." }] },
        },
      ]);
      expect(on.html).toContain("FAQPage");
    });
  });

  describe("preview builds", () => {
    it("are noindex and carry no canonical, whatever the page says", () => {
      const { html, noindex } = render(
        [{ id: "hero-1", type: "hero", layout: {}, props: { title: "Hi" } }],
        { forceNoindex: true, canonicalOrigin: null },
      );
      expect(noindex).toBe(true);
      expect(html).toContain('content="noindex, nofollow"');
      expect(html).not.toContain("rel=\"canonical\"");
    });
  });

  it("emits a tour slot token rather than baking prices into the page", () => {
    const { html } = render([
      { id: "tours-1", type: "tourCards", layout: {}, props: { title: "Tours" } },
    ]);
    expect(html).toContain(tourSlotToken("tours-1"));
  });

  it("posts the contact form to Tripistic, not to an operator-supplied URL", () => {
    const { html } = render([{ id: "contact-1", type: "contactForm", layout: {}, props: {} }]);
    expect(html).toContain('action="https://app.tripistic.com/api/marketing/contact"');
  });

  it("hides a section on the breakpoints it is not visible at", () => {
    const { html } = render([
      {
        id: "hero-1",
        type: "hero",
        layout: { visibleOn: ["desktop"] },
        props: { title: "Desktop only" },
      },
    ]);
    // Scoped to the section element: the stylesheet defines all three
    // utilities, so asserting against the whole document would always pass.
    const tag = html.slice(html.indexOf('<section id="hero-1"'));
    const openTag = tag.slice(0, tag.indexOf(">"));
    expect(openTag).toContain("t-hide-mobile");
    expect(openTag).toContain("t-hide-tablet");
    expect(openTag).not.toContain("t-hide-desktop");
  });

  it("includes a skip link and a main landmark", () => {
    const { html } = render([{ id: "hero-1", type: "hero", layout: {}, props: { title: "Hi" } }]);
    expect(html).toContain('href="#main"');
    expect(html).toContain('<main id="main">');
  });
});

describe("attribution", () => {
  function footerHtml(requireAttribution: boolean, showAttribution: boolean) {
    return renderPage({
      page: {
        path: "/",
        title: "Home",
        content: validatePageContent({
          version: 1,
          sections: [{ id: "footer-1", type: "footer", layout: {}, props: { showAttribution } }],
        }),
        seo: pageSeoSchema.parse({}),
      },
      theme,
      siteSeo,
      context: { ...context, requireAttribution },
      canonicalOrigin: null,
      forceNoindex: false,
    }).html;
  }

  /**
   * Removing the credit is the white-label entitlement. Resolving it from the
   * section prop alone would let any plan turn it off by editing the footer.
   */
  it("forces the credit on when white-label is not entitled", () => {
    expect(footerHtml(true, false)).toContain("Powered by Tripistic");
  });

  it("allows removing it when white-label is entitled", () => {
    expect(footerHtml(false, false)).not.toContain("Powered by Tripistic");
  });
});

describe("buildWorkerModule", () => {
  const payload = {
    siteId: "site_1",
    workspaceSlug: "acme",
    apiOrigin: "https://app.tripistic.com",
    siteOrigin: "https://acme.tripistic.site",
    pages: [{ path: "/", html: "<p>hi</p>", noindex: false }],
    tourSlots: {},
    llmsTxt: null,
    revisionId: "rev_1",
    deploymentId: "dep_1",
    preview: false,
  };

  it("embeds the payload as a parsed JSON string literal", () => {
    const source = buildWorkerModule(payload);
    expect(source).toContain("const PAYLOAD_JSON =");
    expect(source).toContain("JSON.parse(PAYLOAD_JSON)");
  });

  /**
   * Tenant content reaches the Worker only inside a JSON string literal.
   * `JSON.stringify(JSON.stringify(x))` is what guarantees there is no
   * sequence of characters that escapes it into code position.
   */
  it("cannot be escaped by a payload that closes the string literal", () => {
    const hostileHtml = `";globalThis.TRIPISTIC_PWNED=1;const x="`;
    const source = buildWorkerModule({
      ...payload,
      pages: [{ path: "/", html: hostileHtml, noindex: false }],
    });

    // Evaluate only the payload line, in isolation. If the escaping were
    // wrong the injected statement would run and set the global; this is the
    // property under test, so it is worth demonstrating rather than asserting
    // about substrings.
    const firstLine = source.slice(0, source.indexOf("\n"));
    const readPayload = new Function(`${firstLine}\nreturn PAYLOAD_JSON;`) as () => string;
    const json = readPayload();

    expect((globalThis as Record<string, unknown>).TRIPISTIC_PWNED).toBeUndefined();
    expect(JSON.parse(json).pages[0].html).toBe(hostileHtml);
  });

  it("survives a payload containing a script close tag and unicode separators", () => {
    const hostile = {
      ...payload,
      pages: [{ path: "/", html: "</script>  ", noindex: false }],
    };
    const source = buildWorkerModule(hostile);
    const literal = source.slice(source.indexOf("=") + 1, source.indexOf(";\n"));
    expect(() => JSON.parse(JSON.parse(literal.trim()))).not.toThrow();
  });
});

describe("renderBundle", () => {
  const snapshot = {
    site: {
      id: "site_1",
      name: "Acme Walks",
      subdomain: "acme",
      templateKey: "walking_tours",
      theme: {},
      seo: { organizationName: "Acme Walks" },
      navigation: { primary: [], footer: [] },
    },
    pages: [
      {
        path: "/",
        title: "Home",
        enabled: true,
        position: 0,
        content: {
          version: 1,
          sections: [
            { id: "tours-1", type: "tourCards", layout: {}, props: { limit: 4, tourIds: ["tour_a"] } },
          ],
        },
        seo: {},
      },
    ],
    workspace: { slug: "acme-walks", name: "Acme Walks" },
    capturedAt: new Date(0).toISOString(),
  };

  function bundle(overrides: Partial<Parameters<typeof renderBundle>[0]> = {}) {
    return renderBundle({
      snapshot,
      siteOrigin: "https://acme.tripistic.site",
      apiOrigin: "https://app.tripistic.com",
      requireAttribution: true,
      preview: false,
      revisionId: "rev_1",
      deploymentId: "dep_1",
      tourSlugsById: { tour_a: "sunset-walk" },
      ...overrides,
    });
  }

  it("resolves pinned tour ids to slugs so the Worker never sees internal ids", () => {
    const result = bundle();
    expect(result.payload.tourSlots["tours-1"].tourSlugs).toEqual(["sunset-walk"]);
    expect(result.moduleSource).not.toContain("tour_a");
  });

  it("drops a pinned tour whose id no longer resolves", () => {
    const result = bundle({ tourSlugsById: {} });
    expect(result.payload.tourSlots["tours-1"].tourSlugs).toEqual([]);
  });

  it("produces a stable checksum for identical input", () => {
    expect(bundle().checksum).toBe(bundle().checksum);
    expect(bundle().checksum).not.toBe(bundle({ preview: true }).checksum);
  });

  it("omits llms.txt unless the operator opted in", () => {
    expect(bundle().payload.llmsTxt).toBeNull();
    const optedIn = bundle({
      snapshot: {
        ...snapshot,
        site: { ...snapshot.site, seo: { organizationName: "Acme Walks", emitLlmsTxt: true } },
      },
    });
    expect(optedIn.payload.llmsTxt).toContain("# Acme Walks");
  });

  it("never emits llms.txt for a preview build", () => {
    const preview = bundle({
      preview: true,
      snapshot: {
        ...snapshot,
        site: { ...snapshot.site, seo: { organizationName: "Acme Walks", emitLlmsTxt: true } },
      },
    });
    expect(preview.payload.llmsTxt).toBeNull();
    expect(preview.payload.preview).toBe(true);
  });
});
