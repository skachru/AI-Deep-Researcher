import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { stamp, type ResearchEvent, type ResearchEventBody } from "@/lib/events/types";

/**
 * Emits a typed event through LangGraph's custom stream channel.
 * Consumers read them with `graph.stream(input, { streamMode: "custom" })`.
 */
export function emit(config: LangGraphRunnableConfig | undefined, body: ResearchEventBody): void {
  const writer: unknown = config?.writer;
  if (typeof writer === "function") (writer as (chunk: ResearchEvent) => void)(stamp(body));
}

export function isResearchEvent(value: unknown): value is ResearchEvent {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string" &&
    typeof (value as { at?: unknown }).at === "number"
  );
}
