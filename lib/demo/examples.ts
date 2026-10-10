import type { Recording } from "@/lib/events/types";
import { isResearchEvent } from "@/lib/events/emit";

export const EXAMPLE_QUERIES = [
  "Do AI coding assistants actually improve developer productivity?",
  "Is nuclear energy necessary to reach net-zero by 2050?",
  "Does remote work reduce employee productivity?",
] as const;

export function slugify(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export const recordingPath = (query: string) => `/demo/${slugify(query)}.json`;

export function isRecording(value: unknown): value is Recording {
  const r = value as Partial<Recording> | null;
  return (
    typeof r === "object" &&
    r !== null &&
    typeof r.query === "string" &&
    Array.isArray(r.events) &&
    r.events.every(isResearchEvent)
  );
}

/**
 * Delays between consecutive recorded events, compressed so a multi-minute
 * run replays in well under a minute while keeping its rhythm. Pure.
 */
export function replayDelays(events: { at: number }[], maxGapMs = 2500, speed = 1): number[] {
  return events.map((e, i) => (i === 0 ? 0 : Math.min(Math.max(e.at - events[i - 1].at, 0), maxGapMs) / speed));
}
