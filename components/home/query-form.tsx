"use client";

import { ArrowRight, CornerDownLeft, PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EXAMPLE_QUERIES, recordingPath } from "@/lib/demo/examples";
import { type Depth, REPORT_LENGTHS, type ReportLength } from "@/lib/schemas/domain";
import { cn } from "@/lib/utils";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

function researchHref(query: string, depth: Depth, length: ReportLength, replay = false) {
  const params = new URLSearchParams({ q: query, depth });
  if (length !== "full") params.set("length", length);
  if (replay) params.set("replay", "1");
  return `/research?${params.toString()}`;
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-md border border-border bg-surface-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "rounded-[5px] px-2.5 py-1 text-[12px] font-medium whitespace-nowrap transition-colors duration-150",
            value === o.id ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function QueryForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<Depth>("quick");
  const [length, setLength] = useState<ReportLength>("full");
  const [recorded, setRecorded] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Mark example chips that have a recorded run available for instant replay.
  useEffect(() => {
    let cancelled = false;
    Promise.all(
      EXAMPLE_QUERIES.map(async (q): Promise<string | null> => {
        const res = await fetch(recordingPath(q), { method: "HEAD" }).catch(() => null);
        return res?.ok ? q : null;
      }),
    ).then((hits) => {
      if (!cancelled) setRecorded(new Set(hits.filter((q): q is string => q !== null)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const trimmed = query.trim();
  const canSubmit = trimmed.length >= 8;

  const submit = () => {
    if (canSubmit) router.push(researchHref(trimmed, depth, length));
  };

  return (
    <div className="w-full">
      <div className="rounded-xl border border-border bg-surface shadow-pop transition-colors duration-150 focus-within:border-accent/60">
        <textarea
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Enter starts research; Shift+Enter adds a new line. Ignore Enter while an IME is composing.
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          maxLength={500}
          autoFocus
          placeholder="Ask a research question…"
          aria-label="Research question"
          className="block w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[15px] leading-relaxed outline-none placeholder:text-subtle"
        />
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented
              label="Research depth"
              value={depth}
              onChange={setDepth}
              options={[
                { id: "quick", label: "Quick" },
                { id: "standard", label: "Standard" },
              ]}
            />
            <Segmented label="Report length" value={length} onChange={setLength} options={REPORT_LENGTHS} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden items-center gap-1 text-[12px] text-subtle sm:flex">
              <CornerDownLeft className="size-3" /> to search · Shift+Enter for new line
            </span>
            <Button variant="primary" size="md" onClick={submit} disabled={!canSubmit}>
              Research <ArrowRight />
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {EXAMPLE_QUERIES.map((q) => {
          const hasRecording = recorded.has(q);
          return (
            <button
              key={q}
              onClick={() => router.push(researchHref(q, depth, length, DEMO_MODE && hasRecording))}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-[12.5px] text-muted shadow-card transition-colors duration-150 hover:border-border-strong hover:text-foreground"
            >
              {DEMO_MODE && hasRecording && <PlayCircle className="size-3.5 text-accent" aria-label="Recorded run" />}
              {q}
            </button>
          );
        })}
      </div>
    </div>
  );
}
