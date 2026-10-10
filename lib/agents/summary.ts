import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { stamp, type ResearchEvent } from "@/lib/events/types";
import { createModel, usageFrom } from "@/lib/llm";
import type { Usage } from "@/lib/schemas/domain";
import { ZERO_USAGE } from "@/lib/schemas/domain";

const SYSTEM_PROMPT = `You give a fast, preliminary answer to a research question while a team of agents verifies it against sources.
Answer in 3–4 short bullet points (under 90 words total), most important point first. Be balanced and specific.
Flag genuine uncertainty briefly. No preamble, no headings, no citations.`;

/**
 * Quick answer, streamed token by token so the user sees something within
 * seconds. It runs alongside the research graph rather than inside it: as a
 * graph node it shared a superstep with the Retriever, so a slow summary
 * delayed the Critical Analysis agent. It uses model knowledge only; the
 * Report Builder later replaces it with a source-verified summary.
 */
export async function runQuickSummary(
  query: string,
  signal: AbortSignal,
  emit: (event: ResearchEvent) => void,
): Promise<void> {
  const model = createModel({ maxTokens: 600, timeoutMs: 30_000 });
  let text = "";
  let usage: Usage = ZERO_USAGE;
  try {
    const stream = await model.stream([new SystemMessage(SYSTEM_PROMPT), new HumanMessage(query)], { signal });
    for await (const chunk of stream) {
      const delta = chunk.text;
      if (delta) {
        text += delta;
        emit(stamp({ type: "summary_delta", text: delta }));
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
    if (signal.aborted) return; // research finished or was cancelled first
    // The quick answer is a nicety; never fail the research because of it.
    emit(
      stamp({
        type: "error",
        message: `Quick summary unavailable: ${err instanceof Error ? err.message : String(err)}`,
        recoverable: true,
      }),
    );
  }
  emit(stamp({ type: "summary_ready", summary: text.trim() }));
  emit(stamp({ type: "usage", usage }));
}
