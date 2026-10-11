import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

/**
 * Postgres (Neon serverless driver) — optional. Without DATABASE_URL the app
 * still runs research; history, email logging and analytics are disabled.
 */
let client: NeonQueryFunction<false, false> | null | undefined;
let schemaReady: Promise<void> | null = null;

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function getClient(): NeonQueryFunction<false, false> | null {
  if (client === undefined) client = process.env.DATABASE_URL ? neon(process.env.DATABASE_URL) : null;
  return client;
}

/** Creates tables on first use (idempotent), so setup needs no migration step. */
async function ensureSchema(sql: NeonQueryFunction<false, false>): Promise<void> {
  schemaReady ??= (async () => {
    await sql`CREATE TABLE IF NOT EXISTS searches (
      id text PRIMARY KEY,
      anon_id text NOT NULL,
      user_email text,
      query text NOT NULL,
      depth text NOT NULL,
      status text NOT NULL DEFAULT 'running',
      quick_summary text,
      report text,
      sources jsonb,
      source_count integer NOT NULL DEFAULT 0,
      input_tokens integer NOT NULL DEFAULT 0,
      output_tokens integer NOT NULL DEFAULT 0,
      duration_ms integer,
      error text,
      created_at timestamptz NOT NULL DEFAULT now(),
      completed_at timestamptz
    )`;
    await sql`CREATE INDEX IF NOT EXISTS searches_anon_idx ON searches (anon_id, created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS searches_email_idx ON searches (user_email, created_at DESC)`;
    await sql`ALTER TABLE searches ADD COLUMN IF NOT EXISTS share_id text`;
    await sql`ALTER TABLE searches ADD COLUMN IF NOT EXISTS report_length text NOT NULL DEFAULT 'full'`;
    await sql`CREATE UNIQUE INDEX IF NOT EXISTS searches_share_idx ON searches (share_id)`;
    await sql`CREATE TABLE IF NOT EXISTS email_deliveries (
      id bigserial PRIMARY KEY,
      search_id text,
      recipient text NOT NULL,
      anon_id text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS users (
      email text PRIMARY KEY,
      name text,
      picture text,
      provider text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      last_login_at timestamptz NOT NULL DEFAULT now(),
      login_count integer NOT NULL DEFAULT 1
    )`;
    await sql`CREATE TABLE IF NOT EXISTS rate_limits (
      bucket text PRIMARY KEY,
      count integer NOT NULL,
      expires_at timestamptz NOT NULL
    )`;
    await sql`CREATE TABLE IF NOT EXISTS login_tokens (
      token_hash text PRIMARY KEY,
      email text NOT NULL,
      expires_at timestamptz NOT NULL,
      used_at timestamptz
    )`;
  })().catch((err) => {
    schemaReady = null;
    throw err;
  });
  return schemaReady;
}

/** Returns a ready query function, or null when no database is configured. */
export async function db(): Promise<NeonQueryFunction<false, false> | null> {
  const sql = getClient();
  if (!sql) return null;
  await ensureSchema(sql);
  return sql;
}
