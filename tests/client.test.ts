import { describe, expect, it } from "vitest";
import { applyEvent, initialViewState } from "@/lib/client/reducer";
import { isRecording, replayDelays, slugify } from "@/lib/demo/examples";
import { createSseParser, encodeSse } from "@/lib/events/sse";
import type { ResearchEvent } from "@/lib/events/types";

const events: ResearchEvent[] = [
  { type: "run_started", query: "q?", depth: "quick", at: 0 },
  { type: "agent_started", agent: "retriever", message: "go", at: 10 },
  {
    type: "source_found",
    at: 20,
    source: {
      id: "S1",
      title: "A",
      url: "https://a.com",
      type: "web",
      publishedDate: null,
      snippet: "",
      credibility: 50,
      retrievedBy: "x",
      pass: 0,
    },
  },
  { type: "agent_completed", agent: "retriever", message: "done", durationMs: 10, at: 30 },
  { type: "agent_started", agent: "analyst", message: "go", at: 40 },
  {
    type: "source_found",
    at: 50,
    source: {
      id: "S1",
      title: "A",
      url: "https://a.com",
      type: "web",
      publishedDate: null,
      snippet: "",
      credibility: 80,
      retrievedBy: "x",
      pass: 0,
    },
  },
  { type: "usage", usage: { inputTokens: 5, outputTokens: 3 }, at: 55 },
  { type: "usage", usage: { inputTokens: 5, outputTokens: 3 }, at: 56 },
  { type: "agent_completed", agent: "analyst", message: "done", durationMs: 10, at: 60 },
  { type: "agent_started", agent: "retriever", message: "again", at: 70 },
];

describe("applyEvent", () => {
  const final = events.reduce(applyEvent, initialViewState);

  it("tracks agent status, passes and handoffs (including the loop-back)", () => {
    expect(final.agents.analyst).toBe("done");
    expect(final.activeAgent).toBe("retriever");
    expect(final.passes).toBe(2);
    expect(final.handoffs).toEqual([
      { from: "retriever", to: "analyst" },
      { from: "analyst", to: "retriever" },
    ]);
  });

  it("upserts re-scored sources instead of duplicating them", () => {
    expect(final.sources).toHaveLength(1);
    expect(final.sources[0].credibility).toBe(80);
  });

  it("sums usage deltas", () => {
    expect(final.usage).toEqual({ inputTokens: 10, outputTokens: 6 });
  });

  it("marks fatal errors", () => {
    const s = applyEvent(final, { type: "error", message: "boom", recoverable: false, at: 99 });
    expect(s.status).toBe("error");
    expect(s.error).toBe("boom");
  });
});

describe("SSE", () => {
  it("parses frames split across chunks and ignores heartbeats", () => {
    const parse = createSseParser();
    const frame = encodeSse(events[0]);
    expect(parse(": ping\n\n" + frame.slice(0, 10))).toEqual([]);
    const out = parse(frame.slice(10));
    expect(out).toHaveLength(1);
    expect(JSON.parse(out[0])).toEqual(events[0]);
  });
});

describe("demo helpers", () => {
  it("slugifies queries", () => {
    expect(slugify("Is nuclear energy necessary to reach net-zero by 2050?")).toBe(
      "is-nuclear-energy-necessary-to-reach-net-zero-by-2050",
    );
  });

  it("compresses long gaps but keeps short ones", () => {
    expect(replayDelays([{ at: 0 }, { at: 100 }, { at: 60_100 }])).toEqual([0, 100, 2500]);
  });

  it("validates recordings", () => {
    expect(isRecording({ query: "q", depth: "quick", recordedAt: "", events })).toBe(true);
    expect(isRecording({ query: "q", events: [{ nope: 1 }] })).toBe(false);
  });
});

describe("run recorder (what history saves)", () => {
  it("accumulates the quick summary, report, sources, usage and fatal errors", async () => {
    const { emptyOutcome, recordEvent } = await import("@/lib/events/recorder");
    const out = [
      { type: "summary_delta", text: "Quick ", at: 1 },
      { type: "summary_delta", text: "take", at: 2 },
      { type: "usage", usage: { inputTokens: 3, outputTokens: 2 }, at: 3 },
      { type: "error", message: "minor", recoverable: true, at: 4 },
      { type: "report_ready", report: "# R", sources: [], at: 5 },
    ].reduce((acc, e) => recordEvent(acc, e as ResearchEvent), emptyOutcome());
    expect(out).toEqual({
      quickSummary: "Quick take",
      report: "# R",
      sources: [],
      usage: { inputTokens: 3, outputTokens: 2 },
      error: null,
    });
    expect(recordEvent(out, { type: "error", message: "boom", recoverable: false, at: 6 }).error).toBe("boom");
  });

  it("shows the streamed quick summary and the saved search id in the UI state", () => {
    const s = [
      { type: "saved", searchId: "abc", at: 0 },
      { type: "run_started", query: "q?", depth: "quick", at: 1 },
      { type: "summary_delta", text: "Hi", at: 2 },
    ].reduce((acc, e) => applyEvent(acc, e as ResearchEvent), initialViewState);
    expect(s.searchId).toBe("abc");
    expect(s.quickSummary).toBe("Hi");
    expect(s.quickSummaryStatus).toBe("streaming");
  });
});

describe("reducer robustness", () => {
  it("clears first-pass findings and contradictions when analysis re-runs", () => {
    const s = [
      { type: "run_started", query: "q?", depth: "standard", at: 0 },
      { type: "agent_started", agent: "analyst", message: "1", at: 1 },
      {
        type: "contradiction_found",
        contradiction: {
          topic: "T",
          claimA: { text: "a", sourceId: "S1" },
          claimB: { text: "b", sourceId: "S2" },
          assessment: "",
        },
        at: 2,
      },
      { type: "finding_added", finding: { subQuestionId: "Q1", question: "q", summary: "s", claims: [] }, at: 3 },
      { type: "agent_started", agent: "retriever", message: "2", at: 4 },
      { type: "agent_started", agent: "analyst", message: "3", at: 5 },
    ].reduce((acc, e) => applyEvent(acc, e as ResearchEvent), initialViewState);
    expect(s.contradictions).toEqual([]);
    expect(s.findings).toEqual([]);
  });

  it("ignores malformed or unknown events instead of crashing", () => {
    const before = applyEvent(initialViewState, { type: "run_started", query: "q?", depth: "quick", at: 0 });
    const bad = [
      { type: "source_found", at: 1 },
      { type: "finding_added", finding: null, at: 2 },
      { type: "totally_unknown", at: 3 },
    ];
    let s = before;
    for (const e of bad) s = applyEvent(s, e as unknown as ResearchEvent);
    expect(s.sources).toEqual([]);
    expect(s.query).toBe("q?");
  });
});

describe("event validation", () => {
  it("rejects recognised events with malformed payloads", async () => {
    const { isResearchEvent } = await import("@/lib/events/emit");
    expect(isResearchEvent({ type: "report_ready", at: 1, report: "x" })).toBe(false);
    expect(isResearchEvent({ type: "source_found", at: 1, source: { id: "S1" } })).toBe(false);
    expect(isResearchEvent({ type: "totally_unknown", at: 1 })).toBe(false);
    expect(isResearchEvent({ type: "report_ready", at: 1, report: "x", sources: [] })).toBe(true);
    expect(events.every(isResearchEvent)).toBe(true);
  });
});
