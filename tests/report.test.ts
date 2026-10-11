import { describe, expect, it } from "vitest";
import { buildMethodology, buildReferences } from "@/lib/agents/reporter";
import { exportMarkdown, extractToc, prepareReportMarkdown } from "@/lib/client/report";
import { renderReportHtml } from "@/lib/report/html";
import { linkCitations, renderInteractiveReportHtml, withoutSummary } from "@/lib/report/interactive";
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

describe("interactive HTML report", () => {
  const sources = [1, 2].map((n) => ({
    id: `S${n}`,
    title: `Title ${n} <b>`,
    url: `https://example.com/${n}`,
    type: "web" as const,
    credibility: 70,
    publishedDate: null,
    image: null,
  }));

  it("links known citations to source cards and leaves unknown ones as text", () => {
    const out = linkCitations('a <sup class="cite">[1, 3]</sup>', new Set([1]));
    expect(out).toBe(
      'a <span class="cites"><a class="cite" href="#src-1" data-n="1">1</a><span class="cite">3</span></span>',
    );
  });

  it("moves the summary into key takeaways and keeps report text inert", () => {
    expect(withoutSummary(sample)).not.toContain("Yes, mostly");
    const doc = renderInteractiveReportHtml({
      query: "Is X <true>?",
      markdown: sample,
      sources,
      generatedAt: new Date(0),
      appUrl: "https://lumen.example",
    });
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain('id="key-takeaways"');
    expect(doc.match(/Yes, mostly/g)).toHaveLength(1);
    expect(doc).toContain('id="src-2"');
    expect(doc).toContain("Title 1 &lt;b&gt;");
    expect(doc).toContain('href="https://lumen.example"');
    expect(doc).not.toContain("<script>alert");
    expect(doc).not.toContain("javascript:alert");
    expect(doc.match(/<script>/g)).toHaveLength(1);
  });

  it("omits the call to action without a safe app URL", () => {
    const doc = renderInteractiveReportHtml({
      query: "q",
      markdown: sample,
      generatedAt: new Date(0),
      appUrl: "javascript:x",
    });
    expect(doc).not.toContain('class="cta"');
  });
});

describe("share messages", () => {
  it("shares plain key findings and a link through each app", async () => {
    const { buildShareMessage, shareBullets, shareHref } = await import("@/lib/client/share");
    expect(shareBullets(sample)).toEqual(["Yes, mostly", "With caveats"]);
    const m = buildShareMessage("Is X true?", sample, "https://lumen.app/share/abc", true);
    expect(m.text).toContain("• Yes, mostly");
    expect(m.text).not.toContain("{{");
    expect(shareHref("whatsapp", m)).toMatch(/^https:\/\/wa\.me\/\?text=.*lumen\.app%2Fshare%2Fabc$/);
    expect(shareHref("telegram", m)).toContain("t.me/share/url?url=https%3A%2F%2Flumen.app%2Fshare%2Fabc");
    expect(shareHref("gmail", m)).toContain("mail.google.com/mail/?view=cm&fs=1&su=Research%20report");
    expect(shareHref("email", m).startsWith("mailto:?subject=")).toBe(true);
  });
});
