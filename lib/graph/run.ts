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

  // One controller owns this run: it stops both producers when the caller cancels, when the
  // run ends, or when the consumer stops iterating early (generator return/throw).
  const run = new AbortController();
  const runSignal = signal ? AbortSignal.any([signal, run.signal]) : run.signal;
  // The summary also stops as soon as the research ends.
  const summaryControl = new AbortController();
  const summarySignal = AbortSignal.any([runSignal, summaryControl.signal]);
  let summaryDone = false;
  let graphDone = false;
  const tasks: Promise<unknown>[] = [];

  try {
    const env = getServerEnv(); // fail fast with a readable message if the API key is missing
    await loadModelInfo(env.OPENROUTER_MODEL); // decides the reasoning setting for this model

    tasks.push(
      runQuickSummary(query, summarySignal, push)
        .catch(() => undefined) // optional: never fails the run
        .finally(() => {
          summaryDone = true;
          notify();
        }),
    );

    let graphError: unknown = null;
    tasks.push(
      (async () => {
        const graph = buildResearchGraph();
        const stream = await graph.stream(
          { query, depth, length },
          { streamMode: "custom", signal: runSignal, recursionLimit: 12 },
        );
        for await (const chunk of stream) {
          if (isResearchEvent(chunk)) push(chunk);
          else console.warn("research: dropped a malformed event", chunk);
        }
      })()
        .catch((err: unknown) => {
          graphError = err ?? new Error("Research failed");
        })
        .finally(() => {
          graphDone = true;
          summaryControl.abort(); // a summary still streaming after the report is no longer useful
          notify();
        }),
    );

    while (!(graphDone && summaryDone && queue.length === 0)) {
      if (queue.length === 0) await new Promise<void>((resolve) => (wake = resolve));
      while (queue.length) yield queue.shift()!;
    }
    if (graphError) throw graphError;
  } catch (err) {
    summaryControl.abort();
    yield stamp({ type: "error", message: errorMessage(err), recoverable: false });
  } finally {
    // Runs on normal completion and when the consumer stops early: stop and join the producers.
    run.abort();
    notify();
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([Promise.allSettled(tasks), new Promise((r) => (timer = setTimeout(r, 5000)))]);
    clearTimeout(timer);
  }
}
