import type { Source, SourceType } from "@/lib/schemas/domain";

const TYPE_PRIOR: Record<SourceType, number> = { paper: 75, wiki: 60, news: 55, web: 50 };

const HIGH_TRUST_DOMAINS = [
  /\.gov(\.|$)/,
  /\.edu(\.|$)/,
  /\.ac\.[a-z]{2}$/,
  /(^|\.)who\.int$/,
  /(^|\.)oecd\.org$/,
  /(^|\.)iea\.org$/,
  /(^|\.)ipcc\.ch$/,
  /(^|\.)nature\.com$/,
  /(^|\.)science\.org$/,
  /(^|\.)nber\.org$/,
  /(^|\.)arxiv\.org$/,
];

export const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

/**
 * Retrieval-time credibility prior from source type, domain and recency. Pure.
 * The Critical Analysis agent later blends in its own judgement and corroboration.
 */
export function heuristicCredibility(source: Pick<Source, "type" | "url" | "publishedDate">, now = new Date()): number {
  let score = TYPE_PRIOR[source.type];
  try {
    const host = new URL(source.url).host;
    if (HIGH_TRUST_DOMAINS.some((re) => re.test(host))) score += 12;
  } catch {
    score -= 10;
  }
  if (source.publishedDate) {
    const ageYears = (now.getTime() - new Date(source.publishedDate).getTime()) / (365 * 86_400_000);
    if (ageYears < 2) score += 5;
    else if (ageYears > 8) score -= 8;
  }
  return clamp(score);
}

/** Blend the heuristic prior with the LLM's score and a corroboration bonus. Pure. */
export function blendCredibility(prior: number, llmScore: number | undefined, corroborations: number): number {
  const base = llmScore === undefined ? prior : 0.4 * prior + 0.6 * clamp(llmScore);
  return clamp(base + Math.min(corroborations, 3) * 3);
}
