import { jwtVerify, SignJWT } from "jose";
import { cookies } from "next/headers";
import { ANON_COOKIE, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/auth/constants";
import type { Viewer } from "@/lib/db/searches";

function secretKey(): Uint8Array | null {
  const secret = process.env.AUTH_SECRET;
  return secret && secret.length >= 32 ? new TextEncoder().encode(secret) : null;
}

export function isAuthConfigured(): boolean {
  return secretKey() !== null;
}

export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "skachru@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createSessionToken(email: string): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error("AUTH_SECRET is not configured (min 32 characters).");
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_S}s`)
    .sign(key);
}

export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  const key = secretKey();
  if (!token || !key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

/** Who is making this request: anonymous browser id plus verified email, if signed in. */
export async function getViewer(): Promise<Viewer> {
  const jar = await cookies();
  const anonId = jar.get(ANON_COOKIE)?.value ?? "unknown";
  const email = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  return { anonId, email, isAdmin: email !== null && adminEmails().includes(email) };
}
