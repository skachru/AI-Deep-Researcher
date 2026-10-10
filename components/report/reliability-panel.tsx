import { ShieldAlert, ShieldCheck, ShieldHalf } from "lucide-react";
import type { Reliability } from "@/lib/report/reliability";
import { STRENGTH_COPY } from "@/lib/report/reliability";
import { cn } from "@/lib/utils";

const STRENGTH_STYLE = {
  Strong: { icon: ShieldCheck, chip: "bg-success-soft text-success" },
  Moderate: { icon: ShieldHalf, chip: "bg-accent-soft text-accent" },
  Limited: { icon: ShieldAlert, chip: "bg-warning-soft text-warning" },
} as const;

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div>
      <div className="text-[20px] font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="text-[11.5px] text-subtle">{label}</div>
    </div>
  );
}

/**
 * "How reliable is this?" — evidence strength, claim verification breakdown
 * (status colours with labels, never colour alone) and the source mix.
 */
export function ReliabilityPanel({ data, className }: { data: Reliability; className?: string }) {
  const style = STRENGTH_STYLE[data.strength];
  const Icon = style.icon;
  const { corroborated, singleSource, disputed, total } = data.claims;
  const segments = [
    { key: "Corroborated", n: corroborated, bar: "bg-success" },
    { key: "Single-source", n: singleSource, bar: "bg-border-strong" },
    { key: "Disputed", n: disputed, bar: "bg-danger" },
  ].filter((s) => s.n > 0);

  return (
    <section
      aria-label="Reliability"
      className={cn("rounded-xl border border-border bg-surface-muted/50 p-5", className)}
    >
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold",
            style.chip,
          )}
        >
          <Icon className="size-4" /> {data.strength} evidence
        </span>
        <span className="text-[12.5px] text-muted">{STRENGTH_COPY[data.strength]}</span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat value={data.sources.total} label="sources checked" />
        <Stat value={`${total ? Math.round((corroborated / total) * 100) : 0}%`} label="claims corroborated" />
        <Stat value={disputed} label="disputed claims" />
        <Stat value={data.sources.avgCredibility} label="avg. source credibility" />
      </div>

      {total > 0 && (
        <div className="mt-5">
          <div
            className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-full"
            role="img"
            aria-label={`${corroborated} corroborated, ${singleSource} single-source, ${disputed} disputed claims`}
          >
            {segments.map((s) => (
              <div
                key={s.key}
                className={cn("h-full first:rounded-l-full last:rounded-r-full", s.bar)}
                style={{ width: `${(s.n / total) * 100}%` }}
              />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
            {segments.map((s) => (
              <span key={s.key} className="inline-flex items-center gap-1.5">
                <span className={cn("size-2 rounded-full", s.bar)} /> {s.key}{" "}
                <span className="tabular-nums">{s.n}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2 text-[12px] text-muted">
        {(
          [
            ["paper", "research papers"],
            ["web", "web pages"],
            ["news", "news articles"],
            ["wiki", "encyclopedia"],
          ] as const
        )
          .filter(([t]) => data.sources.byType[t] > 0)
          .map(([t, label]) => (
            <span key={t} className="rounded-full border border-border bg-surface px-2.5 py-0.5">
              <b className="font-semibold text-foreground tabular-nums">{data.sources.byType[t]}</b> {label}
            </span>
          ))}
      </div>
    </section>
  );
}
