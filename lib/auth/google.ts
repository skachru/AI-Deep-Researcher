import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Google Sign-In via OAuth 2.0 authorization-code flow with PKCE and state.
 * The ID token is verified against Google's published keys (issuer + audience).
 */
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export const GOOGLE_STATE_COOKIE = "lumen_oauth";

export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** The callback URL registered in Google Cloud. APP_URL pins it; otherwise the request origin is used. */
export function redirectUri(requestUrl: string): string {
  const base = process.env.APP_URL?.replace(/\/$/, "") ?? new URL(requestUrl).origin;
  return `${base}/api/auth/google/callback`;
}

export function safeNext(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/history";
}

export interface OAuthStart {
  url: string;
  /** Stored in a short-lived httpOnly cookie and checked on callback. */
  cookie: string;
}

export function startGoogleLogin(requestUrl: string, next: string): OAuthStart {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri(requestUrl),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return { url: url.toString(), cookie: JSON.stringify({ state, verifier, next: safeNext(next) }) };
}

export interface GoogleProfile {
  email: string;
  name?: string;
  picture?: string;
}

export async function finishGoogleLogin(params: {
  requestUrl: string;
  code: string;
  state: string;
  cookie: string | undefined;
}): Promise<{ profile: GoogleProfile; next: string }> {
  const saved = params.cookie
    ? (JSON.parse(params.cookie) as { state?: string; verifier?: string; next?: string })
    : {};
  if (!saved.state || !saved.verifier || saved.state !== params.state) throw new Error("Sign-in session expired.");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: params.code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri(params.requestUrl),
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status}).`);
  const tokens = (await res.json()) as { id_token?: string };
  if (!tokens.id_token) throw new Error("Google did not return an ID token.");

  const { payload } = await jwtVerify(tokens.id_token, JWKS, {
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  if (typeof payload.email !== "string" || payload.email_verified !== true) {
    throw new Error("Your Google account email is not verified.");
  }
  return {
    profile: {
      email: payload.email.toLowerCase(),
      name: typeof payload.name === "string" ? payload.name : undefined,
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
    },
    next: safeNext(saved.next),
  };
}
