import Link from "next/link";
import { redirect } from "next/navigation";
import { DailyChart } from "@/components/admin/daily-chart";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/session";
import { getAnalytics } from "@/lib/db/analytics";
import { formatDuration, formatTokens } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin — Lumen" };

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-[12px] text-subtle">{label}</div>
      <div className="mt-1 text-[22px] font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="text-[11.5px] text-subtle">{hint}</div>}
    </Card>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kolkata" });

export default async function AdminPage() {
  const viewer = await getViewer();
  if (!viewer.email) redirect("/login?next=/admin");
  if (!viewer.isAdmin) {
    return (
      <div className="min-h-dvh">
        <SiteHeader />
        <p className="mx-auto max-w-md px-4 pt-24 text-center text-[13px] text-muted">
          {viewer.email} doesn&apos;t have admin access.
        </p>
      </div>
    );
  }

  const data = await getAnalytics();
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-[1200px] space-y-5 px-4 py-8">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Usage analytics</h1>
          <p className="text-[13px] text-muted">All searches across all users. Times in IST.</p>
        </div>

        {!data ? (
          <Card className="p-6 text-[13px] text-muted">No database configured, so there is nothing to show yet.</Card>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6" aria-label="Key metrics">
              <Tile label="Searches" value={String(data.totals.searches)} />
              <Tile
                label="Success rate"
                value={
                  data.totals.searches ? `${Math.round((data.totals.completed / data.totals.searches) * 100)}%` : "—"
                }
                hint={`${data.totals.failed} failed`}
              />
              <Tile
                label="Users"
                value={String(data.totals.uniqueUsers)}
                hint={`${data.totals.signedInUsers} signed in`}
              />
              <Tile
                label="Avg. run time"
                value={data.totals.avgDurationMs ? formatDuration(data.totals.avgDurationMs) : "—"}
                hint="completed runs"
              />
              <Tile
                label="Tokens used"
                value={formatTokens(data.totals.totalInputTokens + data.totals.totalOutputTokens)}
                hint={`${formatTokens(data.totals.totalInputTokens)} in · ${formatTokens(data.totals.totalOutputTokens)} out`}
              />
              <Tile label="Reports emailed" value={String(data.totals.emailsSent)} />
            </section>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
              <Card>
                <CardHeader>Searches per day · last 30 days</CardHeader>
                <div className="p-4">
                  <DailyChart data={data.perDay} />
                </div>
              </Card>
              <Card>
                <CardHeader>Top questions</CardHeader>
                <ol className="divide-y divide-border">
                  {data.topQueries.length === 0 && <li className="p-4 text-[13px] text-subtle">No searches yet.</li>}
                  {data.topQueries.map((q) => (
                    <li key={q.query} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                      <span className="min-w-0 flex-1 leading-snug">{q.query}</span>
                      <span className="shrink-0 text-muted tabular-nums">{q.n}×</span>
                    </li>
                  ))}
                </ol>
                {data.depthSplit.length > 0 && (
                  <div className="border-t border-border px-4 py-2.5 text-[12px] text-muted">
                    Depth: {data.depthSplit.map((d) => `${d.depth} ${d.n}`).join(" · ")}
                  </div>
                )}
              </Card>
            </div>

            <Card className="overflow-hidden">
              <CardHeader>Recent searches</CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-[12.5px]">
                  <thead className="text-subtle">
                    <tr className="border-b border-border">
                      {["When", "User", "Question", "Depth", "Status", "Sources", "Time", "Tokens"].map((h) => (
                        <th key={h} className="px-4 py-2 font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.recent.map((r) => (
                      <tr key={r.id} className="hover:bg-surface-muted">
                        <td className="px-4 py-2 whitespace-nowrap text-muted tabular-nums">{when(r.createdAt)}</td>
                        <td className="max-w-48 truncate px-4 py-2 text-muted" title={r.user}>
                          {r.user}
                        </td>
                        <td className="max-w-md px-4 py-2">
                          {r.status === "done" ? (
                            <Link href={`/history/${r.id}`} className="hover:text-accent">
                              {r.query}
                            </Link>
                          ) : (
                            r.query
                          )}
                        </td>
                        <td className="px-4 py-2 text-muted">{r.depth}</td>
                        <td className="px-4 py-2">
                          <Badge tone={r.status === "done" ? "success" : r.status === "error" ? "danger" : "neutral"}>
                            {r.status === "done" ? "Done" : r.status === "error" ? "Failed" : "Running"}
                          </Badge>
                        </td>
                        <td className="px-4 py-2 text-muted tabular-nums">{r.sourceCount}</td>
                        <td className="px-4 py-2 text-muted tabular-nums">
                          {r.durationMs !== null ? formatDuration(r.durationMs) : "—"}
                        </td>
                        <td className="px-4 py-2 text-muted tabular-nums">{formatTokens(r.tokens)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
