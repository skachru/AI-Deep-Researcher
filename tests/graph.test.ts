import { AIMessage, AIMessageChunk } from "@langchain/core/messages";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ResearchEvent } from "@/lib/events/types";
import { AnalysisSchema, InsightsSchema, PlanSchema } from "@/lib/schemas/llm";
import type { RawSource } from "@/lib/tools/types";

/**
 * End-to-end graph test with the LLM and every network tool mocked.
 * Verifies agent order, the multi-hop loop, event streaming and the final report.
 */

const usageMsg = (content = "") =>
  new AIMessage({ content, usage_metadata: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } });

let analysisCalls = 0;

vi.mock("@/lib/llm", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/llm")>();
  return {
    ...actual,
    createModel: () => ({
      withStructuredOutput: (schema: unknown) => ({
        invoke: async () => {
          if (schema === PlanSchema)
            return {
              raw: usageMsg(),
              parsed: {
                subQuestions: [
                  { question: "Do controlled studies show speedups?", searchQuery: "copilot RCT speed" },
                  { question: "Does code quality suffer?", searchQuery: "AI code quality" },
                  { question: "What do developers report?", searchQuery: "developer survey AI" },
                ],
                arxivQuery: "copilot productivity",
                wikipediaTopics: ["GitHub Copilot"],
              },
            };
          if (schema === AnalysisSchema) {
            analysisCalls += 1;
            return {
              raw: usageMsg(),
              parsed: {
                findings: [
                  {
                    subQuestionId: "Q1",
                    summary: "Controlled studies show speedups.",
                    claims: [{ text: "55% faster", status: "Corroborated", sourceIds: ["S1", "S2", "S99"] }],
                  },
                ],
                contradictions: [
                  {
                    topic: "Experienced developers",
                    claimA: { text: "Faster", sourceId: "S1" },
                    claimB: { text: "Slower", sourceId: "S2" },
                    assessment: "Unresolved",
                  },
                ],
                credibility: [{ sourceId: "S1", score: 90, rationale: "Peer reviewed" }],
                gaps:
                  analysisCalls === 1
                    ? [
                        {
                          description: "No long-term data",
                          importance: "high",
                          followUpQuestion: "Long-term effects of AI assistants?",
                        },
                      ]
                    : [],
              },
            };
          }
          if (schema === InsightsSchema)
            return {
              raw: usageMsg(),
              parsed: {
                insights: [
                  {
                    title: "Gains concentrate in juniors",
                    hypothesis: "h",
                    confidence: "Medium",
                    reasoning: ["a", "b"],
                    evidenceIds: ["S1"],
                  },
                ],
              },
            };
          throw new Error("unexpected schema");
        },
      }),
      invoke: async () => usageMsg("## Summary\n- Assistants help [1]."),
      stream: async () =>
        (async function* () {
          yield new AIMessageChunk({ content: "- Quick " });
          yield new AIMessageChunk({ content: "answer" });
        })(),
    }),
  };
});

const src = (url: string, type: RawSource["type"]): RawSource => ({
  title: `Title ${url}`,
  url,
  type,
  publishedDate: "2025-01-01",
  snippet: "snippet",
  content: "AI coding assistants made developers complete tasks faster in a controlled study of code quality.",
  retrievedBy: "mock",
});

vi.mock("@/lib/tools/webSearch", () => ({
  webSearch: vi.fn(async ({ mode }: { mode: "web" | "news" }) => ({
    sources: mode === "news" ? [src("https://news.com/1", "news")] : [src(`https://web.com/${Math.random()}`, "web")],
    usage: { inputTokens: 10, outputTokens: 10 },
  })),
}));
vi.mock("@/lib/tools/arxiv", () => ({
  searchArxiv: vi.fn(async () => [src(`https://arxiv.org/abs/${Math.random()}`, "paper")]),
}));
vi.mock("@/lib/tools/wikipedia", () => ({
  searchWikipedia: vi.fn(async () => {
    throw new Error("HTTP 503 from en.wikipedia.org");
  }),
}));

describe("research graph", () => {
  beforeEach(() => {
    analysisCalls = 0;
  });

  it("streams a quick summary first, then runs the agents without looping in Quick depth", async () => {
    const { runResearch } = await import("@/lib/graph/run");
    const events: ResearchEvent[] = [];
    for await (const e of runResearch({ query: "Do AI coding assistants help?", depth: "quick" })) events.push(e);

    const order = events
      .filter((e) => e.type === "agent_started")
      .map((e) => (e.type === "agent_started" ? e.agent : ""));
    expect(order).toEqual(["retriever", "analyst", "insight", "reporter"]);

    const summaryAt = events.findIndex((e) => e.type === "summary_ready");
    const reportAt = events.findIndex((e) => e.type === "report_ready");
    expect(summaryAt).toBeGreaterThan(-1);
    expect(summaryAt).toBeLessThan(reportAt);
    const ready = events[summaryAt];
    expect(ready.type === "summary_ready" && ready.summary).toBe("- Quick answer");
    expect(events.filter((e) => e.type === "summary_delta")).toHaveLength(2);
  });

  it("runs all four agents, loops once for an important gap and produces a cited report", async () => {
    const { runResearch } = await import("@/lib/graph/run");
    const events: ResearchEvent[] = [];
    for await (const e of runResearch({ query: "Do AI coding assistants help?", depth: "standard" })) events.push(e);

    const order = events
      .filter((e) => e.type === "agent_started")
      .map((e) => (e.type === "agent_started" ? e.agent : ""));
    expect(order).toEqual(["retriever", "analyst", "retriever", "analyst", "insight", "reporter"]);

    expect(events.some((e) => e.type === "iteration_started" && e.iteration === 1)).toBe(true);
    expect(events.some((e) => e.type === "error")).toBe(false);

    // Failed Wikipedia call is reported, not fatal.
    expect(events.some((e) => e.type === "tool_called" && e.tool === "wikipedia" && e.status === "failed")).toBe(true);

    // Hallucinated source id S99 is dropped.
    const finding = events.find((e) => e.type === "finding_added");
    expect(finding?.type === "finding_added" && finding.finding.claims[0].sourceIds).toEqual(["S1", "S2"]);

    const report = events.find((e) => e.type === "report_ready");
    expect(report?.type).toBe("report_ready");
    if (report?.type === "report_ready") {
      expect(report.report).toContain("## Summary");
      expect(report.report).toContain("## Methodology");
      expect(report.report).toContain("## References");
      expect(report.report).toContain("wikipedia failed");
      expect(report.sources.length).toBeGreaterThan(3);
      expect(report.sources.every((s) => !("content" in s))).toBe(true);
    }

    const totalOut = events.reduce((n, e) => (e.type === "usage" ? n + e.usage.outputTokens : n), 0);
    expect(totalOut).toBeGreaterThan(0);
  });
});
