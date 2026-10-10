import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ANON_COOKIE, SESSION_COOKIE, SESSION_TTL_S } from "@/lib/auth/constants";
import { finishGoogleLogin, GOOGLE_STATE_COOKIE } from "@/lib/auth/google";
import { createSessionToken } from "@/lib/auth/session";
import { claimAnonymousSearches } from "@/lib/db/searches";
import { upsertUser } from "@/lib/db/users";

export const runtime = "nodejs";

/** GET /api/auth/google/callback — completes Google sign-in and starts a session. */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const jar = await cookies();
  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
    res.cookies.delete(GOOGLE_STATE_COOKIE);
    return res;
  };
  if (url.searchParams.get("error")) return fail("cancelled");

  try {
    const { profile, next } = await finishGoogleLogin({
      requestUrl: request.url,
      code: url.searchParams.get("code") ?? "",
      state: url.searchParams.get("state") ?? "",
      cookie: jar.get(GOOGLE_STATE_COOKIE)?.value,
    });
    const anonId = jar.get(ANON_COOKIE)?.value;
    await Promise.all([
      anonId ? claimAnonymousSearches(anonId, profile.email).catch(() => undefined) : undefined,
      upsertUser({ ...profile, provider: "google" }).catch(() => undefined),
    ]);
    const response = NextResponse.redirect(new URL(next, request.url));
    response.cookies.delete(GOOGLE_STATE_COOKIE);
    response.cookies.set(SESSION_COOKIE, await createSessionToken(profile), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_TTL_S,
    });
    return response;
  } catch (err) {
    console.error("auth: google sign-in failed", err);
    return fail("google");
  }
}
