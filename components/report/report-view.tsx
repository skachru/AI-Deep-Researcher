"use client";

import { Check, Copy, Download } from "lucide-react";
import { isValidElement, useEffect, useMemo, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { CredibilityBar, domainOf, SourceTypeBadge } from "@/components/workspace/source-pieces";
import {
  CITE_PREFIX,
  CLAIM_PREFIX,
  exportMarkdown,
  extractToc,
  headingId,
  isClaimStatus,
  prepareReportMarkdown,
} from "@/lib/client/report";
import { slugify } from "@/lib/demo/examples";
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
      <HoverCardContent>
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

export function ReportView({ report, sources, query }: { report: string; sources: SourceSummary[]; query: string }) {
  const [copied, setCopied] = useState(false);
  const markdown = useMemo(() => prepareReportMarkdown(report), [report]);
  const toc = useMemo(() => extractToc(report), [report]);
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

  const copy = async () => {
    await navigator.clipboard.writeText(exportMarkdown(report));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    const blob = new Blob([exportMarkdown(report)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(query) || "lumen-report"}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

      <article className="min-w-0 rounded-lg border border-border bg-surface px-6 py-8 shadow-card sm:px-10">
        <div className="mb-6 flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" onClick={copy}>
            {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy Markdown"}
          </Button>
          <Button size="sm" onClick={download}>
            <Download /> Download .md
          </Button>
        </div>
        <div className="prose-report">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
            {markdown}
          </ReactMarkdown>
        </div>
      </article>
    </div>
  );
}
