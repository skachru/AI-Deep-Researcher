"use client";

import { isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { ReportActions } from "@/components/report/report-actions";
import { ReliabilityPanel } from "@/components/report/reliability-panel";
import { SourceThumb } from "@/components/report/source-thumb";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { CredibilityBar, domainOf, SourceTypeBadge } from "@/components/workspace/source-pieces";
import {
  CITE_PREFIX,
  CLAIM_PREFIX,
  extractToc,
  headingId,
  isClaimStatus,
  prepareReportMarkdown,
} from "@/lib/client/report";
import { computeReliability, splitReferences, stripTitle } from "@/lib/report/reliability";
import type { ClaimStatus, SourceSummary } from "@/lib/schemas/domain";
import { cn } from "@/lib/utils";

function textOf(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (isValidElement<{ children?: ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

const CLAIM_TONE: Record<ClaimStatus, "success" | "neutral" | "danger"> = {
  Corroborated: "success",
  "Single-source": "neutral",
  Disputed: "danger",
};

function Citation({ n, source }: { n: string; source?: SourceSummary }) {
  const chip = (
    <a
      href={source?.url ?? `#ref-${n}`}
      target="_blank"
      rel="noreferrer"
      className="mx-px inline-flex -translate-y-px items-center rounded border border-border bg-surface-muted px-1 align-baseline text-[11px] font-medium text-muted no-underline tabular-nums hover:border-accent/40 hover:text-accent"
    >
      {n}
    </a>
  );
  if (!source) return chip;
  return (
    <HoverCard openDelay={120} closeDelay={80}>
      <HoverCardTrigger asChild>{chip}</HoverCardTrigger>
      <HoverCardContent className="overflow-hidden p-0">
        <SourceThumb source={source} className="h-28 w-full" />
        <div className="p-3.5">
          <div className="flex items-center gap-1.5 text-[11.5px] text-subtle">
            <SourceTypeBadge type={source.type} />
            <span className="truncate">{domainOf(source.url)}</span>
            {source.publishedDate && <span className="ml-auto tabular-nums">{source.publishedDate}</span>}
          </div>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1.5 block font-medium leading-snug hover:text-accent"
          >
            {source.title}
          </a>
          {source.snippet && (
            <p className="mt-1.5 line-clamp-4 text-[12.5px] leading-snug text-muted">{source.snippet}</p>
          )}
          <CredibilityBar value={source.credibility} className="mt-2.5" />
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

function useActiveHeading(ids: string[]) {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => el !== null);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [ids]);
  return active;
}

function ReportCover({ query, image, sourceCount }: { query: string; image: string | null; sourceCount: number }) {
  return (
    <header className="relative overflow-hidden border-b border-border bg-gradient-to-br from-[#eef0fc] via-[#f5f3ff] to-[#fdf6ee] px-6 py-8 sm:px-10 dark:from-[#1a1c30] dark:via-[#1b1830] dark:to-[#221c16]">
      <svg aria-hidden className="absolute -top-10 -right-10 size-64 text-accent/10" viewBox="0 0 200 200">
        <circle cx="100" cy="100" r="80" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="55" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="100" cy="100" r="30" fill="currentColor" />
      </svg>
      <div className="relative flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <div className="text-[11.5px] font-semibold tracking-[0.08em] text-accent uppercase">
            Lumen research report
          </div>
          <h1 className="mt-2 text-[24px] leading-tight font-semibold tracking-[-0.02em] sm:text-[28px]">{query}</h1>
          <p className="mt-2 text-[13px] text-muted">
            Verified across {sourceCount} sources by four cooperating AI agents
          </p>
        </div>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element -- remote Wikipedia lead image
          <img
            src={image}
            alt=""
            referrerPolicy="no-referrer"
            className="hidden size-28 shrink-0 rounded-xl border border-white/60 object-cover shadow-pop sm:block"
          />
        )}
      </div>
    </header>
  );
}

function SourceCard({ source }: { source: SourceSummary }) {
  return (
    <a
      href={source.url}
      target="_blank"
      rel="noreferrer"
      className="group flex h-full overflow-hidden rounded-lg border border-border bg-surface transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-pop"
    >
      <SourceThumb source={source} className="w-24 shrink-0 self-stretch" />
      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-center gap-1.5 text-[11px] text-subtle">
          <span className="font-semibold text-muted tabular-nums">[{source.id.slice(1)}]</span>
          <SourceTypeBadge type={source.type} />
          <span className="truncate">{domainOf(source.url)}</span>
        </div>
        <div className="mt-1 line-clamp-2 text-[13px] leading-snug font-medium group-hover:text-accent">
          {source.title}
        </div>
        <CredibilityBar value={source.credibility} className="mt-2" />
      </div>
    </a>
  );
}

export function ReportView({
  report,
  sources,
  query,
  searchId,
  shareUrl,
}: {
  report: string;
  sources: SourceSummary[];
  query: string;
  searchId: string | null;
  /** Existing public link (on shared pages); otherwise one is created on demand. */
  shareUrl?: string;
}) {
  const ref = useMemo(() => ({ searchId, query, markdown: report, sources }), [searchId, query, report, sources]);
  const { body } = useMemo(() => splitReferences(report), [report]);
  const markdown = useMemo(() => prepareReportMarkdown(stripTitle(body)), [body]);
  const toc = useMemo(() => [...extractToc(body), { level: 2 as const, text: "Sources", id: "sources" }], [body]);
  const reliability = useMemo(() => computeReliability(report, sources), [report, sources]);
  const cover = useMemo(() => sources.find((s) => s.image)?.image ?? null, [sources]);
  const ordered = useMemo(() => [...sources].sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1))), [sources]);
  const ids = useMemo(() => toc.map((t) => t.id), [toc]);
  const active = useActiveHeading(ids);
  const byNumber = useMemo(() => new Map(sources.map((s) => [s.id.slice(1), s])), [sources]);

  const components: Components = useMemo(
    () => ({
      h2: ({ children }) => <h2 id={headingId(textOf(children))}>{children}</h2>,
      h3: ({ children }) => <h3 id={headingId(textOf(children))}>{children}</h3>,
      a: ({ href, children }) => {
        if (href?.startsWith(CITE_PREFIX)) {
          const n = href.slice(CITE_PREFIX.length);
          return <Citation n={n} source={byNumber.get(n)} />;
        }
        return (
          <a href={href} target="_blank" rel="noreferrer">
            {children}
          </a>
        );
      },
      code: ({ children, className }) => {
        const text = textOf(children);
        if (text.startsWith(CLAIM_PREFIX)) {
          const status = text.slice(CLAIM_PREFIX.length);
          if (isClaimStatus(status)) {
            return (
              <Badge tone={CLAIM_TONE[status]} className="ml-1 -translate-y-px align-middle">
                {status}
              </Badge>
            );
          }
        }
        return <code className={cn("rounded bg-surface-muted px-1 py-0.5 text-[13px]", className)}>{children}</code>;
      },
    }),
    [byNumber],
  );

  return (
    <div className="mx-auto grid max-w-[1120px] grid-cols-1 gap-8 px-4 py-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="hidden lg:block">
        <nav className="sticky top-20" aria-label="Table of contents">
          <div className="mb-2 text-[11px] font-medium tracking-wide text-subtle uppercase">On this page</div>
          <ul className="space-y-0.5 border-l border-border">
            {toc.map((t) => (
              <li key={t.id}>
                <a
                  href={`#${t.id}`}
                  className={cn(
                    "-ml-px block border-l py-1 text-[12.5px] leading-snug transition-colors duration-150",
                    t.level === 3 ? "pl-6" : "pl-3",
                    active === t.id
                      ? "border-accent text-foreground"
                      : "border-transparent text-muted hover:text-foreground",
                  )}
                >
                  {t.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <article className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
        <ReportCover query={query} image={cover} sourceCount={sources.length} />
        <div className="px-6 pt-6 pb-10 sm:px-10">
          <ReportActions report={ref} shareUrl={shareUrl} />
          <ReliabilityPanel data={reliability} className="mt-6" />
          <div className="prose-report mt-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
              {markdown}
            </ReactMarkdown>
          </div>
          <section aria-labelledby="sources" className="mt-10">
            <h2 id="sources" className="mb-4 scroll-mt-24 text-[19px] font-semibold tracking-tight">
              Sources
            </h2>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ordered.map((s) => (
                <li key={s.id}>
                  <SourceCard source={s} />
                </li>
              ))}
            </ul>
          </section>
        </div>
      </article>
    </div>
  );
}
