import { describe, expect, it } from "vitest";
import { buildMethodology, buildReferences } from "@/lib/agents/reporter";
import { exportMarkdown, extractToc, prepareReportMarkdown } from "@/lib/client/report";
import type { Source } from "@/lib/schemas/domain";

const source = (n: number, over: Partial<Source> = {}): Source => ({
  id: `S${n}`,
  title: `Source ${n}`,
  url: `https://example.com/${n}`,
  type: "web",
  publishedDate: "2025-01-01",
  snippet: "",
  content: "",
  credibility: 60,
  retrievedBy: "test",
  pass: 0,
  ...over,
});

describe("report markdown", () => {
  it("links citations and groups but leaves markdown links alone", () => {
    const out = prepareReportMarkdown("A [1] and [2, 3]. See [Title](https://x.com).");
    expect(out).toBe("A [1](#cite-1) and [2](#cite-2)[3](#cite-3). See [Title](https://x.com).");
  });

  it("turns claim tags into badge markers and readable export text", () => {
    expect(prepareReportMarkdown("x {{Disputed}}")).toBe("x `claim:Disputed`");
    expect(exportMarkdown("x {{Corroborated}}")).toBe("x *(Corroborated)*");
  });

  it("extracts a table of contents from h2/h3", () => {
    expect(extractToc("# T\n## Executive Summary\n### Theme [2]\ntext")).toEqual([
      { level: 2, text: "Executive Summary", id: "executive-summary" },
      { level: 3, text: "Theme", id: "theme" },
    ]);
  });

  it("builds numbered references sorted by source number", () => {
    const refs = buildReferences([source(10), source(2, { title: "Two [draft]" })]);
    expect(refs.split("\n").slice(2)).toEqual([
      "2. [Two draft](https://example.com/2) — example.com, 2025-01-01 · web · credibility 60/100",
      "10. [Source 10](https://example.com/10) — example.com, 2025-01-01 · web · credibility 60/100",
    ]);
  });

  it("reports failures and passes in methodology", () => {
    const m = buildMethodology({
      sources: [source(1), source(2, { type: "paper" })],
      subQuestions: [],
      evidence: [],
      iteration: 1,
      notes: ["arxiv failed"],
      depth: "quick",
    });
    expect(m).toContain("1 arXiv papers");
    expect(m).toContain("multi-hop follow-up");
    expect(m).toContain("- arxiv failed");
  });
});
