import { z } from "zod";

import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/db";

import { publicAdvisorPrompt } from "@/lib/ai/prompts";
import { isChatAvailable } from "@/lib/ai/providers";
import { runChatTask } from "@/lib/ai/router";
import { gateX402Route } from "@/lib/x402/middleware";

/**
 * Itinerary generation for autonomous agents, behind x402.
 *
 * Priced higher than search because it runs a model. The candidate tours are
 * fetched first and passed into the prompt, so the model is arranging real
 * inventory rather than inventing it — the same grounding rule the public
 * advisor follows, enforced here by giving the model nothing else to work with.
 *
 * No tools are offered. An agent-facing endpoint should be one round trip with
 * a bounded cost, and a tool loop makes the price unpredictable.
 */

const itinerarySchema = z.object({
  destination: z.string().trim().min(2).max(120),
  days: z.number().int().min(1).max(14).default(3),
  travellers: z.number().int().min(1).max(30).optional(),
  interests: z.array(z.string().trim().max(40)).max(8).default([]),
  pace: z.enum(["relaxed", "balanced", "packed"]).default("balanced"),
});

export async function POST(request: Request) {
  try {
    const gate = await gateX402Route(request);
    if (!gate.allowed) return gate.response;

    if (!isChatAvailable()) {
      return Response.json(
        { error: "Itinerary generation is unavailable on this deployment." },
        { status: 503 },
      );
    }

    const input = itinerarySchema.parse((await request.json().catch(() => null)) ?? {});

    const tours = await prisma.tour.findMany({
      where: {
        status: "active",
        visibility: "public",
        deletedAt: null,
        workspace: { status: "active", deletedAt: null },
        location: { contains: input.destination, mode: "insensitive" },
      },
      take: 20,
      select: {
        title: true,
        slug: true,
        location: true,
        durationMinutes: true,
        basePrice: true,
        currency: true,
        workspace: { select: { name: true, slug: true } },
      },
    });

    const inventory = tours
      .map(
        (tour) =>
          `- ${tour.title} (${tour.durationMinutes} min, ${(tour.basePrice / 100).toFixed(2)} ${tour.currency}) by ${tour.workspace.name} at /book/${tour.workspace.slug}/${tour.slug}`,
      )
      .join("\n");

    const result = await runChatTask({
      task: "reasoning",
      context: { workspaceId: null, userId: null, surface: "system" },
      messages: [
        { role: "system", content: publicAdvisorPrompt("travel") },
        {
          role: "user",
          content: [
            `Plan a ${input.days}-day itinerary for ${input.destination}.`,
            input.travellers ? `Party size: ${input.travellers}.` : "",
            input.interests.length ? `Interests: ${input.interests.join(", ")}.` : "",
            `Pace: ${input.pace}.`,
            "",
            tours.length > 0
              ? `Bookable Tripistic experiences in this destination:\n${inventory}\n\nUse only these when recommending a booking, and reference them by their URL.`
              : "There are no bookable Tripistic experiences listed for this destination. Say so explicitly and suggest what to look for instead.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    return Response.json(
      {
        destination: input.destination,
        days: input.days,
        itinerary: result.text,
        // The exact inventory the model was shown, so the caller can verify
        // that every recommendation traces back to a real listing.
        groundedIn: tours.map((tour) => ({
          title: tour.title,
          url: `/book/${tour.workspace.slug}/${tour.slug}`,
          priceCents: tour.basePrice,
          currency: tour.currency,
        })),
        model: result.modelId,
      },
      { headers: { "Cache-Control": "no-store", "X-Payment-Remaining": String(gate.remaining) } },
    );
  } catch (error) {
    return handleApiError(error);
  }
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
