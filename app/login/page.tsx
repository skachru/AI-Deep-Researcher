import { GoogleButton } from "@/components/google-button";
import { LoginForm } from "@/components/login-form";
import { SiteHeader } from "@/components/site-header";
import { isGoogleConfigured } from "@/lib/auth/google";
import { isAuthConfigured } from "@/lib/auth/session";
import { isDbConfigured } from "@/lib/db";
import { isEmailConfigured } from "@/lib/email";

export const metadata = { title: "Sign in — Lumen" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  expired: "That link has expired or was already used. Please try again.",
  cancelled: "Sign-in was cancelled.",
  google: "Google sign-in didn't complete. Please try again.",
  unavailable: "Google sign-in isn't set up on this server yet.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/history";
  const google = isAuthConfigured() && isGoogleConfigured();
  const emailLink = isAuthConfigured() && isDbConfigured() && isEmailConfigured();

  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-sm px-4 pt-20">
        <div className="rounded-xl border border-border bg-surface p-7 shadow-pop">
          <h1 className="text-[22px] font-semibold tracking-tight">Sign in to Lumen</h1>
          <p className="mt-1 text-[13px] text-muted">Keep your research history across devices.</p>
          {error && ERRORS[error] && (
            <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
              {ERRORS[error]}
            </p>
          )}
          <div className="mt-6 space-y-4">
            {google && <GoogleButton next={safeNext} />}
            {google && emailLink && (
              <div className="flex items-center gap-3 text-[11.5px] text-subtle">
                <span className="h-px flex-1 bg-border" /> or use an email link{" "}
                <span className="h-px flex-1 bg-border" />
              </div>
            )}
            {emailLink && <LoginForm next={safeNext} />}
            {!google && !emailLink && (
              <p className="text-[13px] text-muted">Sign-in isn&apos;t set up on this deployment yet.</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
