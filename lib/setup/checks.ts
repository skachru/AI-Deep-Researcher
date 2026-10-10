import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";
import { redirectUri } from "@/lib/auth/google";
import { adminEmails } from "@/lib/auth/session";
import { db } from "@/lib/db";

export type CheckStatus = "ok" | "warn" | "fail" | "off";

export interface Check {
  group: string;
  name: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

async function checkAnthropic(): Promise<Check> {
  const key = process.env.ANTHROPIC_API_KEY;
  const model = process.env.LUMEN_MODEL ?? "claude-opus-5-5";
  if (!key)
    return {
      group: "Research",
      name: "Anthropic API key",
      status: "fail",
      detail: "ANTHROPIC_API_KEY is not set.",
      fix: "Add ANTHROPIC_API_KEY in Vercel → Settings → Environment Variables.",
    };
  try {
    // Reading the model's metadata validates the key and model access without spending tokens.
    await new Anthropic({ apiKey: key, timeout: 10_000, maxRetries: 0 }).models.retrieve(model);
    return {
      group: "Research",
      name: "Anthropic API key",
      status: "ok",
      detail: `Key works and has access to ${model}.`,
    };
  } catch (err) {
    return {
      group: "Research",
      name: "Anthropic API key",
      status: "fail",
      detail: describe(err),
      fix: "Check the key in console.anthropic.com (and that it has credit).",
    };
  }
}

function checkSecret(): Check {
  const len = process.env.AUTH_SECRET?.length ?? 0;
  if (len >= 32) return { group: "Sign-in", name: "AUTH_SECRET", status: "ok", detail: `Set (${len} characters).` };
  return {
    group: "Sign-in",
    name: "AUTH_SECRET",
    status: "fail",
    detail: len ? `Too short (${len} characters; need 32+).` : "Not set — sign-in is disabled.",
    fix: "Add AUTH_SECRET: any random text of 40+ characters (e.g. from `openssl rand -base64 48`).",
  };
}

/**
 * Validates the Google OAuth client against Google itself:
 * - token endpoint with a dummy code: "invalid_client" ⇒ wrong ID/secret, "invalid_grant" ⇒ credentials accepted;
 * - authorization endpoint: an error redirect mentioning redirect_uri_mismatch ⇒ callback URL not registered.
 */
async function checkGoogle(requestUrl: string): Promise<Check[]> {
  const id = process.env.GOOGLE_CLIENT_ID ?? "";
  const secret = process.env.GOOGLE_CLIENT_SECRET ?? "";
  const callback = redirectUri(requestUrl);
  if (!id || !secret) {
    return [
      {
        group: "Google sign-in",
        name: "Client ID & secret",
        status: "fail",
        detail: `${id ? "" : "GOOGLE_CLIENT_ID "}${secret ? "" : "GOOGLE_CLIENT_SECRET "}not set.`,
        fix: "Copy both from Google Cloud → APIs & Services → Credentials → your OAuth client, into Vercel environment variables.",
      },
    ];
  }
  const checks: Check[] = [];
  if (!id.endsWith(".apps.googleusercontent.com")) {
    checks.push({
      group: "Google sign-in",
      name: "Client ID format",
      status: "warn",
      detail: "Expected it to end with .apps.googleusercontent.com — check for a copy/paste mistake or extra spaces.",
    });
  }

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: "lumen-setup-check",
        client_id: id,
        client_secret: secret,
        redirect_uri: callback,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: string; error_description?: string };
    if (body.error === "invalid_grant") {
      checks.push({
        group: "Google sign-in",
        name: "Client ID & secret",
        status: "ok",
        detail: "Google accepted the client ID and secret.",
      });
    } else {
      checks.push({
        group: "Google sign-in",
        name: "Client ID & secret",
        status: "fail",
        detail: `Google said: ${body.error ?? res.status}${body.error_description ? ` — ${body.error_description}` : ""}`,
        fix: "Re-copy the Client ID and Client secret from the same OAuth client (type: Web application).",
      });
    }
  } catch (err) {
    checks.push({
      group: "Google sign-in",
      name: "Client ID & secret",
      status: "warn",
      detail: `Could not reach Google: ${describe(err)}`,
    });
  }

  try {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({
      client_id: id,
      redirect_uri: callback,
      response_type: "code",
      scope: "openid email profile",
    }).toString();
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(8000) });
    const location = res.headers.get("location") ?? "";
    const html = location ? "" : await res.text().catch(() => "");
    const errorParam = location.includes("/oauth/error") ? (new URL(location).searchParams.get("authError") ?? "") : "";
    const decoded = errorParam
      ? Buffer.from(errorParam.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("latin1")
      : html;
    if (/redirect_uri_mismatch/.test(decoded)) {
      checks.push({
        group: "Google sign-in",
        name: "Redirect URI registered",
        status: "fail",
        detail: `Google doesn't recognise ${callback}`,
        fix: `In Google Cloud → Credentials → your OAuth client → Authorised redirect URIs, add exactly: ${callback}`,
      });
    } else if (errorParam || /invalid_client|disabled_client/.test(decoded)) {
      checks.push({
        group: "Google sign-in",
        name: "Redirect URI registered",
        status: "fail",
        detail: "Google rejected the client when starting sign-in.",
        fix: "Check the Client ID and that the OAuth client isn't deleted or disabled.",
      });
    } else {
      checks.push({
        group: "Google sign-in",
        name: "Redirect URI registered",
        status: "ok",
        detail: `Google accepts ${callback}`,
      });
    }
  } catch (err) {
    checks.push({
      group: "Google sign-in",
      name: "Redirect URI registered",
      status: "warn",
      detail: `Could not reach Google: ${describe(err)}`,
    });
  }

  const appUrl = process.env.APP_URL;
  const origin = new URL(requestUrl).origin;
  checks.push(
    appUrl
      ? appUrl.replace(/\/$/, "") === origin
        ? { group: "Google sign-in", name: "APP_URL", status: "ok", detail: `${appUrl} matches this site.` }
        : {
            group: "Google sign-in",
            name: "APP_URL",
            status: "warn",
            detail: `APP_URL is ${appUrl} but you're visiting ${origin}. Sign-in will send people to APP_URL.`,
          }
      : {
          group: "Google sign-in",
          name: "APP_URL",
          status: "warn",
          detail: `Not set, so the callback follows whichever URL is visited (${origin}). Preview URLs won't be registered with Google.`,
          fix: `Set APP_URL to your production URL, e.g. ${origin}`,
        },
  );
  return checks;
}

