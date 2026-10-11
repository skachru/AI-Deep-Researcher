import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ReportView } from "@/components/report/report-view";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { getSharedReport } from "@/lib/db/searches";
import { extractSummary } from "@/lib/report/markdown";

export const dynamic = "force-dynamic";

const load = cache(async (token: string) =>
  /^[A-Za-z0-9_-]{16,64}$/.test(token) ? getSharedReport(token).catch(() => null) : null,
);

/** First summary bullet as plain text, for link previews. */
function previewText(markdown: string): string {
  const first =
    extractSummary(markdown)
      .split("\n")
      .find((l) => l.trim()) ?? "";
  return first
    .replace(/^[-*]\s+/, "")
    .replace(/\s?\[\d{1,3}(?:\s*,\s*\d{1,3})*\]/g, "")
    .replace(/\{\{[^}]+\}\}/g, "")
    .replace(/[*_`]/g, "")
    .trim()
    .slice(0, 200);
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const shared = await load((await params).token);
  if (!shared) return { title: "Report not found — Lumen", robots: { index: false } };
  const description = previewText(shared.report) || "A cited research report, cross-checked across sources by Lumen.";
  const image = shared.sources.find((s) => s.image)?.image ?? undefined;
  return {
    title: `${shared.query} — Lumen research report`,
    description,
    robots: { index: false, follow: false },
    openGraph: {
      title: shared.query,
      description,
      type: "article",
      siteName: "Lumen",
      images: image ? [image] : undefined,
    },
    twitter: { card: image ? "summary_large_image" : "summary", title: shared.query, description },
  };
}

export default async function SharedReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const shared = await load(token);
  if (!shared) notFound();
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <div className="border-b border-border bg-accent-soft/50">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
          <span className="text-[13px] text-muted">
            Someone shared this research with you. Every claim is cross-checked and every source is cited.
          </span>
          <Button size="sm" variant="primary" className="ml-auto" asChild>
            <Link href="/">
              Research your own question <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
      <ReportView report={shared.report} sources={shared.sources} query={shared.query} searchId={null} />
    </div>
  );
}
