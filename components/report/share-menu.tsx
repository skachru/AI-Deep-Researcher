"use client";

import { Check, Download, FileText, Globe, Loader2, Mail, MessageCircle, Send, Share2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchExport, type ReportRef, saveBlob } from "@/components/report/report-actions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  type Attachment,
  buildEmlDraft,
  shareDescription,
  shareHref,
  shareSubject,
  type ShareTarget,
} from "@/lib/client/share";
import { useMe } from "@/lib/client/useMe";
import { slugify } from "@/lib/demo/examples";
import { cn } from "@/lib/utils";

const APPS: { id: ShareTarget; label: string; className: string; icon: React.ReactNode }[] = [
  { id: "whatsapp", label: "WhatsApp", className: "bg-[#25d366] text-white", icon: <MessageCircle /> },
  { id: "telegram", label: "Telegram", className: "bg-[#229ed9] text-white", icon: <Send /> },
  { id: "gmail", label: "Gmail", className: "bg-[#ea4335] text-white", icon: <Mail /> },
  { id: "outlook", label: "Outlook", className: "bg-[#0078d4] text-white", icon: <Mail /> },
];

/** Prepared attachments, tagged with the report they were made for. */
type Files =
  | { status: "idle" }
  | { status: "loading"; key: string }
  | { status: "ready"; key: string; files: File[] }
  | { status: "error"; key: string; error: string };

async function toAttachment(file: File): Promise<Attachment> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { name: file.name, type: file.type, base64: btoa(binary) };
}

async function errorFrom(res: Response): Promise<string> {
  const body: unknown = await res.json().catch(() => null);
  const msg = (body as { error?: unknown } | null)?.error;
  return typeof msg === "string" ? msg : `Request failed (${res.status})`;
}

/**
 * Share a report with a personal message and the PDF + interactive HTML.
 * Files are truly attached by: Lumen sending the email (signed-in users),
 * the system share sheet (phones and most desktops), or an email draft file
 * for desktop mail apps. Web compose links (WhatsApp, Gmail…) can only carry
 * text, so for those the files are downloaded to attach by hand.
 */
