import { CheckCircle2, CircleSlash, XCircle, AlertTriangle } from "lucide-react";
import { headers } from "next/headers";
import { SiteHeader } from "@/components/site-header";
import { getViewer } from "@/lib/auth/session";
import { runSetupChecks, type CheckStatus } from "@/lib/setup/checks";

export const dynamic = "force-dynamic";
export const metadata = { title: "Setup check — Lumen", robots: { index: false } };

const ICON: Record<CheckStatus, { icon: typeof CheckCircle2; className: string; label: string }> = {
  ok: { icon: CheckCircle2, className: "text-success", label: "OK" },
  warn: { icon: AlertTriangle, className: "text-warning", label: "Check" },
  fail: { icon: XCircle, className: "text-danger", label: "Fix needed" },
  off: { icon: CircleSlash, className: "text-subtle", label: "Not set up" },
};

/**
 * Validates the deployment's configuration live (OpenRouter key and model, Google OAuth
 * client + redirect URI, database, SMTP). Shows no secrets. Open to everyone
 * until an admin has signed in, then admins only.
 */
export default async function SetupPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const requestUrl = `${proto}://${host}/setup`;

  const viewer = await getViewer();
  const checks = await runSetupChecks(requestUrl);
  const adminExists = checks.some((c) => c.name === "Database" && /[1-9]\d* users/.test(c.detail));
  if (adminExists && !viewer.isAdmin) {
    return (
      <div className="min-h-dvh">
        <SiteHeader />
        <p className="mx-auto max-w-md px-4 pt-24 text-center text-[13px] text-muted">
          Setup is complete. Sign in as an admin to view the setup check.
        </p>
      </div>
    );
  }

  const groups = [...new Set(checks.map((c) => c.group))];
  const failing = checks.filter((c) => c.status === "fail").length;

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-[22px] font-semibold tracking-tight">Setup check</h1>
        <p className="mt-1 text-[13px] text-muted">
          Live test of this deployment&apos;s settings against OpenRouter, Google, the database and your mail server.{" "}
          {failing ? `${failing} item${failing > 1 ? "s" : ""} need fixing.` : "Everything required is working."}
        </p>
        <div className="mt-6 space-y-5">
          {groups.map((g) => (
            <section key={g} className="overflow-hidden rounded-xl border border-border bg-surface shadow-card">
              <h2 className="border-b border-border px-4 py-2.5 text-[13px] font-semibold">{g}</h2>
              <ul className="divide-y divide-border">
                {checks
                  .filter((c) => c.group === g)
                  .map((c) => {
                    const s = ICON[c.status];
                    return (
                      <li key={c.name} className="flex gap-3 px-4 py-3">
                        <s.icon className={`mt-0.5 size-4 shrink-0 ${s.className}`} aria-label={s.label} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="text-[13.5px] font-medium">{c.name}</span>
                            <span className={`text-[11.5px] ${s.className}`}>{s.label}</span>
                          </div>
                          <p className="mt-0.5 text-[12.5px] break-words text-muted">{c.detail}</p>
                          {c.fix && c.status !== "ok" && (
                            <p className="mt-1 rounded-md bg-surface-muted px-2.5 py-1.5 text-[12.5px] break-words">
                              {c.fix}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
