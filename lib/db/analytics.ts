import { db } from "@/lib/db";

export interface Analytics {
  totals: {
    searches: number;
    completed: number;
    failed: number;
    uniqueUsers: number;
    signedInUsers: number;
    emailsSent: number;
    avgDurationMs: number | null;
    totalInputTokens: number;
    totalOutputTokens: number;
  };
  perDay: { day: string; searches: number; failed: number }[];
  depthSplit: { depth: string; n: number }[];
  topQueries: { query: string; n: number }[];
  recent: {
    id: string;
    query: string;
    depth: string;
    status: string;
    user: string;
    sourceCount: number;
    durationMs: number | null;
    tokens: number;
    createdAt: string;
  }[];
}

/** Aggregates for the admin dashboard (last 30 days for the daily series). */
export async function getAnalytics(): Promise<Analytics | null> {
  const sql = await db();
  if (!sql) return null;

  const [totals, emails, perDay, depthSplit, topQueries, recent] = await Promise.all([
    sql`SELECT count(*)::int AS searches,
          count(*) FILTER (WHERE status = 'done')::int AS completed,
          count(*) FILTER (WHERE status = 'error')::int AS failed,
          count(DISTINCT coalesce(user_email, anon_id))::int AS unique_users,
          count(DISTINCT user_email)::int AS signed_in_users,
          avg(duration_ms) FILTER (WHERE status = 'done')::float AS avg_duration_ms,
          coalesce(sum(input_tokens), 0)::bigint AS input_tokens,
          coalesce(sum(output_tokens), 0)::bigint AS output_tokens
        FROM searches`,
    sql`SELECT count(*)::int AS n FROM email_deliveries`,
    sql`SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
          count(s.id)::int AS searches,
          count(s.id) FILTER (WHERE s.status = 'error')::int AS failed
        FROM generate_series(current_date - 29, current_date, interval '1 day') AS d(day)
        LEFT JOIN searches s ON s.created_at::date = d.day::date
        GROUP BY d.day ORDER BY d.day`,
    sql`SELECT depth, count(*)::int AS n FROM searches GROUP BY depth ORDER BY n DESC`,
    sql`SELECT min(query) AS query, count(*)::int AS n FROM searches
        GROUP BY lower(trim(query)) ORDER BY n DESC, max(created_at) DESC LIMIT 10`,
    sql`SELECT id, query, depth, status, coalesce(user_email, 'anonymous · ' || left(anon_id, 8)) AS "user",
          source_count, duration_ms, (input_tokens + output_tokens)::int AS tokens, created_at
        FROM searches ORDER BY created_at DESC LIMIT 50`,
  ]);

  const t = totals[0] as {
    searches: number;
    completed: number;
    failed: number;
    unique_users: number;
    signed_in_users: number;
    avg_duration_ms: number | null;
    input_tokens: string | number;
    output_tokens: string | number;
  };

  return {
    totals: {
      searches: t.searches,
      completed: t.completed,
      failed: t.failed,
      uniqueUsers: t.unique_users,
      signedInUsers: t.signed_in_users,
      emailsSent: (emails[0] as { n: number }).n,
      avgDurationMs: t.avg_duration_ms,
      totalInputTokens: Number(t.input_tokens),
      totalOutputTokens: Number(t.output_tokens),
    },
    perDay: perDay as Analytics["perDay"],
    depthSplit: depthSplit as Analytics["depthSplit"],
    topQueries: topQueries as Analytics["topQueries"],
    recent: (
      recent as {
        id: string;
        query: string;
        depth: string;
        status: string;
        user: string;
        source_count: number;
        duration_ms: number | null;
        tokens: number;
        created_at: string | Date;
      }[]
    ).map((r) => ({
      id: r.id,
      query: r.query,
      depth: r.depth,
      status: r.status,
      user: r.user,
      sourceCount: r.source_count,
      durationMs: r.duration_ms,
      tokens: r.tokens,
      createdAt: new Date(r.created_at).toISOString(),
    })),
  };
}
