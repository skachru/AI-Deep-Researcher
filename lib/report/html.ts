import { markdownToSafeHtml } from "@/lib/report/markdown";
import type { ExportSource } from "@/lib/report/payload";
import { computeReliability, splitReferences, STRENGTH_COPY, stripTitle } from "@/lib/report/reliability";

export interface ReportDocument {
  query: string;
  /** Full report markdown (starts with "# <query>" and a "## Summary" section). */
  markdown: string;
  sources?: ExportSource[];
  generatedAt: Date;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const safeUrl = (u: string | null | undefined) => (u && /^https:\/\//i.test(u) ? esc(u) : null);

const domain = (url: string) => {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
};

const TYPE_LABEL = { web: "Web", news: "News", paper: "Paper", wiki: "Wiki" } as const;

const STYLES = `
  :root { color-scheme: light; }
  body { margin: 0; background: #f4f4f7; color: #1b1b1f; font: 15px/1.7 Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .page { max-width: 780px; margin: 32px auto; background: #fff; border: 1px solid #e6e6ea; border-radius: 14px; overflow: hidden; }
  .cover { padding: 36px 44px; background: linear-gradient(135deg, #eef0fc 0%, #f5f3ff 55%, #fdf6ee 100%); border-bottom: 1px solid #e6e6ea; display: flex; gap: 24px; align-items: flex-start; }
  .cover .eyebrow { font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; color: #5e6ad2; }
  .cover h1 { font-size: 27px; line-height: 1.22; letter-spacing: -0.02em; margin: 8px 0 6px; }
  .cover .meta { color: #6b6f7b; font-size: 13px; }
  .cover img { width: 112px; height: 112px; object-fit: cover; border-radius: 12px; border: 1px solid #fff; flex-shrink: 0; }
  .content { padding: 28px 44px 40px; }
  .rel { border: 1px solid #e6e6ea; background: #fafafb; border-radius: 12px; padding: 18px 20px; margin-bottom: 8px; }
  .chip { display: inline-block; border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 700; }
  .chip.Strong { background: #e8f6ef; color: #2f9e6c; } .chip.Moderate { background: #eef0fc; color: #5e6ad2; } .chip.Limited { background: #fdf3e2; color: #c27a12; }
  .rel .copy { color: #6b6f7b; font-size: 12.5px; margin-left: 8px; }
  .stats { display: flex; gap: 28px; margin-top: 14px; flex-wrap: wrap; }
  .stats b { display: block; font-size: 20px; letter-spacing: -0.01em; }
  .stats span { color: #9a9ea8; font-size: 11.5px; }
  .bar { display: flex; gap: 2px; height: 8px; border-radius: 999px; overflow: hidden; margin-top: 14px; }
  .legend { color: #6b6f7b; font-size: 12px; margin-top: 6px; }
  h2 { font-size: 19px; margin: 34px 0 10px; letter-spacing: -0.01em; }
  h3 { font-size: 15px; margin: 22px 0 6px; }
  a { color: #5e6ad2; text-decoration: none; }
  ul, ol { padding-left: 22px; } li { margin: 5px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #e6e6ea; padding: 6px 10px; text-align: left; }
  sup.cite { font-size: 11px; color: #6b6f7b; }
  .claim { display: inline-block; font-size: 11px; font-weight: 600; border-radius: 4px; padding: 0 6px; margin-left: 4px; }
  .claim-corroborated { background: #e8f6ef; color: #2f9e6c; } .claim-disputed { background: #fcebeb; color: #d14a4a; } .claim-single-source { background: #f3f3f5; color: #6b6f7b; }
  .sources { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .src { display: flex; gap: 10px; border: 1px solid #e6e6ea; border-radius: 10px; padding: 10px; color: inherit; }
  .src img.thumb { width: 56px; height: 56px; object-fit: cover; border-radius: 8px; flex-shrink: 0; background: #f3f3f5; }
  .src .fav { width: 56px; height: 56px; border-radius: 8px; background: #eef0fc; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .src .t { font-size: 13px; font-weight: 600; line-height: 1.35; color: #1b1b1f; }
  .src .d { font-size: 11.5px; color: #9a9ea8; }
  .cred { height: 4px; background: #f3f3f5; border-radius: 99px; margin-top: 6px; overflow: hidden; } .cred i { display: block; height: 100%; background: #5e6ad2; }
  .foot { color: #9a9ea8; font-size: 12px; border-top: 1px solid #e6e6ea; padding: 14px 44px; }
  @media (max-width: 640px) { .cover, .content, .foot { padding-left: 20px; padding-right: 20px; } .sources { grid-template-columns: 1fr; } .cover img { display: none; } }
  @media print { body { background: #fff; } .page { border: 0; margin: 0; border-radius: 0; } }
`;

function reliabilityHtml(markdown: string, sources: ExportSource[]): string {
  const r = computeReliability(markdown, sources);
  const { corroborated, singleSource, disputed, total } = r.claims;
  const pct = total ? Math.round((corroborated / total) * 100) : 0;
  const seg = (n: number, color: string) =>
    n ? `<i style="display:block;width:${(n / total) * 100}%;background:${color}"></i>` : "";
  return `<section class="rel">
  <span class="chip ${r.strength}">${r.strength} evidence</span><span class="copy">${esc(STRENGTH_COPY[r.strength])}</span>
  <div class="stats">
    <div><b>${r.sources.total}</b><span>sources checked</span></div>
    <div><b>${pct}%</b><span>claims corroborated</span></div>
    <div><b>${disputed}</b><span>disputed claims</span></div>
    <div><b>${r.sources.avgCredibility}</b><span>avg. source credibility</span></div>
  </div>
  ${
    total
      ? `<div class="bar">${seg(corroborated, "#2f9e6c")}${seg(singleSource, "#d6d6dc")}${seg(disputed, "#d14a4a")}</div>
  <div class="legend"><span style="color:#2f9e6c">●</span> Corroborated ${corroborated} &nbsp; <span style="color:#b4b4bc">●</span> Single-source ${singleSource} &nbsp; <span style="color:#d14a4a">●</span> Disputed ${disputed}</div>`
      : ""
  }
</section>`;
}

function sourcesHtml(sources: ExportSource[]): string {
  const cards = [...sources]
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
    .map((s) => {
      const url = safeUrl(s.url) ?? (s.url.startsWith("http://") ? esc(s.url) : "#");
      const thumb = safeUrl(s.image);
      const visual = thumb
        ? `<img class="thumb" src="${thumb}" alt="">`
        : `<div class="fav"><img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain(s.url))}&amp;sz=64" width="24" height="24" alt=""></div>`;
      return `<a class="src" href="${url}" target="_blank" rel="noopener noreferrer">${visual}<div>
  <div class="d">[${esc(s.id.slice(1))}] ${TYPE_LABEL[s.type]} · ${esc(domain(s.url))}${s.publishedDate ? ` · ${esc(s.publishedDate)}` : ""}</div>
  <div class="t">${esc(s.title)}</div>
  <div class="cred"><i style="width:${Math.max(0, Math.min(100, s.credibility))}%"></i></div></div></a>`;
    })
    .join("\n");
  return `<h2>Sources</h2><div class="sources">${cards}</div>`;
}

/** A self-contained, static HTML report used as the email body (mail clients drop scripts). */
export function renderReportHtml(doc: ReportDocument): string {
  const sources = doc.sources ?? [];
  const { body, references } = splitReferences(doc.markdown);
  const cover = safeUrl(sources.find((s) => s.image)?.image);
  const main = sources.length
    ? markdownToSafeHtml(stripTitle(body)) + sourcesHtml(sources)
    : markdownToSafeHtml(stripTitle(body) + references);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(doc.query)} — Lumen research report</title>
<style>${STYLES}</style>
</head>
<body>
<main class="page">
<header class="cover">
  <div style="flex:1;min-width:0">
    <div class="eyebrow">Lumen research report</div>
    <h1>${esc(doc.query)}</h1>
    <div class="meta">Verified across ${sources.length || "multiple"} sources by four cooperating AI agents · ${doc.generatedAt.toUTCString()}</div>
  </div>
  ${cover ? `<img src="${cover}" alt="">` : ""}
</header>
<div class="content">
${reliabilityHtml(doc.markdown, sources)}
${main}
</div>
<div class="foot">Attached: the report as a PDF, and an interactive HTML version (open it in your browser to filter claims and preview sources).<br>Generated by Lumen · multi-agent deep research. Claims are labelled Corroborated, Single-source or Disputed by the Critical Analysis agent.</div>
</main>
</body>
</html>`;
}
