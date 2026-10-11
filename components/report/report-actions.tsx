"use client";

import {
  Check,
  ChevronDown,
  Copy,
  Download,
  FileDown,
  FileText,
  Loader2,
  Mail,
  Printer,
  Send,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

async function fetchExport(report: ReportRef, format: "html" | "pdf"): Promise<Blob> {
  const res = await fetch("/api/export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ format, report: refBody(report) }),
  });
  if (!res.ok) throw new Error(await errorFrom(res));
  return res.blob();
}

/**
 * Prints the designed report (not the app around it): loads the HTML export
 * into a hidden iframe and prints that frame. Falls back to printing the page.
 */
async function printReport(report: ReportRef): Promise<void> {
  const html = (await (await fetchExport(report, "html")).text())
    .replace('class="nojs"', 'class="nojs" data-print="1"')
    .replace(/ loading="lazy"/g, "");
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);
  await new Promise<void>((resolve) => {
    frame.onload = () => resolve();
    frame.srcdoc = html;
  });
  const win = frame.contentWindow;
  if (!win) {
    frame.remove();
    window.print();
    return;
  }
  // Give images a moment to arrive before the print snapshot.
  await new Promise((r) => setTimeout(r, 400));
  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup);
  setTimeout(() => frame.isConnected && frame.remove(), 120_000);
  win.focus();
  win.print();
}

export function ReportActions({ report }: { report: ReportRef }) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState<"html" | "pdf" | "print" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = slugify(report.query) || "lumen-report";

  const run = async (kind: "html" | "pdf" | "print") => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "print") await printReport(report);
      else saveBlob(await fetchExport(report, kind), `${name}.${kind}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : kind === "print" ? "Could not print" : "Export failed");
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
    <div className="flex flex-col items-end gap-1.5 print:hidden">
      <div className="flex items-center justify-end gap-2">
        <EmailButton report={report} />
        <Button size="sm" onClick={() => run("print")} disabled={busy !== null} aria-label="Print report">
          {busy === "print" ? <Loader2 className="animate-spin" /> : <Printer />}
          <span className="hidden sm:inline">Print</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="primary" disabled={busy === "html" || busy === "pdf"}>
              {busy === "html" || busy === "pdf" ? <Loader2 className="animate-spin" /> : <Download />}
              Download
              <ChevronDown className="-mr-0.5 opacity-80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => void run("pdf")}>
              <FileDown />
              <MenuLabel title="PDF" hint="Best for sharing and printing" />
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void run("html")}>
              <Sparkles />
              <MenuLabel title="Interactive HTML" hint="Filter claims, preview sources, dark mode" />
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                saveBlob(
                  new Blob([exportMarkdown(report.markdown)], { type: "text/markdown;charset=utf-8" }),
                  `${name}.md`,
                )
              }
            >
              <FileText />
              <MenuLabel title="Markdown" hint="Plain text for docs and notes" />
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                void copy();
              }}
            >
              {copied ? <Check className="!text-success" /> : <Copy />}
              <MenuLabel title={copied ? "Copied" : "Copy as Markdown"} />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

function MenuLabel({ title, hint }: { title: string; hint?: string }) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="font-medium">{title}</span>
      {hint && <span className="mt-0.5 text-[11.5px] text-subtle">{hint}</span>}
    </span>
  );
}

/** Toolbar button that asks for an email address and sends the report there. */
function EmailButton({ report }: { report: ReportRef }) {
  const me = useMe();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" aria-label="Email report">
          <Mail />
          <span className="hidden sm:inline">Email</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <div className="mb-1 font-medium">Email this report</div>
        {me && !me.features.email ? (
          <p className="text-[12.5px] text-muted">
            Email delivery isn&apos;t switched on for this site yet. Please download the report instead.
            {me.isAdmin && (
              <span className="mt-2 block text-subtle">
                Admin: add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM in Vercel, then redeploy.
              </span>
            )}
          </p>
        ) : (
          <>
            <p className="text-[12.5px] text-muted">
              We&apos;ll send it with a PDF and an interactive HTML version attached.
            </p>
            <EmailForm report={report} className="mt-3" autoFocus />
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Email address field + send button, shared by the toolbar popover and the inline card. */
function EmailForm({ report, className, autoFocus }: { report: ReportRef; className?: string; autoFocus?: boolean }) {
  const me = useMe();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const value = email || me?.email || "";

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
    <form onSubmit={send} className={className} aria-label="Email this report">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          required
          autoFocus={autoFocus}
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
          {state === "sent" ? "Sent" : "Send"}
        </Button>
      </div>
      {message && (
        <p className={cn("mt-2 text-[12px]", state === "error" ? "text-danger" : "text-success")}>{message}</p>
      )}
    </form>
  );
}

/** Invites the reader to get the report by email; pre-fills the signed-in address. */
export function EmailReport({ report, className }: { report: ReportRef; className?: string }) {
  const me = useMe();
  if (me && !me.features.email) return null;
  return (
    <div className={cn("rounded-lg border border-accent/25 bg-accent-soft/60 p-4 print:hidden", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-surface text-accent shadow-card">
          <Mail className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13.5px] font-medium">Want this report in your inbox?</div>
          <p className="text-[12.5px] text-muted">
            Share your email and we&apos;ll send the full report with a PDF and an interactive HTML version attached.
          </p>
          <EmailForm report={report} className="mt-3" />
        </div>
      </div>
    </div>
  );
}
