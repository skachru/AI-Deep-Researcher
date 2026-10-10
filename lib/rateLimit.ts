import { db } from "@/lib/db";

/**
 * Fixed-window rate limiting for anything that costs money or sends email.
 *
 * - With a database: one atomic `INSERT … ON CONFLICT DO UPDATE … RETURNING`
 *   per check, so concurrent requests cannot race past the limit.
 * - Without a database, or if the query fails: an in-memory counter. It is
 *   per server instance (best effort), but limits are never silently disabled.
 */
export interface LimitRule {
  /** Logical key, e.g. "research:user:<id>" — the time bucket is appended. */
  key: string;
  limit: number;
  windowSeconds: number;
}

const memory = new Map<string, { count: number; expiresAt: number }>();

function bucketFor(rule: LimitRule, now: number): { bucket: string; expiresAt: number } {
  const windowMs = rule.windowSeconds * 1000;
  const slot = Math.floor(now / windowMs);
  return { bucket: `${rule.key}:${slot}`, expiresAt: (slot + 1) * windowMs };
}

/** Pure-ish in-memory fallback (exported for tests). */
export function consumeInMemory(rule: LimitRule, now = Date.now()): boolean {
  const { bucket, expiresAt } = bucketFor(rule, now);
  if (memory.size > 10_000) for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
  const entry = memory.get(bucket) ?? { count: 0, expiresAt };
  entry.count += 1;
  memory.set(bucket, entry);
  return entry.count <= rule.limit;
}

/** Counts one use against the rule and returns whether it is allowed. */
export async function consumeLimit(rule: LimitRule): Promise<boolean> {
  const now = Date.now();
  try {
    const sql = await db();
    if (!sql) return consumeInMemory(rule, now);
    const { bucket, expiresAt } = bucketFor(rule, now);
    const rows = (await sql`INSERT INTO rate_limits (bucket, count, expires_at)
      VALUES (${bucket}, 1, ${new Date(expiresAt).toISOString()})
      ON CONFLICT (bucket) DO UPDATE SET count = rate_limits.count + 1
      RETURNING count`) as { count: number }[];
    if (Math.random() < 0.02) await sql`DELETE FROM rate_limits WHERE expires_at < now()`;
    return (rows[0]?.count ?? 1) <= rule.limit;
  } catch (err) {
    console.error("rate limit: database unavailable, using in-memory limits", err);
    return consumeInMemory(rule, now);
  }
}

/** Checks several rules; all of them are counted, and every one must pass. */
export async function consumeAll(rules: LimitRule[]): Promise<boolean> {
  const results = await Promise.all(rules.map(consumeLimit));
  return results.every(Boolean);
}

/** Best-effort client IP (Vercel sets x-forwarded-for; the first entry is the client). */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

const env = (name: string, fallback: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Central limits (overridable with env vars). */
export const LIMITS = {
  researchPerUserHour: () => env("RUNS_PER_HOUR", 10),
  researchPerIpHour: () => env("RUNS_PER_IP_HOUR", 20),
  researchGlobalDay: () => env("RUNS_PER_DAY", 300),
  emailsPerUserDay: () => env("EMAILS_PER_DAY", 10),
  emailsPerIpDay: () => env("EMAILS_PER_IP_DAY", 20),
  emailsGlobalDay: () => env("EMAILS_GLOBAL_DAY", 200),
};
