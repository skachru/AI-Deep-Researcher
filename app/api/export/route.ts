import { z } from "zod";
import { getViewer } from "@/lib/auth/session";
import { renderReportHtml } from "@/lib/report/html";
import { fileSlug, ReportRefSchema, resolveReport } from "@/lib/report/payload";
import { renderReportPdf } from "@/lib/report/pdf";

export const runtime = "nodejs";

const BodySchema = z.object({ format: z.enum(["html", "pdf"]), report: ReportRefSchema });

/** POST /api/export — returns the report as a downloadable HTML or PDF file. */
export async function POST(request: Request): Promise<Response> {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });

  const resolved = await resolveReport(await getViewer(), parsed.data.report);
  if ("error" in resolved) return Response.json({ error: resolved.error }, { status: resolved.status });

  const doc = { query: resolved.query, markdown: resolved.markdown, generatedAt: new Date() };
  const name = fileSlug(resolved.query);

  if (parsed.data.format === "html") {
    return new Response(renderReportHtml(doc), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}.html"`,
      },
    });
  }
  const pdf = await renderReportPdf(doc);
  return new Response(new Uint8Array(pdf), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"` },
  });
}
