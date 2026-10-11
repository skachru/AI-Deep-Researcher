import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";

const TOKEN_TTL_MINUTES = 15;

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Creates a single-use sign-in token; only its hash is stored. */
export async function createLoginToken(email: string): Promise<string> {
  const sql = await db();
  if (!sql) throw new Error("Sign-in needs a database (DATABASE_URL).");
  // Housekeeping: expired tokens are useless after a day (best effort).
  await sql`DELETE FROM login_tokens WHERE expires_at < now() - interval '1 day'`.catch((err: unknown) =>
    console.error("login: token cleanup failed", err),
  );
  const recent = (await sql`SELECT count(*)::int AS n FROM login_tokens
    WHERE email = ${email} AND expires_at > now()`) as { n: number }[];
  if ((recent[0]?.n ?? 0) >= 3) throw new Error("Too many sign-in links requested. Try again in 15 minutes.");
  const token = randomBytes(32).toString("base64url");
  await sql`INSERT INTO login_tokens (token_hash, email, expires_at)
    VALUES (${hash(token)}, ${email}, now() + make_interval(mins => ${TOKEN_TTL_MINUTES}))`;
  return token;
}

/** Consumes a token and returns its email, or null if invalid, used or expired. */
export async function consumeLoginToken(token: string): Promise<string | null> {
  const sql = await db();
  if (!sql) return null;
  const rows = (await sql`UPDATE login_tokens SET used_at = now()
    WHERE token_hash = ${hash(token)} AND used_at IS NULL AND expires_at > now()
    RETURNING email`) as { email: string }[];
  return rows[0]?.email ?? null;
}
