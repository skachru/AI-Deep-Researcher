import type { SourceType } from "@/lib/schemas/domain";

/** A raw result from any tool, before ids and credibility are assigned. */
export interface RawSource {
  title: string;
  url: string;
  type: SourceType;
  publishedDate: string | null;
  snippet: string;
  content: string;
  retrievedBy: string;
  /** Preview image URL when the source provides one (e.g. Wikipedia lead image). */
  image?: string | null;
}
