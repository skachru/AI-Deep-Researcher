import { z } from "zod";
import { getViewer, normaliseEmail } from "@/lib/auth/session";
import { shareSubject } from "@/lib/client/share";
import { recordEmailDelivery } from "@/lib/db/searches";
import { clientIp, consumeAll, LIMITS } from "@/lib/rateLimit";
import { EMAIL_PATTERN, isEmailConfigured, sendMail } from "@/lib/email";
import { renderInteractiveReportHtml } from "@/lib/report/interactive";
import { messageHtml } from "@/lib/report/share-email";
import { fileSlug, ReportRefSchema, resolveReport } from "@/lib/report/payload";
import { renderReportPdf } from "@/lib/report/pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

const BodySchema = z.object({
  to: z
    .array(z.string().trim().max(254).regex(EMAIL_PATTERN, "Please enter valid email addresses"))
    .min(1, "Add at least one recipient")
    .max(5, "You can send to up to 5 people at a time"),
  message: z.string().trim().min(1).max(3000),
  report: ReportRefSchema,
});

/**
 * POST /api/email — sends the report, with the PDF and interactive HTML
 * attached, to up to 5 recipients on behalf of a signed-in user (their address
 * is the Reply-To). Sign-in is required so the server can't be used as an
 * anonymous mail relay; sending is rate-limited per user, per IP and overall.
 */
export async function POST(request: Request): Promise<Response> {
  if (!isEmailConfigured())
    return Response.json({ error: "Email delivery isn't set up on this site yet." }, { status: 503 });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }

  const viewer = await getViewer();
  if (!viewer.email) return Response.json({ error: "Please sign in to send email." }, { status: 401 });
  if (!viewer.isAdmin) {
    const allowed = await consumeAll([
      { key: `email:user:${viewer.email}`, limit: LIMITS.emailsPerUserDay(), windowSeconds: 86_400 },
      { key: `email:ip:${clientIp(request)}`, limit: LIMITS.emailsPerIpDay(), windowSeconds: 86_400 },
      { key: "email:global", limit: LIMITS.emailsGlobalDay(), windowSeconds: 86_400 },
    ]);
    if (!allowed) {
      return Response.json({ error: "Daily email limit reached. Please try again tomorrow." }, { status: 429 });
    }
  }
  const resolved = await resolveReport(viewer, parsed.data.report);
  if ("error" in resolved) return Response.json({ error: resolved.error }, { status: resolved.status });

  const to = [...new Set(parsed.data.to.map(normaliseEmail))];
  const doc = {
    query: resolved.query,
    markdown: resolved.markdown,
    sources: resolved.sources,
    generatedAt: new Date(),
  };
  const name = fileSlug(resolved.query);
  try {
    const pdf = await renderReportPdf(doc);
    await sendMail({
      to: to.join(", "),
      subject: shareSubject(resolved.query),
      fromName: `${viewer.name || viewer.email} via Lumen`,
      replyTo: viewer.email,
      html: messageHtml(parsed.data.message, viewer.email),
      text: `${parsed.data.message}\n\nAttached: the report as a PDF and an interactive HTML version.\n\nSent via Lumen by ${viewer.email}.`,
      attachments: [
        { filename: `${name}.pdf`, content: pdf, contentType: "application/pdf" },
        {
          filename: `${name}.html`,
          content: renderInteractiveReportHtml({ ...doc, appUrl: process.env.APP_URL ?? new URL(request.url).origin }),
          contentType: "text/html",
        },
      ],
    });
  } catch (err) {
    console.error("email: send failed", err);
    return Response.json({ error: "We couldn't send the email. Please try again shortly." }, { status: 502 });
  }
  await Promise.all(to.map((r) => recordEmailDelivery(resolved.searchId, r, viewer.anonId).catch(() => undefined)));
  return Response.json({ ok: true, sentTo: to });
}
