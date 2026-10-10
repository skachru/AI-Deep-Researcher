import { markdownToSafeHtml } from "@/lib/report/markdown";

export interface ReportDocument {
  query: string;
  /** Full report markdown (starts with "# <query>" and a "## Summary" section). */
  markdown: string;
  generatedAt: Date;
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const STYLES = `
  :root { color-scheme: light; }
  body { margin: 0; background: #f7f7f8; color: #1b1b1f; font: 15px/1.7 Inter, -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .page { max-width: 760px; margin: 32px auto; background: #fff; border: 1px solid #e6e6ea; border-radius: 10px; padding: 40px 48px; }
  .brand { font-size: 12px; color: #6b6f7b; letter-spacing: .02em; margin-bottom: 20px; }
  .brand b { color: #5e6ad2; }
  h1 { font-size: 26px; line-height: 1.25; letter-spacing: -0.02em; margin: 0 0 8px; }
  h2 { font-size: 19px; margin: 36px 0 10px; }
  h3 { font-size: 15px; margin: 22px 0 6px; }
  a { color: #5e6ad2; text-decoration: none; }
  ul, ol { padding-left: 22px; }
  li { margin: 5px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #e6e6ea; padding: 6px 10px; text-align: left; }
  sup.cite { font-size: 11px; color: #6b6f7b; }
  .claim { display: inline-block; font-size: 11px; font-weight: 600; border-radius: 4px; padding: 0 6px; margin-left: 4px; }
  .claim-corroborated { background: #e8f6ef; color: #2f9e6c; }
  .claim-disputed { background: #fcebeb; color: #d14a4a; }
  .claim-single-source { background: #f3f3f5; color: #6b6f7b; }
  .meta { color: #6b6f7b; font-size: 13px; margin-bottom: 8px; }
  @media print { body { background: #fff; } .page { border: 0; margin: 0; padding: 0; } }
`;

/** A self-contained, styled HTML file for download and email. */
export function renderReportHtml(doc: ReportDocument): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(doc.query)} — Lumen research report</title>
<style>${STYLES}</style>
</head>
<body>
<main class="page">
<div class="brand"><b>Lumen</b> · Multi-agent research report · ${doc.generatedAt.toUTCString()}</div>
${markdownToSafeHtml(doc.markdown)}
</main>
</body>
</html>`;
}
