import nodemailer from "nodemailer";
import { redirectUri } from "@/lib/auth/google";
import { adminEmails } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { DEFAULT_MODEL } from "@/lib/env";
import { OPENROUTER_BASE_URL } from "@/lib/llm";

export type CheckStatus = "ok" | "warn" | "fail" | "off";

export interface Check {
  group: string;
  name: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
}

const describe = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 300);

async function checkOpenRouter(): Promise<Check[]> {
  const key = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  if (!key) {
    return [
      {
        group: "Research",
        name: "OpenRouter API key",
        status: "fail",
        detail: "OPENROUTER_API_KEY is not set.",
        fix: "Create a key at openrouter.ai/keys and add it as OPENROUTER_API_KEY in Vercel → Settings → Environment Variables.",
      },
    ];
  }
  const checks: Check[] = [];
  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/key`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json().catch(() => ({}))) as {
      data?: { limit?: number | null; limit_remaining?: number | null; usage?: number; is_free_tier?: boolean };
      error?: { message?: string };
    };
    if (!res.ok || !body.data) {
      checks.push({
        group: "Research",
        name: "OpenRouter API key",
        status: "fail",
        detail: body.error?.message ?? `OpenRouter returned HTTP ${res.status}.`,
        fix: "Check the key at openrouter.ai/keys (it may be disabled or mistyped).",
      });
    } else {
      const remaining = body.data.limit_remaining;
      const low = typeof remaining === "number" && remaining < 1;
      checks.push({
        group: "Research",
        name: "OpenRouter API key",
        status: low ? "warn" : "ok",
        detail:
          `Key works. Used $${(body.data.usage ?? 0).toFixed(2)}` +
          (typeof remaining === "number"
            ? `, $${remaining.toFixed(2)} left on this key's limit.`
            : " (no spending limit on this key)."),
        fix: low ? "Top up credits at openrouter.ai/credits or raise the key's limit." : undefined,
      });
    }
  } catch (err) {
    checks.push({
      group: "Research",
      name: "OpenRouter API key",
      status: "warn",
      detail: `Could not reach OpenRouter: ${describe(err)}`,
    });
  }

  try {
    const res = await fetch(`${OPENROUTER_BASE_URL}/models`, { signal: AbortSignal.timeout(10_000) });
    const { data } = (await res.json()) as {
      data?: { id: string; supported_parameters?: string[]; pricing?: { prompt?: string; completion?: string } }[];
    };
    const found = data?.find((m) => m.id === model);
    if (!found) {
      checks.push({
        group: "Research",
        name: "Model",
        status: "fail",
        detail: `"${model}" is not an OpenRouter model id.`,
        fix: "Pick a model on openrouter.ai/models that supports structured outputs and tools, and set OPENROUTER_MODEL to its id (e.g. qwen/qwen3.8-flash).",
      });
    } else {
      const params = found.supported_parameters ?? [];
      const structured = params.includes("response_format") || params.includes("structured_outputs");
      const tools = params.includes("tools");
      const price = (p?: string) => (p ? `$${(Number(p) * 1_000_000).toFixed(2)}` : "?");
      checks.push({
        group: "Research",
        name: "Model",
        status: structured && tools ? "ok" : "fail",
        detail:
          `${model}: ${price(found.pricing?.prompt)} in / ${price(found.pricing?.completion)} out per million tokens. ` +
          `Structured outputs ${structured ? "✓" : "✗"}, tools ${tools ? "✓" : "✗"}.`,
        fix: structured && tools ? undefined : "Choose a model that supports both structured outputs and tools.",
      });
    }
  } catch (err) {
    checks.push({
      group: "Research",
      name: "Model",
      status: "warn",
      detail: `Could not load the model list: ${describe(err)}`,
    });
  }
  return checks;
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
  const [research, google, database, email] = await Promise.all([
    checkOpenRouter(),
    checkGoogle(requestUrl),
    checkDatabase(),
    checkEmail(),
  ]);
  return [
    ...research,
    checkSecret(),
    ...google,
    { group: "Sign-in", name: "Admins", status: "ok", detail: adminEmails().join(", ") },
    database,
    email,
  ];
}
