import { z } from "zod";
import { createLoginToken } from "@/lib/auth/login";
import { isAuthConfigured, normaliseEmail } from "@/lib/auth/session";
import { isDbConfigured } from "@/lib/db";
import { EMAIL_PATTERN, isEmailConfigured, sendMail } from "@/lib/email";

export const runtime = "nodejs";

const BodySchema = z.object({
  email: z.string().trim().max(254).regex(EMAIL_PATTERN, "Please enter a valid email address"),
  next: z.string().startsWith("/").max(200).optional(),
});

/** POST /api/auth/login — emails a single-use sign-in link (passwordless). */
export async function POST(request: Request): Promise<Response> {
  if (!isAuthConfigured() || !isDbConfigured() || !isEmailConfigured()) {
    return Response.json({ error: "Sign-in isn't set up on this server yet." }, { status: 503 });
  }
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid request" }, { status: 400 });
  }
  const email = normaliseEmail(parsed.data.email);
  try {
    const token = await createLoginToken(email);
    const url = new URL("/api/auth/callback", request.url);
    url.searchParams.set("token", token);
    if (parsed.data.next && !parsed.data.next.startsWith("//")) url.searchParams.set("next", parsed.data.next);
    await sendMail({
      to: email,
      subject: "Your Lumen sign-in link",
      text: `Sign in to Lumen: ${url.toString()}\n\nThis link expires in 15 minutes. If you didn't request it, ignore this email.`,
      html: `<p>Click to sign in to <b>Lumen</b>:</p><p><a href="${url.toString()}">Sign in</a></p><p style="color:#6b6f7b">This link expires in 15 minutes and works once. If you didn't request it, ignore this email.</p>`,
    });
  } catch (err) {
    const message =
      err instanceof Error && err.message.startsWith("Too many") ? err.message : "Could not send the sign-in email.";
    if (!(err instanceof Error && err.message.startsWith("Too many"))) console.error("auth: login failed", err);
    return Response.json({ error: message }, { status: 429 });
  }
  return Response.json({ ok: true });
}
