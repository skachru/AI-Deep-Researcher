"use client";

import { ArrowRight, ShieldCheck, Zap } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { ResearchViewState } from "@/lib/client/reducer";
import { extractSummary, plainClaims } from "@/lib/report/markdown";

/**
 * Question → summary, shown at the top of the workspace. Streams the quick
 * (unverified) answer within seconds, then swaps in the source-verified
 * summary from the finished report.
 */
export function QuickSummary({
  query,
  view,
  onOpenReport,
  children,
}: {
  query: string;
  view: ResearchViewState;
  onOpenReport: () => void;
  children?: React.ReactNode;
}) {
  const verified = view.report ? extractSummary(view.report) : "";
  const text = verified || view.quickSummary;
  const streaming = !verified && view.quickSummaryStatus === "streaming";

  return (
    <Card className="shrink-0 overflow-y-auto px-5 py-4 lg:max-h-[48%]">
      <div className="text-[11px] font-medium tracking-wide text-subtle uppercase">Question</div>
      <h2 className="mt-0.5 text-[16px] leading-snug font-semibold tracking-tight">{query}</h2>

      <div className="mt-4 flex items-center gap-2">
        {verified ? (
          <Badge tone="success">
            <ShieldCheck className="size-3" /> Summary · verified with {view.sources.length} sources
          </Badge>
        ) : (
          <Badge tone="accent">
            <Zap className="size-3" /> Quick summary · preliminary
          </Badge>
        )}
        {!verified && view.status === "running" && (
          <span className="text-[11.5px] text-subtle">Agents are checking this against sources…</span>
        )}
      </div>

      <div className="mt-2 text-[13.5px] leading-relaxed [&_li]:my-1 [&_p]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5">
        {text ? (
          <>
            <ReactMarkdown>{plainClaims(text)}</ReactMarkdown>
            {streaming && <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-accent align-middle" />}
          </>
        ) : view.status === "error" ? (
          <p className="text-muted">No summary available.</p>
        ) : (
          <div className="space-y-2 pt-1" aria-label="Loading summary">
            <Skeleton className="w-11/12" />
            <Skeleton className="w-4/5" />
            <Skeleton className="w-2/3" />
          </div>
        )}
      </div>

      {view.report && (
        <div className="mt-4 space-y-4">
          <Button variant="primary" onClick={onOpenReport}>
            Read the detailed report <ArrowRight />
          </Button>
          {children}
        </div>
      )}
    </Card>
  );
}
