import { isResearchEvent } from "@/lib/events/emit";
import { stamp, type ResearchEvent } from "@/lib/events/types";
import { getServerEnv } from "@/lib/env";
import { runQuickSummary } from "@/lib/agents/summary";
import { buildResearchGraph } from "@/lib/graph/graph";
import { loadModelInfo } from "@/lib/modelInfo";
import type { Depth, ReportLength } from "@/lib/schemas/domain";

/** Parallel branches can fail together (AggregateError); surface the first real cause. Pure. */
export function errorMessage(err: unknown): string {
  if (err instanceof AggregateError && err.errors.length) return errorMessage(err.errors[0]);
  const nested = typeof err === "object" && err !== null ? (err as { errors?: unknown }).errors : undefined;
  if (Array.isArray(nested) && nested.length) return errorMessage(nested[0]);
  return err instanceof Error ? err.message : String(err);
}

export interface RunOptions {
  query: string;
  depth: Depth;
  length?: ReportLength;
  signal?: AbortSignal;
}

/**
 * Runs the research graph and the quick summary side by side and yields their
 * typed events as they happen (LangGraph `streamMode: "custom"` for the graph).
 * Errors become a final `error` event so consumers always get a well-formed
 * stream.
 */
export async function* runResearch({
  query,
  depth,
  length = "full",
  signal,
}: RunOptions): AsyncGenerator<ResearchEvent> {
  yield stamp({ type: "run_started", query, depth });

  const queue: ResearchEvent[] = [];
  let wake: (() => void) | null = null;
  const notify = () => {
    wake?.();
    wake = null;
  };
  const push = (event: ResearchEvent) => {
    queue.push(event);
    notify();
  };

  // The summary stops when the research ends or the caller cancels.
  const summaryControl = new AbortController();
  const summarySignal = signal ? AbortSignal.any([signal, summaryControl.signal]) : summaryControl.signal;
  let summaryDone = false;
  let graphDone = false;

  try {
    const env = getServerEnv(); // fail fast with a readable message if the API key is missing
    await loadModelInfo(env.OPENROUTER_MODEL); // decides the reasoning setting for this model

    void runQuickSummary(query, summarySignal, push).finally(() => {
      summaryDone = true;
      notify();
    });

    const graphTask = (async () => {
      const graph = buildResearchGraph();
      const stream = await graph.stream({ query, depth, length }, { streamMode: "custom", signal, recursionLimit: 12 });
      for await (const chunk of stream) if (isResearchEvent(chunk)) push(chunk);
    })();
    let graphError: unknown = null;
    void graphTask
      .catch((err: unknown) => {
        graphError = err ?? new Error("Research failed");
      })
      .finally(() => {
        graphDone = true;
        summaryControl.abort(); // a summary still streaming after the report is no longer useful
        notify();
      });

    while (!(graphDone && summaryDone && queue.length === 0)) {
      if (queue.length === 0) await new Promise<void>((resolve) => (wake = resolve));
      while (queue.length) yield queue.shift()!;
    }
    if (graphError) throw graphError;
  } catch (err) {
    summaryControl.abort();
    yield stamp({ type: "error", message: errorMessage(err), recoverable: false });
  }
}
