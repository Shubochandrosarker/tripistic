import { renderMarkdown } from "@/lib/content/markdown";
import { cn } from "@/lib/utils";

/**
 * Renders authored markdown. The HTML comes from our own renderer in
 * `lib/content/markdown.ts`, which escapes all input before emitting markup.
 */
export function Prose({ body, className }: { body: string; className?: string }) {
  return (
    <div
      className={cn("prose-content", className)}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
    />
  );
}
