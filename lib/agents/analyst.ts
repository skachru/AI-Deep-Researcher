import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { emit } from "@/lib/events/emit";
import type { ResearchStateType, ResearchStateUpdate } from "@/lib/graph/state";
import { importantGaps, routeAfterAnalysis } from "@/lib/graph/routing";
import { budgetFor, createModel, UNTRUSTED_NOTICE, usageFrom } from "@/lib/llm";
import type { Contradiction, Finding, Source } from "@/lib/schemas/domain";
import { toSummary } from "@/lib/schemas/domain";
import { AnalysisSchema, type Analysis } from "@/lib/schemas/llm";
import { blendCredibility } from "@/lib/tools/credibility";
import { renderEvidence, renderSourceIndex, validIds } from "@/lib/agents/context";

const SYSTEM_PROMPT = `You are the Critical Analysis agent in a multi-agent research system.
For each sub-question, read the evidence and:
1. Summarise what the evidence says (2–4 sentences).
2. Extract 2–4 key claims and label each: "Corroborated" (2+ independent sources agree), "Single-source", or "Disputed" (sources disagree).
3. Flag contradictions between sources, quoting both claims with their source ids.
4. Score every source's credibility 0–100 considering source type, recency, publisher reputation and corroboration.
5. List gaps: what is missing to answer the query well. Mark a gap "high" importance only if new retrieval could materially change the conclusion.
Cite only source ids that appear in the source index. Be rigorous and neutral.
${UNTRUSTED_NOTICE}`;

/** Maps the model output onto domain types and drops hallucinated ids. Pure. */
export function normaliseAnalysis(
  analysis: Analysis,
  state: Pick<ResearchStateType, "subQuestions" | "sources">,
): { findings: Finding[]; contradictions: Contradiction[]; rescored: Source[] } {
  const questionById = new Map(state.subQuestions.map((q) => [q.id, q.question]));

  const findings: Finding[] = analysis.findings
    .filter((f) => questionById.has(f.subQuestionId))
    .map((f) => ({
      subQuestionId: f.subQuestionId,
      question: questionById.get(f.subQuestionId) ?? "",
      summary: f.summary,
      claims: f.claims.map((c) => ({ ...c, sourceIds: validIds(c.sourceIds, state.sources) })),
    }));

  const known = new Set(state.sources.map((s) => s.id));
  const contradictions = analysis.contradictions.filter(
    (c) => known.has(c.claimA.sourceId) && known.has(c.claimB.sourceId),
  );

  const corroborations = new Map<string, number>();
  for (const claim of findings.flatMap((f) => f.claims)) {
    if (claim.status !== "Corroborated") continue;
    for (const id of claim.sourceIds) corroborations.set(id, (corroborations.get(id) ?? 0) + 1);
  }
  const llmScores = new Map(analysis.credibility.map((c) => [c.sourceId, c]));
  const rescored = state.sources.map((s) => {
    const llm = llmScores.get(s.id);
    return {
      ...s,
      credibility: blendCredibility(s.credibility, llm?.score, corroborations.get(s.id) ?? 0),
      credibilityRationale: llm?.rationale ?? s.credibilityRationale,
    };
  });

  return { findings, contradictions, rescored };
}

/** Agent 2 — Critical Analysis. */
export async function analystAgent(
  state: ResearchStateType,
  config: LangGraphRunnableConfig,
): Promise<ResearchStateUpdate> {
  const startedAt = Date.now();
  const budget = budgetFor(state.depth);
  emit(config, {
    type: "agent_started",
    agent: "analyst",
    message: `Cross-checking ${state.evidence.length} evidence chunks from ${state.sources.length} sources`,
  });

  const model = createModel({ maxTokens: 16_000, effort: budget.effort }).withStructuredOutput(AnalysisSchema, {
    method: "jsonSchema",
    includeRaw: true,
  });
  const { parsed, raw } = await model.invoke(
    [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(
        `Research query: ${state.query}\n\n## Source index\n${renderSourceIndex(state.sources)}\n\n## Evidence by sub-question\n${renderEvidence(state.subQuestions, state.evidence)}`,
      ),
    ],
    { signal: config.signal },
  );
  const usage = usageFrom(raw);

  const { findings, contradictions, rescored } = normaliseAnalysis(parsed, state);
  findings.forEach((finding) => emit(config, { type: "finding_added", finding }));
  contradictions.forEach((contradiction) => emit(config, { type: "contradiction_found", contradiction }));
  rescored.forEach((source) => emit(config, { type: "source_found", source: toSummary(source) }));

  const gaps = parsed.gaps;
  const willLoop = routeAfterAnalysis({ gaps, iteration: state.iteration, depth: state.depth }) === "retriever";
  emit(config, { type: "usage", usage });
  emit(config, {
    type: "agent_completed",
    agent: "analyst",
    message:
      `${findings.length} findings, ${contradictions.length} contradictions, ${importantGaps(gaps).length} important gaps` +
      (willLoop ? " — looping back for targeted retrieval" : ""),
    durationMs: Date.now() - startedAt,
  });

  return { findings, contradictions, gaps, sources: rescored, usage };
}
