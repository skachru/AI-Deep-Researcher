import { z } from "zod";
import { runResearch } from "@/lib/graph/run";
import { getServerEnv } from "@/lib/env";
import { encodeSse } from "@/lib/events/sse";
import { stamp } from "@/lib/events/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Vercel Functions with Fluid compute (the default) allow up to 300s on Hobby
 * and 800s on Pro. Quick runs are designed to finish well inside 300s.
 */
export const maxDuration = 300;

const BodySchema = z.object({
  query: z.string().trim().min(8, "Please ask a fuller question").max(500),
  depth: z.enum(["quick", "standard"]).default("quick"),
});

/** POST /api/research — streams typed research events as Server-Sent Events. */
export async function POST(request: Request): Promise<Response> {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  try {
    getServerEnv();
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Server misconfigured" }, { status: 500 });
  }

  const { query, depth } = parsed.data;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Heartbeat comments keep proxies from closing an idle connection while an agent thinks.
      const heartbeat = setInterval(() => controller.enqueue(encoder.encode(": ping\n\n")), 15_000);
      try {
        for await (const event of runResearch({ query, depth, signal: request.signal })) {
          controller.enqueue(encoder.encode(encodeSse(event)));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        controller.enqueue(encoder.encode(encodeSse(stamp({ type: "error", message, recoverable: false }))));
      } finally {
        clearInterval(heartbeat);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
