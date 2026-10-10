import type { Evidence, Source, SubQuestion } from "@/lib/schemas/domain";

/** Helpers that render state into prompt context. Pure. */

export function domainOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function renderSourceIndex(sources: Source[]): string {
  return sources
    .map(
      (s) =>
        `${s.id} | ${s.type} | ${domainOf(s.url)} | ${s.publishedDate ?? "undated"} | prior credibility ${s.credibility} | ${s.title}`,
    )
    .join("\n");
}

/** Evidence grouped by sub-question, wrapped in <source> tags to mark it as untrusted data. */
export function renderEvidence(subQuestions: SubQuestion[], evidence: Evidence[]): string {
  return subQuestions
    .map((sq) => {
      const items = evidence.filter((e) => e.subQuestionId === sq.id);
      const body = items.length
        ? items.map((e) => `<source id="${e.sourceId}">\n${e.text}\n</source>`).join("\n")
        : "(no evidence retrieved)";
      return `### ${sq.id}: ${sq.question}\n${body}`;
    })
    .join("\n\n");
}

/** Keeps only ids that refer to real sources (guards against hallucinated ids). */
export function validIds(ids: string[], sources: Pick<Source, "id">[]): string[] {
  const known = new Set(sources.map((s) => s.id));
  return [...new Set(ids.map((id) => id.trim().toUpperCase()))].filter((id) => known.has(id));
}
