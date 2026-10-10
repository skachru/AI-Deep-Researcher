import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { emit } from "@/lib/events/emit";
import type { ToolName } from "@/lib/events/types";
import type { ResearchStateType, ResearchStateUpdate } from "@/lib/graph/state";
import { importantGaps } from "@/lib/graph/routing";
import { budgetFor, createModel, usageFrom, type Effort } from "@/lib/llm";
import type { Source, SubQuestion, Usage } from "@/lib/schemas/domain";
import { addUsage, toSummary, ZERO_USAGE } from "@/lib/schemas/domain";
import { PlanSchema, type Plan } from "@/lib/schemas/llm";
import { searchArxiv } from "@/lib/tools/arxiv";
import { heuristicCredibility } from "@/lib/tools/credibility";
import { settle } from "@/lib/tools/http";
import { capSources, dedupeSources, rankEvidence } from "@/lib/tools/rank";
import type { RawSource } from "@/lib/tools/types";
import { webSearch } from "@/lib/tools/webSearch";
import { searchWikipedia } from "@/lib/tools/wikipedia";

/** Sources held back on the first pass so a multi-hop follow-up has room. */
const FOLLOW_UP_RESERVE = 3;

async function planQuery(query: string, effort: Effort): Promise<{ plan: Plan; usage: Usage }> {
  const model = createModel({ maxTokens: 4000, effort }).withStructuredOutput(PlanSchema, {
    method: "jsonSchema",
    includeRaw: true,
  });
  const { parsed, raw } = await model.invoke([
    new SystemMessage(
      "You are the Contextual Retriever agent in a multi-agent research system. Decompose the user's research " +
        "query into 3–5 distinct, non-overlapping sub-questions that together answer it, covering evidence for and against.",
    ),
    new HumanMessage(`Research query: ${query}`),
  ]);
  return { plan: parsed, usage: usageFrom(raw) };
}

interface ToolJob {
  tool: ToolName;
  input: string;
  run: () => Promise<{ sources: RawSource[]; usage?: Usage }>;
}

/**
 * Agent 1 — Contextual Retriever.
 * Pass 0: decompose the query, fetch web/news/arXiv/Wikipedia in parallel.
 * Pass 1 (multi-hop): turn important gaps into targeted sub-questions and fetch again.
 * Then dedupe, cap, chunk and BM25-rank chunks per sub-question.
 */
