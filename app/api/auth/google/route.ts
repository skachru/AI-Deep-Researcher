import { NextResponse } from "next/server";
import { GOOGLE_STATE_COOKIE, isGoogleConfigured, startGoogleLogin } from "@/lib/auth/google";
import { isAuthConfigured } from "@/lib/auth/session";

export const runtime = "nodejs";

/** GET /api/auth/google?next=/history — redirects to Google's account chooser. */
export async function GET(request: Request): Promise<Response> {
  if (!isGoogleConfigured() || !isAuthConfigured()) {
    return NextResponse.redirect(new URL("/login?error=unavailable", request.url));
  }
  const next = new URL(request.url).searchParams.get("next") ?? "/history";
  const { url, cookie } = startGoogleLogin(request.url, next);
  const response = NextResponse.redirect(url);
  response.cookies.set(GOOGLE_STATE_COOKIE, cookie, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return response;
}
