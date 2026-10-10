import { z } from "zod";
import { getViewer, normaliseEmail } from "@/lib/auth/session";
import { countRecentEmails, recordEmailDelivery } from "@/lib/db/searches";
import { EMAIL_PATTERN, isEmailConfigured, sendMail } from "@/lib/email";
import { renderReportHtml } from "@/lib/report/html";
import { extractSummary, plainClaims } from "@/lib/report/markdown";
import { fileSlug, ReportRefSchema, resolveReport } from "@/lib/report/payload";
import { renderReportPdf } from "@/lib/report/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

const EMAILS_PER_DAY = 10;

const BodySchema = z.object({
  email: z.string().trim().max(254).regex(EMAIL_PATTERN, "Please enter a valid email address"),
  report: ReportRefSchema,
});

/** POST /api/email — emails the report (HTML body + PDF attachment) to the given address. */
export async function POST(request: Request): Promise<Response> {
  if (!isEmailConfigured())
    return Response.json({ error: "Email delivery isn't set up on this server yet." }, { status: 503 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const viewer = await getViewer();
  if (!viewer.isAdmin && (await countRecentEmails(viewer.anonId, 24)) >= EMAILS_PER_DAY) {
    return Response.json({ error: "Daily email limit reached. Please download the report instead." }, { status: 429 });
  }
  const resolved = await resolveReport(viewer, parsed.data.report);
  if ("error" in resolved) return Response.json({ error: resolved.error }, { status: resolved.status });

  const to = normaliseEmail(parsed.data.email);
  const doc = {
    query: resolved.query,
    markdown: resolved.markdown,
    sources: resolved.sources,
    generatedAt: new Date(),
  };
  try {
    const pdf = await renderReportPdf(doc);
    await sendMail({
      to,
      subject: `Your Lumen research report: ${resolved.query.slice(0, 80)}`,
      html: renderReportHtml(doc),
      text: `${resolved.query}\n\nSummary\n${plainClaims(extractSummary(resolved.markdown))}\n\nThe full report is attached as a PDF.`,
      attachments: [{ filename: `${fileSlug(resolved.query)}.pdf`, content: pdf, contentType: "application/pdf" }],
    });
  } catch (err) {
    console.error("email: send failed", err);
    return Response.json({ error: "We couldn't send the email. Please try again shortly." }, { status: 502 });
  }
  await recordEmailDelivery(resolved.searchId, to, viewer.anonId).catch(() => undefined);
  return Response.json({ ok: true });
}
