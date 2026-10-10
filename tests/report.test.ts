import { describe, expect, it } from "vitest";
import { buildMethodology, buildReferences } from "@/lib/agents/reporter";
import { exportMarkdown, extractToc, prepareReportMarkdown } from "@/lib/client/report";
import { renderReportHtml } from "@/lib/report/html";
import { extractSummary, markdownToSafeHtml } from "@/lib/report/markdown";
import { renderReportPdf, reportToPdfDefinition } from "@/lib/report/pdf";
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

const sample = `# Is X true?

## Summary
- Yes, mostly [1] {{Corroborated}}
- With caveats [2, 3]

## Key Findings
Text with <script>alert(1)</script> and [a link](javascript:alert(1)) and [ok](https://ok.com).

## References

1. [Source](https://example.com/1)`;

describe("report exports", () => {
  it("extracts the summary section", () => {
    expect(extractSummary(sample)).toBe("- Yes, mostly [1] {{Corroborated}}\n- With caveats [2, 3]");
    expect(extractSummary("# T\n## Executive Summary\nOld style\n## Next")).toBe("Old style");
    expect(extractSummary("no summary")).toBe("");
  });

  it("renders safe HTML: escapes raw HTML, drops non-http links, adds badges and citations", () => {
    const html = markdownToSafeHtml(sample);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('<a href="https://ok.com"');
    expect(html).toContain('<span class="claim claim-corroborated">Corroborated</span>');
    expect(html).toContain('<sup class="cite">[2, 3]</sup>');
  });

  it("wraps HTML in a standalone document", () => {
    const doc = renderReportHtml({ query: "Is X <true>?", markdown: sample, generatedAt: new Date(0) });
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain("<title>Is X &lt;true&gt;? — Lumen research report</title>");
  });

  it("builds a PDF definition and renders a real PDF", async () => {
    const def = reportToPdfDefinition({ query: "Is X true?", markdown: sample, generatedAt: new Date(0) });
    expect(JSON.stringify(def.content)).toContain("(Corroborated)");
    expect(JSON.stringify(def.content)).not.toContain("javascript:");
    const pdf = await renderReportPdf({ query: "Is X true?", markdown: sample, generatedAt: new Date(0) });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
});
