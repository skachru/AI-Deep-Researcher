import { NextResponse, type NextRequest } from "next/server";
import { ANON_COOKIE, ONE_YEAR_S } from "@/lib/auth/constants";

/**
 * Gives every browser a random, httpOnly anonymous id so search history works
 * without sign-up. The id is also injected into the current request so server
 * components see it on the very first visit.
 */
export function middleware(request: NextRequest) {
  if (request.cookies.get(ANON_COOKIE)?.value) return NextResponse.next();

  const id = crypto.randomUUID();
  request.cookies.set(ANON_COOKIE, id);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(ANON_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_YEAR_S,
  });
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|demo/).*)"],
};
