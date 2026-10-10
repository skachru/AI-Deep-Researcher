import { Marked, type Tokens } from "marked";

/** Pure helpers for turning the report markdown into export formats. */

const STATUS_TAG = /\{\{(Corroborated|Single-source|Disputed)\}\}/g;

/** Returns the body of the "## Summary" (or legacy "## Executive Summary") section. */
export function extractSummary(md: string): string {
  const match = md.match(/^##\s+(?:Executive\s+)?Summary\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/im);
  return match ? match[1].trim() : "";
}

/** Plain-text claim labels for formats without badges. */
export function plainClaims(md: string): string {
  return md.replace(STATUS_TAG, (_, s: string) => `(${s})`);
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Markdown → HTML with raw HTML disabled (report text derives from untrusted
 * web content) and only http(s) links allowed.
 */
export function markdownToSafeHtml(md: string): string {
  const marked = new Marked({ gfm: true, async: false });
  marked.use({
    renderer: {
      html: (token: Tokens.HTML | Tokens.Tag) => escapeHtml(token.text),
      link(token: Tokens.Link) {
        const text = this.parser.parseInline(token.tokens);
        return /^https?:\/\//i.test(token.href)
          ? `<a href="${escapeHtml(token.href)}" target="_blank" rel="noopener noreferrer">${text}</a>`
          : text;
      },
      image: (token: Tokens.Image) => escapeHtml(token.text),
    },
  });
  const withBadges = md.replace(STATUS_TAG, (_, s: string) => `⟦claim:${s}⟧`);
  const html = marked.parse(withBadges) as string;
  return html
    .replace(/⟦claim:([A-Za-z-]+)⟧/g, (_, s: string) => `<span class="claim claim-${s.toLowerCase()}">${s}</span>`)
    .replace(/\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\](?!\()/g, '<sup class="cite">[$1]</sup>');
}
