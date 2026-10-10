import { describe, expect, it } from "vitest";
import { claimStatusFromEvidence, normaliseAnalysis } from "@/lib/agents/analyst";
import { verifyCitations } from "@/lib/agents/reporter";
import type { Source } from "@/lib/schemas/domain";

const src = (n: number, url: string): Source => ({
  id: `S${n}`,
  title: `S${n}`,
  url,
  type: "web",
  publishedDate: null,
  snippet: "",
  content: "",
  credibility: 50,
  retrievedBy: "t",
  pass: 0,
});

const state = {
  subQuestions: [{ id: "Q1", question: "q?", searchQuery: "q", pass: 0 }],
  sources: [src(1, "https://a.com/x"), src(2, "https://b.org/y"), src(3, "https://a.com/z")],
};

const analysis = (
  claims: { text: string; status: "Corroborated" | "Single-source" | "Disputed"; sourceIds: string[] }[],
) => ({
  findings: [{ subQuestionId: "Q1", summary: "s", claims }],
  contradictions: [
    { topic: "self", claimA: { text: "a", sourceId: "S1" }, claimB: { text: "b", sourceId: "S1" }, assessment: "" },
    { topic: "real", claimA: { text: "a", sourceId: "S1" }, claimB: { text: "b", sourceId: "S2" }, assessment: "" },
  ],
  credibility: [],
  gaps: [],
});

describe("claim labels follow validated evidence", () => {
  it("downgrades Corroborated when a hallucinated id is removed ([S1, S99] → Single-source)", () => {
    const { findings, rescored } = normaliseAnalysis(
      analysis([{ text: "x", status: "Corroborated", sourceIds: ["S1", "S99"] }]),
      state,
    );
    expect(findings[0].claims[0]).toMatchObject({ sourceIds: ["S1"], status: "Single-source" });
    // and no corroboration bonus is given
    expect(rescored.find((s) => s.id === "S1")?.credibility).toBe(50);
  });

  it("requires two different sites, not two pages of the same site", () => {
    const domains = new Map(state.sources.map((s) => [s.id, new URL(s.url).host]));
    expect(claimStatusFromEvidence("Corroborated", ["S1", "S3"], domains)).toBe("Single-source");
    expect(claimStatusFromEvidence("Corroborated", ["S1", "S2"], domains)).toBe("Corroborated");
    expect(claimStatusFromEvidence("Disputed", ["S1"], domains)).toBe("Disputed");
  });

  it("drops claims left with no valid source and self-contradictions", () => {
    const { findings, contradictions } = normaliseAnalysis(
      analysis([{ text: "x", status: "Corroborated", sourceIds: ["S98", "S99"] }]),
      state,
    );
    expect(findings[0].claims).toHaveLength(0);
    expect(contradictions.map((c) => c.topic)).toEqual(["real"]);
  });
});

describe("report citations are checked against real sources", () => {
  const valid = new Set([1, 2, 3]);

  it("removes citations to non-existent sources", () => {
    const out = verifyCitations("A claim [99]. Another [1, 99] and [2][7].", valid);
    expect(out.markdown).toBe("A claim. Another [1] and [2].");
    expect(out.removed).toBe(3);
  });

  it("downgrades Corroborated tags on lines with fewer than two valid citations", () => {
    const out = verifyCitations(
      "- One source [1] {{Corroborated}}\n- Two [1][2] {{Corroborated}}\n- Fake [9] {{Corroborated}}",
      valid,
    );
    expect(out.markdown).toBe(
      "- One source [1] {{Single-source}}\n- Two [1][2] {{Corroborated}}\n- Fake {{Single-source}}",
    );
    expect(out.downgraded).toBe(2);
  });

  it("leaves markdown links alone", () => {
    expect(verifyCitations("See [5](https://x.com)", valid).markdown).toBe("See [5](https://x.com)");
  });
});
