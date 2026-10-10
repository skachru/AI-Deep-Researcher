import { z } from "zod";
import { getSearch, type Viewer } from "@/lib/db/searches";

const InlineSourceSchema = z.object({
  id: z.string().max(10),
  title: z.string().max(500),
  url: z.string().url().max(2000),
  type: z.enum(["web", "news", "paper", "wiki"]),
  credibility: z.number().min(0).max(100),
  publishedDate: z.string().max(40).nullable().optional(),
  image: z.string().url().max(2000).nullable().optional(),
});

/**
 * A report to export/email. The saved search id is preferred (ownership is
 * enforced and the stored copy is used); the inline content is the fallback
 * for replays and for runs whose history write is missing or still pending.
 * Inline content is only ever rendered back to the requester (or emailed under
 * the email rate limits), so accepting it does not expose anyone else's data.
 */
export const ReportRefSchema = z
  .object({
    searchId: z.string().uuid().nullable().optional(),
    query: z.string().min(1).max(500).optional(),
    markdown: z.string().min(1).max(300_000).optional(),
    sources: z.array(InlineSourceSchema).max(40).default([]),
  })
  .refine((r) => Boolean(r.searchId) || Boolean(r.query && r.markdown), {
    message: "A saved report id or the report content is required.",
  });
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
  if (ref.searchId) {
    const record = await getSearch(viewer, ref.searchId).catch(() => null);
    if (record?.report) {
      return { searchId: record.id, query: record.query, markdown: record.report, sources: record.sources };
    }
  }
  if (ref.query && ref.markdown) {
    return { searchId: null, query: ref.query, markdown: ref.markdown, sources: ref.sources };
  }
  return { error: "Report not found.", status: 404 };
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
