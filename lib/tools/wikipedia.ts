import type { RawSource } from "@/lib/tools/types";
import { fetchWithRetry } from "@/lib/tools/http";

const SEARCH_ENDPOINT = "https://en.wikipedia.org/w/rest.php/v1/search/page";
const SUMMARY_ENDPOINT = "https://en.wikipedia.org/api/rest_v1/page/summary";
const EXTRACT_ENDPOINT = "https://en.wikipedia.org/w/api.php";

export interface WikiSearchHit {
  key: string;
  title: string;
}

export function parseWikiSearch(json: unknown): WikiSearchHit[] {
  const pages = (json as { pages?: unknown }).pages;
  if (!Array.isArray(pages)) return [];
  return pages.flatMap((p: unknown) => {
    const page = p as { key?: unknown; title?: unknown };
    return typeof page.key === "string" && typeof page.title === "string" ? [{ key: page.key, title: page.title }] : [];
  });
}

/** Parses the MediaWiki `prop=extracts` response into plain text. */
export function parseWikiExtract(json: unknown): string {
  const pages = (json as { query?: { pages?: Record<string, { extract?: unknown }> } }).query?.pages;
  if (!pages) return "";
  const first = Object.values(pages)[0];
  return typeof first?.extract === "string" ? first.extract.trim() : "";
}

export function parseWikiSummary(json: unknown, fullText: string): RawSource | null {
  const s = json as {
    title?: unknown;
    extract?: unknown;
    timestamp?: unknown;
    content_urls?: { desktop?: { page?: unknown } };
    thumbnail?: { source?: unknown };
  };
  if (typeof s.title !== "string" || typeof s.extract !== "string") return null;
  const url = typeof s.content_urls?.desktop?.page === "string" ? s.content_urls.desktop.page : "";
  if (!url) return null;
  return {
    title: `${s.title} — Wikipedia`,
    url,
    type: "wiki",
    publishedDate: typeof s.timestamp === "string" ? s.timestamp.slice(0, 10) : null,
    snippet: s.extract.slice(0, 280),
    content: fullText || s.extract,
    retrievedBy: "Wikipedia REST API",
    image:
      typeof s.thumbnail?.source === "string" && s.thumbnail.source.startsWith("https://") ? s.thumbnail.source : null,
  };
}

async function fetchArticle(hit: WikiSearchHit, signal?: AbortSignal): Promise<RawSource | null> {
  const title = encodeURIComponent(hit.key);
  const extractUrl = `${EXTRACT_ENDPOINT}?action=query&prop=extracts&explaintext=1&exsectionformat=plain&format=json&redirects=1&titles=${title}`;
  const [summaryRes, extractRes] = await Promise.all([
    fetchWithRetry(`${SUMMARY_ENDPOINT}/${title}`, { timeoutMs: 10_000, signal }),
    fetchWithRetry(extractUrl, { timeoutMs: 10_000, signal }).catch(() => null),
  ]);
  // Cap the article body: we only need enough text for BM25 to find relevant passages.
  const fullText = extractRes ? parseWikiExtract(await extractRes.json()).slice(0, 20_000) : "";
  return parseWikiSummary(await summaryRes.json(), fullText);
}

export async function searchWikipedia(topic: string, limit = 1, signal?: AbortSignal): Promise<RawSource[]> {
  const res = await fetchWithRetry(`${SEARCH_ENDPOINT}?q=${encodeURIComponent(topic)}&limit=${limit}`, {
    timeoutMs: 10_000,
    signal,
  });
  const hits = parseWikiSearch(await res.json());
  const articles = await Promise.all(hits.map((hit) => fetchArticle(hit, signal).catch(() => null)));
  return articles.filter((a): a is RawSource => a !== null);
}
