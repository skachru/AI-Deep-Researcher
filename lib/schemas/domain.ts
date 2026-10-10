/**
 * Core domain types shared by the graph, the API route and the UI.
 * Kept free of runtime dependencies so client components can import them.
 */

export type AgentId = "retriever" | "analyst" | "insight" | "reporter";

export const AGENT_LABELS: Record<AgentId, string> = {
  retriever: "Contextual Retriever",
  analyst: "Critical Analysis",
  insight: "Insight Generation",
  reporter: "Report Builder",
};

export type Depth = "quick" | "standard";

export type SourceType = "web" | "news" | "paper" | "wiki";

export interface Source {
  /** Stable id of the form "S<n>"; the report cites it as [n]. */
  id: string;
  title: string;
  url: string;
  type: SourceType;
  publishedDate: string | null;
  snippet: string;
  /** Full retrieved text. Untrusted data: never interpreted as instructions. */
  content: string;
  /** 0–100, heuristic at retrieval time, refined by the Critical Analysis agent. */
  credibility: number;
  credibilityRationale?: string;
  retrievedBy: string;
  /** Preview image URL when the source provides one (e.g. Wikipedia lead image). */
  image?: string | null;
  /** Retrieval pass (0 = first pass, 1 = multi-hop follow-up). */
  pass: number;
}

/** Source without the heavy `content` field, as sent to the browser. */
export type SourceSummary = Omit<Source, "content">;

export interface SubQuestion {
  id: string;
  question: string;
  searchQuery: string;
  pass: number;
}

/** A BM25-ranked chunk of source text kept as evidence for a sub-question. */
export interface Evidence {
  id: string;
  sourceId: string;
  subQuestionId: string;
  text: string;
  score: number;
}

export type ClaimStatus = "Corroborated" | "Single-source" | "Disputed";

export interface Claim {
  text: string;
  status: ClaimStatus;
  sourceIds: string[];
}

export interface Finding {
  subQuestionId: string;
  question: string;
  summary: string;
  claims: Claim[];
}

export interface Contradiction {
  topic: string;
  claimA: { text: string; sourceId: string };
  claimB: { text: string; sourceId: string };
  assessment: string;
}

export type GapImportance = "high" | "medium" | "low";

export interface Gap {
  description: string;
  importance: GapImportance;
  followUpQuestion: string;
}

export type Confidence = "High" | "Medium" | "Low";

export interface Insight {
  id: string;
  title: string;
  hypothesis: string;
  confidence: Confidence;
  reasoning: string[];
  evidenceIds: string[];
}

export interface Usage {
  inputTokens: number;
  outputTokens: number;
}

export const ZERO_USAGE: Usage = { inputTokens: 0, outputTokens: 0 };

export function addUsage(a: Usage, b: Usage): Usage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}

export function toSummary(source: Source): SourceSummary {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { content, ...rest } = source;
  return rest;
}

/** "S7" -> 7 */
export function sourceNumber(id: string): number {
  return Number.parseInt(id.replace(/^S/, ""), 10);
}
