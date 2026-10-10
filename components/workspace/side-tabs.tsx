"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ExternalLink } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  CredibilityBar,
  domainOf,
  SourceChip,
  SourceTypeBadge,
} from "@/components/workspace/source-pieces";
import type { ResearchViewState } from "@/lib/client/reducer";
import type { Confidence, Insight, SourceSummary } from "@/lib/schemas/domain";
import { cn } from "@/lib/utils";

function Count({ n }: { n: number }) {
  return <span className="rounded bg-surface-muted px-1 text-[11px] text-muted tabular-nums">{n}</span>;
}

function Empty({ running, label }: { running: boolean; label: string }) {
  if (running) {
    return (
      <div className="space-y-3 p-3.5" aria-label="Loading">
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2 rounded-md border border-border p-3">
            <Skeleton className="h-2.5 w-20" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ))}
      </div>
    );
  }
  return <p className="px-4 py-10 text-center text-[13px] text-subtle">{label}</p>;
}

function SourcesList({ sources }: { sources: SourceSummary[] }) {
  const sorted = [...sources].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
  return (
    <ul className="divide-y divide-border">
      {sorted.map((s) => (
        <motion.li
          key={s.id}
          layout="position"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          className="group px-3.5 py-3"
        >
          <div className="flex items-center gap-1.5 text-[11.5px] text-subtle">
            <span className="font-medium text-muted tabular-nums">[{s.id.slice(1)}]</span>
            <SourceTypeBadge type={s.type} />
            <span className="truncate">{domainOf(s.url)}</span>
            {s.publishedDate && <span className="ml-auto shrink-0 tabular-nums">{s.publishedDate}</span>}
          </div>
          <a
            href={s.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 line-clamp-2 text-[13px] leading-snug font-medium hover:text-accent"
          >
            {s.title}
            <ExternalLink className="ml-1 inline size-3 opacity-0 transition-opacity group-hover:opacity-60" />
          </a>
          <CredibilityBar value={s.credibility} className="mt-2" />
          {s.credibilityRationale && <p className="mt-1 text-[11.5px] text-subtle">{s.credibilityRationale}</p>}
        </motion.li>
      ))}
    </ul>
  );
}

function ContradictionsList({ view }: { view: ResearchViewState }) {
  return (
    <ul className="space-y-3 p-3.5">
      {view.contradictions.map((c) => (
        <li key={c.topic} className="rounded-md border border-border">
          <div className="border-b border-border px-3 py-2 text-[13px] font-medium">{c.topic}</div>
          <div className="grid grid-cols-2 divide-x divide-border">
            {[c.claimA, c.claimB].map((claim, i) => (
              <div key={i} className="p-3">
                <div className="mb-1 flex items-center gap-1.5">
                  <Badge tone={i === 0 ? "accent" : "warning"}>Claim {i === 0 ? "A" : "B"}</Badge>
                  <SourceChip id={claim.sourceId} sources={view.sources} />
                </div>
                <p className="text-[12.5px] leading-snug">{claim.text}</p>
              </div>
            ))}
          </div>
          <p className="border-t border-border bg-surface-muted/60 px-3 py-2 text-[12px] leading-snug text-muted">
            {c.assessment}
          </p>
        </li>
      ))}
    </ul>
  );
}

const CONFIDENCE_TONE: Record<Confidence, "success" | "accent" | "warning"> = {
  High: "success",
  Medium: "accent",
  Low: "warning",
};

function InsightCard({ insight, sources }: { insight: Insight; sources: SourceSummary[] }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-md border border-border">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-start gap-2 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-1.5">
            <Badge tone={CONFIDENCE_TONE[insight.confidence]}>{insight.confidence} confidence</Badge>
          </div>
          <div className="text-[13px] font-medium">{insight.title}</div>
          <p className="mt-1 text-[12.5px] leading-snug text-muted">{insight.hypothesis}</p>
        </div>
        <ChevronDown className={cn("mt-1 size-4 shrink-0 text-subtle transition-transform duration-200", open && "rotate-180")} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ol className="space-y-1.5 border-t border-border px-3 py-2.5">
              {insight.reasoning.map((step, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-snug">
                  <span className="grid size-4 shrink-0 place-items-center rounded bg-accent-soft text-[10px] font-semibold text-accent">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
            {insight.evidenceIds.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 px-3 pb-3 text-[11.5px] text-subtle">
                Evidence: {insight.evidenceIds.map((id) => <SourceChip key={id} id={id} sources={sources} />)}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export function SideTabs({ view }: { view: ResearchViewState }) {
  const running = view.status === "running";
  return (
    <Tabs defaultValue="sources" className="flex h-full flex-col">
      <TabsList>
        <TabsTrigger value="sources">
          Sources <Count n={view.sources.length} />
        </TabsTrigger>
        <TabsTrigger value="contradictions">
          Contradictions <Count n={view.contradictions.length} />
        </TabsTrigger>
        <TabsTrigger value="insights">
          Insights <Count n={view.insights.length} />
        </TabsTrigger>
      </TabsList>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <TabsContent value="sources">
          {view.sources.length ? <SourcesList sources={view.sources} /> : <Empty running={running} label="No sources yet." />}
        </TabsContent>
        <TabsContent value="contradictions">
          {view.contradictions.length ? (
            <ContradictionsList view={view} />
          ) : (
            <Empty
              running={running && view.agents.analyst !== "done"}
              label={view.agents.analyst === "done" ? "No contradictions found between sources." : "Contradictions appear after analysis."}
            />
          )}
        </TabsContent>
        <TabsContent value="insights">
          {view.insights.length ? (
            <ul className="space-y-3 p-3.5">
              {view.insights.map((i) => (
                <InsightCard key={i.id} insight={i} sources={view.sources} />
              ))}
            </ul>
          ) : (
            <Empty running={running && view.agents.insight === "active"} label="Insights appear after analysis." />
          )}
        </TabsContent>
      </div>
    </Tabs>
  );
}
