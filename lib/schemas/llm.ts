import { z } from "zod";

/**
 * Zod schemas used with `withStructuredOutput(..., { method: "jsonSchema" })`.
 * They are sent through OpenRouter as JSON Schema (`response_format`), so we avoid
 * numeric/length constraints the API does not support and clamp in code instead.
 */

export const PlanSchema = z.object({
  subQuestions: z
    .array(
      z.object({
        question: z.string().describe("A focused sub-question that helps answer the main query"),
        searchQuery: z.string().describe("A concise web search query (3–8 words) for this sub-question"),
      }),
    )
    .describe("3 to 5 sub-questions"),
  arxivQuery: z.string().describe("Keywords (2–5 words) to search arXiv for relevant research papers"),
  wikipediaTopics: z.array(z.string()).describe("1–2 Wikipedia article topics for background"),
});
export type Plan = z.infer<typeof PlanSchema>;

const ClaimStatusSchema = z.enum(["Corroborated", "Single-source", "Disputed"]);

export const AnalysisSchema = z.object({
  findings: z.array(
    z.object({
      subQuestionId: z.string(),
      summary: z.string().describe("2–4 sentence synthesis answering the sub-question"),
      claims: z.array(
        z.object({
          text: z.string(),
          status: ClaimStatusSchema,
          sourceIds: z.array(z.string()).describe("Source ids like S3 supporting this claim"),
        }),
      ),
    }),
  ),
  contradictions: z.array(
    z.object({
      topic: z.string(),
      claimA: z.object({ text: z.string(), sourceId: z.string() }),
      claimB: z.object({ text: z.string(), sourceId: z.string() }),
      assessment: z.string().describe("Which side is better supported and why, or why it is unresolved"),
    }),
  ),
  credibility: z.array(
    z.object({
      sourceId: z.string(),
      score: z.number().describe("0–100 credibility score"),
      rationale: z.string().describe("One short sentence"),
    }),
  ),
  gaps: z.array(
    z.object({
      description: z.string(),
      importance: z.enum(["high", "medium", "low"]),
      followUpQuestion: z.string().describe("A targeted question that new retrieval could answer"),
    }),
  ),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const InsightsSchema = z.object({
  insights: z
    .array(
      z.object({
        title: z.string().describe("Short headline, max ~10 words"),
        hypothesis: z.string().describe("The hypothesis or trend in 1–2 sentences"),
        confidence: z.enum(["High", "Medium", "Low"]),
        reasoning: z.array(z.string()).describe("Step-by-step reasoning chain, 2–5 steps"),
        evidenceIds: z.array(z.string()).describe("Source ids like S2 that this insight relies on"),
      }),
    )
    .describe("3 to 5 insights"),
});
export type InsightsOutput = z.infer<typeof InsightsSchema>;
