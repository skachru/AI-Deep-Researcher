import type { Depth, Gap } from "@/lib/schemas/domain";

/** Maximum retrieval passes in total (first pass + one multi-hop follow-up). */
const MAX_RETRIEVAL_PASSES = 2;

const ROUTE_RETRY = "retriever" as const;
const ROUTE_CONTINUE = "insight" as const;
export type AnalysisRoute = typeof ROUTE_RETRY | typeof ROUTE_CONTINUE;

export function importantGaps(gaps: Gap[]): Gap[] {
  return gaps.filter((g) => g.importance === "high" && g.followUpQuestion.trim().length > 0);
}

/**
 * Conditional edge after Critical Analysis (pure, unit-tested).
 * Loop back to the Retriever only in Standard depth, if there are important
 * gaps AND we have not yet used the follow-up pass (iteration is 0-based).
 * Quick depth skips the loop to keep latency low.
 */
export function routeAfterAnalysis(state: { gaps: Gap[]; iteration: number; depth: Depth }): AnalysisRoute {
  const canLoop = state.depth === "standard" && state.iteration < MAX_RETRIEVAL_PASSES - 1;
  return canLoop && importantGaps(state.gaps).length > 0 ? ROUTE_RETRY : ROUTE_CONTINUE;
}
