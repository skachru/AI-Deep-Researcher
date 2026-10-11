import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { ResearchEventSchema } from "@/lib/events/schema";
import { stamp, type ResearchEvent, type ResearchEventBody } from "@/lib/events/types";

/**
 * Emits a typed event through LangGraph's custom stream channel.
 * Consumers read them with `graph.stream(input, { streamMode: "custom" })`.
 */
export function emit(config: LangGraphRunnableConfig | undefined, body: ResearchEventBody): void {
  const writer: unknown = config?.writer;
  if (typeof writer === "function") (writer as (chunk: ResearchEvent) => void)(stamp(body));
}

/** True only for a well-formed event (type, timestamp and payload all checked). */
export function isResearchEvent(value: unknown): value is ResearchEvent {
  return ResearchEventSchema.safeParse(value).success;
}
