/**
 * M1 console runner: `npm run research -- "your question" [--standard]`
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { runResearch } from "@/lib/graph/run";
import { AGENT_LABELS } from "@/lib/schemas/domain";
import type { ResearchEvent } from "@/lib/events/types";

function describe(e: ResearchEvent): string {
  switch (e.type) {
    case "run_started":
      return `▶ ${e.query} (${e.depth})`;
    case "agent_started":
      return `● ${AGENT_LABELS[e.agent]}: ${e.message}`;
    case "agent_completed":
      return `✓ ${AGENT_LABELS[e.agent]}: ${e.message} (${(e.durationMs / 1000).toFixed(1)}s)`;
    case "tool_called":
      return `  ↳ ${e.tool} "${e.input.slice(0, 60)}" → ${e.status} (${e.resultCount})${e.detail ? ` ${e.detail}` : ""}`;
    case "sub_questions":
      return e.subQuestions.map((q) => `  ? ${q.id} ${q.question}`).join("\n");
    case "source_found":
      return `  + ${e.source.id} [${e.source.type}] ${e.source.title.slice(0, 70)} (${e.source.credibility})`;
    case "finding_added":
      return `  • ${e.finding.subQuestionId}: ${e.finding.summary.slice(0, 100)}…`;
    case "contradiction_found":
      return `  ⚡ ${e.contradiction.topic}`;
    case "insight_added":
      return `  💡 [${e.insight.confidence}] ${e.insight.title}`;
    case "iteration_started":
      return `↻ Multi-hop pass ${e.iteration}: ${e.reason}`;
    case "report_ready":
      return `\n${e.report}\n`;
    case "usage":
      return `  tokens +${e.usage.inputTokens} in / +${e.usage.outputTokens} out`;
    case "error":
      return `✗ ${e.message}`;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const depth = args.includes("--standard") ? "standard" : "quick";
  const query = args.filter((a) => !a.startsWith("--")).join(" ") || "Do AI coding assistants actually improve developer productivity?";
  const started = Date.now();
  for await (const event of runResearch({ query, depth })) console.log(describe(event));
  console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
