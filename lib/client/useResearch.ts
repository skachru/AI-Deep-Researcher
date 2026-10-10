"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { applyEvent, initialViewState, type ResearchViewState } from "@/lib/client/reducer";
import { isResearchEvent } from "@/lib/events/emit";
import { createSseParser } from "@/lib/events/sse";
import { stamp, type ResearchEvent } from "@/lib/events/types";
import { isRecording, recordingPath, replayDelays } from "@/lib/demo/examples";
import type { Depth } from "@/lib/schemas/domain";

/** Client-side cap slightly under the server's maxDuration. */
const LIVE_TIMEOUT_MS = 290_000;

type Action = { kind: "event"; event: ResearchEvent } | { kind: "reset" };

function reducer(state: ResearchViewState, action: Action): ResearchViewState {
  return action.kind === "reset" ? initialViewState : applyEvent(state, action.event);
}

async function loadRecording(query: string): Promise<ResearchEvent[] | null> {
  try {
    const res = await fetch(recordingPath(query), { cache: "force-cache" });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return isRecording(json) ? json.events : null;
  } catch {
    return null;
  }
}

export type RunMode = "live" | "replay";

/**
 * Drives a research run: live via SSE from /api/research, or a timed replay
 * of a recorded run. Falls back to a replay automatically if a live run
 * errors or times out and a recording exists for the query.
 */
export function useResearch() {
  const [state, dispatch] = useReducer(reducer, initialViewState);
  const [mode, setMode] = useState<RunMode>("live");
  const abortRef = useRef<AbortController | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  useEffect(() => stop, [stop]);

  const replay = useCallback(
    (events: ResearchEvent[]) => {
      stop();
      setMode("replay");
      dispatch({ kind: "reset" });
      const delays = replayDelays(events);
      let elapsed = 0;
      const base = Date.now();
      events.forEach((event, i) => {
        elapsed += delays[i];
        // Re-stamp so elapsed-time displays reflect the replay, not the recording date.
        const replayed = { ...event, at: base + elapsed };
        timersRef.current.push(setTimeout(() => dispatch({ kind: "event", event: replayed }), elapsed));
      });
    },
    [stop],
  );

  const startLive = useCallback(
    async (query: string, depth: Depth) => {
      stop();
      setMode("live");
      dispatch({ kind: "reset" });
      const controller = new AbortController();
      abortRef.current = controller;
      const timeout = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), LIVE_TIMEOUT_MS);

      let failure: string | null = null;
      let finished = false;
      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, depth }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          const body: unknown = await res.json().catch(() => null);
          const msg = (body as { error?: unknown } | null)?.error;
          throw new Error(typeof msg === "string" ? msg : `Request failed (${res.status})`);
        }
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        const parse = createSseParser();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          for (const data of parse(value)) {
            const event: unknown = JSON.parse(data);
            if (!isResearchEvent(event)) continue;
            dispatch({ kind: "event", event });
            if (event.type === "report_ready") finished = true;
            if (event.type === "error" && !event.recoverable) failure = event.message;
          }
        }
        if (!finished && !failure) failure = "The research stream ended unexpectedly.";
      } catch (err) {
        const timedOut = controller.signal.reason instanceof DOMException && controller.signal.reason.name === "TimeoutError";
        if (controller.signal.aborted && !timedOut) return; // user navigated away or started another run
        failure = timedOut ? "The live run timed out." : err instanceof Error ? err.message : String(err);
      } finally {
        clearTimeout(timeout);
      }

      if (failure) {
        const recording = await loadRecording(query);
        if (recording) {
          replay(recording);
          return;
        }
        dispatch({ kind: "event", event: stamp({ type: "error", message: failure, recoverable: false }) });
      }
    },
    [replay, stop],
  );

  /** Entry point: replays when demo mode is on and a recording exists, otherwise runs live. */
  const start = useCallback(
    async (query: string, depth: Depth, preferReplay: boolean) => {
      if (preferReplay) {
        const recording = await loadRecording(query);
        if (recording) return replay(recording);
      }
      return startLive(query, depth);
    },
    [replay, startLive],
  );

  return { state, mode, start, stop };
}
