import { Annotation } from "@langchain/langgraph";
import type {
  Contradiction,
  Depth,
  Evidence,
  Finding,
  Gap,
  Insight,
  ReportLength,
  Source,
  SubQuestion,
  Usage,
} from "@/lib/schemas/domain";
import { addUsage, ZERO_USAGE } from "@/lib/schemas/domain";

/** Reducer: append new items to the existing list. */
const append = <T>(current: T[], update: T[]): T[] => current.concat(update);

/** Reducer: replace with the latest value (used for outputs that are recomputed each pass). */
const replace = <T>(_current: T, update: T): T => update;

/**
 * Shared, typed state for the research graph.
 *
 * - Accumulating channels (`subQuestions`, `sources`, `evidence`, `notes`) use an
 *   append reducer so the multi-hop pass adds to what the first pass found.
 * - Analysis outputs (`findings`, `contradictions`, `gaps`) are replaced each time
 *   Critical Analysis runs, because it re-reads all evidence.
 * - `usage` sums token usage from every agent.
 */
export const ResearchState = Annotation.Root({
  query: Annotation<string>(),
  depth: Annotation<Depth>({ reducer: replace, default: () => "quick" }),
  length: Annotation<ReportLength>({ reducer: replace, default: () => "full" }),
  subQuestions: Annotation<SubQuestion[]>({ reducer: append, default: () => [] }),
  sources: Annotation<Source[]>({
    // Credibility updates arrive as full replacements of existing ids; new ids are appended.
    reducer: (current, update) => {
      const byId = new Map(current.map((s) => [s.id, s]));
      for (const s of update) byId.set(s.id, s);
      return [...byId.values()];
    },
    default: () => [],
  }),
  evidence: Annotation<Evidence[]>({ reducer: append, default: () => [] }),
  findings: Annotation<Finding[]>({ reducer: replace, default: () => [] }),
  contradictions: Annotation<Contradiction[]>({ reducer: replace, default: () => [] }),
  gaps: Annotation<Gap[]>({ reducer: replace, default: () => [] }),
  insights: Annotation<Insight[]>({ reducer: replace, default: () => [] }),
  /** Index of the latest retrieval pass: 0 = first pass, 1 = multi-hop follow-up. */
  iteration: Annotation<number>({ reducer: replace, default: () => 0 }),
  /** Completed retrieval passes. Counted by the graph, never inferred from model output. */
  passes: Annotation<number>({ reducer: replace, default: () => 0 }),
  report: Annotation<string>({ reducer: replace, default: () => "" }),
  usage: Annotation<Usage>({ reducer: addUsage, default: () => ZERO_USAGE }),
  /** Methodology notes, e.g. sources that failed. Shown in the report. */
  notes: Annotation<string[]>({ reducer: append, default: () => [] }),
});

export type ResearchStateType = typeof ResearchState.State;
export type ResearchStateUpdate = typeof ResearchState.Update;
