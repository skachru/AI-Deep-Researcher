import { FileText, Lightbulb, Scale, Search, type LucideIcon } from "lucide-react";
import type { AgentId } from "@/lib/schemas/domain";

export interface AgentMeta {
  id: AgentId;
  label: string;
  short: string;
  description: string;
  icon: LucideIcon;
}

export const AGENTS: AgentMeta[] = [
  {
    id: "retriever",
    label: "Contextual Retriever",
    short: "Retrieve",
    description: "Splits the question, searches web, news, arXiv and Wikipedia in parallel, ranks passages with BM25.",
    icon: Search,
  },
  {
    id: "analyst",
    label: "Critical Analysis",
    short: "Analyse",
    description:
      "Summarises evidence, flags contradictions, scores credibility and finds gaps — looping back if needed.",
    icon: Scale,
  },
  {
    id: "insight",
    label: "Insight Generation",
    short: "Reason",
    description: "Reasons step by step to propose hypotheses and trends with calibrated confidence.",
    icon: Lightbulb,
  },
  {
    id: "reporter",
    label: "Report Builder",
    short: "Report",
    description: "Writes a structured report with inline citations, methodology and references.",
    icon: FileText,
  },
];

export const AGENT_BY_ID = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentMeta>;
