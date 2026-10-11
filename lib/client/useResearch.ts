"use client";

import { useCallback, useReducer, useRef, useState } from "react";
import { applyEvent, initialViewState, type ResearchViewState } from "@/lib/client/reducer";
import { isResearchEvent } from "@/lib/events/emit";
import { createSseParser } from "@/lib/events/sse";
import { stamp, type ResearchEvent } from "@/lib/events/types";
import { isRecording, recordingPath, replayDelays } from "@/lib/demo/examples";
import type { Depth, ReportLength } from "@/lib/schemas/domain";

/** Client-side cap slightly under the server's maxDuration. */
const LIVE_TIMEOUT_MS = 290_000;

type Action = { kind: "event"; event: ResearchEvent } | { kind: "reset" };

function reducer(state: ResearchViewState, action: Action): ResearchViewState {
  return action.kind === "reset" ? initialViewState : applyEvent(state, action.event);
}

async function loadRecording(query: string, signal: AbortSignal): Promise<ResearchEvent[] | null> {
  try {
    const res = await fetch(recordingPath(query), { cache: "force-cache", signal });
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
 *
 * Every start() opens a new "generation" with its own AbortController. Each
 * async step checks that its generation is still current before touching
 * state, so a slow recording lookup or a finished-late request from an older
 * run can never override, abort or restart a newer one.
 */
export function useResearch() {
  const [state, dispatch] = useReducer(reducer, initialViewState);
  const [mode, setMode] = useState<RunMode>("live");
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  /** Cancels whatever is running and invalidates its pending async work. */
  const stop = useCallback(() => {
    generation.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const begin = useCallback(() => {
    stop();
    const controller = new AbortController();
    abortRef.current = controller;
    const gen = generation.current;
    return { controller, isCurrent: () => generation.current === gen };
  }, [stop]);

  const playEvents = useCallback((events: ResearchEvent[], isCurrent: () => boolean) => {
    if (!isCurrent()) return;
    setMode("replay");
    dispatch({ kind: "reset" });
    const delays = replayDelays(events);
    let elapsed = 0;
    const base = Date.now();
    events.forEach((event, i) => {
      elapsed += delays[i];
      // Re-stamp so elapsed-time displays reflect the replay, not the recording date.
      const replayed = { ...event, at: base + elapsed };
      timersRef.current.push(
        setTimeout(() => {
          if (isCurrent()) dispatch({ kind: "event", event: replayed });
        }, elapsed),
      );
    });
  }, []);

  const runLive = useCallback(
    async (
      query: string,
      depth: Depth,
      length: ReportLength,
      controller: AbortController,
      isCurrent: () => boolean,
    ) => {
      setMode("live");
      dispatch({ kind: "reset" });
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, LIVE_TIMEOUT_MS);

      let failure: string | null = null;
      let finished = false;
      try {
        const res = await fetch("/api/research", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, depth, length }),
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
          if (done || !isCurrent()) break;
          for (const data of parse(value)) {
            let event: unknown;
            try {
              event = JSON.parse(data);
            } catch {
              continue; // ignore a malformed frame rather than failing the run
            }
            if (!isResearchEvent(event)) continue;
            dispatch({ kind: "event", event });
            if (event.type === "report_ready") finished = true;
            if (event.type === "error" && !event.recoverable) failure = event.message;
          }
        }
        if (!finished && !failure) failure = "The research stream ended unexpectedly.";
      } catch (err) {
        if (!timedOut && controller.signal.aborted) return; // superseded or navigated away
        failure = timedOut ? "The live run timed out." : err instanceof Error ? err.message : String(err);
      } finally {
        clearTimeout(timeout);
      }

      if (!failure || !isCurrent()) return;
      // Fall back to a recording if one exists — but only while this run is still the current one.
      const recording = await loadRecording(query, AbortSignal.timeout(5000));
      if (!isCurrent()) return;
      if (recording) return playEvents(recording, isCurrent);
      dispatch({ kind: "event", event: stamp({ type: "error", message: failure, recoverable: false }) });
    },
    [playEvents],
  );

  /** Entry point: replays when demo mode is on and a recording exists, otherwise runs live. */
  const start = useCallback(
    async (query: string, depth: Depth, preferReplay: boolean, length: ReportLength = "full") => {
      const { controller, isCurrent } = begin();
      if (preferReplay) {
        const recording = await loadRecording(query, controller.signal);
        if (!isCurrent()) return;
        if (recording) return playEvents(recording, isCurrent);
      }
      return runLive(query, depth, length, controller, isCurrent);
    },
    [begin, playEvents, runLive],
  );

  return { state, mode, start, stop };
}
