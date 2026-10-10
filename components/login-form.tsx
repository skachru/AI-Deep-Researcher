"use client";

import { Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, next }),
    }).catch(() => null);
    if (res?.ok) return setState("sent");
    const body: unknown = await res?.json().catch(() => null);
    const msg = (body as { error?: unknown } | null)?.error;
    setError(typeof msg === "string" ? msg : "Something went wrong. Please try again.");
    setState("error");
  };

  if (state === "sent") {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-lg border border-success/30 bg-success-soft p-4">
        <MailCheck className="mt-0.5 size-4 shrink-0 text-success" />
        <p className="text-[13px]">
          Check <b>{email}</b> for your sign-in link. It expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <input
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        className="h-9 w-full rounded-md border border-border bg-surface px-3 text-[14px] outline-none focus:border-accent/60"
      />
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={state === "sending"}>
        {state === "sending" && <Loader2 className="animate-spin" />} Email me a sign-in link
      </Button>
      {error && <p className="text-[12.5px] text-danger">{error}</p>}
    </form>
  );
}
