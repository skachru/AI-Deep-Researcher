import { z } from "zod";
import { getSearch, type Viewer } from "@/lib/db/searches";
import { isDbConfigured } from "@/lib/db";

/**
 * A report to export/email is identified by its saved search id (preferred,
 * enforces ownership) or, when history is not configured, passed inline.
 */
export const ReportRefSchema = z.union([
  z.object({ searchId: z.string().uuid() }),
  z.object({
    query: z.string().min(1).max(500),
    markdown: z.string().min(1).max(300_000),
    sources: z
      .array(
        z.object({
          id: z.string().max(10),
          title: z.string().max(500),
          url: z.string().url().max(2000),
          type: z.enum(["web", "news", "paper", "wiki"]),
          credibility: z.number().min(0).max(100),
          publishedDate: z.string().max(40).nullable().optional(),
          image: z.string().url().max(2000).nullable().optional(),
        }),
      )
      .max(40)
      .default([]),
  }),
]);
export type ReportRef = z.infer<typeof ReportRefSchema>;

/** The source fields the exports need. */
export interface ExportSource {
  id: string;
  title: string;
  url: string;
  type: "web" | "news" | "paper" | "wiki";
  credibility: number;
  publishedDate?: string | null;
  image?: string | null;
}

export async function resolveReport(
  viewer: Viewer,
  ref: ReportRef,
): Promise<
  | { searchId: string | null; query: string; markdown: string; sources: ExportSource[] }
  | { error: string; status: number }
> {
  if ("searchId" in ref) {
    const record = await getSearch(viewer, ref.searchId);
    if (!record?.report) return { error: "Report not found.", status: 404 };
    return { searchId: record.id, query: record.query, markdown: record.report, sources: record.sources };
  }
  if (isDbConfigured()) return { error: "This report must be referenced by its saved id.", status: 400 };
  return { searchId: null, query: ref.query, markdown: ref.markdown, sources: ref.sources };
}

export function fileSlug(query: string): string {
  return (
    query
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "lumen-report"
  );
}
