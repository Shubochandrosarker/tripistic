import { describe, expect, it } from "vitest";

import {
  assertConversationOwner,
  createConversation,
  conversationMessages,
  getPublicConversation,
  getWorkspaceConversation,
  runTurn,
  type TurnEvent,
} from "@/lib/ai/chat";
import type { ChatInvoker, ChatToolCall } from "@/lib/ai/providers";
import { workspaceCopilotPrompt } from "@/lib/ai/prompts";
import { ApiError } from "@/lib/api";

import {
  addMember,
  createTestTour,
  createTestUser,
  createTestWorkspace,
  entitleWorkspace,
  prisma,
} from "./helpers";

/**
 * The conversation turn loop.
 *
 * Exercised with a scripted invoker instead of a real provider. That is not a
 * compromise: what needs testing here is the loop — tool dispatch, the call
 * ceiling, persistence, output rejection, tenant scoping — and a real model
 * would make every one of those assertions non-deterministic while testing
 * nothing extra. The provider's own wire handling is covered by unit tests.
 */

/** Builds an invoker that replays a fixed script, one entry per model round. */
function scriptedInvoker(
  script: Array<{ text?: string; toolCalls?: ChatToolCall[] }>,
): { invoker: ChatInvoker; rounds: () => number } {
  let round = 0;
  const invoker: ChatInvoker = async function* () {
    const step = script[Math.min(round, script.length - 1)];
    round += 1;
    if (step.text) yield { type: "delta", text: step.text };
    yield {
      type: "done",
      response: {
        text: step.text ?? "",
        toolCalls: step.toolCalls ?? [],
        usage: { inputTokens: 120, outputTokens: 40 },
        finishReason: step.toolCalls?.length ? "tool_calls" : "stop",
      },
    };
  };
  return { invoker, rounds: () => round };
}

