import type { SourceSummary, SourceType } from "@/lib/schemas/domain";

export type EvidenceStrength = "Strong" | "Moderate" | "Limited";

export interface Reliability {
  claims: { corroborated: number; singleSource: number; disputed: number; total: number };
  sources: { total: number; byType: Record<SourceType, number>; avgCredibility: number; highCredibility: number };
  strength: EvidenceStrength;
}

/**
 * Reliability metrics shown on every report, derived from the Critical
 * Analysis claim labels in the report and the scored sources. Pure.
 */
export function computeReliability(
  markdown: string,
  sources: Pick<SourceSummary, "type" | "credibility">[],
): Reliability {
  const count = (label: string) => (markdown.match(new RegExp(`\\{\\{${label}\\}\\}`, "g")) ?? []).length;
  const corroborated = count("Corroborated");
  const singleSource = count("Single-source");
  const disputed = count("Disputed");
  const total = corroborated + singleSource + disputed;

  const byType: Record<SourceType, number> = { web: 0, news: 0, paper: 0, wiki: 0 };
  for (const s of sources) byType[s.type] += 1;
  const avgCredibility = sources.length
    ? Math.round(sources.reduce((n, s) => n + s.credibility, 0) / sources.length)
    : 0;
  const highCredibility = sources.filter((s) => s.credibility >= 75).length;

  const corroboratedShare = total ? corroborated / total : 0;
  const disputedShare = total ? disputed / total : 0;
  const strength: EvidenceStrength =
    sources.length >= 5 && corroboratedShare >= 0.6 && avgCredibility >= 60 && disputedShare <= 0.25
      ? "Strong"
      : sources.length >= 3 && (corroboratedShare >= 0.3 || avgCredibility >= 60)
        ? "Moderate"
        : "Limited";

  return {
    claims: { corroborated, singleSource, disputed, total },
    sources: { total: sources.length, byType, avgCredibility, highCredibility },
    strength,
  };
}

export const STRENGTH_COPY: Record<EvidenceStrength, string> = {
  Strong: "Most key claims are backed by several independent, credible sources.",
  Moderate: "Key claims have some independent support; treat single-source points with care.",
  Limited: "Evidence is thin or disputed; read the findings as provisional.",
};

/** Splits the report into body and References section so the UI can render references as cards. Pure. */
export function splitReferences(markdown: string): { body: string; references: string } {
  const idx = markdown.search(/^##\s+References\s*$/m);
  return idx === -1
    ? { body: markdown, references: "" }
    : { body: markdown.slice(0, idx), references: markdown.slice(idx) };
}

/** Removes the leading "# Title" line (the UI shows it in the cover). Pure. */
export function stripTitle(markdown: string): string {
  return markdown.replace(/^#\s+.+\n+/, "");
}
