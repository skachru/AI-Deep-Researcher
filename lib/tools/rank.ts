import { Document } from "@langchain/core/documents";
import { BM25Retriever } from "@langchain/community/retrievers/bm25";
import type { Evidence, Source, SourceType, SubQuestion } from "@/lib/schemas/domain";
import type { RawSource } from "@/lib/tools/types";

/** Splits text into overlapping windows on sentence-ish boundaries. Pure. */
export function chunkText(text: string, size = 900, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= size) return clean ? [clean] : [];
  const chunks: string[] = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + size, clean.length);
    if (end < clean.length) {
      const boundary = clean.lastIndexOf(". ", end);
      if (boundary > start + size / 2) end = boundary + 1;
    }
    chunks.push(clean.slice(start, end).trim());
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return chunks;
}

export function normaliseUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach((p) => u.searchParams.delete(p));
    return `${u.host.replace(/^www\./, "")}${u.pathname.replace(/\/$/, "")}${u.search}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/** Removes duplicates (by normalised URL and by title) against already-known sources. Pure. */
export function dedupeSources(raw: RawSource[], existing: Pick<Source, "url" | "title">[] = []): RawSource[] {
  const seenUrls = new Set(existing.map((s) => normaliseUrl(s.url)));
  const seenTitles = new Set(existing.map((s) => s.title.toLowerCase().trim()));
  const out: RawSource[] = [];
  for (const s of raw) {
    const u = normaliseUrl(s.url);
    const t = s.title.toLowerCase().trim();
    if (seenUrls.has(u) || seenTitles.has(t)) continue;
    seenUrls.add(u);
    seenTitles.add(t);
    out.push(s);
  }
  return out;
}

/**
 * Picks up to `max` sources while keeping the mix balanced across types
 * (round-robin), so one noisy tool cannot crowd out the others. Pure.
 */
export function capSources(raw: RawSource[], max: number): RawSource[] {
  const order: SourceType[] = ["web", "paper", "news", "wiki"];
  const buckets = new Map<SourceType, RawSource[]>(order.map((t) => [t, raw.filter((s) => s.type === t)]));
  const out: RawSource[] = [];
  while (out.length < max && [...buckets.values()].some((b) => b.length > 0)) {
    for (const t of order) {
      const next = buckets.get(t)?.shift();
      if (next && out.length < max) out.push(next);
    }
  }
  return out;
}

/**
 * Chunks all sources and ranks the chunks per sub-question with LangChain's
 * BM25Retriever, keeping the top-k as evidence.
 */
export async function rankEvidence(
  sources: Source[],
  subQuestions: SubQuestion[],
  k: number,
  idOffset = 0,
): Promise<Evidence[]> {
  const docs = sources.flatMap((source) =>
    chunkText(`${source.title}. ${source.content}`).map(
      (chunk) => new Document({ pageContent: chunk, metadata: { sourceId: source.id } }),
    ),
  );
  if (docs.length === 0) return [];

  const retriever = BM25Retriever.fromDocuments(docs, { k, includeScore: true });
  const evidence: Evidence[] = [];
  for (const sq of subQuestions) {
    const hits = await retriever.invoke(`${sq.question} ${sq.searchQuery}`);
    for (const hit of hits) {
      const meta = hit.metadata as { sourceId?: unknown; bm25Score?: unknown };
      if (typeof meta.sourceId !== "string") continue;
      evidence.push({
        id: `E${idOffset + evidence.length + 1}`,
        sourceId: meta.sourceId,
        subQuestionId: sq.id,
        text: hit.pageContent,
        score: typeof meta.bm25Score === "number" ? Math.round(meta.bm25Score * 100) / 100 : 0,
      });
    }
  }
  return evidence;
}
