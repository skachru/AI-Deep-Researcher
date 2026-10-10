import { XMLParser } from "fast-xml-parser";
import { fetchWithRetry } from "@/lib/tools/http";
import type { RawSource } from "@/lib/tools/types";


const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";

export function buildArxivUrl(query: string, maxResults: number): string {
  const terms = query
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => `all:${t}`)
    .join("+AND+");
  return `${ARXIV_ENDPOINT}?search_query=${terms}&start=0&max_results=${maxResults}&sortBy=relevance`;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

/** Pure parser for the arXiv Atom feed (unit-tested with fixtures). */
export function parseArxivFeed(xml: string): RawSource[] {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
  const doc: unknown = parser.parse(xml);
  const feed = (doc as { feed?: { entry?: unknown } }).feed;
  if (!feed?.entry) return [];
  const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry];

  return entries.flatMap((entry: unknown): RawSource[] => {
    const e = entry as { title?: unknown; summary?: unknown; id?: unknown; published?: unknown };
    if (typeof e.title !== "string" || typeof e.id !== "string") return [];
    const summary = typeof e.summary === "string" ? collapse(e.summary) : "";
    return [
      {
        title: collapse(e.title),
        url: e.id.replace(/^http:/, "https:"),
        type: "paper",
        publishedDate: typeof e.published === "string" ? e.published.slice(0, 10) : null,
        snippet: summary.slice(0, 280),
        content: summary,
        retrievedBy: "arXiv API",
      },
    ];
  });
}

export async function searchArxiv(query: string, maxResults = 4, signal?: AbortSignal): Promise<RawSource[]> {
  const res = await fetchWithRetry(buildArxivUrl(query, maxResults), { timeoutMs: 12_000, signal });
  return parseArxivFeed(await res.text());
}
