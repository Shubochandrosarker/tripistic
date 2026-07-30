import { afterEach, describe, expect, it, vi } from "vitest";

import {
  currentRequestContext,
  enrichRequestContext,
  logger,
  maskEmail,
  newRequestId,
  redact,
  runWithRequestContext,
} from "@/lib/observability/logger";

/**
 * Phase 6 — structured logging.
 *
 * The redaction here is a security boundary, not a nicety. Anything written
 * to stdout lands in the container runtime's log store and every downstream
 * shipper, outliving the database row it came from and sitting outside every
 * deletion path the application offers. A secret or a customer's address that
 * reaches a log line cannot be un-leaked.
 */

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.LOG_LEVEL;
});

/** Captures what would actually be written, which is what matters. */
function captureLines(fn: () => void): string {
  const chunks: string[] = [];
  const sink = (...args: unknown[]) => {
    chunks.push(args.map(String).join(" "));
  };
  vi.spyOn(console, "log").mockImplementation(sink);
  vi.spyOn(console, "warn").mockImplementation(sink);
  vi.spyOn(console, "error").mockImplementation(sink);
  fn();
  return chunks.join("\n");
}

describe("secret redaction", () => {
  it("removes values under secret-ish keys regardless of casing or nesting", () => {
    const out = redact({
      password: "hunter2",
      STRIPE_SECRET_KEY: "sk_live_abcdef123456",
      nested: { authorization: "Bearer abc.def.ghi", apiKey: "k-123456" },
      headers: { Cookie: "session=abc123" },
    }) as Record<string, unknown>;

    const serialized = JSON.stringify(out);
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("sk_live_abcdef123456");
    expect(serialized).not.toContain("abc.def.ghi");
    expect(serialized).not.toContain("session=abc123");
    expect(out.password).toBe("[redacted]");
  });

  it("catches a Stripe key even in a field nobody thought to name carefully", () => {
    const out = JSON.stringify(redact({ note: "charge failed for sk_test_51Hxyzabcdef" }));
    expect(out).not.toContain("sk_test_51Hxyzabcdef");
    expect(out).toContain("[redacted-secret]");
  });

  it("catches a webhook secret and a JWT in free text", () => {
    const out = JSON.stringify(
      redact({ note: "whsec_9f8e7d6c5b4a3210 and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig_value" }),
    );
    expect(out).not.toContain("whsec_9f8e7d6c5b4a3210");
    expect(out).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });
});

describe("PII masking", () => {
  it("masks an address while leaving it recognisable to an operator", () => {
    expect(maskEmail("guest@example.com")).toBe("g***@example.com");
    // Enough to confirm "yes, that is the right guest" without the log
    // becoming a copy of the customer list.
    expect(maskEmail("guest@example.com")).not.toContain("uest");
  });

  it("masks addresses under PII-ish keys", () => {
    const out = redact({ toEmail: "alice@example.com", guestEmail: "bob@example.com" }) as Record<string, string>;
    expect(out.toEmail).toBe("a***@example.com");
    expect(out.guestEmail).toBe("b***@example.com");
  });

  it("masks an address that appears in free text", () => {
    const out = JSON.stringify(redact({ message: "could not deliver to carol@example.com" }));
    expect(out).not.toContain("carol@example.com");
    expect(out).toContain("c***@example.com");
  });

  it("masks a phone number without pretending it is an address", () => {
    const out = redact({ phone: "+15551234567" }) as Record<string, string>;
    expect(out.phone).not.toContain("5551234");
    expect(out.phone).toMatch(/\*\*\*/);
  });

  it("does not mangle an unrelated string containing no PII", () => {
    expect(redact({ reference: "TRP-2026-0042" })).toEqual({ reference: "TRP-2026-0042" });
  });

  it("handles a degenerate address without throwing or leaking", () => {
    expect(maskEmail("@example.com")).toBe("***");
    expect(maskEmail("notanemail")).toBe("***");
  });
});