async function collect(events: AsyncGenerator<TurnEvent>): Promise<TurnEvent[]> {
  const out: TurnEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

async function copilotFixture() {
  const owner = await createTestUser();
  const workspace = await createTestWorkspace(owner.id);
  await addMember(workspace.id, owner.id, "workspace_owner");
  await entitleWorkspace(workspace.id);
  const conversation = await createConversation({
    workspaceId: workspace.id,
    userId: owner.id,
    surface: "workspace_copilot",
  });
  return { owner, workspace, conversation };
}

function copilotTurn(
  fixture: Awaited<ReturnType<typeof copilotFixture>>,
  userMessage: string,
  invoker: ChatInvoker,
) {
  return runTurn({
    conversationId: fixture.conversation.id,
    surface: "workspace_copilot",
    task: "fast_chat",
    systemPrompt: workspaceCopilotPrompt({
      workspaceName: fixture.workspace.name,
      businessType: "tour_operator",
      currency: "USD",
      timezone: "America/Phoenix",
    }),
    userMessage,
    workspaceId: fixture.workspace.id,
    userId: fixture.owner.id,
    isAuthenticated: true,
    invoker,
  });
}

describe("conversation turn", () => {
  it("streams the answer and persists both sides of the exchange", async () => {
    const fixture = await copilotFixture();
    const { invoker } = scriptedInvoker([{ text: "You have three tours." }]);

    const events = await collect(copilotTurn(fixture, "How many tours do I have?", invoker));

    expect(events.filter((event) => event.type === "delta").map((event) => event.text)).toEqual([
      "You have three tours.",
    ]);
    const done = events.at(-1);
    expect(done?.type).toBe("done");

    const stored = await conversationMessages(fixture.conversation.id);
    expect(stored.map((row) => row.role)).toEqual(["user", "assistant"]);
    expect(stored[1].content).toBe("You have three tours.");
  });

  it("titles the thread from the first message", async () => {
    const fixture = await copilotFixture();
    const { invoker } = scriptedInvoker([{ text: "Sure." }]);
    await collect(copilotTurn(fixture, "Set up my business profile", invoker));

    const conversation = await prisma.aiConversation.findUniqueOrThrow({
      where: { id: fixture.conversation.id },
    });
    expect(conversation.title).toBe("Set up my business profile");
  });

  it("executes an auto tool and feeds the result back to the model", async () => {
    const fixture = await copilotFixture();
    await createTestTour(fixture.workspace.id, { title: "Alfama at dusk", status: "active" });

    const { invoker, rounds } = scriptedInvoker([
      {
        toolCalls: [
          { id: "call_1", name: "searchTours", arguments: JSON.stringify({ query: "Alfama" }) },
        ],
      },
      { text: "You have one Alfama tour." },
    ]);

    const events = await collect(copilotTurn(fixture, "Find my Alfama tour", invoker));

    const tool = events.find((event) => event.type === "tool");
    expect(tool).toMatchObject({ type: "tool", activity: { name: "searchTours", ok: true } });
    // A second model round happened, which is what "fed back" means.
    expect(rounds()).toBe(2);
    expect(events.some((event) => event.type === "delta" && event.text.includes("Alfama"))).toBe(true);
  });

  /**
   * A confirm-class tool must surface a proposal rather than a silent success.
   * If this ever returns `ok` with no proposal, the UI has nothing to show an
   * approve button for and the confirmation step evaporates.
   */
  it("surfaces a proposal for a confirm-class tool instead of applying it", async () => {
    const fixture = await copilotFixture();
    const tour = await createTestTour(fixture.workspace.id, { title: "Original title" });

    const { invoker } = scriptedInvoker([
      {
        toolCalls: [
          {
            id: "call_1",
            name: "proposeTourCopy",
            arguments: JSON.stringify({ tourId: tour.id, tone: "premium" }),
          },
        ],
      },
      { text: "Here is a draft." },
    ]);

    const events = await collect(copilotTurn(fixture, "Improve this tour's copy", invoker));
    const tool = events.find((event) => event.type === "tool");

    expect(tool).toMatchObject({ activity: { name: "proposeTourCopy", risk: "confirm", ok: true } });
    expect(tool && tool.type === "tool" && tool.activity.proposal).toBeTruthy();

    // Nothing was written. The proposal is a proposal.
    const unchanged = await prisma.tour.findUniqueOrThrow({ where: { id: tour.id } });
    expect(unchanged.title).toBe("Original title");
  });

  it("reports a failing tool without aborting the turn", async () => {
    const fixture = await copilotFixture();
    const { invoker } = scriptedInvoker([
      { toolCalls: [{ id: "call_1", name: "notARealTool", arguments: "{}" }] },
      { text: "I could not look that up." },
    ]);

    const events = await collect(copilotTurn(fixture, "Do something impossible", invoker));

    expect(events.find((event) => event.type === "tool")).toMatchObject({
      activity: { ok: false },
    });
    expect(events.at(-1)?.type).toBe("done");
  });

  it("recovers from malformed tool arguments rather than throwing", async () => {
    const fixture = await copilotFixture();
    const { invoker } = scriptedInvoker([
      { toolCalls: [{ id: "call_1", name: "searchTours", arguments: "{not json" }] },
      { text: "Let me try again." },
    ]);

    const events = await collect(copilotTurn(fixture, "Find my tours", invoker));
    expect(events.at(-1)?.type).toBe("done");
  });

  /**
   * The per-turn ceiling. Without it a model that requests tools every round
   * bills the workspace indefinitely for one user message.
   */
  it("stops calling tools after the per-turn ceiling", async () => {
    const fixture = await copilotFixture();
    const alwaysTools: ChatToolCall[] = Array.from({ length: 6 }, (_, index) => ({
      id: `call_${index}`,
      name: "getWorkspaceProfile",
      arguments: "{}",
    }));
    const { invoker, rounds } = scriptedInvoker([{ toolCalls: alwaysTools }]);

    const events = await collect(copilotTurn(fixture, "Loop forever", invoker));

    const executed = events.filter((event) => event.type === "tool").length;
    expect(executed).toBeLessThanOrEqual(10);
    // Rounds are bounded too, so a model that never stops still terminates.
    expect(rounds()).toBeLessThanOrEqual(4);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("refuses model output that contains executable markup", async () => {
    const fixture = await copilotFixture();
    const { invoker } = scriptedInvoker([{ text: "<script>alert(1)</script>" }]);

    await collect(copilotTurn(fixture, "Give me a snippet", invoker));

    const stored = await conversationMessages(fixture.conversation.id);
    expect(stored[1].content).not.toContain("<script");
    expect(stored[1].content).toContain("safety check");
  });

  it("rejects an empty message before spending anything", async () => {
    const fixture = await copilotFixture();
    const { invoker, rounds } = scriptedInvoker([{ text: "unreachable" }]);
    await expect(collect(copilotTurn(fixture, "   ", invoker))).rejects.toThrow(ApiError);
    expect(rounds()).toBe(0);
  });

  it("charges credits once per model round and records a usage event", async () => {
    const fixture = await copilotFixture();
    const { invoker } = scriptedInvoker([{ text: "Done." }]);
    await collect(copilotTurn(fixture, "Hello", invoker));

    const events = await prisma.aiUsageEvent.findMany({
      where: { workspaceId: fixture.workspace.id },
    });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ success: true, surface: "workspace_copilot", task: "fast_chat" });

    const meter = await prisma.usageMeter.findFirst({
      where: { workspaceId: fixture.workspace.id, key: "ai_credits" },
    });
    expect(meter?.used).toBe(1);
  });
});

describe("conversation access", () => {
  it("does not resolve another workspace's conversation", async () => {
    const alpha = await copilotFixture();
    const beta = await copilotFixture();

    await expect(
      getWorkspaceConversation(beta.workspace.id, alpha.conversation.id),
    ).rejects.toThrow(/not found/i);
  });

  it("keeps a colleague out of another member's thread", async () => {
    const fixture = await copilotFixture();
    const colleague = await createTestUser();
    await addMember(fixture.workspace.id, colleague.id, "workspace_admin");

    const conversation = await getWorkspaceConversation(
      fixture.workspace.id,
      fixture.conversation.id,
    );
    expect(() => assertConversationOwner(conversation, colleague.id)).toThrow(/another member/i);
    expect(() => assertConversationOwner(conversation, fixture.owner.id)).not.toThrow();
  });

  /**
   * A public token must never be a way into a tenant thread, even if a
   * workspace conversation somehow carried one.
   */
  it("refuses to resolve a workspace conversation through the public token path", async () => {
    const fixture = await copilotFixture();
    await prisma.aiConversation.update({
      where: { id: fixture.conversation.id },
      data: { publicToken: "forged-token-for-a-workspace-thread" },
    });

    await expect(getPublicConversation("forged-token-for-a-workspace-thread")).rejects.toThrow(
      /not found/i,
    );
  });

  it("issues an unguessable token for an anonymous thread", async () => {
    const first = await createConversation({
      workspaceId: null,
      userId: null,
      surface: "public_advisor",
    });
    const second = await createConversation({
      workspaceId: null,
      userId: null,
      surface: "public_advisor",
    });

    expect(first.publicToken).toBeTruthy();
    expect(first.publicToken).not.toBe(second.publicToken);
    expect((first.publicToken ?? "").length).toBeGreaterThanOrEqual(40);
  });
});
