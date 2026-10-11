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

function refundInMemory(rule: LimitRule, now: number): void {
  const entry = memory.get(bucketFor(rule, now).bucket);
  if (entry && entry.count > 0) entry.count -= 1;
}

interface Charge {
  allowed: boolean;
  /** Gives the use back (used when a later rule denies the request). */
  refund: () => Promise<void>;
}

async function charge(rule: LimitRule, now: number): Promise<Charge> {
  const memoryCharge = (): Charge => ({
    allowed: consumeInMemory(rule, now),
    refund: async () => refundInMemory(rule, now),
  });
  let sql: Awaited<ReturnType<typeof db>>;
  let count: number;
  const { bucket, expiresAt } = bucketFor(rule, now);
  try {
    sql = await db();
    if (!sql) return memoryCharge();
    const rows = (await sql`INSERT INTO rate_limits (bucket, count, expires_at)
      VALUES (${bucket}, 1, ${new Date(expiresAt).toISOString()})
      ON CONFLICT (bucket) DO UPDATE SET count = rate_limits.count + 1
      RETURNING count`) as { count: number }[];
    count = rows[0]?.count ?? 1;
  } catch (err) {
    // Only a failed admission query falls back; the database answer is authoritative otherwise.
    console.error("rate limit: database unavailable, using in-memory limits", err);
    return memoryCharge();
  }
  // Housekeeping is separate: its failure must never change the decision above.
  if (Math.random() < 0.02) {
    await sql`DELETE FROM rate_limits WHERE expires_at < now()`.catch((err: unknown) =>
      console.error("rate limit: cleanup failed", err),
    );
  }
  const conn = sql;
  return {
    allowed: count <= rule.limit,
    refund: async () => {
      await conn`UPDATE rate_limits SET count = count - 1 WHERE bucket = ${bucket} AND count > 0`.catch(
        (err: unknown) => console.error("rate limit: refund failed", err),
      );
    },
  };
}

/** Counts one use against the rule and returns whether it is allowed. */
export async function consumeLimit(rule: LimitRule): Promise<boolean> {
  return (await charge(rule, Date.now())).allowed;
}

/**
 * Admits a request only if every rule allows it. Rules are checked in order
 * (narrowest first, e.g. user → IP → site-wide), and a denial gives back the
 * uses already counted, so a visitor who is over their own limit can't burn
 * the shared site-wide allowance with rejected requests.
 */
export async function consumeAll(rules: LimitRule[]): Promise<boolean> {
  const now = Date.now();
  const charged: Charge[] = [];
  for (const rule of rules) {
    const c = await charge(rule, now);
    if (!c.allowed) {
      await Promise.all([c, ...charged].map((x) => x.refund()));
      return false;
    }
    charged.push(c);
  }
  return true;
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