export function ShareMenu({ report }: { report: ReportRef }) {
  const me = useMe();
  const [files, setFiles] = useState<Files>({ status: "idle" });
  const [text, setText] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const [native, setNative] = useState<{ state: "idle" | "sharing" | "shared" | "error"; note?: string }>({
    state: "idle",
  });
  const [to, setTo] = useState("");
  const [send, setSend] = useState<{ state: "idle" | "sending" | "sent" | "error"; note?: string }>({ state: "idle" });
  const name = slugify(report.query) || "lumen-report";
  const appUrl = typeof location === "undefined" ? "" : location.origin;
  const message = text ?? shareDescription(report.query, report.markdown, appUrl, me?.name);
  const subject = shareSubject(report.query);
  const emailOn = Boolean(me?.features.email);

  // Attachments belong to one exact report (question, text and sources). A newer report or a
  // reopened menu starts a new preparation; responses from an older one are ignored.
  const reportKey = useMemo(
    () =>
      JSON.stringify([
        report.searchId,
        report.query,
        report.markdown,
        report.sources.map((s) => [s.id, s.url, s.title, s.credibility, s.image ?? null]),
      ]),
    [report],
  );
  const generation = useRef(0);
  const inflight = useRef<AbortController | null>(null);
  const isOpen = useRef(false);

  const prepare = useCallback(async () => {
    if ((files.status === "loading" || files.status === "ready") && files.key === reportKey) return;
    inflight.current?.abort();
    const controller = new AbortController();
    inflight.current = controller;
    const gen = ++generation.current;
    const key = reportKey;
    const current = () => gen === generation.current && !controller.signal.aborted;
    setFiles({ status: "loading", key });
    try {
      const [pdf, html] = await Promise.all([
        fetchExport(report, "pdf", controller.signal),
        fetchExport(report, "html", controller.signal),
      ]);
      if (!current()) return;
      setFiles({
        status: "ready",
        key,
        files: [
          new File([pdf], `${name}.pdf`, { type: "application/pdf" }),
          new File([html], `${name}.html`, { type: "text/html" }),
        ],
      });
    } catch (err) {
      if (!current()) return;
      setFiles({ status: "error", key, error: err instanceof Error ? err.message : "Could not prepare the files" });
    }
  }, [files, reportKey, report, name]);

  // The report changed: drop old attachments (and any in-flight preparation) and, if the menu
  // is open, prepare the new ones.
  const lastKey = useRef(reportKey);
  useEffect(() => {
    if (lastKey.current === reportKey) return;
    lastKey.current = reportKey;
    inflight.current?.abort();
    generation.current += 1;
    setFiles({ status: "idle" });
    setDownloaded(false);
  }, [reportKey]);
  useEffect(() => {
    if (isOpen.current && files.status === "idle") void prepare();
  }, [files.status, prepare]);
  useEffect(() => () => inflight.current?.abort(), []);

  // Each time the menu opens, every option is available again.
  const onOpenChange = (open: boolean) => {
    isOpen.current = open;
    if (!open) return;
    setDownloaded(false);
    setPendingDownload(false);
    setNative({ state: "idle" });
    setSend((s) => (s.state === "sending" ? s : { state: "idle" }));
    void prepare();
  };

  const ready = files.status === "ready" && files.key === reportKey ? files.files : null;
  // Share the files the platform accepts (some don't take HTML); null when file sharing isn't supported.
  const shareable = (() => {
    if (!ready || typeof navigator === "undefined" || typeof navigator.canShare !== "function") return null;
    if (navigator.canShare({ files: ready })) return ready;
    return navigator.canShare({ files: [ready[0]] }) ? [ready[0]] : null;
  })();

  const shareNative = async () => {
    if (!shareable || native.state === "sharing") return;
    setNative({ state: "sharing" });
    // Some platforms never settle the promise if the share sheet is dismissed oddly: don't stay stuck.
    const unstick = setTimeout(() => setNative((n) => (n.state === "sharing" ? { state: "idle" } : n)), 15_000);
    try {
      await navigator.share({ title: subject, text: message, files: shareable });
      clearTimeout(unstick);
      setNative({ state: "shared" });
      setTimeout(() => setNative((n) => (n.state === "shared" ? { state: "idle" } : n)), 2500);
    } catch (err) {
      clearTimeout(unstick);
      const name = err instanceof DOMException ? err.name : "";
      // AbortError = the user closed the share sheet: ready to share again.
      setNative(
        name === "AbortError" || name === ""
          ? { state: "idle" }
          : { state: "error", note: "Sharing didn't go through. Please try again, or use one of the options below." },
      );
    }
  };

  // An app opened before the files were ready gets them as soon as they are.
  const [pendingDownload, setPendingDownload] = useState(false);
  const downloadFiles = useCallback(() => {
    if (!ready || downloaded) return; // once per opening of the menu
    ready.forEach((f, i) => setTimeout(() => saveBlob(f, f.name), i * 400));
    setDownloaded(true);
  }, [ready, downloaded]);
  useEffect(() => {
    if (pendingDownload && ready) {
      setPendingDownload(false);
      downloadFiles();
    }
  }, [pendingDownload, ready, downloadFiles]);

  const emailDraft = async () => {
    if (!ready) return;
    const eml = buildEmlDraft(subject, message, await Promise.all(ready.map(toAttachment)));
    saveBlob(new Blob([eml], { type: "message/rfc822" }), `${name}.eml`);
  };

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const recipients = to
      .split(/[\s,;]+/)
      .map((r) => r.trim())
      .filter(Boolean);
    setSend({ state: "sending" });
    try {
      const res = await fetch("/api/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipients,
          message,
          report: {
            searchId: report.searchId,
            query: report.query,
            markdown: report.markdown,
            sources: report.sources.map(({ id, title, url, type, credibility, publishedDate, image }) => ({
              id,
              title,
              url,
              type,
              credibility,
              publishedDate,
              image,
            })),
          },
        }),
      });
      if (!res.ok) throw new Error(await errorFrom(res));
      setSend({ state: "sent", note: `Sent to ${recipients.join(", ")} with the PDF and HTML attached.` });
      setTo("");
    } catch (err) {
      setSend({ state: "error", note: err instanceof Error ? err.message : "Could not send" });
    }
  };

  const signInHref = `/login?next=${encodeURIComponent(report.searchId ? `/history/${report.searchId}` : "/history")}`;

  return (
    <Popover onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button size="sm" aria-label="Share report">
          <Share2 />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="max-h-[min(640px,calc(100vh-80px))] w-[380px] overflow-y-auto">
        <div className="font-medium">Share this report</div>
        <label className="mt-3 block text-[11.5px] font-medium text-subtle" htmlFor="share-message">
          Message
        </label>
        <textarea
          id="share-message"
          value={message}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          className="mt-1 block w-full resize-y rounded-md border border-border bg-surface px-2.5 py-2 text-[12.5px] leading-relaxed outline-none focus:border-accent/60"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-medium text-subtle">Attachments</span>
          {[
            { icon: <FileText />, label: "PDF report" },
            { icon: <Globe />, label: "Interactive HTML" },
          ].map((a) => (
            <span
              key={a.label}
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2 py-0.5 text-[11.5px] text-muted [&_svg]:size-3.5"
            >
              {files.status === "loading" ? <Loader2 className="animate-spin" /> : a.icon}
              {a.label}
            </span>
          ))}
        </div>
        {files.status === "error" && (
          <p className="mt-2 text-[12px] text-danger">
            {files.error}{" "}
            <button type="button" className="font-medium underline" onClick={() => void prepare()}>
              Try again
            </button>
          </p>
        )}

        {emailOn && (
          <div className="mt-4 rounded-lg border border-border bg-surface-muted/60 p-3">
            <div className="flex items-center gap-1.5 text-[12.5px] font-medium">
              <Mail className="size-3.5 text-accent" /> Send by email, files attached
            </div>
            {me?.email ? (
              <form onSubmit={sendEmail} className="mt-2 flex gap-2">
                <input
                  type="text"
                  inputMode="email"
                  value={to}
                  onChange={(e) => {
                    setTo(e.target.value);
                    if (send.state !== "sending") setSend({ state: "idle" });
                  }}
                  placeholder="name@example.com, …"
                  aria-label="Recipient email addresses"
                  className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2.5 text-[12.5px] outline-none focus:border-accent/60"
                />
                <Button type="submit" variant="primary" disabled={!to.trim() || send.state === "sending"}>
                  {send.state === "sending" ? <Loader2 className="animate-spin" /> : <Send />}
                  Send
                </Button>
              </form>
            ) : (
              <p className="mt-1 text-[12px] text-muted">
                <Link href={signInHref} className="font-medium text-accent hover:underline">
                  Sign in
                </Link>{" "}
                to email this report with the PDF and HTML attached. Replies come straight to you.
              </p>
            )}
            {send.note && (
              <p className={cn("mt-2 text-[12px]", send.state === "error" ? "text-danger" : "text-success")}>
                {send.note}
              </p>
            )}
          </div>
        )}

        {shareable && (
          <>
            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={() => void shareNative()}
              disabled={native.state === "sharing"}
            >
              {native.state === "sharing" ? (
                <Loader2 className="animate-spin" />
              ) : native.state === "shared" ? (
                <Check />
              ) : (
                <Share2 />
              )}
              {native.state === "shared"
                ? "Shared. Share again?"
                : `Share via apps with ${shareable.length === 2 ? "PDF + HTML" : "PDF"} attached`}
            </Button>
            {native.state === "error" && <p className="mt-2 text-[12px] text-danger">{native.note}</p>}
          </>
        )}

        <div className="mt-4 text-[11.5px] font-medium text-subtle">Open in</div>
        <div className="mt-2 grid grid-cols-5 gap-2">
          {APPS.map((t) => (
            <a
              key={t.id}
              href={shareHref(t.id, subject, message, appUrl)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => (ready ? downloadFiles() : setPendingDownload(true))}
              className="group flex flex-col items-center gap-1.5 text-center text-[11px] leading-tight text-muted hover:text-foreground"
            >
              <span
                className={cn(
                  "grid size-10 place-items-center rounded-full shadow-card transition-transform duration-150 group-hover:-translate-y-0.5 [&_svg]:size-[18px]",
                  t.className,
                )}
              >
                {t.icon}
              </span>
              {t.label}
            </a>
          ))}
          <button
            type="button"
            disabled={!ready}
            onClick={() => void emailDraft()}
            className="group flex flex-col items-center gap-1.5 text-center text-[11px] leading-tight text-muted hover:text-foreground disabled:opacity-50"
          >
            <span className="grid size-10 place-items-center rounded-full bg-surface-muted text-foreground shadow-card transition-transform duration-150 group-hover:-translate-y-0.5 [&_svg]:size-[18px]">
              <Mail />
            </span>
            Email app
          </button>
        </div>
        <p
          className={cn(
            "mt-3 flex items-start gap-1.5 text-[11.5px] leading-snug",
            downloaded ? "text-success" : "text-subtle",
          )}
        >
          <Download className="mt-px size-3.5 shrink-0" />
          {pendingDownload
            ? "Preparing the PDF and HTML. They'll download in a moment for you to attach."
            : downloaded
              ? "PDF and HTML downloaded. Attach them to your message in the app that just opened."
              : "WhatsApp, Telegram, Gmail and Outlook web only accept text from a website, so we download the files for you to attach. Email app saves a draft with the files already attached (Outlook, Apple Mail, Thunderbird)."}
        </p>
        {!emailOn && me?.isAdmin && (
          <p className="mt-2 text-[11.5px] text-subtle">
            Admin: add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and EMAIL_FROM in Vercel to let signed-in users send
            the report by email with files attached.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
