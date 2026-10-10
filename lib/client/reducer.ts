import type { ResearchEvent, ToolName } from "@/lib/events/types";
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
import { addUsage, ZERO_USAGE } from "@/lib/schemas/domain";

export type AgentStatus = "idle" | "active" | "done";
export type RunStatus = "idle" | "running" | "done" | "error";

export interface ActivityItem {
  id: number;
  at: number;
  agent: AgentId | "system";
  kind: "start" | "complete" | "tool" | "source" | "finding" | "contradiction" | "insight" | "loop" | "error" | "info";
  message: string;
  tool?: ToolName;
  failed?: boolean;
}

export interface ResearchViewState {
  status: RunStatus;
  query: string;
  depth: Depth;
  startedAt: number | null;
  finishedAt: number | null;
  agents: Record<AgentId, AgentStatus>;
  activeAgent: AgentId | null;
  /** Number of retrieval passes started (1 or 2). */
  passes: number;
  /** Agent ids in the order they completed, to animate graph edges. */
  handoffs: Array<{ from: AgentId; to: AgentId }>;
  subQuestions: SubQuestion[];
  sources: SourceSummary[];
  findings: Finding[];
  contradictions: Contradiction[];
  insights: Insight[];
  activity: ActivityItem[];
  report: string | null;
  /** Fast preliminary answer, streamed in seconds. */
  quickSummary: string;
  quickSummaryStatus: "waiting" | "streaming" | "done";
  /** Id of the saved history entry, when history is enabled. */
  searchId: string | null;
  usage: Usage;
  error: string | null;
}

export const initialViewState: ResearchViewState = {
  status: "idle",
  query: "",
  depth: "quick",
  startedAt: null,
  finishedAt: null,
  agents: { retriever: "idle", analyst: "idle", insight: "idle", reporter: "idle" },
  activeAgent: null,
  passes: 0,
  handoffs: [],
  subQuestions: [],
  sources: [],
  findings: [],
  contradictions: [],
  insights: [],
  activity: [],
  report: null,
  quickSummary: "",
  quickSummaryStatus: "waiting",
  searchId: null,
  usage: ZERO_USAGE,
  error: null,
};

function log(state: ResearchViewState, item: Omit<ActivityItem, "id">): ActivityItem[] {
  return [...state.activity, { ...item, id: state.activity.length + 1 }];
}

function upsertSource(list: SourceSummary[], source: SourceSummary): SourceSummary[] {
  const idx = list.findIndex((s) => s.id === source.id);
  if (idx === -1) return [...list, source];
  const next = list.slice();
  next[idx] = source;
  return next;
}

/** Folds one streamed event into the UI state. Pure; shared by live runs and demo replays. */
export function applyEvent(state: ResearchViewState, e: ResearchEvent): ResearchViewState {
  try {
    return applyEventUnchecked(state, e) ?? state;
  } catch {
    // A malformed event (missing fields, unknown shape) is ignored rather than crashing the page.
    return state;
  }
}

