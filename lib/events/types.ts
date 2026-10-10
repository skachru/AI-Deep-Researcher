import type {
  AgentId,
  Contradiction,
  Depth,
  Finding,
  Insight,
  SourceSummary,
  SubQuestion,
  Usage,
} from "@/lib/schemas/domain";

/**
 * Typed events streamed from the LangGraph run to the browser (SSE).
 * Every event carries `at` (epoch ms) so the UI and the demo recorder
 * can reconstruct timing.
 */
export type ToolName = "web_search" | "news_search" | "arxiv" | "wikipedia" | "bm25";

export type ResearchEventBody =
  | { type: "run_started"; query: string; depth: Depth }
  | { type: "agent_started"; agent: AgentId; message: string }
  | { type: "agent_completed"; agent: AgentId; message: string; durationMs: number }
  | {
      type: "tool_called";
      agent: AgentId;
      tool: ToolName;
      input: string;
      status: "ok" | "failed";
      resultCount: number;
      detail?: string;
    }
  | { type: "sub_questions"; subQuestions: SubQuestion[] }
  | { type: "source_found"; source: SourceSummary }
  | { type: "finding_added"; finding: Finding }
  | { type: "contradiction_found"; contradiction: Contradiction }
  | { type: "insight_added"; insight: Insight }
  | { type: "iteration_started"; iteration: number; reason: string; subQuestions: SubQuestion[] }
  | { type: "report_ready"; report: string; sources: SourceSummary[] }
  | { type: "usage"; usage: Usage }
  | { type: "error"; message: string; recoverable: boolean };

export type ResearchEvent = ResearchEventBody & { at: number };

export type ResearchEventType = ResearchEvent["type"];

export function stamp(body: ResearchEventBody): ResearchEvent {
  return { ...body, at: Date.now() };
}

/** A recorded run used by demo mode. */
export interface Recording {
  query: string;
  depth: Depth;
  recordedAt: string;
  events: ResearchEvent[];
}
