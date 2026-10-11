import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import { renderInteractiveReportHtml } from "@/lib/report/interactive";

const sources = [
  { id: "S1", title: "Paper one", url: "https://arxiv.org/abs/1", type: "paper" as const, credibility: 80 },
  { id: "S2", title: "Web two", url: "https://web.com/2", type: "web" as const, credibility: 70 },
];
const markdown = `# Q?

## Summary
- Takeaway backed by a paper [1].

## Key Findings
- Finding from the web [2] {{Single-source}}
`;

function load() {
  const html = renderInteractiveReportHtml({ query: "Q?", markdown, sources, generatedAt: new Date(0) });
  const dom = new JSDOM(html, {
    runScripts: "dangerously",
    beforeParse(w) {
      w.matchMedia = () => ({ matches: true }) as unknown as MediaQueryList;
      w.HTMLElement.prototype.scrollIntoView = () => undefined;
    },
  });
  return dom.window.document;
}

describe("interactive report script", () => {
  it("a Key takeaways citation reveals its source even while sources are filtered", () => {
    const d = load();
    (d.querySelector('.f-src[data-t="web"]') as HTMLElement).click();
    expect(d.getElementById("src-1")!.classList.contains("hide")).toBe(true);
    const cite = d.querySelector('#key-takeaways a.cite[data-n="1"]') as HTMLElement;
    cite.click();
    expect(d.getElementById("src-1")!.classList.contains("hide")).toBe(false);
    expect(d.getElementById("src-1")!.classList.contains("flash")).toBe(true);
  });
});
