import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { emit } from "@/lib/events/emit";
import type { ResearchStateType, ResearchStateUpdate } from "@/lib/graph/state";
import { createModel, usageFrom } from "@/lib/llm";
import type { Usage } from "@/lib/schemas/domain";
import { ZERO_USAGE } from "@/lib/schemas/domain";

const SYSTEM_PROMPT = `You give a fast, preliminary answer to a research question while a team of agents verifies it against sources.
Answer in 3–4 short bullet points (under 90 words total), most important point first. Be balanced and specific.
Flag genuine uncertainty briefly. No preamble, no headings, no citations.`;

/**
 * Quick-answer branch. Runs in parallel with the Retriever (fan-out from START)
 * and streams tokens to the UI so the user sees an answer within seconds.
 * It uses model knowledge only; the Report Builder later replaces it with a
 * source-verified summary.
 */
export async function quickSummaryNode(
  state: ResearchStateType,
  config: LangGraphRunnableConfig,
): Promise<ResearchStateUpdate> {
  const model = createModel({ maxTokens: 1200, timeoutMs: 30_000 });
  let text = "";
  let usage: Usage = ZERO_USAGE;
  try {
    const stream = await model.stream([new SystemMessage(SYSTEM_PROMPT), new HumanMessage(state.query)], {
      signal: config.signal,
    });
    for await (const chunk of stream) {
      const delta = chunk.text;
      if (delta) {
        text += delta;
        emit(config, { type: "summary_delta", text: delta });
      }
      const chunkUsage = usageFrom(chunk);
      if (chunkUsage.inputTokens || chunkUsage.outputTokens) {
        usage = {
          inputTokens: usage.inputTokens + chunkUsage.inputTokens,
          outputTokens: usage.outputTokens + chunkUsage.outputTokens,
        };
      }
    }
  } catch (err) {
    // The quick answer is a nicety; never fail the research because of it.
    emit(config, {
      type: "error",
      message: `Quick summary unavailable: ${err instanceof Error ? err.message : String(err)}`,
      recoverable: true,
    });
  }
  emit(config, { type: "summary_ready", summary: text.trim() });
  emit(config, { type: "usage", usage });
  return { quickSummary: text.trim(), usage };
}
