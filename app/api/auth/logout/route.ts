import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

/** POST /api/auth/logout — ends the session (anonymous history stays on this browser). */
export async function POST(request: Request): Promise<Response> {
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
