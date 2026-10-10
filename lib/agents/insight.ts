import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { emit } from "@/lib/events/emit";
import type { ResearchStateType, ResearchStateUpdate } from "@/lib/graph/state";
import { budgetFor, createModel, usageFrom } from "@/lib/llm";
import type { Contradiction, Finding, Insight } from "@/lib/schemas/domain";
import { InsightsSchema } from "@/lib/schemas/llm";
import { renderSourceIndex, validIds } from "@/lib/agents/context";

const SYSTEM_PROMPT = `You are the Insight Generation agent in a multi-agent research system.
Using the analysed findings, reason step by step to propose 3–5 non-obvious hypotheses or trends that go beyond restating findings.
For each: give a short title, the hypothesis, a confidence level (High = well corroborated, Medium = plausible with partial support, Low = speculative),
the reasoning chain as 2–5 explicit steps, and the source ids it relies on. Be calibrated: do not overstate confidence where evidence is disputed or single-source.`;

export function renderFindings(findings: Finding[], contradictions: Contradiction[]): string {
  const f = findings
    .map(
      (x) =>
        `### ${x.subQuestionId}: ${x.question}\n${x.summary}\n` +
        x.claims.map((c) => `- [${c.status}] ${c.text} (${c.sourceIds.join(", ") || "no source"})`).join("\n"),
    )
    .join("\n\n");
  const c = contradictions
    .map((x) => `- ${x.topic}: "${x.claimA.text}" (${x.claimA.sourceId}) vs "${x.claimB.text}" (${x.claimB.sourceId}). ${x.assessment}`)
    .join("\n");
  return `## Findings\n${f || "(none)"}\n\n## Contradictions\n${c || "(none)"}`;
}

/** Agent 3 — Insight Generation. */
export async function insightAgent(
  state: ResearchStateType,
  config: LangGraphRunnableConfig,
): Promise<ResearchStateUpdate> {
  const startedAt = Date.now();
  emit(config, { type: "agent_started", agent: "insight", message: "Reasoning over findings to form hypotheses" });

  const model = createModel({ maxTokens: 12_000, effort: budgetFor(state.depth).effort }).withStructuredOutput(
    InsightsSchema,
    { method: "jsonSchema", includeRaw: true },
  );
  const { parsed, raw } = await model.invoke(
    [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(
        `Research query: ${state.query}\n\n## Source index\n${renderSourceIndex(state.sources)}\n\n${renderFindings(state.findings, state.contradictions)}`,
      ),
    ],
    { signal: config.signal },
  );
  const usage = usageFrom(raw);

  const insights: Insight[] = parsed.insights.slice(0, 5).map((i, idx) => ({
    id: `I${idx + 1}`,
    ...i,
    evidenceIds: validIds(i.evidenceIds, state.sources),
  }));
  insights.forEach((insight) => emit(config, { type: "insight_added", insight }));

  emit(config, { type: "usage", usage });
  emit(config, {
    type: "agent_completed",
    agent: "insight",
    message: `${insights.length} hypotheses generated`,
    durationMs: Date.now() - startedAt,
  });
  return { insights, usage };
}
