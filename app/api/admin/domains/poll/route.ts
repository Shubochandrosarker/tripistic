import { forbidden, handleApiError, json } from "@/lib/api";
import { pollCustomDomainHealth } from "@/lib/domains/service";

function requireCronSecret(request: Request) {
  const expected = process.env.DOMAIN_CRON_SECRET || process.env.CRON_SECRET;
  const provided = request.headers.get("x-tripistic-cron-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || provided !== expected) {
    throw forbidden("Domain health polling requires the cron secret.");
  }
}

export async function POST(request: Request) {
  try {
    requireCronSecret(request);
    const result = await pollCustomDomainHealth();
    return json(result);
  } catch (error) {
    return handleApiError(error);
  }
}
