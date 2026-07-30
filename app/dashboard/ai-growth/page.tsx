import { permanentRedirect } from "next/navigation";

/**
 * Phase 10 renamed this page to /dashboard/growth, because the insights it
 * shows are computed by a documented rule engine and no LLM is involved.
 *
 * The old path is kept as a permanent redirect rather than deleted: operators
 * bookmark dashboard pages, and a 404 on a page someone used yesterday is a
 * worse outcome than one extra route file.
 */
export default function LegacyAiGrowthRedirect(): never {
  permanentRedirect("/dashboard/growth");
}