function applyEventUnchecked(state: ResearchViewState, e: ResearchEvent): ResearchViewState | undefined {
  switch (e.type) {
    case "run_started":
      return {
        ...initialViewState,
        searchId: state.searchId,
        status: "running",
        query: e.query,
        depth: e.depth,
        startedAt: e.at,
        activity: [{ id: 1, at: e.at, agent: "system", kind: "info", message: `Research started (${e.depth})` }],
      };

    case "agent_started": {
      const prev = state.activeAgent ?? lastCompleted(state);
      const handoffs = prev && prev !== e.agent ? [...state.handoffs, { from: prev, to: e.agent }] : state.handoffs;
      return {
        ...state,
        agents: { ...state.agents, [e.agent]: "active" },
        activeAgent: e.agent,
        passes: e.agent === "retriever" ? state.passes + 1 : state.passes,
        handoffs,
        // Each analysis pass replaces findings and contradictions wholesale (as the graph state does),
        // so results the second pass resolved must not linger from the first.
        ...(e.agent === "analyst" ? { findings: [], contradictions: [] } : {}),
        activity: log(state, { at: e.at, agent: e.agent, kind: "start", message: e.message }),
      };
    }

    case "agent_completed":
      return {
        ...state,
        agents: { ...state.agents, [e.agent]: "done" },
        activeAgent: state.activeAgent === e.agent ? null : state.activeAgent,
        activity: log(state, { at: e.at, agent: e.agent, kind: "complete", message: e.message }),
      };

    case "tool_called":
      return {
        ...state,
        activity: log(state, {
          at: e.at,
          agent: e.agent,
          kind: "tool",
          tool: e.tool,
          failed: e.status === "failed",
          message:
            e.status === "ok"
              ? `${toolLabel(e.tool)} → ${e.resultCount} result${e.resultCount === 1 ? "" : "s"}`
              : `${toolLabel(e.tool)} failed — continuing without it`,
        }),
      };

    case "sub_questions":
      return {
        ...state,
        subQuestions: [...state.subQuestions, ...e.subQuestions],
        activity: log(state, {
          at: e.at,
          agent: "retriever",
          kind: "info",
          message: `Planned ${e.subQuestions.length} sub-questions`,
        }),
      };

    case "source_found": {
      const isNew = !state.sources.some((s) => s.id === e.source.id);
      return {
        ...state,
        sources: upsertSource(state.sources, e.source),
        activity: isNew
          ? log(state, { at: e.at, agent: "retriever", kind: "source", message: e.source.title })
          : state.activity,
      };
    }

    case "finding_added":
      return {
        ...state,
        findings: [...state.findings.filter((f) => f.subQuestionId !== e.finding.subQuestionId), e.finding],
        activity: log(state, { at: e.at, agent: "analyst", kind: "finding", message: e.finding.question }),
      };

    case "contradiction_found":
      return {
        ...state,
        contradictions: [...state.contradictions.filter((c) => c.topic !== e.contradiction.topic), e.contradiction],
        activity: log(state, {
          at: e.at,
          agent: "analyst",
          kind: "contradiction",
          message: `Contradiction: ${e.contradiction.topic}`,
        }),
      };

    case "insight_added":
      return {
        ...state,
        insights: [...state.insights.filter((i) => i.id !== e.insight.id), e.insight],
        activity: log(state, { at: e.at, agent: "insight", kind: "insight", message: e.insight.title }),
      };

    case "iteration_started":
      return {
        ...state,
        subQuestions: [...state.subQuestions, ...e.subQuestions],
        activity: log(state, {
          at: e.at,
          agent: "retriever",
          kind: "loop",
          message: `Multi-hop pass: ${e.subQuestions.map((q) => q.question).join(" · ")}`,
        }),
      };

    case "report_ready":
      return {
        ...state,
        status: "done",
        report: e.report,
        sources: e.sources,
        finishedAt: e.at,
      };

    case "usage":
      return { ...state, usage: addUsage(state.usage, e.usage) };

    case "summary_delta":
      return { ...state, quickSummary: state.quickSummary + e.text, quickSummaryStatus: "streaming" };

    case "summary_ready":
      return { ...state, quickSummary: e.summary || state.quickSummary, quickSummaryStatus: "done" };

    case "saved":
      return { ...state, searchId: e.searchId };

    case "error":
      return e.recoverable
        ? { ...state, activity: log(state, { at: e.at, agent: "system", kind: "error", message: e.message }) }
        : {
            ...state,
            status: "error",
            error: e.message,
            activeAgent: null,
            finishedAt: e.at,
            activity: log(state, { at: e.at, agent: "system", kind: "error", message: e.message }),
          };
    default:
      return state;
  }
}

function lastCompleted(state: ResearchViewState): AgentId | null {
  for (let i = state.activity.length - 1; i >= 0; i--) {
    const a = state.activity[i];
    if (a.kind === "complete" && a.agent !== "system") return a.agent;
  }
  return null;
}

function toolLabel(tool: ToolName): string {
  const labels: Record<ToolName, string> = {
    web_search: "Web search",
    news_search: "News search",
    arxiv: "arXiv",
    wikipedia: "Wikipedia",
    bm25: "BM25 ranking",
  };
  return labels[tool];
}
