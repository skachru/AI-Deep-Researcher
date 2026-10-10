import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { emit } from "@/lib/events/emit";
import type { ResearchStateType, ResearchStateUpdate } from "@/lib/graph/state";
import { createModel, textOf, usageFrom } from "@/lib/llm";
import type { Insight, Source } from "@/lib/schemas/domain";
import { sourceNumber, toSummary } from "@/lib/schemas/domain";
import { domainOf, renderSourceIndex } from "@/lib/agents/context";
import { renderFindings } from "@/lib/agents/insight";

const SYSTEM_PROMPT = `You are the Report Builder agent in a multi-agent research system. Write a rigorous, readable research report in GitHub-flavoured Markdown.
Use exactly these level-2 sections, in order:
## Summary
## Key Findings
## Contradictions & Open Questions
## Insights & Hypotheses
Rules:
- Summary: 3–5 bullet points that directly answer the question, each with citations. This is what a busy reader sees first.
- Cite sources inline with numbered brackets matching the source number, e.g. S3 is cited as [3]. Cite every factual claim. Never invent sources.
- In Key Findings, use ### subheadings per theme and end each claim bullet with a status tag: {{Corroborated}}, {{Single-source}} or {{Disputed}}.
- In Insights & Hypotheses, state each hypothesis with its confidence (High/Medium/Low) in bold.
- Be concise, specific and neutral. No preamble before the first heading. Do not write Methodology or References sections — they are appended automatically.`;

function renderInsights(insights: Insight[]): string {
  return insights
    .map(
      (i) =>
        `- ${i.title} [${i.confidence}]: ${i.hypothesis}\n  Reasoning: ${i.reasoning.join(" → ")}\n  Sources: ${i.evidenceIds.join(", ")}`,
    )
    .join("\n");
}

/**
 * Checks the report prose against the real sources. Pure.
 * - Citations like [7] or [2, 9] that point to no source are removed.
 * - A {{Corroborated}} tag on a line citing fewer than two valid sources
 *   becomes {{Single-source}}.
 */
export function verifyCitations(
  markdown: string,
  validNumbers: Set<number>,
): { markdown: string; removed: number; downgraded: number } {
  let removed = 0;
  let downgraded = 0;
  const lines = markdown.split("\n").map((line) => {
    const cited = new Set<number>();
    let out = line.replace(/\s?\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\](?!\()/g, (match, group: string) => {
      const nums = group.split(",").map((n) => Number(n.trim()));
      const keep = nums.filter((n) => validNumbers.has(n));
      removed += nums.length - keep.length;
      keep.forEach((n) => cited.add(n));
      if (keep.length === 0) return "";
      return `${match.startsWith(" ") ? " " : ""}[${keep.join(", ")}]`;
    });
    if (out.includes("{{Corroborated}}") && cited.size < 2) {
      downgraded += (out.match(/\{\{Corroborated\}\}/g) ?? []).length;
      out = out.replace(/\{\{Corroborated\}\}/g, "{{Single-source}}");
    }
    return out;
  });
  return { markdown: lines.join("\n"), removed, downgraded };
}

/** Deterministic Methodology section. Pure. */
export function buildMethodology(
  state: Pick<ResearchStateType, "sources" | "subQuestions" | "evidence" | "iteration" | "notes" | "depth">,
): string {
  const byType = (t: Source["type"]) => state.sources.filter((s) => s.type === t).length;
  const lines = [
    "## Methodology",
    "",
    `This report was produced by four cooperating agents orchestrated with LangGraph (${state.depth} depth).`,
    "",
    `- **Retrieval:** ${state.subQuestions.length} sub-questions; ${state.sources.length} sources (${byType("web")} web, ${byType("news")} news, ${byType("paper")} arXiv papers, ${byType("wiki")} Wikipedia) fetched in parallel, deduplicated and chunked.`,
    `- **Ranking:** ${state.evidence.length} evidence chunks selected per sub-question with BM25.`,
    `- **Analysis:** claims labelled Corroborated / Single-source / Disputed; credibility blends source type, domain, recency, model judgement and corroboration.`,
    `- **Retrieval passes:** ${state.iteration + 1}${state.iteration > 0 ? " (a multi-hop follow-up targeted important gaps)" : ""}.`,
  ];
  if (state.notes.length) lines.push("", "**Notes:**", ...state.notes.map((n) => `- ${n}`));
  return lines.join("\n");
}

/** Deterministic References section, numbered to match [n] citations. Pure. */
export function buildReferences(sources: Source[]): string {
  const rows = [...sources]
    .sort((a, b) => sourceNumber(a.id) - sourceNumber(b.id))
    .map(
      (s) =>
        `${sourceNumber(s.id)}. [${s.title.replace(/[[\]]/g, "")}](${s.url}) — ${domainOf(s.url)}, ${s.publishedDate ?? "n.d."} · ${s.type} · credibility ${s.credibility}/100`,
    );
  return ["## References", "", ...rows].join("\n");
}

/** Agent 4 — Report Builder. */
export async function reporterAgent(
  state: ResearchStateType,
  config: LangGraphRunnableConfig,
): Promise<ResearchStateUpdate> {
  const startedAt = Date.now();
  emit(config, { type: "agent_started", agent: "reporter", message: "Drafting the cited research report" });

  const model = createModel({ maxTokens: 5000, timeoutMs: 90_000 });
  const response = await model.invoke(
    [
      new SystemMessage(SYSTEM_PROMPT),
      new HumanMessage(
        `# ${state.query}\n\n## Source index (cite S<n> as [n])\n${renderSourceIndex(state.sources)}\n\n${renderFindings(state.findings, state.contradictions)}\n\n## Insights\n${renderInsights(state.insights)}`,
      ),
    ],
    { signal: config.signal },
  );
  const usage = usageFrom(response);
  const valid = new Set(state.sources.map((s) => sourceNumber(s.id)));
  const { markdown: body, removed, downgraded } = verifyCitations(textOf(response).trim(), valid);
  const notes = [...state.notes];
  if (removed)
    notes.push(`${removed} citation${removed > 1 ? "s" : ""} to non-existent sources removed from the report text.`);
  if (downgraded)
    notes.push(
      `${downgraded} claim label${downgraded > 1 ? "s" : ""} downgraded to Single-source (fewer than two cited sources).`,
    );
  const report = [`# ${state.query}`, body, buildMethodology({ ...state, notes }), buildReferences(state.sources)].join(
    "\n\n",
  );

  emit(config, { type: "usage", usage });
  emit(config, { type: "report_ready", report, sources: state.sources.map(toSummary) });
  emit(config, {
    type: "agent_completed",
    agent: "reporter",
    message: `Report ready (${report.split(/\s+/).length} words)`,
    durationMs: Date.now() - startedAt,
  });
  return { report, usage };
}
