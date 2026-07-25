import type { JsonLdObject } from "@/lib/seo/schema";
import { jsonLdGraph } from "@/lib/seo/schema";

/**
 * Renders structured data as a single @graph document.
 * `<` is escaped so a string value can never terminate the script element.
 */
export function JsonLd({ schema }: { schema: JsonLdObject[] }) {
  if (schema.length === 0) return null;
  const json = JSON.stringify(jsonLdGraph(...schema)).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
