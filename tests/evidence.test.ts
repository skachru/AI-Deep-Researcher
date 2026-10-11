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
  // S1 and S3 are on the same site; S2 is independent.
  const sites = new Map([
    [1, "a.com"],
    [2, "b.org"],
    [3, "a.com"],
  ]);

  it("removes citations to non-existent sources", () => {
    const out = verifyCitations("Another [1, 99] and [2][7].", sites);
    expect(out.markdown).toBe("Another [1] and [2].");
    expect(out.removed).toBe(2);
  });

  it("removes claim bullets left without a valid source instead of relabelling them", () => {
    const out = verifyCitations(
      "- Fake [9] {{Corroborated}}\n- Uncited claim {{Single-source}}\n- Real [2] {{Single-source}}",
      sites,
    );
    expect(out.markdown).toBe("- Real [2] {{Single-source}}");
    expect(out.dropped).toBe(2);
  });

  it("marks other prose that lost all its citations", () => {
    expect(verifyCitations("Overall it helps [42].", sites).markdown).toBe("Overall it helps. *(source not verified)*");
    expect(verifyCitations("## Key Findings", sites).markdown).toBe("## Key Findings");
  });

  it("needs two different sites for Corroborated, like the analyst", () => {
    const out = verifyCitations(
      "- Same site [1][3] {{Corroborated}}\n- Two sites [1][2] {{Corroborated}}\n- One [2] {{Corroborated}}",
      sites,
    );
    expect(out.markdown).toBe(
      "- Same site [1][3] {{Single-source}}\n- Two sites [1][2] {{Corroborated}}\n- One [2] {{Single-source}}",
    );
    expect(out.downgraded).toBe(2);
  });

  it("leaves markdown links alone", () => {
    expect(verifyCitations("See [5](https://x.com)", sites).markdown).toBe("See [5](https://x.com)");
  });
});

describe("report completeness", () => {
  it("detects an empty or summary-less draft and builds the report from the findings", async () => {
    const { fallbackReportBody, isCompleteReport } = await import("@/lib/agents/reporter");
    expect(isCompleteReport("", 30)).toBe(false);
    expect(isCompleteReport("## Key Findings\n- a b c d e f g", 3)).toBe(false);
    expect(isCompleteReport("## Summary\n- yes it does help a lot", 5)).toBe(true);
    const body = fallbackReportBody({
      findings: [
        {
          subQuestionId: "Q1",
          question: "Does it help?",
          summary: "Mostly yes.",
          claims: [{ text: "Faster", status: "Corroborated", sourceIds: ["S1", "S2"] }],
        },
      ],
      contradictions: [],
      insights: [],
    });
    expect(body).toContain("## Summary\n- Mostly yes.");
    expect(body).toContain("- Faster [1, 2] {{Corroborated}}");
  });
});
