import { describe, expect, it, vi } from "vitest";
import type { ResearchEvent } from "@/lib/events/types";

const completeSearch = vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined);
const createSearch = vi.fn<(...args: unknown[]) => Promise<string>>(async () => "6f1c1e2a-1111-4222-8333-444455556666");

vi.mock("@/lib/env", () => ({ getServerEnv: () => ({}) }));
vi.mock("@/lib/auth/session", () => ({ getViewer: async () => ({ anonId: "a", email: null, isAdmin: true }) }));
vi.mock("@/lib/db/searches", () => ({ createSearch, completeSearch, failSearch: vi.fn(async () => undefined) }));
vi.mock("@/lib/graph/run", () => ({
  runResearch: async function* (): AsyncGenerator<ResearchEvent> {
    const at = 0;
    yield { type: "usage", usage: { inputTokens: 10, outputTokens: 0 }, at };
    yield { type: "report_ready", report: "# R\n## Summary\n- x", sources: [], at };
    // The quick summary runs alongside the graph and can finish after the report.
    yield { type: "summary_delta", text: "Late summary", at };
    yield { type: "usage", usage: { inputTokens: 100, outputTokens: 0 }, at };
  },
}));

describe("POST /api/research persistence", () => {
  it("saves the report before announcing it, then keeps events that arrive later", async () => {
    const { POST } = await import("@/app/api/research/route");
    const res = await POST(
      new Request("http://localhost/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Is this a long enough question?", depth: "quick", length: "short" }),
      }),
    );
    await res.text();
    expect(createSearch.mock.calls[0]?.[3]).toBe("short");
    expect(completeSearch.mock.calls.length).toBeGreaterThanOrEqual(2);
    const last = completeSearch.mock.calls.at(-1)?.[1] as { quickSummary: string; usage: { inputTokens: number } };
    expect(last.quickSummary).toBe("Late summary");
    expect(last.usage.inputTokens).toBe(110);
  });
});
