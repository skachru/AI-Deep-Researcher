import { isResearchEvent } from "@/lib/events/emit";
import { stamp, type ResearchEvent } from "@/lib/events/types";
import { getServerEnv } from "@/lib/env";
import { buildResearchGraph } from "@/lib/graph/graph";
import type { Depth } from "@/lib/schemas/domain";

/** Parallel branches can fail together (AggregateError); surface the first real cause. Pure. */
export function errorMessage(err: unknown): string {
  if (err instanceof AggregateError && err.errors.length) return errorMessage(err.errors[0]);
  const nested = (err as { errors?: unknown }).errors;
  if (Array.isArray(nested) && nested.length) return errorMessage(nested[0]);
  return err instanceof Error ? err.message : String(err);
}

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
    getServerEnv(); // fail fast with a readable message if the API key is missing
    const graph = buildResearchGraph();
    const stream = await graph.stream({ query, depth }, { streamMode: "custom", signal, recursionLimit: 12 });
    for await (const chunk of stream) {
      if (isResearchEvent(chunk)) yield chunk;
    }
  } catch (err) {
    yield stamp({ type: "error", message: errorMessage(err), recoverable: false });
  }
}
