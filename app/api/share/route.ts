import { z } from "zod";
import { getViewer } from "@/lib/auth/session";
import { shareSearch } from "@/lib/db/searches";
import { clientIp, consumeLimit } from "@/lib/rateLimit";

export const runtime = "nodejs";

const BodySchema = z.object({ searchId: z.string().uuid() });

/**
 * POST /api/share — creates (or returns) the public link for a saved report the
 * caller owns. 409 when the report can't be shared (no database, not saved yet
 * or not theirs); the client then shares the summary without a link.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (!(await consumeLimit({ key: `share:ip:${clientIp(request)}`, limit: 60, windowSeconds: 3600 }))) {
    return Response.json({ error: "Too many share requests. Please try again later." }, { status: 429 });
  }
  const shareId = await shareSearch(await getViewer(), parsed.data.searchId).catch((err) => {
    console.error("share: failed", err);
    return null;
  });
  if (!shareId) return Response.json({ error: "This report can't be shared as a link." }, { status: 409 });
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  return Response.json({ url: `${base}/share/${shareId}` });
}
