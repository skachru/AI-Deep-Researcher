import type { ClaimStatus } from "@/lib/schemas/domain";

/** Pure helpers that prepare the report markdown for rendering and export. */

const STATUS_TAG = /\{\{(Corroborated|Single-source|Disputed)\}\}/g;
/** [3] or [1, 4] — but not markdown links "[text](url)". */
const CITATION_GROUP = /\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\](?!\()/g;

export const CITE_PREFIX = "#cite-";
export const CLAIM_PREFIX = "claim:";

export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/\[\d+\]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Converts citations to anchor links and claim tags to inline code we render as badges. */
export function prepareReportMarkdown(md: string): string {
  return md
    .replace(STATUS_TAG, (_, status: string) => `\`${CLAIM_PREFIX}${status}\``)
    .replace(CITATION_GROUP, (_, group: string) =>
      group
        .split(",")
        .map((n) => `[${n.trim()}](${CITE_PREFIX}${n.trim()})`)
        .join(""),
    );
}

/** Markdown for export: claim tags become readable text. */
export function exportMarkdown(md: string): string {
  return md.replace(STATUS_TAG, (_, status: string) => `*(${status})*`);
}

export interface TocEntry {
  level: 2 | 3;
  text: string;
  id: string;
}

export function extractToc(md: string): TocEntry[] {
  return md.split("\n").flatMap((line): TocEntry[] => {
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (!m) return [];
    const text = m[2]
      .replace(/\[(\d+)\]/g, "")
      .replace(/[*_`]/g, "")
      .trim();
    return [{ level: m[1].length as 2 | 3, text, id: headingId(text) }];
  });
}

export function isClaimStatus(value: string): value is ClaimStatus {
  return value === "Corroborated" || value === "Single-source" || value === "Disputed";
}
