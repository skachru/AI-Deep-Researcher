import { isResearchEvent } from "@/lib/events/emit";
import { stamp, type ResearchEvent } from "@/lib/events/types";
import { buildResearchGraph } from "@/lib/graph/graph";
import type { Depth } from "@/lib/schemas/domain";

export interface RunOptions {
  query: string;
  depth: Depth;
  signal?: AbortSignal;
}

/**
 * Runs the research graph and yields typed events as they are emitted by the
 * agents (LangGraph `streamMode: "custom"`). Errors are converted into a final
 * `error` event so consumers always get a well-formed stream.
 */
export async function* runResearch({ query, depth, signal }: RunOptions): AsyncGenerator<ResearchEvent> {
  yield stamp({ type: "run_started", query, depth });
  try {
    const graph = buildResearchGraph();
    const stream = await graph.stream({ query, depth }, { streamMode: "custom", signal, recursionLimit: 12 });
    for await (const chunk of stream) {
      if (isResearchEvent(chunk)) yield chunk;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    yield stamp({ type: "error", message, recoverable: false });
  }
}
