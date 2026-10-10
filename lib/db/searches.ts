import { db } from "@/lib/db";
import type { SourceSummary, Usage } from "@/lib/schemas/domain";

export interface Viewer {
  anonId: string;
  email: string | null;
  name?: string | null;
  picture?: string | null;
  isAdmin: boolean;
}

export interface SearchListItem {
  id: string;
  query: string;
  depth: string;
  status: "running" | "done" | "error";
  sourceCount: number;
  createdAt: string;
  durationMs: number | null;
}

export interface SearchRecord extends SearchListItem {
  anonId: string;
  userEmail: string | null;
  quickSummary: string | null;
  report: string | null;
  sources: SourceSummary[];
  inputTokens: number;
  outputTokens: number;
  error: string | null;
}

interface SearchRow {
  id: string;
  anon_id: string;
  user_email: string | null;
  query: string;
  depth: string;
  status: SearchListItem["status"];
  quick_summary: string | null;
  report: string | null;
  sources: SourceSummary[] | null;
  source_count: number;
  input_tokens: number;
  output_tokens: number;
  duration_ms: number | null;
  error: string | null;
  created_at: string | Date;
}

const iso = (d: string | Date) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());

function toRecord(r: SearchRow): SearchRecord {
  return {
    id: r.id,
    anonId: r.anon_id,
    userEmail: r.user_email,
    query: r.query,
    depth: r.depth,
    status: r.status,
    quickSummary: r.quick_summary,
    report: r.report,
    sources: r.sources ?? [],
    sourceCount: r.source_count,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    durationMs: r.duration_ms,
    error: r.error,
    createdAt: iso(r.created_at),
  };
}

export async function createSearch(viewer: Viewer, query: string, depth: string): Promise<string | null> {
  const sql = await db();
  if (!sql) return null;
  const id = crypto.randomUUID();
  await sql`INSERT INTO searches (id, anon_id, user_email, query, depth) VALUES (${id}, ${viewer.anonId}, ${viewer.email}, ${query}, ${depth})`;
  return id;
}

export async function completeSearch(
  id: string,
  data: { quickSummary: string; report: string; sources: SourceSummary[]; usage: Usage; durationMs: number },
): Promise<void> {
  const sql = await db();
  if (!sql) return;
  await sql`UPDATE searches SET status = 'done', quick_summary = ${data.quickSummary}, report = ${data.report},
    sources = ${JSON.stringify(data.sources)}::jsonb, source_count = ${data.sources.length},
    input_tokens = ${data.usage.inputTokens}, output_tokens = ${data.usage.outputTokens},
    duration_ms = ${data.durationMs}, completed_at = now() WHERE id = ${id}`;
}

export async function failSearch(
  id: string,
  data: { error: string; quickSummary: string; usage: Usage; durationMs: number },
): Promise<void> {
  const sql = await db();
  if (!sql) return;
  await sql`UPDATE searches SET status = 'error', error = ${data.error.slice(0, 1000)}, quick_summary = ${data.quickSummary},
    input_tokens = ${data.usage.inputTokens}, output_tokens = ${data.usage.outputTokens},
    duration_ms = ${data.durationMs}, completed_at = now() WHERE id = ${id}`;
}

/** A viewer owns a search if it was made in this browser or under their verified email. */
export async function listSearches(viewer: Viewer, limit = 100): Promise<SearchRecord[]> {
  const sql = await db();
  if (!sql) return [];
  const rows = (await sql`SELECT * FROM searches
    WHERE anon_id = ${viewer.anonId} OR (${viewer.email}::text IS NOT NULL AND user_email = ${viewer.email})
    ORDER BY created_at DESC LIMIT ${limit}`) as SearchRow[];
  return rows.map(toRecord);
}

export async function getSearch(viewer: Viewer, id: string): Promise<SearchRecord | null> {
  const sql = await db();
  if (!sql) return null;
  const rows = (await sql`SELECT * FROM searches WHERE id = ${id}`) as SearchRow[];
  const record = rows[0] ? toRecord(rows[0]) : null;
  if (!record) return null;
  const owns = record.anonId === viewer.anonId || (viewer.email !== null && record.userEmail === viewer.email);
  return owns || viewer.isAdmin ? record : null;
}

/** After sign-in, attach this browser's anonymous searches to the verified email. */
export async function claimAnonymousSearches(anonId: string, email: string): Promise<void> {
  const sql = await db();
  if (!sql) return;
  await sql`UPDATE searches SET user_email = ${email} WHERE anon_id = ${anonId} AND user_email IS NULL`;
}

export async function countRecentRuns(viewer: Viewer, windowMinutes: number): Promise<number> {
  const sql = await db();
  if (!sql) return 0;
  const rows = (await sql`SELECT count(*)::int AS n FROM searches
    WHERE (anon_id = ${viewer.anonId} OR (${viewer.email}::text IS NOT NULL AND user_email = ${viewer.email}))
    AND created_at > now() - make_interval(mins => ${windowMinutes})`) as { n: number }[];
  return rows[0]?.n ?? 0;
}

export async function recordEmailDelivery(searchId: string | null, recipient: string, anonId: string): Promise<void> {
  const sql = await db();
  if (!sql) return;
  await sql`INSERT INTO email_deliveries (search_id, recipient, anon_id) VALUES (${searchId}, ${recipient}, ${anonId})`;
}

export async function countRecentEmails(anonId: string, windowHours: number): Promise<number> {
  const sql = await db();
  if (!sql) return 0;
  const rows = (await sql`SELECT count(*)::int AS n FROM email_deliveries
    WHERE anon_id = ${anonId} AND created_at > now() - make_interval(hours => ${windowHours})`) as { n: number }[];
  return rows[0]?.n ?? 0;
}
