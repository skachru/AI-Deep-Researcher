import { Badge } from "@/components/ui/badge";
import type { SourceSummary, SourceType } from "@/lib/schemas/domain";
import { cn } from "@/lib/utils";

export const TYPE_LABEL: Record<SourceType, string> = { web: "Web", news: "News", paper: "Paper", wiki: "Wiki" };
const TYPE_TONE = { web: "neutral", news: "warning", paper: "accent", wiki: "success" } as const;

export function SourceTypeBadge({ type }: { type: SourceType }) {
  return <Badge tone={TYPE_TONE[type]}>{TYPE_LABEL[type]}</Badge>;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function CredibilityBar({ value, className }: { value: number; className?: string }) {
  const tone = value >= 75 ? "bg-success" : value >= 55 ? "bg-accent" : "bg-warning";
  return (
    <div className={cn("flex items-center gap-2", className)} title={`Credibility ${value}/100`}>
      <div className="h-1 flex-1 overflow-hidden rounded-full bg-surface-muted">
        <div className={cn("h-full rounded-full transition-[width] duration-300", tone)} style={{ width: `${value}%` }} />
      </div>
      <span className="w-6 text-right text-[11px] text-muted tabular-nums">{value}</span>
    </div>
  );
}

export function SourceChip({ id, sources }: { id: string; sources: SourceSummary[] }) {
  const s = sources.find((x) => x.id === id);
  return (
    <a
      href={s?.url}
      target="_blank"
      rel="noreferrer"
      title={s?.title}
      className="inline-flex items-center rounded border border-border bg-surface-muted px-1 text-[11px] font-medium text-muted tabular-nums hover:text-accent"
    >
      {id.replace(/^S/, "[") + "]"}
    </a>
  );
}
