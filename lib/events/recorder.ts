import type { ResearchEvent } from "@/lib/events/types";
import type { SourceSummary, Usage } from "@/lib/schemas/domain";
import { addUsage, ZERO_USAGE } from "@/lib/schemas/domain";

export interface RunOutcome {
  quickSummary: string;
  report: string | null;
  sources: SourceSummary[];
  usage: Usage;
  error: string | null;
}

/** Folds the event stream into what we persist for history. Pure. */
export function recordEvent(acc: RunOutcome, e: ResearchEvent): RunOutcome {
  switch (e.type) {
    case "summary_delta":
      return { ...acc, quickSummary: acc.quickSummary + e.text };
    case "summary_ready":
      return { ...acc, quickSummary: e.summary || acc.quickSummary };
    case "report_ready":
      return { ...acc, report: e.report, sources: e.sources };
    case "usage":
      return { ...acc, usage: addUsage(acc.usage, e.usage) };
    case "error":
      return e.recoverable ? acc : { ...acc, error: e.message };
    default:
      return acc;
  }
}

export const emptyOutcome = (): RunOutcome => ({
  quickSummary: "",
  report: null,
  sources: [],
  usage: ZERO_USAGE,
  error: null,
});
