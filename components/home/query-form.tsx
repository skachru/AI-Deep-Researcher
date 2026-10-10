"use client";

import { ArrowRight, CornerDownLeft, PlayCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EXAMPLE_QUERIES, recordingPath } from "@/lib/demo/examples";
import type { Depth } from "@/lib/schemas/domain";
import { cn } from "@/lib/utils";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

function researchHref(query: string, depth: Depth, replay = false) {
  const params = new URLSearchParams({ q: query, depth });
  if (replay) params.set("replay", "1");
  return `/research?${params.toString()}`;
}

export function QueryForm() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [depth, setDepth] = useState<Depth>("quick");
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
    if (canSubmit) router.push(researchHref(trimmed, depth));
  };

  return (
    <div className="w-full">
      <div className="rounded-xl border border-border bg-surface shadow-pop transition-colors duration-150 focus-within:border-accent/60">
        <textarea
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
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
        <div className="flex items-center justify-between gap-3 px-3 pb-3">
          <div role="radiogroup" aria-label="Research depth" className="flex rounded-md border border-border bg-surface-muted p-0.5">
            {(["quick", "standard"] as const).map((d) => (
              <button
                key={d}
                role="radio"
                aria-checked={depth === d}
                onClick={() => setDepth(d)}
                className={cn(
                  "rounded-[5px] px-2.5 py-1 text-[12px] font-medium capitalize transition-colors duration-150",
                  depth === d ? "bg-surface text-foreground shadow-card" : "text-muted hover:text-foreground",
                )}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden items-center gap-1 text-[12px] text-subtle sm:flex">
              <kbd className="rounded border border-border px-1 font-sans">⌘</kbd>
              <CornerDownLeft className="size-3" />
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
              onClick={() => router.push(researchHref(q, depth, DEMO_MODE && hasRecording))}
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
