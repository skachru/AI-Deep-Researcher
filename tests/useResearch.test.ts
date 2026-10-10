// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useResearch } from "@/lib/client/useResearch";
import { encodeSse } from "@/lib/events/sse";
import type { ResearchEvent } from "@/lib/events/types";

const sse = (events: ResearchEvent[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const e of events) c.enqueue(new TextEncoder().encode(encodeSse(e)));
        c.close();
      },
    }),
    { headers: { "Content-Type": "text/event-stream" } },
  );

const recordingFor = (query: string) => ({
  query,
  depth: "quick",
  recordedAt: "",
  events: [{ type: "run_started", query, depth: "quick", at: 1 }],
});

afterEach(() => vi.restoreAllMocks());

describe("useResearch run isolation", () => {
  it("a slow recording lookup from an older run cannot replace a newer live run", async () => {
    let releaseRecording: () => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.startsWith("/demo/")) {
        await new Promise<void>((r) => (releaseRecording = r));
        return Response.json(recordingFor("old question?"));
      }
      return sse([
        { type: "run_started", query: "new question?", depth: "quick", at: 1 },
        { type: "report_ready", report: "# new", sources: [], at: 2 },
      ]);
    });
    const { result } = renderHook(() => useResearch());

    await act(async () => {
      void result.current.start("old question?", "quick", true); // waits on the recording
      await result.current.start("new question?", "quick", false); // newer live run completes
    });
    await act(async () => releaseRecording()); // old lookup finishes late
    await new Promise((r) => setTimeout(r, 20));

    expect(result.current.state.query).toBe("new question?");
    expect(result.current.state.report).toBe("# new");
    expect(result.current.mode).toBe("live");
  });

  it("stopping during a recording lookup never starts a live request", async () => {
    let releaseRecording: () => void = () => {};
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      if (String(input).startsWith("/demo/")) {
        await new Promise<void>((r) => (releaseRecording = r));
        if ((init as RequestInit | undefined)?.signal?.aborted) throw new DOMException("aborted", "AbortError");
        return new Response("", { status: 404 });
      }
      return sse([]);
    });
    const { result } = renderHook(() => useResearch());

    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.start("q question?", "quick", true);
    });
    act(() => result.current.stop());
    await act(async () => {
      releaseRecording();
      await pending;
    });

    expect(fetchSpy.mock.calls.some(([u]) => String(u) === "/api/research")).toBe(false);
  });

  it("a malformed SSE frame is skipped instead of failing the run", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            const enc = new TextEncoder();
            c.enqueue(enc.encode(encodeSse({ type: "run_started", query: "q?", depth: "quick", at: 1 })));
            c.enqueue(enc.encode("data: {not json\n\n"));
            c.enqueue(enc.encode(encodeSse({ type: "report_ready", report: "# ok", sources: [], at: 2 })));
            c.close();
          },
        }),
      ),
    );
    const { result } = renderHook(() => useResearch());
    await act(async () => result.current.start("q question?", "quick", false));
    await waitFor(() => expect(result.current.state.report).toBe("# ok"));
    expect(result.current.state.status).toBe("done");
  });
});