describe("redaction robustness", () => {
  it("survives a circular structure — the logger must never hang", () => {
    const a: Record<string, unknown> = { name: "a" };
    a.self = a;
    expect(() => JSON.stringify(redact(a))).not.toThrow();
    expect(JSON.stringify(redact(a))).toContain("[circular]");
  });

  it("truncates very deep nesting rather than recursing without bound", () => {
    let deep: Record<string, unknown> = { value: 1 };
    for (let i = 0; i < 40; i += 1) deep = { child: deep };
    expect(JSON.stringify(redact(deep))).toContain("[truncated]");
  });

  it("caps long arrays", () => {
    const out = redact(Array.from({ length: 500 }, (_, i) => i)) as unknown[];
    expect(out.length).toBeLessThanOrEqual(50);
  });

  it("keeps an Error readable and scrubbed", () => {
    const error = new Error("failed for sk_live_secretvalue123 and dave@example.com");
    const out = redact(error) as { name: string; message: string; stack?: string };
    expect(out.name).toBe("Error");
    expect(out.message).not.toContain("sk_live_secretvalue123");
    expect(out.message).not.toContain("dave@example.com");
    expect(out.message).toContain("[redacted-secret]");
  });

  it("serialises a BigInt rather than throwing on JSON.stringify", () => {
    expect(() => JSON.stringify(redact({ id: 10n }))).not.toThrow();
  });
});

describe("log emission", () => {
  it("writes one parseable JSON object per line", () => {
    const line = captureLines(() => logger.info("test.event", { count: 3 }));
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("test.event");
    expect(parsed.count).toBe(3);
    expect(typeof parsed.time).toBe("string");
  });

  it("redacts fields on the way out, not only when redact() is called directly", () => {
    const line = captureLines(() => logger.error("send.failed", { toEmail: "erin@example.com", apiKey: "k-secret" }));
    expect(line).not.toContain("erin@example.com");
    expect(line).not.toContain("k-secret");
  });

  it("honours LOG_LEVEL", () => {
    process.env.LOG_LEVEL = "warn";
    expect(captureLines(() => logger.debug("noise"))).toBe("");
    expect(captureLines(() => logger.info("noise"))).toBe("");
    expect(captureLines(() => logger.warn("kept"))).toContain("kept");
  });

  it("ignores a nonsense LOG_LEVEL instead of silencing everything", () => {
    // Getting this wrong means an incident with no logs at all.
    process.env.LOG_LEVEL = "verbose-please";
    expect(captureLines(() => logger.error("still.emitted"))).toContain("still.emitted");
  });
});

describe("correlation ids", () => {
  it("stamps every line inside a request with the same id", () => {
    const requestId = newRequestId();
    const output = captureLines(() => {
      runWithRequestContext({ requestId, route: "/api/test" }, () => {
        logger.info("first");
        logger.info("second");
      });
    });
    const ids = output
      .split("\n")
      .map((line) => (JSON.parse(line) as { requestId?: string }).requestId);
    expect(ids).toEqual([requestId, requestId]);
  });

  it("survives an await boundary — a log deep inside a service still correlates", async () => {
    const requestId = newRequestId();
    let seen: string | undefined;
    await new Promise<void>((resolve) => {
      runWithRequestContext({ requestId }, async () => {
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 1));
        seen = currentRequestContext()?.requestId;
        resolve();
      });
    });
    expect(seen).toBe(requestId);
  });

  it("lets a handler attach tenant context once it is known", () => {
    const output = captureLines(() => {
      runWithRequestContext({ requestId: newRequestId() }, () => {
        enrichRequestContext({ workspaceId: "ws_1", userId: "u_1" });
        logger.info("after.auth");
      });
    });
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed.workspaceId).toBe("ws_1");
    expect(parsed.userId).toBe("u_1");
  });

  it("does not throw outside a request context", () => {
    expect(() => enrichRequestContext({ workspaceId: "ws_1" })).not.toThrow();
    expect(currentRequestContext()).toBeUndefined();
    expect(captureLines(() => logger.info("background.job"))).toContain("background.job");
  });

  it("gives concurrent requests distinct ids", () => {
    const a = newRequestId();
    const b = newRequestId();
    expect(a).not.toBe(b);
  });
});