async function checkDatabase(): Promise<Check> {
  if (!process.env.DATABASE_URL) {
    return {
      group: "History & admin",
      name: "Database",
      status: "off",
      detail: "DATABASE_URL not set — history, admin analytics and email sign-in are off.",
      fix: "Vercel → Storage → Create Database → Neon (free) → Connect to this project, then redeploy.",
    };
  }
  try {
    const sql = await db();
    const rows =
      (await sql!`SELECT (SELECT count(*)::int FROM searches) AS searches, (SELECT count(*)::int FROM users) AS users`) as {
        searches: number;
        users: number;
      }[];
    return {
      group: "History & admin",
      name: "Database",
      status: "ok",
      detail: `Connected. Tables ready (${rows[0]?.searches ?? 0} searches, ${rows[0]?.users ?? 0} users).`,
    };
  } catch (err) {
    return {
      group: "History & admin",
      name: "Database",
      status: "fail",
      detail: describe(err),
      fix: "Re-connect the Neon database to the project so DATABASE_URL is correct.",
    };
  }
}

async function checkEmail(): Promise<Check> {
  const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return {
      group: "Email",
      name: "SMTP",
      status: "off",
      detail: "Not configured — the “email me this report” option is hidden.",
      fix: "Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=you@gmail.com, SMTP_PASS=16-character app password.",
    };
  }
  try {
    const port = Number(process.env.SMTP_PORT ?? 465);
    await nodemailer
      .createTransport({
        host: SMTP_HOST,
        port,
        secure: port === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
        connectionTimeout: 8000,
      })
      .verify();
    return { group: "Email", name: "SMTP", status: "ok", detail: `Logged in to ${SMTP_HOST} as ${SMTP_USER}.` };
  } catch (err) {
    return {
      group: "Email",
      name: "SMTP",
      status: "fail",
      detail: describe(err),
      fix: "For Gmail use an App password (not your normal password) with 2-Step Verification on.",
    };
  }
}

export async function runSetupChecks(requestUrl: string): Promise<Check[]> {
  const [anthropic, google, database, email] = await Promise.all([
    checkAnthropic(),
    checkGoogle(requestUrl),
    checkDatabase(),
    checkEmail(),
  ]);
  return [
    anthropic,
    checkSecret(),
    ...google,
    { group: "Sign-in", name: "Admins", status: "ok", detail: adminEmails().join(", ") },
    database,
    email,
  ];
}
