import { XMLParser } from "fast-xml-parser";
import { fetchWithRetry } from "@/lib/tools/http";
import type { RawSource } from "@/lib/tools/types";

const ARXIV_ENDPOINT = "https://export.arxiv.org/api/query";

const STOPWORDS = new Set(
  "a an and are as at be by does do for from how in is it of on or the to vs what which why with not andnot".split(" "),
);

/**
 * Plain keywords for the arXiv API. Models sometimes write arXiv syntax
 * themselves (all:"..." OR ti:...); field prefixes, quotes and boolean
 * operators are stripped so they can't produce an invalid query (HTTP 400),
 * and the list is capped because every term is ANDed. Pure.
 */
export function arxivTerms(query: string, max = 5): string[] {
  const seen = new Set<string>();
  return query
    .replace(/\b(?:all|ti|abs|au|cat|co|jr|rn|id):/gi, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .map((t) => t.replace(/^-+|-+$/g, ""))
    .filter((t) => {
      const key = t.toLowerCase();
      if (!key || STOPWORDS.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, max);
}

export function buildArxivUrl(terms: string[], maxResults: number): string {
  const q = terms.map((t) => `all:${encodeURIComponent(t)}`).join("+AND+");
  return `${ARXIV_ENDPOINT}?search_query=${q}&start=0&max_results=${maxResults}&sortBy=relevance`;
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
  const terms = arxivTerms(query);
  if (!terms.length) return [];
  const run = async (t: string[]) =>
    parseArxivFeed(await (await fetchWithRetry(buildArxivUrl(t, maxResults), { timeoutMs: 12_000, signal })).text());
  const results = await run(terms);
  // Every term is ANDed, so a long query can match nothing: broaden once.
  return results.length || terms.length <= 3 ? results : run(terms.slice(0, 3));
}
