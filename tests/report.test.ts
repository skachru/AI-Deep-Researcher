import { describe, expect, it } from "vitest";
import { buildMethodology, buildReferences } from "@/lib/agents/reporter";
import { exportMarkdown, extractToc, prepareReportMarkdown } from "@/lib/client/report";
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
  it("opens with a greeting and context, then the findings, attachments and sign-off", async () => {
    const { shareDescription, shareHref } = await import("@/lib/client/share");
    const text = shareDescription("Is X true?", sample, "https://lumen.app", "Saurabh");
    const lines = text.split("\n");
    expect(lines[0]).toBe("Hi,");
    expect(lines[2]).toContain('I wanted to share a research report on "Is X true?"');
    expect(text).toContain("• Yes, mostly\n• With caveats");
    expect(text).toContain("attached as a PDF, along with an interactive HTML version");
    expect(lines.slice(-2)).toEqual(["Best regards,", "Saurabh"]);
    expect(shareDescription("q", sample, "u").endsWith("Best regards,")).toBe(true);
    expect(shareHref("whatsapp", "S", text, "https://lumen.app")).toMatch(/^https:\/\/wa\.me\/\?text=Hi%2C/);
    expect(shareHref("gmail", "S", text, "")).toContain("mail.google.com/mail/?view=cm&fs=1&su=S&body=");
  });

  it("builds an unsent email draft with both files attached", async () => {
    const { buildEmlDraft } = await import("@/lib/client/share");
    const eml = buildEmlDraft("Research report: café", "Hi,\nthere", [
      { name: "r.pdf", type: "application/pdf", base64: "JVBERi0=" },
      { name: "r.html", type: "text/html", base64: "PGgxPg==" },
    ]);
    expect(eml.startsWith("X-Unsent: 1\r\n")).toBe(true);
    expect(eml).toContain("Subject: =?UTF-8?B?");
    expect(eml).toContain('Content-Disposition: attachment; filename="r.pdf"');
    expect(eml).toContain('Content-Disposition: attachment; filename="r.html"');
    expect(eml.trimEnd().endsWith("--lumen-boundary--")).toBe(true);
  });

  it("renders the emailed message safely", async () => {
    const { messageHtml } = await import("@/lib/report/share-email");
    const html = messageHtml("Hi <b>you</b>\nSee https://lumen.app", "a@b.com");
    expect(html).toContain('Hi &lt;b&gt;you&lt;/b&gt;<br>See <a href="https://lumen.app"');
    expect(html).toContain("Sent via Lumen by a@b.com");
  });
});

describe("report length", () => {
  it("parses the length option and sizes the writer for each", async () => {
    const { parseReportLength, REPORT_LENGTHS } = await import("@/lib/schemas/domain");
    const { LENGTH_SETTINGS } = await import("@/lib/agents/reporter");
    expect(parseReportLength("short")).toBe("short");
    expect(parseReportLength("bogus")).toBe("full");
    expect(REPORT_LENGTHS.map((l) => l.label)).toEqual(["Short", "Medium", "Full length"]);
    expect(REPORT_LENGTHS.some((l) => /\d/.test(l.label))).toBe(false);
    expect(LENGTH_SETTINGS.short.prompt).toContain("about 100 words");
    expect(LENGTH_SETTINGS.medium.prompt).toContain("about 250 words");
    expect(LENGTH_SETTINGS.full.methodology).toBe(true);
    expect(LENGTH_SETTINGS.short.methodology).toBe(false);
  });
});
