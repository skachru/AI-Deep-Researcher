import { ArrowLeft, RotateCcw } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/report/report-view";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { getSearch } from "@/lib/db/searches";
import { researchHref } from "@/lib/research-url";

export const dynamic = "force-dynamic";

export default async function SavedReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const search = await getSearch(await getViewer(), id);
  if (!search || !search.report) notFound();

  const rerun = researchHref({ query: search.query, depth: search.depth, length: search.length });
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1120px] items-center gap-2 px-4 py-3">
          <Button size="sm" variant="ghost" asChild>
            <Link href="/history">
              <ArrowLeft /> History
            </Link>
          </Button>
          <span className="truncate text-[13px] text-muted">
            {new Date(search.createdAt).toLocaleString("en-IN", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Asia/Kolkata",
            })}{" "}
            IST · {search.sourceCount} sources
          </span>
          <Button size="sm" className="ml-auto" asChild>
            <Link href={rerun}>
              <RotateCcw /> Run again
            </Link>
          </Button>
        </div>
      </div>
      <ReportView report={search.report} sources={search.sources} query={search.query} searchId={search.id} />
    </div>
  );
}
