import { CheckCircle2, Clock, Library, XCircle } from "lucide-react";
import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { isGoogleConfigured } from "@/lib/auth/google";
import { getViewer, isAuthConfigured } from "@/lib/auth/session";
import { isDbConfigured } from "@/lib/db";
import { listSearches } from "@/lib/db/searches";
import { isEmailConfigured } from "@/lib/email";
import { formatDuration } from "@/lib/utils";
import { researchHref } from "@/lib/research-url";

export const dynamic = "force-dynamic";
export const metadata = { title: "History — Lumen" };

function when(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" });
}

export default async function HistoryPage() {
  const viewer = await getViewer();
  const searches = isDbConfigured() ? await listSearches(viewer) : [];
  const canSignIn = isAuthConfigured() && (isGoogleConfigured() || (isDbConfigured() && isEmailConfigured()));

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-[22px] font-semibold tracking-tight">Your research history</h1>
        <p className="mt-1 text-[13px] text-muted">
          {viewer.email ? `Searches from this browser and from ${viewer.email}.` : "Saved in this browser."}{" "}
          {!viewer.email && canSignIn && (
            <>
              <Link href="/login?next=/history" className="text-accent hover:underline">
                Sign in
              </Link>{" "}
              to keep it across devices.
            </>
          )}
        </p>

        {!isDbConfigured() ? (
          <p className="mt-10 rounded-lg border border-border bg-surface p-6 text-center text-[13px] text-muted">
            History isn&apos;t enabled on this deployment yet (no database configured).
          </p>
        ) : searches.length === 0 ? (
          <div className="mt-10 rounded-lg border border-border bg-surface p-8 text-center">
            <p className="text-[13px] text-muted">No searches yet.</p>
            <Link href="/" className="mt-2 inline-block text-[13px] text-accent hover:underline">
              Start your first research →
            </Link>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-card">
            {searches.map((s) => {
              const href =
                s.status === "done"
                  ? `/history/${s.id}`
                  : researchHref({ query: s.query, depth: s.depth, length: s.length });
              return (
                <li key={s.id}>
                  <Link href={href} className="block px-4 py-3.5 transition-colors duration-150 hover:bg-surface-muted">
                    <div className="flex items-start gap-3">
                      {s.status === "done" ? (
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Completed" />
                      ) : s.status === "error" ? (
                        <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-label="Failed" />
                      ) : (
                        <Clock className="mt-0.5 size-4 shrink-0 text-subtle" aria-label="Running" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] leading-snug font-medium">{s.query}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-subtle">
                          <span>{when(s.createdAt)}</span>
                          <Badge>{s.depth}</Badge>
                          {s.status === "done" && (
                            <span className="inline-flex items-center gap-1">
                              <Library className="size-3" /> {s.sourceCount} sources
                            </span>
                          )}
                          {s.durationMs !== null && <span>{formatDuration(s.durationMs)}</span>}
                          {s.status === "error" && <span className="text-danger">Failed — click to run again</span>}
                        </div>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
