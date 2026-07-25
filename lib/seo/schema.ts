import { SITE, absoluteUrl } from "@/lib/seo/site";

/** JSON-LD builders. Every public page renders at least WebPage + BreadcrumbList. */

export type JsonLdObject = Record<string, unknown>;

export function organizationSchema(): JsonLdObject {
  return {
    "@type": "Organization",
    "@id": `${SITE.url}/#organization`,
    name: SITE.name,
    legalName: SITE.legalName,
    url: SITE.url,
    logo: { "@type": "ImageObject", url: absoluteUrl("/icon.svg") },
    description: SITE.description,
    foundingDate: String(SITE.foundingYear),
    sameAs: SITE.social.map((item) => item.href),
    contactPoint: [
      {
        "@type": "ContactPoint",
        contactType: "sales",
        email: SITE.salesEmail,
        availableLanguage: ["English"],
      },
      {
        "@type": "ContactPoint",
        contactType: "customer support",
        email: SITE.supportEmail,
        availableLanguage: ["English"],
      },
    ],
  };
}

export function websiteSchema(): JsonLdObject {
  return {
    "@type": "WebSite",
    "@id": `${SITE.url}/#website`,
    url: SITE.url,
    name: SITE.name,
    description: SITE.description,
    inLanguage: "en-US",
    publisher: { "@id": `${SITE.url}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: `${SITE.url}/help?q={search_term_string}` },
      "query-input": "required name=search_term_string",
    },
  };
}

export function softwareApplicationSchema(): JsonLdObject {
  return {
    "@type": "SoftwareApplication",
    "@id": `${SITE.url}/#software`,
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Travel Operations Software",
    operatingSystem: "Web",
    softwareVersion: SITE.version,
    url: SITE.url,
    description: SITE.description,
    publisher: { "@id": `${SITE.url}/#organization` },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "USD",
      lowPrice: "49",
      highPrice: "399",
      offerCount: "4",
      url: absoluteUrl("/pricing"),
    },
  };
}

export function webPageSchema({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}): JsonLdObject {
  return {
    "@type": "WebPage",
    "@id": `${absoluteUrl(path)}#webpage`,
    url: absoluteUrl(path),
    name: title,
    description,
    isPartOf: { "@id": `${SITE.url}/#website` },
    inLanguage: "en-US",
  };
}

export type BreadcrumbItem = { name: string; href: string };

export function breadcrumbSchema(items: BreadcrumbItem[]): JsonLdObject {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.href),
    })),
  };
}

export function faqSchema(faqs: readonly (readonly [string, string])[]): JsonLdObject {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };
}

export function articleSchema({
  title,
  description,
  path,
  publishedAt,
  updatedAt,
  author,
  category,
  tags,
  image,
}: {
  title: string;
  description: string;
  path: string;
  publishedAt?: string;
  updatedAt?: string;
  author?: string;
  category?: string;
  tags?: string[];
  image?: string;
}): JsonLdObject {
  return {
    "@type": "Article",
    "@id": `${absoluteUrl(path)}#article`,
    headline: title,
    description,
    url: absoluteUrl(path),
    datePublished: publishedAt || undefined,
    dateModified: updatedAt || publishedAt || undefined,
    articleSection: category,
    keywords: tags && tags.length > 0 ? tags.join(", ") : undefined,
    image: image ? absoluteUrl(image) : undefined,
    author: { "@type": "Organization", name: author || SITE.name, url: SITE.url },
    publisher: { "@id": `${SITE.url}/#organization` },
    isPartOf: { "@id": `${SITE.url}/#website` },
  };
}

export function techArticleSchema(args: Parameters<typeof articleSchema>[0]): JsonLdObject {
  return { ...articleSchema(args), "@type": "TechArticle" };
}

export function productSchema({
  plans,
}: {
  plans: readonly { name: string; price: string; summary: string }[];
}): JsonLdObject {
  return {
    "@type": "Product",
    name: `${SITE.name} — Travel Operations Platform`,
    description: SITE.description,
    brand: { "@id": `${SITE.url}/#organization` },
    url: absoluteUrl("/pricing"),
    offers: plans.map((plan) => ({
      "@type": "Offer",
      name: plan.name,
      description: plan.summary,
      url: absoluteUrl("/pricing"),
      priceCurrency: "USD",
      price: plan.price.replace(/[^0-9]/g, "") || "0",
      availability: "https://schema.org/InStock",
      priceSpecification: {
        "@type": "UnitPriceSpecification",
        priceCurrency: "USD",
        price: plan.price.replace(/[^0-9]/g, "") || "0",
        unitCode: "MON",
      },
    })),
  };
}

export function jobPostingSchema({
  title,
  description,
  department,
  location,
  remote,
}: {
  title: string;
  description: string;
  department: string;
  location: string;
  remote: boolean;
}): JsonLdObject {
  return {
    "@type": "JobPosting",
    title,
    description,
    employmentType: "FULL_TIME",
    industry: "Travel Technology",
    occupationalCategory: department,
    hiringOrganization: { "@id": `${SITE.url}/#organization` },
    jobLocationType: remote ? "TELECOMMUTE" : undefined,
    applicantLocationRequirements: remote ? { "@type": "Country", name: location } : undefined,
    jobLocation: remote
      ? undefined
      : { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: location } },
  };
}

export function itemListSchema({
  name,
  items,
}: {
  name: string;
  items: { name: string; href: string; description?: string }[];
}): JsonLdObject {
  return {
    "@type": "ItemList",
    name,
    numberOfItems: items.length,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      description: item.description,
      url: absoluteUrl(item.href),
    })),
  };
}

/** Wraps one or more schema nodes into a single @graph document. */
export function jsonLdGraph(...nodes: JsonLdObject[]): JsonLdObject {
  return { "@context": "https://schema.org", "@graph": nodes };
}
