import type { ReportLength } from "@/lib/schemas/domain";

/** URL that starts a research run with the given options. Pure. */
export function researchHref(opts: { query: string; depth: string; length?: ReportLength; replay?: boolean }): string {
  const params = new URLSearchParams({ q: opts.query, depth: opts.depth });
  if (opts.length && opts.length !== "full") params.set("length", opts.length);
  if (opts.replay) params.set("replay", "1");
  return `/research?${params.toString()}`;
}
