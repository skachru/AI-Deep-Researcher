import { z } from "zod";
import { getSearch, type Viewer } from "@/lib/db/searches";
import { isDbConfigured } from "@/lib/db";

/**
 * A report to export/email is identified by its saved search id (preferred,
 * enforces ownership) or, when history is not configured, passed inline.
 */
export const ReportRefSchema = z.union([
  z.object({ searchId: z.string().uuid() }),
  z.object({ query: z.string().min(1).max(500), markdown: z.string().min(1).max(300_000) }),
]);
export type ReportRef = z.infer<typeof ReportRefSchema>;

export async function resolveReport(
  viewer: Viewer,
  ref: ReportRef,
): Promise<{ searchId: string | null; query: string; markdown: string } | { error: string; status: number }> {
  if ("searchId" in ref) {
    const record = await getSearch(viewer, ref.searchId);
    if (!record?.report) return { error: "Report not found.", status: 404 };
    return { searchId: record.id, query: record.query, markdown: record.report };
  }
  if (isDbConfigured()) return { error: "This report must be referenced by its saved id.", status: 400 };
  return { searchId: null, query: ref.query, markdown: ref.markdown };
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
