import { z } from "zod";

/**
 * Runtime shape of every streamed event. Applied where events cross a trust
 * boundary (the SSE stream, recorded demo runs, the graph's custom stream),
 * so a malformed payload is dropped instead of corrupting UI state.
 * Fields the UI reads are required; descriptive extras stay optional.
 */
const AgentId = z.enum(["retriever", "analyst", "insight", "reporter"]);
const Usage = z.object({ inputTokens: z.number(), outputTokens: z.number() });
const SubQuestion = z.object({
  id: z.string(),
  question: z.string(),
  searchQuery: z.string().optional(),
  pass: z.number().optional(),
});
const SourceSummary = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  type: z.enum(["web", "news", "paper", "wiki"]),
  publishedDate: z.string().nullable().optional(),
  snippet: z.string().optional(),
  credibility: z.number(),
  image: z.string().nullable().optional(),
  retrievedBy: z.string().optional(),
  pass: z.number().optional(),
});
const Claim = z.object({
  text: z.string(),
  status: z.enum(["Corroborated", "Single-source", "Disputed"]),
  sourceIds: z.array(z.string()),
});
const Finding = z.object({
  subQuestionId: z.string(),
  question: z.string(),
  summary: z.string(),
  claims: z.array(Claim),
});
const ClaimRef = z.object({ text: z.string(), sourceId: z.string() });
const Contradiction = z.object({ topic: z.string(), claimA: ClaimRef, claimB: ClaimRef, assessment: z.string() });
const Insight = z.object({
  id: z.string().optional(),
  title: z.string(),
  hypothesis: z.string(),
  confidence: z.enum(["High", "Medium", "Low"]),
  reasoning: z.array(z.string()),
  evidenceIds: z.array(z.string()),
});

const at = { at: z.number() };

export const ResearchEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("run_started"), query: z.string(), depth: z.enum(["quick", "standard"]), ...at }),
  z.object({ type: z.literal("agent_started"), agent: AgentId, message: z.string(), ...at }),
  z.object({
    type: z.literal("agent_completed"),
    agent: AgentId,
    message: z.string(),
    durationMs: z.number(),
    ...at,
  }),
  z.object({
    type: z.literal("tool_called"),
    agent: AgentId,
    tool: z.string(),
    input: z.string(),
    status: z.enum(["ok", "failed"]),
    resultCount: z.number(),
    detail: z.string().optional(),
    ...at,
  }),
  z.object({ type: z.literal("sub_questions"), subQuestions: z.array(SubQuestion), ...at }),
  z.object({ type: z.literal("source_found"), source: SourceSummary, ...at }),
  z.object({ type: z.literal("finding_added"), finding: Finding, ...at }),
  z.object({ type: z.literal("contradiction_found"), contradiction: Contradiction, ...at }),
  z.object({ type: z.literal("insight_added"), insight: Insight, ...at }),
  z.object({
    type: z.literal("iteration_started"),
    iteration: z.number(),
    reason: z.string(),
    subQuestions: z.array(SubQuestion),
    ...at,
  }),
  z.object({ type: z.literal("summary_delta"), text: z.string(), ...at }),
  z.object({ type: z.literal("summary_ready"), summary: z.string(), ...at }),
  z.object({ type: z.literal("report_ready"), report: z.string(), sources: z.array(SourceSummary), ...at }),
  z.object({ type: z.literal("saved"), searchId: z.string(), ...at }),
  z.object({ type: z.literal("usage"), usage: Usage, ...at }),
  z.object({ type: z.literal("error"), message: z.string(), recoverable: z.boolean(), ...at }),
]);
