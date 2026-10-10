"use client";

import { Check, Copy, FileCode2, FileDown, FileText, Loader2, Mail, Send } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { exportMarkdown } from "@/lib/client/report";
import type { SourceSummary } from "@/lib/schemas/domain";
import { useMe } from "@/lib/client/useMe";
import { slugify } from "@/lib/demo/examples";
import { cn } from "@/lib/utils";

export interface ReportRef {
  searchId: string | null;
  query: string;
  markdown: string;
  sources: SourceSummary[];
}

/** Body sent to /api/export and /api/email: the saved id when we have one, else the content. */
function refBody(ref: ReportRef) {
  // Send the saved id (preferred) and the content as a fallback for replays or unsaved runs.
  const sources = ref.sources.map(({ id, title, url, type, credibility, publishedDate, image }) => ({
    id,
    title,
    url,
    type,
    credibility,
    publishedDate,
    image,
  }));
  return { searchId: ref.searchId, query: ref.query, markdown: ref.markdown, sources };
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function errorFrom(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const msg = (body as { error?: unknown } | null)?.error;
  return typeof msg === "string" ? msg : `Request failed (${res.status})`;
}

export function ReportActions({ report }: { report: ReportRef }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"html" | "pdf" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = slugify(report.query) || "lumen-report";

  const exportAs = async (format: "html" | "pdf") => {
    setBusy(format);
    setError(null);
    try {
      const res = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, report: refBody(report) }),
      });
      if (!res.ok) throw new Error(await errorFrom(res));
      saveBlob(await res.blob(), `${name}.${format}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setBusy(null);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(exportMarkdown(report.markdown));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" onClick={() => exportAs("pdf")} disabled={busy !== null}>
          {busy === "pdf" ? <Loader2 className="animate-spin" /> : <FileDown />} PDF
        </Button>
        <Button size="sm" onClick={() => exportAs("html")} disabled={busy !== null}>
          {busy === "html" ? <Loader2 className="animate-spin" /> : <FileCode2 />} HTML
        </Button>
        <Button
          size="sm"
          onClick={() =>
            saveBlob(new Blob([exportMarkdown(report.markdown)], { type: "text/markdown;charset=utf-8" }), `${name}.md`)
          }
        >
          <FileText /> Markdown
        </Button>
        <Button size="sm" variant="ghost" onClick={copy} aria-label="Copy Markdown">
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

/** Invites the reader to get the report by email; pre-fills the signed-in address. */
export function EmailReport({ report, className }: { report: ReportRef; className?: string }) {
  const me = useMe();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const value = email || me?.email || "";

  if (me && !me.features.email) return null;

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setState("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, report: refBody(report) }),
      });
      if (!res.ok) throw new Error(await errorFrom(res));
      setState("sent");
      setMessage(`Sent to ${value}. Check your inbox (and spam folder) in a minute.`);
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Could not send");
    }
  };

  return (
    <form
      onSubmit={send}
      className={cn("rounded-lg border border-accent/25 bg-accent-soft/60 p-4", className)}
      aria-label="Email this report"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface text-accent shadow-card">
          <Mail className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">Want this report in your inbox?</div>
          <p className="text-[12.5px] text-muted">
            Share your email and we&apos;ll send the full report with a PDF attached.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              required
              value={value}
              onChange={(e) => {
                setEmail(e.target.value);
                if (state !== "sending") setState("idle");
              }}
              placeholder="you@example.com"
              aria-label="Email address"
              className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 text-[13px] outline-none focus:border-accent/60"
            />
            <Button type="submit" variant="primary" disabled={state === "sending" || state === "sent" || !value}>
              {state === "sending" ? <Loader2 className="animate-spin" /> : state === "sent" ? <Check /> : <Send />}
              {state === "sent" ? "Sent" : "Email report"}
            </Button>
          </div>
          {message && (
            <p className={cn("mt-2 text-[12px]", state === "error" ? "text-danger" : "text-success")}>{message}</p>
          )}
        </div>
      </div>
    </form>
  );
}
