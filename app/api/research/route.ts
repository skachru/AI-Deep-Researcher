import { z } from "zod";
import { getViewer } from "@/lib/auth/session";
import { completeSearch, createSearch, failSearch } from "@/lib/db/searches";
import { getServerEnv } from "@/lib/env";
import { emptyOutcome, recordEvent } from "@/lib/events/recorder";
import { encodeSse } from "@/lib/events/sse";
import { stamp, type ResearchEvent } from "@/lib/events/types";
import { runResearch } from "@/lib/graph/run";
import { clientIp, consumeAll, LIMITS } from "@/lib/rateLimit";
import { AGENT_LABELS } from "@/lib/schemas/domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/**
 * Vercel Functions with Fluid compute (the default) allow up to 300s on Hobby
 * and 800s on Pro. Quick runs are designed to finish well inside 300s.
 */
export const maxDuration = 300;

/** Abort the graph a little before the platform limit so the client gets a clean error event. */
const RUN_DEADLINE_MS = (maxDuration - 15) * 1000;

const BodySchema = z.object({
  query: z.string().trim().min(8, "Please ask a fuller question").max(500),
  depth: z.enum(["quick", "standard"]).default("quick"),
});

/** POST /api/research — streams typed research events as Server-Sent Events and saves the run to history. */
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
  const viewer = await getViewer();
  // Public deployments run on the owner's API key: limit per visitor, per IP and overall (admins exempt).
  if (!viewer.isAdmin) {
    const allowed = await consumeAll([
      {
        key: `research:user:${viewer.email ?? viewer.anonId}`,
        limit: LIMITS.researchPerUserHour(),
        windowSeconds: 3600,
      },
      { key: `research:ip:${clientIp(request)}`, limit: LIMITS.researchPerIpHour(), windowSeconds: 3600 },
      { key: "research:global", limit: LIMITS.researchGlobalDay(), windowSeconds: 86_400 },
    ]);
    if (!allowed) {
      return Response.json(
        { error: "You've reached the research limit for now. Please try again later." },
        { status: 429 },
      );
    }
  }
  // History is best-effort: a database problem must not block research.
  const searchId = await createSearch(viewer, query, depth).catch((err: unknown) => {
    console.error("history: could not create search", err);
    return null;
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: ResearchEvent | string) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(typeof event === "string" ? event : encodeSse(event)));
        } catch {
          open = false; // client disconnected; keep running bookkeeping
        }
      };
      // Heartbeat comments keep proxies from closing an idle connection while an agent thinks.
      const heartbeat = setInterval(() => send(": ping\n\n"), 15_000);
      const startedAt = Date.now();
      let outcome = emptyOutcome();
      let saved = false;
      const save = async () => {
        if (!searchId || saved) return;
        saved = true;
        const durationMs = Date.now() - startedAt;
        const write = outcome.report
          ? completeSearch(searchId, {
              quickSummary: outcome.quickSummary,
              report: outcome.report,
              sources: outcome.sources,
              usage: outcome.usage,
              durationMs,
            })
          : failSearch(searchId, {
              error: outcome.error ?? "Run ended without a report (cancelled or timed out).",
              quickSummary: outcome.quickSummary,
              usage: outcome.usage,
              durationMs,
            });
        await write.catch((err: unknown) => console.error("history: could not save search", err));
      };

      try {
        if (searchId) send(stamp({ type: "saved", searchId }));
        const deadline = AbortSignal.timeout(RUN_DEADLINE_MS);
        const signal = AbortSignal.any([request.signal, deadline]);
        let activeAgent: string | null = null;
        for await (const raw of runResearch({ query, depth, signal })) {
          if (raw.type === "agent_started") activeAgent = AGENT_LABELS[raw.agent];
          if (raw.type === "agent_completed") activeAgent = null;
          // Name the stage that ran out of time instead of a generic "aborted".
          const event =
            raw.type === "error" && !raw.recoverable && deadline.aborted
              ? {
                  ...raw,
                  message: `Timed out after ${Math.round(RUN_DEADLINE_MS / 1000)}s${activeAgent ? ` while the ${activeAgent} agent was running` : ""}. The model may be too slow — open /setup and run the speed test.`,
                }
              : raw;
          outcome = recordEvent(outcome, event);
          // Persist before announcing the report, so an immediate download/email finds it.
          if (event.type === "report_ready") await save();
          send(event);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        outcome = { ...outcome, error: message };
        send(stamp({ type: "error", message, recoverable: false }));
      } finally {
        clearInterval(heartbeat);
        await save();
        try {
          controller.close();
        } catch {
          // Client already disconnected.
        }
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
