import { listContent } from "@/lib/content";
import { featureList, solutions } from "@/lib/marketing/content";
import { SITE, absoluteUrl } from "@/lib/seo/site";

export const revalidate = 3600;

/**
 * llms.txt — a machine-readable map of the public site for LLM crawlers.
 * Format follows the llmstxt.org convention: H1 name, blockquote summary,
 * then grouped link lists.
 */
export function GET() {
  const section = (title: string, links: { label: string; href: string; note?: string }[]) =>
    [
      `## ${title}`,
      "",
      ...links.map(
        ({ label, href, note }) => `- [${label}](${absoluteUrl(href)})${note ? `: ${note}` : ""}`,
      ),
      "",
    ].join("\n");

  const body = [
    `# ${SITE.name}`,
    "",
    `> ${SITE.description}`,
    "",
    `${SITE.name} v${SITE.version} unifies bookings, CRM, tours, guides, drivers, vehicles,`,
    "live operations, payments, automation, analytics, white label, custom domains, and a",
    "customer portal into one platform. Business insights are computed from the operator's own",
    "booking data by a documented rule engine — there is no LLM integration and no generated text.",
    "",
    section("Core pages", [
      { label: "Home", href: "/", note: "Platform overview" },
      { label: "Features", href: "/features", note: "All 17 platform capabilities" },
      { label: "Solutions", href: "/solutions", note: "13 industry-specific pages" },
      { label: "Pricing", href: "/pricing", note: "Plans, comparison, ROI calculator" },
      { label: "Demo", href: "/demo", note: "Interactive product walkthrough" },
      { label: "Why Tripistic", href: "/why-tripistic", note: "Competitor comparisons" },
      { label: "Automation & Insights", href: "/ai-platform", note: "Rule-based forecasting, occupancy, and suggestions" },
      { label: "White Label", href: "/white-label", note: "Agency branding and reseller model" },
      { label: "Customer Portal", href: "/customer-portal", note: "Guest self-service experience" },
      { label: "Integrations", href: "/integrations", note: "Stripe and Cloudflare available; others planned" },
    ]),
    section(
      "Features",
      featureList.map((feature) => ({
        label: feature.title,
        href: `/features/${feature.slug}`,
        note: feature.summary,
      })),
    ),
    section(
      "Solutions",
      solutions.map((solution) => ({
        label: solution.title,
        href: `/solutions/${solution.slug}`,
        note: solution.audience,
      })),
    ),
    section("Developers", [
      { label: "API overview", href: "/developers", note: "REST API, authentication, webhooks" },
      ...listContent("developers").map((doc) => ({
        label: doc.title,
        href: `/developers/${doc.slug}`,
        note: doc.description,
      })),
      { label: "OpenAPI document", href: "/openapi.json", note: "OpenAPI 3.1 specification" },
    ]),
    section("Documentation", [
      { label: "Documentation hub", href: "/docs" },
      ...listContent("docs").map((doc) => ({
        label: doc.title,
        href: `/docs/${doc.slug}`,
        note: doc.description,
      })),
    ]),
    section("Help center", [
      { label: "Help center", href: "/help" },
      ...listContent("help")
        .slice(0, 12)
        .map((doc) => ({ label: doc.title, href: `/help/${doc.slug}` })),
    ]),
    section("Blog", [
      { label: "Blog", href: "/blog" },
      ...listContent("blog")
        .slice(0, 12)
        .map((doc) => ({ label: doc.title, href: `/blog/${doc.slug}`, note: doc.category })),
    ]),
    section("Company", [
      { label: "About", href: "/about" },
      { label: "Customer stories", href: "/customers" },
      { label: "Partners", href: "/partners" },
      { label: "Careers", href: "/careers" },
      { label: "Contact", href: "/contact" },
      { label: "Changelog", href: "/changelog" },
      { label: "Roadmap", href: "/roadmap" },
    ]),
    section("Legal", [
      { label: "Legal center", href: "/legal" },
      ...listContent("legal").map((doc) => ({
        label: doc.title,
        href: `/legal/${doc.slug}`,
        note: doc.description,
      })),
    ]),
    section("Optional", [
      { label: "Sign in", href: "/login" },
      { label: "Create account", href: "/register" },
      { label: "XML sitemap", href: "/sitemap.xml" },
    ]),
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
