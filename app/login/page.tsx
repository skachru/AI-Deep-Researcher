import { SiteHeader } from "@/components/site-header";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in — Lumen" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : "/history";
  return (
    <div className="min-h-dvh">
      <SiteHeader />
      <main className="mx-auto max-w-sm px-4 pt-24">
        <h1 className="text-[22px] font-semibold tracking-tight">Sign in</h1>
        <p className="mt-1 text-[13px] text-muted">
          We&apos;ll email you a one-time link. No password needed. Signing in keeps your history across devices.
        </p>
        {error === "expired" && (
          <p role="alert" className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-[12.5px] text-danger">
            That link has expired or was already used. Request a new one.
          </p>
        )}
        <LoginForm next={safeNext} />
      </main>
    </div>
  );
}