export async function retrieverAgent(
  state: ResearchStateType,
  config: LangGraphRunnableConfig,
): Promise<ResearchStateUpdate> {
  const startedAt = Date.now();
  const budget = budgetFor(state.depth);
  const isFollowUp = state.subQuestions.length > 0;
  const iteration = isFollowUp ? state.iteration + 1 : 0;
  let usage: Usage = ZERO_USAGE;
  const notes: string[] = [];

  emit(config, {
    type: "agent_started",
    agent: "retriever",
    message: isFollowUp
      ? "Running targeted follow-up retrieval for open gaps"
      : "Decomposing the query into sub-questions",
  });

  // 1. Decide what to look for.
  let subQuestions: SubQuestion[];
  let arxivQuery: string;
  let wikiTopics: string[];

  if (!isFollowUp) {
    const { plan, usage: planUsage } = await planQuery(state.query, budget.effort);
    usage = addUsage(usage, planUsage);
    subQuestions = plan.subQuestions.slice(0, 5).map((sq, i) => ({ id: `Q${i + 1}`, ...sq, pass: 0 }));
    arxivQuery = plan.arxivQuery;
    wikiTopics = plan.wikipediaTopics.slice(0, 2);
    emit(config, { type: "sub_questions", subQuestions });
  } else {
    const gaps = importantGaps(state.gaps).slice(0, 2);
    const offset = state.subQuestions.length;
    subQuestions = gaps.map((g, i) => ({
      id: `Q${offset + i + 1}`,
      question: g.followUpQuestion,
      searchQuery: g.followUpQuestion,
      pass: iteration,
    }));
    arxivQuery = gaps[0]?.followUpQuestion.split(/\s+/).slice(0, 6).join(" ") ?? state.query;
    wikiTopics = [];
    emit(config, {
      type: "iteration_started",
      iteration,
      reason: gaps.map((g) => g.description).join("; "),
      subQuestions,
    });
  }

  // 2. Fetch from all sources in parallel. A failing source never fails the run.
  const questions = subQuestions.map((sq) => sq.question);
  const jobs: ToolJob[] = [
    {
      tool: "web_search",
      input: subQuestions.map((sq) => sq.searchQuery).join(" | "),
      run: () =>
        webSearch({ questions, mode: "web", maxUses: budget.webSearchUses, effort: "low", signal: config.signal }),
    },
    {
      tool: "arxiv",
      input: arxivQuery,
      run: async () => ({ sources: await searchArxiv(arxivQuery, 4, config.signal) }),
    },
    ...(isFollowUp
      ? []
      : [
          {
            tool: "news_search" as const,
            input: state.query,
            run: () =>
              webSearch({
                questions: [state.query],
                mode: "news",
                maxUses: budget.newsSearchUses,
                effort: "low",
                signal: config.signal,
              }),
          },
        ]),
    ...wikiTopics.map((topic) => ({
      tool: "wikipedia" as const,
      input: topic,
      run: async () => ({ sources: await searchWikipedia(topic, 1, config.signal) }),
    })),
  ];

  const results = await Promise.all(
    jobs.map(async (job) => {
      const outcome = await settle(job.run());
      emit(config, {
        type: "tool_called",
        agent: "retriever",
        tool: job.tool,
        input: job.input,
        status: outcome.ok ? "ok" : "failed",
        resultCount: outcome.ok ? outcome.value.sources.length : 0,
        detail: outcome.ok ? undefined : outcome.error,
      });
      if (!outcome.ok) notes.push(`${job.tool} failed for "${job.input}" (${outcome.error}); continued without it.`);
      return outcome.ok ? outcome.value : { sources: [] };
    }),
  );
  for (const r of results) if (r.usage) usage = addUsage(usage, r.usage);

  // 3. Dedupe against what we already have, cap, and assign stable ids.
  const room = isFollowUp ? budget.maxSources - state.sources.length : budget.maxSources - FOLLOW_UP_RESERVE;
  const fresh = capSources(
    dedupeSources(
      results.flatMap((r) => r.sources),
      state.sources,
    ),
    Math.max(room, 0),
  );
  const newSources: Source[] = fresh.map((raw, i) => {
    const source: Source = {
      ...raw,
      id: `S${state.sources.length + i + 1}`,
      credibility: heuristicCredibility(raw),
      pass: iteration,
    };
    emit(config, { type: "source_found", source: toSummary(source) });
    return source;
  });

  if (state.sources.length + newSources.length === 0) {
    emit(config, { type: "error", message: "No sources could be retrieved for this query.", recoverable: true });
    notes.push(
      "No sources were retrieved; the report relies on model knowledge only and should be treated with caution.",
    );
  }

  // 4. Chunk + BM25-rank evidence for each sub-question across all sources.
  const evidence = await rankEvidence(
    [...state.sources, ...newSources],
    subQuestions,
    budget.evidencePerQuestion,
    state.evidence.length,
  );
  emit(config, {
    type: "tool_called",
    agent: "retriever",
    tool: "bm25",
    input: `${subQuestions.length} sub-questions`,
    status: "ok",
    resultCount: evidence.length,
  });

  emit(config, { type: "usage", usage });
  emit(config, {
    type: "agent_completed",
    agent: "retriever",
    message: `${newSources.length} sources, ${evidence.length} evidence chunks`,
    durationMs: Date.now() - startedAt,
  });

  return { subQuestions, sources: newSources, evidence, iteration, usage, notes };
}
