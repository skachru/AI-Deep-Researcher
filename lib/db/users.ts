import { db } from "@/lib/db";

export interface UserRow {
  email: string;
  name: string | null;
  picture: string | null;
  provider: string;
  createdAt: string;
  lastLoginAt: string;
  loginCount: number;
  searches: number;
}

/** Records a sign-in (Google or email link) for the admin's user list. */
export async function upsertUser(user: {
  email: string;
  name?: string;
  picture?: string;
  provider: "google" | "email";
}) {
  const sql = await db();
  if (!sql) return;
  await sql`INSERT INTO users (email, name, picture, provider) VALUES (${user.email}, ${user.name ?? null}, ${user.picture ?? null}, ${user.provider})
    ON CONFLICT (email) DO UPDATE SET
      name = coalesce(EXCLUDED.name, users.name),
      picture = coalesce(EXCLUDED.picture, users.picture),
      provider = EXCLUDED.provider,
      last_login_at = now(),
      login_count = users.login_count + 1`;
}

export async function listUsers(limit = 50): Promise<UserRow[]> {
  const sql = await db();
  if (!sql) return [];
  const rows = (await sql`SELECT u.email, u.name, u.picture, u.provider, u.created_at, u.last_login_at, u.login_count,
      (SELECT count(*)::int FROM searches s WHERE s.user_email = u.email) AS searches
    FROM users u ORDER BY u.last_login_at DESC LIMIT ${limit}`) as {
    email: string;
    name: string | null;
    picture: string | null;
    provider: string;
    created_at: string | Date;
    last_login_at: string | Date;
    login_count: number;
    searches: number;
  }[];
  return rows.map((r) => ({
    email: r.email,
    name: r.name,
    picture: r.picture,
    provider: r.provider,
    createdAt: new Date(r.created_at).toISOString(),
    lastLoginAt: new Date(r.last_login_at).toISOString(),
    loginCount: r.login_count,
    searches: r.searches,
  }));
}

/** True once any configured admin has signed in (ends the open "bootstrap" window of /setup). */
export async function hasAdminSignedIn(admins: string[]): Promise<boolean> {
  const sql = await db();
  if (!sql || admins.length === 0) return false;
  const rows = (await sql`SELECT 1 FROM users WHERE email = ANY(${admins}) LIMIT 1`) as unknown[];
  return rows.length > 0;
}
