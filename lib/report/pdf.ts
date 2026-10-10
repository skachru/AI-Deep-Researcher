import { Lexer, type Token, type Tokens } from "marked";
import type { Content, ContentText, TDocumentDefinitions } from "pdfmake/interfaces";
import { plainClaims } from "@/lib/report/markdown";
import type { ReportDocument } from "@/lib/report/html";

/** Markdown → pdfmake document definition. Pure (unit-tested). */

type Inline = string | ContentText;

const ACCENT = "#5E6AD2";

function inline(tokens: Token[] | undefined, style: Partial<ContentText> = {}): Inline[] {
  if (!tokens) return [];
  return tokens.flatMap((t): Inline[] => {
    switch (t.type) {
      case "strong":
        return inline((t as Tokens.Strong).tokens, { ...style, bold: true });
      case "em":
        return inline((t as Tokens.Em).tokens, { ...style, italics: true });
      case "link": {
        const link = t as Tokens.Link;
        const safe = /^https?:\/\//i.test(link.href) ? link.href : undefined;
        return inline(link.tokens, { ...style, color: ACCENT, link: safe });
      }
      case "codespan":
        return [{ text: (t as Tokens.Codespan).text, ...style, background: "#F3F3F5" }];
      case "br":
        return ["\n"];
      case "text": {
        const text = t as Tokens.Text;
        return text.tokens ? inline(text.tokens, style) : [{ text: decode(text.text), ...style }];
      }
      case "escape":
        return [{ text: (t as Tokens.Escape).text, ...style }];
      default:
        return "raw" in t && typeof t.raw === "string" ? [{ text: decode(t.raw), ...style }] : [];
    }
  });
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

function block(t: Token): Content[] {
  switch (t.type) {
    case "heading": {
      const h = t as Tokens.Heading;
      const style = h.depth === 1 ? "h1" : h.depth === 2 ? "h2" : "h3";
      return [{ text: inline(h.tokens), style }];
    }
    case "paragraph":
      return [{ text: inline((t as Tokens.Paragraph).tokens), style: "p" }];
    case "list": {
      const list = t as Tokens.List;
      const items = list.items.map((item) => ({
        stack: item.tokens.flatMap((child) =>
          child.type === "text" ? [{ text: inline((child as Tokens.Text).tokens ?? [child]) }] : block(child),
        ),
      }));
      return [list.ordered ? { ol: items, style: "list" } : { ul: items, style: "list" }];
    }
    case "blockquote":
      return [
        {
          stack: (t as Tokens.Blockquote).tokens.flatMap(block),
          italics: true,
          color: "#6B6F7B",
          margin: [12, 0, 0, 8],
        },
      ];
    case "table": {
      const table = t as Tokens.Table;
      const header = table.header.map((c) => ({ text: inline(c.tokens), bold: true }));
      const rows = table.rows.map((r) => r.map((c) => ({ text: inline(c.tokens) })));
      return [
        {
          table: { headerRows: 1, body: [header, ...rows] },
          layout: "lightHorizontalLines",
          fontSize: 9,
          margin: [0, 6, 0, 10],
        },
      ];
    }
    case "code":
      return [{ text: (t as Tokens.Code).text, fontSize: 9, background: "#F3F3F5", margin: [0, 4, 0, 8] }];
    case "hr":
      return [
        {
          canvas: [{ type: "line", x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: "#E6E6EA" }],
          margin: [0, 8, 0, 8],
        },
      ];
    default:
      return [];
  }
}

export function reportToPdfDefinition(doc: ReportDocument): TDocumentDefinitions {
  const tokens = new Lexer({ gfm: true }).lex(plainClaims(doc.markdown));
  return {
    info: { title: doc.query, creator: "Lumen", producer: "Lumen" },
    pageMargins: [40, 50, 40, 50],
    footer: (page, pages) => ({
      columns: [
        { text: "Lumen · multi-agent research report", color: "#9A9EA8" },
        { text: `${page} / ${pages}`, alignment: "right", color: "#9A9EA8" },
      ],
      fontSize: 8,
      margin: [40, 16, 40, 0],
    }),
    content: [
      { text: `Generated ${doc.generatedAt.toUTCString()}`, fontSize: 8, color: "#9A9EA8", margin: [0, 0, 0, 10] },
      ...tokens.flatMap(block),
    ],
    defaultStyle: { font: "Roboto", fontSize: 10.5, lineHeight: 1.35, color: "#1B1B1F" },
    styles: {
      h1: { fontSize: 18, bold: true, margin: [0, 0, 0, 10] },
      h2: { fontSize: 13.5, bold: true, color: "#1B1B1F", margin: [0, 16, 0, 6] },
      h3: { fontSize: 11.5, bold: true, margin: [0, 10, 0, 4] },
      p: { margin: [0, 0, 0, 6] },
      list: { margin: [0, 0, 0, 6] },
    },
  };
}

/** Renders the PDF on the server (Node runtime). Fonts come from pdfmake's bundled VFS. */
export async function renderReportPdf(doc: ReportDocument): Promise<Buffer> {
  const [{ default: pdfmake }, { default: vfs }] = await Promise.all([
    import("pdfmake"),
    import("pdfmake/build/vfs_fonts.js") as Promise<{ default: Record<string, string> }>,
  ]);
  // The Node build exposes its virtual file system directly (the typings only describe the browser API).
  const { virtualfs } = pdfmake as unknown as { virtualfs: { writeFileSync(name: string, data: Buffer): void } };
  for (const [name, data] of Object.entries(vfs)) virtualfs.writeFileSync(name, Buffer.from(data, "base64"));
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy(() => false);
  pdfmake.setFonts({
    Roboto: {
      normal: "Roboto-Regular.ttf",
      bold: "Roboto-Medium.ttf",
      italics: "Roboto-Italic.ttf",
      bolditalics: "Roboto-MediumItalic.ttf",
    },
  });
  return pdfmake.createPdf(reportToPdfDefinition(doc)).getBuffer();
}
