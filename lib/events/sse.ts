import type { ResearchEvent } from "@/lib/events/types";

export function encodeSse(event: ResearchEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/**
 * Incremental SSE parser for the browser: feed it text chunks, get complete
 * `data:` payloads back. Comment lines (heartbeats) are ignored. Pure.
 */
export function createSseParser() {
  let buffer = "";
  return (chunk: string): string[] => {
    buffer += chunk;
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    return frames.flatMap((frame) => {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      return data ? [data] : [];
    });
  };
}
