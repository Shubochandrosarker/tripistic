import { describe, expect, it } from "vitest";
import { z } from "zod";

import { AI_TOOLS } from "@/lib/ai/tools";
import { describeToolParameters } from "@/lib/ai/tool-schema";
import { candidateModels } from "@/lib/ai/router";
import { configuredProviders, isProviderId, providerStatus } from "@/lib/ai/providers";
import { publicAdvisorPrompt, siteGenerationPrompt, workspaceCopilotPrompt } from "@/lib/ai/prompts";
import { UNTRUSTED_CONTENT_POLICY } from "@/lib/ai/safety";
import { TASK_PROFILES } from "@/lib/ai/tasks";
import { SITE_SECTION_TYPES } from "@/lib/sites/schema";

describe("tool JSON Schema conversion", () => {
  /**
   * The guard the original "no converter" comment in lib/ai/tools.ts asked for.
   * A tool added with a Zod construct the converter does not understand fails
   * here rather than shipping a descriptor that lies to the model.
   */
  it("describes every registered tool without throwing", () => {
    for (const tool of AI_TOOLS) {
      const schema = describeToolParameters(tool.input);
      expect(schema.type, `${tool.name} must describe an object`).toBe("object");
      expect(schema).toHaveProperty("properties");
    }
  });

  it("marks a field with a default as optional, not required", () => {
    const schema = describeToolParameters(
      z.object({ query: z.string(), limit: z.number().int().min(1).max(25).default(10) }),
    );
    expect(schema.required).toEqual(["query"]);
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.limit.type).toBe("integer");
    expect(properties.limit.default).toBe(10);
    expect(properties.limit.maximum).toBe(25);
  });

  it("carries enum options through so the model cannot invent a value", () => {
    const schema = describeToolParameters(z.object({ tone: z.enum(["warm", "plain"]) }));
    const properties = schema.properties as Record<string, Record<string, unknown>>;
    expect(properties.tone.enum).toEqual(["warm", "plain"]);
  });

  it("rejects additional properties so a hallucinated field is caught early", () => {
    const schema = describeToolParameters(z.object({ query: z.string() }));
    expect(schema.additionalProperties).toBe(false);
  });

  it("describes an empty-input tool as an empty object rather than omitting it", () => {
    const schema = describeToolParameters(z.object({}));
    expect(schema).toEqual({ type: "object", properties: {}, additionalProperties: false });
  });
});

describe("model routing", () => {
  it("returns the profile's models when no provider is configured", () => {
    // CI has no provider keys. The router still has to name a real model so the
    // resulting error is actionable rather than "none".
    for (const task of Object.keys(TASK_PROFILES) as Array<keyof typeof TASK_PROFILES>) {
      const candidates = candidateModels(task);
      expect(candidates.length).toBeGreaterThan(0);
      expect(candidates).toEqual(expect.arrayContaining([TASK_PROFILES[task].preferredModels[0]]));
    }
  });

  it("only ever names known providers", () => {
    for (const profile of Object.values(TASK_PROFILES)) {
      for (const modelId of profile.preferredModels) {
        expect(isProviderId(modelId.slice(0, modelId.indexOf("/")))).toBe(true);
      }
    }
  });

  it("reports provider status without leaking key material", () => {
    const status = providerStatus();
    expect(status.length).toBeGreaterThan(0);
    for (const row of status) {
      expect(Object.keys(row).sort()).toEqual(["configured", "provider", "viaGateway"]);
      expect(typeof row.configured).toBe("boolean");
    }
    expect(configuredProviders().every((provider) => isProviderId(provider))).toBe(true);
  });
});

describe("system prompts", () => {
  const prompts = [
    workspaceCopilotPrompt({
      workspaceName: "City Walks",
      businessType: "tour_operator",
      currency: "EUR",
      timezone: "Europe/Lisbon",
    }),
    publicAdvisorPrompt("travel"),
    publicAdvisorPrompt("business"),
    siteGenerationPrompt(SITE_SECTION_TYPES),
  ];

  /**
   * Every surface that can be shown retrieved text must state the rule that
   * makes the text data rather than instructions. Asserted rather than trusted,
   * because a new surface that forgets it is exactly how an injected document
   * becomes authoritative.
   */
  it("carries the untrusted-content policy verbatim on every surface", () => {
    for (const prompt of prompts) {
      expect(prompt).toContain(UNTRUSTED_CONTENT_POLICY);
    }
  });

  it("tells the copilot it cannot perform the strong-confirm actions", () => {
    const prompt = workspaceCopilotPrompt({
      workspaceName: "City Walks",
      businessType: "tour_operator",
      currency: "EUR",
      timezone: "Europe/Lisbon",
    });
    for (const action of ["publish", "cancel a booking", "issue a refund", "remove a domain"]) {
      expect(prompt.toLowerCase()).toContain(action.toLowerCase());
    }
  });

  it("resolves 'this tour' to the focused record", () => {
    const prompt = workspaceCopilotPrompt({
      workspaceName: "City Walks",
      businessType: "tour_operator",
      currency: "EUR",
      timezone: "Europe/Lisbon",
      focus: { kind: "tour", id: "tour_123", label: "Alfama at dusk" },
    });
    expect(prompt).toContain("tour_123");
    expect(prompt).toContain("Alfama at dusk");
  });

  it("constrains site generation to the real section registry", () => {
    const prompt = siteGenerationPrompt(SITE_SECTION_TYPES);
    for (const type of ["hero", "tourCards", "faq", "footer"]) {
      expect(prompt).toContain(type);
    }
    expect(prompt).toContain("Never emit HTML");
  });
});
