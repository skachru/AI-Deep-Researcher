import { END, START, StateGraph } from "@langchain/langgraph";
import { analystAgent } from "@/lib/agents/analyst";
import { insightAgent } from "@/lib/agents/insight";
import { reporterAgent } from "@/lib/agents/reporter";
import { retrieverAgent } from "@/lib/agents/retriever";
import { ResearchState } from "@/lib/graph/state";
import { routeAfterAnalysis } from "@/lib/graph/routing";

/**
 * The Lumen research graph.
 *
 *   START → retriever → analyst ──(important gaps & first pass)──→ retriever   (multi-hop loop)
 *                                 └─(otherwise)──→ insight → reporter → END
 *
 * Each node is one agent (see /lib/agents). Nodes communicate only through the
 * typed shared state and stream UI events through LangGraph's custom stream.
 */
export function buildResearchGraph() {
  return new StateGraph(ResearchState)
    .addNode("retriever", retrieverAgent)
    .addNode("analyst", analystAgent)
    .addNode("insight", insightAgent)
    .addNode("reporter", reporterAgent)
    .addEdge(START, "retriever")
    .addEdge("retriever", "analyst")
    .addConditionalEdges("analyst", routeAfterAnalysis, {
      retriever: "retriever",
      insight: "insight",
    })
    .addEdge("insight", "reporter")
    .addEdge("reporter", END)
    .compile();
}
