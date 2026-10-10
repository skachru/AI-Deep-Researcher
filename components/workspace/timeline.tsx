"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  CircleDot,
  FileSearch,
  Lightbulb,
  Link2,
  Newspaper,
  RefreshCw,
  Search,
  Sparkles,
  Swords,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AGENT_BY_ID } from "@/components/agent-meta";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityItem } from "@/lib/client/reducer";
import type { ToolName } from "@/lib/events/types";
import { cn, relativeTime } from "@/lib/utils";

const TOOL_ICONS: Record<ToolName, LucideIcon> = {
  web_search: Search,
  news_search: Newspaper,
  arxiv: FileSearch,
  wikipedia: BookOpen,
  bm25: Sparkles,
};

function iconFor(item: ActivityItem): LucideIcon {
  switch (item.kind) {
    case "tool":
      return item.tool ? TOOL_ICONS[item.tool] : Search;
    case "complete":
      return CheckCircle2;
    case "contradiction":
      return Swords;
    case "insight":
      return Lightbulb;
    case "loop":
      return RefreshCw;
    case "source":
      return Link2;
    case "error":
      return AlertTriangle;
    case "start":
      return item.agent === "system" ? CircleDot : AGENT_BY_ID[item.agent].icon;
    default:
      return CircleDot;
  }
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export function Timeline({ items, running }: { items: ActivityItem[]; running: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const now = useNow(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickRef.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [items.length]);

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      }}
      className="h-full overflow-y-auto px-3.5 py-3"
    >
      {items.length === 0 && (
        <div className="space-y-4 pt-1" aria-label="Loading activity">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-3 flex-1" />
            </div>
          ))}
        </div>
      )}
      <ol className="relative">
        <AnimatePresence initial={false}>
          {items.map((item) => {
            const Icon = iconFor(item);
            const agentLabel = item.agent === "system" ? "Lumen" : AGENT_BY_ID[item.agent].short;
            const emphasis = item.kind === "start" || item.kind === "complete" || item.kind === "loop";
            return (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="flex gap-3 py-1.5"
              >
                <span
                  className={cn(
                    "mt-px grid size-6 shrink-0 place-items-center rounded-md border",
                    item.kind === "error" || item.failed
                      ? "border-danger/30 bg-danger-soft text-danger"
                      : item.kind === "complete"
                        ? "border-success/25 bg-success-soft text-success"
                        : item.kind === "loop" || item.kind === "start"
                          ? "border-accent/25 bg-accent-soft text-accent"
                          : item.kind === "contradiction"
                            ? "border-warning/25 bg-warning-soft text-warning"
                            : "border-border bg-surface text-muted",
                  )}
                >
                  <Icon className="size-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="shrink-0 text-[11px] font-medium tracking-wide text-subtle uppercase">
                      {agentLabel}
                    </span>
                    <span className="ml-auto shrink-0 text-[11px] text-subtle tabular-nums">
                      {relativeTime(item.at, now)}
                    </span>
                  </div>
                  <p
                    className={cn("text-[13px] leading-snug break-words", emphasis ? "text-foreground" : "text-muted")}
                  >
                    {item.message}
                  </p>
                </div>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ol>
      {running && items.length > 0 && (
        <div className="flex items-center gap-2 py-2 pl-9 text-[12px] text-subtle">
          <span className="size-1.5 animate-pulse rounded-full bg-accent" /> Working…
        </div>
      )}
    </div>
  );
}
