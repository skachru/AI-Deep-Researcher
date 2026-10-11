"use client";

import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ArrowLeft, Clock, Coins, FileText, Library, Plus, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ReportView } from "@/components/report/report-view";
import { SiteHeader } from "@/components/site-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { AgentGraph } from "@/components/workspace/agent-graph";
import { QuickSummary } from "@/components/workspace/quick-summary";
import { SideTabs } from "@/components/workspace/side-tabs";
import { Timeline } from "@/components/workspace/timeline";
import { useResearch } from "@/lib/client/useResearch";
import type { Depth, ReportLength } from "@/lib/schemas/domain";
import { formatDuration, formatTokens } from "@/lib/utils";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

function Stat({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 text-[12.5px]" title={label}>
      <Icon className="size-3.5 text-subtle" />
      <span className="text-subtle">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function useElapsed(startedAt: number | null, finishedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || finishedAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedAt, finishedAt]);
  if (!startedAt) return 0;
  return (finishedAt ?? now) - startedAt;
}

export function Workspace({
  query,
  depth,
  length,
  replay,
}: {
  query: string;
  depth: Depth;
  length: ReportLength;
  replay: boolean;
}) {
  const { state, mode, start, stop } = useResearch();
  const [view, setView] = useState<"workspace" | "report">("workspace");
  const elapsed = useElapsed(state.startedAt, state.finishedAt);

  // Start on mount; abort the stream on unmount (also keeps React Strict Mode's double-mount clean).
  useEffect(() => {
    void start(query, depth, DEMO_MODE || replay, length);
    return stop;
  }, [query, depth, length, replay, start, stop]);

  const restart = () => {
    setView("workspace");
    void start(query, depth, false, length);
  };

  const statusBadge =
    state.status === "running" ? (
      <Badge tone="accent">
        <span className="size-1.5 animate-pulse rounded-full bg-accent" /> Researching
      </Badge>
    ) : state.status === "done" ? (
      <Badge tone="success">Complete</Badge>
    ) : state.status === "error" ? (
      <Badge tone="danger">Failed</Badge>
    ) : (
      <Badge>Starting</Badge>
    );

  return (
    <div className="min-h-dvh">
      <SiteHeader>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <Plus /> New research
          </Link>
        </Button>
      </SiteHeader>

      {/* Header strip */}
      <div className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3">
          <div className="flex min-w-0 flex-1 basis-full items-center gap-2 md:basis-auto">
            {statusBadge}
            {mode === "replay" && <Badge tone="warning">Replaying recorded run</Badge>}
            <h1 className="truncate text-[14px] font-medium" title={query}>
              {query}
            </h1>
          </div>
          <Stat icon={Clock} label="Elapsed" value={formatDuration(elapsed)} />
          <Stat icon={Library} label="Sources" value={String(state.sources.length)} />
          <Stat icon={Coins} label="Tokens" value={formatTokens(state.usage.inputTokens + state.usage.outputTokens)} />
          <div className="flex items-center gap-2">
            {view === "report" ? (
              <Button size="sm" onClick={() => setView("workspace")}>
                <ArrowLeft /> Workspace
              </Button>
            ) : (
              <Button size="sm" variant="primary" disabled={!state.report} onClick={() => setView("report")}>
                <FileText /> View report
              </Button>
            )}
          </div>
        </div>
      </div>

      {state.status === "error" && (
        <div className="mx-auto max-w-[1440px] px-4 pt-4">
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-danger">The research run failed</div>
              <p className="mt-0.5 text-[12.5px] break-words text-muted">{state.error}</p>
            </div>
            <Button size="sm" onClick={restart}>
              <RotateCcw /> Retry
            </Button>
          </div>
        </div>
      )}

      <AnimatePresence mode="wait" initial={false}>
        {view === "report" && state.report ? (
          <motion.div
            key="report"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <ReportView report={state.report} sources={state.sources} query={query} searchId={state.searchId} />
          </motion.div>
        ) : (
          <motion.main
            key="workspace"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="mx-auto grid max-w-[1440px] grid-cols-1 gap-4 px-4 py-4 lg:h-[calc(100dvh-112px)] lg:grid-cols-[260px_minmax(0,1fr)_380px]"
          >
            <Card className="flex flex-col overflow-hidden">
              <CardHeader>
                Agents
                <span className="text-[12px] font-normal text-subtle">
                  {state.passes > 1 ? "2 retrieval passes" : "LangGraph"}
                </span>
              </CardHeader>
              <div className="flex-1 px-2">
                <AgentGraph view={state} />
              </div>
              {state.subQuestions.length > 0 && (
                <div className="border-t border-border px-3.5 py-3">
                  <div className="mb-1.5 text-[11px] font-medium tracking-wide text-subtle uppercase">
                    Sub-questions
                  </div>
                  <ol className="max-h-40 space-y-1 overflow-y-auto">
                    {state.subQuestions.map((q) => (
                      <li key={q.id} className="flex gap-1.5 text-[12px] leading-snug text-muted">
                        <span className="shrink-0 font-medium text-subtle tabular-nums">{q.id}</span>
                        <span>{q.question}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </Card>

            <div className="flex min-h-0 flex-col gap-4">
              <QuickSummary query={query} view={state} onOpenReport={() => setView("report")} />
              <Card className="flex min-h-[320px] flex-1 flex-col overflow-hidden">
                <CardHeader>
                  Activity
                  <span className="text-[12px] font-normal text-subtle tabular-nums">
                    {state.activity.length} events
                  </span>
                </CardHeader>
                <div className="min-h-0 flex-1">
                  <Timeline items={state.activity} running={state.status === "running"} />
                </div>
              </Card>
            </div>

            <Card className="flex min-h-[420px] flex-col overflow-hidden">
              <SideTabs view={state} />
            </Card>
          </motion.main>
        )}
      </AnimatePresence>
    </div>
  );
}
