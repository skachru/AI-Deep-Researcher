import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ANON_COOKIE, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/auth/constants";
import { consumeLoginToken } from "@/lib/auth/login";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { createSessionToken } from "@/lib/auth/session";
import { claimAnonymousSearches } from "@/lib/db/searches";
import { upsertUser } from "@/lib/db/users";

export const runtime = "nodejs";

/** GET /api/auth/callback?token=… — verifies the emailed link and starts a session. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  const next = safeRedirectPath(url.searchParams.get("next"));

  const email = token ? await consumeLoginToken(token) : null;
  if (!email) return NextResponse.redirect(new URL("/login?error=expired", request.url));

  const jar = await cookies();
  const anonId = jar.get(ANON_COOKIE)?.value;
  if (anonId) await claimAnonymousSearches(anonId, email).catch(() => undefined);
  await upsertUser({ email, provider: "email" }).catch(() => undefined);

  const response = NextResponse.redirect(new URL(next, request.url));
  response.cookies.set(SESSION_COOKIE, await createSessionToken({ email }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_S,
  });
  return response;
}
