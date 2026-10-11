import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { emit } from "@/lib/events/emit";
import type { ResearchStateType, ResearchStateUpdate } from "@/lib/graph/state";
import { createModel, textOf, usageFrom } from "@/lib/llm";
import type { Insight, ReportLength, Source } from "@/lib/schemas/domain";
import { sourceNumber, toSummary } from "@/lib/schemas/domain";
import { domainOf, renderSourceIndex } from "@/lib/agents/context";
import { renderFindings } from "@/lib/agents/insight";

const FULL_PROMPT = `You are the Report Builder agent in a multi-agent research system. Write a rigorous, readable research report in GitHub-flavoured Markdown.
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

const COMMON_RULES = `- Cite sources inline with numbered brackets matching the source number, e.g. S3 is cited as [3]. Cite every factual claim. Never invent sources.
- End each Key Findings bullet with a status tag: {{Corroborated}}, {{Single-source}} or {{Disputed}}.
- Be specific and neutral. No preamble before the first heading. Do not write Methodology or References sections — they are appended automatically.`;

const MEDIUM_PROMPT = `You are the Report Builder agent in a multi-agent research system. Write a concise research brief in GitHub-flavoured Markdown, about 250 words in total (excluding citations). Use exactly these level-2 sections, in order:
## Summary
## Key Findings
## Contradictions & Open Questions
## Insights & Hypotheses
Rules:
- Summary: 3 bullet points that directly answer the question.
- Key Findings: 4–6 bullets, no subheadings.
- Contradictions & Open Questions: 1–2 bullets. Insights & Hypotheses: 1–2 bullets, each with its confidence (High/Medium/Low) in bold.
${COMMON_RULES}`;

const SHORT_PROMPT = `You are the Report Builder agent in a multi-agent research system. Write a very short research brief in GitHub-flavoured Markdown, about 100 words in total (excluding citations). Use exactly these level-2 sections, in order:
## Summary
## Key Findings
Rules:
- Summary: 2–3 short bullet points that directly answer the question.
- Key Findings: the 3 most important claims as bullets, no subheadings.
${COMMON_RULES}`;

/** Writing instructions and output budget per report length. */
export const LENGTH_SETTINGS: Record<
  ReportLength,
  { prompt: string; maxTokens: number; methodology: boolean; minWords: number }
> = {
  short: { prompt: SHORT_PROMPT, maxTokens: 900, methodology: false, minWords: 30 },
  medium: { prompt: MEDIUM_PROMPT, maxTokens: 1800, methodology: false, minWords: 80 },
  full: { prompt: FULL_PROMPT, maxTokens: 5000, methodology: true, minWords: 150 },
};

function renderInsights(insights: Insight[]): string {
  return insights
    .map(
      (i) =>
        `- ${i.title} [${i.confidence}]: ${i.hypothesis}\n  Reasoning: ${i.reasoning.join(" → ")}\n  Sources: ${i.evidenceIds.join(", ")}`,
    )
    .join("\n");
}

const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+/;
const TAG = /\{\{(Corroborated|Single-source|Disputed)\}\}/;

/**
 * Checks the report prose against the real sources, applying the same
 * evidence rules as the Critical Analysis agent. Pure.
 * - Citations like [7] or [2, 9] that point to no source are removed.
 * - A claim bullet left with no valid citation (all of its citations were
 *   invalid, or it carries a claim label but cites nothing) is removed: an
 *   unsupported statement is not kept with a softer label. Other prose that
 *   lost all its citations is marked "(source not verified)".
 * - {{Corroborated}} needs citations from at least two different sites;
 *   otherwise it becomes {{Single-source}}.
 */
export function verifyCitations(
  markdown: string,
  siteByNumber: Map<number, string>,
): { markdown: string; removed: number; downgraded: number; dropped: number } {
  let removed = 0;
  let downgraded = 0;
  let dropped = 0;
  const lines: string[] = [];
  for (const line of markdown.split("\n")) {
    const cited = new Set<number>();
    let hadCitation = false;
    let out = line.replace(/\s?\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\](?!\()/g, (match, group: string) => {
      hadCitation = true;
      const nums = group.split(",").map((n) => Number(n.trim()));
      const keep = nums.filter((n) => siteByNumber.has(n));
      removed += nums.length - keep.length;
      keep.forEach((n) => cited.add(n));
      if (keep.length === 0) return "";
      return `${match.startsWith(" ") ? " " : ""}[${keep.join(", ")}]`;
    });
    const unsupported = cited.size === 0 && (hadCitation || TAG.test(out));
    if (unsupported && BULLET.test(out)) {
      dropped += 1;
      continue;
    }
    if (unsupported && hadCitation && out.trim()) out = `${out.trimEnd()} *(source not verified)*`;
    const sites = new Set([...cited].map((n) => siteByNumber.get(n)));
    if (out.includes("{{Corroborated}}") && sites.size < 2) {
      downgraded += (out.match(/\{\{Corroborated\}\}/g) ?? []).length;
      out = out.replace(/\{\{Corroborated\}\}/g, "{{Single-source}}");
    }
    lines.push(out);
  }
  return { markdown: lines.join("\n"), removed, downgraded, dropped };
}

/** True when the drafted report has a usable Summary and enough content. Pure. */
export function isCompleteReport(body: string, minWords: number): boolean {
  const summary = body.match(/^##\s+Summary\s*$([\s\S]*?)(?=^##\s|(?![\s\S]))/m)?.[1] ?? "";
  const hasSummaryPoint = summary.split("\n").some((l) => /[\p{L}\p{N}]/u.test(l));
  return hasSummaryPoint && body.split(/\s+/).filter(Boolean).length >= minWords;
}

/**
 * Report body assembled directly from the analysed findings (labels exactly
 * as the Critical Analysis agent set them). Used when the drafted prose is
 * empty or incomplete. Pure.
 */
export function fallbackReportBody(state: Pick<ResearchStateType, "findings" | "contradictions" | "insights">): string {
  const cite = (ids: string[]) => (ids.length ? ` [${ids.map((id) => sourceNumber(id)).join(", ")}]` : "");
  const summary = state.findings.slice(0, 5).map((f) => `- ${f.summary}`);
  const findings = state.findings.flatMap((f) => [
    `### ${f.question}`,
    ...f.claims.map((c) => `- ${c.text}${cite(c.sourceIds)} {{${c.status}}}`),
    "",
  ]);
  const contradictions = state.contradictions.map(
    (c) =>
      `- **${c.topic}:** "${c.claimA.text}"${cite([c.claimA.sourceId])} vs "${c.claimB.text}"${cite([c.claimB.sourceId])}. ${c.assessment}`,
  );
  const insights = state.insights.map((i) => `- **${i.confidence} confidence:** ${i.hypothesis}${cite(i.evidenceIds)}`);
  return [
    "## Summary",
    ...(summary.length ? summary : ["- The sources found did not support a confident answer."]),
    "",
    "## Key Findings",
    ...findings,
    "## Contradictions & Open Questions",
    ...(contradictions.length ? contradictions : ["- No direct contradictions were found between sources."]),
    "",
    "## Insights & Hypotheses",
    ...(insights.length ? insights : ["- No hypotheses could be formed from the available evidence."]),
  ].join("\n");
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

  const settings = LENGTH_SETTINGS[state.length ?? "full"];
  const model = createModel({ maxTokens: settings.maxTokens, timeoutMs: 90_000 });
  const response = await model.invoke(
    [
      new SystemMessage(settings.prompt),
      new HumanMessage(
        `# ${state.query}\n\n## Source index (cite S<n> as [n])\n${renderSourceIndex(state.sources)}\n\n${renderFindings(state.findings, state.contradictions)}\n\n## Insights\n${renderInsights(state.insights)}`,
      ),
    ],
    { signal: config.signal },
  );
  const usage = usageFrom(response);
  const siteByNumber = new Map(state.sources.map((s) => [sourceNumber(s.id), domainOf(s.url)]));
  const checked = verifyCitations(textOf(response).trim(), siteByNumber);
  const { removed, downgraded, dropped } = checked;
  const notes = [...state.notes];
  // An empty or cut-off draft is replaced by the findings exactly as analysed.
  const complete = isCompleteReport(checked.markdown, settings.minWords);
  const body = complete ? checked.markdown : verifyCitations(fallbackReportBody(state), siteByNumber).markdown;
  if (!complete)
    notes.push("The written draft was incomplete, so this report was assembled directly from the analysed findings.");
  if (dropped)
    notes.push(
      `${dropped} statement${dropped > 1 ? "s" : ""} without a verifiable source ${dropped > 1 ? "were" : "was"} removed.`,
    );
  if (removed)
    notes.push(`${removed} citation${removed > 1 ? "s" : ""} to non-existent sources removed from the report text.`);
  if (downgraded)
    notes.push(
      `${downgraded} claim label${downgraded > 1 ? "s" : ""} downgraded to Single-source (cited sources not from two different sites).`,
    );
  const report = [
    `# ${state.query}`,
    body,
    ...(settings.methodology ? [buildMethodology({ ...state, notes })] : []),
    buildReferences(state.sources),
  ].join("\n\n");

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
